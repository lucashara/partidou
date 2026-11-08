// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { calcularEstatisticas } from '../compartilhado/estatisticas.js';
import { iniciarServidor } from './ajuda/servidor.js';

describe('lançamento de partidas', () => {
  let s;
  let dono;
  let visita;
  let id;
  const url = () => `/api/resenhas/${id}/partidas`;

  before(async () => {
    s = await iniciarServidor();
  });
  after(() => s.fechar());
  // Resenha nova por teste mantém os contadores de seq previsíveis.
  const preparar = async () => {
    ({ dono, visita, id } = await s.resenhaComDois());
  };

  test('cria a partida e os competidores novos', async () => {
    await preparar();
    const uuid = crypto.randomUUID();
    const jogadaEm = s.relogio.agora() - 3600_000;
    const r = await s.chamar('POST', url(), {
      token: visita.token,
      corpo: {
        id: uuid,
        ladoA: { nome: ' Lucas ' },
        ladoB: { nome: 'João' },
        placarA: 3,
        placarB: 2,
        modalidade: 'futebol',
        jogadaEm,
      },
    });
    assert.equal(r.status, 201);
    const { partida, competidores, seq } = r.corpo;
    assert.deepEqual(partida, {
      id: uuid,
      ladoA: competidores[0].id,
      ladoB: competidores[1].id,
      placarA: 3,
      placarB: 2,
      penaltisA: null,
      penaltisB: null,
      modalidade: 'futebol',
      jogadaEm,
      criadoPor: visita.membro.id,
      editadoPor: null,
      criadaEm: s.relogio.agora(),
      atualizadaEm: s.relogio.agora(),
      rev: 1,
      excluida: false,
      seq,
    });
    assert.deepEqual(
      competidores.map((c) => c.nome),
      ['Lucas', 'João'],
    );
    assert.equal(competidores[0].criadoPor, visita.membro.id);
    assert.equal(seq, 3);
  });

  test('é idempotente: o mesmo id repetido devolve 200 e uma única linha', async () => {
    await preparar();
    const corpo = { id: crypto.randomUUID(), ladoA: { nome: 'A' }, ladoB: { nome: 'B' }, placarA: 1, placarB: 0 };
    const primeira = await s.chamar('POST', url(), { token: visita.token, corpo });
    const segunda = await s.chamar('POST', url(), { token: visita.token, corpo });
    assert.equal(primeira.status, 201);
    assert.equal(segunda.status, 200);
    assert.deepEqual(segunda.corpo.partida, primeira.corpo.partida);
    assert.equal(segunda.corpo.seq, primeira.corpo.seq);
    assert.equal(s.ctx.banco.um('SELECT count(*) AS n FROM partidas WHERE resenha_id = ?', id).n, 1);
    const outroCorpo = await s.chamar('POST', url(), { token: visita.token, corpo: { ...corpo, placarA: 9 } });
    assert.equal(outroCorpo.status, 200);
    assert.equal(outroCorpo.corpo.partida.placarA, 1, 'a repetição não altera a partida existente');
  });

  test('id usado por outro membro é 409 ID_EM_USO', async () => {
    await preparar();
    const corpo = { id: crypto.randomUUID(), ladoA: { nome: 'A' }, ladoB: { nome: 'B' }, placarA: 1, placarB: 0 };
    await s.chamar('POST', url(), { token: visita.token, corpo });
    const r = await s.chamar('POST', url(), { token: dono.token, corpo });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'ID_EM_USO');
  });

  test('resolve os lados por nome, ignorando caixa e acento, e reaproveita o competidor', async () => {
    await preparar();
    const a = await s.lancar(dono.token, id, { ladoA: { nome: 'João' }, ladoB: { nome: 'Maria' } });
    const b = await s.lancar(dono.token, id, { ladoA: { nome: ' joao ' }, ladoB: { nome: 'JOÃO DA SILVA' } });
    assert.equal(b.status, 201);
    assert.equal(b.corpo.partida.ladoA, a.corpo.partida.ladoA);
    assert.notEqual(b.corpo.partida.ladoB, a.corpo.partida.ladoA);
    const estado = await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token });
    assert.deepEqual(estado.corpo.competidores.map((c) => c.nome).sort(), ['JOÃO DA SILVA', 'João', 'Maria']);
  });

  test('resolve por id existente, mesmo sem nome, e o id vence o nome', async () => {
    await preparar();
    const a = await s.lancar(dono.token, id, { ladoA: { nome: 'Alfa' }, ladoB: { nome: 'Beta' } });
    const [alfa, beta] = a.corpo.competidores;
    const r = await s.lancar(visita.token, id, { ladoA: { id: beta.id }, ladoB: { id: alfa.id, nome: 'Outro Nome' } });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.partida.ladoA, beta.id);
    assert.equal(r.corpo.partida.ladoB, alfa.id);
    const estado = await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token });
    assert.equal(estado.corpo.competidores.length, 2);
  });

  test('competidor novo usa o id enviado quando válido e livre', async () => {
    await preparar();
    const idNovo = crypto.randomUUID();
    const r = await s.lancar(dono.token, id, { ladoA: { id: idNovo, nome: 'Novo' } });
    assert.equal(r.corpo.partida.ladoA, idNovo);
    const invalido = await s.lancar(dono.token, id, { ladoA: { id: 'curto', nome: 'Outro' } });
    assert.equal(invalido.status, 201);
    assert.notEqual(invalido.corpo.partida.ladoA, 'curto');
    const semDados = await s.lancar(dono.token, id, { ladoA: {}, ladoB: { nome: 'X' } });
    assert.equal(semDados.status, 400);
    assert.equal(semDados.corpo.erro.campo, 'ladoA.nome');
  });

  test('lados iguais: 422 LADOS_IGUAIS, sem criar nada', async () => {
    await preparar();
    const igual = await s.lancar(dono.token, id, { ladoA: { nome: 'Ana' }, ladoB: { nome: ' ANA ' } });
    assert.equal(igual.status, 422);
    assert.equal(igual.corpo.erro.codigo, 'LADOS_IGUAIS');
    const estado = await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token });
    assert.equal(estado.corpo.competidores.length, 0, 'a transação não deixa competidor órfão');
    assert.equal(estado.corpo.partidas.length, 0);
    const base = await s.lancar(dono.token, id, { ladoA: { nome: 'X' }, ladoB: { nome: 'Y' } });
    const porId = await s.lancar(dono.token, id, { ladoA: { id: base.corpo.partida.ladoA }, ladoB: { nome: 'x' } });
    assert.equal(porId.corpo.erro.codigo, 'LADOS_IGUAIS');
  });

  test('placar inválido: 422 PLACAR_INVALIDO com o campo', async () => {
    await preparar();
    const casos = [
      [{ placarA: -1 }, 'placarA'],
      [{ placarB: 1000 }, 'placarB'],
      [{ placarA: 1.5 }, 'placarA'],
      [{ placarA: '2' }, 'placarA'],
      [{ placarB: undefined }, 'placarB'],
    ];
    for (const [extra, campo] of casos) {
      const r = await s.lancar(dono.token, id, extra);
      assert.equal(r.status, 422, JSON.stringify(extra));
      assert.equal(r.corpo.erro.codigo, 'PLACAR_INVALIDO');
      assert.equal(r.corpo.erro.campo, campo);
    }
    assert.equal((await s.lancar(dono.token, id, { placarA: 999, placarB: 999 })).status, 201);
  });

  test('0 a 0 é aceito', async () => {
    await preparar();
    const r = await s.lancar(dono.token, id, { placarA: 0, placarB: 0 });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.partida.placarA, 0);
    assert.equal(r.corpo.partida.placarB, 0);
  });

  test('campos opcionais inválidos são 400', async () => {
    await preparar();
    const casos = [
      [{ modalidade: 'xadrez' }, 'modalidade'],
      [{ modalidade: 7 }, 'modalidade'],
      [{ jogadaEm: 'ontem' }, 'jogadaEm'],
      [{ jogadaEm: 1.5 }, 'jogadaEm'],
      [{ jogadaEm: Date.UTC(1999, 11, 31) }, 'jogadaEm'],
      [{ id: 'curto' }, 'id'],
      [{ id: 'com espaço no identificador!' }, 'id'],
      [{ penaltis: 'sim' }, 'penaltis'],
      [{ ladoA: 'Lucas' }, 'ladoA'],
      [{ ladoB: null }, 'ladoB'],
    ];
    for (const [extra, campo] of casos) {
      const r = await s.lancar(dono.token, id, extra);
      assert.equal(r.status, 400, JSON.stringify(extra));
      assert.equal(r.corpo.erro.campo, campo, JSON.stringify(extra));
    }
    const futuro = await s.lancar(dono.token, id, { jogadaEm: s.relogio.agora() + 23 * 3600_000 });
    assert.equal(futuro.status, 201);
    const antigo = await s.lancar(dono.token, id, { jogadaEm: Date.UTC(2000, 0, 1) });
    assert.equal(antigo.status, 201);
  });

  test('relógio do aparelho adiantado: data além de 5 minutos à frente vira a hora do servidor', async () => {
    await preparar();
    const agora = s.relogio.agora();
    const adiantado = await s.lancar(dono.token, id, { jogadaEm: agora + 2 * 24 * 3600_000 });
    assert.equal(adiantado.status, 201);
    assert.equal(adiantado.corpo.partida.jogadaEm, agora);
    const muitoAdiantado = await s.lancar(dono.token, id, { jogadaEm: agora + 40 * 24 * 3600_000 });
    assert.equal(muitoAdiantado.status, 201, 'relógio errado por semanas não perde o lançamento');
    assert.equal(muitoAdiantado.corpo.partida.jogadaEm, agora);
    const margem = await s.lancar(dono.token, id, { jogadaEm: agora + 4 * 60_000 });
    assert.equal(margem.corpo.partida.jogadaEm, agora + 4 * 60_000, 'dentro dos 5 minutos vale como veio');
    const atrasado = await s.lancar(dono.token, id, { jogadaEm: agora - 2 * 24 * 3600_000 });
    assert.equal(atrasado.corpo.partida.jogadaEm, agora - 2 * 24 * 3600_000);
    const absurdo = await s.lancar(dono.token, id, { jogadaEm: agora + 400 * 24 * 3600_000 });
    assert.equal(absurdo.corpo.partida.jogadaEm, agora, 'qualquer data futura vira a hora do servidor');
  });

  test('sem id nem data, o servidor gera os dois', async () => {
    await preparar();
    const r = await s.chamar('POST', url(), {
      token: dono.token,
      corpo: { ladoA: { nome: 'A' }, ladoB: { nome: 'B' }, placarA: 1, placarB: 1 },
    });
    assert.equal(r.status, 201);
    assert.match(r.corpo.partida.id, /^[0-9a-f-]{36}$/);
    assert.equal(r.corpo.partida.jogadaEm, s.relogio.agora());
  });

  test('nome de competidor inválido é 400', async () => {
    await preparar();
    const longo = await s.lancar(dono.token, id, { ladoA: { nome: 'n'.repeat(31) } });
    assert.equal(longo.status, 400);
    assert.equal(longo.corpo.erro.campo, 'ladoA.nome');
    assert.equal((await s.lancar(dono.token, id, { ladoB: { nome: '   ' } })).status, 400);
  });
});

