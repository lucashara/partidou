// Aba Histórico: partidas agrupadas por dia, do mais recente ao mais antigo.
import { agruparPorDia } from '../../../compartilhado/datas.js';
import { linhaPartida } from '../componentes/linha-partida.js';
import { plural, rotuloDia } from '../formatos.js';
import { h, trocarFilhos } from '../util.js';

const DIAS_POR_PAGINA = 14;

/**
 * @param {{ abrirPartida: (p: any) => void, irPlacar: () => void, nomeDoLado: (id: string) => string, nomeDoMembro: (id: string | null) => string }} contexto
 */
export function criarAbaHistorico({ abrirPartida, irPlacar, nomeDoLado, nomeDoMembro }) {
  /** @type {import('../dados/tipos.js').Visao | null} */
  let visao = null;
  let limite = DIAS_POR_PAGINA;
  const el = h('div', { class: 'tela' });

  function desenhar() {
    if (!visao) return;
    const dias = agruparPorDia(visao.partidas);
    if (dias.length === 0) {
      trocarFilhos(
        el,
        h(
          'div',
          { class: 'vazio' },
          h('p', { class: 'vazio-titulo' }, 'Nenhuma partida registrada'),
          h('p', { class: 'apoio' }, 'O histórico reúne as partidas por dia, da mais recente para a mais antiga.'),
          h('button', { type: 'button', class: 'btn btn-primario', onClick: irPlacar }, 'Lançar partida'),
        ),
      );
      return;
    }
    const contexto = { nomeDoLado, nomeDoMembro, aoAbrir: abrirPartida };
    const visiveis = dias.slice(0, limite);
    trocarFilhos(
      el,
      visiveis.map(({ partidas }) =>
        h(
          'section',
          { class: 'dia', 'aria-label': rotuloDia(partidas[0].jogadaEm) },
          h(
            'h2',
            { class: 'dia-topo' },
            rotuloDia(partidas[0].jogadaEm),
            h('small', null, plural(partidas.length, 'partida', 'partidas')),
          ),
          partidas.map((p) => linhaPartida(p, contexto)),
        ),
      ),
      dias.length > limite &&
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-bloco',
            onClick: () => {
              limite += DIAS_POR_PAGINA;
              desenhar();
            },
          },
          'Mostrar dias anteriores',
        ),
    );
  }

  return {
    el,
    /** @param {any} nova */
    atualizar(nova) {
      visao = nova;
      desenhar();
    },
  };
}
