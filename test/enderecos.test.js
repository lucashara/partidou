import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { chaveDeLimite, normalizarEndereco } from '../server/enderecos.js';

describe('normalizarEndereco', () => {
  test('IPv4 mapeado em IPv6 vira IPv4, nas duas grafias', () => {
    assert.equal(normalizarEndereco('::ffff:203.0.113.9'), '203.0.113.9');
    assert.equal(normalizarEndereco('::FFFF:cb00:7109'), '203.0.113.9');
    assert.equal(normalizarEndereco('::ffff:127.0.0.1'), '127.0.0.1');
  });

  test('os demais valores seguem como vieram', () => {
    for (const v of ['203.0.113.9', '::1', '2001:db8::1', 'desconhecida', 'ip-12']) {
      assert.equal(normalizarEndereco(v), v);
    }
  });
});

describe('chaveDeLimite', () => {
  test('IPv4 fica inalterado e o mapeado equivale ao IPv4', () => {
    assert.equal(chaveDeLimite('203.0.113.9'), '203.0.113.9');
    assert.equal(chaveDeLimite('::ffff:203.0.113.9'), '203.0.113.9');
  });

  test('IPv6 do mesmo /64 compartilha a chave e /64 diferentes não', () => {
    const a = chaveDeLimite('2001:db8:1:2::1');
    assert.equal(a, '2001:db8:1:2::/64');
    assert.equal(chaveDeLimite('2001:0db8:0001:0002:ffff:ffff:ffff:ffff'), a);
    assert.equal(chaveDeLimite('2001:db8:1:2:abcd::9'), a);
    assert.notEqual(chaveDeLimite('2001:db8:1:3::1'), a);
    assert.equal(chaveDeLimite('::1'), '0:0:0:0::/64');
  });

  test('texto que não é IP segue como veio', () => {
    assert.equal(chaveDeLimite('desconhecida'), 'desconhecida');
  });
});
