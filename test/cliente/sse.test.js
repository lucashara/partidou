import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { criarAnalisadorSse } from '../../public/js/dados/sse.js';
import { assentar, criarAmbiente, partidaSimples } from './ajuda/ambiente.js';

const ehEventos = (/** @type {any} */ c) => c.caminho.endsWith('/eventos');
const ehEstado = (/** @type {any} */ c) => c.metodo === 'GET' && c.caminho.includes('/estado');

/** @param {string[]} fragmentos */
function analisar(fragmentos) {
  /** @type {{ tipo: string, dados: string }[]} */
  const eventos = [];
  /** @type {number[]} */
  const retries = [];
  const analisador = criarAnalisadorSse({ aoEvento: (e) => eventos.push(e), aoRetry: (ms) => retries.push(ms) });
  for (const f of fragmentos) analisador.alimentar(f);
  return { eventos, retries };
}

describe('analisador de SSE', () => {
  test('lê retry, evento e dados', () => {
    const { eventos, retries } = analisar(['retry: 3000\n\nevent: seq\ndata: 12\n\n']);
    assert.deepEqual(retries, [3000]);
    assert.deepEqual(eventos, [{ tipo: 'seq', dados: '12' }]);
  });

  test('junta fragmentos partidos em qualquer ponto', () => {
    const texto = 'event: seq\ndata: 345\n\nevent: revogado\ndata: x\n\n';
    for (let corte = 1; corte < texto.length; corte += 1) {
      const { eventos } = analisar([texto.slice(0, corte), texto.slice(corte)]);
      assert.deepEqual(
        eventos,
        [
          { tipo: 'seq', dados: '345' },
          { tipo: 'revogado', dados: 'x' },
        ],
        `corte em ${corte}`,
      );
    }
  });

  test('CRLF partido entre fragmentos conta como uma quebra só', () => {
    const { eventos } = analisar(['event: seq\r', '\ndata: 7\r\n', '\r', '\n']);
    assert.deepEqual(eventos, [{ tipo: 'seq', dados: '7' }]);
  });

  test('ignora comentário de batimento e não gera evento sem dados', () => {
    const { eventos } = analisar([': batimento\n\n', ': outro\n', 'event: seq\ndata: 1\n\n']);
    assert.deepEqual(eventos, [{ tipo: 'seq', dados: '1' }]);
  });

  test('várias linhas de dados se juntam e o tipo padrão é message', () => {
    const { eventos } = analisar(['data: a\ndata: b\n\n']);
    assert.deepEqual(eventos, [{ tipo: 'message', dados: 'a\nb' }]);
  });

  test('retry inválido é ignorado e campo sem valor não quebra', () => {
    const { eventos, retries } = analisar(['retry: abc\ndata\n\n']);
    assert.deepEqual(retries, []);
    assert.deepEqual(eventos, [{ tipo: 'message', dados: '' }]);
  });
});

/** @param {ReturnType<typeof criarAmbiente>} ambiente */
async function abrir(ambiente) {
  await ambiente.semearResenha();
  const repositorio = ambiente.criarRepositorio();
  const controlador = /** @type {any} */ (await repositorio.abrir(ambiente.servidor.resenhaId));
  await assentar();
  return controlador;
}

