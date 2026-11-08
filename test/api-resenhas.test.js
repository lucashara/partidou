// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { iniciarServidor } from './ajuda/servidor.js';

const DIA = 24 * 3600_000;

describe('criação de resenha', () => {
  let s;
  before(async () => {
    s = await iniciarServidor();
  });
  after(() => s.fechar());

  test('devolve resenha, criador, token, chave e convite', async () => {
    const antes = s.relogio.agora();
    const r = await s.chamar('POST', '/api/resenhas', {
      corpo: { nome: '  Resenha   do Sábado ', apelido: ' Lucas ' },
    });
    assert.equal(r.status, 201);
    const { resenha, membro, token, chaveRecuperacao, convite } = r.corpo;
    assert.match(resenha.id, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(resenha.nome, 'Resenha do Sábado');
    assert.equal(resenha.criadaEm, antes);
    assert.equal(resenha.seq, 1);
    assert.match(membro.id, /^[A-Za-z0-9_-]{12}$/);
    assert.deepEqual(
      { apelido: membro.apelido, papel: membro.papel, criadoEm: membro.criadoEm },
      { apelido: 'Lucas', papel: 'criador', criadoEm: antes },
    );
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.match(chaveRecuperacao, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
    assert.match(convite.codigo, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
    assert.equal(convite.expiraEm, antes + 7 * DIA);
    assert.deepEqual(Object.keys(r.corpo).sort(), ['chaveRecuperacao', 'convite', 'membro', 'resenha', 'token']);
  });

  test('o token devolvido autentica o criador', async () => {
    const { token, id, membro } = await s.criarResenha('Teste', 'Ana');
    const e = await s.chamar('GET', `/api/resenhas/${id}/estado`, { token });
    assert.equal(e.status, 200);
    assert.deepEqual(e.corpo.eu, { membroId: membro.id, papel: 'criador', apelido: 'Ana' });
  });

  test('cada resenha recebe identificador, token, chave e convite próprios', async () => {
    const x = await s.criarResenha();
    const y = await s.criarResenha();
    assert.notEqual(x.id, y.id);
    assert.notEqual(x.token, y.token);
    assert.notEqual(x.chaveRecuperacao, y.chaveRecuperacao);
    assert.notEqual(x.convite.codigo, y.convite.codigo);
  });

  test('limites de nome e apelido', async () => {
    const ok = await s.chamar('POST', '/api/resenhas', { corpo: { nome: 'n'.repeat(40), apelido: 'a'.repeat(24) } });
    assert.equal(ok.status, 201);
    const casos = [
      [{ nome: 'n'.repeat(41), apelido: 'Ana' }, 'nome'],
      [{ nome: '', apelido: 'Ana' }, 'nome'],
      [{ nome: '   ', apelido: 'Ana' }, 'nome'],
      [{ nome: 'Resenha', apelido: 'a'.repeat(25) }, 'apelido'],
      [{ nome: 'Resenha', apelido: '' }, 'apelido'],
      [{ nome: 'Resenha' }, 'apelido'],
      [{ apelido: 'Ana' }, 'nome'],
      [{ nome: 123, apelido: 'Ana' }, 'nome'],
      [{ nome: 'Res\u0000enha', apelido: 'Ana' }, 'nome'],
    ];
    for (const [corpo, campo] of casos) {
      const r = await s.chamar('POST', '/api/resenhas', { corpo });
      assert.equal(r.status, 400, JSON.stringify(corpo));
      assert.equal(r.corpo.erro.codigo, 'REQUISICAO_INVALIDA');
      assert.equal(r.corpo.erro.campo, campo);
    }
  });

  test('renomear exige criador e respeita o limite', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const certo = await s.chamar('PATCH', `/api/resenhas/${id}`, { token: dono.token, corpo: { nome: 'Novo nome' } });
    assert.equal(certo.status, 200);
    assert.equal(certo.corpo.resenha.nome, 'Novo nome');
    assert.ok(certo.corpo.seq > 2);
    const longo = await s.chamar('PATCH', `/api/resenhas/${id}`, {
      token: dono.token,
      corpo: { nome: 'n'.repeat(41) },
    });
    assert.equal(longo.status, 400);
    const negado = await s.chamar('PATCH', `/api/resenhas/${id}`, { token: visita.token, corpo: { nome: 'Golpe' } });
    assert.equal(negado.status, 403);
    assert.equal(negado.corpo.erro.codigo, 'PERMISSAO_NEGADA');
  });
});

describe('log', () => {
  test('não registra token, convite, chave, corpo nem cabeçalho de autorização', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'partidou-log-'));
    const s = await iniciarServidor({ config: { logDir: pasta } });
    try {
      const dono = await s.criarResenha('Resenha Secreta', 'Apelido Reservado');
      const visita = await s.entrar(dono.convite, 'Outro Apelido');
      const transferencia = await s.chamar('POST', '/api/acesso/transferencia', { token: dono.token });
      await s.chamar('GET', `/api/resenhas/${dono.id}/estado`, { token: dono.token });
      await s.lancar(visita.token, dono.id, { ladoA: { nome: 'Competidor Reservado' } });
      await s.chamar('POST', '/api/acesso/recuperar', { corpo: { chave: 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ' } });
      await s.chamar('GET', `/api/resenhas/${dono.id}/estado`, { token: 'token-errado-token-errado-token-errado' });

      const log = readFileSync(join(pasta, 'partidou.log'), 'utf8');
      const normalizar = (t) => t.replaceAll('-', '');
      const proibidos = [
        dono.token,
        visita.token,
        dono.chaveRecuperacao,
        dono.convite.codigo,
        transferencia.corpo.codigo,
        'Resenha Secreta',
        'Apelido Reservado',
        'Competidor Reservado',
        'Authorization',
        'Bearer',
        dono.id,
        dono.membro.id,
      ];
      for (const valor of proibidos) {
        assert.ok(!log.includes(valor), `log contém ${valor.slice(0, 6)}...`);
        assert.ok(!normalizar(log).includes(normalizar(valor)) || valor.length < 10, 'log contém forma sem hífen');
      }
      const linhas = log
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      const requisicoes = linhas.filter((l) => l.evento === 'requisicao');
      assert.ok(requisicoes.length >= 6);
      assert.ok(
        requisicoes.some((l) => l.rota === '/api/resenhas/:id/estado' && l.metodo === 'GET' && l.status === 200),
      );
      for (const l of requisicoes) {
        assert.ok(typeof l.ms === 'number');
        assert.ok(!l.rota.includes(dono.id));
      }
      const falha401 = requisicoes.find((l) => l.status === 401);
      assert.ok(falha401?.ip, 'IP registrado apenas em eventos de segurança');
      const sucesso = requisicoes.find((l) => l.status === 200);
      assert.equal(sucesso.ip, undefined);
    } finally {
      await s.fechar();
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});
