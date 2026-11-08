// Tela da resenha: cabeçalho, quatro abas e o controlador de dados da resenha aberta.
import { criarAbaAjustes } from '../abas/ajustes.js';
import { criarAbaGeral } from '../abas/geral.js';
import { criarAbaHistorico } from '../abas/historico.js';
import { criarAbaPlacar } from '../abas/placar.js';
import { avisar } from '../componentes/aviso.js';
import { criarIndicadorSync, desenharTopo } from '../componentes/topo.js';
import { repositorio } from '../dados/repositorio-navegador.js';
import { mensagemDeErro } from '../erros.js';
import { abrirFolhaPartida } from '../folhas/partida.js';
import { icone } from '../icones.js';
import { caminhoResenha, substituir } from '../roteador.js';
import { h, trocarFilhos } from '../util.js';

/** @type {{ id: string, rotulo: string, icone: Parameters<typeof icone>[0] }[]} */
const ABAS = [
  { id: 'placar', rotulo: 'Placar', icone: 'placar' },
  { id: 'historico', rotulo: 'Histórico', icone: 'historico' },
  { id: 'geral', rotulo: 'Geral', icone: 'geral' },
  { id: 'ajustes', rotulo: 'Ajustes', icone: 'opcoes' },
];

/** Telas montadas por resenha: o controlador só fecha quando a última sai. */
const usos = new Map();

const esqueleto = () =>
  h(
    'div',
    { class: 'tela' },
    h('div', { class: 'esqueleto esqueleto-bloco' }),
    h('div', { class: 'esqueleto esqueleto-linha' }),
    h('div', { class: 'esqueleto esqueleto-linha' }),
  );

