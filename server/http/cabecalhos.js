const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Cabeçalhos de segurança presentes em toda resposta, inclusive erros e estáticos.
 * @param {{ trustProxy: string }} config
 * @returns {Record<string, string>}
 */
export function cabecalhosBase(config) {
  /** @type {Record<string, string>} */
  const base = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (config.trustProxy === 'cloudflare') base['Strict-Transport-Security'] = 'max-age=31536000';
  return base;
}
