// Ícones desenhados em SVG (grade 24, traço arredondado). Herdam a cor do texto.
const NS = 'http://www.w3.org/2000/svg';

export const CAMINHOS = {
  mais: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  voltar: 'M15 5l-7 7 7 7',
  avancar: 'M9 5l7 7-7 7',
  opcoes: 'M5 12h.01M12 12h.01M19 12h.01',
  ajuda: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 16.8v.2',
  placar: 'M3 6h18v12H3V6zM12 6v12M7 10v4M17 10v4',
  historico: 'M4 6h16v14H4V6zM4 10h16M8 3v4M16 3v4',
  geral: 'M5 20V11M12 20V4M19 20v-7',
  fechar: 'M6 6l12 12M18 6L6 18',
  lixeira: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  desfazer: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  copiar: 'M9 9h11v11H9V9zM5 15H4V4h11v1',
  compartilhar: 'M12 15V4M8 8l4-4 4 4M6 11H5v9h14v-9h-1',
  relogio: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  alerta: 'M12 3.5l9.5 16.5h-19L12 3.5zM12 10v4.5M12 17.4v.2',
  pessoas:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  lapis: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  sair: 'M10 4H5v16h5M16 8l4 4-4 4M20 12H9',
  cadeado: 'M5 11h14v10H5V11zM8 11V8a4 4 0 0 1 8 0v3',
  aparelho: 'M8 3h8v18H8V3zM11 18h2',
};

/**
 * @param {keyof typeof CAMINHOS} nome
 * @param {{ tamanho?: number, traco?: number }} [opcoes]
 * @returns {SVGSVGElement}
 */
export function icone(nome, { tamanho = 24, traco = 2 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(tamanho));
  svg.setAttribute('height', String(tamanho));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const caminho = document.createElementNS(NS, 'path');
  caminho.setAttribute('d', CAMINHOS[nome]);
  caminho.setAttribute('fill', 'none');
  caminho.setAttribute('stroke', 'currentColor');
  caminho.setAttribute('stroke-width', String(traco));
  caminho.setAttribute('stroke-linecap', 'round');
  caminho.setAttribute('stroke-linejoin', 'round');
  svg.append(caminho);
  return svg;
}
