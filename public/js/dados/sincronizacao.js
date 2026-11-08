import { chamar, ErroApi, ErroRede } from './api.js';
import { operacaoJaAplicada } from './operacoes.js';
import { ajustarRevs, aplicarDelta, aplicarResposta } from './visao.js';

const ATRASOS_S = [2, 5, 15, 30, 60];
const JITTER_MAXIMO = 0.2;
const RETRY_AFTER_PADRAO_S = 5;
const RETRY_AFTER_MAXIMO_S = 120;
const MENSAGEM_CONFLITO = 'Partida alterada em outro aparelho. A alteração não foi aplicada.';
const MENSAGEM_CONFLITO_EXCLUIDA = 'Partida excluída em outro aparelho. A alteração não foi aplicada.';
const MENSAGEM_OFFLINE = 'Sem conexão com o servidor. As alterações ficam salvas neste aparelho.';
const MENSAGEM_LIMITE = 'Muitas requisições ao servidor. Nova tentativa em instantes.';
const MENSAGEM_SEM_ACESSO = 'Acesso à resenha encerrado neste aparelho.';

/**
 * Exclusão mútua em memória, com a mesma assinatura de `navigator.locks.request` usada aqui.
 * @returns {import('./tipos.js').Travas}
 */
export function criarMutexMemoria() {
  /** @type {Map<string, Promise<unknown>>} */
  const caudas = new Map();
  return {
    request(nome, trabalho) {
      const execucao = (caudas.get(nome) ?? Promise.resolve()).then(trabalho);
      caudas.set(
        nome,
        execucao.catch(() => {}),
      );
      return execucao;
    },
  };
}

/**
 * Fila, envio e delta de uma resenha. Mantém um espelho de estado e fila; toda mudança passa por `alterar`,
 * que é atômica no armazenamento e, por isso, segura contra o ciclo de envio e contra outra aba.
 * @param {{ resenhaId: string, deps: import('./tipos.js').DependenciasCompletas,
 *   obterToken: () => string, aoMudar: () => void, aoGravar: () => void, aoAviso: (aviso: import('./tipos.js').Aviso) => void, aoSemAcesso: () => void }} opcoes
 */
