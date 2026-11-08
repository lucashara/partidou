import { isIP } from 'node:net';

/**
 * Endereço de origem para limites e logs. `CF-Connecting-IP` só vale com TRUST_PROXY=cloudflare e conexão
 * vinda de um proxy confiável (o cloudflared local; em container, o gateway da bridge); `X-Forwarded-For`
 * nunca é considerado.
 * @param {{ socket: { remoteAddress?: string }, headers: Record<string, string | string[] | undefined> }} req
 * @param {{ trustProxy: string, proxiesConfiaveis: ReadonlySet<string> }} config
 */
export function origemDe(req, config) {
  const socket = req.socket.remoteAddress ?? 'desconhecida';
  if (config.trustProxy !== 'cloudflare' || !config.proxiesConfiaveis.has(socket)) return socket;
  const cabecalho = req.headers['cf-connecting-ip'];
  if (typeof cabecalho !== 'string') return socket;
  const ip = cabecalho.trim();
  return isIP(ip) ? ip : socket;
}
