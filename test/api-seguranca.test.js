// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { lerConfiguracao } from '../server/configuracao.js';
import { origemDe } from '../server/http/origem.js';
import { iniciarServidor } from './ajuda/servidor.js';

const req = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });

describe('cabeçalhos e erros HTTP', () => {
  let s;
  before(async () => {
    s = await iniciarServidor();
  });
  after(() => s.fechar());

  const CABECALHOS = [
    'content-security-policy',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'cross-origin-opener-policy',
  ];

  test('toda resposta leva os cabeçalhos de segurança, inclusive erros', async () => {
    const dono = await s.criarResenha();
    const respostas = [
      await s.chamar('GET', '/saude'),
      await s.chamar('GET', '/api/resenhas/xxxxxxxxxxxxxxxxxxxxxx/estado'),
      await s.chamar('GET', `/api/resenhas/${dono.id}/estado`, { token: dono.token }),
      await s.chamar('GET', '/api/inexistente'),
      await s.chamar('GET', '/nao-existe'),
      await s.chamar('GET', '/'),
      await s.chamar('POST', '/api/resenhas', { bruto: '{', cabecalhos: { 'Content-Type': 'application/json' } }),
    ];
    for (const r of respostas) {
      for (const nome of CABECALHOS) assert.ok(r.cabecalhos.get(nome), `${nome} em ${r.status}`);
      assert.equal(r.cabecalhos.get('x-content-type-options'), 'nosniff');
      assert.equal(r.cabecalhos.get('strict-transport-security'), null, 'HSTS só atrás do Cloudflare');
    }
    assert.match(respostas[0].cabecalhos.get('content-security-policy'), /default-src 'self'/);
    assert.match(respostas[0].cabecalhos.get('content-security-policy'), /frame-ancestors 'none'/);
  });

  test('toda rota /api/* responde com Cache-Control: no-store', async () => {
    const dono = await s.criarResenha();
    for (const r of [
      await s.chamar('GET', `/api/resenhas/${dono.id}/estado`, { token: dono.token }),
      await s.chamar('GET', '/api/nada'),
      await s.chamar('POST', '/api/convites/consultar', { corpo: { codigo: 'x' } }),
    ]) {
      assert.match(r.cabecalhos.get('cache-control'), /no-store/);
    }
  });

  test('HSTS aparece com TRUST_PROXY=cloudflare', async () => {
    const t = await iniciarServidor({ config: { trustProxy: 'cloudflare' } });
    try {
      assert.match((await t.chamar('GET', '/saude')).cabecalhos.get('strict-transport-security'), /max-age=\d+/);
    } finally {
      await t.fechar();
    }
  });

  test('/saude responde ok sem expor versão', async () => {
    const r = await s.chamar('GET', '/saude');
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo, { ok: true });
  });

  test('corpo acima de 16 KiB é 413', async () => {
    const r = await s.chamar('POST', '/api/resenhas', { corpo: { nome: 'x'.repeat(17 * 1024), apelido: 'Ana' } });
    assert.equal(r.status, 413);
    assert.equal(r.corpo.erro.codigo, 'CORPO_GRANDE');
    const limite = await s.chamar('POST', '/api/resenhas', {
      corpo: { nome: 'Ok', apelido: 'a'.repeat(24), sobra: 'y'.repeat(8 * 1024) },
    });
    assert.equal(limite.status, 201, 'campo desconhecido abaixo do limite é ignorado');
  });

  test('tipo de conteúdo errado é 415 e JSON inválido é 400', async () => {
    const texto = await s.chamar('POST', '/api/resenhas', {
      bruto: '{}',
      cabecalhos: { 'Content-Type': 'text/plain' },
    });
    assert.equal(texto.status, 415);
    const sem = await s.chamar('POST', '/api/resenhas', { bruto: '{}' });
    assert.equal(sem.status, 415);
    for (const bruto of ['{', '[]', 'null', '"texto"', '']) {
      const r = await s.chamar('POST', '/api/resenhas', { bruto, cabecalhos: { 'Content-Type': 'application/json' } });
      assert.equal(r.status, 400, JSON.stringify(bruto));
      assert.equal(r.corpo.erro.codigo, 'REQUISICAO_INVALIDA');
    }
    const comCharset = await s.chamar('POST', '/api/resenhas', {
      bruto: JSON.stringify({ nome: 'Ok', apelido: 'Ana' }),
      cabecalhos: { 'Content-Type': 'application/json; charset=utf-8' },
    });
    assert.equal(comCharset.status, 201);
  });

  test('rota e método desconhecidos são 404 NAO_ENCONTRADO sem vazar detalhe', async () => {
    for (const [metodo, caminho] of [
      ['GET', '/api/nada'],
      ['DELETE', '/api/resenhas'],
      ['PUT', '/api/resenhas/abc/estado'],
      ['GET', '/api/../etc/passwd'],
    ]) {
      const r = await s.chamar(metodo, caminho);
      assert.ok([404, 405].includes(r.status), `${metodo} ${caminho} -> ${r.status}`);
      assert.ok(!r.texto.includes('/Users'), 'sem caminho de arquivo na resposta');
    }
    assert.equal((await s.chamar('GET', '/api/nada')).corpo.erro.codigo, 'NAO_ENCONTRADO');
  });

  test('estáticos não saem da pasta pública', async () => {
    for (const caminho of [
      '/../package.json',
      '/%2e%2e/package.json',
      '/compartilhado/../server/main.js',
      '/..%2fserver/main.js',
    ]) {
      const r = await s.chamar('GET', caminho);
      assert.ok(!r.texto.includes('"name"') && !r.texto.includes('lerConfiguracao'), caminho);
    }
  });

  test('token no formato errado, em outro esquema ou duplicado não autentica', async () => {
    const dono = await s.criarResenha();
    const base = `/api/resenhas/${dono.id}/estado`;
    for (const authorization of [
      dono.token,
      `Basic ${dono.token}`,
      `Bearer ${dono.token} extra`,
      'Bearer ',
      `bearer-${dono.token}`,
    ]) {
      const r = await s.chamar('GET', base, { cabecalhos: { Authorization: authorization } });
      assert.equal(r.status, 401, authorization.slice(0, 12));
      assert.equal(r.corpo.erro.codigo, 'NAO_AUTENTICADO');
    }
    assert.equal((await s.chamar('GET', `${base}?token=${dono.token}`)).status, 401, 'token na URL não vale');
  });
});

