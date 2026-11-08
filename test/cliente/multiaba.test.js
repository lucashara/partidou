import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarArmazenamentoMemoria } from '../../public/js/dados/armazenamento.js';
import { criarMutexMemoria } from '../../public/js/dados/sincronizacao.js';
import { assentar, criarAmbiente, criarHubCanais, partidaSimples } from './ajuda/ambiente.js';

const ehCriacao = (/** @type {any} */ c) => c.metodo === 'POST' && c.caminho.endsWith('/partidas');

test('duas abas sobre o mesmo armazenamento: uma lança, a outra renotifica e o servidor recebe cada operação uma vez', async () => {
  const armazenamento = criarArmazenamentoMemoria();
  const ambiente = criarAmbiente({ armazenamento });
  await ambiente.semearResenha();
  const travas = criarMutexMemoria();
  const hub = criarHubCanais();
  const abaA = ambiente.criarRepositorio({ travas, canal: hub.novo() });
  const abaB = ambiente.criarRepositorio({ travas, canal: hub.novo() });
  const a = /** @type {any} */ (await abaA.abrir(ambiente.servidor.resenhaId));
  const b = /** @type {any} */ (await abaB.abrir(ambiente.servidor.resenhaId));
  await assentar();

  /** @type {import('../../public/js/dados/tipos.js').Visao[]} */
  const vistasEmB = [];
  b.assinar((/** @type {any} */ v) => vistasEmB.push(v));
  await assentar();
  const chamadasAntes = ambiente.servidor.chamadas.length;
  vistasEmB.length = 0;

  ambiente.servidor.programar(ehCriacao, 'rede', 1);
  const { partidaId } = await a.lancar(partidaSimples());
  await assentar();
  const vistaPendente = vistasEmB.find((v) => v.partidas.some((p) => p.id === partidaId && p.pendente));
  assert.ok(vistaPendente, 'a outra aba mostra a partida pendente sem consultar a rede');
  assert.equal(
    ambiente.servidor.chamadas.slice(chamadasAntes).filter((c) => c.metodo === 'GET' && c.caminho.includes('/estado'))
      .length,
    0,
    'a aba B não sincroniza sozinha por causa do broadcast',
  );

  await a.ressincronizar();
  await assentar();
  assert.equal(ambiente.servidor.partidas.size, 1);
  const enviadas = ambiente.servidor.chamadas.filter(ehCriacao).filter((c) => c.corpo.id === partidaId);
  assert.equal(enviadas.length, 2, 'uma tentativa falha e uma bem-sucedida, ambas da aba A');
  assert.equal(b.visao().partidas.length, 1);
  assert.equal(b.visao().partidas[0].pendente, false);
  assert.equal(b.visao().sync.pendentes, 0);
});

test('as duas abas sincronizando juntas enviam cada operação uma vez', async () => {
  const armazenamento = criarArmazenamentoMemoria();
  const ambiente = criarAmbiente({ armazenamento });
  await ambiente.semearResenha();
  const travas = criarMutexMemoria();
  const hub = criarHubCanais();
  const a = /** @type {any} */ (
    await ambiente.criarRepositorio({ travas, canal: hub.novo() }).abrir(ambiente.servidor.resenhaId)
  );
  const b = /** @type {any} */ (
    await ambiente.criarRepositorio({ travas, canal: hub.novo() }).abrir(ambiente.servidor.resenhaId)
  );
  await assentar();
  ambiente.servidor.programar(() => true, 'rede', 1000);
  await a.lancar(partidaSimples());
  await a.lancar(partidaSimples({ placarA: 5 }));
  await assentar();
  ambiente.servidor.limpar();
  const antes = ambiente.servidor.chamadas.filter(ehCriacao).length;
  await Promise.all([a.ressincronizar(), b.ressincronizar()]);
  await assentar();
  assert.equal(ambiente.servidor.chamadas.filter(ehCriacao).length - antes, 2);
  assert.equal(ambiente.servidor.partidas.size, 2);
});
