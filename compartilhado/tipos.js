/**
 * @typedef {object} Resenha
 * @property {string} id
 * @property {string} nome
 * @property {number} seq
 * @property {number} criadaEm
 */

/**
 * @typedef {object} Membro
 * @property {string} id
 * @property {string} apelido
 * @property {'criador' | 'participante'} papel
 * @property {number} criadoEm
 */

/**
 * @typedef {object} Competidor
 * @property {string} id
 * @property {string} nome
 * @property {string} criadoPor
 * @property {number} seq
 */

/**
 * @typedef {object} Partida
 * @property {string} id
 * @property {string} ladoA ID do competidor.
 * @property {string} ladoB ID do competidor.
 * @property {number} placarA
 * @property {number} placarB
 * @property {number | null} penaltisA
 * @property {number | null} penaltisB
 * @property {string | null} modalidade
 * @property {number} jogadaEm
 * @property {string} criadoPor
 * @property {string | null} editadoPor
 * @property {number} criadaEm
 * @property {number} atualizadaEm
 * @property {number} rev
 * @property {boolean} excluida
 * @property {number} seq
 */

/**
 * @typedef {object} Estado
 * @property {number} seq
 * @property {boolean} completo
 * @property {Resenha} resenha
 * @property {{ membroId: string, papel: 'criador' | 'participante', apelido: string }} eu
 * @property {Membro[]} membros
 * @property {Competidor[]} competidores
 * @property {Partida[]} partidas
 */

export {};
