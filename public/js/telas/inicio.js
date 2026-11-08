// Início: resenhas deste aparelho e as duas portas de entrada (criar e entrar).
import { desenharTopo } from '../componentes/topo.js';
import { repositorio } from '../dados/repositorio-navegador.js';
import { icone } from '../icones.js';
import { caminhoResenha } from '../roteador.js';
import { h, trocarFilhos } from '../util.js';

const PAPEIS = { criador: 'Criador', participante: 'Participante' };

export function telaInicio(raiz) {
  let ativo = true;
  desenharTopo({ titulo: 'Partidou', marca: true });

  const desenhar = (resenhas) => {
    if (!ativo) return;
    const acoes = h(
      'div',
      { class: 'inicio-acoes' },
      h('a', { class: 'btn btn-primario btn-grande', href: '#/criar' }, 'Criar resenha'),
      h('a', { class: `btn${resenhas.length ? '' : ' btn-grande'}`, href: '#/entrar' }, 'Entrar em resenha'),
    );
    if (resenhas.length === 0) {
      trocarFilhos(
        raiz,
        h(
          'div',
          { class: 'tela' },
          h('h2', { class: 'inicio-titulo' }, 'Jogou? Registrou.'),
          h(
            'p',
            { class: 'apoio' },
            'Resultados de partidas entre amigos em um espaço do grupo, compartilhado por convite. Sem cadastro e sem senha.',
          ),
          acoes,
        ),
      );
      return;
    }
    trocarFilhos(
      raiz,
      h(
        'div',
        { class: 'tela' },
        h('h2', { class: 'titulo-tela' }, 'Resenhas'),
        h(
          'ul',
          { class: 'lista-resenhas' },
          resenhas.map((r) =>
            h(
              'li',
              null,
              h(
                'a',
                { class: 'resenha-item', href: caminhoResenha(r.id) },
                h(
                  'span',
                  { class: 'resenha-item-texto' },
                  h('span', { class: 'resenha-item-nome' }, r.nome),
                  h('span', { class: 'resenha-item-meta' }, `${r.eu.apelido} · ${PAPEIS[r.eu.papel] ?? r.eu.papel}`),
                ),
                icone('avancar'),
              ),
            ),
          ),
        ),
        acoes,
      ),
    );
  };

  repositorio.listarResenhas().then(desenhar, () => desenhar([]));
  return {
    desmontar() {
      ativo = false;
    },
  };
}
