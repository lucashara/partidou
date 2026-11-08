import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assentar, criarAmbiente, partidaSimples } from './ajuda/ambiente.js';

const CHAVE = 'ABCDE-FGHJK-MNPQR-STVWX-YZ012';

/** @param {string} id @param {Record<string, any>} [extras] */
const sessao = (id = 'resenha-nova-0000000001', extras = {}) => ({
  resenha: { id, nome: 'Racha de Sexta', seq: 3, criadaEm: 1 },
  membro: { id: 'membro-novo-0001', apelido: 'Lucas', papel: 'criador', criadoEm: 1 },
  token: 'token-novo-secreto',
  ...extras,
});
const rota = (/** @type {string} */ caminho) => (/** @type {any} */ c) => c.metodo === 'POST' && c.caminho === caminho;

describe('entrada na resenha', () => {
  test('criarResenha grava resenha com token e estado inicial, e listarResenhas não expõe o token', async () => {
    const ambiente = criarAmbiente();
    const repositorio = ambiente.criarRepositorio();
    ambiente.servidor.programar(rota('/api/resenhas'), {
      status: 201,
      corpo: sessao(undefined, { chaveRecuperacao: CHAVE, convite: { codigo: 'ABCD-EFGH-JKMN', expiraEm: 99 } }),
    });
    const r = await repositorio.criarResenha({ nome: '  Racha  de Sexta ', apelido: 'Lucas' });
    assert.deepEqual(r, {
      resenhaId: 'resenha-nova-0000000001',
      chaveRecuperacao: CHAVE,
      convite: { codigo: 'ABCD-EFGH-JKMN', expiraEm: 99 },
    });
    assert.deepEqual(ambiente.servidor.chamadas[0].corpo, { nome: 'Racha de Sexta', apelido: 'Lucas' });
    assert.equal(ambiente.servidor.chamadas[0].autorizacao, null);

    const local = await ambiente.armazenamento.lerResenha(r.resenhaId);
    assert.equal(local?.token, 'token-novo-secreto');
    assert.deepEqual(local?.eu, { membroId: 'membro-novo-0001', papel: 'criador', apelido: 'Lucas' });
    const estado = await ambiente.armazenamento.lerEstado(r.resenhaId);
    assert.equal(estado?.seq, 0);
    assert.equal(estado?.membros.length, 1);

    const lista = await repositorio.listarResenhas();
    assert.equal(lista.length, 1);
    assert.ok(!('token' in lista[0]));
    assert.ok(!JSON.stringify(lista).includes('token-novo-secreto'));
  });

  test('criarResenha valida nomes antes da rede', async () => {
    const ambiente = criarAmbiente();
    const repositorio = ambiente.criarRepositorio();
    await assert.rejects(repositorio.criarResenha({ nome: '', apelido: 'Lucas' }), {
      name: 'ErroLocal',
      codigo: 'NOME_INVALIDO',
      campo: 'nome',
    });
    await assert.rejects(repositorio.criarResenha({ nome: 'Racha', apelido: 'x'.repeat(25) }), {
      codigo: 'NOME_INVALIDO',
      campo: 'apelido',
    });
    assert.equal(ambiente.servidor.chamadas.length, 0);
  });

  test('consultarConvite normaliza o código e devolve só os campos públicos', async () => {
    const ambiente = criarAmbiente();
    const repositorio = ambiente.criarRepositorio();
    ambiente.servidor.programar(rota('/api/convites/consultar'), {
      status: 200,
      corpo: { resenhaNome: 'Racha', expiraEm: 5, membros: 3, extra: 'x' },
    });
    const r = await repositorio.consultarConvite(' abcd-efgh-jkmn ');
    assert.deepEqual(r, { resenhaNome: 'Racha', expiraEm: 5, membros: 3 });
    assert.deepEqual(ambiente.servidor.chamadas[0].corpo, { codigo: 'ABCDEFGHJKMN' });
    await assert.rejects(repositorio.consultarConvite('curto'), { codigo: 'CODIGO_INVALIDO' });
    assert.equal(ambiente.servidor.chamadas.length, 1);
  });

  test('erro do servidor no convite sobe como ErroApi', async () => {
    const ambiente = criarAmbiente();
    const repositorio = ambiente.criarRepositorio();
    ambiente.servidor.programar(rota('/api/convites/aceitar'), {
      status: 404,
      corpo: { erro: { codigo: 'CONVITE_INVALIDO', mensagem: 'Convite inválido ou expirado.' } },
    });
    await assert.rejects(repositorio.aceitarConvite('ABCD-EFGH-JKMN', 'Ana'), {
      name: 'ErroApi',
      status: 404,
      codigo: 'CONVITE_INVALIDO',
    });
    assert.deepEqual(await repositorio.listarResenhas(), []);
  });

  test('aceitarConvite numa resenha já presente troca o token, mantém o estado e reabre o acesso do controlador', async () => {
    const ambiente = criarAmbiente();
    await ambiente.semearResenha();
    const id = ambiente.servidor.resenhaId;
    await ambiente.armazenamento.gravarResenha({
      .../** @type {any} */ (await ambiente.armazenamento.lerResenha(id)),
      token: 'token-velho',
      entrouEm: 42,
    });
    const repositorio = ambiente.criarRepositorio();
    const controlador = /** @type {any} */ (await repositorio.abrir(id));
    await assentar();
    assert.equal(controlador.visao().sync.estado, 'sem-acesso');
    await ambiente.armazenamento.atualizar(id, () => ({
      estado: {
        seq: 0,
        resenha: { id, nome: 'Resenha', seq: 0, criadaEm: 1 },
        eu: ambiente.servidor.eu,
        membros: [],
        competidores: [],
        partidas: {},
      },
    }));

    ambiente.servidor.programar(rota('/api/convites/aceitar'), {
      status: 201,
      corpo: sessao(id, {
        token: ambiente.servidor.token,
        membro: { id: ambiente.servidor.eu.membroId, apelido: 'Eu', papel: 'criador', criadoEm: 1 },
      }),
    });
    const r = await repositorio.aceitarConvite('ABCD-EFGH-JKMN', 'Eu');
    await assentar();
    assert.deepEqual(r, { resenhaId: id });
    assert.equal((await ambiente.armazenamento.lerResenha(id))?.token, ambiente.servidor.token);
    assert.equal((await ambiente.armazenamento.lerResenha(id))?.entrouEm, 42);
    assert.equal(controlador.visao().sync.estado, 'sincronizado');
    assert.equal((await repositorio.listarResenhas()).length, 1);
  });

  test('recuperarAcesso devolve a nova chave e usarTransferencia grava a sessão', async () => {
    const ambiente = criarAmbiente();
    const repositorio = ambiente.criarRepositorio();
    ambiente.servidor.programar(rota('/api/acesso/recuperar'), {
      status: 200,
      corpo: sessao('resenha-rec-00000000001', { chaveRecuperacao: CHAVE }),
    });
    const r = await repositorio.recuperarAcesso('abcde fghjk mnpqr stvwx yz012');
    assert.deepEqual(r, { resenhaId: 'resenha-rec-00000000001', chaveRecuperacao: CHAVE });
    assert.deepEqual(ambiente.servidor.chamadas[0].corpo, { chave: 'ABCDEFGHJKMNPQRSTVWXYZ012' });
    await assert.rejects(repositorio.recuperarAcesso('curta'), { codigo: 'CHAVE_INVALIDA' });

    ambiente.servidor.programar(rota('/api/acesso/transferencia/usar'), {
      status: 200,
      corpo: sessao('resenha-tra-00000000001'),
    });
    assert.deepEqual(await repositorio.usarTransferencia('abcd-efgh'), { resenhaId: 'resenha-tra-00000000001' });
    await assert.rejects(repositorio.usarTransferencia('xx'), { codigo: 'CODIGO_INVALIDO' });
    assert.equal((await repositorio.listarResenhas()).length, 2);
    assert.ok(await ambiente.armazenamento.lerEstado('resenha-tra-00000000001'));
  });

  test('listarResenhas ordena por abertaEm decrescente', async () => {
    const ambiente = criarAmbiente();
    const repositorio = ambiente.criarRepositorio();
    for (const [id, abertaEm] of /** @type {const} */ ([
      ['a', 1],
      ['b', 3],
      ['c', 2],
    ])) {
      await ambiente.armazenamento.gravarResenha({
        id,
        nome: id,
        token: 't',
        eu: ambiente.servidor.eu,
        entrouEm: 1,
        abertaEm,
      });
    }
    assert.deepEqual(
      (await repositorio.listarResenhas()).map((r) => r.id),
      ['b', 'c', 'a'],
    );
  });
});

