import { isIP } from 'node:net';

/**
 * Oito grupos de 16 bits de um IPv6 válido (aceita `::`, cauda IPv4 e zona).
 * @param {string} ip
 */
function gruposIpv6(ip) {
  let texto = ip.split('%')[0];
  const cauda = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(texto);
  if (cauda) {
    const [a, b, c, d] = cauda.slice(1).map(Number);
    texto = `${texto.slice(0, cauda.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [esquerda, direita] = texto.split('::');
  const inicio = esquerda ? esquerda.split(':') : [];
  const fim = direita ? direita.split(':') : [];
  const meio = texto.includes('::') ? Array(8 - inicio.length - fim.length).fill('0') : [];
  return [...inicio, ...meio, ...fim].map((g) => Number.parseInt(g, 16));
}

/**
 * `::ffff:a.b.c.d` (e a forma hexadecimal) vira o IPv4; qualquer outro valor segue como veio.
 * @param {string} ip
 */
export function normalizarEndereco(ip) {
  if (isIP(ip) !== 6) return ip;
  const g = gruposIpv6(ip);
  if (g.slice(0, 5).some((x) => x !== 0) || g[5] !== 0xffff) return ip;
  return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
}

/**
 * Chave de quem alimenta o disjuntor: IPv4 inteiro; IPv6 pelo prefixo /48, que um único assinante pode girar em /64.
 * @param {string} ip
 */
export function chaveDeDisjuntor(ip) {
  const normal = normalizarEndereco(ip);
  if (isIP(normal) !== 6) return normal;
  return `${gruposIpv6(normal)
    .slice(0, 3)
    .map((g) => g.toString(16))
    .join(':')}::/48`;
}

/**
 * Chave do limite por IP: IPv4 inteiro; IPv6 pelo prefixo /64, que é o que um assinante controla.
 * @param {string} ip
 */
export function chaveDeLimite(ip) {
  const normal = normalizarEndereco(ip);
  if (isIP(normal) !== 6) return normal;
  return `${gruposIpv6(normal)
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}
