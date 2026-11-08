import { chaveDeNome } from './nomes.js';
import { vencedorFinal } from './placar.js';

/**
 * Maior diferença; no empate de diferença prevalece a partida mais recente e, depois, o menor id.
 * @param {{ diferenca: number, jogadaEm: number, partidaId: string } | null} atual
 * @param {number} diferenca
 * @param {number} jogadaEm
 * @param {string} id
 */
function superaMaior(atual, diferenca, jogadaEm, id) {
  if (!atual) return true;
  if (diferenca !== atual.diferenca) return diferenca > atual.diferenca;
  if (jogadaEm !== atual.jogadaEm) return jogadaEm > atual.jogadaEm;
  return id < atual.partidaId;
}

/**
 * @param {string} competidorId
 * @param {string} nome
 */
function novaLinha(competidorId, nome) {
  return {
    competidorId,
    nome,
    partidas: 0,
    vitorias: 0,
    empates: 0,
    derrotas: 0,
    golsPro: 0,
    golsContra: 0,
    saldo: 0,
    vitoriasPenaltis: 0,
    derrotasPenaltis: 0,
    maiorVitoria: /** @type {{ partidaId: string, diferenca: number, jogadaEm: number } | null} */ (null),
    ultimaJogadaEm: 0,
  };
}

/**
 * @param {ReturnType<typeof novaLinha>} linha
 * @param {import('./tipos.js').Partida} partida
 * @param {string} lado
 */
function registrar(linha, partida, lado) {
  const pro = lado === 'a' ? partida.placarA : partida.placarB;
  const contra = lado === 'a' ? partida.placarB : partida.placarA;
  linha.partidas += 1;
  linha.golsPro += pro;
  linha.golsContra += contra;
  linha.saldo = linha.golsPro - linha.golsContra;
  linha.ultimaJogadaEm = Math.max(linha.ultimaJogadaEm, partida.jogadaEm);
  if (pro > contra) {
    linha.vitorias += 1;
    const diferenca = pro - contra;
    if (superaMaior(linha.maiorVitoria, diferenca, partida.jogadaEm, partida.id)) {
      linha.maiorVitoria = { partidaId: partida.id, diferenca, jogadaEm: partida.jogadaEm };
    }
  } else if (pro < contra) {
    linha.derrotas += 1;
  } else {
    linha.empates += 1;
    const { lado: vencedor, porPenaltis } = vencedorFinal(partida);
    if (porPenaltis) {
      if (vencedor === lado) linha.vitoriasPenaltis += 1;
      else linha.derrotasPenaltis += 1;
    }
  }
}

/**
 * Estatísticas das partidas não excluídas. Vitória, empate e derrota seguem o tempo normal; pênaltis ficam
 * em contadores próprios e nunca entram nos gols.
 * @param {import('./tipos.js').Partida[]} partidas
 * @param {{ id: string, nome: string }[]} competidores
 */
