import { chaveDeNome } from '../../../compartilhado/nomes.js';

/**
 * Servidor em memória que imita o contrato da especificação (partidas, estado por seq, conflito de revisão, SSE).
 * `fetch` é o `fetchImpl` injetado no cliente; `externo` simula outros aparelhos alterando a mesma resenha.
 * @param {{ resenhaId?: string, token?: string, papel?: 'criador' | 'participante' }} [opcoes]
 */
export function criarServidorFalso({
  resenhaId = 'resenha-teste-0000000A',
  token = 'token-secreto-do-teste',
  papel = 'criador',
} = {}) {
  const eu = { membroId: 'membro-eu-0001', papel, apelido: 'Eu' };
  const outro = { id: 'membro-outro-02', apelido: 'Outro', papel: 'participante', criadoEm: 1 };
  /** @type {Map<string, any>} */
  const partidas = new Map();
  /** @type {Map<string, any>} */
  const competidores = new Map();
  let seq = 0;
  /** @type {{ metodo: string, caminho: string, corpo: any, autorizacao: string | null }[]} */
  const chamadas = [];
  /** @type {{ teste: (c: any) => boolean, vezes: number, resposta: any, depois: boolean, espera?: Promise<void>, passar?: boolean }[]} */
  const interceptadores = [];
  /** @type {any[]} */
  const fluxos = [];
  let relogio = 1_700_000_000_000;
  let semStream = false;

  const proximo = () => {
    seq += 1;
    return seq;
  };
  const json = (
    /** @type {number} */ status,
    /** @type {any} */ corpo = null,
    /** @type {Record<string, string>} */ cabecalhos = {},
  ) =>
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cabecalhos } });
  const erro = (
    /** @type {number} */ status,
    /** @type {string} */ codigo,
    /** @type {string} */ mensagem,
    /** @type {any} */ extras = {},
  ) => json(status, { erro: { codigo, mensagem, ...extras } });

  /** @param {{ id?: string, nome?: string }} lado @param {number} novoSeq */
  function resolverLado(lado, novoSeq) {
    if (lado.id && competidores.has(lado.id)) return lado.id;
    const chave = chaveDeNome(lado.nome ?? '');
    for (const c of competidores.values()) if (chaveDeNome(c.nome) === chave) return c.id;
    const id = lado.id ?? `comp-${competidores.size + 1}-0000000000`;
    competidores.set(id, { id, nome: lado.nome, criadoPor: eu.membroId, seq: novoSeq });
    return id;
  }
  const visivel = (/** @type {any} */ p) => ({ ...p });
  const paraResposta = (/** @type {any} */ p, /** @type {number} */ s) => ({
    partida: visivel(p),
    competidores: [...competidores.values()].filter((c) => c.id === p.ladoA || c.id === p.ladoB),
    seq: s,
  });
  const conflito = (/** @type {any} */ p) =>
    erro(409, 'CONFLITO_REVISAO', 'Revisão desatualizada.', { atual: visivel(p) });

  /** @param {string} idPartida @param {any} corpo @param {any} criador */
  function criar(idPartida, corpo, criador = eu.membroId) {
    const existente = partidas.get(idPartida);
    if (existente)
      return existente.criadoPor === criador
        ? json(200, paraResposta(existente, seq))
        : erro(409, 'ID_EM_USO', 'Identificador já utilizado.');
    if (corpo.placarA > 999) return erro(422, 'PLACAR_INVALIDO', 'Placar acima do limite.', { campo: 'placarA' });
    const s = proximo();
    relogio += 1;
    const ladoA = resolverLado(corpo.ladoA, s);
    const ladoB = resolverLado(corpo.ladoB, s);
    if (ladoA === ladoB) return erro(422, 'LADOS_IGUAIS', 'Lados iguais.');
    const partida = {
      id: idPartida,
      ladoA,
      ladoB,
      placarA: corpo.placarA,
      placarB: corpo.placarB,
      penaltisA: corpo.penaltis?.a ?? null,
      penaltisB: corpo.penaltis?.b ?? null,
      modalidade: corpo.modalidade ?? null,
      jogadaEm: corpo.jogadaEm ?? relogio,
      criadoPor: criador,
      editadoPor: null,
      criadaEm: relogio,
      atualizadaEm: relogio,
      rev: 1,
      excluida: false,
      seq: s,
    };
    partidas.set(idPartida, partida);
    return json(201, paraResposta(partida, s));
  }

  /** Como o servidor real: rev antigo cujo resultado já é o atual não é conflito. */
  function jaNoEstadoPedido(/** @type {any} */ p, /** @type {any} */ corpo) {
    const idDoLado = (/** @type {any} */ lado) =>
      competidores.has(lado.id)
        ? lado.id
        : [...competidores.values()].find((c) => chaveDeNome(c.nome) === chaveDeNome(lado.nome ?? ''))?.id;
    if (['placarA', 'placarB', 'modalidade', 'jogadaEm'].some((c) => c in corpo && corpo[c] !== p[c])) return false;
    if (
      'penaltis' in corpo &&
      ((corpo.penaltis?.a ?? null) !== p.penaltisA || (corpo.penaltis?.b ?? null) !== p.penaltisB)
    )
      return false;
    return (!corpo.ladoA || idDoLado(corpo.ladoA) === p.ladoA) && (!corpo.ladoB || idDoLado(corpo.ladoB) === p.ladoB);
  }

  /** @param {string} id @param {any} corpo */
  function editar(id, corpo) {
    const p = partidas.get(id);
    if (!p) return erro(404, 'NAO_ENCONTRADO', 'Partida não encontrada.');
    if (p.excluida) return conflito(p);
    if (corpo.rev !== p.rev) return jaNoEstadoPedido(p, corpo) ? json(200, paraResposta(p, seq)) : conflito(p);
    const s = proximo();
    for (const campo of ['placarA', 'placarB', 'modalidade', 'jogadaEm']) if (campo in corpo) p[campo] = corpo[campo];
    if ('penaltis' in corpo) [p.penaltisA, p.penaltisB] = [corpo.penaltis?.a ?? null, corpo.penaltis?.b ?? null];
    if (corpo.ladoA) p.ladoA = resolverLado(corpo.ladoA, s);
    if (corpo.ladoB) p.ladoB = resolverLado(corpo.ladoB, s);
    Object.assign(p, { rev: p.rev + 1, seq: s, editadoPor: eu.membroId });
    return json(200, paraResposta(p, s));
  }

  /** @param {string} id @param {number} rev @param {boolean} excluir */
  function alterarExclusao(id, rev, excluir) {
    const p = partidas.get(id);
    if (!p) return erro(404, 'NAO_ENCONTRADO', 'Partida não encontrada.');
    if (p.excluida === excluir) return json(200, paraResposta(p, seq));
    if (rev !== p.rev) return conflito(p);
    const s = proximo();
    Object.assign(p, { excluida: excluir, rev: p.rev + 1, seq: s });
    return json(200, paraResposta(p, s));
  }

  /** @param {number | null} desde */
  function estado(desde) {
    const completo = !desde || desde > seq;
    const lista = [...partidas.values()].filter((p) => (completo ? !p.excluida : p.seq > desde));
    return json(200, {
      seq,
      completo,
      resenha: { id: resenhaId, nome: 'Resenha', seq, criadaEm: 1 },
      eu,
      membros: [{ id: eu.membroId, apelido: eu.apelido, papel: eu.papel, criadoEm: 1 }, outro],
      competidores: [...competidores.values()],
      partidas: lista.map(visivel),
    });
  }

  function abrirFluxo(/** @type {AbortSignal | undefined} */ sinal) {
    const codificador = new TextEncoder();
    /** @type {any} */
    let controle;
    const stream = new ReadableStream({
      start(c) {
        controle = c;
      },
    });
    const fluxo = {
      enviar: (/** @type {string} */ texto) => controle.enqueue(codificador.encode(texto)),
      encerrar: () => controle.close(),
    };
    fluxos.push(fluxo);
    sinal?.addEventListener('abort', () => controle.error(new DOMException('abortado', 'AbortError')), { once: true });
    fluxo.enviar(`retry: 3000\n\nevent: seq\ndata: ${seq}\n\n`);
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  /** @param {any} chamada */
  function rotear({ metodo, caminho, corpo, init }) {
    const url = new URL(caminho, 'http://teste');
    const rota = url.pathname;
    const base = `/api/resenhas/${resenhaId}`;
    if (rota.startsWith('/api/resenhas/') && !rota.startsWith(base))
      return erro(404, 'NAO_ENCONTRADO', 'Recurso não encontrado.');
    const partidaDe = rota.match(/\/partidas\/([^/]+)(\/restaurar)?$/);
    if (metodo === 'GET' && rota === `${base}/estado`) return estado(Number(url.searchParams.get('desde')) || null);
    if (metodo === 'GET' && rota === `${base}/eventos`) {
      return semStream
        ? /** @type {any} */ ({ ok: true, status: 200, body: null, headers: new Headers() })
        : abrirFluxo(init?.signal);
    }
    if (metodo === 'POST' && rota === `${base}/partidas`) return criar(corpo.id, corpo);
    if (metodo === 'PATCH' && partidaDe) return editar(partidaDe[1], corpo);
    if (metodo === 'DELETE' && partidaDe)
      return alterarExclusao(partidaDe[1], Number(url.searchParams.get('rev')), true);
    if (metodo === 'POST' && partidaDe?.[2]) return alterarExclusao(partidaDe[1], corpo.rev, false);
    if (metodo === 'POST' && rota === `${base}/convite`) return json(201, { codigo: 'ABCD-EFGH-JKMN', expiraEm: 2 });
    if (metodo === 'DELETE' && rota === '/api/sessao') return json(204);
    return erro(404, 'NAO_ENCONTRADO', 'Rota desconhecida.');
  }

  /** @param {string} caminho @param {any} [init] */
  async function fetch(caminho, init = {}) {
    const metodo = init.method ?? 'GET';
    const corpo = init.body ? JSON.parse(init.body) : undefined;
    const autorizacao = init.headers?.Authorization ?? null;
    const chamada = { metodo, caminho, corpo, autorizacao };
    chamadas.push(chamada);
    const desvio = interceptadores.find((i) => i.vezes > 0 && i.teste(chamada));
    if (desvio) {
      desvio.vezes -= 1;
      await desvio.espera;
      if (!desvio.depois && !desvio.passar) {
        if (desvio.resposta === 'rede') throw new TypeError('falha de rede');
        return json(desvio.resposta.status, desvio.resposta.corpo ?? {}, desvio.resposta.cabecalhos);
      }
    }
    if (autorizacao !== `Bearer ${token}`) return erro(401, 'NAO_AUTENTICADO', 'Sessão inválida.');
    const resposta = rotear({ metodo, caminho, corpo, init });
    if (desvio?.depois) throw new TypeError('resposta perdida');
    return resposta;
  }

  return {
    resenhaId,
    token,
    eu,
    fetch,
    chamadas,
    partidas,
    competidores,
    fluxos,
    get seq() {
      return seq;
    },
    /** Responde às próximas `vezes` chamadas que satisfazem `teste`: `'rede'` ou `{ status, corpo, cabecalhos }`. */
    programar(/** @type {(c: any) => boolean} */ teste, /** @type {any} */ resposta, vezes = 1) {
      interceptadores.push({ teste, vezes, resposta, depois: false });
    },
    /** Processa a chamada no servidor e perde a resposta, como um corte de rede depois do envio. */
    perderResposta(/** @type {(c: any) => boolean} */ teste, vezes = 1) {
      interceptadores.push({ teste, vezes, resposta: null, depois: true });
    },
    /** Segura a próxima chamada que satisfaz `teste` até `liberar()`; depois a processa ou, com `resposta`, responde com ela. */
    segurar(/** @type {(c: any) => boolean} */ teste, /** @type {any} */ resposta = null) {
      /** @type {() => void} */
      let liberar = () => {};
      const espera = new Promise((resolver) => {
        liberar = () => resolver(undefined);
      });
      interceptadores.push({
        teste,
        vezes: 1,
        resposta,
        depois: false,
        espera: /** @type {Promise<void>} */ (espera),
        passar: !resposta,
      });
      return liberar;
    },
    limpar() {
      interceptadores.length = 0;
    },
    usarSemStream() {
      semStream = true;
    },
    externo: {
      editar(/** @type {string} */ id, /** @type {any} */ campos) {
        return editar(id, { rev: partidas.get(id).rev, ...campos });
      },
      lancar: (/** @type {any} */ corpo) => criar(corpo.id, corpo, outro.id),
      excluir(/** @type {string} */ id) {
        const p = partidas.get(id);
        return alterarExclusao(id, p.rev, true);
      },
    },
    /** @param {string} tipo */
    chamadasDe: (tipo) =>
      chamadas.filter(
        (c) => `${c.metodo} ${c.caminho.replace(/\/partidas\/[^/?]+/, '/partidas/:pid').replace(/\?.*/, '')}` === tipo,
      ),
  };
}
