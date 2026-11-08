import { ErroApi, ErroRede, erroDeResposta } from './api.js';

const RECUO_S = [3, 6, 12, 30];
const SONDAGEM_MS = 45_000;

/**
 * Analisador de Server-Sent Events: aceita fragmentos em qualquer ponto, ignora comentários e entrega `retry:`.
 * @param {{ aoEvento: (evento: { tipo: string, dados: string }) => void, aoRetry?: (ms: number) => void }} opcoes
 */
export function criarAnalisadorSse({ aoEvento, aoRetry }) {
  let resto = '';
  let tipo = '';
  /** @type {string[]} */
  let dados = [];

  /** @param {string} linha */
  const processar = (linha) => {
    if (linha === '') {
      if (dados.length) aoEvento({ tipo: tipo || 'message', dados: dados.join('\n') });
      tipo = '';
      dados = [];
      return;
    }
    if (linha.startsWith(':')) return;
    const separador = linha.indexOf(':');
    const campo = separador === -1 ? linha : linha.slice(0, separador);
    let valor = separador === -1 ? '' : linha.slice(separador + 1);
    if (valor.startsWith(' ')) valor = valor.slice(1);
    if (campo === 'event') tipo = valor;
    else if (campo === 'data') dados.push(valor);
    else if (campo === 'retry' && /^\d+$/.test(valor)) aoRetry?.(Number(valor));
  };

  return {
    /** @param {string} texto */
    alimentar(texto) {
      let buffer = resto + texto;
      // Um CR no fim pode ser a primeira metade de CRLF: espera o próximo fragmento.
      const crPendente = buffer.endsWith('\r');
      if (crPendente) buffer = buffer.slice(0, -1);
      const linhas = buffer.split(/\r\n|\n|\r/);
      resto = (linhas.pop() ?? '') + (crPendente ? '\r' : '');
      for (const linha of linhas) processar(linha);
    },
  };
}

/**
 * Lê o fluxo de eventos até o fim. Devolve `'sem-stream'` quando o navegador não expõe o corpo como fluxo.
 * @param {{ fetchImpl: (entrada: string, init?: any) => Promise<Response>, caminho: string, token: string, sinal: AbortSignal,
 *   aoAbrir: () => void, aoEvento: (evento: { tipo: string, dados: string }) => void, aoRetry: (ms: number) => void }} opcoes
 * @returns {Promise<'encerrado' | 'sem-stream'>}
 */
export async function lerFluxo({ fetchImpl, caminho, token, sinal, aoAbrir, aoEvento, aoRetry }) {
  /** @type {Response} */
  let resposta;
  try {
    resposta = await fetchImpl(caminho, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      signal: sinal,
      cache: 'no-store',
    });
  } catch {
    throw new ErroRede('Sem conexão com o servidor.');
  }
  if (!resposta.ok) throw await erroDeResposta(resposta);
  const leitor = resposta.body?.getReader?.();
  if (!leitor) return 'sem-stream';
  aoAbrir();
  const decodificador = new TextDecoder();
  const analisador = criarAnalisadorSse({ aoEvento, aoRetry });
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      analisador.alimentar(decodificador.decode(value, { stream: true }));
    }
  } catch {
    if (!sinal.aborted) throw new ErroRede('Fluxo de eventos interrompido.');
  }
  return 'encerrado';
}

/**
 * Mantém o fluxo aberto com reconexão por recuo; sem fluxo disponível, cai para sondagem periódica.
 * @param {{ fetchImpl: (entrada: string, init?: any) => Promise<Response>, caminho: string, obterToken: () => string,
 *   agendar: (fn: () => void, ms: number) => (() => void), visivel: () => boolean,
 *   aoSeq: (seq: number) => void, aoRevogado: () => void, aoSemAcesso: () => void, aoReconectar: () => void, aoSondar: () => void }} opcoes
 */
export function criarFluxo(opcoes) {
  const { fetchImpl, caminho, obterToken, agendar, visivel, aoSeq, aoRevogado, aoSemAcesso, aoReconectar, aoSondar } =
    opcoes;
  let ativo = false;
  let geracao = 0;
  /** @type {AbortController | null} */
  let controle = null;
  /** @type {(() => void) | null} */
  let cancelarEspera = null;
  let retryServidor = 0;

  /** @param {number} ms */
  const esperar = (ms) =>
    new Promise((resolve) => {
      const cancelar = agendar(() => resolve(undefined), ms);
      cancelarEspera = () => {
        cancelar();
        resolve(undefined);
      };
    });

  /** @param {number} minha */
  async function sondar(minha) {
    while (ativo && geracao === minha) {
      await esperar(SONDAGEM_MS);
      if (ativo && geracao === minha && visivel()) aoSondar();
    }
  }

  /** @param {number} minha */
  async function manter(minha) {
    let tentativa = 0;
    let reconexao = false;
    while (ativo && geracao === minha) {
      controle = new AbortController();
      try {
        const resultado = await lerFluxo({
          fetchImpl,
          caminho,
          token: obterToken(),
          sinal: controle.signal,
          aoAbrir: () => {
            if (reconexao) aoReconectar();
          },
          aoRetry: (ms) => {
            retryServidor = ms;
          },
          aoEvento: ({ tipo, dados }) => {
            if (geracao !== minha) return;
            tentativa = 0;
            if (tipo === 'seq' && Number.isFinite(Number(dados))) aoSeq(Number(dados));
            else if (tipo === 'revogado') {
              ativo = false;
              controle?.abort();
              aoRevogado();
            }
          },
        });
        if (resultado === 'sem-stream') return sondar(minha);
      } catch (erro) {
        if (erro instanceof ErroApi && (erro.status === 401 || erro.status === 404)) {
          ativo = false;
          aoSemAcesso();
          return;
        }
      }
      if (!ativo || geracao !== minha) return;
      reconexao = true;
      await esperar(Math.max(RECUO_S[Math.min(tentativa, RECUO_S.length - 1)] * 1000, retryServidor));
      tentativa += 1;
    }
  }

  return {
    abrir() {
      if (ativo) return;
      ativo = true;
      geracao += 1;
      void manter(geracao);
    },
    fechar() {
      ativo = false;
      geracao += 1;
      controle?.abort();
      cancelarEspera?.();
    },
  };
}
