// Cartão de resumo em PNG (1080 x 1350): placar de LED, classificação e últimas partidas.
// A geometria vem de cartao-plano.js; aqui só se desenha, com as cores e fontes dos tokens do app.
import { ALTURA, LARGURA, MARGEM, planejarCartao } from './cartao-plano.js';
import { sinal } from './formatos.js';
import { CAMINHOS } from './icones.js';

const FONTES_NECESSARIAS = [
  '800 56px "Barlow Condensed"',
  '700 34px "Barlow Condensed"',
  '500 28px "Barlow"',
  '600 28px "Barlow"',
  '900 120px "Doto"',
];
const padrao = {
  '--base': '#06120b',
  '--papel': '#0a1c12',
  '--campo': '#133121',
  '--traco': 'rgb(228 245 234 / 0.12)',
  '--traco-forte': '#5f7a69',
  '--texto': '#ecf4ee',
  '--texto-2': '#a9bdaf',
  '--texto-3': '#86a08f',
  '--led': '#ffb21e',
  '--carcaca': '#040a06',
  '--lado-a': '#4db3ff',
  '--lado-b': '#ff6b6f',
  '--empate': '#bccabf',
  '--fonte': 'Barlow, sans-serif',
  '--fonte-numeros': '"Barlow Condensed", Barlow, sans-serif',
  '--fonte-led': 'Doto, "Barlow Condensed", monospace',
};

/** Fonte que falha em carregar cai na pilha do token: o cartão sai com a fonte do sistema em vez de não sair. */
async function carregarFontes() {
  await Promise.allSettled(FONTES_NECESSARIAS.map((f) => document.fonts.load(f, '0123456789×AaVvEeDd')));
}

function lerTokens() {
  const estilo = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(padrao).map(([nome, valor]) => [nome, estilo.getPropertyValue(nome).trim() || valor]),
  );
}

/**
 * Escreve o texto reduzindo o corpo até caber em `larguraMax`; com `cortar`, mantém o corpo e corta com reticências.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} conteudo
 * @param {number} x
 * @param {number} y
 * @param {{ fonte: string, tamanho: number, peso: number, cor: string, alinhar?: CanvasTextAlign, larguraMax?: number, cortar?: boolean }} opcoes
 */
function texto(
  ctx,
  conteudo,
  x,
  y,
  { fonte, tamanho, peso, cor, alinhar = 'left', larguraMax = Infinity, cortar = false },
) {
  let corpo = tamanho;
  ctx.font = `${peso} ${corpo}px ${fonte}`;
  while (ctx.measureText(conteudo).width > larguraMax && corpo > (cortar ? tamanho : 16)) {
    corpo -= 1;
    ctx.font = `${peso} ${corpo}px ${fonte}`;
  }
  let saida = conteudo;
  if (cortar) {
    while (saida.length > 1 && ctx.measureText(saida).width > larguraMax) saida = `${saida.slice(0, -2).trimEnd()}…`;
  }
  ctx.fillStyle = cor;
  ctx.textAlign = alinhar;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(saida, x, y);
}

// arcTo em vez de roundRect: este só existe a partir do Safari 16.
function retanguloArredondado(ctx, x, y, largura, altura, raio) {
  const r = Math.min(raio, largura / 2, altura / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, r);
  ctx.arcTo(x + largura, y + altura, x, y + altura, r);
  ctx.arcTo(x, y + altura, x, y, r);
  ctx.arcTo(x, y, x + largura, y, r);
  ctx.closePath();
}

function fundo(ctx, c) {
  const gradiente = ctx.createLinearGradient(0, 0, 0, ALTURA);
  gradiente.addColorStop(0, c['--papel']);
  gradiente.addColorStop(1, c['--base']);
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  ctx.fillStyle = 'rgb(255 255 255 / 0.02)';
  for (let x = 44; x < LARGURA; x += 88) ctx.fillRect(x, 0, 44, ALTURA);
  const holofote = ctx.createRadialGradient(LARGURA / 2, -60, 40, LARGURA / 2, -60, 760);
  holofote.addColorStop(0, 'rgb(255 255 255 / 0.12)');
  holofote.addColorStop(1, 'rgb(255 255 255 / 0)');
  ctx.fillStyle = holofote;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
}