export function calcularEstatisticas(partidas, competidores) {
  const nomes = new Map(competidores.map((c) => [c.id, c.nome]));
  const nomeDe = (/** @type {string} */ id) => nomes.get(id) ?? id;
  /** @type {Map<string, ReturnType<typeof novaLinha>>} */
  const linhas = new Map();
  /** @type {Map<string, { ladoA: string, ladoB: string, partidas: number, vitoriasA: number, vitoriasB: number, empates: number, golsA: number, golsB: number, penaltisVencidosA: number, penaltisVencidosB: number }>} */
  const confrontos = new Map();
  const totais = { partidas: 0, golsMarcados: 0, decididasNosPenaltis: 0 };
  /** @type {{ partidaId: string, diferenca: number, jogadaEm: number, vencedorId: string, perdedorId: string, placarVencedor: number, placarPerdedor: number } | null} */
  let maior = null;

  for (const partida of partidas) {
    if (partida.excluida) continue;
    totais.partidas += 1;
    totais.golsMarcados += partida.placarA + partida.placarB;
    const final = vencedorFinal(partida);
    if (final.porPenaltis) totais.decididasNosPenaltis += 1;

    for (const [lado, id] of [
      ['a', partida.ladoA],
      ['b', partida.ladoB],
    ]) {
      let linha = linhas.get(id);
      if (!linha) {
        linha = novaLinha(id, nomeDe(id));
        linhas.set(id, linha);
      }
      registrar(linha, partida, lado);
    }

    const diferenca = Math.abs(partida.placarA - partida.placarB);
    if (diferenca > 0) {
      const aVenceu = partida.placarA > partida.placarB;
      if (superaMaior(maior, diferenca, partida.jogadaEm, partida.id)) {
        maior = {
          partidaId: partida.id,
          diferenca,
          jogadaEm: partida.jogadaEm,
          vencedorId: aVenceu ? partida.ladoA : partida.ladoB,
          perdedorId: aVenceu ? partida.ladoB : partida.ladoA,
          placarVencedor: aVenceu ? partida.placarA : partida.placarB,
          placarPerdedor: aVenceu ? partida.placarB : partida.placarA,
        };
      }
    }

    // Ordem estável do par: menor chave de nome primeiro, id como desempate.
    const invertido = ordemDoPar(nomeDe(partida.ladoA), partida.ladoA, nomeDe(partida.ladoB), partida.ladoB) > 0;
    const [ladoA, ladoB] = invertido ? [partida.ladoB, partida.ladoA] : [partida.ladoA, partida.ladoB];
    const [golsA, golsB] = invertido ? [partida.placarB, partida.placarA] : [partida.placarA, partida.placarB];
    const chave = `${ladoA}|${ladoB}`;
    let c = confrontos.get(chave);
    if (!c) {
      c = {
        ladoA,
        ladoB,
        partidas: 0,
        vitoriasA: 0,
        vitoriasB: 0,
        empates: 0,
        golsA: 0,
        golsB: 0,
        penaltisVencidosA: 0,
        penaltisVencidosB: 0,
      };
      confrontos.set(chave, c);
    }
    c.partidas += 1;
    c.golsA += golsA;
    c.golsB += golsB;
    if (golsA > golsB) c.vitoriasA += 1;
    else if (golsB > golsA) c.vitoriasB += 1;
    else c.empates += 1;
    if (final.porPenaltis) {
      const venceuPrimeiro = final.lado === (invertido ? 'b' : 'a');
      if (venceuPrimeiro) c.penaltisVencidosA += 1;
      else c.penaltisVencidosB += 1;
    }
  }

  const tabela = [...linhas.values()]
    .map((linha) => ({ ...linha, maiorVitoria: linha.maiorVitoria && semJogada(linha.maiorVitoria) }))
    .sort(
      (a, b) =>
        b.vitorias - a.vitorias ||
        b.saldo - a.saldo ||
        b.golsPro - a.golsPro ||
        a.nome.localeCompare(b.nome, 'pt-BR') ||
        a.competidorId.localeCompare(b.competidorId),
    );

  const lista = [...confrontos.values()].sort(
    (a, b) =>
      b.partidas - a.partidas ||
      nomeDe(a.ladoA).localeCompare(nomeDe(b.ladoA), 'pt-BR') ||
      nomeDe(a.ladoB).localeCompare(nomeDe(b.ladoB), 'pt-BR') ||
      a.ladoA.localeCompare(b.ladoA) ||
      a.ladoB.localeCompare(b.ladoB),
  );

  return { totais, tabela, confrontos: lista, maiorDiferenca: maior && semJogada(maior) };
}

/** A data da partida só serve ao desempate interno. */
/**
 * @template {{ jogadaEm: number }} T
 * @param {T} valor
 */
function semJogada({ jogadaEm: _jogadaEm, ...resto }) {
  return resto;
}

/**
 * @param {string} nomeA
 * @param {string} idA
 * @param {string} nomeB
 * @param {string} idB
 */
function ordemDoPar(nomeA, idA, nomeB, idB) {
  const chaveA = chaveDeNome(nomeA);
  const chaveB = chaveDeNome(nomeB);
  if (chaveA !== chaveB) return chaveA < chaveB ? -1 : 1;
  return idA < idB ? -1 : 1;
}
