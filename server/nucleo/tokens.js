// Toda aleatoriedade vem de node:crypto. Segredos só existem em claro na resposta que os cria; o banco guarda sha256.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ALFABETO_CROCKFORD, formatarCodigo, normalizarCodigo } from '../../compartilhado/codigos.js';

export const TAMANHOS = { convite: 12, transferencia: 8, chaveRecuperacao: 25 };

export const hashDe = (/** @type {string} */ texto) => createHash('sha256').update(texto).digest('hex');
export const gerarToken = () => randomBytes(32).toString('base64url');
export const gerarIdResenha = () => randomBytes(16).toString('base64url');
export const gerarIdMembro = () => randomBytes(9).toString('base64url');
export const gerarIdUuid = () => randomUUID();

/**
 * Sorteia `tamanho` símbolos do alfabeto; 256 é múltiplo de 32, então `& 31` não introduz viés.
 * @param {number} tamanho
 */
export function gerarCodigo(tamanho) {
  const bytes = randomBytes(tamanho);
  let codigo = '';
  for (const b of bytes) codigo += ALFABETO_CROCKFORD[b & 31];
  return codigo;
}

/** Hash da forma normalizada, a mesma usada na gravação e na consulta. */
export const hashDeCodigo = (/** @type {unknown} */ texto) => hashDe(normalizarCodigo(texto));

/**
 * Gera um segredo e devolve a forma exibida e o hash a guardar.
 * @param {number} tamanho
 * @param {number} grupo
 */
export function novoSegredo(tamanho, grupo) {
  const codigo = gerarCodigo(tamanho);
  return { codigo, exibido: formatarCodigo(codigo, grupo), hash: hashDe(codigo) };
}
