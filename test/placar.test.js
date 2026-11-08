// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { aceitaPenaltis, MODALIDADES, modalidadePorId } from '../compartilhado/modalidades.js';
import { resultadoNormal, validarPlacar, vencedorFinal } from '../compartilhado/placar.js';

const ok = { ok: true };

describe('validarPlacar', () => {
  test('aceita 0 a 0 e o limite de 999', () => {
    assert.deepEqual(validarPlacar({ placarA: 0, placarB: 0 }), ok);
    assert.deepEqual(validarPlacar({ placarA: 999, placarB: 0 }), ok);
  });

  test('recusa fora do intervalo, fracionário e tipo errado, apontando o campo', () => {
    for (const [campo, valor] of [
      ['placarA', -1],
      ['placarA', 1000],
      ['placarA', 1.5],
      ['placarA', '2'],
      ['placarA', undefined],
      ['placarB', -1],
      ['placarB', Number.NaN],
    ]) {
      const entrada = { placarA: 1, placarB: 1, [campo]: valor };
      const r = validarPlacar(entrada);
      assert.equal(r.ok, false, `${campo}=${String(valor)}`);
      assert.equal(r.codigo, 'PLACAR_INVALIDO');
      assert.equal(r.campo, campo);
      assert.ok(r.mensagem.length > 0);
    }
  });

  test('pênaltis exigem empate no tempo normal', () => {
    assert.deepEqual(validarPlacar({ placarA: 2, placarB: 2, penaltisA: 5, penaltisB: 4 }), ok);
    const r = validarPlacar({ placarA: 2, placarB: 1, penaltisA: 5, penaltisB: 4 });
    assert.equal(r.ok, false);
    assert.equal(r.campo, 'penaltis');
  });

  test('pênaltis precisam de vencedor', () => {
    assert.equal(validarPlacar({ placarA: 1, placarB: 1, penaltisA: 3, penaltisB: 3 }).ok, false);
  });

  test('pênaltis incompletos ou inválidos são recusados', () => {
    assert.equal(validarPlacar({ placarA: 1, placarB: 1, penaltisA: 3 }).ok, false);
    assert.equal(validarPlacar({ placarA: 1, placarB: 1, penaltisA: -1, penaltisB: 3 }).ok, false);
    assert.equal(validarPlacar({ placarA: 1, placarB: 1, penaltisA: 3, penaltisB: 1000 }).ok, false);
  });

  test('null e ausente significam sem disputa', () => {
    assert.deepEqual(validarPlacar({ placarA: 1, placarB: 2, penaltisA: null, penaltisB: null }), ok);
    assert.deepEqual(validarPlacar({ placarA: 1, placarB: 1 }), ok);
  });

  test('modalidade sem pênaltis recusa a disputa', () => {
    const base = { placarA: 1, placarB: 1, penaltisA: 3, penaltisB: 2 };
    assert.deepEqual(validarPlacar({ ...base, modalidade: 'fifa' }), ok);
    assert.deepEqual(validarPlacar({ ...base, modalidade: 'futebol' }), ok);
    assert.deepEqual(validarPlacar({ ...base, modalidade: null }), ok);
    assert.equal(validarPlacar({ ...base, modalidade: 'volei-quadra' }).ok, false);
    assert.equal(validarPlacar({ ...base, modalidade: 'outro' }).ok, false);
  });
});

describe('resultado', () => {
  test('resultadoNormal ignora pênaltis', () => {
    assert.equal(resultadoNormal({ placarA: 2, placarB: 1 }), 'a');
    assert.equal(resultadoNormal({ placarA: 0, placarB: 3 }), 'b');
    assert.equal(resultadoNormal({ placarA: 1, placarB: 1, penaltisA: 5, penaltisB: 4 }), 'empate');
  });

  test('vencedorFinal usa pênaltis só no empate', () => {
    assert.deepEqual(vencedorFinal({ placarA: 2, placarB: 1 }), { lado: 'a', porPenaltis: false });
    assert.deepEqual(vencedorFinal({ placarA: 1, placarB: 1, penaltisA: 3, penaltisB: 4 }), {
      lado: 'b',
      porPenaltis: true,
    });
    assert.deepEqual(vencedorFinal({ placarA: 1, placarB: 1, penaltisA: null, penaltisB: null }), {
      lado: null,
      porPenaltis: false,
    });
    assert.deepEqual(vencedorFinal({ placarA: 0, placarB: 0 }), { lado: null, porPenaltis: false });
  });
});

describe('modalidades', () => {
  test('lista exata do contrato', () => {
    assert.deepEqual(
      MODALIDADES.map((m) => [m.id, m.penaltis]),
      [
        ['fifa', true],
        ['futebol', true],
        ['volei-quadra', false],
        ['volei-areia', false],
        ['outro', false],
      ],
    );
  });

  test('modalidadePorId e aceitaPenaltis', () => {
    assert.equal(modalidadePorId('fifa')?.nome, 'FIFA');
    assert.equal(modalidadePorId('xadrez'), null);
    assert.equal(aceitaPenaltis(undefined), true);
    assert.equal(aceitaPenaltis(null), true);
    assert.equal(aceitaPenaltis('futebol'), true);
    assert.equal(aceitaPenaltis('volei-areia'), false);
    assert.equal(aceitaPenaltis('desconhecida'), false);
  });
});
