// Linha de partida no formato da súmula: lado A, placar, lado B e, abaixo, quem lançou e quando.

import { modalidadePorId } from '../../../compartilhado/modalidades.js';
import { vencedorFinal } from '../../../compartilhado/placar.js';
import { hora } from '../formatos.js';
import { h, iniciais } from '../util.js';

/**
 * @param {any} partida partida da visão (com `pendente` e `podeEditar`)
 * @param {{ nomeDoLado: (id: string) => string, nomeDoMembro: (id: string | null) => string, aoAbrir: (partida: any) => void, nova?: boolean, mostrarModalidade?: boolean }} contexto
 */
export function linhaPartida(partida, { nomeDoLado, nomeDoMembro, aoAbrir, nova = false, mostrarModalidade = true }) {
  const { lado, porPenaltis } = vencedorFinal(partida);
  const decisiva = partida.placarA !== partida.placarB;
  const nomeA = nomeDoLado(partida.ladoA);
  const nomeB = nomeDoLado(partida.ladoB);
  const lancou = nomeDoMembro(partida.criadoPor);
  const editou =
    partida.editadoPor && partida.editadoPor !== partida.criadoPor ? nomeDoMembro(partida.editadoPor) : null;
  const modalidade = mostrarModalidade ? modalidadePorId(partida.modalidade) : null;
  const temPenaltis = partida.penaltisA != null && partida.penaltisB != null;

  const resumo = `${nomeA} ${partida.placarA}, ${nomeB} ${partida.placarB}${temPenaltis ? `, pênaltis ${partida.penaltisA} a ${partida.penaltisB}` : ''}`;

  return h(
    'button',
    {
      type: 'button',
      class: `partida${nova ? ' partida-nova' : ''}`,
      dataset: { vencedor: lado ?? 'empate' },
      'aria-label': `${resumo}. Abrir partida.`,
      onClick: () => aoAbrir(partida),
    },
    h('span', { class: 'partida-lado a' }, nomeA),
    h(
      'span',
      { class: 'partida-placar' },
      h('span', { class: decisiva && lado === 'b' && !porPenaltis ? 'perdeu' : '' }, String(partida.placarA)),
      h('span', { class: 'x' }, 'x'),
      h('span', { class: decisiva && lado === 'a' && !porPenaltis ? 'perdeu' : '' }, String(partida.placarB)),
    ),
    h('span', { class: 'partida-lado b' }, nomeB),
    temPenaltis &&
      h(
        'span',
        { class: 'penaltis-texto' },
        h('span', { class: 'sr-only' }, 'Decidida nos '),
        `Pênaltis ${partida.penaltisA} x ${partida.penaltisB}`,
      ),
    h(
      'span',
      { class: 'partida-meta' },
      h(
        'span',
        { class: 'partida-meta-lancou' },
        h('span', { class: 'rubrica', 'aria-hidden': 'true' }, iniciais(lancou)),
        h(
          'span',
          null,
          `${lancou} · ${hora(partida.jogadaEm)}${editou ? ` · editada por ${editou}` : ''}${modalidade ? ` · ${modalidade.nome}` : ''}`,
        ),
      ),
      partida.pendente && h('span', { class: 'marca-pendente' }, 'Pendente'),
    ),
  );
}
