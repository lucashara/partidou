// @ts-nocheck: o escopo do service worker usa tipos que não existem na lib DOM do projeto.
// Service worker: guarda o app inteiro para abrir sem rede. A API nunca passa por aqui: a fila de envio fica no aplicativo.
// O servidor troca a versão e a lista de arquivos a cada deploy, o que invalida o cache anterior.
const VERSAO = '__VERSAO__';
const ARQUIVOS = '__ARQUIVOS__';
const PREFIXO = 'partidou-';
const CACHE = `${PREFIXO}${VERSAO}`;

self.addEventListener('install', (evento) => {
  const lista = Array.isArray(ARQUIVOS) ? ARQUIVOS : ['/'];
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(lista.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((c) => c.startsWith(PREFIXO) && c !== CACHE).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/saude') return;
  if (request.mode === 'navigate') {
    evento.respondWith(caches.match('/', { cacheName: CACHE }).then((guardado) => guardado ?? fetch(request)));
    return;
  }
  evento.respondWith(
    caches.match(request, { cacheName: CACHE, ignoreSearch: true }).then((guardado) => guardado ?? fetch(request)),
  );
});
