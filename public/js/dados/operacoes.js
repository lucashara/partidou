import { modalidadePorId } from '../../../compartilhado/modalidades.js';
import { chaveDeNome, LIMITES, validarNome } from '../../../compartilhado/nomes.js';
import { validarPlacar } from '../../../compartilhado/placar.js';
import { ErroLocal } from './api.js';

const JOGADA_MINIMA_MS = Date.UTC(2000, 0, 1);
const FOLGA_FUTURO_MS = 24 * 60 * 60 * 1000;
const CAMPOS_SIMPLES = /** @type {const} */ (['placarA', 'placarB', 'modalidade', 'jogadaEm']);

/**
 * Resolve o lado contra os competidores conhecidos (por id, depois por chave do nome). Nome novo ganha id agora,
 * para que a operação e a visão enxerguem o mesmo competidor.
 * @param {import('./tipos.js').LadoCorpo | undefined} lado
 * @param {'ladoA' | 'ladoB'} campo
 * @param {{ id: string, nome: string }[]} competidores
 * @param {() => string} novoId
 * @returns {{ id: string, nome: string }}
 */
function resolverLado(lado, campo, competidores, novoId) {
  const nome = validarNome(lado?.nome, LIMITES.competidor);
  if (!nome.ok) throw new ErroLocal('NOME_INVALIDO', nome.mensagem, campo);
  const chave = chaveDeNome(nome.valor);
  const existente =
    (lado?.id ? competidores.find((c) => c.id === lado.id) : undefined) ??
    competidores.find((c) => chaveDeNome(c.nome) === chave);
  if (existente) return { id: existente.id, nome: existente.nome };
  return { id: lado?.id ?? novoId(), nome: nome.valor };
}

/** @param {{ id: string, nome: string }} a @param {{ id: string, nome: string }} b */
function mesmoCompetidor(a, b) {
  return a.id === b.id || chaveDeNome(a.nome) === chaveDeNome(b.nome);
}

/** @param {any} resultado */
function validarResultado({ placarA, placarB, penaltis, modalidade }) {
  if (modalidade !== null && modalidade !== undefined && !modalidadePorId(modalidade)) {
    throw new ErroLocal('MODALIDADE_INVALIDA', 'Modalidade inválida.', 'modalidade');
  }
  const r = validarPlacar({ placarA, placarB, penaltisA: penaltis?.a, penaltisB: penaltis?.b, modalidade });
  if (!r.ok) throw new ErroLocal(r.codigo, r.mensagem, r.campo);
}

/** @param {unknown} jogadaEm @param {number} agora */
function validarJogadaEm(jogadaEm, agora) {
  if (
    !Number.isInteger(jogadaEm) ||
    /** @type {number} */ (jogadaEm) < JOGADA_MINIMA_MS ||
    /** @type {number} */ (jogadaEm) > agora + FOLGA_FUTURO_MS
  ) {
    throw new ErroLocal('DATA_INVALIDA', 'Data da partida fora do intervalo permitido.', 'jogadaEm');
  }
}

const ladosIguais = () => new ErroLocal('LADOS_IGUAIS', 'Os dois lados da partida são o mesmo competidor.', 'ladoB');

/**
 * Valida o lançamento e monta o corpo da operação `criar`.
 * @param {any} dados
 * @param {{ competidores: { id: string, nome: string }[], agora: () => number, novoId: () => string }} contexto
 * @returns {import('./tipos.js').CorpoPartida}
 */
export function prepararLancamento(dados, { competidores, agora, novoId }) {
  const ladoA = resolverLado(dados.ladoA, 'ladoA', competidores, novoId);
  const ladoB = resolverLado(dados.ladoB, 'ladoB', competidores, novoId);
  if (mesmoCompetidor(ladoA, ladoB)) throw ladosIguais();
  const penaltis = dados.penaltis ?? null;
  const modalidade = dados.modalidade ?? null;
  validarResultado({ placarA: dados.placarA, placarB: dados.placarB, penaltis, modalidade });
  const jogadaEm = dados.jogadaEm ?? agora();
  validarJogadaEm(jogadaEm, agora());
  return { ladoA, ladoB, placarA: dados.placarA, placarB: dados.placarB, penaltis, modalidade, jogadaEm };
}

