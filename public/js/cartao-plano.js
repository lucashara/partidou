// Geometria do cartão de resumo, sem canvas: cada bloco recebe a posição e o rodapé tem faixa reservada,
// então nenhuma quantidade de partidas ou de pênaltis faz o texto invadir o rodapé.

export const LARGURA = 1080;
export const ALTURA = 1350;
export const MARGEM = 54;

const RODAPE_ALTURA = 96;
const GUARDA = 12;
const MAX_LINHAS_TABELA = 5;
const MAX_PARTIDAS = 8;
const PASSO_TABELA = 48;
const ALTURA_PARTIDA = 52;
const EXTRA_PENALTIS = 28;

/**
 * @param {{ linhasTabela: number, partidas: { penaltis: boolean }[] }} entrada
 */
export function planejarCartao({ linhasTabela, partidas }) {
  const painel = { y: 272, altura: 176 };
  const rodape = { y: ALTURA - RODAPE_ALTURA, altura: RODAPE_ALTURA };
  let fim = painel.y + painel.altura;

  /** @type {{ tituloY: number, cabecalho: { y: number, altura: number }, linhas: number, primeiraY: number, passo: number } | null} */
  let tabela = null;
  const linhas = Math.min(Math.max(0, linhasTabela), MAX_LINHAS_TABELA);
  if (linhas > 0) {
    const tituloY = fim + 64;
    const cabecalho = { y: tituloY + 24, altura: 44 };
    const primeiraY = cabecalho.y + cabecalho.altura + 40;
    tabela = { tituloY, cabecalho, linhas, primeiraY, passo: PASSO_TABELA };
    fim = primeiraY + (linhas - 1) * PASSO_TABELA + 18;
  }

  /** @type {{ tituloY: number, itens: { indice: number, topo: number, altura: number, baseline: number }[], omitidas: number } | null} */
  let secaoPartidas = null;
  if (partidas.length > 0) {
    const tituloY = fim + 64;
    const limite = rodape.y - GUARDA;
    let topo = tituloY + 24;
    const itens = [];
    for (const [indice, partida] of partidas.slice(0, MAX_PARTIDAS).entries()) {
      const altura = ALTURA_PARTIDA + (partida.penaltis ? EXTRA_PENALTIS : 0);
      if (topo + altura > limite) break;
      itens.push({ indice, topo, altura, baseline: topo + 38 });
      topo += altura;
    }
    secaoPartidas = { tituloY, itens, omitidas: partidas.length - itens.length };
  }

  return { painel, tabela, partidas: secaoPartidas, rodape };
}
