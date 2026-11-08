const TEMPO_LIMITE_MS = 15_000;

/** Resposta de erro do servidor (4xx). */
export class ErroApi extends Error {
  /**
   * @param {number} status
   * @param {string} codigo
   * @param {string} mensagem
   * @param {{ campo?: string, atual?: any, retryAfter?: number }} [extras]
   */
  constructor(status, codigo, mensagem, extras = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.mensagem = mensagem;
    this.campo = extras.campo;
    this.atual = extras.atual;
    this.retryAfter = extras.retryAfter;
  }
}

/** Falha de rede, tempo esgotado ou resposta 5xx (`servidor: true`). */
export class ErroRede extends Error {
  /**
   * @param {string} mensagem
   * @param {{ servidor?: boolean }} [opcoes]
   */
  constructor(mensagem, { servidor = false } = {}) {
    super(mensagem);
    this.name = 'ErroRede';
    this.servidor = servidor;
  }
}

/** Validação feita no aparelho, antes de qualquer envio. */
export class ErroLocal extends Error {
  /**
   * @param {string} codigo
   * @param {string} mensagem
   * @param {string} [campo]
   */
  constructor(codigo, mensagem, campo) {
    super(mensagem);
    this.name = 'ErroLocal';
    this.codigo = codigo;
    this.mensagem = mensagem;
    this.campo = campo;
  }
}

/**
 * Traduz uma resposta não 2xx. 5xx vira ErroRede porque o servidor ou o proxy está indisponível.
 * @param {Response} resposta
 * @returns {Promise<ErroApi | ErroRede>}
 */
export async function erroDeResposta(resposta) {
  if (resposta.status >= 500) return new ErroRede('Servidor indisponível.', { servidor: true });
  /** @type {any} */
  let dados = null;
  try {
    dados = await resposta.json();
  } catch {
    dados = null;
  }
  const erro = dados?.erro ?? {};
  const bruto = Number(resposta.headers.get('Retry-After'));
  return new ErroApi(
    resposta.status,
    typeof erro.codigo === 'string' ? erro.codigo : 'ERRO_DESCONHECIDO',
    typeof erro.mensagem === 'string' ? erro.mensagem : 'Requisição recusada.',
    {
      campo: erro.campo,
      atual: erro.atual,
      retryAfter: Number.isFinite(bruto) && bruto >= 0 ? bruto : undefined,
    },
  );
}

/**
 * @param {string} metodo
 * @param {string} caminho
 * @param {{ corpo?: unknown, token?: string, sinal?: AbortSignal, fetchImpl?: (entrada: string, init?: any) => Promise<Response>, tempoLimiteMs?: number }} [opcoes]
 * @returns {Promise<any>} JSON da resposta, ou `null` em 204.
 */
export async function chamar(
  metodo,
  caminho,
  { corpo, token, sinal, fetchImpl, tempoLimiteMs = TEMPO_LIMITE_MS } = {},
) {
  const executar = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!executar) throw new ErroRede('Rede indisponível neste aparelho.');
  const controle = new AbortController();
  let expirou = false;
  const relogio = setTimeout(() => {
    expirou = true;
    controle.abort();
  }, tempoLimiteMs);
  const aoCancelar = () => controle.abort();
  if (sinal?.aborted) controle.abort();
  else sinal?.addEventListener('abort', aoCancelar, { once: true });

  /** @type {Record<string, string>} */
  const cabecalhos = { Accept: 'application/json' };
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  const falhaDeRede = () => new ErroRede(expirou ? 'Tempo de resposta esgotado.' : 'Sem conexão com o servidor.');

  try {
    /** @type {Response} */
    let resposta;
    try {
      resposta = await executar(caminho, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: controle.signal,
        cache: 'no-store',
      });
    } catch {
      throw falhaDeRede();
    }
    if (!resposta.ok) throw await erroDeResposta(resposta);
    if (resposta.status === 204) return null;
    try {
      const texto = await resposta.text();
      return texto ? JSON.parse(texto) : null;
    } catch (e) {
      if (e instanceof SyntaxError) throw new ErroRede('Resposta inesperada do servidor.', { servidor: true });
      throw falhaDeRede();
    }
  } finally {
    clearTimeout(relogio);
    sinal?.removeEventListener('abort', aoCancelar);
  }
}
