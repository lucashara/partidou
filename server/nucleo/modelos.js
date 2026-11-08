// Conversão das linhas do banco para os objetos da API (camelCase, sem colunas internas).

/**
 * @returns {import('../../compartilhado/tipos.js').Resenha}
 * @param {any} l
 */
export const paraResenha = (l) => ({ id: l.id, nome: l.nome, seq: l.seq, criadaEm: l.criada_em });

/**
 * @returns {import('../../compartilhado/tipos.js').Membro}
 * @param {any} l
 */
export const paraMembro = (l) => ({ id: l.id, apelido: l.apelido, papel: l.papel, criadoEm: l.criado_em });

/**
 * @returns {import('../../compartilhado/tipos.js').Competidor}
 * @param {any} l
 */
export const paraCompetidor = (l) => ({ id: l.id, nome: l.nome, criadoPor: l.criado_por, seq: l.seq });

/**
 * @returns {import('../../compartilhado/tipos.js').Partida}
 * @param {any} l
 */
export const paraPartida = (l) => ({
  id: l.id,
  ladoA: l.lado_a,
  ladoB: l.lado_b,
  placarA: l.placar_a,
  placarB: l.placar_b,
  penaltisA: l.penaltis_a,
  penaltisB: l.penaltis_b,
  modalidade: l.modalidade,
  jogadaEm: l.jogada_em,
  criadoPor: l.criado_por,
  editadoPor: l.editado_por,
  criadaEm: l.criada_em,
  atualizadaEm: l.atualizada_em,
  rev: l.rev,
  excluida: l.excluida_em !== null,
  seq: l.seq,
});
