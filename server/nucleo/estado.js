import { naoEncontrado } from '../erros.js';
import { listarCompetidores } from './competidores.js';
import { listarMembros } from './membros.js';
import { paraPartida, paraResenha } from './modelos.js';

/**
 * Estado da resenha para o membro autenticado. `desde` válido (1 até o seq atual) devolve só as partidas
 * alteradas depois dele, inclusive excluídas; qualquer outro valor devolve o estado completo.
 * @returns {import('../../compartilhado/tipos.js').Estado}
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {number | undefined} desde
 */
export function obterEstado(ctx, auth, desde) {
  const { banco } = ctx;
  const resenha = banco.um('SELECT * FROM resenhas WHERE id = ?', auth.resenhaId);
  if (!resenha) throw naoEncontrado();
  const alvo = desde ?? 0;
  const completo = !(alvo > 0 && alvo <= resenha.seq);
  const linhas = completo
    ? banco.todos(
        'SELECT * FROM partidas WHERE resenha_id = ? AND excluida_em IS NULL ORDER BY jogada_em DESC, criada_em DESC, id',
        auth.resenhaId,
      )
    : banco.todos(
        'SELECT * FROM partidas WHERE resenha_id = ? AND seq > ? ORDER BY jogada_em DESC, criada_em DESC, id',
        auth.resenhaId,
        alvo,
      );
  return {
    seq: resenha.seq,
    completo,
    resenha: paraResenha(resenha),
    eu: { membroId: auth.membroId, papel: auth.papel, apelido: auth.apelido },
    membros: listarMembros(banco, auth.resenhaId),
    competidores: listarCompetidores(banco, auth.resenhaId),
    partidas: linhas.map(paraPartida),
  };
}

/**
 * @param {import("../tipos.js").Banco} banco
 * @param {string} resenhaId
 */
export const seqDaResenha = (banco, resenhaId) =>
  banco.um('SELECT seq FROM resenhas WHERE id = ?', resenhaId)?.seq ?? 0;
