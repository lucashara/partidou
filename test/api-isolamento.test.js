// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { iniciarServidor } from './ajuda/servidor.js';

describe('isolamento entre resenhas', () => {
  let s;
  let a;
  let b;
  let partidaB;
  let competidorB;
  let participanteB;

  before(async () => {
    s = await iniciarServidor();
    a = await s.criarResenha('Resenha A', 'Alice');
    b = await s.criarResenha('Resenha B', 'Bruno');
    participanteB = await s.entrar(b.convite, 'Carla');
    const lancada = await s.lancar(b.token, b.id);
    partidaB = lancada.corpo.partida;
    competidorB = lancada.corpo.competidores[0];
    await s.lancar(a.token, a.id);
  });
  after(() => s.fechar());

  const inexistente = 'AAAAAAAAAAAAAAAAAAAAAA';

  /** Rotas que recebem a resenha na URL, com os recursos de B quando há. */
  function rotas(id) {
    return [
      ['GET', `/api/resenhas/${id}/estado`],
      ['GET', `/api/resenhas/${id}/estado?desde=1`],
      ['GET', `/api/resenhas/${id}/eventos`],
      ['PATCH', `/api/resenhas/${id}`, { nome: 'Invadida' }],
      ['DELETE', `/api/resenhas/${id}`],
      ['POST', `/api/resenhas/${id}/convite`],
      ['DELETE', `/api/resenhas/${id}/convite`],
      ['POST', `/api/resenhas/${id}/chave-recuperacao`],
      ['POST', `/api/resenhas/${id}/partidas`, { ladoA: { nome: 'X' }, ladoB: { nome: 'Y' }, placarA: 1, placarB: 0 }],
      ['PATCH', `/api/resenhas/${id}/partidas/${partidaB.id}`, { rev: 1, placarA: 9 }],
      ['DELETE', `/api/resenhas/${id}/partidas/${partidaB.id}?rev=1`],
      ['POST', `/api/resenhas/${id}/partidas/${partidaB.id}/restaurar`, { rev: 1 }],
      ['PATCH', `/api/resenhas/${id}/competidores/${competidorB.id}`, { nome: 'Invadido' }],
      ['DELETE', `/api/resenhas/${id}/membros/${participanteB.membro.id}`],
      ['DELETE', `/api/resenhas/${id}/membros/eu`],
    ];
  }

  test('token de A em toda rota de B responde 404 NAO_ENCONTRADO', async () => {
    for (const [metodo, caminho, corpo] of rotas(b.id)) {
      const r = await s.chamar(metodo, caminho, { token: a.token, corpo });
      assert.equal(r.status, 404, `${metodo} ${caminho}`);
      assert.equal(r.corpo.erro.codigo, 'NAO_ENCONTRADO', `${metodo} ${caminho}`);
    }
  });

  test('a resposta é idêntica à de uma resenha inexistente', async () => {
    const alvo = rotas(b.id);
    const vazio = rotas(inexistente);
    for (const [i, [metodo, caminho, corpo]] of alvo.entries()) {
      const contra = await s.chamar(metodo, caminho, { token: a.token, corpo });
      const [metodo2, caminho2, corpo2] = vazio[i];
      const inex = await s.chamar(metodo2, caminho2, { token: a.token, corpo: corpo2 });
      assert.equal(contra.status, inex.status, caminho);
      assert.deepEqual(contra.corpo, inex.corpo, caminho);
    }
  });

  test('recursos de B dentro da URL de A também são 404', async () => {
    const casos = [
      ['PATCH', `/api/resenhas/${a.id}/partidas/${partidaB.id}`, { rev: 1, placarA: 9 }],
      ['DELETE', `/api/resenhas/${a.id}/partidas/${partidaB.id}?rev=1`],
      ['POST', `/api/resenhas/${a.id}/partidas/${partidaB.id}/restaurar`, { rev: 1 }],
      ['PATCH', `/api/resenhas/${a.id}/competidores/${competidorB.id}`, { nome: 'Invadido' }],
      ['DELETE', `/api/resenhas/${a.id}/membros/${participanteB.membro.id}`],
      ['DELETE', `/api/resenhas/${a.id}/membros/${b.membro.id}`],
    ];
    for (const [metodo, caminho, corpo] of casos) {
      const r = await s.chamar(metodo, caminho, { token: a.token, corpo });
      assert.equal(r.status, 404, `${metodo} ${caminho}`);
    }
  });

  test('os dados de B permanecem intactos', async () => {
    const r = await s.chamar('GET', `/api/resenhas/${b.id}/estado`, { token: b.token });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.resenha.nome, 'Resenha B');
    assert.equal(r.corpo.membros.length, 2);
    assert.equal(r.corpo.partidas.length, 1);
    assert.equal(r.corpo.partidas[0].rev, 1);
    assert.equal(r.corpo.partidas[0].excluida, false);
    assert.ok(r.corpo.competidores.some((c) => c.id === competidorB.id && c.nome === competidorB.nome));
  });

  test('o estado de A não contém nada de B', async () => {
    const r = await s.chamar('GET', `/api/resenhas/${a.id}/estado`, { token: a.token });
    const texto = JSON.stringify(r.corpo);
    assert.equal(r.corpo.partidas.length, 1);
    assert.ok(!texto.includes(b.id));
    assert.ok(!texto.includes(partidaB.id));
    assert.ok(!texto.includes(competidorB.id));
    assert.ok(!texto.includes(b.membro.id));
    assert.ok(!texto.includes('Bruno') && !texto.includes('Carla'));
  });

  test('competidor de B referenciado por id em A é ignorado', async () => {
    const semNome = await s.chamar('POST', `/api/resenhas/${a.id}/partidas`, {
      token: a.token,
      corpo: { ladoA: { id: competidorB.id }, ladoB: { nome: 'Outro' }, placarA: 1, placarB: 0 },
    });
    assert.equal(semNome.status, 400);
    assert.equal(semNome.corpo.erro.campo, 'ladoA.nome');
    const comNome = await s.chamar('POST', `/api/resenhas/${a.id}/partidas`, {
      token: a.token,
      corpo: { ladoA: { id: competidorB.id, nome: 'Novo' }, ladoB: { nome: 'Outro' }, placarA: 1, placarB: 0 },
    });
    assert.equal(comNome.status, 201);
    assert.notEqual(comNome.corpo.partida.ladoA, competidorB.id);
  });

  test('id de partida de B reutilizado em A é recusado', async () => {
    const r = await s.chamar('POST', `/api/resenhas/${a.id}/partidas`, {
      token: a.token,
      corpo: { id: partidaB.id, ladoA: { nome: 'Alice' }, ladoB: { nome: 'Zé' }, placarA: 1, placarB: 0 },
    });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'ID_EM_USO');
  });

  test('token inventado ou ausente não alcança nenhuma resenha', async () => {
    const adulterado = a.token.slice(0, -1) + (a.token.endsWith('A') ? 'B' : 'A');
    for (const token of ['x'.repeat(43), 'curto', adulterado]) {
      const r = await s.chamar('GET', `/api/resenhas/${a.id}/estado`, { token });
      assert.equal(r.status, 401);
      assert.equal(r.corpo.erro.codigo, 'NAO_AUTENTICADO');
    }
    const semToken = await s.chamar('GET', `/api/resenhas/${a.id}/estado`);
    assert.equal(semToken.status, 401);
  });

  test('o convite de A só revela A', async () => {
    const r = await s.chamar('POST', '/api/convites/consultar', { corpo: { codigo: a.convite.codigo } });
    assert.equal(r.corpo.resenhaNome, 'Resenha A');
    assert.equal(r.corpo.membros, 1);
  });
});
