const doisDigitos = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * Dia civil no fuso do ambiente, em AAAA-MM-DD.
 * @param {number} ms
 */
export function diaLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/**
 * Agrupa por dia, do mais recente ao mais antigo, e ordena as partidas do dia da mais recente à mais antiga.
 * Não filtra excluídas: quem chama decide.
 * @template {{ jogadaEm: number, criadaEm?: number, id?: string }} P
 * @param {P[]} partidas
 * @param {(ms: number) => string} [diaDe]
 * @returns {{ dia: string, partidas: P[] }[]}
 */
export function agruparPorDia(partidas, diaDe = diaLocal) {
  const ordenadas = [...partidas].sort(
    (a, b) =>
      b.jogadaEm - a.jogadaEm ||
      (b.criadaEm ?? 0) - (a.criadaEm ?? 0) ||
      String(a.id ?? '').localeCompare(String(b.id ?? '')),
  );
  /** @type {Map<string, P[]>} */
  const grupos = new Map();
  for (const partida of ordenadas) {
    const dia = diaDe(partida.jogadaEm);
    const lista = grupos.get(dia);
    if (lista) lista.push(partida);
    else grupos.set(dia, [partida]);
  }
  return [...grupos].map(([dia, lista]) => ({ dia, partidas: lista }));
}
