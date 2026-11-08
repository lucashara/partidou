// Editor da súmula: dois lados com nome livre, placar final, pênaltis (só em empate) e modalidade.
// Serve ao lançamento e à edição; não conhece rede nem armazenamento.

import { aceitaPenaltis, MODALIDADES } from '../../../compartilhado/modalidades.js';
import { chaveDeNome, LIMITES, normalizarNome } from '../../../compartilhado/nomes.js';
import { icone } from '../icones.js';
import { h, trocarFilhos } from '../util.js';

const MAXIMO = LIMITES.placarMaximo;
const limitar = (n) => Math.min(MAXIMO, Math.max(0, n));
let contador = 0;

/**
 * @typedef {{ id?: string | null, nome: string }} LadoValor
 * @typedef {{ ladoA: LadoValor, ladoB: LadoValor, placarA: number, placarB: number, penaltis: { a: number, b: number } | null, modalidade: string | null }} ValoresPartida
 */

/** @param {{ aoMudar?: () => void, modalidadeInicial?: string | null }} [opcoes] */
export function criarEditorPlacar({ aoMudar = () => {}, modalidadeInicial = null } = {}) {
  /** @type {{ id: string, nome: string }[]} */
  let competidores = [];
  const estado = {
    lados: {
      a: { nome: '', id: /** @type {string | null} */ (null) },
      b: { nome: '', id: /** @type {string | null} */ (null) },
    },
    placar: { a: 0, b: 0 },
    tocado: false,
    penaltis: /** @type {{ a: number, b: number } | null} */ (null),
    modalidade: modalidadeInicial,
  };
  const refs = { a: montarLado('a'), b: montarLado('b') };
  const blocoPenaltis = h('div', { class: 'penaltis-bloco', hidden: true });
  let modoPenaltis = 'oculto';

  const seletor = /** @type {HTMLSelectElement} */ (
    h(
      'select',
      {
        id: `modalidade-${++contador}`,
        onChange: () => {
          estado.modalidade = seletor.value || null;
          renderPenaltis();
          aoMudar();
        },
      },
      h('option', { value: '' }, 'Não informada'),
      MODALIDADES.map((m) => h('option', { value: m.id, selected: m.id === estado.modalidade }, m.nome)),
    )
  );

  const el = h(
    'div',
    { class: 'sumula' },
    h('div', { class: 'linha-celulas' }, refs.a.celula, refs.b.celula),
    blocoPenaltis,
    h(
      'div',
      { class: 'celula modalidade-celula' },
      h('label', { class: 'celula-rotulo', for: seletor.id }, 'Modalidade'),
      seletor,
    ),
  );

  function montarLado(chave) {
    const rotulo = chave === 'a' ? 'Lado A' : 'Lado B';
    const idLista = `sugestoes-${++contador}`;
    let ativa = -1;
    /** @type {{ id?: string, nome: string, novo?: boolean }[]} */
    let opcoes = [];

    const entrada = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'campo-entrada',
        type: 'text',
        maxLength: LIMITES.competidor,
        placeholder: 'Jogador ou time',
        role: 'combobox',
        autocomplete: 'off',
        autocapitalize: 'words',
        spellcheck: false,
        enterKeyHint: 'next',
        'aria-label': `Nome do ${rotulo}`,
        'aria-autocomplete': 'list',
        'aria-expanded': 'false',
        'aria-controls': idLista,
        onInput: () => {
          estado.lados[chave].nome = entrada.value;
          estado.lados[chave].id = null;
          abrirLista();
          aoMudar();
        },
        onFocus: abrirLista,
        onBlur: () => setTimeout(fecharLista, 120),
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (lista.hidden) abrirLista();
            ativa = (ativa + (e.key === 'ArrowDown' ? 1 : -1) + opcoes.length) % Math.max(opcoes.length, 1);
            desenharLista();
          } else if (e.key === 'Enter' && ativa >= 0 && opcoes[ativa]) {
            e.preventDefault();
            escolher(opcoes[ativa]);
          } else if (e.key === 'Escape') {
            fecharLista();
          }
        },
      })
    );
    const lista = h('div', { class: 'sugestoes', role: 'listbox', id: idLista, hidden: true });

    function calcularOpcoes() {
      const outro = estado.lados[chave === 'a' ? 'b' : 'a'];
      const chaveOutro = chaveDeNome(outro.nome);
      const base = competidores.filter((c) => c.id !== outro.id && chaveDeNome(c.nome) !== chaveOutro);
      const k = chaveDeNome(estado.lados[chave].nome);
      const filtradas = (k ? base.filter((c) => chaveDeNome(c.nome).includes(k)) : base).slice(0, 6);
      const exata = k && base.some((c) => chaveDeNome(c.nome) === k);
      return [...filtradas, ...(k && !exata ? [{ nome: normalizarNome(estado.lados[chave].nome), novo: true }] : [])];
    }

    function desenharLista() {
      trocarFilhos(
        lista,
        opcoes.map((o, i) =>
          h(
            'button',
            {
              type: 'button',
              role: 'option',
              class: `sugestao${o.novo ? ' sugestao-novo' : ''}`,
              'aria-selected': String(i === ativa),
              onPointerdown: (e) => e.preventDefault(),
              onClick: () => escolher(o),
            },
            o.novo ? `Novo: ${o.nome}` : o.nome,
          ),
        ),
      );
    }

    function abrirLista() {
      opcoes = calcularOpcoes();
      ativa = -1;
      lista.hidden = opcoes.length === 0;
      entrada.setAttribute('aria-expanded', String(!lista.hidden));
      if (!lista.hidden) desenharLista();
    }

    function fecharLista() {
      lista.hidden = true;
      entrada.setAttribute('aria-expanded', 'false');
    }

    function escolher(opcao) {
      estado.lados[chave] = { nome: opcao.nome, id: opcao.novo ? null : (opcao.id ?? null) };
      entrada.value = opcao.nome;
      fecharLista();
      aoMudar();
    }

    const numeral = /** @type {HTMLInputElement} */ (
      h('input', {
        class: 'numeral numeros',
        type: 'text',
        inputMode: 'numeric',
        pattern: '[0-9]*',
        maxLength: 3,
        value: '0',
        enterKeyHint: 'done',
        'aria-label': `Placar do ${rotulo}`,
        onFocus: () => setTimeout(() => numeral.select(), 0),
        onInput: () => {
          const digitos = numeral.value.replace(/\D/g, '').slice(0, 3);
          numeral.value = digitos;
          definirPlacar(chave, digitos === '' ? 0 : Number(digitos), false);
        },
        onBlur: () => {
          numeral.value = String(estado.placar[chave]);
        },
        onKeyDown: (e) => {
          if (e.key === 'Enter') numeral.blur();
        },
      })
    );
    const menos = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-passo',
        'aria-label': `Diminuir placar do ${rotulo}`,
        onClick: () => definirPlacar(chave, estado.placar[chave] - 1),
      },
      icone('menos'),
    );
    const mais = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-passo',
        'aria-label': `Aumentar placar do ${rotulo}`,
        onClick: () => definirPlacar(chave, estado.placar[chave] + 1),
      },
      icone('mais'),
    );
    const celula = h(
      'div',
      { class: 'celula lado' },
      h('span', { class: 'celula-rotulo' }, rotulo),
      h('div', { class: 'lado-nome' }, entrada, lista),
      numeral,
      h('div', { class: 'passos' }, menos, mais),
    );
    return { celula, entrada, numeral };
  }

  function definirPlacar(chave, valor, atualizarCampo = true) {
    estado.placar[chave] = limitar(valor);
    if (atualizarCampo) refs[chave].numeral.value = String(estado.placar[chave]);
    estado.tocado = true;
    renderPenaltis();
    aoMudar();
  }

  function definirPenaltis(chave, valor, campo) {
    if (!estado.penaltis) return;
    estado.penaltis[chave] = limitar(valor);
    if (campo) campo.value = String(estado.penaltis[chave]);
    atualizarResumoPenaltis();
    aoMudar();
  }

  let resumoPenaltis = h('p', { class: 'apoio', role: 'status' });
  function atualizarResumoPenaltis() {
    const p = estado.penaltis;
    if (!p || p.a === p.b) {
      resumoPenaltis.textContent = 'Os pênaltis não podem terminar empatados.';
      return;
    }
    const nome = normalizarNome(estado.lados[p.a > p.b ? 'a' : 'b'].nome) || (p.a > p.b ? 'Lado A' : 'Lado B');
    resumoPenaltis.textContent = `${nome} vence nos pênaltis.`;
  }

  function montarPenaltis() {
    const campos = ['a', 'b'].map((chave) => {
      const rotulo = chave === 'a' ? 'Lado A' : 'Lado B';
      const numeral = /** @type {HTMLInputElement} */ (
        h('input', {
          class: 'numeral numeral-pequeno numeros',
          type: 'text',
          inputMode: 'numeric',
          pattern: '[0-9]*',
          maxLength: 3,
          value: String(estado.penaltis?.[chave] ?? 0),
          'aria-label': `Pênaltis do ${rotulo}`,
          onFocus: () => setTimeout(() => numeral.select(), 0),
          onInput: () => {
            numeral.value = numeral.value.replace(/\D/g, '').slice(0, 3);
            definirPenaltis(chave, numeral.value === '' ? 0 : Number(numeral.value), null);
          },
          onBlur: () => {
            numeral.value = String(estado.penaltis?.[chave] ?? 0);
          },
        })
      );
      const passo = (delta, icone_) =>
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-passo btn-passo-compacto',
            'aria-label': `${delta < 0 ? 'Diminuir' : 'Aumentar'} pênaltis do ${rotulo}`,
            onClick: () => definirPenaltis(chave, (estado.penaltis?.[chave] ?? 0) + delta, numeral),
          },
          icone(icone_),
        );
      return h(
        'div',
        { class: 'celula lado' },
        numeral,
        h('div', { class: 'passos' }, passo(-1, 'menos'), passo(1, 'mais')),
      );
    });
    return h('div', { class: 'linha-celulas' }, campos);
  }

  function renderPenaltis() {
    const permitido = estado.placar.a === estado.placar.b && estado.tocado && aceitaPenaltis(estado.modalidade);
    if (!permitido) estado.penaltis = null;
    const novoModo = !permitido ? 'oculto' : estado.penaltis ? 'ativo' : 'vazio';
    if (novoModo === modoPenaltis) return;
    modoPenaltis = novoModo;
    blocoPenaltis.hidden = novoModo === 'oculto';
    if (novoModo === 'vazio') {
      trocarFilhos(
        blocoPenaltis,
        h(
          'div',
          { class: 'placar-penaltis-vazio' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-texto',
              onClick: () => {
                estado.penaltis = { a: 0, b: 0 };
                renderPenaltis();
                aoMudar();
              },
            },
            icone('mais', { tamanho: 18 }),
            'Houve pênaltis',
          ),
        ),
      );
    } else if (novoModo === 'ativo') {
      resumoPenaltis = h('p', { class: 'apoio', role: 'status' });
      atualizarResumoPenaltis();
      trocarFilhos(
        blocoPenaltis,
        h(
          'div',
          { class: 'cabecalho-penaltis' },
          h('span', { class: 'celula-rotulo' }, 'Pênaltis'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-texto',
              onClick: () => {
                estado.penaltis = null;
                renderPenaltis();
                aoMudar();
              },
            },
            'Remover',
          ),
        ),
        montarPenaltis(),
        h('div', { class: 'celula' }, resumoPenaltis),
      );
    }
  }

  const api = {
    el,
    /** @param {{ id: string, nome: string }[]} lista */
    definirCompetidores(lista) {
      competidores = lista;
    },
    /** @returns {ValoresPartida} */
    valores() {
      const lado = (c) => ({ id: estado.lados[c].id, nome: normalizarNome(estado.lados[c].nome) });
      return {
        ladoA: lado('a'),
        ladoB: lado('b'),
        placarA: estado.placar.a,
        placarB: estado.placar.b,
        penaltis: estado.penaltis ? { ...estado.penaltis } : null,
        modalidade: estado.modalidade,
      };
    },
    /** @returns {{ valido: boolean, motivo: string | null, faltaPlacar: boolean }} */
    situacao() {
      const nomeA = normalizarNome(estado.lados.a.nome);
      const nomeB = normalizarNome(estado.lados.b.nome);
      if (!nomeA || !nomeB) return { valido: false, motivo: 'Informe os dois lados.', faltaPlacar: false };
      const igual =
        (estado.lados.a.id && estado.lados.a.id === estado.lados.b.id) || chaveDeNome(nomeA) === chaveDeNome(nomeB);
      if (igual) return { valido: false, motivo: 'Os lados precisam ser diferentes.', faltaPlacar: false };
      if (!estado.tocado) return { valido: false, motivo: 'Defina o placar.', faltaPlacar: true };
      if (estado.penaltis && estado.penaltis.a === estado.penaltis.b)
        return { valido: false, motivo: 'Os pênaltis não podem terminar empatados.', faltaPlacar: false };
      return { valido: true, motivo: null, faltaPlacar: false };
    },
    /** Confirma 0 x 0 como resultado real. */
    confirmarZeroZero() {
      estado.tocado = true;
      renderPenaltis();
      aoMudar();
    },
    /** Zera o placar e os pênaltis, mantendo lados e modalidade (revanche). */
    novaPartida() {
      estado.placar = { a: 0, b: 0 };
      estado.tocado = false;
      estado.penaltis = null;
      refs.a.numeral.value = '0';
      refs.b.numeral.value = '0';
      renderPenaltis();
      aoMudar();
    },
    /** Carrega uma partida existente para edição. */
    carregar(partida) {
      estado.lados.a = { nome: partida.ladoA.nome, id: partida.ladoA.id ?? null };
      estado.lados.b = { nome: partida.ladoB.nome, id: partida.ladoB.id ?? null };
      refs.a.entrada.value = partida.ladoA.nome;
      refs.b.entrada.value = partida.ladoB.nome;
      estado.placar = { a: partida.placarA, b: partida.placarB };
      refs.a.numeral.value = String(partida.placarA);
      refs.b.numeral.value = String(partida.placarB);
      estado.tocado = true;
      estado.penaltis = partida.penaltis ? { ...partida.penaltis } : null;
      estado.modalidade = partida.modalidade ?? null;
      seletor.value = estado.modalidade ?? '';
      modoPenaltis = 'forcar';
      renderPenaltis();
    },
    /** Modalidade escolhida agora (para lembrar na próxima partida). */
    modalidade: () => estado.modalidade,
    focarLadoA: () => refs.a.entrada.focus(),
  };
  return api;
}
