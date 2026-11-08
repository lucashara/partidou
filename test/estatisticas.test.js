// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { calcularEstatisticas } from '../compartilhado/estatisticas.js';

const competidores = [
  { id: 'lucas', nome: 'Lucas' },
  { id: 'joao', nome: 'João' },
  { id: 'ana', nome: 'Ana' },
];

let contador = 0;
/** Partida mínima; `a` e `b` são ids de competidor. */
function partida(a, b, placarA, placarB, extra = {}) {
  contador += 1;
  return {
    id: `p${contador}`,
    ladoA: a,
    ladoB: b,
    placarA,
    placarB,
    penaltisA: null,
    penaltisB: null,
    modalidade: null,
    jogadaEm: 1000 + contador,
    excluida: false,
    ...extra,
  };
}

const linha = (stats, id) => stats.tabela.find((l) => l.competidorId === id);

describe('calcularEstatisticas', () => {
  test('sem partidas, tudo vazio', () => {
    const e = calcularEstatisticas([], competidores);
    assert.deepEqual(e, {
      totais: { partidas: 0, golsMarcados: 0, decididasNosPenaltis: 0 },
      tabela: [],
      confrontos: [],
      maiorDiferenca: null,
    });
  });

  test('vitória, empate e derrota seguem o tempo normal', () => {
    const e = calcularEstatisticas(
      [partida('lucas', 'joao', 3, 1), partida('joao', 'lucas', 2, 2), partida('lucas', 'joao', 0, 1)],
      competidores,
    );
    const lucas = linha(e, 'lucas');
    const joao = linha(e, 'joao');
    assert.deepEqual(
      [lucas.partidas, lucas.vitorias, lucas.empates, lucas.derrotas, lucas.golsPro, lucas.golsContra, lucas.saldo],
      [3, 1, 1, 1, 5, 4, 1],
    );
    assert.deepEqual(
      [joao.partidas, joao.vitorias, joao.empates, joao.derrotas, joao.golsPro, joao.golsContra, joao.saldo],
      [3, 1, 1, 1, 4, 5, -1],
    );
    assert.deepEqual(e.totais, { partidas: 3, golsMarcados: 9, decididasNosPenaltis: 0 });
  });

  test('pênaltis ficam separados dos gols e não mudam vitória, empate nem derrota', () => {
    const e = calcularEstatisticas(
      [
        partida('lucas', 'joao', 1, 1, { penaltisA: 5, penaltisB: 4 }),
        partida('joao', 'lucas', 0, 0, { penaltisA: 3, penaltisB: 1 }),
      ],
      competidores,
    );
    const lucas = linha(e, 'lucas');
    const joao = linha(e, 'joao');
    assert.deepEqual([lucas.empates, lucas.vitorias, lucas.derrotas, lucas.golsPro], [2, 0, 0, 1]);
    assert.deepEqual([lucas.vitoriasPenaltis, lucas.derrotasPenaltis], [1, 1]);
    assert.deepEqual([joao.vitoriasPenaltis, joao.derrotasPenaltis], [1, 1]);
    assert.deepEqual(e.totais, { partidas: 2, golsMarcados: 2, decididasNosPenaltis: 2 });
    assert.equal(e.maiorDiferenca, null);
  });

  test('exclusão é ignorada em tudo', () => {
    const e = calcularEstatisticas(
      [partida('lucas', 'joao', 9, 0, { excluida: true }), partida('lucas', 'joao', 1, 0)],
      competidores,
    );
    assert.equal(e.totais.partidas, 1);
    assert.equal(e.totais.golsMarcados, 1);
    assert.equal(linha(e, 'lucas').golsPro, 1);
    assert.equal(e.maiorDiferenca?.diferenca, 1);
    assert.equal(e.confrontos[0].partidas, 1);
  });

  test('só entram na tabela competidores com partidas', () => {
    const e = calcularEstatisticas([partida('lucas', 'joao', 1, 0)], competidores);
    assert.deepEqual(e.tabela.map((l) => l.competidorId).sort(), ['joao', 'lucas']);
  });

  test('ordem da tabela: vitórias, saldo, gols pró, nome', () => {
    const partidas = [partida('lucas', 'joao', 2, 0), partida('ana', 'joao', 3, 0), partida('lucas', 'ana', 0, 1)];
    const e = calcularEstatisticas(partidas, competidores);
    // Ana: 2 vitórias; Lucas: 1 vitória, saldo +1; João: 0 vitórias.
    assert.deepEqual(
      e.tabela.map((l) => l.competidorId),
      ['ana', 'lucas', 'joao'],
    );
    const empatados = calcularEstatisticas(
      [partida('lucas', 'joao', 1, 0), partida('ana', 'x', 1, 0)],
      [...competidores, { id: 'x', nome: 'Zé' }],
    );
    // Vitórias, saldo e gols iguais: desempata o nome.
    assert.deepEqual(
      empatados.tabela.slice(0, 2).map((l) => l.nome),
      ['Ana', 'Lucas'],
    );
  });

  test('maior vitória por competidor e maior diferença geral', () => {
    const partidas = [
      partida('lucas', 'joao', 5, 1),
      partida('joao', 'lucas', 2, 0),
      partida('ana', 'lucas', 7, 1),
      partida('ana', 'joao', 1, 1),
    ];
    const e = calcularEstatisticas(partidas, competidores);
    assert.deepEqual(linha(e, 'lucas').maiorVitoria, { partidaId: partidas[0].id, diferenca: 4 });
    assert.deepEqual(linha(e, 'joao').maiorVitoria, { partidaId: partidas[1].id, diferenca: 2 });
    assert.deepEqual(linha(e, 'ana').maiorVitoria, { partidaId: partidas[2].id, diferenca: 6 });
    assert.deepEqual(e.maiorDiferenca, {
      partidaId: partidas[2].id,
      diferenca: 6,
      vencedorId: 'ana',
      perdedorId: 'lucas',
      placarVencedor: 7,
      placarPerdedor: 1,
    });
  });

  test('competidor sem vitória não tem maior vitória', () => {
    const e = calcularEstatisticas([partida('lucas', 'joao', 0, 1)], competidores);
    assert.equal(linha(e, 'lucas').maiorVitoria, null);
  });

  test('última jogada é a mais recente do competidor', () => {
    const e = calcularEstatisticas(
      [
        partida('lucas', 'joao', 1, 0, { jogadaEm: 50 }),
        partida('lucas', 'ana', 1, 0, { jogadaEm: 90 }),
        partida('joao', 'ana', 1, 0, { jogadaEm: 70 }),
      ],
      competidores,
    );
    assert.equal(linha(e, 'lucas').ultimaJogadaEm, 90);
    assert.equal(linha(e, 'joao').ultimaJogadaEm, 70);
  });

  test('confrontos unem as duas orientações do mesmo par em ordem estável pela chave do nome', () => {
    const e = calcularEstatisticas(
      [
        partida('lucas', 'joao', 3, 1),
        partida('joao', 'lucas', 2, 2, { penaltisA: 4, penaltisB: 3 }),
        partida('lucas', 'joao', 0, 2),
      ],
      competidores,
    );
    assert.equal(e.confrontos.length, 1);
    // Chave do nome: "joao" vem antes de "lucas", então João é o ladoA.
    assert.deepEqual(e.confrontos[0], {
      ladoA: 'joao',
      ladoB: 'lucas',
      partidas: 3,
      vitoriasA: 1,
      vitoriasB: 1,
      empates: 1,
      golsA: 5,
      golsB: 5,
      penaltisVencidosA: 1,
      penaltisVencidosB: 0,
    });
  });

  test('confrontos ordenados por número de partidas', () => {
    const e = calcularEstatisticas(
      [partida('lucas', 'ana', 1, 0), partida('lucas', 'joao', 1, 0), partida('joao', 'lucas', 1, 0)],
      competidores,
    );
    assert.deepEqual(
      e.confrontos.map((c) => c.partidas),
      [2, 1],
    );
  });

  test('competidor desconhecido usa o id como nome', () => {
    const e = calcularEstatisticas([partida('fantasma', 'lucas', 1, 0)], competidores);
    assert.equal(linha(e, 'fantasma').nome, 'fantasma');
  });

  test('muitos competidores e partidas', () => {
    const muitos = Array.from({ length: 60 }, (_, i) => ({
      id: `c${i}`,
      nome: `Competidor ${String(i).padStart(2, '0')}`,
    }));
    const partidas = [];
    for (let i = 0; i < 5000; i++)
      partidas.push(
        partida(`c${i % 60}`, `c${(i * 7 + 1) % 60 === i % 60 ? (i + 1) % 60 : (i * 7 + 1) % 60}`, i % 5, (i * 3) % 4),
      );
    const inicio = performance.now();
    const e = calcularEstatisticas(partidas, muitos);
    assert.ok(performance.now() - inicio < 500);
    assert.equal(e.totais.partidas, 5000);
    assert.equal(e.tabela.length, 60);
    const somaPartidas = e.tabela.reduce((s, l) => s + l.partidas, 0);
    assert.equal(somaPartidas, 10_000);
    for (const l of e.tabela) assert.equal(l.vitorias + l.empates + l.derrotas, l.partidas);
  });
});
