// Aba Placar: súmula de lançamento e as últimas partidas.
import { chaveDeNome } from '../../../compartilhado/nomes.js';
import { avisar } from '../componentes/aviso.js';
import { criarEditorPlacar } from '../componentes/editor-placar.js';
import { linhaPartida } from '../componentes/linha-partida.js';
import { mensagemDeErro } from '../erros.js';
import { gravarLocal, h, haptico, lerLocal, trocarFilhos } from '../util.js';

const JANELA_DUPLICIDADE_MS = 120_000;
const ULTIMAS = 3;

/** Competidores ordenados pelo uso mais recente, para as sugestões. */
function competidoresPorUso(visao) {
  const ultimo = new Map();
  for (const p of visao.partidas) {
    for (const id of [p.ladoA, p.ladoB]) if (!ultimo.has(id)) ultimo.set(id, p.jogadaEm);
  }
  return [...visao.competidores].sort(
    (a, b) => (ultimo.get(b.id) ?? 0) - (ultimo.get(a.id) ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** Partida igual, lançada por este membro há pouco: mesmo par, mesmo placar. */
function partidaIgualRecente(visao, v, nomeDoLado) {
  const agora = Date.now();
  const chaveA = chaveDeNome(v.ladoA.nome);
  const chaveB = chaveDeNome(v.ladoB.nome);
  return visao.partidas.some((p) => {
    if (p.criadoPor !== visao.eu.membroId || agora - p.criadaEm > JANELA_DUPLICIDADE_MS) return false;
    const a = chaveDeNome(nomeDoLado(p.ladoA));
    const b = chaveDeNome(nomeDoLado(p.ladoB));
    const mesmaOrdem = a === chaveA && b === chaveB && p.placarA === v.placarA && p.placarB === v.placarB;
    const invertida = a === chaveB && b === chaveA && p.placarA === v.placarB && p.placarB === v.placarA;
    return mesmaOrdem || invertida;
  });
}

/**
 * @param {{ resenhaId: string, controlador: any, abrirPartida: (p: any) => void, irHistorico: () => void, nomeDoLado: (id: string) => string, nomeDoMembro: (id: string | null) => string }} contexto
 */
export function criarAbaPlacar({ resenhaId, controlador, abrirPartida, irHistorico, nomeDoLado, nomeDoMembro }) {
  const chaveModalidade = `partidou:modalidade:${resenhaId}`;
  let visao = controlador.visao();
  let confirmandoDuplicata = false;
  let trava = false;
  let novaId = null;

  const editor = criarEditorPlacar({
    modalidadeInicial: lerLocal(chaveModalidade, null),
    aoMudar: () => {
      confirmandoDuplicata = false;
      atualizarAcao();
    },
  });

  const dica = h('p', { class: 'acao-lancar-dica', role: 'status' });
  const botao = h(
    'button',
    { type: 'button', class: 'btn btn-primario btn-grande btn-bloco', onClick: () => lancar(false) },
    'Lançar partida',
  );
  const confirmacao = h(
    'div',
    { class: 'acao-dupla', hidden: true },
    h('button', { type: 'button', class: 'btn btn-grande', onClick: cancelarDuplicata }, 'Cancelar'),
    h(
      'button',
      { type: 'button', class: 'btn btn-primario btn-grande', onClick: () => lancar(true) },
      'Lançar mesmo assim',
    ),
  );
  const acao = h('div', { class: 'acao-lancar' }, dica, botao, confirmacao);
  const recentes = h('div', { class: 'secao' });
  const el = h('div', { class: 'tela' }, editor.el, acao, recentes);

  function atualizarAcao() {
    const s = editor.situacao();
    const semAcesso = visao.sync.estado === 'sem-acesso';
    botao.hidden = confirmandoDuplicata;
    confirmacao.hidden = !confirmandoDuplicata;
    botao.setAttribute('aria-disabled', String(!s.valido || semAcesso));
    if (confirmandoDuplicata) {
      trocarFilhos(dica, 'Partida igual lançada há instantes.');
    } else if (semAcesso) {
      trocarFilhos(dica, 'Acesso à resenha encerrado neste aparelho.');
    } else if (s.faltaPlacar) {
      trocarFilhos(
        dica,
        'Placar não definido. ',
        h(
          'button',
          { type: 'button', class: 'btn btn-texto', onClick: () => editor.confirmarZeroZero() },
          'Registrar 0 x 0',
        ),
      );
    } else {
      trocarFilhos(dica, s.motivo ?? '');
    }
  }

  function cancelarDuplicata() {
    confirmandoDuplicata = false;
    atualizarAcao();
  }

  async function lancar(forcar) {
    if (trava || visao.sync.estado === 'sem-acesso') return;
    const s = editor.situacao();
    if (!s.valido) return;
    const v = editor.valores();
    if (!forcar && partidaIgualRecente(visao, v, nomeDoLado)) {
      confirmandoDuplicata = true;
      atualizarAcao();
      return;
    }
    trava = true;
    setTimeout(() => (trava = false), 700);
    try {
      const { partidaId } = await controlador.lancar(v);
      novaId = partidaId;
      gravarLocal(chaveModalidade, v.modalidade);
      confirmandoDuplicata = false;
      editor.novaPartida();
      haptico();
      avisar({
        texto: 'Partida lançada.',
        duracaoMs: 6000,
        acao: {
          rotulo: 'Desfazer',
          aoClicar: () =>
            controlador
              .excluir(partidaId)
              .catch((erro) => avisar({ texto: erro?.mensagem ?? 'Falha ao desfazer.', tom: 'erro' })),
        },
      });
    } catch (erro) {
      avisar({ texto: mensagemDeErro(erro, 'Falha ao lançar a partida.'), tom: 'erro' });
    }
  }

  function desenharRecentes() {
    const ultimas = visao.partidas.slice(0, ULTIMAS);
    const contexto = { nomeDoLado, nomeDoMembro, aoAbrir: abrirPartida };
    trocarFilhos(
      recentes,
      h(
        'div',
        { class: 'secao-titulo' },
        'Últimas partidas',
        ultimas.length > 0 &&
          h('button', { type: 'button', class: 'btn btn-texto', onClick: irHistorico }, 'Ver histórico'),
      ),
      ultimas.length === 0
        ? h(
            'div',
            { class: 'vazio' },
            h('p', { class: 'vazio-titulo' }, 'Nenhuma partida lançada'),
            h('p', { class: 'apoio' }, 'As partidas lançadas aparecem aqui e no histórico.'),
          )
        : h(
            'div',
            { class: 'dia' },
            ultimas.map((p) => linhaPartida(p, { ...contexto, nova: p.id === novaId })),
          ),
    );
    // A animação de entrada vale uma vez: nas próximas atualizações a linha já é conhecida.
    if (ultimas.some((p) => p.id === novaId)) novaId = null;
  }

  return {
    el,
    /** @param {any} nova */
    atualizar(nova) {
      visao = nova;
      editor.definirCompetidores(competidoresPorUso(nova));
      desenharRecentes();
      atualizarAcao();
    },
    focar: () => editor.focarLadoA(),
  };
}
