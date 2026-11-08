// Tradução de erros do motor de dados em mensagem de tela.
import { ErroApi, ErroRede } from './dados/api.js';

/** @param {unknown} erro @param {string} [padrao] */
export function mensagemDeErro(erro, padrao = 'Falha inesperada. Tentar novamente.') {
  if (erro instanceof ErroRede) return 'Sem conexão com o servidor. Verificar a internet e tentar novamente.';
  if (erro instanceof ErroApi) {
    if (erro.status === 429)
      return `Muitas tentativas. Aguardar ${erro.retryAfter ? `${erro.retryAfter} s` : 'alguns instantes'} para tentar de novo.`;
    return erro.mensagem || padrao;
  }
  const mensagem = /** @type {any} */ (erro)?.mensagem;
  return typeof mensagem === 'string' && mensagem ? mensagem : padrao;
}
