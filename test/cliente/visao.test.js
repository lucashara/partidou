import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ajustarRevs, aplicarDelta, aplicarResposta, montarVisao } from '../../public/js/dados/visao.js';

const EU = { membroId: 'm-eu', papel: /** @type {'criador' | 'participante'} */ ('participante'), apelido: 'Eu' };
const CRIADOR = { ...EU, membroId: 'm-criador', papel: /** @type {'criador' | 'participante'} */ ('criador') };

/** @param {Record<string, any>} [extras] */
const partida = (extras = {}) => ({
  id: 'p1',
  ladoA: 'c1',
  ladoB: 'c2',
  placarA: 1,
  placarB: 0,
  penaltisA: null,
  penaltisB: null,
  modalidade: null,
  jogadaEm: 1000,
  criadoPor: 'm-eu',
  editadoPor: null,
  criadaEm: 1000,
  atualizadaEm: 1000,
  rev: 1,
  excluida: false,
  seq: 1,
  ...extras,
});

/** @param {Record<string, any>} [extras] */
const cache = (extras = {}) => ({
  seq: 5,
  resenha: { id: 'r1', nome: 'Resenha', seq: 5, criadaEm: 1 },
  eu: EU,
  membros: [{ id: 'm-eu', apelido: 'Eu', papel: /** @type {const} */ ('participante'), criadoEm: 1 }],
  competidores: [
    { id: 'c1', nome: 'Lucas', criadoPor: 'm-eu', seq: 1 },
    { id: 'c2', nome: 'João', criadoPor: 'm-eu', seq: 1 },
  ],
  partidas: { p1: partida() },
  ...extras,
});

/** @param {string} tipo @param {string} partidaId @param {Record<string, any>} [corpo] @param {Record<string, any>} [extras] */
const op = (tipo, partidaId, corpo = {}, extras = {}) => ({
  idOp: `op-${tipo}-${partidaId}`,
  tipo: /** @type {any} */ (tipo),
  partidaId,
  corpo,
  criadaEm: 5000,
  tentativas: 0,
  ...extras,
});

const criacao = (/** @type {Record<string, any>} */ corpo = {}, partidaId = 'novo-1') =>
  op('criar', partidaId, {
    ladoA: { nome: 'Lucas' },
    ladoB: { nome: 'João' },
    placarA: 3,
    placarB: 2,
    penaltis: null,
    modalidade: null,
    jogadaEm: 4000,
    ...corpo,
  });

