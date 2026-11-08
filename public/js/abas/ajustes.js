// Aba Ajustes: dados da resenha, participantes, convite, acesso em outro aparelho e saída.
import { formatarCodigo } from '../../../compartilhado/codigos.js';
import { LIMITES } from '../../../compartilhado/nomes.js';
import { avisar } from '../componentes/aviso.js';
import { blocoSegredo } from '../componentes/bloco-segredo.js';
import { abrirFolha, confirmar } from '../componentes/folha.js';
import { confirmarDigitando, folhaTexto } from '../componentes/folha-formulario.js';
import { mensagemDeErro } from '../erros.js';
import { hora, plural, rotuloDia } from '../formatos.js';
import { h, ocupar, trocarFilhos } from '../util.js';

const PAPEIS = { criador: 'Criador', participante: 'Participante' };

/**
 * @param {{ controlador: any, aoEncerrar: (mensagem: string) => void }} contexto
 */
export function criarAbaAjustes({ controlador, aoEncerrar }) {
  /** @type {import('../dados/tipos.js').Visao} */
  let visao;
  let assinatura = '';
  /** @type {{ convite: { codigo: string, expiraEm: number } | null, transferencia: { codigo: string, expiraEm: number } | null }} */
  const segredos = { convite: null, transferencia: null };
  const el = h('div', { class: 'tela' });

  const falha = (erro, padrao) => avisar({ texto: mensagemDeErro(erro, padrao), tom: 'erro' });
  const validoAte = (expiraEm) => `${rotuloDia(expiraEm)}, ${hora(expiraEm)}`;

  /** @param {string} rotulo @param {(alvo: any) => any} aoClicar @param {string} [classe] @param {string} [descricao] */
  const botao = (rotulo, aoClicar, classe = '', descricao) =>
    h(
      'button',
      {
        type: 'button',
        class: `btn ${classe}`.trim(),
        'aria-label': descricao,
        onClick: (e) => aoClicar(e.currentTarget),
      },
      rotulo,
    );

  /** @param {string} titulo @param {string | null} [apoio] @param {Node[]} [acoes] */
  const linha = (titulo, apoio, acoes = []) =>
    h(
      'li',
      { class: 'linha' },
      h('span', { class: 'linha-texto' }, h('strong', null, titulo), apoio && h('small', null, apoio)),
      acoes.length > 0 && h('span', { class: 'linha-acoes' }, acoes),
    );

  const secao = (titulo, ...conteudo) =>
    h('section', { class: 'secao' }, h('h2', { class: 'secao-titulo' }, titulo), ...conteudo);

  /** Executa uma ação administrativa com botão ocupado e erro em aviso. */
  const executar = (alvo, textoOcupado, acao, padraoErro) =>
    ocupar(alvo, textoOcupado, async () => {
      try {
        await acao();
      } catch (erro) {
        falha(erro, padraoErro);
      }
    });

  function pendentesAviso() {
    const n = visao.sync.pendentes;
    return n > 0
      ? ` ${plural(n, 'partida pendente de envio será descartada', 'partidas pendentes de envio serão descartadas')}.`
      : '';
  }

  function secaoResenha(criador) {
    return secao(
      'Resenha',
      h(
        'ul',
        { class: 'lista-linhas' },
        linha(
          visao.resenha.nome,
          'Nome da resenha',
          criador
            ? [
                botao('Renomear', () =>
                  folhaTexto({
                    titulo: 'Renomear resenha',
                    rotulo: 'Nome da resenha',
                    valor: visao.resenha.nome,
                    maximo: LIMITES.nomeResenha,
                    rotuloConfirmar: 'Salvar',
                    aoSalvar: (nome) => controlador.admin.renomearResenha(nome),
                  }),
                ),
              ]
            : [],
        ),
        linha(visao.eu.apelido, `Apelido neste aparelho · ${PAPEIS[visao.eu.papel]}`),
        criador &&
          visao.competidores.length > 0 &&
          linha('Nomes nas partidas', 'Corrigir a grafia em todas as partidas', [
            botao('Gerenciar', abrirNomesDasPartidas, '', 'Gerenciar nomes nas partidas'),
          ]),
      ),
    );
  }

  function secaoParticipantes(criador) {
    return secao(
      `Participantes · ${visao.membros.length}`,
      h(
        'ul',
        { class: 'lista-linhas' },
        visao.membros.map((m) => {
          const proprio = m.id === visao.eu.membroId;
          const removivel = criador && !proprio && m.papel !== 'criador';
          return linha(
            m.apelido,
            proprio ? `${PAPEIS[m.papel]} · Participante atual` : PAPEIS[m.papel],
            removivel
              ? [
                  botao(
                    'Remover participante',
                    async (alvo) => {
                      const ok = await confirmar({
                        titulo: 'Remover participante',
                        texto: `${m.apelido} perde o acesso a esta resenha. As partidas já lançadas permanecem.`,
                        rotuloConfirmar: 'Remover',
                        perigo: true,
                      });
                      if (!ok) return;
                      await executar(
                        alvo,
                        'Removendo…',
                        async () => {
                          await controlador.admin.removerMembro(m.id);
                          avisar({ texto: 'Participante removido.' });
                        },
                        'Falha ao remover o participante.',
                      );
                    },
                    'btn-perigo',
                  ),
                ]
              : [],
          );
        }),
      ),
    );
  }

  function abrirNomesDasPartidas() {
    const folha = abrirFolha({
      titulo: 'Nomes nas partidas',
      corpo: [
        h('p', { class: 'apoio' }, 'Renomear corrige o nome em todas as partidas que o usam.'),
        h(
          'ul',
          { class: 'lista-linhas' },
          visao.competidores.map((c) =>
            linha(c.nome, null, [
              botao('Renomear', () => {
                folha.fechar();
                folhaTexto({
                  titulo: 'Renomear',
                  rotulo: 'Nome',
                  valor: c.nome,
                  maximo: LIMITES.competidor,
                  rotuloConfirmar: 'Salvar',
                  aoSalvar: (nome) => controlador.admin.renomearCompetidor(c.id, nome),
                });
              }),
            ]),
          ),
        ),
      ],
    });
  }

  function secaoConvite() {
    const convite = segredos.convite;
    const link = convite ? `${location.origin}/#/c/${formatarCodigo(convite.codigo)}` : '';
    return secao(
      'Convite',
      h(
        'p',
        { class: 'apoio' },
        'Quem abrir o link escolhe um apelido e entra na resenha. Vale por 7 dias e só um convite fica ativo.',
      ),
      h(
        'div',
        { class: 'acao-dupla' },
        botao(
          convite ? 'Gerar novo convite' : 'Gerar convite',
          (alvo) =>
            executar(
              alvo,
              'Gerando…',
              async () => {
                segredos.convite = await controlador.admin.gerarConvite();
                desenhar(true, 'convite');
              },
              'Falha ao gerar o convite.',
            ),
          'btn-primario',
        ),
        botao('Revogar convite', (alvo) =>
          executar(
            alvo,
            'Revogando…',
            async () => {
              await controlador.admin.revogarConvite();
              segredos.convite = null;
              desenhar(true);
              avisar({ texto: 'Convite revogado.' });
            },
            'Falha ao revogar o convite.',
          ),
        ),
      ),
      convite &&
        blocoSegredo({
          marca: 'convite',
          rotulo: 'Link de convite',
          valor: link,
          exibicao: link.replace(/^https?:\/\//, ''),
          apoio: `Válido até ${validoAte(convite.expiraEm)}. Substitui o convite anterior.`,
          compartilhavel: {
            title: 'Convite para a resenha',
            text: `Convite para ${visao.resenha.nome} no Partidou.`,
            url: link,
          },
        }),
    );
  }

  function gerarTransferencia(alvo) {
    return executar(
      alvo,
      'Gerando…',
      async () => {
        segredos.transferencia = await controlador.admin.gerarTransferencia();
        desenhar(true, 'transferencia');
      },
      'Falha ao gerar o código.',
    );
  }

  function botaoDeSaida(rotulo, texto, acao, mensagem) {
    return botao(
      rotulo,
      async (alvo) => {
        const ok = await confirmar({
          titulo: rotulo,
          texto: texto + pendentesAviso(),
          rotuloConfirmar: rotulo,
        });
        if (!ok) return;
        await executar(
          alvo,
          'Saindo…',
          async () => {
            await acao();
            aoEncerrar(mensagem);
          },
          'Falha ao concluir a operação.',
        );
      },
      'btn-bloco',
    );
  }

  function botaoExcluir() {
    return botao(
      'Excluir resenha',
      async (alvo) => {
        const ok = await confirmarDigitando({
          titulo: 'Excluir resenha',
          texto: `A resenha e todas as partidas são apagadas para todos os participantes. Não há como desfazer.${pendentesAviso()}`,
          esperado: visao.resenha.nome,
          rotuloConfirmar: 'Excluir resenha',
        });
        if (!ok) return;
        await executar(
          alvo,
          'Excluindo…',
          async () => {
            await controlador.admin.excluirResenha();
            aoEncerrar('Resenha excluída.');
          },
          'Falha ao excluir a resenha.',
        );
      },
      'btn-perigo btn-bloco',
    );
  }

  function secaoAcesso() {
    const { transferencia } = segredos;
    return secao(
      'Acesso',
      h(
        'ul',
        { class: 'lista-linhas' },
        linha('Código de transferência', 'Abre a resenha em outro navegador ou no app instalado. Vale 10 minutos.', [
          botao('Gerar', gerarTransferencia, '', 'Gerar código de transferência'),
        ]),
      ),
      transferencia &&
        blocoSegredo({
          marca: 'transferencia',
          rotulo: 'Código de transferência',
          valor: transferencia.codigo,
          exibicao: formatarCodigo(transferencia.codigo),
          apoio: `Válido até ${hora(transferencia.expiraEm)}. Informar em Entrar em resenha, Código de transferência.`,
        }),
    );
  }

  function secaoSaida(criador) {
    return secao(
      'Saída',
      botaoDeSaida(
        'Remover do aparelho',
        criador
          ? 'A resenha deixa de aparecer neste aparelho. Sem outro aparelho com acesso, a administração não pode ser recuperada: antes de remover, entrar em outro aparelho com um código de transferência.'
          : 'A resenha deixa de aparecer neste aparelho. Para voltar, é preciso um código de transferência gerado em outro aparelho.',
        () => controlador.admin.sairDesteAparelho(),
        'Resenha removida deste aparelho.',
      ),
      !criador &&
        botaoDeSaida(
          'Sair da resenha',
          'O apelido deixa a lista de participantes. As partidas lançadas permanecem.',
          () => controlador.admin.sairDaResenha(),
          'Saída da resenha concluída.',
        ),
    );
  }

  function secaoExclusao() {
    return secao(
      'Exclusão',
      h('p', { class: 'apoio' }, 'Apaga a resenha e todas as partidas para todos os participantes. Sem desfazer.'),
      botaoExcluir(),
    );
  }

  /** @param {boolean} [forcar] @param {string} [rolarPara] segredo recém-gerado, levado à vista (fica abaixo da lista) */
  function desenhar(forcar = false, rolarPara) {
    if (!visao) return;
    const agora = Date.now();
    for (const chave of ['convite', 'transferencia']) {
      if (segredos[chave] && segredos[chave].expiraEm <= agora) segredos[chave] = null;
    }
    const nova = JSON.stringify([
      visao.resenha,
      visao.eu,
      visao.membros,
      visao.competidores.length,
      visao.sync.pendentes,
      segredos,
    ]);
    if (!forcar && nova === assinatura) return;
    assinatura = nova;
    const criador = visao.eu.papel === 'criador';
    trocarFilhos(
      el,
      secaoResenha(criador),
      criador && secaoConvite(),
      secaoParticipantes(criador),
      secaoAcesso(),
      secaoSaida(criador),
      criador && secaoExclusao(),
      h('p', { class: 'rodape-app' }, 'Partidou · Jogou? Registrou.'),
    );
    if (rolarPara) {
      const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.querySelector(`[data-segredo="${rolarPara}"]`)?.scrollIntoView({
        behavior: reduzido ? 'auto' : 'smooth',
        block: 'center',
      });
    }
  }

  return {
    el,
    /** @param {any} nova */
    atualizar(nova) {
      visao = nova;
      desenhar();
    },
  };
}