export function criarSincronizador({ resenhaId, deps, obterToken, aoMudar, aoGravar, aoAviso, aoSemAcesso }) {
  const { fetchImpl, armazenamento, agora, agendar, aleatorio, travas, pagina } = deps;
  /** @type {{ estado: import('./tipos.js').EstadoLocal | null, fila: import('./tipos.js').Operacao[] }} */
  let local = { estado: null, fila: [] };
  const situacao = {
    semAcesso: false,
    offline: false,
    /** @type {string | null} */ erro: null,
    /** @type {number | null} */ ultimaSincronizacaoEm: null,
    /** @type {string | null} */ mensagem: null,
    limitado: false,
  };
  let parado = false;
  let falhas = 0;
  /** @type {Promise<void> | null} */
  let ciclo = null;
  let repetir = false;
  let repetirForcado = false;
  /** @type {(() => void) | null} */
  let cancelarRetentativa = null;

  /** @param {string} caminho @param {string} [metodo] @param {unknown} [corpo] */
  const chamarResenha = (caminho, metodo = 'GET', corpo = undefined) =>
    chamar(metodo, `/api/resenhas/${resenhaId}${caminho}`, { corpo, token: obterToken(), fetchImpl });

  /** @param {(estado: import('./tipos.js').EstadoLocal | null, fila: import('./tipos.js').Operacao[]) => import('./tipos.js').MudancaLocal | void} fn */
  async function alterar(fn) {
    local = await armazenamento.atualizar(resenhaId, fn);
    aoGravar();
    return local;
  }

  function cancelarTemporizador() {
    cancelarRetentativa?.();
    cancelarRetentativa = null;
  }

  /** @param {number} [msFixo] */
  function agendarRetentativa(msFixo) {
    cancelarTemporizador();
    if (parado || situacao.semAcesso || !pagina.visivel()) return;
    const base = ATRASOS_S[Math.min(Math.max(falhas - 1, 0), ATRASOS_S.length - 1)] * 1000;
    const ms = msFixo ?? Math.round(base * (1 - aleatorio() * JITTER_MAXIMO));
    cancelarRetentativa = agendar(() => {
      cancelarRetentativa = null;
      void sincronizar();
    }, ms);
  }

  /** @param {string} mensagem @param {number} [msFixo] */
  function marcarOffline(mensagem, msFixo) {
    situacao.offline = true;
    situacao.mensagem = mensagem;
    falhas += 1;
    agendarRetentativa(msFixo);
    aoMudar();
  }

  function marcarSemAcesso() {
    if (situacao.semAcesso) return;
    situacao.semAcesso = true;
    situacao.offline = false;
    situacao.limitado = false;
    situacao.mensagem = MENSAGEM_SEM_ACESSO;
    cancelarTemporizador();
    aoSemAcesso();
    aoAviso({ tipo: 'sem-acesso', mensagem: MENSAGEM_SEM_ACESSO });
    aoMudar();
  }

  /**
   * Trata a falha de uma chamada. Devolve `'parar'` quando o ciclo deve terminar e `'seguir'` para erro de negócio.
   * @param {unknown} erro
   * @returns {'parar' | 'seguir'}
   */
  function tratarFalha(erro) {
    if (erro instanceof ErroRede) {
      marcarOffline(MENSAGEM_OFFLINE);
      return 'parar';
    }
    if (erro instanceof ErroApi && erro.status === 429) {
      const segundos = Math.min(erro.retryAfter ?? RETRY_AFTER_PADRAO_S, RETRY_AFTER_MAXIMO_S);
      // O aparelho está online: o limite do servidor não é falta de conexão.
      Object.assign(situacao, { limitado: true, offline: false, mensagem: MENSAGEM_LIMITE });
      falhas += 1;
      agendarRetentativa(segundos * 1000);
      aoMudar();
      return 'parar';
    }
    if (erro instanceof ErroApi && erro.status === 401) {
      marcarSemAcesso();
      return 'parar';
    }
    if (erro instanceof ErroApi) return 'seguir';
    throw erro;
  }

  /** @param {import('./tipos.js').Operacao} op */
  function enviarOperacao(op) {
    const base = `/partidas/${op.partidaId}`;
    if (op.tipo === 'criar') return chamarResenha('/partidas', 'POST', { ...op.corpo, id: op.partidaId });
    if (op.tipo === 'editar') return chamarResenha(base, 'PATCH', { rev: op.rev, ...op.corpo });
    if (op.tipo === 'excluir') return chamarResenha(`${base}?rev=${op.rev}`, 'DELETE');
    return chamarResenha(`${base}/restaurar`, 'POST', { rev: op.rev });
  }

  /**
   * Descarta a operação (e, conforme o caso, as dependentes) e avisa a tela. Conflito cujo alvo já é o estado atual
   * conta como aplicado: as operações seguintes seguem, com a revisão atual.
   * @param {import('./tipos.js').Operacao} op
   * @param {ErroApi} erro
   */
  async function descartar(op, erro) {
    const conflito = erro.status === 409 && erro.codigo === 'CONFLITO_REVISAO';
    if (conflito && erro.atual && operacaoJaAplicada(op, erro.atual)) {
      await confirmar(op, { partida: erro.atual });
      return;
    }
    await alterar((estado, fila) => {
      const dependentes = conflito || op.tipo === 'criar';
      const restante = fila.filter((o) => o.idOp !== op.idOp && !(dependentes && o.partidaId === op.partidaId));
      const novoEstado = conflito && erro.atual ? aplicarResposta(estado, { partida: erro.atual }) : estado;
      return { estado: novoEstado, fila: restante };
    });
    aoAviso({
      tipo: conflito ? 'conflito' : 'rejeitada',
      mensagem: conflito ? (erro.atual?.excluida ? MENSAGEM_CONFLITO_EXCLUIDA : MENSAGEM_CONFLITO) : erro.mensagem,
      partidaId: op.partidaId,
    });
  }

  /** @param {import('./tipos.js').Operacao} op @param {any} resposta */
  async function confirmar(op, resposta) {
    await alterar((estado, fila) => {
      const restante = fila.filter((o) => o.idOp !== op.idOp);
      return {
        estado: aplicarResposta(estado, resposta ?? {}),
        fila: resposta?.partida ? ajustarRevs(restante, resposta.partida) : restante,
      };
    });
  }

  /**
   * Grava, na mesma transação que lê a fila, a marca de que a criação está sendo enviada: outra aba só vê a
   * criação como alterável antes dela. Devolve a operação gravada, ou null se outra aba a removeu.
   * @param {import('./tipos.js').Operacao} op
   * @param {number | undefined} desde
   * @returns {Promise<import('./tipos.js').Operacao | null>}
   */
  async function marcarEnvio(op, desde) {
    /** @type {import('./tipos.js').Operacao | null} */
    let atual = null;
    await alterar((_, fila) => {
      const alvo = fila.find((o) => o.idOp === op.idOp);
      if (!alvo) return;
      if (desde === undefined) delete alvo.enviandoDesde;
      else alvo.enviandoDesde = desde;
      atual = { ...alvo };
      return { fila };
    });
    return atual;
  }

  /** @returns {Promise<'ok' | 'parar'>} */
  async function enviarFila() {
    for (;;) {
      if (parado) return 'parar';
      const primeira = (await armazenamento.listarFila(resenhaId))[0];
      if (!primeira) return 'ok';
      const op = primeira.tipo === 'criar' ? await marcarEnvio(primeira, agora()) : primeira;
      if (!op) continue;
      try {
        await confirmar(op, await enviarOperacao(op));
      } catch (erro) {
        if (op.tipo === 'criar') await marcarEnvio(op, undefined);
        if (erro instanceof ErroApi && erro.status === 404) {
          // 404 vale tanto para resenha inacessível quanto para partida inexistente: a leitura do estado desempata.
          if ((await buscarDelta()) !== 'ok') return 'parar';
          await descartar(op, erro);
          continue;
        }
        if (tratarFalha(erro) === 'parar') {
          if (erro instanceof ErroRede)
            await alterar((_, fila) => ({
              fila: fila.map((o) => (o.idOp === op.idOp ? { ...o, tentativas: o.tentativas + 1 } : o)),
            }));
          return 'parar';
        }
        await descartar(op, /** @type {ErroApi} */ (erro));
        continue;
      }
      falhas = 0;
    }
  }

  /** Mantém nome e papel da resenha local em dia com o servidor. */
  async function atualizarResenhaLocal() {
    const [resenha, estado] = [await armazenamento.lerResenha(resenhaId), local.estado];
    if (!resenha || !estado) return;
    if (
      resenha.nome === estado.resenha.nome &&
      resenha.eu.papel === estado.eu.papel &&
      resenha.eu.apelido === estado.eu.apelido
    )
      return;
    await armazenamento.gravarResenha({ ...resenha, nome: estado.resenha.nome, eu: estado.eu });
  }

  /** @returns {Promise<'ok' | 'falha'>} */
  async function buscarDelta() {
    const guardado = await armazenamento.lerEstado(resenhaId);
    const desde = guardado && guardado.seq > 0 ? guardado.seq : 0;
    /** @type {any} */
    let resposta;
    try {
      resposta = await chamarResenha(`/estado${desde ? `?desde=${desde}` : ''}`);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 404) marcarSemAcesso();
      else if (tratarFalha(erro) === 'seguir') {
        situacao.erro = 'Falha inesperada na sincronização.';
        aoMudar();
      }
      return 'falha';
    }
    // `completo` com seq menor que o enviado indica servidor restaurado: o estado antigo não vale mais.
    const reiniciado = resposta.completo && desde > resposta.seq;
    await alterar((estado) => ({ estado: aplicarDelta(reiniciado ? null : estado, resposta) }));
    await atualizarResenhaLocal();
    Object.assign(situacao, {
      semAcesso: false,
      offline: false,
      limitado: false,
      erro: null,
      mensagem: null,
      ultimaSincronizacaoEm: agora(),
    });
    falhas = 0;
    cancelarTemporizador();
    aoMudar();
    return 'ok';
  }

  async function cicloUnico() {
    if (parado) return;
    if ((await enviarFila()) === 'parar') return;
    await buscarDelta();
  }

  /**
   * No máximo um ciclo por resenha e por navegador. Pedidos durante um ciclo viram uma única repetição ao fim.
   * Pedido forçado (retomada, ação explícita) repete mesmo que o ciclo em curso termine offline.
   * @param {boolean} [forcado]
   * @returns {Promise<void>}
   */
  function sincronizar(forcado = false) {
    if (parado) return Promise.resolve();
    if (ciclo) {
      repetir = true;
      repetirForcado ||= forcado;
      return ciclo;
    }
    ciclo = (async () => {
      try {
        do {
          repetir = false;
          repetirForcado = false;
          try {
            await travas.request(`partidou:sync:${resenhaId}`, cicloUnico);
          } catch {
            situacao.erro = 'Falha inesperada na sincronização.';
            falhas += 1;
            agendarRetentativa();
          }
        } while (
          repetir &&
          !parado &&
          (repetirForcado || (!situacao.semAcesso && !situacao.offline && !situacao.limitado))
        );
      } finally {
        ciclo = null;
        aoMudar();
      }
    })();
    return ciclo;
  }

  return {
    sincronizar,
    /** Retomada automática (página visível, rede de volta): não insiste enquanto o acesso está encerrado. */
    retomar() {
      if (situacao.semAcesso) return Promise.resolve();
      falhas = 0;
      return sincronizar(true);
    },
    /** Pedido explícito: tenta de novo mesmo sem acesso. */
    forcar() {
      falhas = 0;
      return sincronizar(true);
    },
    pausar: cancelarTemporizador,
    notificarOffline: () => {
      situacao.offline = true;
      situacao.mensagem = MENSAGEM_OFFLINE;
      aoMudar();
    },
    marcarSemAcesso,
    parar() {
      parado = true;
      cancelarTemporizador();
    },
    alterar,
    /** @param {import('./tipos.js').Operacao} op */
    async anexar(op) {
      await armazenamento.anexarOperacao(resenhaId, op);
      if (!local.fila.some((o) => o.idOp === op.idOp)) local = { ...local, fila: [...local.fila, op] };
      aoGravar();
    },
    async carregar() {
      const [estado, fila] = await Promise.all([
        armazenamento.lerEstado(resenhaId),
        armazenamento.listarFila(resenhaId),
      ]);
      local = { estado, fila };
    },
    local: () => local,
    situacao: () => situacao,
  };
}
