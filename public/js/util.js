// Utilitários de DOM e de preferências locais.

/**
 * Cria um elemento. Propriedades 'on*' viram listeners; 'class' e 'dataset' têm tratamento próprio.
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...any} filhos
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props ?? {})) {
    if (valor == null || valor === false) continue;
    if (chave === 'class') el.className = valor;
    else if (chave === 'dataset') Object.assign(el.dataset, valor);
    else if (chave.startsWith('on')) el.addEventListener(chave.slice(2).toLowerCase(), valor);
    else if (chave in el && !chave.includes('-') && chave !== 'list') /** @type {any} */ (el)[chave] = valor;
    else el.setAttribute(chave, valor === true ? '' : valor);
  }
  el.append(...filhos.flat(Infinity).filter((f) => f != null && f !== false));
  return el;
}

/** Remove os filhos e acrescenta os novos. */
export function trocarFilhos(pai, ...filhos) {
  pai.replaceChildren(...filhos.flat(Infinity).filter((f) => f != null && f !== false));
}

export function lerLocal(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto == null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

export function gravarLocal(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* modo privado ou cota: a preferência simplesmente não persiste */
  }
}

/** Vibração curta onde existe (Android); sem suporte, sem feedback tátil. */
export function haptico() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* sem suporte */
  }
}

/** Copia para a área de transferência; devolve se conseguiu. */
export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** Iniciais para a rubrica: até duas letras do apelido. */
export function iniciais(nome) {
  const partes = String(nome ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return '?';
  const letras = partes.length === 1 ? [...partes[0]].slice(0, 2) : [[...partes[0]][0], [...partes[1]][0]];
  return letras.join('').toLocaleUpperCase('pt-BR');
}

/** Recebe a função e só a executa depois de `ms` sem nova chamada. */
export function adiar(funcao, ms) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => funcao(...args), ms);
  };
}

/** Marca o botão como ocupado durante a ação (impede toque repetido) e restaura o texto no fim. */
export async function ocupar(botao, textoOcupado, acao) {
  if (botao.getAttribute('aria-disabled') === 'true') return undefined;
  const original = botao.textContent;
  botao.setAttribute('aria-disabled', 'true');
  botao.textContent = textoOcupado;
  try {
    return await acao();
  } finally {
    botao.removeAttribute('aria-disabled');
    botao.textContent = original;
  }
}
