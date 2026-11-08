// Aba Geral: classificação, maior diferença e confrontos. Vitória, empate e derrota seguem o tempo normal.
import { calcularEstatisticas } from '../../../compartilhado/estatisticas.js';
import { compartilharResumo } from '../compartilhar.js';
import { linhaPartida } from '../componentes/linha-partida.js';
import { plural, sinal } from '../formatos.js';
import { icone } from '../icones.js';
import { h, trocarFilhos } from '../util.js';

const COLUNAS = [
  ['J', 'Jogos', 'partidas'],
  ['V', 'Vitórias', 'vitorias'],
  ['E', 'Empates', 'empates'],
  ['D', 'Derrotas', 'derrotas'],
  ['GP', 'Gols pró', 'golsPro'],
  ['GC', 'Gols contra', 'golsContra'],
  ['SG', 'Saldo de gols', 'saldo'],
];

/**
 * @param {{ abrirPartida: (p: any) => void, nomeDoLado: (id: string) => string, nomeDoMembro: (id: string | null) => string, irPlacar: () => void }} contexto
 */
export function criarAbaGeral({ abrirPartida, nomeDoLado, nomeDoMembro, irPlacar }) {
  /** @type {import('../dados/tipos.js').Visao | null} */
  let visao = null;
  let sujo = true;
  let visivel = false;
  const el = h('div', { class: 'tela' });

  function tabela(estatisticas) {
    const corpo = estatisticas.tabela.map((linha, i) =>
      h(
        'tr',
        null,
        h('td', { class: 'col-pos' }, String(i + 1)),
        h('th', { scope: 'row', class: 'col-nome' }, linha.nome),
        COLUNAS.map(([, , campo]) =>
          h(
            'td',
            { class: campo === 'saldo' ? 'col-saldo' : '' },
            campo === 'saldo' ? sinal(linha.saldo) : String(linha[campo]),
          ),
        ),
      ),
    );
    return h(
      'div',
      { class: 'dia' },
      h(
        'table',
        { class: 'classificacao' },
        h('caption', { class: 'sr-only' }, 'Classificação por vitórias, depois saldo de gols'),
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'col', class: 'col-pos' }, h('span', { class: 'sr-only' }, 'Posição')),
            h('th', { scope: 'col', class: 'col-nome' }, 'Lado'),
            COLUNAS.map(([sigla, nome]) => h('th', { scope: 'col', title: nome }, h('abbr', { title: nome }, sigla))),
          ),
        ),
        h('tbody', null, corpo),
      ),
      h(
        'p',
        { class: 'legenda' },
        'J jogos · V vitórias · E empates · D derrotas · GP gols pró · GC gols contra · SG saldo. Pênaltis não entram nos gols.',
      ),
    );
  }

  function confrontos(estatisticas) {
    const lista = estatisticas.confrontos.filter((c) => c.partidas > 0);
    if (lista.length === 0) return null;
    return h(
      'section',
      { class: 'secao' },
      h('h2', { class: 'secao-titulo' }, 'Confrontos'),
      h(
        'div',
        { class: 'dia' },
        lista.map((c) => {
          const a = nomeDoLado(c.ladoA);
          const b = nomeDoLado(c.ladoB);
          const barra = h('div', { class: 'confronto-barra', 'aria-hidden': 'true' });
          for (const [classe, valor] of [
            ['a', c.vitoriasA],
            ['empate', c.empates],
            ['b', c.vitoriasB],
          ]) {
            if (valor === 0) continue;
            const trecho = h('span', { class: classe });
            trecho.style.flexGrow = String(valor);
            barra.append(trecho);
          }
          const penaltis =
            c.penaltisVencidosA + c.penaltisVencidosB > 0
              ? ` · Pênaltis ${c.penaltisVencidosA} x ${c.penaltisVencidosB}`
              : '';
          return h(
            'div',
            { class: 'confronto' },
            h('div', { class: 'confronto-nomes' }, h('span', null, a), h('span', null, b)),
            barra,
            h(
              'div',
              { class: 'confronto-resumo' },
              h('span', null, `Vitórias ${c.vitoriasA} x ${c.vitoriasB} · ${plural(c.empates, 'empate', 'empates')}`),
              h('span', null, `Gols ${c.golsA} x ${c.golsB}${penaltis}`),
            ),
          );
        }),
      ),
    );
  }

  function desenhar() {
    if (!visao || !visivel || !sujo) return;
    sujo = false;
    const estatisticas = calcularEstatisticas(visao.partidas, visao.competidores);
    if (estatisticas.totais.partidas === 0) {
      trocarFilhos(
        el,
        h(
          'div',
          { class: 'vazio' },
          h('p', { class: 'vazio-titulo' }, 'Sem partidas para calcular'),
          h(
            'p',
            { class: 'apoio' },
            'A classificação, a maior diferença e os confrontos aparecem depois da primeira partida.',
          ),
          h('button', { type: 'button', class: 'btn btn-primario', onClick: irPlacar }, 'Lançar partida'),
        ),
      );
      return;
    }
    const maior = estatisticas.maiorDiferenca;
    const partidaMaior = maior ? visao.partidas.find((p) => p.id === maior.partidaId) : null;
    trocarFilhos(
      el,
      h(
        'section',
        { class: 'secao' },
        h(
          'h2',
          { class: 'secao-titulo' },
          'Classificação',
          h(
            'small',
            null,
            `${plural(estatisticas.totais.partidas, 'partida', 'partidas')} · ${plural(estatisticas.totais.golsMarcados, 'gol', 'gols')}${estatisticas.totais.decididasNosPenaltis ? ` · ${estatisticas.totais.decididasNosPenaltis} nos pênaltis` : ''}`,
          ),
        ),
        tabela(estatisticas),
      ),
      partidaMaior &&
        h(
          'section',
          { class: 'secao' },
          h('h2', { class: 'secao-titulo' }, 'Maior diferença'),
          h('div', { class: 'dia' }, linhaPartida(partidaMaior, { nomeDoLado, nomeDoMembro, aoAbrir: abrirPartida })),
        ),
      confrontos(estatisticas),
      h(
        'button',
        { type: 'button', class: 'btn btn-bloco', onClick: () => compartilharResumo({ visao, estatisticas }) },
        icone('compartilhar', { tamanho: 20 }),
        'Compartilhar resumo',
      ),
    );
  }

  return {
    el,
    /** @param {any} nova */
    atualizar(nova) {
      visao = nova;
      sujo = true;
      desenhar();
    },
    /** Calcula só quando a aba aparece: a aba oculta não paga o custo. */
    definirVisivel(valor) {
      visivel = valor;
      desenhar();
    },
  };
}