describe('pênaltis', () => {
  let s;
  let dono;
  let id;
  before(async () => {
    s = await iniciarServidor();
    ({ dono, id } = await s.resenhaComDois());
  });
  after(() => s.fechar());

  test('válido com empate e vencedor', async () => {
    const r = await s.lancar(dono.token, id, { placarA: 2, placarB: 2, penaltis: { a: 3, b: 4 } });
    assert.equal(r.status, 201);
    assert.deepEqual([r.corpo.partida.penaltisA, r.corpo.partida.penaltisB], [3, 4]);
    for (const modalidade of ['fifa', 'futebol']) {
      const r2 = await s.lancar(dono.token, id, { placarA: 0, placarB: 0, penaltis: { a: 1, b: 0 }, modalidade });
      assert.equal(r2.status, 201);
      assert.equal(r2.corpo.partida.modalidade, 'futebol', 'o identificador antigo grava como futebol');
    }
  });

  test('recusado com placar diferente, a igual a b e modalidade sem pênaltis', async () => {
    const casos = [
      { placarA: 2, placarB: 1, penaltis: { a: 3, b: 2 } },
      { placarA: 1, placarB: 1, penaltis: { a: 3, b: 3 } },
      { placarA: 1, placarB: 1, penaltis: { a: 3, b: 2 }, modalidade: 'volei-quadra' },
      { placarA: 1, placarB: 1, penaltis: { a: 3, b: 2 }, modalidade: 'outro' },
      { placarA: 1, placarB: 1, penaltis: { a: 3 } },
      { placarA: 1, placarB: 1, penaltis: { a: -1, b: 2 } },
      { placarA: 1, placarB: 1, penaltis: { a: 1000, b: 2 } },
      { placarA: 1, placarB: 1, penaltis: { a: 1.5, b: 2 } },
    ];
    for (const extra of casos) {
      const r = await s.lancar(dono.token, id, extra);
      assert.equal(r.status, 422, JSON.stringify(extra));
      assert.equal(r.corpo.erro.codigo, 'PLACAR_INVALIDO');
      assert.equal(r.corpo.erro.campo, 'penaltis');
    }
  });

  test('null e ausente significam sem disputa', async () => {
    const a = await s.lancar(dono.token, id, { placarA: 1, placarB: 1, penaltis: null });
    assert.deepEqual([a.corpo.partida.penaltisA, a.corpo.partida.penaltisB], [null, null]);
    const b = await s.lancar(dono.token, id, { placarA: 1, placarB: 1 });
    assert.deepEqual([b.corpo.partida.penaltisA, b.corpo.partida.penaltisB], [null, null]);
  });

  test('remover com penaltis: null na edição', async () => {
    const criada = (await s.lancar(dono.token, id, { placarA: 1, placarB: 1, penaltis: { a: 5, b: 4 } })).corpo.partida;
    const r = await s.chamar('PATCH', `/api/resenhas/${id}/partidas/${criada.id}`, {
      token: dono.token,
      corpo: { rev: 1, penaltis: null },
    });
    assert.equal(r.status, 200);
    assert.deepEqual([r.corpo.partida.penaltisA, r.corpo.partida.penaltisB], [null, null]);
    assert.equal(r.corpo.partida.rev, 2);
  });

  test('a edição valida o estado resultante', async () => {
    const criada = (await s.lancar(dono.token, id, { placarA: 1, placarB: 1, penaltis: { a: 5, b: 4 } })).corpo.partida;
    const base = `/api/resenhas/${id}/partidas/${criada.id}`;
    const quebra = await s.chamar('PATCH', base, { token: dono.token, corpo: { rev: 1, placarA: 3 } });
    assert.equal(quebra.status, 422, 'mudar o placar sem remover os pênaltis deixaria o estado inválido');
    const modalidade = await s.chamar('PATCH', base, { token: dono.token, corpo: { rev: 1, modalidade: 'outro' } });
    assert.equal(modalidade.status, 422);
    const junto = await s.chamar('PATCH', base, { token: dono.token, corpo: { rev: 1, placarA: 3, penaltis: null } });
    assert.equal(junto.status, 200);
    const poe = await s.chamar('PATCH', base, {
      token: dono.token,
      corpo: { rev: 2, placarB: 3, penaltis: { a: 1, b: 2 } },
    });
    assert.equal(poe.status, 200);
    assert.deepEqual([poe.corpo.partida.penaltisA, poe.corpo.partida.penaltisB], [1, 2]);
  });

  test('a estatística separa pênaltis dos gols', async () => {
    const t = await iniciarServidor();
    try {
      const { dono: d, id: rid } = await t.resenhaComDois();
      await t.lancar(d.token, rid, { placarA: 2, placarB: 2, penaltis: { a: 5, b: 4 } });
      const estado = (await t.chamar('GET', `/api/resenhas/${rid}/estado`, { token: d.token })).corpo;
      const stats = calcularEstatisticas(estado.partidas, estado.competidores);
      assert.equal(stats.totais.golsMarcados, 4);
      assert.equal(stats.totais.decididasNosPenaltis, 1);
      const linha = (nome) => stats.tabela.find((l) => l.nome === nome);
      const campos = (l) => [l.empates, l.vitorias, l.vitoriasPenaltis, l.derrotasPenaltis, l.golsPro];
      assert.deepEqual(campos(linha('Lucas')), [1, 0, 1, 0, 2]);
      assert.deepEqual(campos(linha('João')), [1, 0, 0, 1, 2]);
    } finally {
      await t.fechar();
    }
  });
});

