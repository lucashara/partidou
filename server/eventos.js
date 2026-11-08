// SSE por resenha: avisa os aparelhos conectados que o seq mudou e derruba conexões de sessão ou membro revogado.
const LIMITES_PADRAO = { porResenha: 40, porSessao: 10, total: 300, batimentoMs: 25_000 };

/**
 * @typedef {object} Conexao
 * @property {import('node:http').ServerResponse} res
 * @property {string} resenhaId
 * @property {string} membroId
 * @property {string} sessaoHash
 */

/** @param {Partial<typeof LIMITES_PADRAO>} [opcoes] */
export function criarEventos(opcoes = {}) {
  const L = { ...LIMITES_PADRAO, ...opcoes };
  /** @type {Set<Conexao>} */
  const conexoes = new Set();
  /** @type {Map<string, Set<Conexao>>} */
  const porResenha = new Map();

  const temporizador = setInterval(() => {
    for (const c of conexoes) c.res.write(': batimento\n\n');
  }, L.batimentoMs);
  temporizador.unref();

  function contar(/** @type {(c: Conexao) => boolean} */ predicado) {
    let n = 0;
    for (const c of conexoes) if (predicado(c)) n += 1;
    return n;
  }

  function remover(/** @type {Conexao} */ c) {
    conexoes.delete(c);
    const grupo = porResenha.get(c.resenhaId);
    grupo?.delete(c);
    if (grupo?.size === 0) porResenha.delete(c.resenhaId);
  }

  /** Avisa a revogação e fecha a conexão. */
  function derrubar(/** @type {Conexao} */ c) {
    remover(c);
    c.res.write('event: revogado\ndata: 1\n\n');
    c.res.end();
  }

  function derrubarSe(/** @type {(c: Conexao) => boolean} */ predicado) {
    for (const c of [...conexoes]) if (predicado(c)) derrubar(c);
  }

  return {
    /**
     * Registra a resposta como fluxo SSE e envia o seq atual. Devolve false quando um limite de conexões
     * foi atingido; nesse caso nada foi escrito na resposta.
     * @param {import('node:http').ServerResponse} res
     * @param {Record<string, string>} cabecalhosBase
     * @param {{ resenhaId: string, membroId: string, sessaoHash: string }} dono
     * @param {number} seq
     */
    assinar(res, cabecalhosBase, dono, seq) {
      if (
        conexoes.size >= L.total ||
        (porResenha.get(dono.resenhaId)?.size ?? 0) >= L.porResenha ||
        contar((c) => c.sessaoHash === dono.sessaoHash) >= L.porSessao
      ) {
        return false;
      }
      res.writeHead(200, {
        ...cabecalhosBase,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      });
      res.socket?.setNoDelay(true);
      res.write(`retry: 3000\nevent: seq\ndata: ${seq}\n\n`);
      const c = { res, ...dono };
      conexoes.add(c);
      if (!porResenha.has(dono.resenhaId)) porResenha.set(dono.resenhaId, new Set());
      porResenha.get(dono.resenhaId)?.add(c);
      res.on('close', () => remover(c));
      return true;
    },

    /** Informa o novo seq a todas as conexões da resenha. */
    publicar(/** @type {string} */ resenhaId, /** @type {number} */ seq) {
      for (const c of porResenha.get(resenhaId) ?? []) c.res.write(`event: seq\ndata: ${seq}\n\n`);
    },

    /** Derruba as conexões do membro, exceto as da sessão indicada. */
    revogarMembro: (/** @type {string} */ membroId, exceto = '') =>
      derrubarSe((c) => c.membroId === membroId && c.sessaoHash !== exceto),
    revogarSessao: (/** @type {string} */ sessaoHash) => derrubarSe((c) => c.sessaoHash === sessaoHash),
    revogarResenha: (/** @type {string} */ resenhaId) => derrubarSe((c) => c.resenhaId === resenhaId),

    total: () => conexoes.size,

    encerrar() {
      clearInterval(temporizador);
      for (const c of [...conexoes]) {
        remover(c);
        c.res.end();
      }
    },
  };
}
