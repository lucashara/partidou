export const LIMITES = { nomeResenha: 40, apelido: 24, competidor: 30, placarMaximo: 999 };

// Controle, formatação invisível e uso privado ficam de fora; U+200D permanece para sequências de emoji.
const CARACTERES_PROIBIDOS = /[\p{Cc}\p{Cs}\p{Co}]|(?![‍])\p{Cf}/u;

// Preenchimentos que renderizam em branco mas não são espaço nem formatação (Hangul filler, braille vazio).
const SEM_CARACTERE_VISIVEL = /^[\s\p{Cc}\p{Cf}\u115F\u1160\u17B4\u17B5\u2800\u3164\uFFA0]*$/u;

/**
 * Remove espaços nas pontas, colapsa espaços internos e normaliza para NFC.
 * @param {unknown} texto
 */
export function normalizarNome(texto) {
  return String(texto ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chave de comparação: sem acento, sem caixa. Dois nomes com a mesma chave são o mesmo nome.
 * @param {unknown} texto
 */
export function chaveDeNome(texto) {
  return normalizarNome(texto).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Normaliza e valida um nome livre (apelido, competidor, resenha). O tamanho conta pontos de código,
 * como o `length()` do SQLite.
 * @param {unknown} texto
 * @param {number} maximo
 * @returns {{ ok: true, valor: string } | { ok: false, mensagem: string }}
 */
export function validarNome(texto, maximo) {
  if (typeof texto !== 'string') return { ok: false, mensagem: 'Nome obrigatório.' };
  const valor = normalizarNome(texto);
  if (valor.length === 0) return { ok: false, mensagem: 'Nome obrigatório.' };
  if ([...valor].length > maximo) return { ok: false, mensagem: `Nome com mais de ${maximo} caracteres.` };
  if (CARACTERES_PROIBIDOS.test(valor)) return { ok: false, mensagem: 'Nome com caracteres não permitidos.' };
  if (SEM_CARACTERE_VISIVEL.test(valor)) return { ok: false, mensagem: 'Nome sem caracteres visíveis.' };
  return { ok: true, valor };
}
