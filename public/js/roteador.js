// Roteador por fragmento (#/...). O fragmento nunca vai ao servidor, e o convite sai dele assim que lido.

/**
 * @typedef {{ tela: 'inicio' } | { tela: 'criar' } | { tela: 'entrar', codigo?: string } | { tela: 'acesso' } | { tela: 'resenha', id: string, aba: 'placar' | 'historico' | 'geral' | 'ajustes' }} Rota
 */

const ABAS = ['historico', 'geral', 'ajustes'];

/** @returns {Rota} */
export function lerRota(hash = location.hash) {
  const partes = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  const [a, b, c] = partes;
  if (a === 'criar') return { tela: 'criar' };
  if (a === 'entrar') return { tela: 'entrar' };
  if (a === 'c' && b) return { tela: 'entrar', codigo: b };
  if (a === 'acesso' && b === 'transferencia') return { tela: 'acesso' };
  if (a === 'r' && b) return { tela: 'resenha', id: b, aba: /** @type {any} */ (ABAS.includes(c) ? c : 'placar') };
  return { tela: 'inicio' };
}

export const caminhoResenha = (id, aba = 'placar') =>
  `#/r/${encodeURIComponent(id)}${aba === 'placar' ? '' : `/${aba}`}`;

/** Navega adicionando uma entrada ao histórico. */
export function ir(hash) {
  location.hash = hash;
}

/** Navega sem deixar a página anterior no histórico. */
export function substituir(hash) {
  location.replace(hash);
}

/** Troca o fragmento sem disparar nova renderização (usado para apagar o convite da barra de endereço). */
export function limparFragmento(hash) {
  history.replaceState(null, '', hash);
}
