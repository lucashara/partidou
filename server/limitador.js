// Limites em memória por IP e por sessão. Reiniciar o processo zera os contadores (aceito: o segredo
// atacado tem 60 bits ou mais). Todo mapa tem teto de tamanho e varredura periódica de expirados.
import { chaveDeLimite } from './enderecos.js';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export const LIMITES_PADRAO = {
  criacaoPorHora: 5,
  semTokenPorMinuto: 60,
  escritaPorMinuto: 120,
  leituraPorMinuto: 300,
  falhasAntesDoBloqueio: 8,
  bloqueioBaseS: 30,
  bloqueioMaxS: 3600,
  esquecerFalhasMs: 24 * HORA,
  disjuntorFalhasPorHora: 20_000,
  disjuntorBloqueioMs: 5 * MINUTO,
  tetoMapa: 20_000,
  varreduraMs: MINUTO,
};

/**
 * Contador de janela fixa por chave. `consumir` devolve 0 quando liberado ou os segundos até a janela reabrir.
 * @param {number} maximo
 * @param {number} janelaMs
 * @param {number} teto
 * @param {() => number} relogio
 */
function criarJanela(maximo, janelaMs, teto, relogio) {
  /** @type {Map<string, { inicio: number, n: number }>} */
  const mapa = new Map();
  return {
    consumir(/** @type {string} */ chave) {
      const agora = relogio();
      let e = mapa.get(chave);
      if (!e || agora - e.inicio >= janelaMs) {
        if (!e && mapa.size >= teto) mapa.delete(/** @type {string} */ (mapa.keys().next().value));
        e = { inicio: agora, n: 0 };
        mapa.delete(chave);
        mapa.set(chave, e);
      }
      if (e.n >= maximo) return Math.max(1, Math.ceil((e.inicio + janelaMs - agora) / 1000));
      e.n += 1;
      return 0;
    },
    varrer() {
      const agora = relogio();
      for (const [chave, e] of mapa) if (agora - e.inicio >= janelaMs) mapa.delete(chave);
    },
    tamanho: () => mapa.size,
  };
}

/**
 * @param {{ relogio?: () => number, limites?: Partial<typeof LIMITES_PADRAO> }} [opcoes]
 */
export function criarLimitador({ relogio = Date.now, limites = {} } = {}) {
  const L = { ...LIMITES_PADRAO, ...limites };
  const criacao = criarJanela(L.criacaoPorHora, HORA, L.tetoMapa, relogio);
  const semToken = criarJanela(L.semTokenPorMinuto, MINUTO, L.tetoMapa, relogio);
  const escrita = criarJanela(L.escritaPorMinuto, MINUTO, L.tetoMapa, relogio);
  const leitura = criarJanela(L.leituraPorMinuto, MINUTO, L.tetoMapa, relogio);
  /** @type {Map<string, { falhas: number, ultima: number, ate: number }>} */
  const falhas = new Map();
  const disjuntor = { inicio: 0, n: 0, ate: 0 };

  function bloqueioDoIp(/** @type {string} */ ip, /** @type {number} */ agora) {
    const e = falhas.get(ip);
    return e && e.ate > agora ? Math.ceil((e.ate - agora) / 1000) : 0;
  }

  const temporizador = setInterval(() => limitador.varrer(), L.varreduraMs);
  temporizador.unref();

  const limitador = {
    /** Criação de resenha por IP (5 por hora). Devolve segundos de espera, 0 se liberado. */
    criacao: (/** @type {string} */ ip) => criacao.consumir(chaveDeLimite(ip)),
    /** Requisição sem sessão válida por IP (60 por minuto). */
    semToken: (/** @type {string} */ ip) => semToken.consumir(chaveDeLimite(ip)),
    /** Requisição de uma sessão: escrita ou leitura. */
    sessao: (/** @type {string} */ hash, /** @type {boolean} */ ehEscrita) =>
      (ehEscrita ? escrita : leitura).consumir(hash),

    /** Segundos de bloqueio das rotas de código para o IP, somando o disjuntor global; 0 se liberado. */
    bloqueioDeCodigo(/** @type {string} */ ip) {
      const agora = relogio();
      const global = disjuntor.ate > agora ? Math.ceil((disjuntor.ate - agora) / 1000) : 0;
      return Math.max(bloqueioDoIp(chaveDeLimite(ip), agora), global);
    },

    /** Registra código inválido: bloqueio crescente por IP e contagem para o disjuntor. */
    falhaDeCodigo(/** @type {string} */ origem) {
      const ip = chaveDeLimite(origem);
      const agora = relogio();
      let e = falhas.get(ip);
      if (e && agora - e.ultima > L.esquecerFalhasMs) e = undefined;
      if (!e) {
        if (falhas.size >= L.tetoMapa) falhas.delete(/** @type {string} */ (falhas.keys().next().value));
        e = { falhas: 0, ultima: agora, ate: 0 };
      }
      e.falhas += 1;
      e.ultima = agora;
      if (e.falhas >= L.falhasAntesDoBloqueio) {
        const nivel = e.falhas - L.falhasAntesDoBloqueio;
        e.ate = agora + Math.min(L.bloqueioBaseS * 2 ** Math.min(nivel, 20), L.bloqueioMaxS) * 1000;
      }
      falhas.delete(ip);
      falhas.set(ip, e);

      if (agora - disjuntor.inicio >= HORA) {
        disjuntor.inicio = agora;
        disjuntor.n = 0;
      }
      disjuntor.n += 1;
      if (disjuntor.n >= L.disjuntorFalhasPorHora) {
        disjuntor.ate = agora + L.disjuntorBloqueioMs;
        disjuntor.n = 0;
      }
    },

    varrer() {
      const agora = relogio();
      for (const j of [criacao, semToken, escrita, leitura]) j.varrer();
      for (const [ip, e] of falhas) if (agora - e.ultima > L.esquecerFalhasMs && e.ate <= agora) falhas.delete(ip);
    },

    tamanhos: () => ({
      criacao: criacao.tamanho(),
      semToken: semToken.tamanho(),
      escrita: escrita.tamanho(),
      leitura: leitura.tamanho(),
      falhas: falhas.size,
    }),

    encerrar: () => clearInterval(temporizador),
  };
  return limitador;
}
