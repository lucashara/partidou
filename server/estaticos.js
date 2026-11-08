// Entrega public/ e compartilhado/ (sob /compartilhado/) com ETag. O service worker recebe a versão e a lista
// de arquivos calculadas do conteúdo, para que todo deploy invalide o cache antigo.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

/** @type {Record<string, string>} */
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const etagDe = (/** @type {Buffer} */ corpo) => `"${createHash('sha1').update(corpo).digest('hex').slice(0, 16)}"`;

/**
 * @param {string} diretorio
 * @returns {string[]}
 */
function listar(diretorio) {
  if (!existsSync(diretorio)) return [];
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listar(join(diretorio, e.name)) : [join(diretorio, e.name)],
  );
}

/**
 * @param {{ diretorio: string, prefixo: string }[]} raizes
 */
function carregar(raizes) {
  /** @type {Map<string, { corpo: Buffer, tipo: string, etag: string }>} */
  const ativos = new Map();
  for (const { diretorio, prefixo } of raizes) {
    for (const arquivo of listar(diretorio)) {
      const tipo = TIPOS[extname(arquivo)];
      if (!tipo) continue;
      const caminho = `${prefixo}/${relative(diretorio, arquivo).split(sep).join('/')}`;
      const corpo = readFileSync(arquivo);
      ativos.set(caminho, { corpo, tipo, etag: etagDe(corpo) });
    }
  }
  const versao = createHash('sha1')
    .update(
      [...ativos]
        .map(([c, a]) => c + a.etag)
        .sort()
        .join(),
    )
    .digest('hex')
    .slice(0, 10);
  const sw = ativos.get('/sw.js');
  if (sw) {
    const precache = ['/', ...[...ativos.keys()].filter((c) => c !== '/sw.js' && c !== '/index.html')];
    const corpo = Buffer.from(
      sw.corpo.toString('utf8').replace('__VERSAO__', versao).replace("'__ARQUIVOS__'", JSON.stringify(precache)),
    );
    ativos.set('/sw.js', { ...sw, corpo, etag: etagDe(corpo) });
  }
  const indice = ativos.get('/index.html');
  if (indice) ativos.set('/', indice);
  return { ativos, versao };
}

/**
 * @param {{ publico: string, compartilhado: string }} diretorios pastas public/ e compartilhado/
 * @param {{ recarregar?: boolean }} [opcoes] recarregar lê do disco a cada requisição (desenvolvimento)
 */
export function criarEstaticos(diretorios, { recarregar = false } = {}) {
  const raizes = [
    { diretorio: diretorios.publico, prefixo: '' },
    { diretorio: diretorios.compartilhado, prefixo: '/compartilhado' },
  ];
  let cache = carregar(raizes);
  return {
    versao: () => cache.versao,
    /**
     * Responde com o arquivo e devolve true; devolve false se o caminho não existe.
     * @param {import('node:http').IncomingMessage} req
     * @param {import('node:http').ServerResponse} res
     * @param {string} pathname
     * @param {Record<string, string>} cabecalhosBase
     */
    atender(req, res, pathname, cabecalhosBase) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      if (recarregar) cache = carregar(raizes);
      const ativo = cache.ativos.get(pathname);
      if (!ativo) return false;
      const cabecalhos = {
        ...cabecalhosBase,
        'Content-Type': ativo.tipo,
        ETag: ativo.etag,
        'Cache-Control': 'no-cache',
        // A Cloudflare reescreve o Cache-Control de estático para 4 h; a borda não guarda e o navegador revalida por ETag.
        'CDN-Cache-Control': 'no-store',
      };
      if (req.headers['if-none-match'] === ativo.etag) {
        res.writeHead(304, cabecalhos).end();
      } else {
        res.writeHead(200, { ...cabecalhos, 'Content-Length': ativo.corpo.length });
        res.end(req.method === 'HEAD' ? undefined : ativo.corpo);
      }
      return true;
    },
  };
}
