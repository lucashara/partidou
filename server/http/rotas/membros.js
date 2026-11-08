import { encerrarSessao, gerarTransferencia } from '../../nucleo/acesso.js';
import { removerMembro, sairDaResenha } from '../../nucleo/membros.js';
import { rota } from './definicao.js';

/** Remoção de membros, sessão e transferência de acesso entre aparelhos. */
export function rotasMembros() {
  /**
   * @param {import('../../tipos.js').Contexto} ctx
   * @param {import('../../tipos.js').Autenticacao} auth
   * @param {{ seq: number, membroId: string }} revogacao
   */
  function aposRevogacao(ctx, auth, { seq, membroId }) {
    ctx.eventos.revogarMembro(membroId);
    ctx.eventos.publicar(auth.resenhaId, seq);
    return { status: 204 };
  }

  return [
    // "eu" vem antes de ":mid" para não ser lido como identificador de membro.
    rota('DELETE', '/api/resenhas/:id/membros/eu', {}, ({ ctx, auth }) =>
      aposRevogacao(ctx, auth, sairDaResenha(ctx, auth)),
    ),

    rota('DELETE', '/api/resenhas/:id/membros/:mid', {}, ({ ctx, auth, params }) =>
      aposRevogacao(ctx, auth, removerMembro(ctx, auth, params.mid)),
    ),

    rota('POST', '/api/acesso/transferencia', {}, ({ ctx, auth }) => ({
      status: 201,
      corpo: gerarTransferencia(ctx, auth),
    })),

    rota('DELETE', '/api/sessao', {}, ({ ctx, auth }) => {
      encerrarSessao(ctx, auth);
      ctx.eventos.revogarSessao(auth.sessaoHash);
      return { status: 204 };
    }),
  ];
}
