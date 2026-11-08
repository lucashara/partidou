import { MODALIDADES } from '../../compartilhado/modalidades.js';
import { validarPlacar } from '../../compartilhado/placar.js';
import { ErroApp, naoEncontrado, requisicaoInvalida } from '../erros.js';
import { FORMATO_ID, resolverLado } from './competidores.js';
import { seqDaResenha } from './estado.js';
import { paraCompetidor, paraPartida } from './modelos.js';
import { exigirAutorOuCriador } from './permissoes.js';
import { proximoSeq } from './seq.js';
import { gerarIdUuid } from './tokens.js';

const JOGADA_MINIMA_MS = Date.UTC(2000, 0, 1);
// Até 5 minutos à frente vale como veio; além disso o relógio do aparelho está errado e vale a hora do servidor.
const JOGADA_TOLERANCIA_MS = 5 * 60_000;

/**
 * @param {import("../tipos.js").Banco} banco
 * @param {string[]} ids
 */
const competidoresDe = (banco, ids) =>
  [...new Set(ids)].map((id) => paraCompetidor(banco.um('SELECT * FROM competidores WHERE id = ?', id) ?? {}));

/**
 * @param {any} atual
 * @param {string} [mensagem]
 */
const conflito = (atual, mensagem = 'Partida alterada em outro aparelho.') =>
  new ErroApp(409, 'CONFLITO_REVISAO', mensagem, { atual: paraPartida(atual) });

/**
 * @param {any} valor
 */
function lerModalidade(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string' || !MODALIDADES.some((m) => m.id === valor)) {
    throw requisicaoInvalida('Modalidade desconhecida.', 'modalidade');
  }
  return valor;
}

/**
 * @param {any} valor
 * @param {number} agora
 */
function lerJogadaEm(valor, agora) {
  if (valor === undefined || valor === null) return agora;
  if (!Number.isInteger(valor) || valor < JOGADA_MINIMA_MS) {
    throw requisicaoInvalida('Data da partida fora do intervalo permitido.', 'jogadaEm');
  }
  return valor > agora + JOGADA_TOLERANCIA_MS ? agora : valor;
}

/**
 * `penaltis` nulo ou ausente significa sem disputa; os valores internos são validados em `validarPlacar`.
 * @param {any} valor
 */
function lerPenaltis(valor) {
  if (valor === undefined || valor === null) return { penaltisA: null, penaltisB: null };
  if (typeof valor !== 'object' || Array.isArray(valor)) {
    throw requisicaoInvalida('Pênaltis devem ser informados como { a, b }.', 'penaltis');
  }
  return { penaltisA: valor.a ?? null, penaltisB: valor.b ?? null };
}

/**
 * @param {any} estado
 */
function exigirPlacarValido(estado) {
  const r = validarPlacar(estado);
  if (!r.ok) throw new ErroApp(422, r.codigo, r.mensagem, { campo: r.campo });
}

const ladosIguais = () =>
  new ErroApp(422, 'LADOS_IGUAIS', 'Os dois lados da partida são o mesmo competidor.', { campo: 'ladoB' });

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {Record<string, any>} corpo
 */
