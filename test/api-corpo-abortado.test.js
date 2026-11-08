// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { describe, test } from 'node:test';
import { iniciarServidor } from './ajuda/servidor.js';

describe('corpo interrompido pelo cliente', () => {
  test('registra cliente_desconectou em info, sem erro_interno', async () => {
    const eventos = [];
    const registro = {
      info: (evento, dados) => eventos.push({ nivel: 'info', evento, dados }),
      aviso: (evento, dados) => eventos.push({ nivel: 'aviso', evento, dados }),
      erro: (evento, dados) => eventos.push({ nivel: 'erro', evento, dados }),
    };
    const s = await iniciarServidor({ opcoes: { registro } });
    try {
      const socket = connect(s.porta, '127.0.0.1');
      await new Promise((resolver) => socket.once('connect', resolver));
      socket.write(
        'POST /api/resenhas HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"nome":',
      );
      await new Promise((resolver) => setTimeout(resolver, 50));
      socket.destroy();
      for (let i = 0; i < 100 && !eventos.some((e) => e.evento === 'cliente_desconectou'); i++) {
        await new Promise((resolver) => setTimeout(resolver, 20));
      }
      const desconectou = eventos.find((e) => e.evento === 'cliente_desconectou');
      assert.equal(desconectou?.nivel, 'info');
      assert.equal(desconectou.dados.rota, '/api/resenhas');
      assert.equal(
        eventos.some((e) => e.nivel === 'erro'),
        false,
        'nenhum erro registrado',
      );
    } finally {
      await s.fechar();
    }
  });
});
