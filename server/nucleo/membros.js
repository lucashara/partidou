import { ErroApp, naoEncontrado } from '../erros.js';
import { revogarSessoesDoMembro } from './acesso.js';
import { paraMembro } from './modelos.js';
import { exigirCriador } from './permissoes.js';
import { proximoSeq } from './seq.js';

const criadorNaoSai = () =>
  new ErroApp(409, 'CRIADOR_NAO_SAI', 'O criador não pode sair da resenha. Exclua a resenha ou transfira o acesso.');

/**
 * @param {import("../tipos.js").Banco} banco
 * @param {string} resenhaId
 */
export const listarMembros = (banco, resenhaId) =>
  banco
    .todos('SELECT * FROM membros WHERE resenha_id = ? AND revogado_em IS NULL ORDER BY criado_em, rowid', resenhaId)
    .map(paraMembro);

/**
 * Revogação lógica: as partidas e competidores do membro permanecem.
 * @param {import("../tipos.js").Contexto} ctx
 * @param {string} resenhaId
 * @param {string} membroId
 */
function revogarMembro(ctx, resenhaId, membroId) {
  const { banco } = ctx;
  return banco.transacao(() => {
    const agora = ctx.relogio();
    const seq = proximoSeq(banco, resenhaId);
    banco.executar('UPDATE membros SET revogado_em = ?, seq = ? WHERE id = ?', agora, seq, membroId);
    revogarSessoesDoMembro(banco, membroId, agora);
    return { seq, membroId };
  });
}

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {string} membroId
 */
export function removerMembro(ctx, auth, membroId) {
  exigirCriador(auth);
  if (membroId === auth.membroId) throw criadorNaoSai();
  const alvo = ctx.banco.um(
    'SELECT id FROM membros WHERE id = ? AND resenha_id = ? AND revogado_em IS NULL',
    membroId,
    auth.resenhaId,
  );
  if (!alvo) throw naoEncontrado('Membro não encontrado.');
  return revogarMembro(ctx, auth.resenhaId, membroId);
}

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 */
export function sairDaResenha(ctx, auth) {
  if (auth.papel === 'criador') throw criadorNaoSai();
  return revogarMembro(ctx, auth.resenhaId, auth.membroId);
}