describe('origem do cliente', () => {
  test('sem confiança no proxy, os cabeçalhos são ignorados', () => {
    const r = req('203.0.113.9', { 'cf-connecting-ip': '198.51.100.1', 'x-forwarded-for': '198.51.100.2' });
    assert.equal(origemDe(r, lerConfiguracao({})), '203.0.113.9');
  });

  test('CF-Connecting-IP vale só com cloudflare e socket em loopback', () => {
    const cabecalhos = { 'cf-connecting-ip': ' 198.51.100.1 ' };
    const cf = lerConfiguracao({ TRUST_PROXY: 'cloudflare' });
    assert.equal(origemDe(req('127.0.0.1', cabecalhos), cf), '198.51.100.1');
    assert.equal(origemDe(req('::1', cabecalhos), cf), '198.51.100.1');
    assert.equal(origemDe(req('::ffff:127.0.0.1', cabecalhos), cf), '198.51.100.1');
    assert.equal(origemDe(req('203.0.113.9', cabecalhos), cf), '203.0.113.9', 'socket externo não é confiável');
  });

  test('valor inválido, ausente ou X-Forwarded-For não substituem o socket', () => {
    const cf = lerConfiguracao({ TRUST_PROXY: 'cloudflare' });
    assert.equal(origemDe(req('127.0.0.1', { 'cf-connecting-ip': 'não-é-ip' }), cf), '127.0.0.1');
    assert.equal(origemDe(req('127.0.0.1', {}), cf), '127.0.0.1');
    assert.equal(origemDe(req('127.0.0.1', { 'x-forwarded-for': '198.51.100.2' }), cf), '127.0.0.1');
    assert.equal(origemDe(req('127.0.0.1', { 'cf-connecting-ip': ['1.1.1.1', '2.2.2.2'] }), cf), '127.0.0.1');
    assert.equal(origemDe({ socket: {}, headers: {} }, cf), 'desconhecida');
  });

  test('PROXY_CONFIAVEL substitui o loopback pelo gateway do container', () => {
    const cabecalhos = { 'cf-connecting-ip': '198.51.100.1' };
    const cf = lerConfiguracao({ TRUST_PROXY: 'cloudflare', PROXY_CONFIAVEL: '172.29.91.1, 172.29.91.2' });
    assert.equal(origemDe(req('172.29.91.1', cabecalhos), cf), '198.51.100.1');
    assert.equal(origemDe(req('172.29.91.2', cabecalhos), cf), '198.51.100.1');
    assert.equal(origemDe(req('127.0.0.1', cabecalhos), cf), '127.0.0.1', 'só a lista informada é confiável');
    assert.equal(origemDe(req('172.29.91.9', cabecalhos), cf), '172.29.91.9');
  });

  test('PROXY_CONFIAVEL confia no gateway também na grafia IPv4 mapeado em IPv6', () => {
    const cabecalhos = { 'cf-connecting-ip': '198.51.100.1' };
    const cf = lerConfiguracao({ TRUST_PROXY: 'cloudflare', PROXY_CONFIAVEL: '172.29.91.1' });
    assert.equal(origemDe(req('::ffff:172.29.91.1', cabecalhos), cf), '198.51.100.1');
    const mapeado = lerConfiguracao({ TRUST_PROXY: 'cloudflare', PROXY_CONFIAVEL: '::ffff:172.29.91.1' });
    assert.equal(origemDe(req('172.29.91.1', cabecalhos), mapeado), '198.51.100.1');
  });

  test('CF-Connecting-IP por socket não confiável gera um único aviso por registro', () => {
    const avisos = [];
    const registro = { info() {}, erro() {}, aviso: (evento, dados) => avisos.push([evento, dados]) };
    const cf = lerConfiguracao({ TRUST_PROXY: 'cloudflare' });
    const cabecalhos = { 'cf-connecting-ip': '198.51.100.1' };
    assert.equal(origemDe(req('203.0.113.9', cabecalhos), cf, registro), '203.0.113.9');
    assert.equal(origemDe(req('203.0.113.10', cabecalhos), cf, registro), '203.0.113.10');
    assert.deepEqual(avisos, [['cf_connecting_ip_ignorado', { socket: '203.0.113.9' }]]);
    origemDe(req('203.0.113.9', {}), cf, { ...registro, aviso: () => assert.fail('sem cabeçalho não avisa') });
    origemDe(req('203.0.113.9', cabecalhos), lerConfiguracao({}), {
      ...registro,
      aviso: () => assert.fail('sem TRUST_PROXY não avisa'),
    });
    origemDe(req('127.0.0.1', cabecalhos), cf, { ...registro, aviso: () => assert.fail('socket confiável não avisa') });
  });

  test('PROXY_CONFIAVEL só aceita endereços IP', () => {
    assert.throws(() => lerConfiguracao({ PROXY_CONFIAVEL: '172.29.91.0/24' }), /PROXY_CONFIAVEL inválida/);
    assert.throws(() => lerConfiguracao({ PROXY_CONFIAVEL: 'localhost' }), /PROXY_CONFIAVEL inválida/);
  });
});