describe('edição e exclusão', () => {
  let s;
  let dono;
  let visita;
  let id;
  before(async () => {
    s = await iniciarServidor();
    ({ dono, visita, id } = await s.resenhaComDois());
  });
  after(() => s.fechar());

  const caminho = (pid) => `/api/resenhas/${id}/partidas/${pid}`;
  const nova = async (token = visita.token) => (await s.lancar(token, id)).corpo.partida;

  test('editar com rev correto sobe rev, seq e registra quem editou', async () => {
    const p = await nova();
    s.relogio.avancar(5000);
    const r = await s.chamar('PATCH', caminho(p.id), {
      token: dono.token,
      corpo: { rev: 1, placarA: 7, modalidade: 'futebol' },
    });
    assert.equal(r.status, 200);
    const e = r.corpo.partida;
    assert.deepEqual(
      [e.placarA, e.placarB, e.modalidade, e.rev, e.criadoPor, e.editadoPor],
      [7, 1, 'futebol', 2, visita.membro.id, dono.membro.id],
    );
    assert.equal(e.atualizadaEm, s.relogio.agora());
    assert.equal(e.criadaEm, p.criadaEm);
    assert.ok(e.seq > p.seq);
    assert.equal(r.corpo.seq, e.seq);
  });

  test('rev divergente: 409 CONFLITO_REVISAO com a partida atual', async () => {
    const p = await nova();
    await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo: { rev: 1, placarA: 5 } });
    const r = await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo: { rev: 1, placarA: 9 } });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'CONFLITO_REVISAO');
    assert.equal(r.corpo.erro.atual.rev, 2);
    assert.equal(r.corpo.erro.atual.placarA, 5);
    assert.equal(r.corpo.erro.atual.id, p.id);
  });

  test('reenvio com rev antigo cujo resultado já é o atual devolve o estado atual, sem nova revisão nem seq', async () => {
    const p = await nova();
    const corpo = { rev: 1, placarA: 5, ladoA: { id: p.ladoA }, ladoB: { id: p.ladoB } };
    const primeira = await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo });
    assert.equal(primeira.corpo.partida.rev, 2);
    const antes = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo.seq;
    const reenvio = await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo });
    assert.equal(reenvio.status, 200);
    assert.deepEqual(reenvio.corpo.partida, primeira.corpo.partida);
    const depois = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo.seq;
    assert.equal(depois, antes);
  });

  test('rev antigo com resultado diferente do atual segue sendo conflito e não cria competidor', async () => {
    const p = await nova();
    await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo: { rev: 1, placarA: 5 } });
    const antes = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo;
    const r = await s.chamar('PATCH', caminho(p.id), {
      token: visita.token,
      corpo: { rev: 1, placarA: 5, ladoB: { nome: 'Adversário Fantasma' } },
    });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.atual.rev, 2);
    const depois = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo;
    assert.equal(depois.seq, antes.seq);
    assert.equal(depois.competidores.length, antes.competidores.length);
  });

  test('rev antigo com corpo inválido para o estado atual é conflito, não 422', async () => {
    const p = await nova();
    await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo: { rev: 1, placarA: 5 } });
    const r = await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo: { rev: 1, placarA: -1 } });
    assert.equal(r.status, 409);
  });

  test('rev ausente ou inválido é 400', async () => {
    const p = await nova();
    for (const rev of [undefined, '1', 0, 1.5, null]) {
      const r = await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo: { rev, placarA: 2 } });
      assert.equal(r.status, 400, String(rev));
      assert.equal(r.corpo.erro.campo, 'rev');
    }
  });

  test('editar os lados resolve competidores como na criação', async () => {
    const p = await nova();
    const r = await s.chamar('PATCH', caminho(p.id), {
      token: visita.token,
      corpo: { rev: 1, ladoB: { nome: 'Competidor Novo' } },
    });
    assert.equal(r.status, 200);
    assert.notEqual(r.corpo.partida.ladoB, p.ladoB);
    assert.equal(r.corpo.competidores.find((c) => c.id === r.corpo.partida.ladoB).nome, 'Competidor Novo');
    const iguais = await s.chamar('PATCH', caminho(p.id), {
      token: visita.token,
      corpo: { rev: 2, ladoB: { id: p.ladoA } },
    });
    assert.equal(iguais.status, 422);
    assert.equal(iguais.corpo.erro.codigo, 'LADOS_IGUAIS');
  });

  test('edição sem diferença não sobe rev nem seq', async () => {
    const p = await nova();
    const antes = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo.seq;
    const r = await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo: { rev: 1, placarA: p.placarA } });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.partida.rev, 1);
    const depois = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo.seq;
    assert.equal(depois, antes);
  });

  test('excluir marca a exclusão, é idempotente e restaurar desfaz', async () => {
    const p = await nova();
    const r = await s.chamar('DELETE', `${caminho(p.id)}?rev=1`, { token: visita.token });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.partida.excluida, true);
    assert.equal(r.corpo.partida.rev, 2);
    assert.equal(r.corpo.partida.editadoPor, visita.membro.id);

    const de_novo = await s.chamar('DELETE', `${caminho(p.id)}?rev=1`, { token: visita.token });
    assert.equal(de_novo.status, 200);
    assert.deepEqual(de_novo.corpo.partida, r.corpo.partida, 'a repetição devolve a mesma partida, sem nova revisão');
    const semRev = await s.chamar('DELETE', caminho(p.id), { token: visita.token });
    assert.equal(semRev.status, 200);

    const restaurada = await s.chamar('POST', `${caminho(p.id)}/restaurar`, { token: visita.token, corpo: { rev: 2 } });
    assert.equal(restaurada.status, 200);
    assert.equal(restaurada.corpo.partida.excluida, false);
    assert.equal(restaurada.corpo.partida.rev, 3);
    const idem = await s.chamar('POST', `${caminho(p.id)}/restaurar`, { token: visita.token, corpo: { rev: 2 } });
    assert.equal(idem.status, 200);
    assert.equal(idem.corpo.partida.rev, 3);
  });

  test('excluir e restaurar com rev divergente: 409 com atual', async () => {
    const p = await nova();
    const x = await s.chamar('DELETE', `${caminho(p.id)}?rev=9`, { token: visita.token });
    assert.equal(x.status, 409);
    assert.equal(x.corpo.erro.atual.id, p.id);
    await s.chamar('DELETE', `${caminho(p.id)}?rev=1`, { token: visita.token });
    const r = await s.chamar('POST', `${caminho(p.id)}/restaurar`, { token: visita.token, corpo: { rev: 1 } });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.atual.excluida, true);
    assert.equal((await s.chamar('DELETE', `${caminho(p.id)}?rev=abc`, { token: visita.token })).status, 200);
    const outra = await nova();
    assert.equal((await s.chamar('DELETE', `${caminho(outra.id)}?rev=abc`, { token: visita.token })).status, 400);
    assert.equal((await s.chamar('DELETE', caminho(outra.id), { token: visita.token })).status, 400);
  });

  test('editar partida excluída é 409 e partida inexistente é 404', async () => {
    const p = await nova();
    await s.chamar('DELETE', `${caminho(p.id)}?rev=1`, { token: visita.token });
    const r = await s.chamar('PATCH', caminho(p.id), { token: visita.token, corpo: { rev: 2, placarA: 4 } });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.atual.excluida, true);
    assert.equal(
      (await s.chamar('PATCH', caminho('nao-existe-nao-existe'), { token: dono.token, corpo: { rev: 1 } })).status,
      404,
    );
    assert.equal(
      (await s.chamar('DELETE', `${caminho('nao-existe-nao-existe')}?rev=1`, { token: dono.token })).status,
      404,
    );
  });

  test('a exclusão vira marca no delta e sai do estado completo', async () => {
    const t = await iniciarServidor();
    try {
      const { dono: d, id: rid } = await t.resenhaComDois();
      const p1 = (await t.lancar(d.token, rid)).corpo.partida;
      const p2 = (await t.lancar(d.token, rid)).corpo.partida;
      const ate = (await t.chamar('GET', `/api/resenhas/${rid}/estado`, { token: d.token })).corpo.seq;
      await t.chamar('DELETE', `/api/resenhas/${rid}/partidas/${p1.id}?rev=1`, { token: d.token });

      const delta = (await t.chamar('GET', `/api/resenhas/${rid}/estado?desde=${ate}`, { token: d.token })).corpo;
      assert.equal(delta.completo, false);
      assert.deepEqual(
        delta.partidas.map((p) => [p.id, p.excluida]),
        [[p1.id, true]],
      );
      const completo = (await t.chamar('GET', `/api/resenhas/${rid}/estado`, { token: d.token })).corpo;
      assert.deepEqual(
        completo.partidas.map((p) => p.id),
        [p2.id],
      );
    } finally {
      await t.fechar();
    }
  });
});