describe('fluxo de eventos no controlador', () => {
  test('abre o fluxo com Authorization e sem token na URL', async () => {
    const ambiente = criarAmbiente();
    await abrir(ambiente);
    const chamadas = ambiente.servidor.chamadas.filter(ehEventos);
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].autorizacao, `Bearer ${ambiente.servidor.token}`);
    assert.ok(!chamadas[0].caminho.includes(ambiente.servidor.token));
  });

  test('evento seq maior que o do cache dispara a busca de delta', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    ambiente.servidor.externo.lancar({
      id: 'externo-0000000000001',
      ladoA: { nome: 'Ana' },
      ladoB: { nome: 'Bia' },
      placarA: 1,
      placarB: 0,
    });
    const antes = ambiente.servidor.chamadas.filter(ehEstado).length;
    ambiente.servidor.fluxos[0].enviar(`event: seq\ndata: ${ambiente.servidor.seq}\n\n`);
    await assentar();
    assert.equal(ambiente.servidor.chamadas.filter(ehEstado).length - antes, 1);
    assert.equal(controlador.visao().partidas.length, 1);
  });

  test('evento seq igual ao do cache não busca nada', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    ambiente.servidor.externo.lancar({
      id: 'externo-0000000000001',
      ladoA: { nome: 'Ana' },
      ladoB: { nome: 'Bia' },
      placarA: 1,
      placarB: 0,
    });
    ambiente.servidor.fluxos[0].enviar(`event: seq\ndata: 1\n\n`);
    await assentar();
    const antes = ambiente.servidor.chamadas.filter(ehEstado).length;
    ambiente.servidor.fluxos[0].enviar(`event: seq\ndata: 1\n\n`);
    await assentar();
    assert.equal(ambiente.servidor.chamadas.filter(ehEstado).length, antes);
    assert.equal(controlador.visao().partidas.length, 1);
  });

  test('revogado vira sem-acesso, fecha o fluxo e não reconecta', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    /** @type {any[]} */
    const avisos = [];
    controlador.assinarAvisos((/** @type {any} */ a) => avisos.push(a));
    ambiente.servidor.fluxos[0].enviar('event: revogado\ndata: 1\n\n');
    await assentar();
    assert.equal(controlador.visao().sync.estado, 'sem-acesso');
    assert.deepEqual(
      avisos.map((a) => a.tipo),
      ['sem-acesso'],
    );
    assert.equal(ambiente.ativos().length, 0);
    assert.equal(ambiente.servidor.chamadas.filter(ehEventos).length, 1);
  });

  test('queda do fluxo reconecta com recuo de 3 s e sincroniza', async () => {
    const ambiente = criarAmbiente();
    await abrir(ambiente);
    const estadosAntes = ambiente.servidor.chamadas.filter(ehEstado).length;
    ambiente.servidor.fluxos[0].encerrar();
    await assentar();
    assert.equal(ambiente.ativos().at(-1)?.ms, 3000);
    await ambiente.dispararUltimo();
    assert.equal(ambiente.servidor.chamadas.filter(ehEventos).length, 2);
    assert.ok(ambiente.servidor.chamadas.filter(ehEstado).length > estadosAntes);
  });

  test('falhas seguidas ao reabrir usam 3, 6, 12 e 30 s', async () => {
    const ambiente = criarAmbiente();
    await abrir(ambiente);
    ambiente.servidor.programar(ehEventos, 'rede', 10);
    ambiente.servidor.fluxos[0].encerrar();
    await assentar();
    const atrasos = [ambiente.ativos().at(-1)?.ms];
    for (let i = 0; i < 4; i += 1) {
      await ambiente.dispararUltimo();
      atrasos.push(ambiente.ativos().at(-1)?.ms);
    }
    assert.deepEqual(atrasos, [3000, 6000, 12000, 30000, 30000]);
  });

  test('página oculta fecha o fluxo e ao voltar reabre e sincroniza', async () => {
    const ambiente = criarAmbiente();
    await abrir(ambiente);
    await ambiente.emitirPagina('oculta');
    assert.equal(ambiente.servidor.chamadas.filter(ehEventos).length, 1);
    assert.equal(ambiente.ativos().length, 0);
    const estadosAntes = ambiente.servidor.chamadas.filter(ehEstado).length;
    await ambiente.emitirPagina('visivel');
    assert.equal(ambiente.servidor.chamadas.filter(ehEventos).length, 2);
    assert.ok(ambiente.servidor.chamadas.filter(ehEstado).length > estadosAntes);
  });

  test('sem fluxo disponível cai para sondagem a cada 45 s', async () => {
    const ambiente = criarAmbiente();
    ambiente.servidor.usarSemStream();
    const controlador = await abrir(ambiente);
    assert.equal(ambiente.ativos().at(-1)?.ms, 45_000);
    ambiente.servidor.externo.lancar({
      id: 'externo-0000000000002',
      ladoA: { nome: 'Ana' },
      ladoB: { nome: 'Bia' },
      placarA: 1,
      placarB: 0,
    });
    await ambiente.dispararUltimo();
    assert.equal(controlador.visao().partidas.length, 1);
    assert.equal(ambiente.ativos().at(-1)?.ms, 45_000);
  });

  test('fechar encerra o fluxo e os temporizadores', async () => {
    const ambiente = criarAmbiente();
    const controlador = await abrir(ambiente);
    ambiente.servidor.programar(() => true, 'rede', 1000);
    await controlador.lancar(partidaSimples());
    await assentar();
    controlador.fechar();
    await assentar();
    assert.equal(ambiente.ativos().length, 0);
  });
});
