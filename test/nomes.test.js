// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { chaveDeNome, LIMITES, normalizarNome, validarNome } from '../compartilhado/nomes.js';

describe('normalizarNome', () => {
  test('remove espaços nas pontas e colapsa os internos', () => {
    assert.equal(normalizarNome('  Ana   Maria \t Souza  '), 'Ana Maria Souza');
  });

  test('normaliza para NFC', () => {
    const decomposto = 'José';
    assert.equal(normalizarNome(decomposto), 'José');
    assert.equal(normalizarNome(decomposto).length, 4);
  });

  test('entrada nula vira texto vazio', () => {
    assert.equal(normalizarNome(null), '');
    assert.equal(normalizarNome(undefined), '');
  });
});

describe('chaveDeNome', () => {
  test('ignora acento, caixa e espaços repetidos', () => {
    assert.equal(chaveDeNome('  JOÃO  da Silva '), 'joao da silva');
    assert.equal(chaveDeNome('joao da silva'), chaveDeNome('João Da  Silva'));
  });

  test('forma composta e decomposta têm a mesma chave', () => {
    assert.equal(chaveDeNome('José'), chaveDeNome('José'));
  });

  test('nomes diferentes têm chaves diferentes', () => {
    assert.notEqual(chaveDeNome('Ana'), chaveDeNome('Anna'));
  });
});

describe('validarNome', () => {
  test('aceita e normaliza', () => {
    assert.deepEqual(validarNome('  Lucas  ', LIMITES.apelido), { ok: true, valor: 'Lucas' });
  });

  test('recusa vazio, só espaços e tipo errado', () => {
    for (const entrada of ['', '   ', null, 12, {}]) assert.equal(validarNome(entrada, 10).ok, false);
  });

  test('conta pontos de código, não unidades UTF-16', () => {
    assert.equal(validarNome('😀'.repeat(5), 5).ok, true);
    assert.equal(validarNome('😀'.repeat(6), 5).ok, false);
  });

  test('recusa caracteres de controle e formatação invisível', () => {
    assert.equal(validarNome('Ana\u0000', 10).ok, false);
    assert.equal(validarNome('Ana‮odnum', 20).ok, false);
    assert.equal(validarNome('Ana​x', 20).ok, false);
  });

  test('mantém sequências de emoji com U+200D', () => {
    assert.equal(validarNome('👨‍👩‍👧', 10).ok, true);
  });
});
