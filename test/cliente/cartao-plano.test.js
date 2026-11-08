import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ALTURA, planejarCartao } from '../../public/js/cartao-plano.js';

/**
 * @param {number} n
 * @param {(indice: number) => boolean} [comPenaltis]
 */
const partidasDe = (n, comPenaltis = () => false) =>
  Array.from({ length: n }, (_, i) => ({ penaltis: comPenaltis(i) }));

describe('plano do cartão de resumo', () => {
  test('nenhuma combinação invade a faixa do rodapé', () => {
    for (let tabela = 0; tabela <= 9; tabela++) {
      for (let n = 0; n <= 30; n++) {
        for (const regra of /** @type {((i: number) => boolean)[]} */ ([() => false, () => true, (i) => i % 2 === 0])) {
          const plano = planejarCartao({ linhasTabela: tabela, partidas: partidasDe(n, regra) });
          const ultimo = plano.partidas?.itens.at(-1);
          const fim = ultimo ? ultimo.topo + ultimo.altura : (plano.tabela?.primeiraY ?? 0);
          assert.ok(fim <= plano.rodape.y, `tabela ${tabela}, partidas ${n}: bloco termina em ${fim}`);
          assert.ok(plano.rodape.y + plano.rodape.altura === ALTURA);
        }
      }
    }
  });

  test('com 15 partidas e pênaltis ainda mostra ao menos 5 e informa as omitidas', () => {
    const plano = planejarCartao({ linhasTabela: 6, partidas: partidasDe(15, (i) => i % 3 === 0) });
    assert.equal(plano.tabela?.linhas, 5);
    assert.ok((plano.partidas?.itens.length ?? 0) >= 5);
    assert.equal(plano.partidas?.omitidas, 15 - (plano.partidas?.itens.length ?? 0));
  });

  test('os itens se empilham sem sobreposição e na ordem recebida', () => {
    const plano = planejarCartao({ linhasTabela: 3, partidas: partidasDe(6, (i) => i === 1) });
    const itens = plano.partidas?.itens ?? [];
    for (const [i, item] of itens.entries()) {
      assert.equal(item.indice, i);
      if (i > 0) assert.equal(item.topo, itens[i - 1].topo + itens[i - 1].altura);
    }
    assert.ok(itens[1].altura > itens[0].altura, 'a linha com pênaltis é mais alta');
  });

  test('sem partidas e sem tabela só restam o painel e o rodapé', () => {
    const plano = planejarCartao({ linhasTabela: 0, partidas: [] });
    assert.equal(plano.tabela, null);
    assert.equal(plano.partidas, null);
  });
});
