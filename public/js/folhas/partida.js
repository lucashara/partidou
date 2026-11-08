// Folha de uma partida: edição e exclusão para quem pode; leitura para os demais.
import { avisar } from '../componentes/aviso.js';
import { criarEditorPlacar } from '../componentes/editor-placar.js';
import { abrirFolha } from '../componentes/folha.js';
import { hora, rotuloDia } from '../formatos.js';
import { h } from '../util.js';

const mensagemDe = (erro, padrao) => (erro?.mensagem ? erro.mensagem : padrao);

/**
 * @param {{ partida: any, visao: any, controlador: any, nomeDoLado: (id: string) => string, nomeDoMembro: (id: string | null) => string, competidores: { id: string, nome: string }[] }} contexto
 */
export function abrirFolhaPartida({ partida, visao, controlador, nomeDoLado, nomeDoMembro, competidores }) {
  const lancou = nomeDoMembro(partida.criadoPor);
  const editou = partida.editadoPor ? nomeDoMembro(partida.editadoPor) : null;
  const quando = `${rotuloDia(partida.jogadaEm)}, ${hora(partida.jogadaEm)}`;
  const autoria = h(
    'p',
    { class: 'apoio' },
    `Lançada por ${lancou} · ${quando}`,
    editou ? ` · Editada por ${editou}` : '',
    partida.pendente ? ' · Aguardando sincronização' : '',
  );

  if (!partida.podeEditar || visao.sync.estado === 'sem-acesso') {
    const lados = h(
      'p',
      { class: 'titulo-tela numeros' },
      `${nomeDoLado(partida.ladoA)} ${partida.placarA} x ${partida.placarB} ${nomeDoLado(partida.ladoB)}`,
    );
    abrirFolha({
      titulo: 'Partida',
      corpo: [
        lados,
        autoria,
        h('p', { class: 'apoio' }, 'Somente quem lançou a partida ou o criador da resenha pode alterá-la.'),
      ],
    });
    return;
  }

  let folha;
  // Revisão em que a folha abriu: o envio é recusado se outro aparelho alterou a partida depois disso.
  let revBase = partida.rev;
  const editor = criarEditorPlacar({ aoMudar: atualizarBotao });
  editor.definirCompetidores(competidores);
  const carregarNoEditor = (/** @type {any} */ p) =>
    editor.carregar({
      ladoA: { id: p.ladoA, nome: nomeDoLado(p.ladoA) },
      ladoB: { id: p.ladoB, nome: nomeDoLado(p.ladoB) },
      placarA: p.placarA,
      placarB: p.placarB,
      penaltis: p.penaltisA != null ? { a: p.penaltisA, b: p.penaltisB } : null,
      modalidade: p.modalidade ?? null,
    });
  carregarNoEditor(partida);

  const dica = h('p', { class: 'acao-lancar-dica', role: 'status' });
  const salvar = h(
    'button',
    { type: 'button', class: 'btn btn-primario btn-grande btn-bloco', onClick: guardar },
    'Salvar alterações',
  );
  const excluir = h(
    'button',
    { type: 'button', class: 'btn btn-perigo btn-bloco', onClick: apagar },
    'Excluir partida',
  );

  function atualizarBotao() {
    const s = editor.situacao();
    salvar.setAttribute('aria-disabled', String(!s.valido));
    dica.textContent = s.valido ? '' : (s.motivo ?? '');
  }

  async function guardar() {
    const s = editor.situacao();
    if (!s.valido) return;
    const v = editor.valores();
    try {
      await controlador.editar(
        partida.id,
        {
          ladoA: v.ladoA,
          ladoB: v.ladoB,
          placarA: v.placarA,
          placarB: v.placarB,
          penaltis: v.penaltis,
          modalidade: v.modalidade,
        },
        { revBase },
      );
      folha.fechar();
      avisar({ texto: 'Partida atualizada.' });
    } catch (erro) {
      if (/** @type {any} */ (erro)?.codigo === 'CONFLITO_REVISAO') mostrarConflito(erro);
      else avisar({ texto: mensagemDe(erro, 'Falha ao salvar a partida.'), tom: 'erro' });
    }
  }

  /** Recarrega a folha com os valores atuais da partida, sem gravar nada. */
  function mostrarConflito(/** @type {any} */ erro) {
    const atual = controlador.visao().partidas.find((/** @type {any} */ p) => p.id === partida.id);
    if (!atual) {
      folha.fechar();
      avisar({ texto: 'Partida excluída em outro aparelho.', tom: 'erro' });
      return;
    }
    revBase = atual.rev;
    carregarNoEditor(atual);
    avisar({ texto: erro.mensagem, tom: 'erro' });
  }

  async function apagar() {
    try {
      const { desfazer } = await controlador.excluir(partida.id);
      folha.fechar();
      avisar({
        texto: 'Partida excluída.',
        duracaoMs: 7000,
        acao: {
          rotulo: 'Desfazer',
          aoClicar: () =>
            desfazer().catch((erro) =>
              avisar({ texto: mensagemDe(erro, 'Falha ao restaurar a partida.'), tom: 'erro' }),
            ),
        },
      });
    } catch (erro) {
      avisar({ texto: mensagemDe(erro, 'Falha ao excluir a partida.'), tom: 'erro' });
    }
  }

  folha = abrirFolha({ titulo: 'Editar partida', corpo: [editor.el, autoria, dica, salvar, excluir] });
  atualizarBotao();
}
