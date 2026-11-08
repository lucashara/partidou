import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { envioEmCurso, operacaoJaAplicada } from '../../public/js/dados/operacoes.js';

const partida = (/** @type {Record<string, any>} */ extras = {}) => ({
  id: 'p1',
  ladoA: 'a',
  ladoB: 'b',
  placarA: 5,
  placarB: 1,
  penaltisA: null,
  penaltisB: null,
  modalidade: null,
  jogadaEm: 10,
  excluida: false,
  rev: 2,
  ...extras,
});
const op = (/** @type {any} */ tipo, /** @type {any} */ corpo = {}) => ({
  idOp: 'o',
  tipo,
  partidaId: 'p1',
  corpo,
  rev: 1,
  criadaEm: 1,
  tentativas: 0,
});

describe('operacaoJaAplicada', () => {
  test('edição cujos campos já batem com a partida atual', () => {
    assert.equal(operacaoJaAplicada(op('editar', { placarA: 5 }), /** @type {any} */ (partida())), true);
    assert.equal(operacaoJaAplicada(op('editar', { placarA: 6 }), /** @type {any} */ (partida())), false);
    assert.equal(
      operacaoJaAplicada(op('editar', { placarA: 5, ladoA: { id: 'a', nome: 'A' } }), /** @type {any} */ (partida())),
      true,
    );
    assert.equal(
      operacaoJaAplicada(op('editar', { ladoB: { id: 'x', nome: 'X' } }), /** @type {any} */ (partida())),
      false,
    );
  });

  test('pênaltis nulos e pênaltis informados', () => {
    assert.equal(operacaoJaAplicada(op('editar', { penaltis: null }), /** @type {any} */ (partida())), true);
    const empate = partida({ placarB: 5, penaltisA: 4, penaltisB: 3 });
    assert.equal(operacaoJaAplicada(op('editar', { penaltis: { a: 4, b: 3 } }), /** @type {any} */ (empate)), true);
    assert.equal(operacaoJaAplicada(op('editar', { penaltis: { a: 4, b: 2 } }), /** @type {any} */ (empate)), false);
  });

  test('edição de partida excluída nunca conta como aplicada; exclusão e restauração olham o estado', () => {
    assert.equal(
      operacaoJaAplicada(op('editar', { placarA: 5 }), /** @type {any} */ (partida({ excluida: true }))),
      false,
    );
    assert.equal(operacaoJaAplicada(op('excluir'), /** @type {any} */ (partida({ excluida: true }))), true);
    assert.equal(operacaoJaAplicada(op('excluir'), /** @type {any} */ (partida())), false);
    assert.equal(operacaoJaAplicada(op('restaurar'), /** @type {any} */ (partida())), true);
  });
});

describe('envioEmCurso', () => {
  test('vale por 30 s a partir da marca e só para quem tem marca', () => {
    assert.equal(envioEmCurso(/** @type {any} */ (op('criar')), 100_000), false);
    assert.equal(envioEmCurso(/** @type {any} */ ({ ...op('criar'), enviandoDesde: 90_000 }), 100_000), true);
    assert.equal(envioEmCurso(/** @type {any} */ ({ ...op('criar'), enviandoDesde: 60_000 }), 100_000), false);
  });
});
