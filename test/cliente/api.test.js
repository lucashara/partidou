import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { chamar, ErroApi, ErroLocal, ErroRede } from '../../public/js/dados/api.js';

/** @param {() => Response | Promise<Response>} fabrica */
const fetchDe = (fabrica) => {
  /** @type {{ entrada: string, init: any }[]} */
  const chamadas = [];
  return {
    chamadas,
    fetchImpl: async (/** @type {string} */ entrada, /** @type {any} */ init) => {
      chamadas.push({ entrada, init });
      return fabrica();
    },
  };
};
const json = (
  /** @type {number} */ status,
  /** @type {any} */ corpo,
  /** @type {Record<string, string>} */ cabecalhos = {},
) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cabecalhos } });

describe('chamar', () => {
  test('devolve o JSON e envia Authorization e corpo', async () => {
    const { fetchImpl, chamadas } = fetchDe(() => json(201, { ok: 1 }));
    const r = await chamar('POST', '/api/x', { corpo: { a: 1 }, token: 'segredo', fetchImpl });
    assert.deepEqual(r, { ok: 1 });
    assert.equal(chamadas[0].init.method, 'POST');
    assert.equal(chamadas[0].init.headers.Authorization, 'Bearer segredo');
    assert.equal(chamadas[0].init.headers['Content-Type'], 'application/json');
    assert.equal(chamadas[0].init.body, '{"a":1}');
    assert.ok(!chamadas[0].entrada.includes('segredo'));
  });

  test('sem token não envia Authorization e sem corpo não envia Content-Type', async () => {
    const { fetchImpl, chamadas } = fetchDe(() => json(200, {}));
    await chamar('GET', '/api/x', { fetchImpl });
    assert.equal(chamadas[0].init.headers.Authorization, undefined);
    assert.equal(chamadas[0].init.headers['Content-Type'], undefined);
    assert.equal(chamadas[0].init.body, undefined);
  });

  test('204 devolve null', async () => {
    const { fetchImpl } = fetchDe(() => new Response(null, { status: 204 }));
    assert.equal(await chamar('DELETE', '/api/x', { fetchImpl }), null);
  });

  test('4xx vira ErroApi com código, campo, atual e Retry-After', async () => {
    const { fetchImpl } = fetchDe(() =>
      json(
        409,
        { erro: { codigo: 'CONFLITO_REVISAO', mensagem: 'Revisão desatualizada.', campo: 'rev', atual: { id: 'p' } } },
        { 'Retry-After': '9' },
      ),
    );
    await assert.rejects(chamar('PATCH', '/api/x', { fetchImpl }), (e) => {
      assert.ok(e instanceof ErroApi);
      assert.equal(e.status, 409);
      assert.equal(e.codigo, 'CONFLITO_REVISAO');
      assert.equal(e.mensagem, 'Revisão desatualizada.');
      assert.equal(e.campo, 'rev');
      assert.deepEqual(e.atual, { id: 'p' });
      assert.equal(e.retryAfter, 9);
      return true;
    });
  });

  test('4xx sem corpo JSON usa código e mensagem genéricos', async () => {
    const { fetchImpl } = fetchDe(() => new Response('<html>', { status: 403 }));
    await assert.rejects(chamar('GET', '/api/x', { fetchImpl }), {
      name: 'ErroApi',
      status: 403,
      codigo: 'ERRO_DESCONHECIDO',
    });
  });

  test('5xx vira ErroRede com servidor verdadeiro', async () => {
    const { fetchImpl } = fetchDe(() => json(503, {}));
    await assert.rejects(chamar('GET', '/api/x', { fetchImpl }), (e) => e instanceof ErroRede && e.servidor === true);
  });

  test('falha de rede vira ErroRede sem servidor', async () => {
    const fetchImpl = async () => {
      throw new TypeError('falha');
    };
    await assert.rejects(chamar('GET', '/api/x', { fetchImpl }), (e) => e instanceof ErroRede && e.servidor === false);
  });

  test('2xx com corpo que não é JSON vira ErroRede do servidor', async () => {
    const { fetchImpl } = fetchDe(() => new Response('<html>', { status: 200 }));
    await assert.rejects(chamar('GET', '/api/x', { fetchImpl }), (e) => e instanceof ErroRede && e.servidor === true);
  });

  test('tempo esgotado aborta a chamada e vira ErroRede', async () => {
    const fetchImpl = (/** @type {string} */ _entrada, /** @type {any} */ init) =>
      new Promise((_resolver, rejeitar) =>
        init.signal.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError'))),
      );
    await assert.rejects(
      chamar('GET', '/api/x', { fetchImpl: /** @type {any} */ (fetchImpl), tempoLimiteMs: 10 }),
      (e) => e instanceof ErroRede && /esgotado/.test(e.message),
    );
  });

  test('sinal externo cancela a chamada', async () => {
    const controle = new AbortController();
    const fetchImpl = (/** @type {string} */ _entrada, /** @type {any} */ init) =>
      new Promise((_resolver, rejeitar) =>
        init.signal.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError'))),
      );
    const promessa = chamar('GET', '/api/x', { fetchImpl: /** @type {any} */ (fetchImpl), sinal: controle.signal });
    controle.abort();
    await assert.rejects(promessa, ErroRede);
  });
});

test('ErroLocal carrega código, campo e mensagem', () => {
  const e = new ErroLocal('PLACAR_INVALIDO', 'Placar inválido.', 'placarA');
  assert.deepEqual(
    [e.codigo, e.campo, e.mensagem, e.message],
    ['PLACAR_INVALIDO', 'placarA', 'Placar inválido.', 'Placar inválido.'],
  );
});
