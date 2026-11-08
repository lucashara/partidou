import { codigoConviteValido } from '../../compartilhado/codigos.js';
import { chaveDeNome, LIMITES } from '../../compartilhado/nomes.js';
import { ErroApp } from '../erros.js';
import { criarSessao } from './acesso.js';
import { paraMembro, paraResenha } from './modelos.js';
import { exigirCriador } from './permissoes.js';
import { proximoSeq } from './seq.js';
import { gerarIdMembro, hashDeCodigo, novoSegredo, TAMANHOS } from './tokens.js';
import { nomeObrigatorio } from './validacao.js';

const CONVITE_VALIDADE_MS = 7 * 24 * 3600_000;

export const conviteInvalido = () => new ErroApp(404, 'CONVITE_INVALIDO', 'Convite inválido ou expirado.');

/**
 * Revoga o convite ativo e grava um novo; devolve o código só desta vez.
 * @param {import("../tipos.js").Banco} banco
 * @param {string} resenhaId
 * @param {string} membroId
 * @param {number} agora
 */
export function inserirConvite(banco, resenhaId, membroId, agora) {
  banco.executar('UPDATE convites SET revogado_em = ? WHERE resenha_id = ? AND revogado_em IS NULL', agora, resenhaId);
  const segredo = novoSegredo(TAMANHOS.convite, 4);
  const expiraEm = agora + CONVITE_VALIDADE_MS;
  banco.executar(
    'INSERT INTO convites (resenha_id, codigo_hash, criado_por, criado_em, expira_em) VALUES (?, ?, ?, ?, ?)',
    resenhaId,
    segredo.hash,
    membroId,
    agora,
    expiraEm,
  );
  return { codigo: segredo.exibido, expiraEm };
}

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 */
export function gerarConvite(ctx, auth) {
  exigirCriador(auth);
  return ctx.banco.transacao(() => inserirConvite(ctx.banco, auth.resenhaId, auth.membroId, ctx.relogio()));
}

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 */
export function revogarConvite(ctx, auth) {
  exigirCriador(auth);
  ctx.banco.executar(
    'UPDATE convites SET revogado_em = ? WHERE resenha_id = ? AND revogado_em IS NULL',
    ctx.relogio(),
    auth.resenhaId,
  );
}

/**
 * @param {import("../tipos.js").Banco} banco
 * @param {unknown} codigoTexto
 * @param {number} agora
 */
function buscarConviteAtivo(banco, codigoTexto, agora) {
  if (!codigoConviteValido(codigoTexto)) throw conviteInvalido();
  const convite = banco.um(
    `SELECT c.id, c.resenha_id, c.expira_em, r.nome AS resenha_nome
       FROM convites c INNER JOIN resenhas r ON r.id = c.resenha_id
      WHERE c.codigo_hash = ? AND c.revogado_em IS NULL AND c.expira_em > ?`,
    hashDeCodigo(codigoTexto),
    agora,
  );
  if (!convite) throw conviteInvalido();
  return convite;
}

/**
 * @param {import("../tipos.js").Banco} banco
 * @param {string} resenhaId
 */
const contarMembros = (banco, resenhaId) =>
  banco.um('SELECT count(*) AS n FROM membros WHERE resenha_id = ? AND revogado_em IS NULL', resenhaId)?.n ?? 0;

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {unknown} codigoTexto
 */
export function consultarConvite(ctx, codigoTexto) {
  const convite = buscarConviteAtivo(ctx.banco, codigoTexto, ctx.relogio());
  return {
    resenhaNome: convite.resenha_nome,
    expiraEm: convite.expira_em,
    membros: contarMembros(ctx.banco, convite.resenha_id),
  };
}

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {unknown} codigoTexto
 * @param {unknown} apelido
 */
export function aceitarConvite(ctx, codigoTexto, apelido) {
  const { banco, config } = ctx;
  const nomeApelido = nomeObrigatorio(apelido, LIMITES.apelido, 'apelido');
  return banco.transacao(() => {
    const agora = ctx.relogio();
    const convite = buscarConviteAtivo(banco, codigoTexto, agora);
    if (contarMembros(banco, convite.resenha_id) >= config.maxMembros) {
      throw new ErroApp(403, 'RESENHA_CHEIA', 'A resenha atingiu o limite de membros.');
    }
    const chave = chaveDeNome(nomeApelido);
    const repetido = banco.um(
      'SELECT 1 AS existe FROM membros WHERE resenha_id = ? AND apelido_chave = ? AND revogado_em IS NULL',
      convite.resenha_id,
      chave,
    );
    if (repetido) throw new ErroApp(409, 'APELIDO_EM_USO', 'Apelido já utilizado nesta resenha.', { campo: 'apelido' });
    const seq = proximoSeq(banco, convite.resenha_id);
    const membroId = gerarIdMembro();
    banco.executar(
      "INSERT INTO membros (id, resenha_id, apelido, apelido_chave, papel, criado_em, seq) VALUES (?, ?, ?, ?, 'participante', ?, ?)",
      membroId,
      convite.resenha_id,
      nomeApelido,
      chave,
      agora,
      seq,
    );
    banco.executar('UPDATE convites SET usos = usos + 1 WHERE id = ?', convite.id);
    const resenha = /** @type {object} */ (banco.um('SELECT * FROM resenhas WHERE id = ?', convite.resenha_id));
    const membro = /** @type {object} */ (banco.um('SELECT * FROM membros WHERE id = ?', membroId));
    return {
      resenha: paraResenha(resenha),
      membro: paraMembro(membro),
      token: criarSessao(banco, membroId, agora),
      seq,
    };
  });
}
