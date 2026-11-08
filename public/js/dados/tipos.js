/**
 * @typedef {import('../../../compartilhado/tipos.js').Partida} Partida
 * @typedef {import('../../../compartilhado/tipos.js').Membro} Membro
 * @typedef {import('../../../compartilhado/tipos.js').Competidor} Competidor
 * @typedef {import('../../../compartilhado/tipos.js').Resenha} Resenha
 * @typedef {import('../../../compartilhado/tipos.js').Estado} EstadoServidor
 */

/**
 * @typedef {object} Eu
 * @property {string} membroId
 * @property {'criador' | 'participante'} papel
 * @property {string} apelido
 */

/**
 * @typedef {object} ResenhaLocal
 * @property {string} id
 * @property {string} nome
 * @property {string} token
 * @property {Eu} eu
 * @property {number} entrouEm
 * @property {number} abertaEm
 */

/**
 * Cópia local do estado da resenha. `partidas` guarda marcas de exclusão até o próximo estado completo.
 * @typedef {object} EstadoLocal
 * @property {number} seq
 * @property {Resenha} resenha
 * @property {Eu} eu
 * @property {Membro[]} membros
 * @property {Competidor[]} competidores
 * @property {Record<string, Partida>} partidas
 */

/**
 * @typedef {object} LadoCorpo
 * @property {string} [id]
 * @property {string} nome
 */

/**
 * Campos de partida no formato do corpo da API. Na edição, só as chaves presentes são enviadas.
 * @typedef {object} CorpoPartida
 * @property {LadoCorpo} [ladoA]
 * @property {LadoCorpo} [ladoB]
 * @property {number} [placarA]
 * @property {number} [placarB]
 * @property {{ a: number, b: number } | null} [penaltis]
 * @property {string | null} [modalidade]
 * @property {number} [jogadaEm]
 */

/**
 * @typedef {object} Operacao
 * @property {string} idOp
 * @property {'criar' | 'editar' | 'excluir' | 'restaurar'} tipo
 * @property {string} partidaId
 * @property {CorpoPartida} corpo
 * @property {number} [rev] Ausente na criação.
 * @property {number} criadaEm
 * @property {number} tentativas
 */

/**
 * @typedef {object} Aviso
 * @property {'rejeitada' | 'conflito' | 'sem-acesso'} tipo
 * @property {string} mensagem
 * @property {string} [partidaId]
 */

/**
 * @typedef {Partida & { pendente: boolean, podeEditar: boolean }} PartidaVisao
 */

/**
 * @typedef {object} SyncVisao
 * @property {'sincronizado' | 'pendente' | 'offline' | 'erro' | 'sem-acesso'} estado
 * @property {number} pendentes
 * @property {number | null} ultimaSincronizacaoEm
 * @property {string | null} mensagem
 */

/**
 * @typedef {object} Visao
 * @property {{ id: string, nome: string }} resenha
 * @property {Eu} eu
 * @property {Membro[]} membros
 * @property {{ id: string, nome: string, local?: true }[]} competidores
 * @property {PartidaVisao[]} partidas
 * @property {SyncVisao} sync
 * @property {boolean} carregando
 */

/**
 * Resultado de uma transação: valores ausentes mantêm o que estava gravado.
 * @typedef {{ estado?: EstadoLocal | null, fila?: Operacao[] }} MudancaLocal
 */

/**
 * @typedef {object} Armazenamento
 * @property {() => Promise<ResenhaLocal[]>} listarResenhas
 * @property {(id: string) => Promise<ResenhaLocal | null>} lerResenha
 * @property {(r: ResenhaLocal) => Promise<void>} gravarResenha
 * @property {(id: string) => Promise<void>} removerResenha Apaga também estado e fila.
 * @property {(resenhaId: string) => Promise<EstadoLocal | null>} lerEstado
 * @property {(resenhaId: string, estado: EstadoLocal) => Promise<void>} gravarEstado
 * @property {(resenhaId: string) => Promise<Operacao[]>} listarFila
 * @property {(resenhaId: string, op: Operacao) => Promise<void>} anexarOperacao
 * @property {(resenhaId: string, ops: Operacao[]) => Promise<void>} substituirFila
 * @property {(resenhaId: string, fn: (estado: EstadoLocal | null, fila: Operacao[]) => MudancaLocal | void) => Promise<{ estado: EstadoLocal | null, fila: Operacao[] }>} atualizar
 * Leitura, decisão e gravação de estado e fila numa única transação; `fn` é síncrona e recebe cópias.
 */

/**
 * @typedef {object} Travas
 * @property {(nome: string, trabalho: () => Promise<unknown>) => Promise<unknown>} request
 */

/**
 * @typedef {object} Canal
 * @property {(mensagem: { resenhaId: string }) => void} enviar
 * @property {(fn: (mensagem: { resenhaId: string }) => void) => (() => void)} ouvir
 */

/**
 * @typedef {object} Pagina
 * @property {() => boolean} visivel
 * @property {(fn: (evento: 'visivel' | 'oculta' | 'online' | 'offline') => void) => (() => void)} assinar
 */

/**
 * @typedef {object} Dependencias
 * @property {(entrada: string, init?: any) => Promise<Response>} fetchImpl
 * @property {Armazenamento} armazenamento
 * @property {() => number} agora
 * @property {() => string} novoId
 * @property {Travas | null} [travas]
 * @property {Canal | null} [canal]
 * @property {Pagina} [pagina]
 * @property {(fn: () => void, ms: number) => (() => void)} [agendar] Devolve a função que cancela.
 * @property {() => number} [aleatorio]
 */

/**
 * @typedef {Required<Omit<Dependencias, 'travas' | 'canal'>> & { travas: Travas, canal: Canal | null }} DependenciasCompletas
 */

export {};
