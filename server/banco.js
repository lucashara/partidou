// SQLite (node:sqlite) com migrações por user_version. O processo é único e as chamadas são síncronas,
// então cada transação é atômica em relação às demais requisições.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { APPLICATION_ID, MIGRACOES } from './migracoes.js';

/** @typedef {Record<string, any>} Linha */
/** @typedef {string | number | null} Parametro */

/**
 * @typedef {object} Banco
 * @property {DatabaseSync} db
 * @property {(sql: string, ...parametros: Parametro[]) => Linha | undefined} um
 * @property {(sql: string, ...parametros: Parametro[]) => Linha[]} todos
 * @property {(sql: string, ...parametros: Parametro[]) => { changes: number }} executar
 * @property {<T>(fn: () => T) => T} transacao
 * @property {() => void} fechar
 */

/** @param {DatabaseSync} db */
function verificarArquivo(db) {
  const { application_id: id } = /** @type {Linha} */ (db.prepare('PRAGMA application_id').get());
  const { user_version: versao } = /** @type {Linha} */ (db.prepare('PRAGMA user_version').get());
  const { n } = /** @type {Linha} */ (db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get());
  if (id !== 0 && id !== APPLICATION_ID) {
    throw new Error(`Banco de outro aplicativo (application_id ${id}). Abertura recusada.`);
  }
  if (id === 0 && n > 0) {
    throw new Error('Banco existente sem identificação do Partidou. Abertura recusada.');
  }
  if (versao > MIGRACOES.length) {
    throw new Error(
      `Esquema v${versao} é mais novo que esta versão do aplicativo (v${MIGRACOES.length}). Restaure o backup anterior ao deploy.`,
    );
  }
  return versao;
}

/**
 * @param {DatabaseSync} db
 * @param {number} atual versão do esquema no arquivo
 */
function migrar(db, atual) {
  for (let v = atual; v < MIGRACOES.length; v++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRACOES[v]);
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/**
 * Abre (ou cria) o banco, aplica as migrações pendentes e devolve os auxiliares de consulta.
 * @param {string} caminho arquivo SQLite ou ':memory:'
 * @returns {Banco}
 */
export function abrirBanco(caminho) {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  try {
    const versao = verificarArquivo(db);
    db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
    );
    migrar(db, versao);
  } catch (e) {
    db.close();
    throw e;
  }

  /** @type {Map<string, import('node:sqlite').StatementSync>} */
  const cache = new Map();
  const preparar = (/** @type {string} */ sql) => {
    let instrucao = cache.get(sql);
    if (!instrucao) {
      instrucao = db.prepare(sql);
      cache.set(sql, instrucao);
    }
    return instrucao;
  };
  let emTransacao = false;

  return {
    db,
    um: (sql, ...p) => /** @type {Linha | undefined} */ (preparar(sql).get(...p)),
    todos: (sql, ...p) => /** @type {Linha[]} */ (preparar(sql).all(...p)),
    executar: (sql, ...p) => ({ changes: Number(preparar(sql).run(...p).changes) }),
    transacao(fn) {
      if (emTransacao) return fn();
      db.exec('BEGIN IMMEDIATE');
      emTransacao = true;
      try {
        const resultado = fn();
        db.exec('COMMIT');
        return resultado;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        emTransacao = false;
      }
    },
    fechar() {
      cache.clear();
      db.close();
    },
  };
}
