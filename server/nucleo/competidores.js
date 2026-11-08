import { chaveDeNome, LIMITES } from '../../compartilhado/nomes.js';
import { ErroApp, naoEncontrado, requisicaoInvalida } from '../erros.js';
import { paraCompetidor } from './modelos.js';
import { exigirCriador } from './permissoes.js';
import { proximoSeq } from './seq.js';
import { gerarIdUuid } from './tokens.js';
import { nomeObrigatorio } from './validacao.js';

export const FORMATO_ID = /^[A-Za-z0-9_-]{16,40}$/;

/**
 * @param {import("../tipos.js").Banco} banco
 * @param {string} resenhaId
 */
export const listarCompetidores = (banco, resenhaId) =>
  banco
    .todos('SELECT * FROM competidores WHERE resenha_id = ? ORDER BY criado_em, rowid', resenhaId)
    .map(paraCompetidor);

/**
 * Resolve um lado da partida para um competidor da resenha, criando-o se preciso. O id enviado vale
 * quando já existe na resenha; senão o nome decide, e o id só é aproveitado para um competidor novo.
 * @param {number} seq seq da transação em curso
 * @returns {{ id: string, nome: string, criado: boolean }}
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {any} lado
 * @param {string} campo
 * @param {number} seq
 */
export function resolverLado(ctx, auth, lado, campo, seq) {
  const { banco, config } = ctx;
  if (lado === null || typeof lado !== 'object' || Array.isArray(lado)) {
    throw requisicaoInvalida('Lado da partida inválido.', campo);
  }
  const idEnviado = typeof lado.id === 'string' && FORMATO_ID.test(lado.id) ? lado.id : null;
  if (idEnviado) {
    const porId = banco.um(
      'SELECT id, nome FROM competidores WHERE id = ? AND resenha_id = ?',
      idEnviado,
      auth.resenhaId,
    );
    if (porId) return { id: porId.id, nome: porId.nome, criado: false };
  }
  if (lado.nome === undefined || lado.nome === null) {
    throw requisicaoInvalida('Nome ou identificador do competidor obrigatório.', `${campo}.nome`);
  }
  const nome = nomeObrigatorio(lado.nome, LIMITES.competidor, `${campo}.nome`);
  const chave = chaveDeNome(nome);
  const existente = banco.um(
    'SELECT id, nome FROM competidores WHERE resenha_id = ? AND nome_chave = ?',
    auth.resenhaId,
    chave,
  );
  if (existente) return { id: existente.id, nome: existente.nome, criado: false };

  const total = banco.um('SELECT count(*) AS n FROM competidores WHERE resenha_id = ?', auth.resenhaId)?.n ?? 0;
  if (total >= config.maxCompetidores) {
    throw new ErroApp(403, 'LIMITE_ATINGIDO', 'Limite de competidores da resenha atingido.');
  }
  const livre = idEnviado && !banco.um('SELECT 1 AS existe FROM competidores WHERE id = ?', idEnviado);
  const id = livre ? /** @type {string} */ (idEnviado) : gerarIdUuid();
  banco.executar(
    'INSERT INTO competidores (id, resenha_id, nome, nome_chave, criado_por, criado_em, seq) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    auth.resenhaId,
    nome,
    chave,
    auth.membroId,
    ctx.relogio(),
    seq,
  );
  return { id, nome, criado: true };
}

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {string} competidorId
 * @param {unknown} nome
 */
export function renomearCompetidor(ctx, auth, competidorId, nome) {
  const { banco } = ctx;
  const atual = banco.um('SELECT * FROM competidores WHERE id = ? AND resenha_id = ?', competidorId, auth.resenhaId);
  if (!atual) throw naoEncontrado('Competidor não encontrado.');
  exigirCriador(auth);
  const novoNome = nomeObrigatorio(nome, LIMITES.competidor, 'nome');
  const chave = chaveDeNome(novoNome);
  return banco.transacao(() => {
    const outro = banco.um(
      'SELECT 1 AS existe FROM competidores WHERE resenha_id = ? AND nome_chave = ? AND id <> ?',
      auth.resenhaId,
      chave,
      competidorId,
    );
    if (outro) throw new ErroApp(409, 'NOME_EM_USO', 'Já existe competidor com esse nome.', { campo: 'nome' });
    const seq = proximoSeq(banco, auth.resenhaId);
    banco.executar(
      'UPDATE competidores SET nome = ?, nome_chave = ?, seq = ? WHERE id = ?',
      novoNome,
      chave,
      seq,
      competidorId,
    );
    const linha = /** @type {object} */ (banco.um('SELECT * FROM competidores WHERE id = ?', competidorId));
    return { competidor: paraCompetidor(linha), seq };
  });
}
