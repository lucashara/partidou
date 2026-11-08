// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { iniciarServidor } from './ajuda/servidor.js';
import { abrirSse } from './ajuda/sse.js';

describe('eventos em tempo real', () => {
  let s;
  /** @type {Array<{ fechar: () => void }>} */
  const abertas = [];
  before(async () => {
    s = await iniciarServidor({ opcoes: { conexoesSse: { porResenha: 3, porSessao: 2, total: 4, batimentoMs: 60 } } });
  });
  after(async () => {
    for (const c of abertas) c.fechar();
    await s.fechar();
  });
  const abrir = async (id, token) => {
    const c = await abrirSse(s.url, `/api/resenhas/${id}/eventos`, token);
    abertas.push(c);
    return c;
  };

  test('envia o seq inicial e avisa quando outra sessão lança', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const c = await abrir(id, dono.token);
    assert.equal(c.status, 200);
    assert.match(c.cabecalhos['content-type'], /^text\/event-stream/);
    assert.match(c.cabecalhos['cache-control'], /no-store/);
    assert.ok(c.cabecalhos['content-security-policy']);
    await c.esperar((t) => t.includes('event: seq\ndata: 2\n\n'));
    const lancada = (await s.lancar(visita.token, id)).corpo;
    await c.esperar((t) => t.includes(`event: seq\ndata: ${lancada.seq}\n\n`));
  });

  test('não vaza eventos de outra resenha', async () => {
    const x = await s.resenhaComDois();
    const y = await s.resenhaComDois();
    const c = await abrir(x.id, x.dono.token);
    await c.esperar((t) => t.includes('event: seq'));
    await s.lancar(y.dono.token, y.id);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(c.texto().match(/event: seq/g).length, 1);
  });

  test('exige sessão válida e membro da resenha', async () => {
    const x = await s.resenhaComDois();
    const y = await s.resenhaComDois();
    const sem = await s.chamar('GET', `/api/resenhas/${x.id}/eventos`);
    assert.equal(sem.status, 401);
    const outra = await s.chamar('GET', `/api/resenhas/${x.id}/eventos`, { token: y.dono.token });
    assert.equal(outra.status, 404);
  });

  test('remover o membro envia revogado e encerra a conexão', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const c = await abrir(id, visita.token);
    await c.esperar((t) => t.includes('event: seq'));
    assert.equal(
      (await s.chamar('DELETE', `/api/resenhas/${id}/membros/${visita.membro.id}`, { token: dono.token })).status,
      204,
    );
    await c.esperar((t, fechada) => t.includes('event: revogado') && fechada);
  });

  test('sair do aparelho e excluir a resenha também derrubam', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const a = await abrir(id, visita.token);
    await a.esperar((t) => t.includes('event: seq'));
    await s.chamar('DELETE', `/api/resenhas/${id}/membros/eu`, { token: visita.token });
    await a.esperar((t, fechada) => t.includes('event: revogado') && fechada);
    const b = await abrir(id, dono.token);
    await b.esperar((t) => t.includes('event: seq'));
    await s.chamar('DELETE', `/api/resenhas/${id}`, { token: dono.token });
    await b.esperar((t, fechada) => t.includes('event: revogado') && fechada);
  });

  test('limites por sessão, por resenha e total respondem 429', async () => {
    const { dono, visita, id } = await s.resenhaComDois();
    const base = s.ctx.eventos.total();
    const c1 = await abrir(id, dono.token);
    const c2 = await abrir(id, dono.token);
    assert.equal(s.ctx.eventos.total(), base + 2);
    const terceira = await s.chamar('GET', `/api/resenhas/${id}/eventos`, { token: dono.token });
    assert.equal(terceira.status, 429, 'limite por sessão');
    assert.ok(terceira.cabecalhos.get('retry-after'));
    c1.fechar();
    c2.fechar();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(s.ctx.eventos.total(), base);

    const v1 = await abrir(id, visita.token);
    const outro = await s.entrar(dono.convite, 'Terceiro');
    const t1 = await abrir(id, outro.token);
    const quarto = await s.entrar(dono.convite, 'Quarto');
    const q1 = await abrir(id, quarto.token);
    const quinto = await s.entrar(dono.convite, 'Quinto');
    const porResenha = await s.chamar('GET', `/api/resenhas/${id}/eventos`, { token: quinto.token });
    assert.equal(porResenha.status, 429, 'limite por resenha');
    for (const c of [v1, t1, q1]) c.fechar();
  });

  test('batimento mantém a conexão ativa', async () => {
    const { dono, id } = await s.resenhaComDois();
    const c = await abrir(id, dono.token);
    await c.esperar((t) => t.includes(': batimento'));
  });
});
