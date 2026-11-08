// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { iniciarServidor } from './ajuda/servidor.js';

describe('concorrência', () => {
  let s;
  before(async () => {
    s = await iniciarServidor();
  });
  after(() => s.fechar());

  test('20 criações paralelas do mesmo id resultam em uma linha', async () => {
    const { dono, id } = await s.resenhaComDois();
    const corpo = { id: crypto.randomUUID(), ladoA: { nome: 'A' }, ladoB: { nome: 'B' }, placarA: 1, placarB: 0 };
    const respostas = await Promise.all(
      Array.from({ length: 20 }, () => s.chamar('POST', `/api/resenhas/${id}/partidas`, { token: dono.token, corpo })),
    );
    assert.equal(respostas.filter((r) => r.status === 201).length, 1);
    assert.equal(respostas.filter((r) => r.status === 200).length, 19);
    assert.equal(s.ctx.banco.um('SELECT count(*) AS n FROM partidas WHERE resenha_id = ?', id).n, 1);
    assert.equal(s.ctx.banco.um('SELECT count(*) AS n FROM competidores WHERE resenha_id = ?', id).n, 2);
    assert.equal(new Set(respostas.map((r) => r.corpo.seq)).size, 1);
  });

  test('duas edições paralelas com o mesmo rev: um 200 e um 409', async () => {
    const { dono, id } = await s.resenhaComDois();
    const p = (await s.lancar(dono.token, id)).corpo.partida;
    const editar = (placarA) =>
      s.chamar('PATCH', `/api/resenhas/${id}/partidas/${p.id}`, { token: dono.token, corpo: { rev: 1, placarA } });
    const [a, b] = await Promise.all([editar(5), editar(6)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const perdedora = a.status === 409 ? a : b;
    assert.equal(perdedora.corpo.erro.codigo, 'CONFLITO_REVISAO');
    assert.equal(perdedora.corpo.erro.atual.rev, 2);
  });

  test('criações paralelas mantêm seq estritamente crescente e sem repetição', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const respostas = await Promise.all(
      Array.from({ length: 30 }, (_, i) => s.lancar(i % 2 ? dono.token : visita.token, id)),
    );
    assert.ok(respostas.every((r) => r.status === 201));
    const seqs = respostas.map((r) => r.corpo.partida.seq);
    assert.equal(new Set(seqs).size, 30, 'cada transação usa um seq próprio');
    const estado = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo;
    assert.equal(estado.seq, Math.max(...seqs));
    const competidores = estado.competidores.length;
    assert.equal(competidores, 2, 'competidores com o mesmo nome não duplicam sob concorrência');
  });

  test('aceitar convites em paralelo respeita o limite de membros', async () => {
    const t = await iniciarServidor({ config: { maxMembros: 5 } });
    try {
      const dono = await t.criarResenha();
      const respostas = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          t.chamar('POST', '/api/convites/aceitar', { corpo: { codigo: dono.convite.codigo, apelido: `P${i}` } }),
        ),
      );
      assert.equal(respostas.filter((r) => r.status === 201).length, 4);
      assert.equal(respostas.filter((r) => r.status === 403).length, 8);
      assert.equal(t.ctx.banco.um('SELECT count(*) AS n FROM membros WHERE resenha_id = ?', dono.id).n, 5);
    } finally {
      await t.fechar();
    }
  });
});
