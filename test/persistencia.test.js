// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { abrirBanco } from '../server/banco.js';
import { APPLICATION_ID, MIGRACOES } from '../server/migracoes.js';
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
      assert.throws(() =>
        banco.executar(
          "INSERT INTO resenhas (id, nome, chave_recuperacao_hash, criada_em) VALUES ('a', 'n', 'h', 'texto')",
        ),
      );
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
