// Cartão de resumo em PNG (1080 x 1350), no estilo da súmula. Cores fixas do tema claro: a imagem sai igual em qualquer aparelho.
import { sinal } from './formatos.js';

const LARGURA = 1080;
const ALTURA = 1350;
// Valores dos tokens claros de tokens.css (canvas não lê variáveis CSS).
const COR = {
  papel: '#f2f4f8',
  folha: '#ffffff',
  traco: '#d3d9e4',
  tracoForte: '#7a869d',
  texto: '#0e1526',
  texto3: '#586379',
  tinta: '#1b3db5',
  campo: '#e9edf5',
};
const NUMEROS = '"Barlow Condensed", Barlow, sans-serif';
const TEXTO = 'Barlow, sans-serif';

function cortar(ctx, texto, largura) {
  if (ctx.measureText(texto).width <= largura) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function retangulo(ctx, x, y, l, a, raio) {
  ctx.beginPath();
  ctx.roundRect(x, y, l, a, raio);
}

/**
 * @param {{ nomeResenha: string, totais: { partidas: number, golsMarcados: number }, tabela: any[], ultimas: { a: string, b: string, placarA: number, placarB: number, penaltis: string | null }[], endereco: string }} dados
 * @returns {Promise<Blob>}
 */
export async function gerarCartao(dados) {
  await Promise.all([
    document.fonts.load(`800 80px ${NUMEROS}`),
    document.fonts.load(`700 40px ${NUMEROS}`),
    document.fonts.load(`500 32px ${TEXTO}`),
    document.fonts.load(`600 32px ${TEXTO}`),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  ctx.fillStyle = COR.papel;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  ctx.fillStyle = COR.folha;
  ctx.strokeStyle = COR.tracoForte;
  ctx.lineWidth = 2;
  retangulo(ctx, 48, 48, LARGURA - 96, ALTURA - 96, 32);
  ctx.fill();
  ctx.stroke();

  const margem = 96;
  const largura = LARGURA - margem * 2;
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = COR.tinta;
  ctx.font = `800 48px ${NUMEROS}`;
  ctx.fillText('Partidou', margem, 140);

  ctx.fillStyle = COR.texto;
  ctx.font = `800 112px ${NUMEROS}`;
  ctx.fillText(cortar(ctx, dados.nomeResenha, largura), margem, 260);

  ctx.fillStyle = COR.texto3;
  ctx.font = `500 34px ${TEXTO}`;
  ctx.fillText(
    `${dados.totais.partidas} ${dados.totais.partidas === 1 ? 'partida' : 'partidas'} · ${dados.totais.golsMarcados} ${dados.totais.golsMarcados === 1 ? 'gol' : 'gols'}`,
    margem,
    312,
  );

  // Classificação
  let y = 392;
  ctx.fillStyle = COR.campo;
  ctx.fillRect(margem - 24, y - 44, largura + 48, 64);
  ctx.fillStyle = COR.texto3;
  ctx.font = `600 28px ${TEXTO}`;
  /** @type {[string, number][]} */
  const colunas = [
    ['J', 560],
    ['V', 640],
    ['E', 720],
    ['D', 800],
    ['SG', 912],
  ];
  ctx.fillText('Lado', margem + 56, y);
  ctx.textAlign = 'right';
  for (const [rotulo, x] of colunas) ctx.fillText(rotulo, x + 24, y);
  ctx.textAlign = 'left';

  y += 72;
  const linhas = dados.tabela.slice(0, 6);
  for (const [i, linha] of linhas.entries()) {
    ctx.fillStyle = COR.texto3;
    ctx.font = `600 34px ${TEXTO}`;
    ctx.fillText(String(i + 1), margem, y);
    ctx.fillStyle = COR.texto;
    ctx.font = `700 42px ${NUMEROS}`;
    ctx.fillText(cortar(ctx, linha.nome, 400), margem + 56, y);
    ctx.textAlign = 'right';
    ctx.font = `600 38px ${NUMEROS}`;
    const valores = [linha.partidas, linha.vitorias, linha.empates, linha.derrotas, sinal(linha.saldo)];
    for (const [k, [, x]] of colunas.entries()) {
      ctx.fillStyle = k === 4 ? COR.tinta : COR.texto;
      ctx.fillText(String(valores[k]), x + 24, y);
    }
    ctx.textAlign = 'left';
    ctx.strokeStyle = COR.traco;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margem - 24, y + 22);
    ctx.lineTo(margem + largura + 24, y + 22);
    ctx.stroke();
    y += 68;
  }

  // Últimas partidas
  y = Math.max(y + 48, 900);
  ctx.fillStyle = COR.texto;
  ctx.font = `800 44px ${NUMEROS}`;
  ctx.fillText('Últimas partidas', margem, y);
  y += 28;
  for (const p of dados.ultimas.slice(0, 5)) {
    y += 64;
    ctx.font = `600 36px ${TEXTO}`;
    ctx.fillStyle = COR.texto;
    ctx.textAlign = 'right';
    ctx.fillText(cortar(ctx, p.a, 330), margem + 380, y);
    ctx.textAlign = 'center';
    ctx.fillStyle = COR.tinta;
    ctx.font = `800 52px ${NUMEROS}`;
    ctx.fillText(`${p.placarA} x ${p.placarB}`, LARGURA / 2, y + 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = COR.texto;
    ctx.font = `600 36px ${TEXTO}`;
    ctx.fillText(cortar(ctx, p.b, 330), margem + largura - 380, y);
    if (p.penaltis) {
      ctx.fillStyle = COR.texto3;
      ctx.font = `500 26px ${TEXTO}`;
      ctx.textAlign = 'center';
      ctx.fillText(`Pênaltis ${p.penaltis}`, LARGURA / 2, y + 34);
      ctx.textAlign = 'left';
      y += 28;
    }
  }

  ctx.fillStyle = COR.texto3;
  ctx.font = `500 28px ${TEXTO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`Jogou? Registrou. · ${dados.endereco}`, LARGURA / 2, ALTURA - 92);

  return new Promise((resolver, rejeitar) =>
    canvas.toBlob((b) => (b ? resolver(b) : rejeitar(new Error('Imagem não gerada.'))), 'image/png'),
  );
}