describe('montarVisao', () => {
  test('sem fila devolve o cache como está', () => {
    const v = montarVisao(cache(), [], EU);
    assert.equal(v.partidas.length, 1);
    assert.equal(v.partidas[0].pendente, false);
    assert.deepEqual(v.sync, { estado: 'sincronizado', pendentes: 0, ultimaSincronizacaoEm: null, mensagem: null });
    assert.equal(v.resenha.nome, 'Resenha');
  });

  test('criação pendente aparece com id do cliente, rev 0 e dono local', () => {
    const v = montarVisao(cache(), [criacao()], EU);
    const nova = v.partidas.find((p) => p.id === 'novo-1');
    assert.ok(nova);
    assert.equal(nova.pendente, true);
    assert.equal(nova.rev, 0);
    assert.equal(nova.criadoPor, 'm-eu');
    assert.equal(nova.criadaEm, 5000);
    assert.equal(nova.jogadaEm, 4000);
    assert.equal(nova.podeEditar, true);
  });

  test('lados resolvem pela chave do nome, sem acento nem caixa', () => {
    const v = montarVisao(cache(), [criacao({ ladoA: { nome: 'LUCAS' }, ladoB: { nome: 'joao' } })], EU);
    const nova = /** @type {any} */ (v.partidas.find((p) => p.id === 'novo-1'));
    assert.equal(nova.ladoA, 'c1');
    assert.equal(nova.ladoB, 'c2');
    assert.equal(v.competidores.length, 2);
  });

  test('competidor novo vira local e é reaproveitado pelas operações seguintes', () => {
    const fila = [
      criacao({ ladoA: { id: 'uuid-zeca-00000000000', nome: 'Zeca' } }, 'n1'),
      criacao({ ladoA: { nome: 'zéca' }, ladoB: { nome: 'Lucas' } }, 'n2'),
    ];
    const v = montarVisao(cache(), fila, EU);
    const locais = v.competidores.filter((c) => c.local);
    assert.deepEqual(locais, [{ id: 'uuid-zeca-00000000000', nome: 'Zeca', local: true }]);
    const n2 = /** @type {any} */ (v.partidas.find((p) => p.id === 'n2'));
    assert.equal(n2.ladoA, 'uuid-zeca-00000000000');
  });

  test('competidor local sem id usa id derivado da chave, estável entre montagens', () => {
    const fila = [criacao({ ladoA: { nome: 'Ângelo' } })];
    const a = montarVisao(cache(), fila, EU);
    const b = montarVisao(cache(), fila, EU);
    assert.deepEqual(a, b);
    assert.ok(a.competidores.some((c) => c.local && c.id === 'local-angelo'));
  });

  test('edição pendente mostra os campos novos e marca pendente', () => {
    const v = montarVisao(
      cache(),
      [op('editar', 'p1', { placarA: 4, penaltis: { a: 3, b: 5 }, modalidade: 'fifa' }, { rev: 1 })],
      EU,
    );
    const p = v.partidas[0];
    assert.equal(p.placarA, 4);
    assert.equal(p.penaltisA, 3);
    assert.equal(p.penaltisB, 5);
    assert.equal(p.modalidade, 'fifa');
    assert.equal(p.pendente, true);
  });

  test('edição com penaltis nulo remove a disputa e troca de lado', () => {
    const base = cache({ partidas: { p1: partida({ placarA: 1, placarB: 1, penaltisA: 3, penaltisB: 4 }) } });
    const v = montarVisao(base, [op('editar', 'p1', { penaltis: null, ladoB: { nome: 'Marta' } }, { rev: 1 })], EU);
    assert.equal(v.partidas[0].penaltisA, null);
    assert.ok(v.competidores.some((c) => c.nome === 'Marta' && c.local));
  });

  test('exclusão pendente some e restaurar pendente volta', () => {
    const excluir = op('excluir', 'p1', {}, { rev: 1 });
    assert.equal(montarVisao(cache(), [excluir], EU).partidas.length, 0);
    const restaurar = op('restaurar', 'p1', {}, { rev: 2, idOp: 'op-restaurar' });
    const v = montarVisao(cache(), [excluir, restaurar], EU);
    assert.equal(v.partidas.length, 1);
    assert.equal(v.partidas[0].pendente, true);
  });

  test('tombstone do cache não aparece e restaurar pendente o traz de volta', () => {
    const base = cache({ partidas: { p1: partida({ excluida: true, rev: 2 }) } });
    assert.equal(montarVisao(base, [], EU).partidas.length, 0);
    assert.equal(montarVisao(base, [op('restaurar', 'p1', {}, { rev: 2 })], EU).partidas.length, 1);
  });

  test('ordena por jogadaEm desc, depois criadaEm desc, depois id', () => {
    const base = cache({
      partidas: {
        a: partida({ id: 'a', jogadaEm: 100, criadaEm: 10 }),
        b: partida({ id: 'b', jogadaEm: 200, criadaEm: 10 }),
        c: partida({ id: 'c', jogadaEm: 100, criadaEm: 20 }),
        d: partida({ id: 'd', jogadaEm: 100, criadaEm: 10 }),
      },
    });
    assert.deepEqual(
      montarVisao(base, [], EU).partidas.map((p) => p.id),
      ['b', 'c', 'a', 'd'],
    );
  });

  test('podeEditar: criador, autor ou pendente criada aqui', () => {
    const base = cache({
      partidas: { p1: partida({ criadoPor: 'm-outro' }), p2: partida({ id: 'p2', criadoPor: 'm-eu' }) },
    });
    const participante = montarVisao(base, [criacao()], EU);
    const porId = Object.fromEntries(participante.partidas.map((p) => [p.id, p.podeEditar]));
    assert.deepEqual(porId, { p1: false, p2: true, 'novo-1': true });
    const criador = montarVisao(base, [], CRIADOR);
    assert.ok(criador.partidas.every((p) => p.podeEditar));
  });

  test('membros revogados ficam de fora', () => {
    const base = cache({
      membros: [
        { id: 'a', apelido: 'A', papel: 'criador', criadoEm: 1 },
        { id: 'b', apelido: 'B', papel: 'participante', criadoEm: 1, revogadoEm: 9 },
      ],
    });
    assert.deepEqual(
      montarVisao(base, [], EU).membros.map((m) => m.id),
      ['a'],
    );
  });
});