/** @param {{ tela: 'resenha', id: string, aba: string }} rota */
export function telaResenha(raiz, rota) {
  const id = rota.id;
  const navegacao = /** @type {HTMLElement} */ (document.getElementById('abas'));
  let ativo = true;
  /** @type {any} */
  let controlador = null;
  /** @type {import('../dados/tipos.js').Visao} */
  let visao;
  let abaAtual = rota.aba;
  /** @type {string | null} */
  let nomeNoTopo = null;
  const desassinar = [];
  const partes = {};
  const links = new Map();
  const paineis = new Map();
  const sync = criarIndicadorSync();
  usos.set(id, (usos.get(id) ?? 0) + 1);

  desenharTopo({ titulo: 'Resenha', voltarPara: '#/' });
  trocarFilhos(raiz, esqueleto());

  const nomeDoLado = (ladoId) => visao.competidores.find((c) => c.id === ladoId)?.nome ?? 'Sem nome';
  const nomeDoMembro = (membroId) =>
    membroId ? (visao.membros.find((m) => m.id === membroId)?.apelido ?? 'Ex-participante') : 'Ex-participante';
  const irAba = (aba) => substituir(caminhoResenha(id, aba));

  function mostrarMensagem(titulo, apoio) {
    desenharTopo({ titulo: 'Resenha', voltarPara: '#/' });
    trocarFilhos(
      raiz,
      h(
        'div',
        { class: 'tela' },
        h(
          'div',
          { class: 'vazio' },
          h('p', { class: 'vazio-titulo' }, titulo),
          h('p', { class: 'apoio' }, apoio),
          h('a', { class: 'btn btn-primario', href: '#/' }, 'Voltar ao início'),
        ),
      ),
    );
  }

  async function iniciar() {
    let aberto;
    try {
      aberto = await repositorio.abrir(id);
    } catch (erro) {
      if (ativo) mostrarMensagem('Falha ao abrir a resenha', mensagemDeErro(erro, 'Tentar novamente em instantes.'));
      return;
    }
    if (!ativo) {
      if (!usos.has(id)) aberto?.fechar();
      return;
    }
    if (!aberto) {
      mostrarMensagem(
        'Resenha não encontrada',
        'Esta resenha não está neste aparelho. Entrar com um convite ou com a chave de recuperação.',
      );
      return;
    }
    controlador = aberto;
    visao = controlador.visao();
    montar();
  }

  function montar() {
    const abrirPartida = (partida) =>
      abrirFolhaPartida({ partida, visao, controlador, nomeDoLado, nomeDoMembro, competidores: visao.competidores });
    partes.placar = criarAbaPlacar({
      resenhaId: id,
      controlador,
      abrirPartida,
      irHistorico: () => irAba('historico'),
      nomeDoLado,
      nomeDoMembro,
    });
    partes.historico = criarAbaHistorico({ abrirPartida, irPlacar: () => irAba('placar'), nomeDoLado, nomeDoMembro });
    partes.geral = criarAbaGeral({ abrirPartida, nomeDoLado, nomeDoMembro, irPlacar: () => irAba('placar') });
    partes.ajustes = criarAbaAjustes({
      controlador,
      aoEncerrar: (mensagem) => {
        substituir('#/');
        avisar({ texto: mensagem });
      },
    });

    const remover = h(
      'button',
      {
        type: 'button',
        class: 'btn',
        onClick: async () => {
          await repositorio.esquecerResenha(id);
          substituir('#/');
          avisar({ texto: 'Resenha removida deste aparelho.' });
        },
      },
      'Remover do aparelho',
    );
    const faixa = h(
      'div',
      { class: 'tela', hidden: true },
      h(
        'div',
        { class: 'faixa', dataset: { tom: 'erro' }, role: 'alert' },
        h('p', null, 'Acesso encerrado neste aparelho. Novos lançamentos ficam bloqueados.'),
        remover,
      ),
    );
    partes.faixa = faixa;

    const secoes = ABAS.map((aba) => {
      const painel = h('section', { 'aria-labelledby': `aba-${aba.id}`, hidden: true }, partes[aba.id].el);
      paineis.set(aba.id, painel);
      return painel;
    });
    trocarFilhos(raiz, faixa, ...secoes);
    raiz.classList.add('com-abas');

    trocarFilhos(
      navegacao,
      ABAS.map((aba) => {
        const link = h(
          'a',
          {
            class: 'aba',
            id: `aba-${aba.id}`,
            href: caminhoResenha(id, aba.id),
            onClick: (e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              irAba(aba.id);
            },
          },
          icone(aba.icone, { tamanho: 22 }),
          aba.rotulo,
        );
        links.set(aba.id, link);
        return link;
      }),
    );
    navegacao.setAttribute('aria-label', 'Seções da resenha');
    navegacao.hidden = false;

    desassinar.push(
      controlador.assinar((nova) => {
        visao = nova;
        atualizar();
      }),
      controlador.assinarAvisos((aviso) => {
        if (aviso.tipo === 'sem-acesso') return;
        avisar({ texto: aviso.mensagem, tom: aviso.tipo === 'rejeitada' ? 'erro' : undefined, duracaoMs: 7000 });
      }),
    );
    atualizarAbas();
    atualizar();
  }

  function atualizar() {
    if (!ativo || !controlador) return;
    sync.atualizar(visao.sync);
    partes.faixa.hidden = visao.sync.estado !== 'sem-acesso';
    if (nomeNoTopo !== visao.resenha.nome) {
      nomeNoTopo = visao.resenha.nome;
      desenharTopo({ titulo: nomeNoTopo, voltarPara: '#/', extras: [sync.el] });
    }
    for (const aba of ABAS) partes[aba.id].atualizar(visao);
  }

  function atualizarAbas() {
    for (const aba of ABAS) {
      const atual = aba.id === abaAtual;
      paineis.get(aba.id).hidden = !atual;
      if (atual) links.get(aba.id).setAttribute('aria-current', 'page');
      else links.get(aba.id).removeAttribute('aria-current');
    }
    partes.geral.definirVisivel(abaAtual === 'geral');
  }

  iniciar();

  return {
    navegar(novaRota) {
      abaAtual = novaRota.aba;
      if (controlador) atualizarAbas();
      scrollTo(0, 0);
    },
    desmontar() {
      ativo = false;
      for (const parar of desassinar) parar();
      navegacao.hidden = true;
      navegacao.replaceChildren();
      raiz.classList.remove('com-abas');
      const restantes = (usos.get(id) ?? 1) - 1;
      if (restantes <= 0) {
        usos.delete(id);
        controlador?.fechar();
      } else {
        usos.set(id, restantes);
      }
    },
  };
}
