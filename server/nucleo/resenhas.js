import { chaveDeNome, LIMITES } from '../../compartilhado/nomes.js';
import { ErroApp } from '../erros.js';
import { criarSessao } from './acesso.js';
import { inserirConvite } from './convites.js';
import { paraMembro, paraResenha } from './modelos.js';
import { exigirCriador } from './permissoes.js';
import { proximoSeq } from './seq.js';
import { gerarIdMembro, gerarIdResenha, novoSegredo, TAMANHOS } from './tokens.js';
import { nomeObrigatorio } from './validacao.js';

const DIA_MS = 24 * 3600_000;

/**
 * Valida e normaliza a entrada; separado para que o limite por IP só conte tentativas bem formadas.
 * @param {Record<string, any>} entrada
 */
export function validarNovaResenha({ nome, apelido }) {
  return {
    nome: nomeObrigatorio(nome, LIMITES.nomeResenha, 'nome'),
    apelido: nomeObrigatorio(apelido, LIMITES.apelido, 'apelido'),
  };
}

/**
 * Cria a resenha, o criador, a primeira sessão e o primeiro convite numa única transação.
 * @param {import("../tipos.js").Contexto} ctx
 * @param {ReturnType<typeof validarNovaResenha>} entrada já validada por `validarNovaResenha`
 */
export function criarResenha(ctx, entrada) {
  const { banco, config } = ctx;
  const { nome: nomeResenha, apelido: nomeApelido } = entrada;
  return banco.transacao(() => {
    const agora = ctx.relogio();
    const total = banco.um('SELECT count(*) AS n FROM resenhas')?.n ?? 0;
    const recentes = banco.um('SELECT count(*) AS n FROM resenhas WHERE criada_em > ?', agora - DIA_MS)?.n ?? 0;
    if (total >= config.maxResenhas || recentes >= config.maxCriacoesDia) {
      throw new ErroApp(
        403,
        'LIMITE_ATINGIDO',
        'Limite de criação de resenhas atingido. Nova criação permitida mais tarde.',
      );
    }
    const chave = novoSegredo(TAMANHOS.chaveRecuperacao, 5);
    const resenhaId = gerarIdResenha();
    banco.executar(
      'INSERT INTO resenhas (id, nome, chave_recuperacao_hash, criada_em) VALUES (?, ?, ?, ?)',
      resenhaId,
      nomeResenha,
      chave.hash,
      agora,
    );
    const seq = proximoSeq(banco, resenhaId);
    const membroId = gerarIdMembro();
    banco.executar(
      "INSERT INTO membros (id, resenha_id, apelido, apelido_chave, papel, criado_em, seq) VALUES (?, ?, ?, ?, 'criador', ?, ?)",
      membroId,
      resenhaId,
      nomeApelido,
      chaveDeNome(nomeApelido),
      agora,
      seq,
    );
    const token = criarSessao(banco, membroId, agora);
    const convite = inserirConvite(banco, resenhaId, membroId, agora);
    return {
      resenha: paraResenha(/** @type {object} */ (banco.um('SELECT * FROM resenhas WHERE id = ?', resenhaId))),
      membro: paraMembro(/** @type {object} */ (banco.um('SELECT * FROM membros WHERE id = ?', membroId))),
      token,
      chaveRecuperacao: chave.exibido,
      convite,
    };
  });
}

/**
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 * @param {unknown} nome
 */
export function renomearResenha(ctx, auth, nome) {
  exigirCriador(auth);
  const novoNome = nomeObrigatorio(nome, LIMITES.nomeResenha, 'nome');
  return ctx.banco.transacao(() => {
    ctx.banco.executar('UPDATE resenhas SET nome = ? WHERE id = ?', novoNome, auth.resenhaId);
    const seq = proximoSeq(ctx.banco, auth.resenhaId);
    const resenha = /** @type {object} */ (ctx.banco.um('SELECT * FROM resenhas WHERE id = ?', auth.resenhaId));
    return { resenha: paraResenha(resenha), seq };
  });
}

/**
 * Remove a resenha e, por cascata, membros, sessões, convites, competidores e partidas.
 * @param {import("../tipos.js").Contexto} ctx
 * @param {import("../tipos.js").Autenticacao} auth
 */
export function excluirResenha(ctx, auth) {
  exigirCriador(auth);
  ctx.banco.executar('DELETE FROM resenhas WHERE id = ?', auth.resenhaId);
}