describe('aplicarDelta', () => {
  const estado = (/** @type {Record<string, any>} */ extras = {}) => ({
    seq: 9,
    completo: true,
    resenha: { id: 'r1', nome: 'Nova', seq: 9, criadaEm: 1 },
    eu: EU,
    membros: [],
    competidores: [],
    partidas: [],
    ...extras,
  });

  test('estado completo substitui tudo e omite excluídas', () => {
    const novo = aplicarDelta(
      cache(),
      estado({ partidas: [partida({ id: 'x' }), partida({ id: 'y', excluida: true })] }),
    );
    assert.deepEqual(Object.keys(novo.partidas), ['x']);
    assert.equal(novo.seq, 9);
    assert.equal(novo.resenha.nome, 'Nova');
  });

  test('sem cache o primeiro estado vira o cache', () => {
    assert.equal(aplicarDelta(null, estado({ partidas: [partida()] })).partidas.p1.rev, 1);
  });

  test('delta funde por id e guarda o tombstone', () => {
    const base = cache({ partidas: { p1: partida(), p2: partida({ id: 'p2' }) } });
    const novo = aplicarDelta(
      base,
      estado({
        completo: false,
        seq: 7,
        partidas: [partida({ rev: 2, placarA: 9 }), partida({ id: 'p2', excluida: true, rev: 2 })],
      }),
    );
    assert.equal(novo.partidas.p1.placarA, 9);
    assert.equal(novo.partidas.p2.excluida, true);
    assert.equal(novo.seq, 7);
  });

  test('delta substitui membros e competidores', () => {
    const novo = aplicarDelta(
      cache(),
      estado({
        completo: false,
        seq: 6,
        membros: [],
        competidores: [{ id: 'c9', nome: 'Só', criadoPor: 'x', seq: 6 }],
      }),
    );
    assert.deepEqual(novo.membros, []);
    assert.deepEqual(
      novo.competidores.map((c) => c.id),
      ['c9'],
    );
    assert.ok(novo.partidas.p1);
  });

  test('resposta mais velha que o cache é ignorada', () => {
    const base = cache();
    assert.equal(aplicarDelta(base, estado({ completo: false, seq: 3, partidas: [partida({ placarA: 99 })] })), base);
  });

  test('não altera o cache recebido', () => {
    const base = cache();
    const copia = structuredClone(base);
    aplicarDelta(base, estado({ completo: false, seq: 7, partidas: [partida({ placarA: 9 })] }));
    assert.deepEqual(base, copia);
  });
});

describe('aplicarResposta e ajustarRevs', () => {
  test('resposta de escrita atualiza a partida sem mover o seq', () => {
    const novo = /** @type {any} */ (
      aplicarResposta(cache(), {
        partida: partida({ rev: 2, placarA: 5 }),
        competidores: [{ id: 'c3', nome: 'Nova', criadoPor: 'x', seq: 8 }],
      })
    );
    assert.equal(novo.seq, 5);
    assert.equal(novo.partidas.p1.placarA, 5);
    assert.equal(novo.competidores.length, 3);
  });

  test('não retrocede para revisão mais antiga', () => {
    const base = cache({ partidas: { p1: partida({ rev: 4 }) } });
    assert.equal(/** @type {any} */ (aplicarResposta(base, { partida: partida({ rev: 2 }) })).partidas.p1.rev, 4);
  });

  test('ajustarRevs atualiza só operações da mesma partida com rev', () => {
    const fila = [
      op('criar', 'p1'),
      op('editar', 'p1', {}, { rev: 0, idOp: 'a' }),
      op('excluir', 'p2', {}, { rev: 0, idOp: 'b' }),
      op('editar', 'p1', {}, { rev: 0, idOp: 'c' }),
    ];
    const novo = ajustarRevs(fila, { id: 'p1', rev: 3 });
    assert.deepEqual(
      novo.map((o) => o.rev),
      [undefined, 3, 0, 3],
    );
  });
});
