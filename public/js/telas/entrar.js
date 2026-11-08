// Entrar em resenha: convite recebido por link ou digitado, depois o apelido.
import { codigoConviteValido, normalizarCodigo } from '../../../compartilhado/codigos.js';
import { LIMITES } from '../../../compartilhado/nomes.js';
import { criarCampo } from '../componentes/campo.js';
import { desenharTopo } from '../componentes/topo.js';
import { repositorio } from '../dados/repositorio-navegador.js';
import { mensagemDeErro } from '../erros.js';
import { hora, plural, rotuloDia } from '../formatos.js';
import { caminhoResenha, limparFragmento, substituir } from '../roteador.js';
import { h, ocupar, trocarFilhos } from '../util.js';

const outrasFormas = () =>
  h(
    'div',
    { class: 'secao' },
    h('a', { class: 'btn btn-texto', href: '#/acesso/transferencia' }, 'Usar código de transferência'),
  );

export function telaEntrar(raiz, rota) {
  let ativo = true;
  desenharTopo({ titulo: 'Entrar em resenha', voltarPara: '#/' });

  /** @param {string | null} [mensagemInicial] */
  function formularioCodigo(mensagemInicial = null) {
    const campo = criarCampo({
      rotulo: 'Código do convite',
      classeEntrada: 'numeros',
      maximo: 20,
      obrigatorio: true,
      dica: 'Recebido do criador da resenha. O link do convite abre esta tela já preenchida.',
    });
    const botao = h('button', { type: 'submit', class: 'btn btn-primario btn-grande btn-bloco' }, 'Continuar');
    const formulario = h(
      'form',
      {
        class: 'tela',
        noValidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          const codigo = normalizarCodigo(campo.entrada.value);
          if (!codigoConviteValido(codigo)) return campo.definirErro('Convite inválido ou expirado.');
          campo.definirErro(null);
          ocupar(botao, 'Consultando…', async () => {
            try {
              const convite = await repositorio.consultarConvite(codigo);
              if (ativo) trocarFilhos(raiz, formularioApelido(codigo, convite));
            } catch (erro) {
              campo.definirErro(mensagemDeErro(erro, 'Falha ao consultar o convite.'));
            }
          });
        },
      },
      h('h2', { class: 'titulo-tela' }, 'Código do convite'),
      campo.el,
      botao,
      outrasFormas(),
    );
    if (mensagemInicial) queueMicrotask(() => campo.definirErro(mensagemInicial));
    return { formulario, campo };
  }

  function formularioApelido(codigo, convite) {
    const campo = criarCampo({
      rotulo: 'Apelido',
      maximo: LIMITES.apelido,
      obrigatorio: true,
      dica: 'Identifica quem lança cada partida. Cada apelido é único na resenha.',
    });
    const erro = h('p', { class: 'campo-mensagem', role: 'alert' });
    const botao = h('button', { type: 'submit', class: 'btn btn-primario btn-grande btn-bloco' }, 'Entrar na resenha');
    const formulario = h(
      'form',
      {
        class: 'tela',
        noValidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          erro.textContent = '';
          if (!campo.entrada.value.trim()) return campo.definirErro('Informar o apelido.');
          campo.definirErro(null);
          ocupar(botao, 'Entrando…', async () => {
            try {
              const { resenhaId } = await repositorio.aceitarConvite(codigo, campo.entrada.value);
              substituir(caminhoResenha(resenhaId));
            } catch (excecao) {
              const falha = /** @type {any} */ (excecao);
              const mensagem = mensagemDeErro(falha, 'Falha ao entrar na resenha.');
              if (falha?.campo === 'apelido') campo.definirErro(mensagem);
              else erro.textContent = mensagem;
            }
          });
        },
      },
      h('h2', { class: 'titulo-tela' }, convite.resenhaNome),
      h(
        'p',
        { class: 'apoio' },
        `${plural(convite.membros, 'participante', 'participantes')} · convite válido até ${rotuloDia(convite.expiraEm)}, ${hora(convite.expiraEm)}`,
      ),
      campo.el,
      erro,
      botao,
    );
    queueMicrotask(() => campo.entrada.focus());
    return formulario;
  }

  const codigoDoLink = rota.codigo ? normalizarCodigo(rota.codigo) : null;
  if (rota.codigo) limparFragmento('#/entrar');

  if (codigoDoLink && codigoConviteValido(codigoDoLink)) {
    trocarFilhos(raiz, h('div', { class: 'tela' }, h('div', { class: 'esqueleto esqueleto-bloco' })));
    repositorio.consultarConvite(codigoDoLink).then(
      (convite) => ativo && trocarFilhos(raiz, formularioApelido(codigoDoLink, convite)),
      (falha) => {
        if (!ativo) return;
        const { formulario } = formularioCodigo(mensagemDeErro(falha, 'Convite inválido ou expirado.'));
        trocarFilhos(raiz, formulario);
      },
    );
  } else {
    const { formulario, campo } = formularioCodigo(codigoDoLink ? 'Convite inválido ou expirado.' : null);
    trocarFilhos(raiz, formulario);
    campo.entrada.focus();
  }

  return {
    desmontar() {
      ativo = false;
    },
  };
}
