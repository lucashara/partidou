import { isIP } from 'node:net';
import { normalizarEndereco } from './enderecos.js';

const PROXIES_LOCAIS = ['127.0.0.1', '::1'];

/**
 * @typedef {object} Configuracao
 * @property {number} port
 * @property {string} host
 * @property {string} dbPath
 * @property {string | null} logDir
 * @property {'' | 'cloudflare'} trustProxy
 * @property {ReadonlySet<string>} proxiesConfiaveis
 * @property {boolean} dev
 * @property {number} maxResenhas
 * @property {number} maxCriacoesDia
 * @property {number} maxMembros
 * @property {number} maxCompetidores
 * @property {number} maxPartidas
 */

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} nome
 * @param {number} padrao
 * @param {number} minimo
 * @param {number} [maximo]
 */
function inteiro(env, nome, padrao, minimo, maximo = Number.MAX_SAFE_INTEGER) {
  const bruto = env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`Variável ${nome} inválida: esperado inteiro entre ${minimo} e ${maximo}.`);
  }
  return valor;
}

/**
 * Lê e valida as variáveis de ambiente. Nenhuma é segredo e todas têm padrão.
 * @param {Record<string, string | undefined>} [env]
 * @returns {Configuracao}
 */
export function lerConfiguracao(env = process.env) {
  const proxy = env.TRUST_PROXY ?? '';
  if (proxy !== '' && proxy !== 'cloudflare') {
    throw new Error('Variável TRUST_PROXY inválida: use vazio ou "cloudflare".');
  }
  const trustProxy = proxy === 'cloudflare' ? 'cloudflare' : '';
  const informados = (env.PROXY_CONFIAVEL ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (informados.some((ip) => !isIP(ip)))
    throw new Error('Variável PROXY_CONFIAVEL inválida: use endereços IP separados por vírgula.');
  // `::ffff:a.b.c.d` e `a.b.c.d` são o mesmo par; a comparação em origemDe também normaliza o socket.
  const proxiesConfiaveis = new Set((informados.length > 0 ? informados : PROXIES_LOCAIS).map(normalizarEndereco));
  return {
    port: inteiro(env, 'PORT', 8791, 1, 65535),
    host: env.HOST || '127.0.0.1',
    dbPath: env.DB_PATH || './data/partidou.db',
    logDir: env.LOG_DIR || './logs',
    trustProxy,
    proxiesConfiaveis,
    dev: env.DEV === '1',
    maxResenhas: inteiro(env, 'MAX_RESENHAS', 5000, 1),
    maxCriacoesDia: inteiro(env, 'MAX_CRIACOES_DIA', 300, 1),
    maxMembros: inteiro(env, 'MAX_MEMBROS', 30, 1),
    maxCompetidores: inteiro(env, 'MAX_COMPETIDORES', 60, 1),
    // O GET /estado devolve todas as partidas; 20000 chegava a 7,5 MB por resposta.
    maxPartidas: inteiro(env, 'MAX_PARTIDAS', 5000, 1),
  };
}