function cabecalho(ctx, c) {
  ctx.save();
  ctx.translate(MARGEM, 62);
  ctx.scale(2.2, 2.2);
  ctx.strokeStyle = c['--led'];
  ctx.shadowColor = c['--led'];
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(CAMINHOS.bola));
  ctx.restore();
  texto(ctx, 'Partidou', MARGEM + 68, 108, { fonte: c['--fonte-numeros'], tamanho: 56, peso: 800, cor: c['--texto'] });
  texto(ctx, 'Jogou? Registrou.', LARGURA - MARGEM, 104, {
    fonte: c['--fonte'],
    tamanho: 30,
    peso: 500,
    cor: c['--texto-2'],
    alinhar: 'right',
  });
}

function painelLed(ctx, c, plano, dados) {
  const { y, altura } = plano.painel;
  const largura = LARGURA - 2 * MARGEM;
  texto(ctx, dados.nomeResenha, MARGEM, 236, {
    fonte: c['--fonte-numeros'],
    tamanho: 96,
    peso: 800,
    cor: c['--texto'],
    larguraMax: largura,
  });
  retanguloArredondado(ctx, MARGEM, y, largura, altura, 28);
  ctx.fillStyle = c['--carcaca'];
  ctx.fill();
  ctx.strokeStyle = c['--traco-forte'];
  ctx.lineWidth = 2;
  ctx.stroke();

  const { partidas, golsMarcados } = dados.totais;
  const media =
    partidas > 0
      ? (golsMarcados / partidas).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
      : '0';
  const celulas = [
    [String(partidas), partidas === 1 ? 'Partida' : 'Partidas'],
    [String(golsMarcados), golsMarcados === 1 ? 'Gol' : 'Gols'],
    [media, 'Gols por partida'],
  ];
  const passo = largura / celulas.length;
  for (const [i, [valor, rotulo]] of celulas.entries()) {
    const centro = MARGEM + passo * (i + 0.5);
    if (i > 0) {
      ctx.fillStyle = c['--traco'];
      ctx.fillRect(MARGEM + passo * i - 1, y + 28, 2, altura - 56);
    }
    ctx.save();
    ctx.shadowColor = c['--led'];
    ctx.shadowBlur = 30;
    texto(ctx, valor, centro, y + 104, {
      fonte: c['--fonte-led'],
      tamanho: 104,
      peso: 900,
      cor: c['--led'],
      alinhar: 'center',
      larguraMax: passo - 40,
    });
    ctx.restore();
    texto(ctx, rotulo, centro, y + altura - 28, {
      fonte: c['--fonte'],
      tamanho: 28,
      peso: 500,
      cor: c['--texto-2'],
      alinhar: 'center',
    });
  }
}

function secaoTitulo(ctx, c, y, titulo, meta) {
  texto(ctx, titulo, MARGEM, y, { fonte: c['--fonte-numeros'], tamanho: 44, peso: 800, cor: c['--texto'] });
  if (meta)
    texto(ctx, meta, LARGURA - MARGEM, y - 2, {
      fonte: c['--fonte'],
      tamanho: 28,
      peso: 500,
      cor: c['--texto-2'],
      alinhar: 'right',
    });
}

/** @type {[string, number][]} */
const COLUNAS = [
  ['J', 628],
  ['V', 712],
  ['E', 796],
  ['D', 880],
  ['SG', 1008],
];

function classificacao(ctx, c, plano, tabela) {
  const p = plano.tabela;
  if (!p) return;
  const total = tabela.length;
  secaoTitulo(ctx, c, p.tituloY, 'Classificação', total > p.linhas ? `${p.linhas} de ${total}` : '');
  const largura = LARGURA - 2 * MARGEM;
  retanguloArredondado(ctx, MARGEM, p.cabecalho.y, largura, p.cabecalho.altura, 12);
  ctx.fillStyle = c['--campo'];
  ctx.fill();
  const yCab = p.cabecalho.y + 31;
  texto(ctx, 'Lado', MARGEM + 64, yCab, { fonte: c['--fonte'], tamanho: 26, peso: 600, cor: c['--texto-2'] });
  for (const [rotulo, x] of COLUNAS)
    texto(ctx, rotulo, x, yCab, { fonte: c['--fonte'], tamanho: 26, peso: 600, cor: c['--texto-2'], alinhar: 'right' });

  for (const [i, linha] of tabela.slice(0, p.linhas).entries()) {
    const y = p.primeiraY + i * p.passo;
    if (i === 0) {
      ctx.fillStyle = 'rgb(255 178 30 / 0.09)';
      ctx.fillRect(MARGEM, y - 34, largura, p.passo - 2);
    }
    texto(ctx, String(i + 1), MARGEM + 22, y, {
      fonte: c['--fonte-numeros'],
      tamanho: 36,
      peso: 700,
      cor: i === 0 ? c['--led'] : c['--texto-3'],
      alinhar: 'center',
    });
    texto(ctx, linha.nome, MARGEM + 64, y, {
      fonte: c['--fonte-numeros'],
      tamanho: 40,
      peso: 700,
      cor: c['--texto'],
      larguraMax: 450,
      cortar: true,
    });
    const valores = [linha.partidas, linha.vitorias, linha.empates, linha.derrotas, sinal(linha.saldo)];
    for (const [k, [, x]] of COLUNAS.entries()) {
      texto(ctx, String(valores[k]), x, y, {
        fonte: c['--fonte-numeros'],
        tamanho: 38,
        peso: 700,
        cor: k === 4 ? c['--led'] : c['--texto'],
        alinhar: 'right',
      });
    }
    if (i < p.linhas - 1) {
      ctx.fillStyle = c['--traco'];
      ctx.fillRect(MARGEM, y + 16, largura, 1);
    }
  }
}

