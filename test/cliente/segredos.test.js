import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { assentar, criarAmbiente, partidaSimples } from './ajuda/ambiente.js';

const PASTA = new URL('../../public/js/dados/', import.meta.url);

test('os módulos de dados não usam console nem acessam globais do navegador no topo', async () => {
  for (const nome of await readdir(PASTA)) {
    const texto = await readFile(new URL(nome, PASTA), 'utf8');
    assert.ok(!/\bconsole\./.test(texto), `${nome} usa console`);
    if (nome === 'repositorio-navegador.js') continue;
    assert.ok(
      !/\b(window|document|localStorage|navigator)\b/.test(texto.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')),
      `${nome} toca global do navegador`,
    );
  }
});

test('repositorio-navegador importa em Node sem erro e expõe a fachada', async () => {
  const { repositorio } = await import('../../public/js/dados/repositorio-navegador.js');
  for (const metodo of [
    'listarResenhas',
    'criarResenha',
    'consultarConvite',
    'aceitarConvite',
    'recuperarAcesso',
    'usarTransferencia',
    'esquecerResenha',
    'abrir',
  ]) {
    assert.equal(typeof (/** @type {any} */ (repositorio)[metodo]), 'function', metodo);
  }
});

test('o token só vai no cabeçalho Authorization: nunca em URL, corpo, console ou mensagem de erro', async () => {
  /** @type {string[]} */
  const registro = [];
  /** @type {Map<string, any>} */
  const originais = new Map();
  const consola = /** @type {any} */ (console);
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    originais.set(nivel, consola[nivel]);
    consola[nivel] = (/** @type {any[]} */ ...args) => registro.push(args.map(String).join(' '));
  }
  try {
    const ambiente = criarAmbiente();
    const { servidor } = ambiente;
    await ambiente.semearResenha();
    const repositorio = ambiente.criarRepositorio();
    const controlador = /** @type {any} */ (await repositorio.abrir(servidor.resenhaId));
    await assentar();

    const { partidaId } = await controlador.lancar(partidaSimples());
    await controlador.ressincronizar();
    await controlador.editar(partidaId, { placarA: 4 });
    servidor.programar(() => true, 'rede', 2);
    await controlador.lancar(partidaSimples({ placarA: 9 }));
    await assentar();
    servidor.limpar();
    servidor.programar((/** @type {any} */ c) => c.metodo === 'POST' && c.caminho.endsWith('/convite'), {
      status: 401,
      corpo: { erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão inválida.' } },
    });
    /** @type {any} */
    let erro = null;
    await controlador.admin.gerarConvite().catch((/** @type {any} */ e) => {
      erro = e;
    });
    await controlador.ressincronizar();

    assert.ok(servidor.chamadas.length > 5);
    for (const chamada of servidor.chamadas) {
      assert.ok(!chamada.caminho.includes(servidor.token), `token na URL: ${chamada.metodo}`);
      assert.ok(!JSON.stringify(chamada.corpo ?? {}).includes(servidor.token), 'token no corpo');
      assert.ok([null, `Bearer ${servidor.token}`].includes(chamada.autorizacao));
    }
    assert.ok(servidor.chamadas.some((c) => c.autorizacao === `Bearer ${servidor.token}`));
    assert.ok(!String(erro?.message).includes(servidor.token));
    assert.ok(!JSON.stringify(controlador.visao()).includes(servidor.token));
    assert.ok(!JSON.stringify(await repositorio.listarResenhas()).includes(servidor.token));
    assert.equal(registro.filter((linha) => linha.includes(servidor.token)).length, 0);
    assert.equal(registro.length, 0, 'os módulos de dados não escrevem no console');
  } finally {
    for (const [nivel, original] of originais) consola[nivel] = original;
  }
});
