/** Falha do armazenamento local (indisponível, modo privativo, cota). */
export class ErroArmazenamento extends Error {
  /** @param {string} mensagem */
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroArmazenamento';
    this.mensagem = mensagem;
  }
}

/** @param {any} valor */
const copia = (valor) => (valor === undefined || valor === null ? null : structuredClone(valor));

/**
 * Implementação em memória, usada nos testes. Devolve cópias, como o IndexedDB, e cada operação é síncrona por dentro.
 * @returns {import('./tipos.js').Armazenamento}
 */
export function criarArmazenamentoMemoria() {
  /** @type {Map<string, import('./tipos.js').ResenhaLocal>} */
  const resenhas = new Map();
  /** @type {Map<string, import('./tipos.js').EstadoLocal>} */
  const estados = new Map();
  /** @type {Map<string, import('./tipos.js').Operacao[]>} */
  const filas = new Map();

  return {
    async listarResenhas() {
      return [...resenhas.values()].map((r) => structuredClone(r));
    },
    async lerResenha(id) {
      return copia(resenhas.get(id));
    },
    async gravarResenha(resenha) {
      resenhas.set(resenha.id, structuredClone(resenha));
    },
    async removerResenha(id) {
      resenhas.delete(id);
      estados.delete(id);
      filas.delete(id);
    },
    async lerEstado(resenhaId) {
      return copia(estados.get(resenhaId));
    },
    async gravarEstado(resenhaId, estado) {
      estados.set(resenhaId, structuredClone(estado));
    },
    async listarFila(resenhaId) {
      return structuredClone(filas.get(resenhaId) ?? []);
    },
    async anexarOperacao(resenhaId, op) {
      filas.set(resenhaId, [...(filas.get(resenhaId) ?? []), structuredClone(op)]);
    },
    async substituirFila(resenhaId, ops) {
      filas.set(resenhaId, structuredClone(ops));
    },
    async atualizar(resenhaId, fn) {
      if (!resenhas.has(resenhaId)) return { estado: null, fila: [] };
      const estado = copia(estados.get(resenhaId));
      const fila = structuredClone(filas.get(resenhaId) ?? []);
      const mudanca = fn(estado, fila) ?? {};
      const novoEstado = mudanca.estado === undefined ? estado : mudanca.estado;
      const novaFila = mudanca.fila ?? fila;
      if (novoEstado) estados.set(resenhaId, structuredClone(novoEstado));
      filas.set(resenhaId, structuredClone(novaFila));
      return { estado: copia(novoEstado), fila: structuredClone(novaFila) };
    },
  };
}
