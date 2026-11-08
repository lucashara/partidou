import { rotacionarChave } from '../../nucleo/acesso.js';
import { gerarConvite, revogarConvite } from '../../nucleo/convites.js';
import { obterEstado, seqDaResenha } from '../../nucleo/estado.js';
import { excluirResenha, renomearResenha } from '../../nucleo/resenhas.js';
import { muitasTentativas } from '../respostas.js';
import { RESPOSTA_DIRETA, rota } from './definicao.js';

export function rotasResenhas() {
  return [
    rota('GET', '/api/resenhas/:id/estado', {}, ({ ctx, res, auth, query }) => {
      if (!ctx.portaoDeEstado.entrar(res)) throw muitasTentativas(2);
      const bruto = query.get('desde');
      const desde = bruto !== null && /^\d+$/.test(bruto) ? Number(bruto) : undefined;
      return { status: 200, corpo: obterEstado(ctx, auth, desde) };
    }),

    rota('GET', '/api/resenhas/:id/eventos', {}, ({ ctx, res, auth, cabecalhos }) => {
      const seq = seqDaResenha(ctx.banco, auth.resenhaId);
      if (!ctx.eventos.assinar(res, cabecalhos, auth, seq)) throw muitasTentativas(10);
      return RESPOSTA_DIRETA;
    }),

    rota('PATCH', '/api/resenhas/:id', {}, ({ ctx, auth, corpo }) => {
      const { resenha, seq } = renomearResenha(ctx, auth, corpo.nome);
      ctx.eventos.publicar(auth.resenhaId, seq);
      return { status: 200, corpo: { resenha, seq } };
    }),

    rota('DELETE', '/api/resenhas/:id', {}, ({ ctx, auth }) => {
      excluirResenha(ctx, auth);
      ctx.eventos.revogarResenha(auth.resenhaId);
      return { status: 204 };
    }),

    rota('POST', '/api/resenhas/:id/convite', {}, ({ ctx, auth }) => ({ status: 201, corpo: gerarConvite(ctx, auth) })),

    rota('DELETE', '/api/resenhas/:id/convite', {}, ({ ctx, auth }) => {
      revogarConvite(ctx, auth);
      return { status: 204 };
    }),

    rota('POST', '/api/resenhas/:id/chave-recuperacao', {}, ({ ctx, auth }) => ({
      status: 200,
      corpo: rotacionarChave(ctx, auth),
    })),
  ];
}
