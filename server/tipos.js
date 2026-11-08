/**
 * @typedef {import('./banco.js').Banco} Banco
 * @typedef {import('./configuracao.js').Configuracao} Configuracao
 * @typedef {import('./nucleo/acesso.js').Autenticacao} Autenticacao
 * @typedef {import('./registro.js').Registro} Registro
 * @typedef {ReturnType<typeof import('./eventos.js').criarEventos>} Eventos
 * @typedef {ReturnType<typeof import('./limitador.js').criarLimitador>} Limitador
 * @typedef {ReturnType<typeof import('./estaticos.js').criarEstaticos>} Estaticos
 *
 * @typedef {object} Contexto Serviços compartilhados entre o núcleo e a camada HTTP.
 * @property {Banco} banco
 * @property {Configuracao} config
 * @property {() => number} relogio
 * @property {Eventos} eventos
 * @property {Limitador} limitador
 * @property {Registro} registro
 * @property {Estaticos} estaticos
 */

export {};