function ultimasPartidas(ctx, c, plano, partidas) {
  const p = plano.partidas;
  if (!p) return;
  secaoTitulo(ctx, c, p.tituloY, 'Últimas partidas', p.omitidas > 0 ? `${p.itens.length} de ${partidas.length}` : '');
  const largura = LARGURA - 2 * MARGEM;
  for (const item of p.itens) {
    const partida = partidas[item.indice];
    const vencedor = partida.vencedor;
    const corLado = { a: c['--lado-a'], b: c['--lado-b'] };
    if (item.indice > 0) {
      ctx.fillStyle = c['--traco'];
      ctx.fillRect(MARGEM, item.topo, largura, 1);
    }
    const estilo = (lado) => ({
      fonte: c['--fonte-numeros'],
      tamanho: 38,
      peso: vencedor === lado ? 800 : 600,
      cor: vencedor === lado ? corLado[lado] : c['--texto-2'],
      larguraMax: 372,
      cortar: true,
    });
    texto(ctx, partida.a, LARGURA / 2 - 104, item.baseline, { ...estilo('a'), alinhar: 'right' });
    texto(ctx, partida.b, LARGURA / 2 + 104, item.baseline, { ...estilo('b'), alinhar: 'left' });
    ctx.save();
    ctx.shadowColor = c['--led'];
    ctx.shadowBlur = 14;
    texto(ctx, `${partida.placarA} × ${partida.placarB}`, LARGURA / 2, item.baseline + 2, {
      fonte: c['--fonte-numeros'],
      tamanho: 52,
      peso: 800,
      cor: c['--led'],
      alinhar: 'center',
    });
    ctx.restore();
    if (partida.penaltis) {
      texto(ctx, `Pênaltis ${partida.penaltis}`, LARGURA / 2, item.baseline + 30, {
        fonte: c['--fonte'],
        tamanho: 24,
        peso: 500,
        cor: c['--texto-2'],
        alinhar: 'center',
      });
    }
  }
}

function rodape(ctx, c, plano, endereco) {
  const { y } = plano.rodape;
  ctx.fillStyle = c['--traco'];
  ctx.fillRect(MARGEM, y, LARGURA - 2 * MARGEM, 1);
  texto(ctx, endereco, LARGURA / 2, y + 58, {
    fonte: c['--fonte'],
    tamanho: 30,
    peso: 600,
    cor: c['--texto-2'],
    alinhar: 'center',
  });
}

/**
 * @param {{ nomeResenha: string, totais: { partidas: number, golsMarcados: number }, tabela: any[], ultimas: { a: string, b: string, placarA: number, placarB: number, penaltis: string | null, vencedor: 'a' | 'b' | null }[], endereco: string }} dados
 * @returns {Promise<Blob>}
 */
export async function gerarCartao(dados) {
  await carregarFontes();
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const c = lerTokens();
  const plano = planejarCartao({
    linhasTabela: dados.tabela.length,
    partidas: dados.ultimas.map((u) => ({ penaltis: u.penaltis !== null })),
  });

  fundo(ctx, c);
  cabecalho(ctx, c);
  painelLed(ctx, c, plano, dados);
  classificacao(ctx, c, plano, dados.tabela);
  ultimasPartidas(ctx, c, plano, dados.ultimas);
  rodape(ctx, c, plano, dados.endereco);

  return new Promise((resolver, rejeitar) =>
    canvas.toBlob((b) => (b ? resolver(b) : rejeitar(new Error('Imagem não gerada.'))), 'image/png'),
  );
}
