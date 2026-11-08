import { validarNome } from '../../compartilhado/nomes.js';
import { requisicaoInvalida } from '../erros.js';

/**
 * Valida um nome obrigatório e devolve o valor normalizado; falha com 400 e o campo.
 * @param {any} valor
 * @param {number} maximo
 * @param {string} campo
 */
export function nomeObrigatorio(valor, maximo, campo) {
  const r = validarNome(valor, maximo);
  if (!r.ok) throw requisicaoInvalida(r.mensagem, campo);
  return r.valor;
}
