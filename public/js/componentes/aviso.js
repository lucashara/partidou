// Aviso temporário no topo da tela, com ação opcional (por exemplo, Desfazer). Um por vez.
import { h } from '../util.js';

/** @type {{ el: HTMLElement, fechar: () => void } | null} */
let atual = null;

export function fecharAviso() {
  atual?.fechar();
}

const comOuvinte = new WeakSet();

/** Com folha aberta o contêiner vai para dentro dela (fora do top layer o aviso ficaria atrás); ao fechar, volta ao documento. */
function ancorar(raiz) {
  const abertas = document.querySelectorAll('dialog[open]');
  const folha = abertas[abertas.length - 1];
  const destino = folha ?? document.body;
  if (raiz.parentElement !== destino) destino.append(raiz);
  if (folha && !comOuvinte.has(folha)) {
    comOuvinte.add(folha);
    folha.addEventListener('close', () => {
      if (!raiz.isConnected || raiz.parentElement === folha) ancorar(raiz);
    });
  }
}

/**
 * @param {{ texto: string, tom?: 'erro', acao?: { rotulo: string, aoClicar: () => void }, duracaoMs?: number }} opcoes
 * @returns {{ fechar: () => void }}
 */
export function avisar({ texto, tom, acao, duracaoMs = 5000 }) {
  atual?.fechar();
  const raiz = /** @type {HTMLElement} */ (document.getElementById('avisos'));
  ancorar(raiz);
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
