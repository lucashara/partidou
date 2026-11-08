import { requisicaoInvalida } from '../../erros.js';

/** Sentinela: o tratador escreveu a resposta por conta própria (fluxo SSE). */
export const RESPOSTA_DIRETA = Symbol('resposta-direta');

/**
 * @typedef {object} ContextoRota
 * @property {import('../../tipos.js').Contexto} ctx
 * @property {import('node:http').IncomingMessage} req
 * @property {import('node:http').ServerResponse} res
 * @property {Record<string, string>} params
 * @property {URLSearchParams} query
 * @property {Record<string, any>} corpo
 * @property {import('../../nucleo/acesso.js').Autenticacao} auth presente nas rotas autenticadas
 * @property {Record<string, string>} cabecalhos cabeçalhos de segurança
 * @property {string} ip origem da requisição
 *
 * @typedef {object} Rota
 * @property {string} metodo
 * @property {string} caminho padrão com `:parametro`, também usado no log
 * @property {boolean} autenticada
 * @property {boolean} porCodigo rota de tentativa de código, sujeita a bloqueio por falhas
 * @property {string[]} segmentos
 * @property {(c: ContextoRota) => Promise<{ status: number, corpo?: unknown } | typeof RESPOSTA_DIRETA> | { status: number, corpo?: unknown } | typeof RESPOSTA_DIRETA} tratar
 */

/**
 * @param {string} metodo
 * @param {string} caminho
 * @param {{ publica?: boolean, porCodigo?: boolean }} opcoes
 * @param {Rota['tratar']} tratar
 * @returns {Rota}
 */
export function rota(metodo, caminho, { publica = false, porCodigo = false } = {}, tratar) {
  return { metodo, caminho, autenticada: !publica, porCodigo, segmentos: caminho.split('/').slice(1), tratar };
}

/**
 * Casa método e caminho com a tabela; devolve a rota e os parâmetros, ou null.
 * @param {Rota[]} rotas
 * @param {string} metodo
 * @param {string} pathname
 */
export function casar(rotas, metodo, pathname) {
  const partes = pathname.split('/').slice(1);
  for (const r of rotas) {
    if (r.metodo !== metodo || r.segmentos.length !== partes.length) continue;
    /** @type {Record<string, string>} */
    const params = {};
    let ok = true;
    for (let i = 0; i < partes.length && ok; i++) {
      const modelo = r.segmentos[i];
      if (modelo.startsWith(':')) {
        if (partes[i] === '') ok = false;
        else params[modelo.slice(1)] = partes[i];
      } else if (modelo !== partes[i]) {
        ok = false;
      }
    }
    if (ok) return { rota: r, params };
  }
  return null;
}

/**
 * Campo de texto obrigatório do corpo; ausente ou de outro tipo vira 400.
 * @param {Record<string, any>} corpo
 * @param {string} campo
 */
export function textoDoCorpo(corpo, campo) {
  const valor = corpo[campo];
  if (typeof valor !== 'string') throw requisicaoInvalida(`Campo ${campo} obrigatório.`, campo);
  return valor;
}
