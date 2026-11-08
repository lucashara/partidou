// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ALFABETO_CROCKFORD,
  chaveRecuperacaoValida,
  codigoConviteValido,
  codigoTransferenciaValido,
  formatarCodigo,
  normalizarCodigo,
} from '../compartilhado/codigos.js';

describe('codigos', () => {
  test('alfabeto Crockford tem 32 símbolos sem I, L, O e U', () => {
    assert.equal(ALFABETO_CROCKFORD.length, 32);
    for (const c of 'ILOU') assert.ok(!ALFABETO_CROCKFORD.includes(c));
  });

  test('normalizarCodigo: maiúsculas, sem espaço e hífen, O vira 0, I e L viram 1', () => {
    assert.equal(normalizarCodigo('abcd-efgh jkmn'), 'ABCDEFGHJKMN');
    assert.equal(normalizarCodigo('o0il'), '0011');
    assert.equal(normalizarCodigo(null), '');
  });

  test('formatarCodigo agrupa de 4 em 4 e aceita outro tamanho de grupo', () => {
    assert.equal(formatarCodigo('ABCDEFGHJKMN'), 'ABCD-EFGH-JKMN');
    assert.equal(formatarCodigo('ABCDEFGH'), 'ABCD-EFGH');
    assert.equal(formatarCodigo('ABCD-EFGH-JKMN'), 'ABCD-EFGH-JKMN');
    assert.equal(formatarCodigo('A'.repeat(25), 5), 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA');
    assert.equal(formatarCodigo('ABC'), 'ABC');
  });

  test('codigoConviteValido exige 12 símbolos do alfabeto após normalizar', () => {
    assert.equal(codigoConviteValido('abcd-efgh-jkmn'), true);
    assert.equal(codigoConviteValido('ABCD EFGH JKMN'), true);
    assert.equal(codigoConviteValido('ABCD-EFGH-JKM'), false);
    assert.equal(codigoConviteValido('ABCD-EFGH-JKMNP'), false);
    assert.equal(codigoConviteValido('ABCD-EFGH-JKMU'), false);
    assert.equal(codigoConviteValido(undefined), false);
    assert.equal(codigoConviteValido(123456789012), true);
  });

  test('confusões previstas são aceitas', () => {
    assert.equal(codigoConviteValido('OILO-OILO-OILO'), true);
  });

  test('codigoTransferenciaValido exige 8 símbolos', () => {
    assert.equal(codigoTransferenciaValido('abcd-efgh'), true);
    assert.equal(codigoTransferenciaValido('abcd-efg'), false);
    assert.equal(codigoTransferenciaValido('ABCD-EFGH-JKMN'), false);
  });

  test('chaveRecuperacaoValida exige 25 símbolos', () => {
    assert.equal(chaveRecuperacaoValida('ABCDE-FGHJK-MNPQR-STVWX-YZ012'), true);
    assert.equal(chaveRecuperacaoValida('abcdefghjkmnpqrstvwxyz012'), true);
    assert.equal(chaveRecuperacaoValida('ABCDE-FGHJK-MNPQR-STVWX-YZ01'), false);
    assert.equal(chaveRecuperacaoValida('ABCDE-FGHJK-MNPQR-STVWX-YZ01U'), false);
  });
});
