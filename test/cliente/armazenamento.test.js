import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { criarArmazenamentoMemoria, ErroArmazenamento } from '../../public/js/dados/armazenamento.js';
import { criarArmazenamentoIdb } from '../../public/js/dados/armazenamento-idb.js';

const resenha = (/** @type {string} */ id) => ({
  id,
  nome: id,
  token: 't',
  eu: { membroId: 'm', papel: /** @type {const} */ ('criador'), apelido: 'A' },
  entrouEm: 1,
  abertaEm: 1,
});
const op = (/** @type {string} */ idOp) => ({
  idOp,
  tipo: /** @type {const} */ ('excluir'),
  partidaId: 'p',
  corpo: {},
  rev: 1,
  criadaEm: 1,
  tentativas: 0,
});

describe('armazenamento em memória', () => {
  test('devolve cópias: alterar o retorno não altera o guardado', async () => {
    const arm = criarArmazenamentoMemoria();
    await arm.gravarResenha(resenha('r'));
    const lida = /** @type {any} */ (await arm.lerResenha('r'));
    lida.nome = 'mudou';
    assert.equal((await arm.lerResenha('r'))?.nome, 'r');
  });

  test('fila mantém a ordem de inserção e substituirFila troca tudo', async () => {
    const arm = criarArmazenamentoMemoria();
    await arm.gravarResenha(resenha('r'));
    for (const id of ['a', 'b', 'c']) await arm.anexarOperacao('r', op(id));
    assert.deepEqual(
      (await arm.listarFila('r')).map((o) => o.idOp),
      ['a', 'b', 'c'],
    );
    await arm.substituirFila('r', [op('z')]);
    assert.deepEqual(
      (await arm.listarFila('r')).map((o) => o.idOp),
      ['z'],
    );
  });

  test('atualizar grava estado e fila juntos e devolve o resultado', async () => {
    const arm = criarArmazenamentoMemoria();
    await arm.gravarResenha(resenha('r'));
    const estado = {
      seq: 1,
      resenha: { id: 'r', nome: 'r', seq: 1, criadaEm: 1 },
      eu: resenha('r').eu,
      membros: [],
      competidores: [],
      partidas: {},
    };
    const r = await arm.atualizar('r', (_e, fila) => {
      fila.push(op('a'));
      return { estado, fila };
    });
    assert.equal(r.estado?.seq, 1);
    assert.equal((await arm.lerEstado('r'))?.seq, 1);
    assert.equal((await arm.listarFila('r')).length, 1);
  });

  test('atualizar que lança não grava nada', async () => {
    const arm = criarArmazenamentoMemoria();
    await arm.gravarResenha(resenha('r'));
    await arm.anexarOperacao('r', op('a'));
    await assert.rejects(
      arm.atualizar('r', (_e, fila) => {
        fila.length = 0;
        throw new Error('falha');
      }),
      /falha/,
    );
    assert.equal((await arm.listarFila('r')).length, 1);
  });

  test('atualizar numa resenha removida não recria estado nem fila', async () => {
    const arm = criarArmazenamentoMemoria();
    await arm.gravarResenha(resenha('r'));
    await arm.removerResenha('r');
    const r = await arm.atualizar('r', (_e, fila) => ({ fila: [...fila, op('a')] }));
    assert.deepEqual(r, { estado: null, fila: [] });
    assert.deepEqual(await arm.listarFila('r'), []);
  });

  test('removerResenha apaga estado e fila, só dela', async () => {
    const arm = criarArmazenamentoMemoria();
    for (const id of ['r', 's']) {
      await arm.gravarResenha(resenha(id));
      await arm.anexarOperacao(id, op(`op-${id}`));
    }
    await arm.removerResenha('r');
    assert.deepEqual(await arm.listarFila('r'), []);
    assert.equal((await arm.listarFila('s')).length, 1);
    assert.equal((await arm.listarResenhas()).length, 1);
  });
});

describe('armazenamento IndexedDB', () => {
  test('importa em Node e a primeira chamada falha com erro claro, sem indexedDB', async () => {
    const arm = criarArmazenamentoIdb();
    await assert.rejects(arm.listarResenhas(), (e) => e instanceof ErroArmazenamento && /indisponível/.test(e.message));
  });
});

describe('ErroArmazenamento', () => {
  test('expõe a mensagem como as demais falhas do motor, para a tela mostrar', async () => {
    const { mensagemDeErro } = await import('../../public/js/erros.js');
    const erro = new ErroArmazenamento('Armazenamento local cheio.');
    assert.equal(erro.mensagem, 'Armazenamento local cheio.');
    assert.equal(mensagemDeErro(erro, 'Falha ao lançar a partida.'), 'Armazenamento local cheio.');
  });
});
