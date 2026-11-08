// Cabeçalho do app: voltar, título, extras da tela e a ajuda discreta.
import { abrirAjuda } from '../folhas/ajuda.js';
import { icone } from '../icones.js';
import { h, trocarFilhos } from '../util.js';

/**
 * @param {{ titulo: string, marca?: boolean, voltarPara?: string, extras?: Node[] }} opcoes
 */
export function desenharTopo({ titulo, marca = false, voltarPara, extras = [] }) {
  const topo = /** @type {HTMLElement} */ (document.getElementById('topo'));
  document.title = marca ? 'Partidou' : `${titulo} · Partidou`;
  trocarFilhos(
    topo,
    voltarPara && h('a', { class: 'btn-icone', href: voltarPara, 'aria-label': 'Voltar' }, icone('voltar')),
    h(marca ? 'p' : 'h1', { class: `topo-titulo${marca ? ' topo-marca' : ''}` }, titulo),
    h(
      'div',
      { class: 'topo-acoes' },
      extras,
      h(
        'button',
        { type: 'button', class: 'btn-icone', 'aria-label': 'Ajuda', onClick: () => abrirAjuda() },
        icone('ajuda'),
      ),
    ),
  );
}

/** Indicador de sincronização do cabeçalho. */
export function criarIndicadorSync() {
  const texto = h('span', { class: 'sync-texto' });
  const el = h('span', { class: 'sync', role: 'status', dataset: { estado: 'sincronizado' } }, texto);
  const nomes = {
    sincronizado: 'Sincronizado',
    pendente: 'Pendente',
    offline: 'Offline',
    erro: 'Erro',
    'sem-acesso': 'Sem acesso',
  };
  return {
    el,
    /** @param {{ estado: string, pendentes: number }} sync */
    atualizar(sync) {
      el.dataset.estado = sync.estado;
      texto.textContent =
        sync.estado === 'pendente' && sync.pendentes > 0
          ? `Pendente · ${sync.pendentes}`
          : (nomes[sync.estado] ?? sync.estado);
      el.title = texto.textContent;
    },
  };
}
