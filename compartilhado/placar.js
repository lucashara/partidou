import { aceitaPenaltis } from './modalidades.js';
import { LIMITES } from './nomes.js';

const inteiroValido = (/** @type {any} */ v) => Number.isInteger(v) && v >= 0 && v <= LIMITES.placarMaximo;
const semValor = (/** @type {unknown} */ v) => v === null || v === undefined;
/** @type {(campo: string, mensagem: string) => { ok: false, codigo: 'PLACAR_INVALIDO', campo: string, mensagem: string }} */
const invalido = (campo, mensagem) => ({ ok: false, codigo: 'PLACAR_INVALIDO', campo, mensagem });

/**
 * Valida placar e disputa de pênaltis. `penaltisA` e `penaltisB` ausentes ou nulos significam sem disputa.
 * @param {{ placarA?: unknown, placarB?: unknown, penaltisA?: unknown, penaltisB?: unknown, modalidade?: unknown }} partida
 * @returns {{ ok: true } | { ok: false, codigo: 'PLACAR_INVALIDO', campo: string, mensagem: string }}
 */
export function validarPlacar({ placarA, placarB, penaltisA, penaltisB, modalidade }) {
  if (!inteiroValido(placarA)) return invalido('placarA', `Placar deve ser um inteiro de 0 a ${LIMITES.placarMaximo}.`);
  if (!inteiroValido(placarB)) return invalido('placarB', `Placar deve ser um inteiro de 0 a ${LIMITES.placarMaximo}.`);
  if (semValor(penaltisA) && semValor(penaltisB)) return { ok: true };
  if (semValor(penaltisA) || semValor(penaltisB)) return invalido('penaltis', 'Pênaltis exigem os dois lados.');
  if (!inteiroValido(penaltisA) || !inteiroValido(penaltisB)) {
    return invalido('penaltis', `Pênaltis devem ser inteiros de 0 a ${LIMITES.placarMaximo}.`);
  }
  if (placarA !== placarB) return invalido('penaltis', 'Pênaltis só valem com empate no tempo normal.');
  if (penaltisA === penaltisB) return invalido('penaltis', 'A disputa de pênaltis precisa ter um vencedor.');
  if (!aceitaPenaltis(modalidade)) return invalido('penaltis', 'A modalidade não admite disputa de pênaltis.');
  return { ok: true };
}

/**
 * Resultado no tempo normal; os pênaltis não entram.
 * @param {{ placarA: number, placarB: number }} partida
 * @returns {'a' | 'b' | 'empate'}
 */
export function resultadoNormal(partida) {
  if (partida.placarA > partida.placarB) return 'a';
  if (partida.placarB > partida.placarA) return 'b';
  return 'empate';
}

/**
 * Vencedor final: o do tempo normal ou, no empate, o dos pênaltis. Empate sem pênaltis fica com `lado: null`.
 * @param {{ placarA: number, placarB: number, penaltisA?: number | null, penaltisB?: number | null }} partida
 * @returns {{ lado: 'a' | 'b' | null, porPenaltis: boolean }}
 */
export function vencedorFinal(partida) {
  const normal = resultadoNormal(partida);
  if (normal !== 'empate') return { lado: normal, porPenaltis: false };
  const { penaltisA, penaltisB } = partida;
  if (semValor(penaltisA) || semValor(penaltisB) || penaltisA === penaltisB) return { lado: null, porPenaltis: false };
  return { lado: penaltisA > penaltisB ? 'a' : 'b', porPenaltis: true };
}