describe('abrir e esquecer', () => {
  test('abrir devolve null sem resenha local e o mesmo controlador em chamadas repetidas', async () => {
    const ambiente = criarAmbiente();
    const repositorio = ambiente.criarRepositorio();
    assert.equal(await repositorio.abrir('inexistente'), null);
    await ambiente.semearResenha();
    const [a, b] = await Promise.all([
      repositorio.abrir(ambiente.servidor.resenhaId),
      repositorio.abrir(ambiente.servidor.resenhaId),
    ]);
    assert.ok(a);
    assert.equal(a, b);
    a.fechar();
    assert.notEqual(await repositorio.abrir(ambiente.servidor.resenhaId), a);
  });

  test('abrir monta a visão do cache antes da rede e atualiza abertaEm', async () => {
    const ambiente = criarAmbiente();
    await ambiente.semearResenha();
    ambiente.servidor.programar(() => true, 'rede', 1000);
    const repositorio = ambiente.criarRepositorio();
    const controlador = /** @type {any} */ (await repositorio.abrir(ambiente.servidor.resenhaId));
    assert.equal(controlador.visao().resenha.nome, 'Resenha');
    assert.equal(controlador.visao().carregando, true);
    await assentar();
    assert.equal(controlador.visao().carregando, false);
    assert.equal(controlador.visao().sync.estado, 'offline');
    assert.equal((await ambiente.armazenamento.lerResenha(ambiente.servidor.resenhaId))?.abertaEm, ambiente.agora());
  });

  test('assinar entrega a visão atual de forma assíncrona e permite cancelar', async () => {
    const ambiente = criarAmbiente();
    await ambiente.semearResenha();
    const repositorio = ambiente.criarRepositorio();
    const controlador = /** @type {any} */ (await repositorio.abrir(ambiente.servidor.resenhaId));
    await assentar();
    /** @type {any[]} */
    const vistas = [];
    const cancelar = controlador.assinar((/** @type {any} */ v) => vistas.push(v));
    assert.equal(vistas.length, 0);
    await assentar();
    assert.equal(vistas.length, 1);
    cancelar();
    await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(vistas.length, 1);
  });

  test('esquecerResenha apaga resenha, estado e fila e fecha o controlador', async () => {
    const ambiente = criarAmbiente();
    await ambiente.semearResenha();
    const id = ambiente.servidor.resenhaId;
    const repositorio = ambiente.criarRepositorio();
    const controlador = /** @type {any} */ (await repositorio.abrir(id));
    await assentar();
    ambiente.servidor.programar(() => true, 'rede', 1000);
    await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal((await ambiente.armazenamento.listarFila(id)).length, 1);

    await repositorio.esquecerResenha(id);
    assert.equal(await ambiente.armazenamento.lerResenha(id), null);
    assert.equal(await ambiente.armazenamento.lerEstado(id), null);
    assert.deepEqual(await ambiente.armazenamento.listarFila(id), []);
    assert.equal(await repositorio.abrir(id), null);
    await assert.rejects(controlador.lancar(partidaSimples()), /fechado/);
    assert.equal(ambiente.ativos().length, 0);
  });
});

