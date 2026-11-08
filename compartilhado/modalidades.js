export const MODALIDADES = [
  { id: 'fifa', nome: 'FIFA', penaltis: true },
  { id: 'futebol', nome: 'Futebol', penaltis: true },
  { id: 'volei-quadra', nome: 'Vôlei de quadra', penaltis: false },
  { id: 'volei-areia', nome: 'Vôlei de areia', penaltis: false },
  { id: 'outro', nome: 'Outro', penaltis: false },
];

/** @returns {{ id: string, nome: string, penaltis: boolean } | null} */
export function modalidadePorId(/** @type {unknown} */ id) {
  return MODALIDADES.find((m) => m.id === id) ?? null;
}

/** Sem modalidade informada, a disputa de pênaltis é aceita; id desconhecido não aceita. */
export function aceitaPenaltis(/** @type {unknown} */ modalidadeId) {
  if (modalidadeId === null || modalidadeId === undefined) return true;
  return modalidadePorId(modalidadeId)?.penaltis === true;
}
