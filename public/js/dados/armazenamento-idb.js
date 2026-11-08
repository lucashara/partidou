import { ErroArmazenamento } from './armazenamento.js';

/** @typedef {any} BancoIdb */
/** @typedef {any} TransacaoIdb */

const VERSAO = 1;
const INDISPONIVEL = 'Armazenamento local indisponível neste navegador. Em janela privativa, o app não guarda dados.';

/**
 * @param {string} nome
 * @returns {Promise<BancoIdb>}
 */
function abrirBanco(nome) {
  return new Promise((resolve, reject) => {
    const idb = /** @type {any} */ (globalThis).indexedDB;
    if (!idb) return reject(new ErroArmazenamento(INDISPONIVEL));
    let pedido;
    try {
      pedido = idb.open(nome, VERSAO);
    } catch {
      return reject(new ErroArmazenamento(INDISPONIVEL));
    }
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      banco.createObjectStore('resenhas', { keyPath: 'id' });
      banco.createObjectStore('estados');
      const fila = banco.createObjectStore('fila', { keyPath: 'chave', autoIncrement: true });
      fila.createIndex('porResenha', 'resenhaId');
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(new ErroArmazenamento(INDISPONIVEL));
    pedido.onblocked = () => reject(new ErroArmazenamento('Armazenamento local bloqueado por outra aba.'));
  });
}

/**
 * Armazenamento em IndexedDB. A fila usa chave automática, que preserva a ordem de inserção por resenha.
 * @param {string} [nome]
 * @returns {import('./tipos.js').Armazenamento}
 */
export function criarArmazenamentoIdb(nome = 'partidou') {
  /** @type {Promise<BancoIdb> | null} */
  let abertura = null;
  const obter = () => {
    abertura ??= abrirBanco(nome).then(
      (banco) => {
        banco.onversionchange = () => {
          banco.close();
          abertura = null;
        };
        return banco;
      },
      (erro) => {
        abertura = null;
        throw erro;
      },
    );
    return abertura;
  };

  /**
   * Executa `trabalho` numa transação. As etapas encadeiam-se por callbacks, pois a transação fecha se esperar uma promessa.
   * @template T
   * @param {'readonly' | 'readwrite'} modo
   * @param {string[]} lojas
   * @param {(tx: TransacaoIdb, resolver: (valor: T) => void) => void} trabalho
   * @returns {Promise<T>}
   */
  async function transacao(modo, lojas, trabalho) {
    const banco = await obter();
    return new Promise((resolve, reject) => {
      /** @type {T} */
      let resultado;
      let tx;
      try {
        tx = banco.transaction(lojas, modo);
      } catch {
        reject(new ErroArmazenamento('Falha ao acessar o armazenamento local.'));
        return;
      }
      tx.oncomplete = () => resolve(resultado);
      tx.onerror = () => reject(new ErroArmazenamento('Falha ao gravar no armazenamento local.'));
      tx.onabort = () => reject(new ErroArmazenamento('Gravação cancelada no armazenamento local.'));
      try {
        trabalho(tx, (valor) => {
          resultado = valor;
        });
      } catch (erro) {
        tx.abort();
        reject(erro);
      }
    });
  }

  /**
   * @param {TransacaoIdb} tx
   * @param {string} resenhaId
   * @param {(registros: { chave: number, resenhaId: string, op: import('./tipos.js').Operacao }[]) => void} aoLer
   */
  const lerFila = (tx, resenhaId, aoLer) => {
    const pedido = tx.objectStore('fila').index('porResenha').getAll(resenhaId);
    pedido.onsuccess = () => aoLer(pedido.result);
  };

  /**
   * @param {TransacaoIdb} tx
   * @param {string} resenhaId
   * @param {import('./tipos.js').Operacao[]} ops
   * @param {() => void} [aoTerminar]
   */
  const reescreverFila = (tx, resenhaId, ops, aoTerminar) => {
    const loja = tx.objectStore('fila');
    const chaves = loja.index('porResenha').getAllKeys(resenhaId);
    chaves.onsuccess = () => {
      for (const chave of chaves.result) loja.delete(chave);
      for (const op of ops) loja.add({ resenhaId, op });
      aoTerminar?.();
    };
  };

  return {
    listarResenhas: () =>
      transacao('readonly', ['resenhas'], (tx, resolver) => {
        const pedido = tx.objectStore('resenhas').getAll();
        pedido.onsuccess = () => resolver(pedido.result);
      }),
    lerResenha: (id) =>
      transacao('readonly', ['resenhas'], (tx, resolver) => {
        const pedido = tx.objectStore('resenhas').get(id);
        pedido.onsuccess = () => resolver(pedido.result ?? null);
      }),
    gravarResenha: (resenha) =>
      transacao('readwrite', ['resenhas'], (tx) => {
        tx.objectStore('resenhas').put(resenha);
      }),
    removerResenha: (id) =>
      transacao('readwrite', ['resenhas', 'estados', 'fila'], (tx) => {
        tx.objectStore('resenhas').delete(id);
        tx.objectStore('estados').delete(id);
        reescreverFila(tx, id, []);
      }),
    lerEstado: (resenhaId) =>
      transacao('readonly', ['estados'], (tx, resolver) => {
        const pedido = tx.objectStore('estados').get(resenhaId);
        pedido.onsuccess = () => resolver(pedido.result ?? null);
      }),
    gravarEstado: (resenhaId, estado) =>
      transacao('readwrite', ['estados'], (tx) => {
        tx.objectStore('estados').put(estado, resenhaId);
      }),
    listarFila: (resenhaId) =>
      transacao('readonly', ['fila'], (tx, resolver) => {
        lerFila(tx, resenhaId, (registros) => resolver(registros.map((r) => r.op)));
      }),
    anexarOperacao: (resenhaId, op) =>
      transacao('readwrite', ['fila'], (tx) => {
        tx.objectStore('fila').add({ resenhaId, op });
      }),
    substituirFila: (resenhaId, ops) =>
      transacao('readwrite', ['fila'], (tx) => {
        reescreverFila(tx, resenhaId, ops);
      }),
    atualizar: (resenhaId, fn) =>
      transacao('readwrite', ['resenhas', 'estados', 'fila'], (tx, resolver) => {
        const resenha = tx.objectStore('resenhas').get(resenhaId);
        resenha.onsuccess = () => {
          if (!resenha.result) return resolver({ estado: null, fila: [] });
          const lido = tx.objectStore('estados').get(resenhaId);
          lido.onsuccess = () => {
            const estado = lido.result ?? null;
            lerFila(tx, resenhaId, (registros) => {
              const fila = registros.map((r) => r.op);
              const mudanca = fn(estado, fila) ?? {};
              const novoEstado = mudanca.estado === undefined ? estado : mudanca.estado;
              const novaFila = mudanca.fila ?? fila;
              if (novoEstado) tx.objectStore('estados').put(novoEstado, resenhaId);
              if (mudanca.fila) reescreverFila(tx, resenhaId, novaFila);
              resolver({ estado: novoEstado, fila: novaFila });
            });
          };
        };
      }),
  };
}