describe('administração', () => {
  /** @param {ReturnType<typeof criarAmbiente>} ambiente */
  async function abrir(ambiente) {
    await ambiente.semearResenha();
    const repositorio = ambiente.criarRepositorio();
    const controlador = /** @type {any} */ (await repositorio.abrir(ambiente.servidor.resenhaId));
    await assentar();
    return { repositorio, controlador };
  }

  test('gerarConvite devolve código e validade', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    assert.deepEqual(await controlador.admin.gerarConvite(), { codigo: 'ABCD-EFGH-JKMN', expiraEm: 2 });
  });

  test('sem rede as ações lançam ErroRede', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    ambiente.servidor.programar(() => true, 'rede', 1000);
    await assert.rejects(controlador.admin.gerarConvite(), { name: 'ErroRede' });
    await assert.rejects(controlador.admin.rotacionarChave(), { name: 'ErroRede' });
  });

  test('renomear valida o nome e ressincroniza depois do sucesso', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    await assert.rejects(controlador.admin.renomearResenha('  '), { codigo: 'NOME_INVALIDO' });
    ambiente.servidor.programar((/** @type {any} */ c) => c.metodo === 'PATCH', { status: 200, corpo: {} });
    const estadosAntes = ambiente.servidor.chamadas.filter((c) => c.caminho.includes('/estado')).length;
    await controlador.admin.renomearResenha('  Novo   nome ');
    const patch = ambiente.servidor.chamadas.find((c) => c.metodo === 'PATCH');
    assert.deepEqual(patch?.corpo, { nome: 'Novo nome' });
    assert.ok(ambiente.servidor.chamadas.filter((c) => c.caminho.includes('/estado')).length > estadosAntes);
  });

  test('sairDesteAparelho encerra a sessão no servidor e limpa os dados locais', async () => {
    const ambiente = criarAmbiente();
    const { repositorio, controlador } = await abrir(ambiente);
    await controlador.admin.sairDesteAparelho();
    assert.ok(ambiente.servidor.chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/api/sessao'));
    assert.deepEqual(await repositorio.listarResenhas(), []);
  });

  test('401 numa ação marca sem-acesso', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    ambiente.servidor.programar((/** @type {any} */ c) => c.caminho.endsWith('/convite'), {
      status: 401,
      corpo: { erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão inválida.' } },
    });
    await assert.rejects(controlador.admin.gerarConvite(), { status: 401 });
    assert.equal(controlador.visao().sync.estado, 'sem-acesso');
  });
});
