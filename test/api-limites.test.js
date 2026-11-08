// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { lerConfiguracao } from '../server/configuracao.js';
import { criarLimitador, LIMITES_PADRAO } from '../server/limitador.js';
import { iniciarServidor, relogioControlavel } from './ajuda/servidor.js';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

describe('limites de capacidade', () => {
  test('MAX_MEMBROS: 403 RESENHA_CHEIA', async () => {
    const s = await iniciarServidor({ config: { maxMembros: 2 } });
    try {
      const dono = await s.criarResenha();
      await s.entrar(dono.convite, 'Um');
      const r = await s.chamar('POST', '/api/convites/aceitar', {
        corpo: { codigo: dono.convite.codigo, apelido: 'Dois' },
      });
      assert.equal(r.status, 403);
      assert.equal(r.corpo.erro.codigo, 'RESENHA_CHEIA');
    } finally {
      await s.fechar();
    }
  });

  test('MAX_COMPETIDORES: o lançamento é recusado inteiro', async () => {
    const s = await iniciarServidor({ config: { maxCompetidores: 3 } });
    try {
      const dono = await s.criarResenha();
      assert.equal((await s.lancar(dono.token, dono.id, { ladoA: { nome: 'A' }, ladoB: { nome: 'B' } })).status, 201);
      assert.equal((await s.lancar(dono.token, dono.id, { ladoA: { nome: 'A' }, ladoB: { nome: 'C' } })).status, 201);
      const r = await s.lancar(dono.token, dono.id, { ladoA: { nome: 'A' }, ladoB: { nome: 'D' } });
      assert.equal(r.status, 403);
      assert.equal(r.corpo.erro.codigo, 'LIMITE_ATINGIDO');
      const estado = (await s.chamar('GET', `/api/resenhas/${dono.id}/estado`, { token: dono.token })).corpo;
      assert.equal(estado.competidores.length, 3);
      assert.equal(estado.partidas.length, 2);
    } finally {
      await s.fechar();
    }
  });

  test('MAX_PARTIDAS: recusa a seguinte e aceita a repetição idempotente', async () => {
    const s = await iniciarServidor({ config: { maxPartidas: 2 } });
    try {
      const dono = await s.criarResenha();
      const primeira = await s.lancar(dono.token, dono.id);
      await s.lancar(dono.token, dono.id);
      const r = await s.lancar(dono.token, dono.id);
      assert.equal(r.status, 403);
      assert.equal(r.corpo.erro.codigo, 'LIMITE_ATINGIDO');
      const repetida = await s.chamar('POST', `/api/resenhas/${dono.id}/partidas`, {
        token: dono.token,
        corpo: {
          id: primeira.corpo.partida.id,
          ladoA: { nome: 'Lucas' },
          ladoB: { nome: 'João' },
          placarA: 2,
          placarB: 1,
        },
      });
      assert.equal(repetida.status, 200, 'repetir uma criação já feita não esbarra no limite');
    } finally {
      await s.fechar();
    }
  });

  test('MAX_CRIACOES_DIA e MAX_RESENHAS: 403 LIMITE_ATINGIDO', async () => {
    const s = await iniciarServidor({ config: { maxResenhas: 100, maxCriacoesDia: 2 } });
    try {
      await s.criarResenha();
      await s.criarResenha();
      const r = await s.chamar('POST', '/api/resenhas', { corpo: { nome: 'Terceira', apelido: 'Ana' } });
      assert.equal(r.status, 403);
      assert.equal(r.corpo.erro.codigo, 'LIMITE_ATINGIDO');
      s.relogio.avancar(24 * HORA + 1);
      assert.equal(
        (await s.chamar('POST', '/api/resenhas', { corpo: { nome: 'Terceira', apelido: 'Ana' } })).status,
        201,
      );
    } finally {
      await s.fechar();
    }
    const t = await iniciarServidor({ config: { maxResenhas: 1, maxCriacoesDia: 100 } });
    try {
      await t.criarResenha();
      assert.equal((await t.chamar('POST', '/api/resenhas', { corpo: { nome: 'Outra', apelido: 'Ana' } })).status, 403);
    } finally {
      await t.fechar();
    }
  });
});

