import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assentar, criarAmbiente, partidaSimples } from './ajuda/ambiente.js';

const ehCriacao = (/** @type {any} */ c) => c.metodo === 'POST' && c.caminho.endsWith('/partidas');
const ehEstado = (/** @type {any} */ c) => c.metodo === 'GET' && c.caminho.includes('/estado');

/** Abre a resenha semeada e espera a primeira sincronização. */
async function abrir(/** @type {ReturnType<typeof criarAmbiente>} */ ambiente) {
  await ambiente.semearResenha();
  const repositorio = ambiente.criarRepositorio();
  const controlador = /** @type {NonNullable<Awaited<ReturnType<typeof repositorio.abrir>>>} */ (
    await repositorio.abrir(ambiente.servidor.resenhaId)
  );
  await assentar();
  /** @type {import('../../public/js/dados/tipos.js').Aviso[]} */
  const avisos = [];
  controlador.assinarAvisos((a) => avisos.push(a));
  return { repositorio, controlador, avisos };
}

/** Coloca o servidor falso fora do ar para as próximas chamadas. */
const derrubarRede = (/** @type {ReturnType<typeof criarAmbiente>} */ ambiente) =>
  ambiente.servidor.programar(() => true, 'rede', 1000);

describe('fila offline', () => {
  test('lançar offline mantém ordem e envia tudo quando a rede volta', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    derrubarRede(ambiente);
    const ids = [];
    for (const placar of [1, 2, 3]) ids.push((await controlador.lancar(partidaSimples({ placarA: placar }))).partidaId);
    await assentar();
    assert.equal(controlador.visao().partidas.length, 3);
    assert.ok(controlador.visao().partidas.every((p) => p.pendente));
    assert.equal(controlador.visao().sync.estado, 'offline');
    assert.equal(controlador.visao().sync.pendentes, 3);
    assert.equal(ambiente.servidor.partidas.size, 0);

    ambiente.servidor.limpar();
    await controlador.ressincronizar();
    assert.deepEqual([...ambiente.servidor.partidas.keys()], ids);
    assert.equal(controlador.visao().sync.estado, 'sincronizado');
    assert.ok(controlador.visao().partidas.every((p) => !p.pendente));
    assert.equal(await ambiente.armazenamento.listarFila(ambiente.servidor.resenhaId).then((f) => f.length), 0);
  });

  test('resposta perdida: reenvio com o mesmo id não duplica a partida', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    ambiente.servidor.perderResposta(ehCriacao);
    const { partidaId } = await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(ambiente.servidor.partidas.size, 1);
    assert.equal(controlador.visao().sync.estado, 'offline');
    assert.equal(controlador.visao().partidas[0].pendente, true);

    await controlador.ressincronizar();
    assert.equal(ambiente.servidor.partidas.size, 1);
    assert.equal(ambiente.servidor.chamadas.filter(ehCriacao).length, 2);
    assert.equal(controlador.visao().partidas[0].id, partidaId);
    assert.equal(controlador.visao().partidas[0].pendente, false);
  });

  test('duas edições seguidas usam a revisão devolvida pela primeira', async () => {
    const ambiente = criarAmbiente();
    const { controlador, avisos } = await abrir(ambiente);
    const { partidaId } = await controlador.lancar(partidaSimples());
    await controlador.ressincronizar();
    derrubarRede(ambiente);
    await controlador.editar(partidaId, { placarA: 5 });
    await controlador.editar(partidaId, { placarA: 6 });
    await assentar();
    const fila = await ambiente.armazenamento.listarFila(ambiente.servidor.resenhaId);
    assert.deepEqual(
      fila.map((o) => [o.tipo, o.rev]),
      [
        ['editar', 1],
        ['editar', 1],
      ],
    );
    ambiente.servidor.limpar();
    await controlador.ressincronizar();
    const noServidor = ambiente.servidor.partidas.get(partidaId);
    assert.equal(noServidor.rev, 3);
    assert.equal(noServidor.placarA, 6);
    assert.deepEqual(avisos, []);
    assert.equal(controlador.visao().partidas[0].placarA, 6);
  });

  test('lançamento inválido lança ErroLocal e não entra na fila', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    await assert.rejects(controlador.lancar(partidaSimples({ placarA: -1 })), {
      name: 'ErroLocal',
      codigo: 'PLACAR_INVALIDO',
      campo: 'placarA',
    });
    await assert.rejects(controlador.lancar(partidaSimples({ ladoB: { nome: 'LUCAS' } })), { codigo: 'LADOS_IGUAIS' });
    await assert.rejects(controlador.lancar(partidaSimples({ ladoA: { nome: '   ' } })), { codigo: 'NOME_INVALIDO' });
    await assert.rejects(controlador.lancar(partidaSimples({ placarA: 2, placarB: 1, penaltis: { a: 4, b: 3 } })), {
      codigo: 'PLACAR_INVALIDO',
      campo: 'penaltis',
    });
    assert.equal(ambiente.servidor.chamadas.filter(ehCriacao).length, 0);
    assert.equal(controlador.visao().partidas.length, 0);
  });
});

