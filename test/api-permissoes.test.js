// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { iniciarServidor } from './ajuda/servidor.js';

describe('permissões', () => {
  let s;
  before(async () => {
    s = await iniciarServidor();
  });
  after(() => s.fechar());

  const negado = (r) => {
    assert.equal(r.status, 403);
    assert.equal(r.corpo.erro.codigo, 'PERMISSAO_NEGADA');
  };

  test('participante não administra a resenha', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const outro = await s.entrar(dono.convite, 'Outro');
    const t = visita.token;
    negado(await s.chamar('POST', `/api/resenhas/${id}/convite`, { token: t }));
    negado(await s.chamar('DELETE', `/api/resenhas/${id}/convite`, { token: t }));
    negado(await s.chamar('PATCH', `/api/resenhas/${id}`, { token: t, corpo: { nome: 'Golpe' } }));
    negado(await s.chamar('DELETE', `/api/resenhas/${id}/membros/${outro.membro.id}`, { token: t }));
    negado(await s.chamar('DELETE', `/api/resenhas/${id}/membros/${dono.membro.id}`, { token: t }));
    negado(await s.chamar('DELETE', `/api/resenhas/${id}`, { token: t }));

    const estado = await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token });
    assert.equal(estado.corpo.resenha.nome, 'Resenha');
    assert.equal(estado.corpo.membros.length, 3);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: outro.token })).status, 200);
    const conviteAindaValido = await s.chamar('POST', '/api/convites/consultar', {
      corpo: { codigo: dono.convite.codigo },
    });
    assert.equal(conviteAindaValido.status, 200);
  });

  test('participante só mexe nas partidas que lançou', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const doDono = (await s.lancar(dono.token, id)).corpo.partida;
    const daVisita = (await s.lancar(visita.token, id)).corpo.partida;
    const base = `/api/resenhas/${id}/partidas`;

    negado(await s.chamar('PATCH', `${base}/${doDono.id}`, { token: visita.token, corpo: { rev: 1, placarA: 9 } }));
    negado(await s.chamar('DELETE', `${base}/${doDono.id}?rev=1`, { token: visita.token }));
    negado(await s.chamar('POST', `${base}/${doDono.id}/restaurar`, { token: visita.token, corpo: { rev: 1 } }));

    const edita = await s.chamar('PATCH', `${base}/${daVisita.id}`, {
      token: visita.token,
      corpo: { rev: 1, placarA: 5 },
    });
    assert.equal(edita.status, 200);
    const exclui = await s.chamar('DELETE', `${base}/${daVisita.id}?rev=2`, { token: visita.token });
    assert.equal(exclui.status, 200);
    const restaura = await s.chamar('POST', `${base}/${daVisita.id}/restaurar`, {
      token: visita.token,
      corpo: { rev: 3 },
    });
    assert.equal(restaura.status, 200);
  });

  test('criador faz tudo nas partidas dos outros', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const daVisita = (await s.lancar(visita.token, id)).corpo.partida;
    const base = `/api/resenhas/${id}/partidas/${daVisita.id}`;
    const edita = await s.chamar('PATCH', base, { token: dono.token, corpo: { rev: 1, placarB: 4 } });
    assert.equal(edita.status, 200);
    assert.equal(edita.corpo.partida.criadoPor, visita.membro.id);
    assert.equal(edita.corpo.partida.editadoPor, dono.membro.id);
    assert.equal((await s.chamar('DELETE', `${base}?rev=2`, { token: dono.token })).status, 200);
    assert.equal((await s.chamar('POST', `${base}/restaurar`, { token: dono.token, corpo: { rev: 3 } })).status, 200);
  });

  test('renomear competidor é restrito ao criador da resenha, mesmo para quem o criou', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const doDono = (await s.lancar(dono.token, id, { ladoA: { nome: 'Alfa' }, ladoB: { nome: 'Beta' } })).corpo;
    const daVisita = (await s.lancar(visita.token, id, { ladoA: { nome: 'Gama' }, ladoB: { nome: 'Alfa' } })).corpo;
    const alfa = doDono.competidores[0];
    const gama = daVisita.competidores.find((c) => c.nome === 'Gama');
    assert.equal(daVisita.competidores.find((c) => c.nome === 'Alfa').id, alfa.id);

    for (const alvo of [alfa, gama]) {
      negado(
        await s.chamar('PATCH', `/api/resenhas/${id}/competidores/${alvo.id}`, {
          token: visita.token,
          corpo: { nome: 'Golpe' },
        }),
      );
    }
    const criador = await s.chamar('PATCH', `/api/resenhas/${id}/competidores/${gama.id}`, {
      token: dono.token,
      corpo: { nome: 'Delta' },
    });
    assert.equal(criador.status, 200);
    assert.equal(criador.corpo.competidor.nome, 'Delta');
  });

  test('renomear competidor: conflito por chave de nome e seq', async () => {
    const { dono, id } = await s.resenhaComDois();
    const { competidores } = (await s.lancar(dono.token, id, { ladoA: { nome: 'Alfa' }, ladoB: { nome: 'Beta' } }))
      .corpo;
    const [alfa, beta] = competidores;
    const conflito = await s.chamar('PATCH', `/api/resenhas/${id}/competidores/${beta.id}`, {
      token: dono.token,
      corpo: { nome: ' ALFA ' },
    });
    assert.equal(conflito.status, 409);
    const mesmaChave = await s.chamar('PATCH', `/api/resenhas/${id}/competidores/${alfa.id}`, {
      token: dono.token,
      corpo: { nome: 'ALFA' },
    });
    assert.equal(mesmaChave.status, 200);
    assert.equal(mesmaChave.corpo.competidor.nome, 'ALFA');
    assert.ok(mesmaChave.corpo.competidor.seq > alfa.seq);
    assert.equal(
      (
        await s.chamar('PATCH', `/api/resenhas/${id}/competidores/${alfa.id}`, {
          token: dono.token,
          corpo: { nome: '' },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await s.chamar('PATCH', `/api/resenhas/${id}/competidores/inexistente`, {
          token: dono.token,
          corpo: { nome: 'X' },
        })
      ).status,
      404,
    );
  });

  test('apelido igual ao do criador não concede papel', async () => {
    const dono = await s.criarResenha('R', 'Lucas');
    const r = await s.chamar('POST', '/api/convites/aceitar', {
      corpo: { codigo: dono.convite.codigo, apelido: 'lucas' },
    });
    assert.equal(r.status, 409);
    const outro = await s.entrar(dono.convite, 'Lucas 2');
    assert.equal(outro.membro.papel, 'participante');
    negado(await s.chamar('POST', `/api/resenhas/${dono.id}/convite`, { token: outro.token }));
  });

  test('o criador administra: remove membro, e o removido perde o acesso', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const lancada = (await s.lancar(visita.token, id)).corpo;
    const r = await s.chamar('DELETE', `/api/resenhas/${id}/membros/${visita.membro.id}`, { token: dono.token });
    assert.equal(r.status, 204);
    const acesso = await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: visita.token });
    assert.equal(acesso.status, 401);
    const estado = await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token });
    assert.equal(estado.corpo.membros.length, 1);
    assert.equal(estado.corpo.partidas.length, 1, 'remover membro não apaga as partidas dele');
    assert.equal(estado.corpo.partidas[0].id, lancada.partida.id);
    assert.equal(
      (await s.chamar('DELETE', `/api/resenhas/${id}/membros/${visita.membro.id}`, { token: dono.token })).status,
      404,
    );
  });

  test('o criador não sai nem se remove', async () => {
    const { dono, id } = await s.resenhaComDois();
    for (const caminho of [`/api/resenhas/${id}/membros/${dono.membro.id}`, `/api/resenhas/${id}/membros/eu`]) {
      const r = await s.chamar('DELETE', caminho, { token: dono.token });
      assert.equal(r.status, 409);
      assert.equal(r.corpo.erro.codigo, 'CRIADOR_NAO_SAI');
    }
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).status, 200);
  });

  test('participante sai da resenha e o apelido volta a ficar livre', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    assert.equal((await s.chamar('DELETE', `/api/resenhas/${id}/membros/eu`, { token: visita.token })).status, 204);
    assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: visita.token })).status, 401);
    const volta = await s.entrar(dono.convite, 'Visita');
    assert.notEqual(volta.membro.id, visita.membro.id);
  });

  test('o criador exclui a resenha e tudo que depende dela', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    await s.lancar(dono.token, id);
    const r = await s.chamar('DELETE', `/api/resenhas/${id}`, { token: dono.token });
    assert.equal(r.status, 204);
    for (const token of [dono.token, visita.token])
      assert.equal((await s.chamar('GET', `/api/resenhas/${id}/estado`, { token })).status, 401);
    const contagens = {
      resenhas: ['SELECT count(*) AS n FROM resenhas WHERE id = ?', id],
      membros: ['SELECT count(*) AS n FROM membros WHERE resenha_id = ?', id],
      sessoes: ['SELECT count(*) AS n FROM sessoes WHERE membro_id IN (?, ?)', dono.membro.id, visita.membro.id],
      convites: ['SELECT count(*) AS n FROM convites WHERE resenha_id = ?', id],
      competidores: ['SELECT count(*) AS n FROM competidores WHERE resenha_id = ?', id],
      partidas: ['SELECT count(*) AS n FROM partidas WHERE resenha_id = ?', id],
    };
    for (const [tabela, [sql, ...parametros]] of Object.entries(contagens)) {
      assert.equal(s.ctx.banco.um(sql, ...parametros)?.n, 0, tabela);
    }
    assert.equal(
      (await s.chamar('POST', '/api/convites/consultar', { corpo: { codigo: dono.convite.codigo } })).status,
      404,
    );
  });
});
