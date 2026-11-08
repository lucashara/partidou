/** Erro esperado de negócio ou de protocolo: vira resposta JSON com status e código estáveis. */
export class ErroApp extends Error {
  /**
   * @param {number} status
   * @param {string} codigo
   * @param {string} mensagem
   * @param {{ campo?: string, atual?: unknown, retryAfter?: number, fecharConexao?: boolean }} [extras]
   */
  constructor(status, codigo, mensagem, extras = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.extras = extras;
  }
}

export const naoEncontrado = (mensagem = 'Recurso não encontrado.') => new ErroApp(404, 'NAO_ENCONTRADO', mensagem);
export const permissaoNegada = (mensagem = 'Permissão negada.') => new ErroApp(403, 'PERMISSAO_NEGADA', mensagem);
/**
 * @param {string} mensagem
 * @param {string} [campo]
 */
export const requisicaoInvalida = (mensagem, campo) => new ErroApp(400, 'REQUISICAO_INVALIDA', mensagem, { campo });