describe('edição e exclusão de partida pendente', () => {
  test('editar partida ainda na fila funde na operação de criação', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    derrubarRede(ambiente);
    const { partidaId } = await controlador.lancar(partidaSimples({ placarA: 1 }));
    await assentar();
    await controlador.editar(partidaId, { placarA: 7, penaltis: null, modalidade: 'fifa' });
    const fila = await ambiente.armazenamento.listarFila(ambiente.servidor.resenhaId);
    assert.equal(fila.length, 1);
    assert.equal(fila[0].tipo, 'criar');
    assert.equal(fila[0].corpo.placarA, 7);
    assert.equal(fila[0].corpo.modalidade, 'fifa');
    ambiente.servidor.limpar();
    const antes = ambiente.servidor.chamadas.filter(ehCriacao).length;
    await controlador.ressincronizar();
    assert.equal(ambiente.servidor.partidas.get(partidaId).placarA, 7);
    assert.equal(ambiente.servidor.chamadas.filter(ehCriacao).length - antes, 1);
  });

  test('excluir partida pendente remove a operação e desfazer a recria igual', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    derrubarRede(ambiente);
    const { partidaId } = await controlador.lancar(partidaSimples());
    await assentar();
    const [antes] = await ambiente.armazenamento.listarFila(ambiente.servidor.resenhaId);
    const { desfazer } = await controlador.excluir(partidaId);
    assert.equal((await ambiente.armazenamento.listarFila(ambiente.servidor.resenhaId)).length, 0);
    assert.equal(controlador.visao().partidas.length, 0);
    await desfazer();
    await desfazer();
    const fila = await ambiente.armazenamento.listarFila(ambiente.servidor.resenhaId);
    assert.deepEqual(fila, [antes]);
    assert.equal(controlador.visao().partidas.length, 1);
  });

  test('excluir partida enviada enfileira DELETE e desfazer enfileira restaurar', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    const { partidaId } = await controlador.lancar(partidaSimples());
    await controlador.ressincronizar();
    const { desfazer } = await controlador.excluir(partidaId);
    await controlador.ressincronizar();
    assert.equal(ambiente.servidor.partidas.get(partidaId).excluida, true);
    assert.equal(controlador.visao().partidas.length, 0);
    await desfazer();
    await controlador.ressincronizar();
    assert.equal(ambiente.servidor.partidas.get(partidaId).excluida, false);
    assert.equal(controlador.visao().partidas.length, 1);
    assert.equal(ambiente.servidor.partidas.get(partidaId).rev, 3);
  });

  test('excluir e desfazer offline encadeiam as revisões ao voltar a rede', async () => {
    const ambiente = criarAmbiente();
    const { controlador, avisos } = await abrir(ambiente);
    const { partidaId } = await controlador.lancar(partidaSimples());
    await controlador.ressincronizar();
    derrubarRede(ambiente);
    const { desfazer } = await controlador.excluir(partidaId);
    await desfazer();
    ambiente.servidor.limpar();
    await controlador.ressincronizar();
    assert.equal(ambiente.servidor.partidas.get(partidaId).excluida, false);
    assert.equal(ambiente.servidor.partidas.get(partidaId).rev, 3);
    assert.deepEqual(avisos, []);
  });

  test('editar partida inexistente lança ErroLocal', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    await assert.rejects(controlador.editar('nao-existe', { placarA: 1 }), { codigo: 'PARTIDA_NAO_ENCONTRADA' });
  });
});

