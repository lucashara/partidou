// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { iniciarServidor } from './ajuda/servidor.js';

const MINUTO = 60_000;

describe('segredos no banco', () => {
  let s;
  before(async () => {
    s = await iniciarServidor();
  });
  after(() => s.fechar());

  test('o hash do token é o que fica no banco, nunca o token', async () => {
    const dono = await s.criarResenha();
    const sessao = s.ctx.banco.um('SELECT token_hash AS h FROM sessoes WHERE membro_id = ?', dono.membro.id);
    assert.match(sessao.h, /^[0-9a-f]{64}$/);
    assert.notEqual(sessao.h, dono.token);
  });

  test('a resenha não guarda segredo de acesso próprio', async () => {
    const colunas = s.ctx.banco.todos("SELECT name FROM pragma_table_info('resenhas') ORDER BY cid").map((c) => c.name);
    assert.deepEqual(colunas, ['id', 'nome', 'seq', 'criada_em']);
  });
});

describe('força bruta nas rotas de código', () => {
  let s;
  before(async () => {
    s = await iniciarServidor({ limitesPadrao: true });
  });
  after(() => s.fechar());

  test('oito falhas bloqueiam com 429 e Retry-After, e o bloqueio dobra', async () => {
    const dono = await s.criarResenha();
    const errada = () => s.chamar('POST', '/api/convites/consultar', { corpo: { codigo: 'ZZZZ-ZZZZ-ZZZZ' } });
    for (let i = 0; i < 8; i++) assert.equal((await errada()).status, 404, `tentativa ${i + 1}`);

    const bloqueada = await errada();
    assert.equal(bloqueada.status, 429);
    assert.equal(bloqueada.corpo.erro.codigo, 'MUITAS_TENTATIVAS');
    assert.equal(bloqueada.cabecalhos.get('retry-after'), '30');

    // O bloqueio vale também para o código correto e para as outras rotas de código.
    const correto = await s.chamar('POST', '/api/convites/consultar', { corpo: { codigo: dono.convite.codigo } });
    assert.equal(correto.status, 429);
    const aceite = await s.chamar('POST', '/api/convites/aceitar', {
      corpo: { codigo: dono.convite.codigo, apelido: 'Visita' },
    });
    assert.equal(aceite.status, 429);
    const transferencia = await s.chamar('POST', '/api/acesso/transferencia/usar', { corpo: { codigo: 'ABCD-EFGH' } });
    assert.equal(transferencia.status, 429);

    // Passado o bloqueio, uma nova falha dobra o tempo.
    s.relogio.avancar(31_000);
    assert.equal((await errada()).status, 404);
    const dobrado = await errada();
    assert.equal(dobrado.status, 429);
    assert.equal(dobrado.cabecalhos.get('retry-after'), '60');

    s.relogio.avancar(61_000);
    assert.equal(
      (await s.chamar('POST', '/api/convites/consultar', { corpo: { codigo: dono.convite.codigo } })).status,
      200,
    );
  });

  test('o bloqueio não alcança rotas com token', async () => {
    const dono = await s.criarResenha('Outra', 'Dono');
    const e = await s.chamar('GET', `/api/resenhas/${dono.id}/estado`, { token: dono.token });
    assert.equal(e.status, 200);
  });

  test('o bloqueio cresce até o teto de uma hora', async () => {
    const ctx = s.ctx;
    for (let i = 0; i < 40; i++) ctx.limitador.falhaDeCodigo('9.9.9.9');
    assert.equal(ctx.limitador.bloqueioDeCodigo('9.9.9.9'), 3600);
  });
});

