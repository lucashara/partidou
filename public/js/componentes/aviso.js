// Aviso temporário na base da tela, com ação opcional (por exemplo, Desfazer). Um por vez.
import { h } from '../util.js';

/** @type {{ el: HTMLElement, fechar: () => void } | null} */
let atual = null;

export function fecharAviso() {
  atual?.fechar();
}

/**
 * @param {{ texto: string, tom?: 'erro', acao?: { rotulo: string, aoClicar: () => void }, duracaoMs?: number }} opcoes
 * @returns {{ fechar: () => void }}
 */
export function avisar({ texto, tom, acao, duracaoMs = 5000 }) {
  atual?.fechar();
  const raiz = /** @type {HTMLElement} */ (document.getElementById('avisos'));
  const barra = h('span', { class: 'aviso-tempo' });
  barra.style.animationDuration = `${duracaoMs}ms`;

  let encerrado = false;
  let temporizador;
  const fechar = () => {
    if (encerrado) return;
    encerrado = true;
    clearTimeout(temporizador);
    el.remove();
    if (atual?.el === el) atual = null;
  };

  const el = h(
    'div',
    { class: 'aviso', dataset: tom ? { tom } : {} },
    h('p', { class: 'aviso-texto' }, texto),
    acao &&
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onClick: () => {
            fechar();
            acao.aoClicar();
          },
        },
        acao.rotulo,
      ),
    barra,
  );
  raiz.append(el);
  temporizador = setTimeout(fechar, duracaoMs);
  atual = { el, fechar };
  return { fechar };
}

/** Ajusta a posição dos avisos conforme a barra de abas esteja visível. */
export function posicionarAvisos(comAbas) {
  document.getElementById('avisos')?.classList.toggle('sem-abas', !comAbas);
}
