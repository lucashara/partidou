// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
// Servidor real em porta efêmera, banco em memória e relógio controlável, para os testes de API.
import { lerConfiguracao } from '../../server/configuracao.js';
import { criarServidor } from '../../server/servidor.js';

/** Limites do limitador folgados o bastante para os testes que não tratam de limites. */
const LIMITES_FOLGADOS = {
  criacaoPorHora: 100_000,
  semTokenPorMinuto: 100_000,
  escritaPorMinuto: 100_000,
  leituraPorMinuto: 100_000,
  falhasAntesDoBloqueio: 100_000,
  disjuntorFalhasPorHora: 100_000_000,
};

export function relogioControlavel(inicio = Date.now()) {
  let agora = inicio;
  return {
    agora: () => agora,
    avancar: (ms) => {
      agora += ms;
    },
  };
}

/**
 * @param {{ config?: object, opcoes?: object, limitesPadrao?: boolean }} [parametros]
 *   `limitesPadrao: true` mantém os limites reais do limitador.
 */
export async function iniciarServidor({ config = {}, opcoes = {}, limitesPadrao = false } = {}) {
  const relogio = relogioControlavel();
  const base = { ...lerConfiguracao({}), dbPath: ':memory:', logDir: null, ...config };
  const servidor = criarServidor(base, {
    relogio: relogio.agora,
    espelhoDoRegistro: false,
    limites: limitesPadrao ? {} : LIMITES_FOLGADOS,
    ...opcoes,
  });
  const porta = await servidor.iniciar(0, '127.0.0.1');
  const url = `http://127.0.0.1:${porta}`;

  /**
   * @param {string} metodo
   * @param {string} caminho
   * @param {{ token?: string, corpo?: unknown, bruto?: string, cabecalhos?: Record<string, string> }} [extra]
   */
  async function chamar(metodo, caminho, { token, corpo, bruto, cabecalhos = {} } = {}) {
    const headers = { ...cabecalhos };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body = bruto;
    if (corpo !== undefined) {
      body = JSON.stringify(corpo);
      headers['Content-Type'] ??= 'application/json';
    }
    const resposta = await fetch(url + caminho, { method: metodo, headers, body });
    const texto = await resposta.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {}
    return { status: resposta.status, corpo: json, texto, cabecalhos: resposta.headers };
  }

  /** Cria uma resenha e devolve o necessário para os testes seguintes. */
  async function criarResenha(nome = 'Resenha', apelido = 'Dono') {
    const r = await chamar('POST', '/api/resenhas', { corpo: { nome, apelido } });
    if (r.status !== 201) throw new Error(`Criação falhou: ${r.status} ${r.texto}`);
    const { resenha, membro, token, convite } = r.corpo;
    return { resenha, membro, token, convite, id: resenha.id };
  }

  /** Aceita o convite e devolve o participante. */
  async function entrar(convite, apelido) {
    const r = await chamar('POST', '/api/convites/aceitar', { corpo: { codigo: convite.codigo, apelido } });
    if (r.status !== 201) throw new Error(`Convite falhou: ${r.status} ${r.texto}`);
    return { ...r.corpo, id: r.corpo.resenha.id };
  }

  /** Resenha com um criador e um participante. */
  async function resenhaComDois(apelidoDono = 'Dono', apelidoParticipante = 'Visita') {
    const dono = await criarResenha('Resenha', apelidoDono);
    const visita = await entrar(dono.convite, apelidoParticipante);
    return { dono, visita, id: dono.id };
  }

  /** Lança uma partida simples e devolve a resposta. */
  function lancar(token, resenhaId, extra = {}) {
    return chamar('POST', `/api/resenhas/${resenhaId}/partidas`, {
      token,
      corpo: {
        id: crypto.randomUUID(),
        ladoA: { nome: 'Lucas' },
        ladoB: { nome: 'João' },
        placarA: 2,
        placarB: 1,
        ...extra,
      },
    });
  }

  return {
    servidor,
    ctx: servidor.ctx,
    url,
    porta,
    relogio,
    chamar,
    criarResenha,
    entrar,
    resenhaComDois,
    lancar,
    fechar: () => servidor.encerrar(),
  };
}
