import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assentar, criarAmbiente, partidaSimples } from './ajuda/ambiente.js';

const ehCriacao = (/** @type {any} */ c) => c.metodo === 'POST' && c.caminho.endsWith('/partidas');

/** @param {ReturnType<typeof criarAmbiente>} ambiente @param {number} [aleatorio] */
async function abrir(ambiente, aleatorio = 0) {
  await ambiente.semearResenha();
  const repositorio = ambiente.criarRepositorio({ aleatorio: () => aleatorio });
  const controlador = /** @type {any} */ (await repositorio.abrir(ambiente.servidor.resenhaId));
  await assentar();
  return controlador;
}

const msDoUltimo = (/** @type {ReturnType<typeof criarAmbiente>} */ ambiente) => ambiente.ativos().at(-1)?.ms;

describe('recuo e retomada', () => {
  test('recuo 2, 5, 15, 30, 60 s e teto em 60 s', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    ambiente.servidor.programar(() => true, 'rede', 1000);
    await controlador.lancar(partidaSimples());
    await assentar();
    const atrasos = [msDoUltimo(ambiente)];
    for (let i = 0; i < 6; i += 1) {
      await ambiente.dispararUltimo();
      atrasos.push(msDoUltimo(ambiente));
    }
    assert.deepEqual(atrasos, [2000, 5000, 15000, 30000, 60000, 60000, 60000]);
    assert.equal(controlador.visao().sync.estado, 'offline');
  });

  test('jitter reduz até 20% e nunca passa do teto', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente, 1);
    ambiente.servidor.programar(() => true, 'rede', 1000);
    await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(msDoUltimo(ambiente), 1600);
  });

  test('o temporizador de retentativa envia a fila quando a rede volta', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    ambiente.servidor.programar(() => true, 'rede', 3);
    const { partidaId } = await controlador.lancar(partidaSimples());
    await assentar();
    ambiente.servidor.limpar();
    await ambiente.dispararUltimo();
    assert.ok(ambiente.servidor.partidas.has(partidaId));
    assert.equal(controlador.visao().sync.estado, 'sincronizado');
    assert.equal(ambiente.ativos().length, 0);
  });

  test('evento online retoma na hora e zera o recuo', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    ambiente.servidor.programar(() => true, 'rede', 1000);
    const { partidaId } = await controlador.lancar(partidaSimples());
    await assentar();
    ambiente.servidor.limpar();
    await ambiente.emitirPagina('online');
    assert.ok(ambiente.servidor.partidas.has(partidaId));
    assert.equal(controlador.visao().sync.estado, 'sincronizado');
  });

  test('página oculta não agenda temporizador e a volta da visibilidade retoma', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    await ambiente.emitirPagina('oculta');
    ambiente.servidor.programar(() => true, 'rede', 1000);
    const { partidaId } = await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(ambiente.ativos().length, 0);
    assert.equal(controlador.visao().sync.estado, 'offline');
    ambiente.servidor.limpar();
    await ambiente.emitirPagina('visivel');
    assert.ok(ambiente.servidor.partidas.has(partidaId));
    assert.equal(controlador.visao().sync.estado, 'sincronizado');
  });

  test('ocultar a página cancela a retentativa já agendada', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    ambiente.servidor.programar(() => true, 'rede', 1000);
    await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(ambiente.ativos().length, 1);
    await ambiente.emitirPagina('oculta');
    assert.equal(ambiente.ativos().length, 0);
  });

  test('evento offline marca o estado sem chamar a rede', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    const antes = ambiente.servidor.chamadas.length;
    await ambiente.emitirPagina('offline');
    assert.equal(controlador.visao().sync.estado, 'offline');
    assert.equal(ambiente.servidor.chamadas.length, antes);
  });

  test('429 respeita Retry-After com teto de 120 s', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    ambiente.servidor.programar(ehCriacao, {
      status: 429,
      corpo: { erro: { codigo: 'MUITAS_TENTATIVAS', mensagem: 'Muitas tentativas.' } },
      cabecalhos: { 'Retry-After': '7' },
    });
    await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(msDoUltimo(ambiente), 7000);
    assert.equal(controlador.visao().sync.estado, 'offline');
    assert.equal(controlador.visao().sync.pendentes, 1);

    ambiente.servidor.programar(ehCriacao, {
      status: 429,
      corpo: { erro: { codigo: 'MUITAS_TENTATIVAS', mensagem: 'Muitas tentativas.' } },
      cabecalhos: { 'Retry-After': '900' },
    });
    await ambiente.dispararUltimo();
    assert.equal(msDoUltimo(ambiente), 120000);
  });

  test('erro 5xx mantém a operação e marca offline', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    ambiente.servidor.programar(() => true, { status: 502, corpo: {} }, 1000);
    await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(controlador.visao().sync.estado, 'offline');
    assert.equal(controlador.visao().sync.pendentes, 1);
    const [op] = await ambiente.armazenamento.listarFila(ambiente.servidor.resenhaId);
    assert.ok(op.tentativas >= 1);
  });
});