describe('transferência de acesso', () => {
  let s;
  before(async () => {
    s = await iniciarServidor();
  });
  after(() => s.fechar());

  const gerar = (token) => s.chamar('POST', '/api/acesso/transferencia', { token });
  const usar = (codigo) => s.chamar('POST', '/api/acesso/transferencia/usar', { corpo: { codigo } });

  test('o código gera uma sessão do mesmo membro em outro aparelho', async () => {
    const { visita, id } = await s.resenhaComDois();
    const g = await gerar(visita.token);
    assert.equal(g.status, 201);
    assert.match(g.corpo.codigo, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.equal(g.corpo.expiraEm, s.relogio.agora() + 10 * MINUTO);

    const u = await usar(g.corpo.codigo);
    assert.equal(u.status, 200);
    assert.deepEqual(Object.keys(u.corpo).sort(), ['membro', 'resenha', 'token']);
    assert.equal(u.corpo.membro.id, visita.membro.id);
    assert.equal(u.corpo.resenha.id, id);
    assert.notEqual(u.corpo.token, visita.token);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: u.corpo.token })).status, 200);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: visita.token })).status, 200);
  });

  test('uso único', async () => {
    const { dono } = await s.resenhaComDois();
    const g = await gerar(dono.token);
    assert.equal((await usar(g.corpo.codigo)).status, 200);
    const segunda = await usar(g.corpo.codigo);
    assert.equal(segunda.status, 404);
    assert.equal(segunda.corpo.erro.codigo, 'CODIGO_INVALIDO');
  });

  test('expira em dez minutos', async () => {
    const { dono } = await s.resenhaComDois();
    const g = await gerar(dono.token);
    s.relogio.avancar(10 * MINUTO - 1000);
    const g2 = await gerar(dono.token);
    s.relogio.avancar(10 * MINUTO - 1000);
    assert.equal((await usar(g.corpo.codigo)).status, 404);
    assert.equal((await usar(g2.corpo.codigo)).status, 200);
    const g3 = await gerar(dono.token);
    s.relogio.avancar(10 * MINUTO);
    const expirado = await usar(g3.corpo.codigo);
    assert.equal(expirado.status, 404);
    assert.equal(expirado.corpo.erro.codigo, 'CODIGO_INVALIDO');
  });

  test('um código novo invalida o anterior do mesmo membro', async () => {
    const { dono } = await s.resenhaComDois();
    const primeiro = await gerar(dono.token);
    const segundo = await gerar(dono.token);
    assert.notEqual(primeiro.corpo.codigo, segundo.corpo.codigo);
    assert.equal((await usar(primeiro.corpo.codigo)).status, 404);
    assert.equal((await usar(segundo.corpo.codigo)).status, 200);
  });

  test('códigos de membros diferentes são independentes', async () => {
    const { dono, visita } = await s.resenhaComDois();
    const doDono = await gerar(dono.token);
    await gerar(visita.token);
    const u = await usar(doDono.corpo.codigo);
    assert.equal(u.corpo.membro.id, dono.membro.id);
    assert.equal(u.corpo.membro.papel, 'criador');
  });

  test('exige sessão para gerar; código inválido ou membro removido não abre sessão', async () => {
    assert.equal((await gerar(undefined)).status, 401);
    assert.equal((await usar('0000-0000')).status, 404);
    assert.equal((await usar('curto')).status, 404);
    assert.equal((await s.chamar('POST', '/api/acesso/transferencia/usar', { corpo: {} })).status, 400);
    const { dono, visita, id } = await s.resenhaComDois();
    const g = await gerar(visita.token);
    await s.chamar('DELETE', `/api/resenhas/${id}/membros/${visita.membro.id}`, { token: dono.token });
    assert.equal((await usar(g.corpo.codigo)).status, 404);
  });

  test('sair deste aparelho encerra só a sessão atual', async () => {
    const { visita, id } = await s.resenhaComDois();
    const g = await gerar(visita.token);
    const outra = (await usar(g.corpo.codigo)).corpo;
    const sair = await s.chamar('DELETE', '/api/sessao', { token: visita.token });
    assert.equal(sair.status, 204);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: visita.token })).status, 401);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: outra.token })).status, 200);
    assert.equal((await s.chamar('DELETE', '/api/sessao')).status, 401);
  });

  test('sessão sem uso por 180 dias expira, e o uso a mantém', async () => {
    const { dono, id } = await s.resenhaComDois();
    const DIA = 24 * 3600_000;
    s.relogio.avancar(100 * DIA);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).status, 200);
    s.relogio.avancar(100 * DIA);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).status, 200);
    s.relogio.avancar(181 * DIA);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).status, 401);
  });

  test('cada membro mantém no máximo 10 sessões e a mais antiga cai', async () => {
    const { dono, id } = await s.resenhaComDois();
    const tokens = [dono.token];
    for (let i = 0; i < 11; i++) {
      s.relogio.avancar(1000);
      const g = await gerar(/** @type {string} */ (tokens.at(-1)));
      tokens.push((await usar(g.corpo.codigo)).corpo.token);
    }
    const total = s.ctx.banco.um('SELECT COUNT(*) AS n FROM sessoes WHERE membro_id = ?', dono.membro.id).n;
    assert.equal(total, 10);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: tokens[0] })).status, 401);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: tokens.at(-1) })).status, 200);
  });

  test('o último uso é atualizado no máximo a cada hora', async () => {
    const { dono, id } = await s.resenhaComDois();
    const lerUso = () => s.ctx.banco.um('SELECT ultimo_uso_em AS u FROM sessoes WHERE membro_id = ?', dono.membro.id).u;
    const inicio = lerUso();
    s.relogio.avancar(30 * MINUTO);
    await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token });
    assert.equal(lerUso(), inicio);
    s.relogio.avancar(31 * MINUTO);
    await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token });
    assert.equal(lerUso(), s.relogio.agora());
  });
});
