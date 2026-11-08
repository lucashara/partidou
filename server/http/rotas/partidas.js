import { renomearCompetidor } from '../../nucleo/competidores.js';
import { criarPartida, editarPartida, excluirPartida, restaurarPartida } from '../../nucleo/partidas.js';
import { rota } from './definicao.js';

const revDaQuery = (/** @type {URLSearchParams} */ query) => {
  const bruto = query.get('rev');
  return bruto !== null && /^\d+$/.test(bruto) ? Number(bruto) : undefined;
};

/**
 * Publica o novo seq quando houve mudança e devolve o corpo sem o marcador interno.
 * @param {import('../../tipos.js').Contexto} ctx
 * @param {import('../../tipos.js').Autenticacao} auth
 * @param {number} status
 * @param {{ mudou: boolean, seq: number, [campo: string]: unknown }} resultado
 */
function concluir(ctx, auth, status, { mudou, ...resposta }) {
  if (mudou) ctx.eventos.publicar(auth.resenhaId, resposta.seq);
  return { status, corpo: resposta };
}

export function rotasPartidas() {
  return [
    rota('POST', '/api/resenhas/:id/partidas', {}, ({ ctx, auth, corpo }) => {
      const { status, ...resultado } = criarPartida(ctx, auth, corpo);
      return concluir(ctx, auth, status, resultado);
    }),

    rota('PATCH', '/api/resenhas/:id/partidas/:pid', {}, ({ ctx, auth, params, corpo }) =>
      concluir(ctx, auth, 200, editarPartida(ctx, auth, params.pid, corpo)),
    ),

    rota('DELETE', '/api/resenhas/:id/partidas/:pid', {}, ({ ctx, auth, params, query }) =>
      concluir(ctx, auth, 200, excluirPartida(ctx, auth, params.pid, revDaQuery(query))),
    ),

    rota('POST', '/api/resenhas/:id/partidas/:pid/restaurar', {}, ({ ctx, auth, params, corpo }) =>
      concluir(ctx, auth, 200, restaurarPartida(ctx, auth, params.pid, corpo.rev)),
    ),

    rota('PATCH', '/api/resenhas/:id/competidores/:cid', {}, ({ ctx, auth, params, corpo }) => {
      const resposta = renomearCompetidor(ctx, auth, params.cid, corpo.nome);
      return concluir(ctx, auth, 200, { ...resposta, mudou: true });
    }),
  ];
}
