// Campo de formulário com rótulo, dica e mensagem de erro ligados por ARIA.
import { h } from '../util.js';

let contador = 0;

/**
 * Mantém o botão desabilitado enquanto algum campo estiver vazio, para não oferecer a ação principal sem dados.
 * @param {HTMLElement} botao
 * @param {{ entrada: HTMLInputElement }[]} campos
 */
export function exigirPreenchidos(botao, campos) {
  const atualizar = () =>
    botao.toggleAttribute(
      'disabled',
      campos.some((campo) => !campo.entrada.value.trim()),
    );
  for (const campo of campos) campo.entrada.addEventListener('input', atualizar);
  atualizar();
}

/**
 * @param {{ rotulo: string, nome?: string, tipo?: string, valor?: string, dica?: string, maximo?: number, modo?: string, autocomplete?: string, classeEntrada?: string, obrigatorio?: boolean, aoMudar?: (valor: string) => void }} opcoes
 * @returns {{ el: HTMLElement, entrada: HTMLInputElement, definirErro: (mensagem: string | null) => void }}
 */
export function criarCampo({
  rotulo,
  nome,
  tipo = 'text',
  valor = '',
  dica,
  maximo,
  modo,
  autocomplete = 'off',
  classeEntrada = '',
  obrigatorio = false,
  aoMudar,
}) {
  const id = `campo-${++contador}`;
  const idMensagem = `${id}-msg`;
  const idDica = `${id}-dica`;
  const entrada = /** @type {HTMLInputElement} */ (
    h('input', {
      id,
      name: nome,
      type: tipo,
      value: valor,
      class: `campo-entrada ${classeEntrada}`.trim(),
      maxLength: maximo,
      inputMode: modo,
      autocomplete,
      autocapitalize: 'off',
      spellcheck: false,
      required: obrigatorio,
      'aria-describedby': dica ? `${idDica} ${idMensagem}` : idMensagem,
      onInput: () => aoMudar?.(entrada.value),
    })
  );
  const mensagem = h('p', { class: 'campo-mensagem', id: idMensagem, role: 'alert' });
  const el = h(
    'div',
    { class: 'campo' },
    h('label', { class: 'campo-rotulo', for: id }, rotulo),
    entrada,
    dica && h('p', { class: 'campo-dica', id: idDica }, dica),
    mensagem,
  );

  return {
    el,
    entrada,
    definirErro(texto) {
      mensagem.textContent = texto ?? '';
      if (texto) {
        el.dataset.invalido = '';
        entrada.setAttribute('aria-invalid', 'true');
      } else {
        delete el.dataset.invalido;
        entrada.removeAttribute('aria-invalid');
      }
    },
  };
}