export function criarPartida(ctx, auth, corpo) {
  const { banco, config } = ctx;
  const agora = ctx.relogio();
  if (corpo.id !== undefined && corpo.id !== null && (typeof corpo.id !== 'string' || !FORMATO_ID.test(corpo.id))) {
    throw requisicaoInvalida('Identificador de partida inválido.', 'id');
  }
  const id = corpo.id ?? gerarIdUuid();

  const existente = banco.um('SELECT * FROM partidas WHERE id = ?', id);
  if (existente) {
    if (existente.resenha_id !== auth.resenhaId || existente.criado_por !== auth.membroId) {
      throw new ErroApp(409, 'ID_EM_USO', 'Identificador de partida já utilizado.', { campo: 'id' });
    }
    return {
      status: 200,
      partida: paraPartida(existente),
      competidores: competidoresDe(banco, [existente.lado_a, existente.lado_b]),
      seq: seqDaResenha(banco, auth.resenhaId),
      mudou: false,
    };
  }

  const modalidade = lerModalidade(corpo.modalidade);
  const jogadaEm = lerJogadaEm(corpo.jogadaEm, agora);
  const { penaltisA, penaltisB } = lerPenaltis(corpo.penaltis);
  const placar = { placarA: corpo.placarA, placarB: corpo.placarB, penaltisA, penaltisB, modalidade };
  exigirPlacarValido(placar);

  return banco.transacao(() => {
    const total = banco.um('SELECT count(*) AS n FROM partidas WHERE resenha_id = ?', auth.resenhaId)?.n ?? 0;
    if (total >= config.maxPartidas)
      throw new ErroApp(403, 'LIMITE_ATINGIDO', 'Limite de partidas da resenha atingido.');
    const seq = proximoSeq(banco, auth.resenhaId);
    const ladoA = resolverLado(ctx, auth, corpo.ladoA, 'ladoA', seq);
    const ladoB = resolverLado(ctx, auth, corpo.ladoB, 'ladoB', seq);
    if (ladoA.id === ladoB.id) throw ladosIguais();
    banco.executar(
      `INSERT INTO partidas (id, resenha_id, lado_a, lado_b, placar_a, placar_b, penaltis_a, penaltis_b, modalidade,
                             jogada_em, criado_por, criada_em, atualizada_em, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      auth.resenhaId,
      ladoA.id,
      ladoB.id,
      placar.placarA,
      placar.placarB,
      penaltisA,
      penaltisB,
      modalidade,
      jogadaEm,
      auth.membroId,
      agora,
      agora,
      seq,
    );
    const linha = /** @type {object} */ (banco.um('SELECT * FROM partidas WHERE id = ?', id));
    return {
      status: 201,
      partida: paraPartida(linha),
      competidores: competidoresDe(banco, [ladoA.id, ladoB.id]),
      seq,
      mudou: true,
    };
  });
}

/**
 * @param {import("../tipos.js").Banco} banco
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {string} partidaId
 */
function buscarPartida(banco, auth, partidaId) {
  const linha = banco.um('SELECT * FROM partidas WHERE id = ? AND resenha_id = ?', partidaId, auth.resenhaId);
  if (!linha) throw naoEncontrado('Partida não encontrada.');
  return linha;
}

/**
 * @param {any} valor
 */
function exigirRev(valor) {
  if (!Number.isInteger(valor) || valor < 1) throw requisicaoInvalida('Revisão obrigatória.', 'rev');
  return valor;
}

/**
 * Resultado pedido pela edição, já validado. Lados desconhecidos são criados na transação em curso.
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {any} atual
 * @param {Record<string, any>} corpo
 * @param {number} agora
 * @param {number} seq
 */
function resultadoDaEdicao(ctx, auth, atual, corpo, agora, seq) {
  const modalidade = 'modalidade' in corpo ? lerModalidade(corpo.modalidade) : atual.modalidade;
  const jogadaEm = 'jogadaEm' in corpo ? lerJogadaEm(corpo.jogadaEm, agora) : atual.jogada_em;
  const penaltis =
    'penaltis' in corpo ? lerPenaltis(corpo.penaltis) : { penaltisA: atual.penaltis_a, penaltisB: atual.penaltis_b };
  const placar = {
    placarA: 'placarA' in corpo ? corpo.placarA : atual.placar_a,
    placarB: 'placarB' in corpo ? corpo.placarB : atual.placar_b,
    ...penaltis,
    modalidade,
  };
  exigirPlacarValido(placar);
  const ladoA =
    corpo.ladoA === undefined
      ? { id: atual.lado_a, criado: false }
      : resolverLado(ctx, auth, corpo.ladoA, 'ladoA', seq);
  const ladoB =
    corpo.ladoB === undefined
      ? { id: atual.lado_b, criado: false }
      : resolverLado(ctx, auth, corpo.ladoB, 'ladoB', seq);
  if (ladoA.id === ladoB.id) throw ladosIguais();
  return { placar, modalidade, jogadaEm, ladoA, ladoB };
}

/**
 * Edição com `rev` desatualizado só é conflito se o resultado pedido ainda não for o estado atual: reenvio depois de
 * resposta perdida chega com o `rev` antigo e deve devolver o estado atual como aplicado.
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {string} partidaId
 * @param {Record<string, any>} corpo
 */
export function editarPartida(ctx, auth, partidaId, corpo) {
  const { banco } = ctx;
  const agora = ctx.relogio();
  const atual = buscarPartida(banco, auth, partidaId);
  exigirAutorOuCriador(auth, atual.criado_por);
  const rev = exigirRev(corpo.rev);
  if (atual.excluida_em !== null) throw conflito(atual, 'Partida excluída.');
  const desatualizada = rev !== atual.rev;

  return banco.transacao(() => {
    // O seq só avança se algo mudar; o previsto serve ao competidor novo e é descartado com o rollback.
    const seqPrevisto = seqDaResenha(banco, auth.resenhaId) + 1;
    /** @type {ReturnType<typeof resultadoDaEdicao>} */
    let r;
    try {
      r = resultadoDaEdicao(ctx, auth, atual, corpo, agora, seqPrevisto);
    } catch (erro) {
      if (desatualizada && erro instanceof ErroApp) throw conflito(atual);
      throw erro;
    }
    const { placar, modalidade, jogadaEm, ladoA, ladoB } = r;
    const igual =
      !ladoA.criado &&
      !ladoB.criado &&
      ladoA.id === atual.lado_a &&
      ladoB.id === atual.lado_b &&
      placar.placarA === atual.placar_a &&
      placar.placarB === atual.placar_b &&
      placar.penaltisA === atual.penaltis_a &&
      placar.penaltisB === atual.penaltis_b &&
      modalidade === atual.modalidade &&
      jogadaEm === atual.jogada_em;
    if (igual) {
      const competidores = competidoresDe(banco, [atual.lado_a, atual.lado_b]);
      return { partida: paraPartida(atual), competidores, seq: seqDaResenha(banco, auth.resenhaId), mudou: false };
    }
    if (desatualizada) throw conflito(atual);

    const seq = proximoSeq(banco, auth.resenhaId);
    banco.executar(
      `UPDATE partidas SET lado_a = ?, lado_b = ?, placar_a = ?, placar_b = ?, penaltis_a = ?, penaltis_b = ?,
              modalidade = ?, jogada_em = ?, editado_por = ?, atualizada_em = ?, rev = rev + 1, seq = ?
        WHERE id = ?`,
      ladoA.id,
      ladoB.id,
      placar.placarA,
      placar.placarB,
      placar.penaltisA,
      placar.penaltisB,
      modalidade,
      jogadaEm,
      auth.membroId,
      agora,
      seq,
      partidaId,
    );
    const linha = /** @type {object} */ (banco.um('SELECT * FROM partidas WHERE id = ?', partidaId));
    return { partida: paraPartida(linha), competidores: competidoresDe(banco, [ladoA.id, ladoB.id]), seq, mudou: true };
  });
}

/**
 * Exclusão lógica: a linha permanece como marca de exclusão para os aparelhos que sincronizam por seq.
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {string} partidaId
 * @param {any} rev
 * @param {boolean} excluir
 */
function alterarExclusao(ctx, auth, partidaId, rev, excluir) {
  const { banco } = ctx;
  const atual = buscarPartida(banco, auth, partidaId);
  exigirAutorOuCriador(auth, atual.criado_por);
  const jaNoEstado = (atual.excluida_em !== null) === excluir;
  if (jaNoEstado) return { partida: paraPartida(atual), seq: seqDaResenha(banco, auth.resenhaId), mudou: false };
  if (exigirRev(rev) !== atual.rev) throw conflito(atual);
  return banco.transacao(() => {
    const agora = ctx.relogio();
    const seq = proximoSeq(banco, auth.resenhaId);
    banco.executar(
      'UPDATE partidas SET excluida_em = ?, editado_por = ?, atualizada_em = ?, rev = rev + 1, seq = ? WHERE id = ?',
      excluir ? agora : null,
      auth.membroId,
      agora,
      seq,
      partidaId,
    );
    const linha = /** @type {object} */ (banco.um('SELECT * FROM partidas WHERE id = ?', partidaId));
    return { partida: paraPartida(linha), seq, mudou: true };
  });
}

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {string} partidaId
 * @param {any} rev
 */
export const excluirPartida = (ctx, auth, partidaId, rev) => alterarExclusao(ctx, auth, partidaId, rev, true);
/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {string} partidaId
 * @param {any} rev
 */
export const restaurarPartida = (ctx, auth, partidaId, rev) => alterarExclusao(ctx, auth, partidaId, rev, false);
