import { criarArmazenamentoIdb } from './armazenamento-idb.js';
import { criarRepositorio } from './repositorio.js';

/** Globais do navegador acessados só aqui, por indireção, para o módulo importar em Node sem erro. */
const g = /** @type {any} */ (globalThis);

/** @returns {import('./tipos.js').Pagina} */
function criarPagina() {
  return {
    visivel: () => g.document?.visibilityState !== 'hidden',
    assinar(fn) {
      if (!g.window || !g.document) return () => {};
      const aoMudarVisibilidade = () => fn(g.document.visibilityState === 'hidden' ? 'oculta' : 'visivel');
      const aoVoltar = () => fn('visivel');
      const aoFicarOnline = () => fn('online');
      const aoFicarOffline = () => fn('offline');
      g.document.addEventListener('visibilitychange', aoMudarVisibilidade);
      g.window.addEventListener('pageshow', aoVoltar);
      g.window.addEventListener('online', aoFicarOnline);
      g.window.addEventListener('offline', aoFicarOffline);
      return () => {
        g.document.removeEventListener('visibilitychange', aoMudarVisibilidade);
        g.window.removeEventListener('pageshow', aoVoltar);
        g.window.removeEventListener('online', aoFicarOnline);
        g.window.removeEventListener('offline', aoFicarOffline);
      };
    },
  };
}

/** O canal só é criado no primeiro uso, nunca na importação do módulo. */
/** @returns {import('./tipos.js').Canal | null} */
function criarCanal() {
  if (typeof g.BroadcastChannel !== 'function') return null;
  /** @type {any} */
  let canal = null;
  const obter = () => {
    canal ??= new g.BroadcastChannel('partidou');
    return canal;
  };
  return {
    enviar: (mensagem) => obter().postMessage(mensagem),
    ouvir(fn) {
      /** @param {{ data: { resenhaId: string } }} evento */
      const aoReceber = (evento) => fn(evento.data);
      obter().addEventListener('message', aoReceber);
      return () => obter().removeEventListener('message', aoReceber);
    },
  };
}

/** Repositório das telas, montado com as APIs reais do navegador. */
export const repositorio = criarRepositorio({
  fetchImpl: (entrada, init) => g.fetch(entrada, init),
  armazenamento: criarArmazenamentoIdb(),
  agora: () => Date.now(),
  novoId: () => g.crypto.randomUUID(),
  travas: g.navigator?.locks ?? null,
  canal: criarCanal(),
  pagina: criarPagina(),
});
