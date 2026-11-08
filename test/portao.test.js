import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, test } from 'node:test';
import { criarPortao } from '../server/http/portao.js';
import { iniciarServidor } from './ajuda/servidor.js';

describe('portão de respostas simultâneas', () => {
  test('recusa acima do teto e libera a vaga quando a resposta fecha', () => {
    const portao = criarPortao(2);
    const [a, b, c] = [new EventEmitter(), new EventEmitter(), new EventEmitter()];
    assert.equal(portao.entrar(/** @type {any} */ (a)), true);
    assert.equal(portao.entrar(/** @type {any} */ (b)), true);
    assert.equal(portao.entrar(/** @type {any} */ (c)), false);
    assert.equal(portao.emVoo(), 2);
    a.emit('close');
    assert.equal(portao.emVoo(), 1);
    assert.equal(portao.entrar(/** @type {any} */ (c)), true);
  });

  test('sem vaga, o estado responde 429 com Retry-After e sem corpo de estado', async () => {
    const s = await iniciarServidor({ opcoes: { estadosSimultaneos: 0 } });
    try {
      const { dono, id } = await s.resenhaComDois();
      const r = await fetch(`${s.url}/api/resenhas/${id}/estado`, {
        headers: { Authorization: `Bearer ${dono.token}` },
      });
      assert.equal(r.status, 429);
      assert.equal(r.headers.get('retry-after'), '2');
      const corpo = /** @type {any} */ (await r.json());
      assert.equal(corpo.erro.codigo, 'MUITAS_TENTATIVAS');
    } finally {
      await s.fechar();
    }
  });
});
