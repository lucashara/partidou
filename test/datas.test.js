// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { agruparPorDia, diaLocal } from '../compartilhado/datas.js';

const em = (ano, mes, dia, hora = 12) => new Date(ano, mes - 1, dia, hora, 0, 0).getTime();

describe('diaLocal', () => {
  test('formata AAAA-MM-DD no fuso do ambiente', () => {
    assert.equal(diaLocal(em(2026, 11, 8)), '2026-11-08');
    assert.equal(diaLocal(em(2026, 1, 5, 0)), '2026-01-05');
    assert.equal(diaLocal(em(2026, 12, 31, 23)), '2026-12-31');
  });
});

describe('agruparPorDia', () => {
  test('agrupa do dia mais recente ao mais antigo, e as partidas do dia da mais recente à mais antiga', () => {
    const partidas = [
      { id: 'a', jogadaEm: em(2026, 11, 6, 10) },
      { id: 'b', jogadaEm: em(2026, 11, 8, 9) },
      { id: 'c', jogadaEm: em(2026, 11, 8, 20) },
      { id: 'd', jogadaEm: em(2026, 11, 7, 15) },
    ];
    const grupos = agruparPorDia(partidas);
    assert.deepEqual(
      grupos.map((g) => [g.dia, g.partidas.map((p) => p.id)]),
      [
        ['2026-11-08', ['c', 'b']],
        ['2026-11-07', ['d']],
        ['2026-11-06', ['a']],
      ],
    );
  });

  test('não altera o vetor de entrada e aceita função de dia própria', () => {
    const partidas = [
      { id: 'a', jogadaEm: 1 },
      { id: 'b', jogadaEm: 2 },
    ];
    const copia = structuredClone(partidas);
    const grupos = agruparPorDia(partidas, () => 'unico');
    assert.deepEqual(partidas, copia);
    assert.deepEqual(grupos, [{ dia: 'unico', partidas: [partidas[1], partidas[0]] }]);
  });

  test('sem partidas, sem grupos', () => {
    assert.deepEqual(agruparPorDia([]), []);
  });

  test('desempata de forma estável por criação e id', () => {
    const t = em(2026, 11, 8);
    const grupos = agruparPorDia([
      { id: 'b', jogadaEm: t, criadaEm: 1 },
      { id: 'a', jogadaEm: t, criadaEm: 1 },
      { id: 'c', jogadaEm: t, criadaEm: 2 },
    ]);
    assert.deepEqual(
      grupos[0].partidas.map((p) => p.id),
      ['c', 'a', 'b'],
    );
  });
});
