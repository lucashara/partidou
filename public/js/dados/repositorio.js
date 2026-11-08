import {
  chaveRecuperacaoValida,
  codigoConviteValido,
  codigoTransferenciaValido,
  normalizarCodigo,
} from '../../../compartilhado/codigos.js';
import { LIMITES, validarNome } from '../../../compartilhado/nomes.js';
import { chamar, ErroLocal } from './api.js';
import { ErroArmazenamento } from './armazenamento.js';
import { abrirControlador } from './controlador.js';
import { criarMutexMemoria } from './sincronizacao.js';

/** @type {import('./tipos.js').Pagina} */
const PAGINA_VISIVEL = { visivel: () => true, assinar: () => () => {} };

/** @type {NonNullable<import('./tipos.js').Dependencias['agendar']>} */
const agendarPadrao = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** @param {string} texto @param {number} maximo @param {string} campo */
function nomeValido(texto, maximo, campo) {
  const r = validarNome(texto, maximo);
  if (!r.ok) throw new ErroLocal('NOME_INVALIDO', r.mensagem, campo);
  return r.valor;
}

/**
 * Fachada usada pelas telas: resenhas deste aparelho, entrada por convite, chave ou transferência, e abertura de controladores.
 * @param {import('./tipos.js').Dependencias} dependencias
 */
export function criarRepositorio(dependencias) {
  /** @type {import('./tipos.js').DependenciasCompletas} */
  const deps = {
    ...dependencias,
    travas: dependencias.travas ?? criarMutexMemoria(),
    canal: dependencias.canal ?? null,
    pagina: dependencias.pagina ?? PAGINA_VISIVEL,
    agendar: dependencias.agendar ?? agendarPadrao,
    aleatorio: dependencias.aleatorio ?? Math.random,
  };
  const { armazenamento, fetchImpl, agora } = deps;
  /** @type {Map<string, Promise<Awaited<ReturnType<typeof abrirControlador>> | null>>} */
  const abertos = new Map();

  /** @param {string} caminho @param {unknown} corpo */
  const publica = (caminho, corpo) => chamar('POST', caminho, { corpo, fetchImpl });

  /** O token só existe na resposta do servidor: sem onde guardá-lo, a chamada não pode nem começar. */
  async function exigirArmazenamento() {
    try {
      await armazenamento.listarResenhas();
    } catch (erro) {
      if (erro instanceof ErroArmazenamento)
        throw new ErroArmazenamento('Armazenamento local indisponível neste navegador.');
      throw erro;
    }
  }

  /**
   * Grava a sessão devolvida pelo servidor. Se a resenha já existe aqui, só o token e a identidade são trocados.
   * O token só existe nesta resposta, por isso a resenha é gravada antes de qualquer outra coisa.
   * @param {any} resposta
   * @returns {Promise<string>} id da resenha
   */
  async function guardarSessao(resposta) {
    const { resenha, membro, token } = resposta;
    const eu = { membroId: membro.id, papel: membro.papel, apelido: membro.apelido };
    const existente = await armazenamento.lerResenha(resenha.id);
    await armazenamento.gravarResenha({
      id: resenha.id,
      nome: resenha.nome,
      token,
      eu,
      entrouEm: existente?.entrouEm ?? agora(),
      abertaEm: agora(),
    });
    if (!(await armazenamento.lerEstado(resenha.id))) {
      await armazenamento.gravarEstado(resenha.id, {
        seq: 0,
        resenha,
        eu,
        membros: [membro],
        competidores: [],
        partidas: {},
      });
    }
    const aberto = await abertos.get(resenha.id);
    await aberto?.retomarAcesso();
    return resenha.id;
  }

  /** @param {string} id */
  async function esquecerResenha(id) {
    const aberto = await abertos.get(id);
    aberto?.fechar();
    abertos.delete(id);
    await armazenamento.removerResenha(id);
  }

  return {
    async listarResenhas() {
      const lista = await armazenamento.listarResenhas();
      return lista.map(({ token: _token, ...resto }) => resto).sort((a, b) => b.abertaEm - a.abertaEm);
    },

    /** @param {{ nome: string, apelido: string }} dados */
    async criarResenha({ nome, apelido }) {
      const dados = {
        nome: nomeValido(nome, LIMITES.nomeResenha, 'nome'),
        apelido: nomeValido(apelido, LIMITES.apelido, 'apelido'),
      };
      await exigirArmazenamento();
      const resposta = await publica('/api/resenhas', dados);
      const resenhaId = await guardarSessao(resposta);
      return { resenhaId, chaveRecuperacao: resposta.chaveRecuperacao, convite: resposta.convite };
    },

    /** @param {string} codigo */
    async consultarConvite(codigo) {
      if (!codigoConviteValido(codigo))
        throw new ErroLocal('CODIGO_INVALIDO', 'Convite inválido ou expirado.', 'codigo');
      const r = await publica('/api/convites/consultar', { codigo: normalizarCodigo(codigo) });
      return { resenhaNome: r.resenhaNome, expiraEm: r.expiraEm, membros: r.membros };
    },

    /** @param {string} codigo @param {string} apelido */
    async aceitarConvite(codigo, apelido) {
      if (!codigoConviteValido(codigo))
        throw new ErroLocal('CODIGO_INVALIDO', 'Convite inválido ou expirado.', 'codigo');
      const dados = { codigo: normalizarCodigo(codigo), apelido: nomeValido(apelido, LIMITES.apelido, 'apelido') };
      await exigirArmazenamento();
      const resposta = await publica('/api/convites/aceitar', dados);
      return { resenhaId: await guardarSessao(resposta) };
    },

    /** @param {string} chave */
    async recuperarAcesso(chave) {
      if (!chaveRecuperacaoValida(chave))
        throw new ErroLocal('CHAVE_INVALIDA', 'Chave de recuperação inválida.', 'chave');
      await exigirArmazenamento();
      const resposta = await publica('/api/acesso/recuperar', { chave: normalizarCodigo(chave) });
      return { resenhaId: await guardarSessao(resposta), chaveRecuperacao: resposta.chaveRecuperacao };
    },

    /** @param {string} codigo */
    async usarTransferencia(codigo) {
      if (!codigoTransferenciaValido(codigo))
        throw new ErroLocal('CODIGO_INVALIDO', 'Código de transferência inválido ou expirado.', 'codigo');
      await exigirArmazenamento();
      const resposta = await publica('/api/acesso/transferencia/usar', { codigo: normalizarCodigo(codigo) });
      return { resenhaId: await guardarSessao(resposta) };
    },

    esquecerResenha,

    /** @param {string} resenhaId */
    abrir(resenhaId) {
      const existente = abertos.get(resenhaId);
      if (existente) return existente;
      const promessa = (async () => {
        const resenha = await armazenamento.lerResenha(resenhaId);
        if (!resenha) return null;
        await armazenamento.gravarResenha({ ...resenha, abertaEm: agora() });
        return abrirControlador({
          resenha,
          deps,
          esquecerLocal: () => esquecerResenha(resenhaId),
          aoFechar: () => abertos.delete(resenhaId),
        });
      })();
      abertos.set(resenhaId, promessa);
      promessa.then(
        (c) => c ?? abertos.delete(resenhaId),
        () => abertos.delete(resenhaId),
      );
      return promessa;
    },
  };
}
