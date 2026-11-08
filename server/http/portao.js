// Teto de respostas grandes em andamento: cada uma fica na memória até o cliente ler tudo, e leitor lento a mantém.
/** @param {number} maximo */
export function criarPortao(maximo) {
  let emVoo = 0;
  return {
    /**
     * Reserva uma vaga até o fim da resposta; false quando o teto foi atingido.
     * @param {import('node:http').ServerResponse} res
     */
    entrar(res) {
      if (emVoo >= maximo) return false;
      emVoo += 1;
      res.once('close', () => {
        emVoo -= 1;
      });
      return true;
    },
    emVoo: () => emVoo,
  };
}