describe('limitador por IP e por sessão', () => {
  test('criação de resenha: 5 por hora por IP, com Retry-After', async () => {
    const s = await iniciarServidor({ limitesPadrao: true, config: { maxCriacoesDia: 1000 } });
    try {
      const criar = () => s.chamar('POST', '/api/resenhas', { corpo: { nome: 'R', apelido: 'A' } });
      for (let i = 0; i < 5; i++) assert.equal((await criar()).status, 201);
      const r = await criar();
      assert.equal(r.status, 429);
      assert.equal(r.corpo.erro.codigo, 'MUITAS_TENTATIVAS');
      assert.ok(Number(r.cabecalhos.get('retry-after')) > 0);
      s.relogio.avancar(HORA);
      assert.equal((await criar()).status, 201);
    } finally {
      await s.fechar();
    }
  });

  test('requisições sem sessão: 60 por minuto por IP', async () => {
    const s = await iniciarServidor({ limitesPadrao: true });
    try {
      const pedir = () => s.chamar('GET', '/api/resenhas/xxxxxxxxxxxxxxxxxxxxxx/estado');
      let ultimo = 0;
      for (let i = 0; i < 61; i++) ultimo = (await pedir()).status;
      assert.equal(ultimo, 429);
      s.relogio.avancar(MINUTO);
      assert.equal((await pedir()).status, 401);
    } finally {
      await s.fechar();
    }
  });

  test('sessão: escrita 120 por minuto e leitura 300 por minuto, cada uma na sua janela', async () => {
    const s = await iniciarServidor({ limitesPadrao: true });
    try {
      const dono = await s.criarResenha();
      const estado = () => s.chamar('GET', `/api/resenhas/${dono.id}/estado`, { token: dono.token });
      const lancar = () => s.lancar(dono.token, dono.id);
      let status = 0;
      for (let i = 0; i < 121; i++) status = (await lancar()).status;
      assert.equal(status, 429, 'a 121ª escrita é recusada');
      assert.equal((await estado()).status, 200, 'a leitura tem contador próprio');
      s.relogio.avancar(MINUTO);
      assert.equal((await lancar()).status, 201);
      for (let i = 0; i < 300; i++) status = (await estado()).status;
      assert.equal(status, 200);
      assert.equal((await estado()).status, 429);
    } finally {
      await s.fechar();
    }
  });

  test('o limite é por sessão: outra sessão da mesma resenha segue liberada', async () => {
    const s = await iniciarServidor({ limitesPadrao: true });
    try {
      const { dono, visita, id } = await s.resenhaComDois();
      for (let i = 0; i < 121; i++) await s.lancar(dono.token, id);
      assert.equal((await s.lancar(dono.token, id)).status, 429);
      assert.equal((await s.lancar(visita.token, id)).status, 201);
    } finally {
      await s.fechar();
    }
  });

  test('bloqueio crescente: 8 falhas bloqueiam e o tempo dobra até o teto', () => {
    const relogio = relogioControlavel(1_000_000);
    const l = criarLimitador({ relogio: relogio.agora });
    try {
      for (let i = 0; i < 7; i++) l.falhaDeCodigo('1.1.1.1');
      assert.equal(l.bloqueioDeCodigo('1.1.1.1'), 0);
      l.falhaDeCodigo('1.1.1.1');
      assert.equal(l.bloqueioDeCodigo('1.1.1.1'), 30);
      l.falhaDeCodigo('1.1.1.1');
      assert.equal(l.bloqueioDeCodigo('1.1.1.1'), 60);
      assert.equal(l.bloqueioDeCodigo('2.2.2.2'), 0, 'outro IP não é afetado');
      relogio.avancar(61_000);
      assert.equal(l.bloqueioDeCodigo('1.1.1.1'), 0);
      for (let i = 0; i < 40; i++) l.falhaDeCodigo('1.1.1.1');
      assert.equal(l.bloqueioDeCodigo('1.1.1.1'), 3600);
    } finally {
      l.encerrar();
    }
  });

  test('disjuntor global bloqueia todos os IPs nas rotas de código', () => {
    const relogio = relogioControlavel(1_000_000);
    const l = criarLimitador({
      relogio: relogio.agora,
      limites: { disjuntorFalhasPorHora: 50, disjuntorBloqueioMs: 5 * MINUTO },
    });
    try {
      for (let i = 0; i < 50; i++) l.falhaDeCodigo(`10.0.0.${i}`);
      assert.ok(l.bloqueioDeCodigo('99.99.99.99') > 0, 'IP sem falhas também é bloqueado');
      relogio.avancar(5 * MINUTO + 1000);
      assert.equal(l.bloqueioDeCodigo('99.99.99.99'), 0);
    } finally {
      l.encerrar();
    }
  });

  test('IPv6 é agregado pelo /64 e o IPv4 mapeado conta como IPv4', () => {
    const l = criarLimitador({ limites: { criacaoPorHora: 2 } });
    try {
      assert.equal(l.criacao('2001:db8:1:2::1'), 0);
      assert.equal(l.criacao('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), 0);
      assert.ok(l.criacao('2001:db8:1:2::99') > 0, 'mesmo /64 divide o limite');
      assert.equal(l.criacao('2001:db8:1:3::1'), 0, 'outro /64 tem limite próprio');
      assert.equal(l.criacao('203.0.113.9'), 0);
      assert.equal(l.criacao('::ffff:203.0.113.9'), 0);
      assert.ok(l.criacao('203.0.113.9') > 0, 'IPv4 e a forma mapeada dividem o limite');
      for (let i = 0; i < 8; i++) l.falhaDeCodigo(`2001:db8:9:9:${i}::1`);
      assert.ok(l.bloqueioDeCodigo('2001:db8:9:9:ffff::2') > 0, 'falhas no /64 bloqueiam todo o prefixo');
      assert.equal(l.bloqueioDeCodigo('2001:db8:9:8::1'), 0);
    } finally {
      l.encerrar();
    }
  });

  test('padrões: disjuntor em 20000 falhas por hora e MAX_PARTIDAS em 5000', async () => {
    assert.equal(LIMITES_PADRAO.disjuntorFalhasPorHora, 20_000);
    assert.equal(lerConfiguracao({}).maxPartidas, 5000);
  });

  test('mapas têm teto de tamanho e a varredura remove os expirados', () => {
    const relogio = relogioControlavel(1_000_000);
    const l = criarLimitador({ relogio: relogio.agora, limites: { tetoMapa: 100 } });
    try {
      for (let i = 0; i < 1000; i++) {
        l.criacao(`ip-${i}`);
        l.semToken(`ip-${i}`);
        l.sessao(`s-${i}`, true);
        l.sessao(`s-${i}`, false);
        l.falhaDeCodigo(`ip-${i}`);
      }
      for (const [nome, n] of Object.entries(l.tamanhos())) assert.ok(n <= 100, `${nome}: ${n}`);
      relogio.avancar(25 * HORA);
      l.varrer();
      assert.deepEqual(l.tamanhos(), { criacao: 0, semToken: 0, escrita: 0, leitura: 0, falhas: 0 });
    } finally {
      l.encerrar();
    }
  });
});
