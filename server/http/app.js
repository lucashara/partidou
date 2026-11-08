// Ciclo da requisição: cabeçalhos, roteamento, autenticação, limites, corpo, tratador e log. Sem SQL aqui.
import { ErroApp } from '../erros.js';
import { autenticar } from '../nucleo/acesso.js';
import { cabecalhosBase } from './cabecalhos.js';
import { CLIENTE_DESCONECTOU, lerCorpoJson } from './corpo.js';
import { origemDe } from './origem.js';
import { enviarErro, enviarJson, enviarSemConteudo, erroInterno, muitasTentativas } from './respostas.js';
import { casar, RESPOSTA_DIRETA } from './rotas/definicao.js';
import { rotasMembros } from './rotas/membros.js';
import { rotasPartidas } from './rotas/partidas.js';
import { rotasPublicas } from './rotas/publicas.js';
import { rotasResenhas } from './rotas/resenhas.js';

/** @typedef {{ rota: string | null, ip: string | null }} DadosLog */

const CODIGOS_DE_FALHA = new Set(['CONVITE_INVALIDO', 'CODIGO_INVALIDO']);
const METODOS_COM_ESCRITA = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const STATUS_DE_SEGURANCA = new Set([401, 403, 429]);

/** @param {import('node:http').IncomingMessage} req */
function tokenDe(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
  return m ? m[1] : null;
}

/**
 * @param {import('../tipos.js').Contexto} ctx
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function criarApp(ctx) {
  const { banco, config, limitador, registro, estaticos } = ctx;
  const cabecalhos = cabecalhosBase(config);
  const rotas = [...rotasPublicas(), ...rotasResenhas(), ...rotasPartidas(), ...rotasMembros()];

  function exigirLiberado(/** @type {number} */ espera) {
    if (espera) throw muitasTentativas(espera);
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} pathname
   * @param {URLSearchParams} query
   * @param {DadosLog} registroDaRequisicao
   */
  async function atenderApi(req, res, pathname, query, registroDaRequisicao) {
    const metodo = req.method ?? 'GET';
    const encontrada = casar(rotas, metodo, pathname);
    registroDaRequisicao.rota = encontrada?.rota.caminho ?? '/api/(desconhecida)';
    if (!encontrada) throw new ErroApp(404, 'NAO_ENCONTRADO', 'Recurso não encontrado.');
    const { rota, params } = encontrada;
    const ip = origemDe(req, config, registro);
    registroDaRequisicao.ip = ip;

    /** @type {import('../nucleo/acesso.js').Autenticacao | null} */
    let auth = null;
    if (rota.autenticada) {
      const token = tokenDe(req);
      auth = token ? autenticar(banco, token, ctx.relogio()) : null;
      if (!auth) {
        exigirLiberado(limitador.semToken(ip));
        throw new ErroApp(401, 'NAO_AUTENTICADO', 'Sessão ausente, inválida ou expirada.');
      }
      // Resenha de outra sessão responde igual à inexistente, para não revelar que o identificador existe.
      if (params.id !== undefined && params.id !== auth.resenhaId) {
        throw new ErroApp(404, 'NAO_ENCONTRADO', 'Recurso não encontrado.');
      }
      exigirLiberado(limitador.sessao(auth.sessaoHash, METODOS_COM_ESCRITA.has(metodo)));
    } else {
      exigirLiberado(limitador.semToken(ip));
      if (rota.porCodigo) exigirLiberado(limitador.bloqueioDeCodigo(ip));
    }

    const corpo = METODOS_COM_ESCRITA.has(metodo) ? await lerCorpoJson(req) : {};
    let resultado;
    try {
      resultado = await rota.tratar({
        ctx,
        req,
        res,
        params,
        query,
        corpo,
        auth: /** @type {any} */ (auth),
        cabecalhos,
        ip,
      });
    } catch (e) {
      if (rota.porCodigo && e instanceof ErroApp && CODIGOS_DE_FALHA.has(e.codigo)) limitador.falhaDeCodigo(ip);
      throw e;
    }
    if (resultado === RESPOSTA_DIRETA) return;
    if (resultado.status === 204) enviarSemConteudo(res, 204, cabecalhos);
    else enviarJson(res, resultado.status, resultado.corpo, cabecalhos);
  }

  function atenderSaude(/** @type {import('node:http').ServerResponse} */ res) {
    try {
      banco.um('SELECT 1 AS ok');
      enviarJson(res, 200, { ok: true }, cabecalhos);
    } catch {
      enviarJson(res, 503, { ok: false }, cabecalhos);
    }
  }

  /**
   * @param {import('node:http').ServerResponse} res
   * @param {any} e
   * @param {DadosLog} registroDaRequisicao
   */
  function responderErro(res, e, registroDaRequisicao) {
    if (e instanceof ErroApp && e.codigo === CLIENTE_DESCONECTOU) {
      registro.info('cliente_desconectou', { rota: registroDaRequisicao.rota });
      res.statusCode = 499;
      res.destroy();
      return;
    }
    const erro = e instanceof ErroApp ? e : erroInterno();
    if (!(e instanceof ErroApp)) {
      registro.erro('erro_interno', {
        rota: registroDaRequisicao.rota,
        mensagem: String(e?.message ?? e),
        pilha: String(e?.stack ?? '')
          .split('\n')
          .slice(0, 6)
          .join(' | '),
      });
    }
    if (res.headersSent) res.destroy();
    else enviarErro(res, erro, cabecalhos);
  }

  return async function ouvinte(req, res) {
    const inicio = performance.now();
    /** @type {DadosLog} */
    const registroDaRequisicao = { rota: null, ip: null };
    res.on('close', () => {
      if (!registroDaRequisicao.rota) return;
      /** @type {Record<string, unknown>} */
      const dados = {
        metodo: req.method,
        rota: registroDaRequisicao.rota,
        status: res.statusCode,
        ms: Math.round(performance.now() - inicio),
      };
      if (STATUS_DE_SEGURANCA.has(res.statusCode)) dados.ip = registroDaRequisicao.ip ?? origemDe(req, config);
      registro.info('requisicao', dados);
    });

    try {
      const url = req.url ?? '/';
      const separador = url.indexOf('?');
      const pathname = separador === -1 ? url : url.slice(0, separador);
      const query = new URLSearchParams(separador === -1 ? '' : url.slice(separador + 1));

      if (pathname === '/saude' && req.method === 'GET') {
        atenderSaude(res);
      } else if (pathname === '/api' || pathname.startsWith('/api/')) {
        await atenderApi(req, res, pathname, query, registroDaRequisicao);
      } else if (!pathname.startsWith('/') || !estaticos.atender(req, res, pathname, cabecalhos)) {
        res.writeHead(404, { ...cabecalhos, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end('Não encontrado.');
      }
    } catch (e) {
      responderErro(res, e, registroDaRequisicao);
    }
  };
}
