// Código de transferência: abre no aparelho atual uma resenha que já tem acesso em outro aparelho.
import { codigoTransferenciaValido, normalizarCodigo } from '../../../compartilhado/codigos.js';
import { criarCampo } from '../componentes/campo.js';
import { desenharTopo } from '../componentes/topo.js';
import { repositorio } from '../dados/repositorio-navegador.js';
import { mensagemDeErro } from '../erros.js';
import { caminhoResenha, substituir } from '../roteador.js';
import { h, ocupar, trocarFilhos } from '../util.js';

export function telaAcesso(raiz) {
  desenharTopo({ titulo: 'Código de transferência', voltarPara: '#/entrar' });

  const campo = criarCampo({
    rotulo: 'Código de transferência',
    classeEntrada: 'numeros',
    maximo: 20,
    obrigatorio: true,
    dica: 'Gerado em Ajustes, no aparelho que já tem acesso. Vale 10 minutos e funciona uma vez.',
  });
  const botao = h('button', { type: 'submit', class: 'btn btn-primario btn-grande btn-bloco' }, 'Entrar na resenha');

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
          if (!codigoTransferenciaValido(valor))
            return campo.definirErro('Código de transferência inválido ou expirado.');
          campo.definirErro(null);
          ocupar(botao, 'Entrando…', async () => {
            try {
              const { resenhaId } = await repositorio.usarTransferencia(valor);
              substituir(caminhoResenha(resenhaId));
            } catch (falha) {
              campo.definirErro(mensagemDeErro(falha, 'Falha ao validar o código.'));
            }
          });
        },
      },
      h('h2', { class: 'titulo-tela' }, 'Código de transferência'),
      campo.el,
      botao,
      h('div', { class: 'secao' }, h('a', { class: 'btn btn-texto', href: '#/entrar' }, 'Usar código de convite')),
    ),
  );
  campo.entrada.focus();
}
