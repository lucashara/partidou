// Sessões e transferência de acesso entre aparelhos.
import { codigoTransferenciaValido } from '../../compartilhado/codigos.js';
import { ErroApp } from '../erros.js';
import { paraMembro, paraResenha } from './modelos.js';
import { gerarToken, hashDe, hashDeCodigo, novoSegredo, TAMANHOS } from './tokens.js';

const DIA_MS = 24 * 3600_000;
export const SESSAO_VALIDADE_MS = 180 * DIA_MS;
const ATUALIZAR_USO_MS = 3600_000;
const TRANSFERENCIA_VALIDADE_MS = 10 * 60_000;
export const MAX_SESSOES_POR_MEMBRO = 10;
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * @typedef {object} Autenticacao
 * @property {string} sessaoHash
 * @property {string} membroId
 * @property {string} resenhaId
 * @property {string} apelido
 * @property {'criador' | 'participante'} papel
 */

export const codigoInvalido = () => new ErroApp(404, 'CODIGO_INVALIDO', 'Código inválido ou expirado.');

/**
 * Cria uma sessão para o membro e devolve o token em claro, que não é recuperável depois.
 * @param {import("../tipos.js").Banco} banco
 * @param {string} membroId
 * @param {number} agora
 */
export function criarSessao(banco, membroId, agora) {
  const token = gerarToken();
  banco.executar(
    'INSERT INTO sessoes (token_hash, membro_id, criada_em, ultimo_uso_em) VALUES (?, ?, ?, ?)',
    hashDe(token),
    membroId,
    agora,
    agora,
  );
  // Teto por membro: sem ele, gerar e usar códigos em laço criaria sessões sem limite.
  banco.executar(
    `DELETE FROM sessoes WHERE membro_id = ? AND token_hash NOT IN (
       SELECT token_hash FROM sessoes WHERE membro_id = ? ORDER BY ultimo_uso_em DESC, criada_em DESC, rowid DESC LIMIT ?)`,
    membroId,
    membroId,
    MAX_SESSOES_POR_MEMBRO,
  );
  return token;
}

/**
 * Token -> sessão válida -> membro ativo. A resenha vem sempre daqui, nunca da URL.
 * @returns {Autenticacao | null}
 * @param {import("../tipos.js").Banco} banco
 * @param {unknown} token
 * @param {number} agora
 */
export function autenticar(banco, token, agora) {
  if (typeof token !== 'string' || !FORMATO_TOKEN.test(token)) return null;
  const sessaoHash = hashDe(token);
  const linha = banco.um(
    `SELECT s.ultimo_uso_em, m.id, m.resenha_id, m.apelido, m.papel
       FROM sessoes s INNER JOIN membros m ON m.id = s.membro_id
      WHERE s.token_hash = ? AND s.revogada_em IS NULL AND m.revogado_em IS NULL AND s.ultimo_uso_em > ?`,
    sessaoHash,
    agora - SESSAO_VALIDADE_MS,
  );
  if (!linha) return null;
  if (agora - linha.ultimo_uso_em >= ATUALIZAR_USO_MS) {
    banco.executar('UPDATE sessoes SET ultimo_uso_em = ? WHERE token_hash = ?', agora, sessaoHash);
  }
  return { sessaoHash, membroId: linha.id, resenhaId: linha.resenha_id, apelido: linha.apelido, papel: linha.papel };
}

/**
 * Revoga as sessões ativas do membro.
 * @param {import("../tipos.js").Banco} banco
 * @param {string} membroId
 * @param {number} agora
 */
export function revogarSessoesDoMembro(banco, membroId, agora) {
  banco.executar('UPDATE sessoes SET revogada_em = ? WHERE membro_id = ? AND revogada_em IS NULL', agora, membroId);
}

/**
 * Sair só deste aparelho.
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 */
export function encerrarSessao(ctx, auth) {
  ctx.banco.executar('UPDATE sessoes SET revogada_em = ? WHERE token_hash = ?', ctx.relogio(), auth.sessaoHash);
}

/**
 * Gera o código de transferência do membro e invalida o anterior.
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 */
export function gerarTransferencia(ctx, auth) {
  const { banco } = ctx;
  return banco.transacao(() => {
    const agora = ctx.relogio();
    banco.executar('DELETE FROM transferencias WHERE membro_id = ? OR expira_em < ?', auth.membroId, agora);
    const segredo = novoSegredo(TAMANHOS.transferencia, 4);
    const expiraEm = agora + TRANSFERENCIA_VALIDADE_MS;
    banco.executar(
      'INSERT INTO transferencias (codigo_hash, membro_id, expira_em) VALUES (?, ?, ?)',
      segredo.hash,
      auth.membroId,
      expiraEm,
    );
    return { codigo: segredo.exibido, expiraEm };
  });
}

/**
 * Código de uso único: abre uma nova sessão para o mesmo membro.
 * @param {import("../tipos.js").Contexto} ctx
 * @param {unknown} codigoTexto
 */
export function usarTransferencia(ctx, codigoTexto) {
  if (!codigoTransferenciaValido(codigoTexto)) throw codigoInvalido();
  const { banco } = ctx;
  return banco.transacao(() => {
    const agora = ctx.relogio();
    const linha = banco.um(
      `SELECT t.codigo_hash, m.id AS membro_id, m.resenha_id
         FROM transferencias t INNER JOIN membros m ON m.id = t.membro_id
        WHERE t.codigo_hash = ? AND t.usada_em IS NULL AND t.expira_em > ? AND m.revogado_em IS NULL`,
      hashDeCodigo(codigoTexto),
      agora,
    );
    if (!linha) throw codigoInvalido();
    banco.executar('UPDATE transferencias SET usada_em = ? WHERE codigo_hash = ?', agora, linha.codigo_hash);
    const membro = banco.um('SELECT * FROM membros WHERE id = ?', linha.membro_id);
    const resenha = banco.um('SELECT * FROM resenhas WHERE id = ?', linha.resenha_id);
    if (!membro || !resenha) throw codigoInvalido();
    return { resenha: paraResenha(resenha), membro: paraMembro(membro), token: criarSessao(banco, membro.id, agora) };
  });
}
