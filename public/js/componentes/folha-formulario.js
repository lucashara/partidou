// Folhas de formulário: texto simples e confirmação por digitação do nome.
import { chaveDeNome } from '../../../compartilhado/nomes.js';
import { mensagemDeErro } from '../erros.js';
import { h, ocupar } from '../util.js';
import { criarCampo } from './campo.js';
import { abrirFolha } from './folha.js';

/**
 * @param {{ titulo: string, rotulo: string, valor?: string, maximo: number, rotuloConfirmar: string, dica?: string, aoSalvar: (texto: string) => Promise<unknown> }} opcoes
 */
export function folhaTexto({ titulo, rotulo, valor = '', maximo, rotuloConfirmar, dica, aoSalvar }) {
  const campo = criarCampo({ rotulo, valor, maximo, dica, obrigatorio: true });
  const botao = h('button', { type: 'submit', class: 'btn btn-primario btn-grande btn-bloco' }, rotuloConfirmar);
  let folha;
  const formulario = h(
    'form',
    {
      class: 'tela',
      noValidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        const texto = campo.entrada.value.trim();
        if (!texto) return campo.definirErro('Informar o valor.');
        campo.definirErro(null);
        ocupar(botao, 'Salvando…', async () => {
          try {
            await aoSalvar(texto);
            folha.fechar();
          } catch (erro) {
            campo.definirErro(mensagemDeErro(erro, 'Falha ao salvar.'));
          }
        });
      },
    },
    campo.el,
    botao,
  );
  folha = abrirFolha({ titulo, corpo: formulario });
  campo.entrada.focus();
  campo.entrada.select();
}

/**
 * Confirmação de ação irreversível: só libera depois de digitar o nome exato.
 * @param {{ titulo: string, texto: string, esperado: string, rotuloConfirmar: string }} opcoes
 * @returns {Promise<boolean>}
 */
export function confirmarDigitando({ titulo, texto, esperado, rotuloConfirmar }) {
  return new Promise((resolver) => {
    let confirmado = false;
    const campo = criarCampo({ rotulo: 'Nome da resenha', dica: `Digitar ${esperado} para confirmar.`, maximo: 80 });
    const botao = h(
      'button',
      { type: 'button', class: 'btn btn-perigo-cheio btn-grande btn-bloco', 'aria-disabled': 'true' },
      rotuloConfirmar,
    );
    const confere = () => chaveDeNome(campo.entrada.value) === chaveDeNome(esperado);
    campo.entrada.addEventListener('input', () => botao.setAttribute('aria-disabled', String(!confere())));
    const folha = abrirFolha({
      titulo,
      corpo: [h('p', { class: 'apoio' }, texto), campo.el, botao],
      aoFechar: () => resolver(confirmado),
    });
    botao.addEventListener('click', () => {
      if (!confere()) return;
      confirmado = true;
      folha.fechar();
    });
    campo.entrada.focus();
  });
}
