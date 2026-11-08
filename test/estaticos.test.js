// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { iniciarServidor } from './ajuda/servidor.js';

describe('arquivos estáticos', () => {
  let s;
  before(async () => {
    s = await iniciarServidor();
  });
  after(() => s.fechar());

  test('a raiz entrega a página com ETag e sem cache de navegador nem de borda', async () => {
    const r = await s.chamar('GET', '/');
    assert.equal(r.status, 200);
    assert.match(r.cabecalhos.get('content-type'), /^text\/html/);
    assert.ok(r.cabecalhos.get('etag'));
    assert.equal(r.cabecalhos.get('cache-control'), 'no-cache');
    assert.equal(r.cabecalhos.get('cdn-cache-control'), 'no-store');
  });

  test('ETag igual devolve 304 sem corpo', async () => {
    const primeira = await s.chamar('GET', '/');
    const r = await s.chamar('GET', '/', { cabecalhos: { 'If-None-Match': primeira.cabecalhos.get('etag') } });
    assert.equal(r.status, 304);
    assert.equal(r.texto, '');
  });

  test('o service worker sai com versão e lista de arquivos preenchidas', async () => {
    const r = await s.chamar('GET', '/sw.js');
    assert.equal(r.status, 200);
    assert.ok(!r.texto.includes('__VERSAO__'));
    assert.ok(!r.texto.includes('__ARQUIVOS__'));
    assert.match(r.texto, /\/compartilhado\/codigos\.js/);
  });

  test('o núcleo compartilhado é servido sob /compartilhado', async () => {
    const r = await s.chamar('GET', '/compartilhado/codigos.js');
    assert.equal(r.status, 200);
    assert.match(r.cabecalhos.get('content-type'), /^text\/javascript/);
  });

  test('caminho fora da lista e tentativa de sair da pasta dão 404', async () => {
    for (const caminho of ['/nao-existe.js', '/../server/main.js', '/%2e%2e/server/main.js', '/server/main.js']) {
      const r = await s.chamar('GET', caminho);
      assert.equal(r.status, 404, caminho);
    }
  });

  test('método diferente de GET e HEAD não é atendido como arquivo', async () => {
    const r = await s.chamar('POST', '/', { corpo: {} });
    assert.notEqual(r.status, 200);
  });
});
