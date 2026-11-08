import { ErroApp } from '../erros.js';

/**
 * Envia JSON. Em `/api/*` a resposta nunca é guardada em cache.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} corpo
 * @param {Record<string, string>} cabecalhos
 */
export function enviarJson(res, status, corpo, cabecalhos) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    ...cabecalhos,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(texto),
  });
  res.end(texto);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, string>} cabecalhos
 */
export function enviarSemConteudo(res, status, cabecalhos) {
  res.writeHead(status, { ...cabecalhos, 'Cache-Control': 'no-store' });
  res.end();
}

/**
 * Erro no formato { erro: { codigo, mensagem, campo?, atual? } }.
 * @param {import('node:http').ServerResponse} res
 * @param {ErroApp} erro
 * @param {Record<string, string>} cabecalhos
 */
export function enviarErro(res, erro, cabecalhos) {
  const { campo, atual, retryAfter, fecharConexao } = erro.extras;
  const extras = { ...cabecalhos };
  if (retryAfter !== undefined) extras['Retry-After'] = String(retryAfter);
  if (fecharConexao) extras.Connection = 'close';
  enviarJson(
    res,
    erro.status,
    { erro: { codigo: erro.codigo, mensagem: erro.message, ...(campo ? { campo } : {}), ...(atual ? { atual } : {}) } },
    extras,
  );
}

export const erroInterno = () => new ErroApp(500, 'ERRO_INTERNO', 'Erro interno.');
export const muitasTentativas = (/** @type {number} */ retryAfter) =>
  new ErroApp(429, 'MUITAS_TENTATIVAS', 'Muitas tentativas. Aguarde antes de tentar novamente.', { retryAfter });
