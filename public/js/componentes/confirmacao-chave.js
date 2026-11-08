// Confirmação de que o segredo foi guardado: a caixa libera o botão que abre a resenha.
import { h } from '../util.js';

/** @param {{ aoAbrir: () => void }} opcoes */
export function confirmacaoChave({ aoAbrir }) {
  const caixa = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox' }));
  const botao = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primario btn-grande btn-bloco',
      'aria-disabled': 'true',
      onClick: () => {
        if (caixa.checked) aoAbrir();
      },
    },
    'Abrir resenha',
  );
  caixa.addEventListener('change', () => botao.setAttribute('aria-disabled', String(!caixa.checked)));
  return h('div', { class: 'confirmacao-chave' }, h('label', { class: 'caixa' }, caixa, 'Chave guardada'), botao);
}
