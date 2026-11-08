import { permissaoNegada } from '../erros.js';

/**
 * @param {{ papel: string }} auth
 * @param {import("../tipos.js").Autenticacao} auth
 */
export function exigirCriador(auth) {
  if (auth.papel !== 'criador') throw permissaoNegada('Ação restrita ao criador da resenha.');
}

/**
 * Criador administra tudo; participante só o que criou.
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {string} criadoPor
 */
export function exigirAutorOuCriador(auth, criadoPor) {
  if (auth.papel !== 'criador' && auth.membroId !== criadoPor) {
    throw permissaoNegada('Ação restrita ao autor ou ao criador da resenha.');
  }
}
