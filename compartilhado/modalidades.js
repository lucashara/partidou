export const MODALIDADES = [
  { id: 'futebol', nome: 'Futebol', penaltis: true },
  { id: 'volei-quadra', nome: 'Vôlei de quadra', penaltis: false },
  { id: 'volei-areia', nome: 'Vôlei de areia', penaltis: false },
  { id: 'outro', nome: 'Outro', penaltis: false },
];

// Identificadores retirados da lista. Fila offline e cache de versões anteriores ainda podem trazê-los.
const SUBSTITUIDAS = { fifa: 'futebol' };

/** @returns {unknown} o identificador vigente; valor desconhecido segue como veio. */
export function normalizarModalidade(/** @type {unknown} */ id) {
  return typeof id === 'string' && Object.hasOwn(SUBSTITUIDAS, id)
    ? SUBSTITUIDAS[/** @type {keyof typeof SUBSTITUIDAS} */ (id)]
    : id;
}

/** @returns {{ id: string, nome: string, penaltis: boolean } | null} */
export function modalidadePorId(/** @type {unknown} */ id) {
  const vigente = normalizarModalidade(id);
  return MODALIDADES.find((m) => m.id === vigente) ?? null;
}

/** Sem modalidade informada, a disputa de pênaltis é aceita; id desconhecido não aceita. */
export function aceitaPenaltis(/** @type {unknown} */ modalidadeId) {
  if (modalidadeId === null || modalidadeId === undefined) return true;
  return modalidadePorId(modalidadeId)?.penaltis === true;
}
