import { LIMITES, validarNome } from '../../../compartilhado/nomes.js';
import { chamar, ErroApi, ErroLocal } from './api.js';
import { envioEmCurso, prepararEdicao, prepararLancamento } from './operacoes.js';
import { criarSincronizador } from './sincronizacao.js';
import { criarFluxo } from './sse.js';
import { montarVisao } from './visao.js';

const AVISOS_RETIDOS = 20;

/**
 * Controlador de uma resenha aberta: junta a visão, o motor de sincronização, o fluxo de eventos e as ações das telas.
 * @param {{ resenha: import('./tipos.js').ResenhaLocal, deps: import('./tipos.js').DependenciasCompletas,
 *   esquecerLocal: () => Promise<void>, aoFechar: () => void }} opcoes
 */
export async function abrirControlador({ resenha: inicial, deps, esquecerLocal, aoFechar }) {
  const { fetchImpl, armazenamento, agora, novoId, agendar, pagina, canal } = deps;
  const resenhaId = inicial.id;
  let resenha = inicial;
  let fechado = false;
  let despachoAgendado = false;
  /** @type {import('./tipos.js').Visao} */
  let visaoAtual;
  /** @type {Set<(visao: import('./tipos.js').Visao) => void>} */
  const ouvintes = new Set();
  /** @type {Set<(aviso: import('./tipos.js').Aviso) => void>} */
  const ouvintesAvisos = new Set();
  /** @type {import('./tipos.js').Aviso[]} */
  let avisosPendentes = [];

  /** @template T @param {(valor: T) => void} fn @param {T} valor */
  const chamarSeguro = (fn, valor) => {
    try {
      fn(valor);
    } catch (erro) {
      queueMicrotask(() => {
        throw erro;
      });
    }
  };

  /** @param {ReturnType<typeof motor.situacao>} s @param {number} pendentes @returns {import('./tipos.js').SyncVisao} */
  function calcularSync(s, pendentes) {
    const rejeitada = avisosPendentes.find((a) => a.tipo === 'rejeitada');
    /** @type {import('./tipos.js').SyncVisao['estado']} */
    let estado = 'sincronizado';
    /** @type {string | null} */
    let mensagem = null;
    if (s.semAcesso) [estado, mensagem] = ['sem-acesso', s.mensagem];
    else if (s.offline) [estado, mensagem] = ['offline', s.mensagem];
    else if (s.erro) [estado, mensagem] = ['erro', s.erro];
    else if (rejeitada) [estado, mensagem] = ['erro', rejeitada.mensagem];
    else if (pendentes) [estado, mensagem] = ['pendente', s.mensagem];
    return { estado, pendentes, ultimaSincronizacaoEm: s.ultimaSincronizacaoEm, mensagem };
  }

  function reconstruir() {
    const { estado, fila } = motor.local();
    const s = motor.situacao();
    const base = estado ?? {
      seq: 0,
      resenha: { id: resenhaId, nome: resenha.nome, seq: 0, criadaEm: 0 },
      eu: resenha.eu,
      membros: [],
      competidores: [],
      partidas: {},
    };
    visaoAtual = {
      ...montarVisao(base, fila, estado?.eu ?? resenha.eu),
      sync: calcularSync(s, fila.length),
      carregando: !estado && s.ultimaSincronizacaoEm === null && !s.offline && !s.semAcesso,
    };
  }

  /** A visão fica atualizada na hora; os assinantes recebem uma única chamada por rajada de mudanças. */
  function atualizarVisao() {
    if (fechado) return;
    reconstruir();
    if (despachoAgendado) return;
    despachoAgendado = true;
    queueMicrotask(() => {
      despachoAgendado = false;
      for (const fn of [...ouvintes]) chamarSeguro(fn, visaoAtual);
    });
  }

  /** @param {import('./tipos.js').Aviso} aviso */
  function emitirAviso(aviso) {
    if (ouvintesAvisos.size) for (const fn of [...ouvintesAvisos]) chamarSeguro(fn, aviso);
    else avisosPendentes = [...avisosPendentes, aviso].slice(-AVISOS_RETIDOS);
    atualizarVisao();
  }

  const motor = criarSincronizador({
    resenhaId,
    deps,
    obterToken: () => resenha.token,
    aoMudar: atualizarVisao,
    aoGravar: () => {
      canal?.enviar({ resenhaId });
      atualizarVisao();
    },
    aoAviso: emitirAviso,
    aoSemAcesso: () => fluxo.fechar(),
  });

  const fluxo = criarFluxo({
    fetchImpl,
    caminho: `/api/resenhas/${resenhaId}/eventos`,
    obterToken: () => resenha.token,
    agendar,
    visivel: pagina.visivel,
    aoSeq: (seq) => {
      if (seq > (motor.local().estado?.seq ?? 0)) void motor.sincronizar();
    },
    aoRevogado: motor.marcarSemAcesso,
    aoSemAcesso: motor.marcarSemAcesso,
    aoReconectar: () => void motor.retomar(),
    aoSondar: () => void motor.retomar(),
  });

  const sairCanal = canal?.ouvir(async (mensagem) => {
    if (fechado || mensagem.resenhaId !== resenhaId) return;
    await motor.carregar();
    atualizarVisao();
  });

  const sairPagina = pagina.assinar((evento) => {
    if (fechado) return;
    if (evento === 'oculta') {
      motor.pausar();
      fluxo.fechar();
    } else if (evento === 'offline') motor.notificarOffline();
    else {
      void motor.retomar();
      if (pagina.visivel() && !motor.situacao().semAcesso) fluxo.abrir();
    }
  });

  const contexto = () => ({ competidores: visaoAtual.competidores, agora, novoId });
  const exigirAberto = () => {
    if (fechado) throw new Error('Controlador fechado.');
    if (motor.situacao().semAcesso) throw new ErroLocal('SEM_ACESSO', 'Acesso à resenha encerrado neste aparelho.');
  };
  /** @param {string} partidaId */
  const buscarPartida = (partidaId) => {
    const partida = visaoAtual.partidas.find((p) => p.id === partidaId);
    if (!partida) throw new ErroLocal('PARTIDA_NAO_ENCONTRADA', 'Partida não encontrada.');
    return partida;
  };
  /** @param {{ id: string, rev: number }} partida */
  const revisaoEsperadaDe = (partida) =>
    partida.rev + motor.local().fila.filter((o) => o.partidaId === partida.id).length;
  /** Criação que ainda não saiu do aparelho; a que está sendo enviada (por qualquer aba) já não pode ser alterada. */
  const criacaoPendente = (/** @type {import('./tipos.js').Operacao[]} */ fila, /** @type {string} */ partidaId) =>
    fila.find((o) => o.tipo === 'criar' && o.partidaId === partidaId && !envioEmCurso(o, agora()));

  /** @returns {Promise<void>} */
  const ressincronizar = () => motor.forcar();

  /** @param {string} metodo @param {string} caminho @param {unknown} [corpo] */
  async function api(metodo, caminho, corpo) {
    try {
      return await chamar(metodo, caminho, { corpo, token: resenha.token, fetchImpl });
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 401) motor.marcarSemAcesso();
      throw erro;
    }
  }
  /** @param {string} texto @param {number} maximo @param {string} campo */
  function nomeValido(texto, maximo, campo) {
    const r = validarNome(texto, maximo);
    if (!r.ok) throw new ErroLocal('NOME_INVALIDO', r.mensagem, campo);
    return r.valor;
  }
  const base = `/api/resenhas/${resenhaId}`;

  const admin = {
    async gerarConvite() {
      const r = await api('POST', `${base}/convite`);
      return { codigo: r.codigo, expiraEm: r.expiraEm };
    },
    async revogarConvite() {
      await api('DELETE', `${base}/convite`);
    },
    /** @param {string} nome */
    async renomearResenha(nome) {
      await api('PATCH', base, { nome: nomeValido(nome, LIMITES.nomeResenha, 'nome') });
      await ressincronizar();
    },
    /** @param {string} id @param {string} nome */
    async renomearCompetidor(id, nome) {
      await api('PATCH', `${base}/competidores/${encodeURIComponent(id)}`, {
        nome: nomeValido(nome, LIMITES.competidor, 'nome'),
      });
      await ressincronizar();
    },
    async rotacionarChave() {
      const r = await api('POST', `${base}/chave-recuperacao`);
      return { chaveRecuperacao: r.chaveRecuperacao };
    },
    async gerarTransferencia() {
      const r = await api('POST', '/api/acesso/transferencia');
      return { codigo: r.codigo, expiraEm: r.expiraEm };
    },
    /** @param {string} membroId */
    async removerMembro(membroId) {
      await api('DELETE', `${base}/membros/${encodeURIComponent(membroId)}`);
      await ressincronizar();
    },
    async sairDaResenha() {
      await api('DELETE', `${base}/membros/eu`);
      await esquecerLocal();
    },
    async sairDesteAparelho() {
      await api('DELETE', '/api/sessao');
      await esquecerLocal();
    },
    async excluirResenha() {
      await api('DELETE', base);
      await esquecerLocal();
    },
  };

  await motor.carregar();
  reconstruir();
  if (pagina.visivel()) fluxo.abrir();
  void motor.sincronizar();

  return {
    visao: () => visaoAtual,
    /** @param {(visao: import('./tipos.js').Visao) => void} fn */
    assinar(fn) {
      ouvintes.add(fn);
      queueMicrotask(() => {
        if (ouvintes.has(fn)) chamarSeguro(fn, visaoAtual);
      });
      return () => void ouvintes.delete(fn);
    },
    /** @param {(aviso: import('./tipos.js').Aviso) => void} fn */
    assinarAvisos(fn) {
      ouvintesAvisos.add(fn);
      const retidos = avisosPendentes;
      avisosPendentes = [];
      if (retidos.length) {
        queueMicrotask(() => {
          for (const aviso of retidos) if (ouvintesAvisos.has(fn)) chamarSeguro(fn, aviso);
        });
        atualizarVisao();
      }
      return () => void ouvintesAvisos.delete(fn);
    },

    /** @param {any} dados */
    async lancar(dados) {
      exigirAberto();
      const corpo = prepararLancamento(dados, contexto());
      const partidaId = novoId();
      await motor.anexar({ idOp: novoId(), tipo: 'criar', partidaId, corpo, criadaEm: agora(), tentativas: 0 });
      void motor.sincronizar();
      return { partidaId };
    },

    /**
     * Revisão que a partida terá quando a fila local for confirmada: a do servidor mais as operações próprias ainda
     * pendentes. Confirmar uma operação própria não muda o valor; uma alteração de outro aparelho muda.
     * @param {string} partidaId
     */
    revisaoEsperada(partidaId) {
      return revisaoEsperadaDe(buscarPartida(partidaId));
    },

    /**
     * `revBase` é a `revisaoEsperada` com que a folha de edição abriu: se a partida mudou desde então, nada é enfileirado.
     * @param {string} partidaId @param {any} mudancas @param {{ revBase?: number }} [opcoes]
     */
    async editar(partidaId, mudancas, { revBase } = {}) {
      exigirAberto();
      const partida = buscarPartida(partidaId);
      if (revBase !== undefined && revBase !== revisaoEsperadaDe(partida)) {
        throw new ErroLocal('CONFLITO_REVISAO', 'Partida alterada em outro aparelho. Valores atualizados.');
      }
      const corpo = prepararEdicao(partida, mudancas, contexto());
      if (!Object.keys(corpo).length) return;
      await motor.alterar((_, fila) => {
        const criacao = criacaoPendente(fila, partidaId);
        if (criacao) criacao.corpo = { ...criacao.corpo, ...corpo };
        else
          fila.push({
            idOp: novoId(),
            tipo: 'editar',
            partidaId,
            corpo,
            rev: partida.rev,
            criadaEm: agora(),
            tentativas: 0,
          });
        return { fila };
      });
      void motor.sincronizar();
    },

    /** @param {string} partidaId */
    async excluir(partidaId) {
      exigirAberto();
      const partida = buscarPartida(partidaId);
      /** @type {import('./tipos.js').Operacao[] | null} */
      let removidas = null;
      await motor.alterar((_, fila) => {
        if (criacaoPendente(fila, partidaId)) {
          removidas = fila.filter((o) => o.partidaId === partidaId);
          return { fila: fila.filter((o) => o.partidaId !== partidaId) };
        }
        fila.push({
          idOp: novoId(),
          tipo: 'excluir',
          partidaId,
          corpo: {},
          rev: partida.rev,
          criadaEm: agora(),
          tentativas: 0,
        });
        return { fila };
      });
      void motor.sincronizar();
      let desfeito = false;
      return {
        async desfazer() {
          if (desfeito || fechado) return;
          desfeito = true;
          await motor.alterar((estado, fila) => {
            if (removidas) fila.push(...removidas);
            else {
              const rev = estado?.partidas[partidaId]?.rev ?? partida.rev;
              fila.push({
                idOp: novoId(),
                tipo: 'restaurar',
                partidaId,
                corpo: {},
                rev,
                criadaEm: agora(),
                tentativas: 0,
              });
            }
            return { fila };
          });
          void motor.sincronizar();
        },
      };
    },

    ressincronizar,
    admin,

    /** Uso do repositório: relê o token gravado (novo login na mesma resenha) e reabre o fluxo. */
    async retomarAcesso() {
      resenha = (await armazenamento.lerResenha(resenhaId)) ?? resenha;
      fluxo.fechar();
      if (pagina.visivel()) fluxo.abrir();
      void motor.forcar();
    },

    fechar() {
      if (fechado) return;
      fechado = true;
      motor.parar();
      fluxo.fechar();
      sairPagina();
      sairCanal?.();
      ouvintes.clear();
      ouvintesAvisos.clear();
      aoFechar();
    },
  };
}
