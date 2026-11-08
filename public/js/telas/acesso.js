// Recuperar acesso: chave de recuperação do criador ou código de transferência entre aparelhos.
import {
  chaveRecuperacaoValida,
  codigoTransferenciaValido,
  formatarCodigo,
  normalizarCodigo,
} from '../../../compartilhado/codigos.js';
import { blocoSegredo } from '../componentes/bloco-segredo.js';
import { criarCampo } from '../componentes/campo.js';
import { confirmacaoChave } from '../componentes/confirmacao-chave.js';
import { desenharTopo } from '../componentes/topo.js';
import { repositorio } from '../dados/repositorio-navegador.js';
import { mensagemDeErro } from '../erros.js';
import { caminhoResenha, substituir } from '../roteador.js';
import { h, ocupar, trocarFilhos } from '../util.js';

const TIPOS = {
  chave: {
    titulo: 'Recuperar acesso',
    rotulo: 'Chave de recuperação',
    dica: 'Chave de 25 caracteres exibida ao criar a resenha. Gera uma nova chave e encerra as outras sessões do criador.',
    invalido: 'Chave de recuperação inválida.',
    valida: chaveRecuperacaoValida,
    maximo: 40,
    botao: 'Recuperar acesso',
    ocupado: 'Recuperando…',
    outra: ['#/acesso/transferencia', 'Usar código de transferência'],
  },
  transferencia: {
    titulo: 'Código de transferência',
    rotulo: 'Código de transferência',
    dica: 'Gerado em Ajustes, no aparelho que já tem acesso. Vale 10 minutos e funciona uma vez.',
    invalido: 'Código de transferência inválido ou expirado.',
    valida: codigoTransferenciaValido,
    maximo: 20,
    botao: 'Entrar na resenha',
    ocupado: 'Entrando…',
    outra: ['#/acesso/chave', 'Recuperar acesso com a chave'],
  },
};

export function telaAcesso(raiz, rota) {
  const tipo = TIPOS[rota.tipo];
  let ativo = true;
  desenharTopo({ titulo: tipo.titulo, voltarPara: '#/entrar' });

  const campo = criarCampo({
    rotulo: tipo.rotulo,
    classeEntrada: 'numeros',
    maximo: tipo.maximo,
    obrigatorio: true,
    dica: tipo.dica,
  });
  const botao = h('button', { type: 'submit', class: 'btn btn-primario btn-grande btn-bloco' }, tipo.botao);

  function concluirChave({ resenhaId, chaveRecuperacao }) {
    desenharTopo({ titulo: 'Acesso recuperado' });
    trocarFilhos(
      raiz,
      h(
        'div',
        { class: 'tela' },
        h('h2', { class: 'titulo-tela' }, 'Acesso recuperado'),
        blocoSegredo({
          rotulo: 'Nova chave de recuperação',
          valor: chaveRecuperacao,
          exibicao: formatarCodigo(chaveRecuperacao, 5),
          apoio: 'Exibida somente agora. A chave anterior deixou de valer.',
        }),
        confirmacaoChave({ aoAbrir: () => substituir(caminhoResenha(resenhaId)) }),
      ),
    );
    scrollTo(0, 0);
  }

  trocarFilhos(
    raiz,
    h(
      'form',
      {
        class: 'tela',
        noValidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          const valor = normalizarCodigo(campo.entrada.value);
          if (!tipo.valida(valor)) return campo.definirErro(tipo.invalido);
          campo.definirErro(null);
          ocupar(botao, tipo.ocupado, async () => {
            try {
              if (rota.tipo === 'chave') {
                const resultado = await repositorio.recuperarAcesso(valor);
                if (ativo) concluirChave(resultado);
              } else {
                const { resenhaId } = await repositorio.usarTransferencia(valor);
                substituir(caminhoResenha(resenhaId));
              }
            } catch (falha) {
              campo.definirErro(mensagemDeErro(falha, 'Falha ao validar o código.'));
            }
          });
        },
      },
      h('h2', { class: 'titulo-tela' }, tipo.titulo),
      campo.el,
      botao,
      h('div', { class: 'secao' }, h('a', { class: 'btn btn-texto', href: tipo.outra[0] }, tipo.outra[1])),
    ),
  );
  campo.entrada.focus();

  return {
    desmontar() {
      ativo = false;
    },
  };
}
