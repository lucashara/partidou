// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { iniciarServidor } from './ajuda/servidor.js';

const DIA = 24 * 3600_000;

describe('convites', () => {
  let s;
  before(async () => {
    s = await iniciarServidor({ config: { maxMembros: 4 } });
  });
  after(() => s.fechar());

  const aceitar = (codigo, apelido) => s.chamar('POST', '/api/convites/aceitar', { corpo: { codigo, apelido } });
  const consultar = (codigo) => s.chamar('POST', '/api/convites/consultar', { corpo: { codigo } });

  test('consultar informa nome, validade e quantidade de membros', async () => {
    const dono = await s.criarResenha('Resenha do Fim de Semana', 'Dono');
    const r = await consultar(dono.convite.codigo);
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { resenhaNome: 'Resenha do Fim de Semana', expiraEm: dono.convite.expiraEm, membros: 1 });
  });

  test('o código aceita minúsculas, sem hífen e com confusões de leitura', async () => {
    const dono = await s.criarResenha();
    const minusculo = dono.convite.codigo.toLowerCase().replaceAll('-', ' ');
    assert.equal((await consultar(minusculo)).status, 200);
    assert.equal((await consultar(dono.convite.codigo.replaceAll('-', ''))).status, 200);
  });

  test('aceitar cria participante com sessão própria e incrementa usos', async () => {
    const dono = await s.criarResenha();
    const r = await aceitar(dono.convite.codigo, '  Bia  ');
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.corpo).sort(), ['membro', 'resenha', 'token']);
    assert.equal(r.corpo.membro.papel, 'participante');
    assert.equal(r.corpo.membro.apelido, 'Bia');
    assert.equal(r.corpo.resenha.id, dono.id);
    assert.ok(r.corpo.resenha.seq >= 2);

    const estado = await s.chamar('GET', `/api/resenhas/${dono.id}/estado`, { token: r.corpo.token });
    assert.equal(estado.status, 200);
    assert.equal(estado.corpo.eu.papel, 'participante');
    assert.equal(estado.corpo.membros.length, 2);

    await aceitar(dono.convite.codigo, 'Caio');
    const { usos } = s.ctx.banco.um('SELECT usos FROM convites WHERE resenha_id = ?', dono.id);
    assert.equal(usos, 2);
    const aposAceitar = await consultar(dono.convite.codigo);
    assert.equal(aposAceitar.corpo.membros, 3);
  });

  test('apelido repetido é 409, também com outra caixa ou acento', async () => {
    const dono = await s.criarResenha('R', 'José');
    for (const apelido of ['José', 'jose', 'JOSÉ', ' Jose ']) {
      const r = await aceitar(dono.convite.codigo, apelido);
      assert.equal(r.status, 409, apelido);
      assert.equal(r.corpo.erro.codigo, 'APELIDO_EM_USO');
    }
    const { usos } = s.ctx.banco.um('SELECT usos FROM convites WHERE resenha_id = ?', dono.id);
    assert.equal(usos, 0);
  });

  test('apelido inválido é 400', async () => {
    const dono = await s.criarResenha();
    for (const apelido of ['', 'a'.repeat(25), 7, undefined]) {
      const r = await aceitar(dono.convite.codigo, apelido);
      assert.equal(r.status, 400);
      assert.equal(r.corpo.erro.campo, 'apelido');
    }
  });

  test('convite inexistente, malformado, revogado e expirado respondem igual', async () => {
    const dono = await s.criarResenha();
    const revogado = await s.criarResenha();
    await s.chamar('DELETE', `/api/resenhas/${revogado.id}/convite`, { token: revogado.token });
    const expirado = await s.criarResenha();
    const substituido = await s.criarResenha();
    await s.chamar('POST', `/api/resenhas/${substituido.id}/convite`, { token: substituido.token });

    const respostas = [];
    respostas.push(await consultar('0000-0000-0000'));
    respostas.push(await consultar('abc'));
    respostas.push(await consultar(revogado.convite.codigo));
    respostas.push(await consultar(substituido.convite.codigo));
    respostas.push(await aceitar('0000-0000-0000', 'X'));
    respostas.push(await aceitar(revogado.convite.codigo, 'X'));
    s.relogio.avancar(7 * DIA + 1);
    respostas.push(await consultar(expirado.convite.codigo));
    respostas.push(await aceitar(expirado.convite.codigo, 'X'));
    for (const r of respostas) {
      assert.equal(r.status, 404);
      assert.deepEqual(r.corpo, { erro: { codigo: 'CONVITE_INVALIDO', mensagem: 'Convite inválido ou expirado.' } });
    }
    assert.ok(dono);
  });

  test('o convite vale até o fim do sétimo dia', async () => {
    const dono = await s.criarResenha();
    s.relogio.avancar(7 * DIA - 1000);
    assert.equal((await consultar(dono.convite.codigo)).status, 200);
    s.relogio.avancar(1000);
    assert.equal((await consultar(dono.convite.codigo)).status, 404);
  });

  test('gerar convite novo revoga o anterior', async () => {
    const dono = await s.criarResenha();
    const novo = await s.chamar('POST', `/api/resenhas/${dono.id}/convite`, { token: dono.token });
    assert.equal(novo.status, 201);
    assert.match(novo.corpo.codigo, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){2}$/);
    assert.equal((await consultar(dono.convite.codigo)).status, 404);
    assert.equal((await consultar(novo.corpo.codigo)).status, 200);
    const ativos = s.ctx.banco.um(
      'SELECT count(*) AS n FROM convites WHERE resenha_id = ? AND revogado_em IS NULL',
      dono.id,
    );
    assert.equal(ativos.n, 1);
  });

  test('revogar convite devolve 204 e é idempotente', async () => {
    const dono = await s.criarResenha();
    const r = await s.chamar('DELETE', `/api/resenhas/${dono.id}/convite`, { token: dono.token });
    assert.equal(r.status, 204);
    assert.equal(r.texto, '');
    assert.equal((await s.chamar('DELETE', `/api/resenhas/${dono.id}/convite`, { token: dono.token })).status, 204);
    assert.equal((await aceitar(dono.convite.codigo, 'Tarde')).status, 404);
  });

  test('resenha cheia recusa novos membros com 403 RESENHA_CHEIA', async () => {
    const dono = await s.criarResenha();
    for (const apelido of ['A1', 'A2', 'A3']) assert.equal((await aceitar(dono.convite.codigo, apelido)).status, 201);
    const r = await aceitar(dono.convite.codigo, 'A4');
    assert.equal(r.status, 403);
    assert.equal(r.corpo.erro.codigo, 'RESENHA_CHEIA');
  });

  test('vaga liberada por quem saiu volta a ficar disponível', async () => {
    const dono = await s.criarResenha();
    const membros = [];
    for (const apelido of ['B1', 'B2', 'B3']) membros.push((await aceitar(dono.convite.codigo, apelido)).corpo);
    assert.equal((await aceitar(dono.convite.codigo, 'B4')).status, 403);
    const saiu = await s.chamar('DELETE', `/api/resenhas/${dono.id}/membros/eu`, { token: membros[0].token });
    assert.equal(saiu.status, 204);
    assert.equal((await aceitar(dono.convite.codigo, 'B1')).status, 201);
  });

  test('campos ausentes ou de tipo errado são 400', async () => {
    assert.equal((await s.chamar('POST', '/api/convites/consultar', { corpo: {} })).status, 400);
    assert.equal((await s.chamar('POST', '/api/convites/consultar', { corpo: { codigo: 12 } })).status, 400);
    assert.equal((await s.chamar('POST', '/api/convites/aceitar', { corpo: { apelido: 'X' } })).status, 400);
  });
});