/**
 * Valida a edição sobre a partida atual da visão e devolve só os campos alterados.
 * @param {import('./tipos.js').Partida} partida
 * @param {any} mudancas
 * @param {{ competidores: { id: string, nome: string }[], agora: () => number, novoId: () => string }} contexto
 * @returns {import('./tipos.js').CorpoPartida}
 */
export function prepararEdicao(partida, mudancas, { competidores, agora, novoId }) {
  /** @type {import('./tipos.js').CorpoPartida} */
  const corpo = {};
  for (const campo of CAMPOS_SIMPLES) {
    if (mudancas[campo] !== undefined) /** @type {any} */ (corpo)[campo] = mudancas[campo];
  }
  if (mudancas.penaltis !== undefined) corpo.penaltis = mudancas.penaltis;
  const novoA = mudancas.ladoA ? resolverLado(mudancas.ladoA, 'ladoA', competidores, novoId) : null;
  const novoB = mudancas.ladoB ? resolverLado(mudancas.ladoB, 'ladoB', competidores, novoId) : null;
  if (novoA) corpo.ladoA = novoA;
  if (novoB) corpo.ladoB = novoB;

  const porId = (/** @type {string} */ id) => competidores.find((c) => c.id === id) ?? { id, nome: id };
  if ((novoA || novoB) && mesmoCompetidor(novoA ?? porId(partida.ladoA), novoB ?? porId(partida.ladoB)))
    throw ladosIguais();

  const penaltisAtuais = partida.penaltisA === null ? null : { a: partida.penaltisA, b: partida.penaltisB };
  validarResultado({
    placarA: corpo.placarA ?? partida.placarA,
    placarB: corpo.placarB ?? partida.placarB,
    penaltis: corpo.penaltis === undefined ? penaltisAtuais : corpo.penaltis,
    modalidade: corpo.modalidade === undefined ? partida.modalidade : corpo.modalidade,
  });
  if (corpo.jogadaEm !== undefined) validarJogadaEm(corpo.jogadaEm, agora());
  return corpo;
}

// O tempo limite da requisição é 15 s; passado isso a marca de envio é de uma aba que morreu e deixa de valer.
const ENVIO_VALIDO_MS = 30_000;

/**
 * Criação cuja requisição pode estar chegando ao servidor agora, em qualquer aba: não pode mais ser alterada nem removida.
 * @param {import('./tipos.js').Operacao} op
 * @param {number} agora
 */
export const envioEmCurso = (op, agora) =>
  op.enviandoDesde !== undefined && agora >= op.enviandoDesde && agora - op.enviandoDesde < ENVIO_VALIDO_MS;

/**
 * Indica se o servidor já está no estado que a operação produziria (reenvio após resposta perdida).
 * @param {import('./tipos.js').Operacao} op
 * @param {import('./tipos.js').Partida} partida
 */
export function operacaoJaAplicada({ tipo, corpo }, partida) {
  if (tipo === 'excluir') return partida.excluida;
  if (tipo === 'restaurar') return !partida.excluida;
  if (tipo !== 'editar' || partida.excluida) return false;
  for (const campo of CAMPOS_SIMPLES) if (corpo[campo] !== undefined && corpo[campo] !== partida[campo]) return false;
  if (corpo.penaltis !== undefined) {
    const [a, b] = [corpo.penaltis?.a ?? null, corpo.penaltis?.b ?? null];
    if (a !== partida.penaltisA || b !== partida.penaltisB) return false;
  }
  return (!corpo.ladoA || corpo.ladoA.id === partida.ladoA) && (!corpo.ladoB || corpo.ladoB.id === partida.ladoB);
}
