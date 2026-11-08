// Folha modal sobre <dialog>: foco preso, Escape e clique fora fecham. Inclui a confirmação do sistema.
import { icone } from '../icones.js';
import { h } from '../util.js';

/**
 * @param {{ titulo: string, corpo: Node | Node[], aoFechar?: () => void }} opcoes
 * @returns {{ el: HTMLDialogElement, fechar: () => void }}
 */
export function abrirFolha({ titulo, corpo, aoFechar }) {
  const idTitulo = `folha-${Math.random().toString(36).slice(2, 8)}`;
  const el = /** @type {HTMLDialogElement} */ (
    h(
      'dialog',
      { class: 'folha', 'aria-labelledby': idTitulo },
      h(
        'div',
        { class: 'folha-topo' },
        h('h2', { class: 'folha-titulo', id: idTitulo }, titulo),
        h(
          'button',
          { type: 'button', class: 'btn-icone', 'aria-label': 'Fechar', onClick: () => fechar() },
          icone('fechar'),
        ),
      ),
      h('div', { class: 'folha-corpo' }, corpo),
    )
  );

  const fechar = () => {
    if (el.open) el.close();
  };
  el.addEventListener('click', (evento) => {
    if (evento.target === el) fechar();
  });
  el.addEventListener('close', () => {
    el.remove();
    aoFechar?.();
  });
  document.body.append(el);
  el.showModal();
  return { el, fechar };
}

/**
 * Confirmação no padrão do sistema. Resolve true ao confirmar, false ao cancelar ou fechar.
 * @param {{ titulo: string, texto: string, rotuloConfirmar: string, perigo?: boolean }} opcoes
 * @returns {Promise<boolean>}
 */
export function confirmar({ titulo, texto, rotuloConfirmar, perigo = false }) {
  return new Promise((resolver) => {
    let resposta = false;
    const folha = abrirFolha({
      titulo,
      aoFechar: () => resolver(resposta),
      corpo: [
        h('p', { class: 'apoio' }, texto),
        h(
          'div',
          { class: 'acao-dupla' },
          h('button', { type: 'button', class: 'btn', onClick: () => folha.fechar() }, 'Cancelar'),
          h(
            'button',
            {
              type: 'button',
              class: `btn ${perigo ? 'btn-perigo-cheio' : 'btn-primario'}`,
              onClick: () => {
                resposta = true;
                folha.fechar();
              },
            },
            rotuloConfirmar,
          ),
        ),
      ],
    });
  });
}
