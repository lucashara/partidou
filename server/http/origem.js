import { isIP } from 'node:net';
import { normalizarEndereco } from '../enderecos.js';

/** Um aviso por registro (ou seja, por processo): o cabeçalho ignorado se repetiria a cada requisição. */
const avisados = new WeakSet();

/**
 * Endereço de origem para limites e logs. `CF-Connecting-IP` só vale com TRUST_PROXY=cloudflare e conexão
 * vinda de um proxy confiável (o cloudflared local; em container, o gateway da bridge); `X-Forwarded-For`
 * nunca é considerado.
 * @param {{ socket: { remoteAddress?: string }, headers: Record<string, string | string[] | undefined> }} req
 * @param {{ trustProxy: string, proxiesConfiaveis: ReadonlySet<string> }} config
 * @param {import('../registro.js').Registro} [registro]
 */
export function origemDe(req, config, registro) {
  const socket = req.socket.remoteAddress ?? 'desconhecida';
  if (config.trustProxy !== 'cloudflare') return socket;
  const cabecalho = req.headers['cf-connecting-ip'];
  if (!config.proxiesConfiaveis.has(normalizarEndereco(socket))) {
    if (registro && cabecalho !== undefined && !avisados.has(registro)) {
      avisados.add(registro);
      registro.aviso('cf_connecting_ip_ignorado', { socket });
    }
    return socket;
  }
  if (typeof cabecalho !== 'string') return socket;
  const ip = cabecalho.trim();
  return isIP(ip) ? ip : socket;
}