describe('estado', () => {
  let s;
  before(async () => {
    s = await iniciarServidor();
  });
  after(() => s.fechar());

  test('estado completo tem o formato do contrato', async () => {
    const { dono, visita, id } = await s.resenhaComDois('Dono', 'Visita');
    const lancada = (await s.lancar(visita.token, id)).corpo;
    const r = await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: visita.token });
    assert.equal(r.status, 200);
    const e = r.corpo;
    assert.deepEqual(Object.keys(e).sort(), [
      'competidores',
      'completo',
      'eu',
      'membros',
      'partidas',
      'resenha',
      'seq',
    ]);
    assert.equal(e.completo, true);
    assert.equal(e.seq, lancada.seq);
    assert.equal(e.resenha.seq, e.seq);
    assert.deepEqual(e.eu, { membroId: visita.membro.id, papel: 'participante', apelido: 'Visita' });
    assert.deepEqual(
      e.membros.map((m) => [m.id, m.apelido, m.papel]),
      [
        [dono.membro.id, 'Dono', 'criador'],
        [visita.membro.id, 'Visita', 'participante'],
      ],
    );
    assert.deepEqual(Object.keys(e.membros[0]).sort(), ['apelido', 'criadoEm', 'id', 'papel']);
    assert.deepEqual(Object.keys(e.competidores[0]).sort(), ['criadoPor', 'id', 'nome', 'seq']);
    assert.equal(e.partidas.length, 1);
  });

  test('delta por seq: só partidas depois do seq, membros e competidores sempre completos', async () => {
    const { dono, id } = await s.resenhaComDois();
    const p1 = (await s.lancar(dono.token, id)).corpo;
    const p2 = (await s.lancar(dono.token, id, { ladoA: { nome: 'Lucas' }, ladoB: { nome: 'Pedro' } })).corpo;
    const delta = (await s.chamar('GET', `/api/resenhas/${id}/estado?desde=${p1.seq}`, { token: dono.token })).corpo;
    assert.equal(delta.completo, false);
    assert.equal(delta.seq, p2.seq);
    assert.deepEqual(
      delta.partidas.map((p) => p.id),
      [p2.partida.id],
    );
    assert.equal(delta.membros.length, 2);
    assert.equal(delta.competidores.length, 3);
    const igual = (await s.chamar('GET', `/api/resenhas/${id}/estado?desde=${p2.seq}`, { token: dono.token })).corpo;
    assert.equal(igual.completo, false);
    assert.deepEqual(igual.partidas, []);
    assert.equal(igual.competidores.length, 3);
  });

  test('desde ausente, zero, maior que o atual ou inválido devolve estado completo', async () => {
    const { dono, id } = await s.resenhaComDois();
    const p = (await s.lancar(dono.token, id)).corpo;
    for (const consulta of [
      '',
      '?desde=0',
      `?desde=${p.seq + 1}`,
      '?desde=99999',
      '?desde=abc',
      '?desde=-3',
      '?desde=',
    ]) {
      const e = (await s.chamar('GET', `/api/resenhas/${id}/estado${consulta}`, { token: dono.token })).corpo;
      assert.equal(e.completo, true, consulta);
      assert.equal(e.partidas.length, 1, consulta);
    }
  });

  test('um membro novo e uma troca de nome também avançam o seq', async () => {
    const { dono, id } = await s.resenhaComDois();
    const antes = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo.seq;
    await s.entrar(dono.convite, 'Terceiro');
    const depois = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo.seq;
    assert.equal(depois, antes + 1);
    await s.chamar('PATCH', `/api/resenhas/${id}`, { token: dono.token, corpo: { nome: 'Outro nome' } });
    const final = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo;
    assert.equal(final.seq, depois + 1);
    assert.equal(final.resenha.nome, 'Outro nome');
  });

  test('membro removido sai de membros e a partida dele continua', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    await s.lancar(visita.token, id);
    await s.chamar('DELETE', `/api/resenhas/${id}/membros/${visita.membro.id}`, { token: dono.token });
    const e = (await s.chamar('GET', `/api/resenhas/${id}/estado`, { token: dono.token })).corpo;
    assert.deepEqual(
      e.membros.map((m) => m.id),
      [dono.membro.id],
    );
    assert.equal(e.partidas[0].criadoPor, visita.membro.id);
  });
});
