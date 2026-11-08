import { chaveDeNome, normalizarNome } from '../../../compartilhado/nomes.js';

/**
 * Funde a resposta de `GET /estado` ao cache. Resposta com `seq` menor que o do cache é ignorada.
 * @param {import('./tipos.js').EstadoLocal | null} cache
 * @param {import('./tipos.js').EstadoServidor} estado
 * @returns {import('./tipos.js').EstadoLocal}
 */
export function aplicarDelta(cache, estado) {
  if (cache && estado.seq < cache.seq) return cache;
  /** @type {Record<string, import('./tipos.js').Partida>} */
  const partidas = estado.completo || !cache ? {} : { ...cache.partidas };
  for (const partida of estado.partidas) {
    if (estado.completo && partida.excluida) continue;
    partidas[partida.id] = partida;
  }
  return {
    seq: estado.seq,
    resenha: estado.resenha,
    eu: estado.eu,
    membros: estado.membros,
    competidores: estado.competidores,
    partidas,
  };
}

/**
 * Aplica ao cache a partida devolvida por uma escrita. O `seq` do cache não avança: só o `GET /estado` o move,
 * senão mudanças de outros aparelhos entre os dois valores nunca seriam buscadas.
 * @param {import('./tipos.js').EstadoLocal | null} cache
 * @param {{ partida?: import('./tipos.js').Partida, competidores?: import('./tipos.js').Competidor[] }} resposta
 * @returns {import('./tipos.js').EstadoLocal | null}
 */
export function aplicarResposta(cache, resposta) {
  if (!cache) return cache;
  const { partida, competidores } = resposta;
  const atual = partida ? cache.partidas[partida.id] : undefined;
  const partidas =
    partida && !(atual && atual.rev > partida.rev) ? { ...cache.partidas, [partida.id]: partida } : cache.partidas;
  const novos = competidores ?? [];
  const ids = new Set(novos.map((c) => c.id));
  return {
    ...cache,
    partidas,
    competidores: novos.length ? [...cache.competidores.filter((c) => !ids.has(c.id)), ...novos] : cache.competidores,
  };
}

/**
 * Depois de uma escrita bem-sucedida, as operações seguintes da mesma partida passam a usar a revisão nova.
 * @param {import('./tipos.js').Operacao[]} fila
 * @param {{ id: string, rev: number }} partida
 * @returns {import('./tipos.js').Operacao[]}
 */
export function ajustarRevs(fila, partida) {
  return fila.map((op) => (op.partidaId === partida.id && op.rev !== undefined ? { ...op, rev: partida.rev } : op));
}

/**
 * Aplica a fila ao cache e devolve a visão. Pura: o mesmo cache e a mesma fila dão sempre a mesma visão.
 * `sync` e `carregando` saem com valores neutros; o controlador os sobrescreve.
 * @param {import('./tipos.js').EstadoLocal} cache
 * @param {import('./tipos.js').Operacao[]} fila
 * @param {import('./tipos.js').Eu} [eu]
 * @returns {import('./tipos.js').Visao}
 */
export function montarVisao(cache, fila, eu = cache.eu) {
  /** @type {Map<string, { id: string, nome: string, local?: true }>} */
  const competidores = new Map();
  /** @type {Map<string, string>} */
  const idPorChave = new Map();
  /** @param {string} id @param {string} nome @param {boolean} local */
  const registrar = (id, nome, local) => {
    competidores.set(id, local ? { id, nome: normalizarNome(nome), local: true } : { id, nome });
    idPorChave.set(chaveDeNome(nome), id);
  };
  for (const c of cache.competidores) registrar(c.id, c.nome, false);

  /** @param {import('./tipos.js').LadoCorpo} lado */
  const resolver = (lado) => {
    if (lado.id && competidores.has(lado.id)) return lado.id;
    const chave = chaveDeNome(lado.nome ?? '');
    const existente = idPorChave.get(chave);
    if (existente) return existente;
    const id = lado.id ?? `local-${chave}`;
    registrar(id, lado.nome ?? '', true);
    return id;
  };

  /** @type {Map<string, { partida: import('./tipos.js').Partida, pendente: boolean, criadaAqui: boolean }>} */
  const partidas = new Map();
  for (const partida of Object.values(cache.partidas))
    partidas.set(partida.id, { partida, pendente: false, criadaAqui: false });

  for (const op of fila) {
    const { corpo } = op;
    if (op.tipo === 'criar') {
      const partida = {
        id: op.partidaId,
        ladoA: resolver(corpo.ladoA ?? { nome: '' }),
        ladoB: resolver(corpo.ladoB ?? { nome: '' }),
        placarA: corpo.placarA ?? 0,
        placarB: corpo.placarB ?? 0,
        penaltisA: corpo.penaltis?.a ?? null,
        penaltisB: corpo.penaltis?.b ?? null,
        modalidade: corpo.modalidade ?? null,
        jogadaEm: corpo.jogadaEm ?? op.criadaEm,
        criadoPor: eu.membroId,
        editadoPor: null,
        criadaEm: op.criadaEm,
        atualizadaEm: op.criadaEm,
        rev: 0,
        excluida: false,
        seq: 0,
      };
      partidas.set(op.partidaId, { partida, pendente: true, criadaAqui: true });
      continue;
    }
    const entrada = partidas.get(op.partidaId);
    if (!entrada) continue;
    entrada.pendente = true;
    if (op.tipo === 'excluir') entrada.partida = { ...entrada.partida, excluida: true };
    else if (op.tipo === 'restaurar') entrada.partida = { ...entrada.partida, excluida: false };
    else {
      const p = { ...entrada.partida };
      if (corpo.placarA !== undefined) p.placarA = corpo.placarA;
      if (corpo.placarB !== undefined) p.placarB = corpo.placarB;
      if (corpo.penaltis !== undefined) {
        p.penaltisA = corpo.penaltis?.a ?? null;
        p.penaltisB = corpo.penaltis?.b ?? null;
      }
      if (corpo.modalidade !== undefined) p.modalidade = corpo.modalidade;
      if (corpo.jogadaEm !== undefined) p.jogadaEm = corpo.jogadaEm;
      if (corpo.ladoA) p.ladoA = resolver(corpo.ladoA);
      if (corpo.ladoB) p.ladoB = resolver(corpo.ladoB);
      entrada.partida = p;
    }
  }

  const lista = [...partidas.values()]
    .filter((e) => !e.partida.excluida)
    .map((e) => ({
      ...e.partida,
      pendente: e.pendente,
      podeEditar: eu.papel === 'criador' || e.partida.criadoPor === eu.membroId || e.criadaAqui,
    }));
  lista.sort((a, b) => b.jogadaEm - a.jogadaEm || b.criadaEm - a.criadaEm || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const chaves = new Map([...competidores.values()].map((c) => [c.id, chaveDeNome(c.nome)]));
  const ordenados = [...competidores.values()].sort((a, b) => {
    const ca = chaves.get(a.id) ?? '';
    const cb = chaves.get(b.id) ?? '';
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  return {
    resenha: { id: cache.resenha.id, nome: cache.resenha.nome },
    eu,
    membros: cache.membros.filter((m) => !(/** @type {any} */ (m).revogadoEm)),
    competidores: ordenados,
    partidas: lista,
    sync: {
      estado: fila.length ? 'pendente' : 'sincronizado',
      pendentes: fila.length,
      ultimaSincronizacaoEm: null,
      mensagem: null,
    },
    carregando: false,
  };
}
