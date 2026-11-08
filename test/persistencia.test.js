// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { abrirBanco } from '../server/banco.js';
import { APPLICATION_ID, MIGRACOES } from '../server/migracoes.js';
import { autenticar } from '../server/nucleo/acesso.js';
import { gerarToken, hashDe } from '../server/nucleo/tokens.js';
import { iniciarServidor } from './ajuda/servidor.js';

describe('persistência', () => {
  let pasta;
  before(() => {
    pasta = mkdtempSync(join(tmpdir(), 'partidou-banco-'));
  });
  after(() => rmSync(pasta, { recursive: true, force: true }));

  test('fechar e reabrir o arquivo mantém os dados e a sessão', async () => {
    const dbPath = join(pasta, 'dados.db');
    const a = await iniciarServidor({ config: { dbPath } });
    const { dono, id } = await a.resenhaComDois();
    const partida = (await a.lancar(dono.token, id, { placarA: 4, placarB: 3 })).corpo;
    await a.fechar();

    const b = await iniciarServidor({ config: { dbPath } });
    try {
      const r = await b.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.seq, partida.seq);
      assert.equal(r.corpo.partidas[0].placarA, 4);
      assert.equal(r.corpo.membros.length, 2);
      assert.equal((await b.lancar(dono.token, id)).corpo.seq, partida.seq + 1, 'o seq continua de onde parou');
    } finally {
      await b.fechar();
    }
  });

  test('a migração da modalidade troca fifa por futebol, avança o seq e poupa as demais', () => {
    const caminho = join(pasta, 'v1.db');
    const v1 = new DatabaseSync(caminho);
    v1.exec(MIGRACOES[0]);
    v1.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 1`);
    v1.exec(`
      INSERT INTO resenhas (id, nome, seq, chave_recuperacao_hash, criada_em) VALUES
        ('r-com-fifa', 'Com FIFA', 5, 'h1', 1), ('r-sem-fifa', 'Sem FIFA', 3, 'h2', 1);
      INSERT INTO membros (id, resenha_id, apelido, apelido_chave, papel, criado_em, seq) VALUES
        ('m1', 'r-com-fifa', 'A', 'a', 'criador', 1, 1), ('m2', 'r-sem-fifa', 'B', 'b', 'criador', 1, 1);
      INSERT INTO competidores (id, resenha_id, nome, nome_chave, criado_por, criado_em, seq) VALUES
        ('c1-aaaaaaaaaaaaaaaa', 'r-com-fifa', 'X', 'x', 'm1', 1, 1), ('c2-aaaaaaaaaaaaaaaa', 'r-com-fifa', 'Y', 'y', 'm1', 1, 1),
        ('c3-aaaaaaaaaaaaaaaa', 'r-sem-fifa', 'X', 'x', 'm2', 1, 1), ('c4-aaaaaaaaaaaaaaaa', 'r-sem-fifa', 'Y', 'y', 'm2', 1, 1);
      INSERT INTO partidas (id, resenha_id, lado_a, lado_b, placar_a, placar_b, modalidade, jogada_em, criado_por, criada_em, atualizada_em, seq) VALUES
        ('p1-aaaaaaaaaaaaaaaa', 'r-com-fifa', 'c1-aaaaaaaaaaaaaaaa', 'c2-aaaaaaaaaaaaaaaa', 1, 0, 'fifa', 1, 'm1', 1, 1, 4),
        ('p2-aaaaaaaaaaaaaaaa', 'r-com-fifa', 'c1-aaaaaaaaaaaaaaaa', 'c2-aaaaaaaaaaaaaaaa', 2, 0, 'outro', 1, 'm1', 1, 1, 5),
        ('p3-aaaaaaaaaaaaaaaa', 'r-sem-fifa', 'c3-aaaaaaaaaaaaaaaa', 'c4-aaaaaaaaaaaaaaaa', 2, 2, 'volei-areia', 1, 'm2', 1, 1, 3),
        ('p4-aaaaaaaaaaaaaaaa', 'r-com-fifa', 'c2-aaaaaaaaaaaaaaaa', 'c1-aaaaaaaaaaaaaaaa', 0, 1, 'fifa', 1, 'm1', 1, 1, 3);
    `);
    v1.close();
    const banco = abrirBanco(caminho);
    try {
      const modalidade = (id) => banco.um('SELECT modalidade, seq, rev FROM partidas WHERE id = ?', id);
      assert.deepEqual({ ...modalidade('p1-aaaaaaaaaaaaaaaa') }, { modalidade: 'futebol', seq: 6, rev: 1 });
      assert.deepEqual({ ...modalidade('p2-aaaaaaaaaaaaaaaa') }, { modalidade: 'outro', seq: 5, rev: 1 });
      assert.deepEqual({ ...modalidade('p3-aaaaaaaaaaaaaaaa') }, { modalidade: 'volei-areia', seq: 3, rev: 1 });
      assert.deepEqual({ ...modalidade('p4-aaaaaaaaaaaaaaaa') }, { modalidade: 'futebol', seq: 6, rev: 1 });
      const novas = banco.todos('SELECT id FROM partidas WHERE resenha_id = ? AND seq > 5 ORDER BY id', 'r-com-fifa');
      assert.deepEqual(
        novas.map((l) => l.id),
        ['p1-aaaaaaaaaaaaaaaa', 'p4-aaaaaaaaaaaaaaaa'],
        'quem estava em seq 5 baixa só as partidas alteradas',
      );
      assert.equal(banco.um('SELECT seq FROM resenhas WHERE id = ?', 'r-com-fifa').seq, 6);
      assert.equal(banco.um('SELECT seq FROM resenhas WHERE id = ?', 'r-sem-fifa').seq, 3);
    } finally {
      banco.fechar();
    }
  });

  test('a migração que tira a chave de recuperação preserva as linhas, as chaves estrangeiras e as sessões', () => {
    const caminho = join(pasta, 'v2.db');
    const v2 = new DatabaseSync(caminho);
    v2.exec('PRAGMA foreign_keys = ON');
    v2.exec(MIGRACOES[0]);
    v2.exec(MIGRACOES[1]);
    v2.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 2`);
    const token = gerarToken();
    v2.exec(`
      INSERT INTO resenhas (id, nome, seq, chave_recuperacao_hash, criada_em) VALUES
        ('r1', 'Resenha 1', 7, 'h1', 10), ('r2', 'Resenha 2', 2, 'h2', 20);
      INSERT INTO membros (id, resenha_id, apelido, apelido_chave, papel, criado_em, seq) VALUES
        ('m1', 'r1', 'A', 'a', 'criador', 10, 1), ('m2', 'r1', 'B', 'b', 'participante', 11, 2),
        ('m3', 'r2', 'C', 'c', 'criador', 20, 1);
      INSERT INTO sessoes (token_hash, membro_id, criada_em, ultimo_uso_em) VALUES
        ('${hashDe(token)}', 'm1', 10, 50), ('${hashDe('outra')}', 'm3', 20, 20);
      INSERT INTO convites (resenha_id, codigo_hash, criado_por, criado_em, expira_em) VALUES ('r1', 'c1', 'm1', 10, 99999);
      INSERT INTO transferencias (codigo_hash, membro_id, expira_em) VALUES ('t1', 'm2', 99999);
      INSERT INTO competidores (id, resenha_id, nome, nome_chave, criado_por, criado_em, seq) VALUES
        ('c1-aaaaaaaaaaaaaaaa', 'r1', 'X', 'x', 'm1', 10, 3), ('c2-aaaaaaaaaaaaaaaa', 'r1', 'Y', 'y', 'm1', 10, 3);
      INSERT INTO partidas (id, resenha_id, lado_a, lado_b, placar_a, placar_b, modalidade, jogada_em, criado_por, criada_em, atualizada_em, seq) VALUES
        ('p1-aaaaaaaaaaaaaaaa', 'r1', 'c1-aaaaaaaaaaaaaaaa', 'c2-aaaaaaaaaaaaaaaa', 3, 1, 'futebol', 10, 'm1', 10, 10, 4);
    `);
    const tabelas = ['resenhas', 'membros', 'sessoes', 'convites', 'transferencias', 'competidores', 'partidas'];
    const contar = (db) =>
      Object.fromEntries(tabelas.map((t) => [t, Number(db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n)]));
    const antes = contar(v2);
    v2.close();

    const banco = abrirBanco(caminho);
    try {
      assert.deepEqual(contar(banco.db), antes, 'nenhuma linha some, nem por cascata');
      const colunas = banco.todos("SELECT name FROM pragma_table_info('resenhas') ORDER BY cid").map((c) => c.name);
      assert.deepEqual(colunas, ['id', 'nome', 'seq', 'criada_em']);
      assert.deepEqual(
        { ...banco.um('SELECT * FROM resenhas WHERE id = ?', 'r1') },
        {
          id: 'r1',
          nome: 'Resenha 1',
          seq: 7,
          criada_em: 10,
        },
      );
      assert.deepEqual(banco.db.prepare('PRAGMA foreign_key_check').all(), []);
      assert.equal(Object.values(banco.db.prepare('PRAGMA foreign_keys').get())[0], 1);
      assert.equal(Object.values(banco.db.prepare('PRAGMA user_version').get())[0], MIGRACOES.length);
      assert.equal(autenticar(banco, token, 100)?.resenhaId, 'r1', 'a sessão existente continua válida');

      // As tabelas filhas apontam para a resenha nova: a exclusão em cascata segue funcionando.
      banco.executar('DELETE FROM resenhas WHERE id = ?', 'r1');
      assert.deepEqual(contar(banco.db), {
        resenhas: 1,
        membros: 1,
        sessoes: 1,
        convites: 0,
        transferencias: 0,
        competidores: 0,
        partidas: 0,
      });
    } finally {
      banco.fechar();
    }
  });

  test('o esquema nasce com os pragmas do contrato', () => {
    const banco = abrirBanco(':memory:');
    try {
      const pragma = (nome) => Object.values(banco.db.prepare(`PRAGMA ${nome}`).get())[0];
      assert.equal(pragma('application_id'), APPLICATION_ID);
      assert.equal(pragma('user_version'), MIGRACOES.length);
      assert.equal(pragma('foreign_keys'), 1);
      assert.equal(pragma('busy_timeout'), 5000);
      const tabelas = banco
        .todos("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .map((l) => l.name);
      for (const t of ['resenhas', 'membros', 'sessoes', 'convites', 'competidores', 'partidas', 'transferencias']) {
        assert.ok(tabelas.includes(t), t);
      }
    } finally {
      banco.fechar();
    }
  });

  test('banco de outro aplicativo é recusado', () => {
    const caminho = join(pasta, 'outro.db');
    const db = new DatabaseSync(caminho);
    db.exec('PRAGMA application_id = 12345; CREATE TABLE x (a INTEGER)');
    db.close();
    assert.throws(() => abrirBanco(caminho), /outro aplicativo/);
  });

  test('banco existente sem identificação é recusado', () => {
    const caminho = join(pasta, 'sem-id.db');
    const db = new DatabaseSync(caminho);
    db.exec('CREATE TABLE y (a INTEGER)');
    db.close();
    assert.throws(() => abrirBanco(caminho), /sem identificação/);
  });

  test('esquema de versão futura é recusado e o arquivo não é alterado', () => {
    const caminho = join(pasta, 'futuro.db');
    abrirBanco(caminho).fechar();
    const db = new DatabaseSync(caminho);
    db.exec(`PRAGMA user_version = ${MIGRACOES.length + 1}`);
    db.close();
    assert.throws(() => abrirBanco(caminho), /mais novo/);
    const conferir = new DatabaseSync(caminho);
    assert.equal(Object.values(conferir.prepare('PRAGMA user_version').get())[0], MIGRACOES.length + 1);
    conferir.close();
  });

  test('migrar é idempotente: reabrir não altera a versão', () => {
    const caminho = join(pasta, 'idempotente.db');
    abrirBanco(caminho).fechar();
    const banco = abrirBanco(caminho);
    try {
      assert.equal(Object.values(banco.db.prepare('PRAGMA user_version').get())[0], MIGRACOES.length);
    } finally {
      banco.fechar();
    }
  });

  test('o esquema recusa tipos errados (STRICT) e chave estrangeira inexistente', () => {
    const banco = abrirBanco(':memory:');
    try {
      assert.throws(() => banco.executar("INSERT INTO resenhas (id, nome, criada_em) VALUES ('a', 'n', 'texto')"));
      assert.throws(() =>
        banco.executar(
          "INSERT INTO membros (id, resenha_id, apelido, apelido_chave, papel, criado_em) VALUES ('m', 'inexistente', 'a', 'a', 'criador', 1)",
        ),
      );
    } finally {
      banco.fechar();
    }
  });
});