describe('respostas de erro do servidor', () => {
  test('409 de revisão descarta a operação, aplica o atual e descarta as seguintes da mesma partida', async () => {
    const ambiente = criarAmbiente();
    const { controlador, avisos } = await abrir(ambiente);
    const { partidaId } = await controlador.lancar(partidaSimples({ placarA: 1 }));
    await controlador.ressincronizar();
    derrubarRede(ambiente);
    await controlador.editar(partidaId, { placarA: 5 });
    const { partidaId: outraId } = await controlador.lancar(partidaSimples({ ladoA: { nome: 'Marta' }, placarA: 4 }));
    await controlador.editar(partidaId, { placarB: 9 });
    ambiente.servidor.limpar();
    ambiente.servidor.externo.editar(partidaId, { placarA: 8 });

    const patchesAntes = ambiente.servidor.chamadas.filter((c) => c.metodo === 'PATCH').length;
    await controlador.ressincronizar();
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].tipo, 'conflito');
    assert.equal(avisos[0].mensagem, 'Partida alterada em outro aparelho. A alteração não foi aplicada.');
    assert.equal(avisos[0].partidaId, partidaId);
    assert.equal(ambiente.servidor.partidas.get(partidaId).placarA, 8);
    assert.equal(ambiente.servidor.partidas.get(partidaId).placarB, 1);
    assert.ok(ambiente.servidor.partidas.has(outraId));
    assert.equal(ambiente.servidor.chamadas.filter((c) => c.metodo === 'PATCH').length - patchesAntes, 1);
    assert.equal(controlador.visao().sync.pendentes, 0);
    assert.equal(controlador.visao().sync.estado, 'sincronizado');
    assert.equal(controlador.visao().partidas.find((p) => p.id === partidaId)?.placarA, 8);
  });

  test('422 descarta só a operação rejeitada, avisa com a mensagem do servidor e segue com as demais', async () => {
    const ambiente = criarAmbiente();
    const { controlador, avisos } = await abrir(ambiente);
    ambiente.servidor.programar(ehCriacao, {
      status: 422,
      corpo: { erro: { codigo: 'LADOS_IGUAIS', mensagem: 'Mensagem do servidor.' } },
    });
    const primeira = await controlador.lancar(partidaSimples());
    const segunda = await controlador.lancar(partidaSimples({ placarA: 9 }));
    await assentar();
    assert.deepEqual(avisos, [{ tipo: 'rejeitada', mensagem: 'Mensagem do servidor.', partidaId: primeira.partidaId }]);
    assert.ok(!ambiente.servidor.partidas.has(primeira.partidaId));
    assert.ok(ambiente.servidor.partidas.has(segunda.partidaId));
    assert.equal(controlador.visao().sync.pendentes, 0);
  });

  test('rejeição sem tela assinando deixa o estado em erro até o aviso ser entregue', async () => {
    const ambiente = criarAmbiente();
    await ambiente.semearResenha();
    const repositorio = ambiente.criarRepositorio();
    const controlador = /** @type {any} */ (await repositorio.abrir(ambiente.servidor.resenhaId));
    await assentar();
    ambiente.servidor.programar(ehCriacao, {
      status: 422,
      corpo: { erro: { codigo: 'PLACAR_INVALIDO', mensagem: 'Placar recusado.' } },
    });
    await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(controlador.visao().sync.estado, 'erro');
    assert.equal(controlador.visao().sync.mensagem, 'Placar recusado.');
    /** @type {any[]} */
    const recebidos = [];
    controlador.assinarAvisos((/** @type {any} */ a) => recebidos.push(a));
    await assentar();
    assert.equal(recebidos.length, 1);
    assert.equal(controlador.visao().sync.estado, 'sincronizado');
  });

  test('descartar a criação descarta as edições dela que estavam em fila', async () => {
    const ambiente = criarAmbiente();
    const { controlador, avisos } = await abrir(ambiente);
    const liberar = ambiente.servidor.segurar(ehCriacao, {
      status: 422,
      corpo: { erro: { codigo: 'PLACAR_INVALIDO', mensagem: 'Recusada.' } },
    });
    const { partidaId } = await controlador.lancar(partidaSimples());
    await assentar();
    // Com a criação em voo, a edição não funde: vira operação própria, descartada junto.
    await controlador.editar(partidaId, { placarA: 3 });
    assert.equal((await ambiente.armazenamento.listarFila(ambiente.servidor.resenhaId)).length, 2);
    liberar();
    await assentar();
    assert.deepEqual(
      avisos.map((a) => a.tipo),
      ['rejeitada'],
    );
    assert.equal(controlador.visao().sync.pendentes, 0);
    assert.equal(ambiente.servidor.chamadas.filter((c) => c.metodo === 'PATCH').length, 0);
  });

  test('429 e 5xx não descartam nada', async () => {
    const ambiente = criarAmbiente();
    const { controlador, avisos } = await abrir(ambiente);
    ambiente.servidor.programar(ehCriacao, { status: 503, corpo: {} });
    await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(controlador.visao().sync.estado, 'offline');
    assert.equal(controlador.visao().sync.pendentes, 1);
    assert.deepEqual(avisos, []);
  });
});

