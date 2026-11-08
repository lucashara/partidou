// Apresentação de primeira visita e ajuda do cabeçalho: o mesmo conteúdo curto.
import { abrirFolha } from '../componentes/folha.js';
import { gravarLocal, h, lerLocal } from '../util.js';

const CHAVE_INTRO = 'partidou:apresentacao';

const ETAPAS = [
  ['Criar a resenha', 'A resenha é o espaço permanente do grupo. Basta um nome e o apelido de quem cria.'],
  [
    'Convidar o grupo',
    'O link de convite abre a resenha direto. Quem entra escolhe um apelido, sem cadastro nem senha.',
  ],
  [
    'Registrar o resultado',
    'Informar os dois lados, ajustar o placar e lançar. Funciona sem internet e sincroniza depois.',
  ],
  [
    'Consultar',
    'O histórico organiza as partidas por dia. Geral reúne a classificação, os confrontos e a maior diferença.',
  ],
];

export function abrirAjuda({ primeiraVez = false } = {}) {
  let folha;
  const lista = h(
    'ol',
    { class: 'etapas' },
    ETAPAS.map(([titulo, texto]) => h('li', { class: 'etapa' }, h('strong', null, titulo), h('span', null, texto))),
  );
  const nota = h(
    'p',
    { class: 'apoio' },
    'Cada aparelho guarda o próprio acesso. A chave de recuperação do criador permite retomar a resenha em outro aparelho.',
  );
  const botao = h(
    'button',
    { type: 'button', class: 'btn btn-primario btn-grande btn-bloco', autofocus: true, onClick: () => folha.fechar() },
    primeiraVez ? 'Começar' : 'Entendi',
  );
  folha = abrirFolha({
    titulo: primeiraVez ? 'Jogou? Registrou.' : 'Como funciona',
    corpo: [lista, nota, botao],
    aoFechar: () => gravarLocal(CHAVE_INTRO, true),
  });
}

/** Mostra a apresentação uma única vez por aparelho. */
export function mostrarApresentacaoSePreciso() {
  if (lerLocal(CHAVE_INTRO, false)) return;
  abrirAjuda({ primeiraVez: true });
}
