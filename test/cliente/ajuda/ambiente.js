import { criarArmazenamentoMemoria } from '../../../public/js/dados/armazenamento.js';
import { criarRepositorio } from '../../../public/js/dados/repositorio.js';
import { criarMutexMemoria } from '../../../public/js/dados/sincronizacao.js';
import { criarServidorFalso } from './servidor-falso.js';

/** Deixa as promessas em andamento (e a leitura de corpos de Response) terminarem. */
export async function assentar(rodadas = 8) {
  for (let i = 0; i < rodadas; i += 1) await new Promise((resolver) => setImmediate(resolver));
}

/** Rede de canais que entrega a mensagem a todas as pontas, menos à que enviou (como o BroadcastChannel). */
export function criarHubCanais() {
  /** @type {Set<(m: { resenhaId: string }) => void>[]} */
  const pontas = [];
  return {
    /** @returns {import('../../../public/js/dados/tipos.js').Canal} */
    novo() {
      const ouvintes = new Set();
      pontas.push(ouvintes);
      return {
        enviar(mensagem) {
          for (const outra of pontas)
            if (outra !== ouvintes) for (const fn of outra) queueMicrotask(() => fn(mensagem));
        },
        ouvir(fn) {
          ouvintes.add(fn);
          return () => void ouvintes.delete(fn);
        },
      };
    },
  };
}

/**
 * Monta servidor falso, armazenamento, relógio, temporizadores e página controláveis pelo teste.
 * @param {{ papel?: 'criador' | 'participante', armazenamento?: import('../../../public/js/dados/tipos.js').Armazenamento }} [opcoes]
 */
export function criarAmbiente({ papel, armazenamento = criarArmazenamentoMemoria() } = {}) {
  const servidor = criarServidorFalso({ papel });
  let relogio = 1_700_000_100_000;
  let contador = 0;
  /** @type {{ fn: () => void, ms: number, ativo: boolean }[]} */
  const temporizadores = [];
  let visivel = true;
  /** @type {Set<(e: 'visivel' | 'oculta' | 'online' | 'offline') => void>} */
  const ouvintesPagina = new Set();

  /** @type {import('../../../public/js/dados/tipos.js').Pagina} */
  const pagina = {
    visivel: () => visivel,
    assinar(fn) {
      ouvintesPagina.add(fn);
      return () => void ouvintesPagina.delete(fn);
    },
  };

  const ambiente = {
    servidor,
    armazenamento,
    pagina,
    temporizadores,
    agora: () => relogio,
    avancar(ms = 1000) {
      relogio += ms;
    },
    novoId: () => `id-teste-${String(++contador).padStart(10, '0')}`,
    /** @param {number} ms @param {() => void} fn */
    agendar(fn, ms) {
      const t = { fn, ms, ativo: true };
      temporizadores.push(t);
      return () => {
        t.ativo = false;
      };
    },
    ativos: () => temporizadores.filter((t) => t.ativo),
    /** Dispara e consome o último temporizador ativo. */
    async dispararUltimo() {
      const t = ambiente.ativos().at(-1);
      if (!t) throw new Error('Nenhum temporizador ativo.');
      t.ativo = false;
      t.fn();
      await assentar();
    },
    /** @param {'visivel' | 'oculta' | 'online' | 'offline'} evento */
    async emitirPagina(evento) {
      if (evento === 'visivel') visivel = true;
      if (evento === 'oculta') visivel = false;
      for (const fn of [...ouvintesPagina]) fn(evento);
      await assentar();
    },
    /** @param {{ travas?: import('../../../public/js/dados/tipos.js').Travas, canal?: import('../../../public/js/dados/tipos.js').Canal | null, aleatorio?: () => number }} [extras] */
    criarRepositorio({ travas = criarMutexMemoria(), canal = null, aleatorio = () => 0 } = {}) {
      return criarRepositorio({
        fetchImpl: (entrada, init) => servidor.fetch(entrada, init),
        armazenamento,
        agora: ambiente.agora,
        novoId: ambiente.novoId,
        travas,
        canal,
        pagina,
        agendar: ambiente.agendar,
        aleatorio,
      });
    },
    /** Grava a resenha do servidor falso como já presente neste aparelho, sem estado carregado. */
    async semearResenha() {
      await armazenamento.gravarResenha({
        id: servidor.resenhaId,
        nome: 'Resenha',
        token: servidor.token,
        eu: servidor.eu,
        entrouEm: 1,
        abertaEm: 1,
      });
    },
  };
  return ambiente;
}

/** Lança uma partida simples com os lados informados. */
export const partidaSimples = (/** @type {Partial<Record<string, any>>} */ extras = {}) => ({
  ladoA: { nome: 'Lucas' },
  ladoB: { nome: 'João' },
  placarA: 2,
  placarB: 1,
  penaltis: null,
  modalidade: null,
  ...extras,
});
