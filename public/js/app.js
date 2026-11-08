// Inicialização: roteamento por fragmento, apresentação da primeira visita e service worker.
import { avisar } from './componentes/aviso.js';
import { mostrarApresentacaoSePreciso } from './folhas/ajuda.js';
import { lerRota } from './roteador.js';
import { telaAcesso } from './telas/acesso.js';
import { telaCriar } from './telas/criar.js';
import { telaEntrar } from './telas/entrar.js';
import { telaInicio } from './telas/inicio.js';
import { telaResenha } from './telas/resenha.js';
import { h, trocarFilhos } from './util.js';

/** @type {Record<string, (raiz: HTMLElement, rota: any) => any>} */
const TELAS = { inicio: telaInicio, criar: telaCriar, entrar: telaEntrar, acesso: telaAcesso, resenha: telaResenha };
const raiz = /** @type {HTMLElement} */ (document.getElementById('principal'));
const abas = /** @type {HTMLElement} */ (document.getElementById('abas'));

/** @type {{ rota: import('./roteador.js').Rota, instancia: any } | null} */
let atual = null;

function renderizar() {
  const rota = lerRota();
  if (
    atual?.rota.tela === 'resenha' &&
    rota.tela === 'resenha' &&
    atual.rota.id === rota.id &&
    atual.instancia?.navegar
  ) {
    atual.rota = rota;
    atual.instancia.navegar(rota);
    return;
  }
  atual?.instancia?.desmontar?.();
  atual = null;
  raiz.replaceChildren();
  raiz.classList.remove('com-abas');
  abas.hidden = true;
  raiz.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  try {
    atual = { rota, instancia: TELAS[rota.tela](raiz, rota) };
  } catch {
    trocarFilhos(
      raiz,
      h(
        'div',
        { class: 'tela' },
        h(
          'div',
          { class: 'vazio' },
          h('p', { class: 'vazio-titulo' }, 'Falha ao abrir a tela'),
          h('a', { class: 'btn btn-primario', href: '#/' }, 'Voltar ao início'),
        ),
      ),
    );
  }
  if (rota.tela === 'inicio') mostrarApresentacaoSePreciso();
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const tinhaControlador = Boolean(navigator.serviceWorker.controller);
  let avisou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControlador || avisou) return;
    avisou = true;
    avisar({
      texto: 'Nova versão disponível.',
      duracaoMs: 15_000,
      acao: { rotulo: 'Atualizar', aoClicar: () => location.reload() },
    });
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

window.addEventListener('hashchange', renderizar);
renderizar();
registrarServiceWorker();
