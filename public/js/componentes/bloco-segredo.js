// Valor que o sistema mostra uma vez (convite, código) com copiar e, quando existe, compartilhar.
import { icone } from '../icones.js';
import { copiarTexto, h } from '../util.js';
import { avisar } from './aviso.js';

/**
 * @param {{ marca?: string, rotulo: string, valor: string, exibicao?: string, apoio?: string, compartilhavel?: { title: string, text?: string, url?: string } }} opcoes
 */
export function blocoSegredo({ marca, rotulo, valor, exibicao, apoio, compartilhavel }) {
  const copiar = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onClick: async () =>
        avisar({
          texto: (await copiarTexto(valor))
            ? `${rotulo} copiado.`
            : 'Cópia indisponível. Selecionar e copiar manualmente.',
          tom: undefined,
        }),
    },
    icone('copiar', { tamanho: 20 }),
    'Copiar',
  );
  const podeCompartilhar = compartilhavel && typeof navigator.share === 'function';
  const compartilhar =
    podeCompartilhar &&
    h(
      'button',
      {
        type: 'button',
        class: 'btn',
        onClick: () => navigator.share(compartilhavel).catch(() => {}),
      },
      icone('compartilhar', { tamanho: 20 }),
      'Compartilhar',
    );
  return h(
    'div',
    { class: 'secao', dataset: marca ? { segredo: marca } : {} },
    h('span', { class: 'campo-rotulo' }, rotulo),
    h('p', { class: 'codigo-bloco numeros' }, exibicao ?? valor),
    apoio && h('p', { class: 'apoio' }, apoio),
    h('div', { class: 'acao-dupla' }, copiar, compartilhar || null),
  );
}
