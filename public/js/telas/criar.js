// Criar resenha: nome e apelido; em seguida, o link de convite para compartilhar.

import { formatarCodigo } from '../../../compartilhado/codigos.js';
import { LIMITES } from '../../../compartilhado/nomes.js';
import { blocoSegredo } from '../componentes/bloco-segredo.js';
import { criarCampo } from '../componentes/campo.js';
import { desenharTopo } from '../componentes/topo.js';
import { repositorio } from '../dados/repositorio-navegador.js';
import { mensagemDeErro } from '../erros.js';
import { caminhoResenha, substituir } from '../roteador.js';
import { h, trocarFilhos } from '../util.js';

export function telaCriar(raiz) {
  desenharTopo({ titulo: 'Criar resenha', voltarPara: '#/' });
  const nome = criarCampo({
    rotulo: 'Nome da resenha',
    maximo: LIMITES.nomeResenha,
    obrigatorio: true,
    autocomplete: 'off',
  });
  const apelido = criarCampo({
    rotulo: 'Apelido',
    maximo: LIMITES.apelido,
    obrigatorio: true,
    dica: 'Identifica quem lança cada partida.',
  });
  const erro = h('p', { class: 'campo-mensagem', role: 'alert' });
  const botao = h('button', { type: 'submit', class: 'btn btn-primario btn-grande btn-bloco' }, 'Criar resenha');

  const formulario = h(
    'form',
    {
      class: 'tela',
      noValidate: true,
      onSubmit: async (e) => {
        e.preventDefault();
        if (botao.getAttribute('aria-disabled') === 'true') return;
        erro.textContent = '';
        nome.definirErro(nome.entrada.value.trim() ? null : 'Informar o nome da resenha.');
        apelido.definirErro(apelido.entrada.value.trim() ? null : 'Informar o apelido.');
        if (!nome.entrada.value.trim() || !apelido.entrada.value.trim()) return;
        botao.setAttribute('aria-disabled', 'true');
        botao.textContent = 'Criando…';
        try {
          const criada = await repositorio.criarResenha({ nome: nome.entrada.value, apelido: apelido.entrada.value });
          concluir(criada);
        } catch (falha) {
          erro.textContent = mensagemDeErro(falha, 'Falha ao criar a resenha.');
          botao.removeAttribute('aria-disabled');
          botao.textContent = 'Criar resenha';
        }
      },
    },
    h('h2', { class: 'titulo-tela' }, 'Nova resenha'),
    h('p', { class: 'apoio' }, 'Espaço permanente do grupo para registrar partidas. O convite é gerado em seguida.'),
    nome.el,
    apelido.el,
    erro,
    botao,
  );
  trocarFilhos(raiz, formulario);
  nome.entrada.focus();

  function concluir({ resenhaId, convite }) {
    desenharTopo({ titulo: 'Resenha criada' });
    const link = `${location.origin}/#/c/${formatarCodigo(convite.codigo)}`;
    trocarFilhos(
      raiz,
      h(
        'div',
        { class: 'tela' },
        h('h2', { class: 'titulo-tela' }, 'Resenha criada'),
        blocoSegredo({
          rotulo: 'Link de convite',
          valor: link,
          exibicao: link.replace(/^https?:\/\//, ''),
          apoio: 'Válido por 7 dias. Quem abrir o link escolhe um apelido e entra.',
          compartilhavel: { title: 'Convite para a resenha', text: 'Convite para a resenha no Partidou.', url: link },
        }),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-primario btn-grande btn-bloco',
            onClick: () => substituir(caminhoResenha(resenhaId)),
          },
          'Abrir resenha',
        ),
      ),
    );
    scrollTo(0, 0);
  }
}
