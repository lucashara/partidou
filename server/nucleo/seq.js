/**
 * Avança o contador de mudanças da resenha; deve rodar dentro da transação que altera as linhas.
 * @param {import("../tipos.js").Banco} banco
 * @param {string} resenhaId
 */
export function proximoSeq(banco, resenhaId) {
  const linha = banco.um('UPDATE resenhas SET seq = seq + 1 WHERE id = ? RETURNING seq', resenhaId);
  if (!linha) throw new Error('Resenha inexistente ao avançar o seq.');
  return /** @type {number} */ (linha.seq);
}