describe('sem acesso', () => {
  test('401 no envio preserva a fila e o cache e emite o aviso', async () => {
    const ambiente = criarAmbiente();
    const { controlador, avisos } = await abrir(ambiente);
    const { partidaId } = await controlador.lancar(partidaSimples());
    await controlador.ressincronizar();
    ambiente.servidor.programar(
      () => true,
      { status: 401, corpo: { erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão inválida.' } } },
      1000,
    );
    const outra = await controlador.lancar(partidaSimples({ placarA: 8 }));
    await assentar();
    const visao = controlador.visao();
    assert.equal(visao.sync.estado, 'sem-acesso');
    assert.deepEqual(
      avisos.map((a) => a.tipo),
      ['sem-acesso'],
    );
    assert.equal(visao.partidas.length, 2);
    assert.equal(visao.sync.pendentes, 1);
    const fila = await ambiente.armazenamento.listarFila(ambiente.servidor.resenhaId);
    assert.equal(fila[0].partidaId, outra.partidaId);
    assert.ok(await ambiente.armazenamento.lerEstado(ambiente.servidor.resenhaId));
    assert.ok(visao.partidas.some((p) => p.id === partidaId));
  });

  test('404 ao ler o estado marca sem-acesso e para o fluxo de eventos', async () => {
    const ambiente = criarAmbiente();
    const { controlador, avisos } = await abrir(ambiente);
    const eventosAntes = ambiente.servidor.chamadas.filter((c) => c.caminho.endsWith('/eventos')).length;
    ambiente.servidor.programar(ehEstado, {
      status: 404,
      corpo: { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Recurso não encontrado.' } },
    });
    await controlador.ressincronizar();
    assert.equal(controlador.visao().sync.estado, 'sem-acesso');
    assert.equal(avisos[0].tipo, 'sem-acesso');
    assert.equal(ambiente.servidor.chamadas.filter((c) => c.caminho.endsWith('/eventos')).length, eventosAntes);
    assert.equal(ambiente.ativos().length, 0);
  });

  test('404 na operação com a resenha acessível vira rejeição; com a resenha inacessível, sem-acesso', async () => {
    const ambiente = criarAmbiente();
    const { controlador, avisos } = await abrir(ambiente);
    ambiente.servidor.programar(ehCriacao, {
      status: 404,
      corpo: { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Partida não encontrada.' } },
    });
    await controlador.lancar(partidaSimples());
    await assentar();
    assert.equal(avisos[0].tipo, 'rejeitada');
    assert.equal(controlador.visao().sync.pendentes, 0);

    ambiente.servidor.programar(ehCriacao, {
      status: 404,
      corpo: { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Recurso não encontrado.' } },
    });
    ambiente.servidor.programar(ehEstado, {
      status: 404,
      corpo: { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Recurso não encontrado.' } },
    });
    await controlador.lancar(partidaSimples({ placarA: 7 }));
    await assentar();
    assert.equal(controlador.visao().sync.estado, 'sem-acesso');
    assert.equal(controlador.visao().sync.pendentes, 1);
  });

  test('ressincronizar tenta de novo e recupera quando o acesso volta', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    ambiente.servidor.programar(
      () => true,
      { status: 401, corpo: { erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão inválida.' } } },
      1,
    );
    await controlador.ressincronizar();
    assert.equal(controlador.visao().sync.estado, 'sem-acesso');
    await controlador.ressincronizar();
    assert.equal(controlador.visao().sync.estado, 'sincronizado');
  });
});

describe('concorrência', () => {
  test('dois sincronizar simultâneos resultam em um ciclo mais uma repetição', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    const antes = ambiente.servidor.chamadas.filter(ehEstado).length;
    await Promise.all([controlador.ressincronizar(), controlador.ressincronizar()]);
    assert.equal(ambiente.servidor.chamadas.filter(ehEstado).length - antes, 2);
    await Promise.all([controlador.ressincronizar(), controlador.ressincronizar(), controlador.ressincronizar()]);
    assert.equal(ambiente.servidor.chamadas.filter(ehEstado).length - antes, 4);
  });

  test('lançar durante um ciclo envia no ciclo repetido, sem duplicar', async () => {
    const ambiente = criarAmbiente();
    const { controlador } = await abrir(ambiente);
    const liberar = ambiente.servidor.segurar(ehEstado);
    const ciclo = controlador.ressincronizar();
    await assentar();
    const { partidaId } = await controlador.lancar(partidaSimples());
    await assentar();
    liberar();
    await ciclo;
    await assentar();
    assert.equal(ambiente.servidor.chamadas.filter(ehCriacao).length, 1);
    assert.ok(ambiente.servidor.partidas.has(partidaId));
    assert.equal(controlador.visao().sync.pendentes, 0);
    assert.equal(controlador.visao().partidas[0].pendente, false);
  });
});
