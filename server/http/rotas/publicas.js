import { usarTransferencia } from '../../nucleo/acesso.js';
import { aceitarConvite, consultarConvite } from '../../nucleo/convites.js';
import { criarResenha, validarNovaResenha } from '../../nucleo/resenhas.js';
import { muitasTentativas } from '../respostas.js';
import { rota, textoDoCorpo } from './definicao.js';

/** Rotas sem token. As de código passam pelo bloqueio por falhas no app. */
export function rotasPublicas() {
  return [
    rota('POST', '/api/resenhas', { publica: true }, ({ ctx, corpo, ip }) => {
      const entrada = validarNovaResenha(corpo);
      const espera = ctx.limitador.criacao(ip);
      if (espera) throw muitasTentativas(espera);
      return { status: 201, corpo: criarResenha(ctx, entrada) };
    }),

    rota('POST', '/api/convites/consultar', { publica: true, porCodigo: true }, ({ ctx, corpo }) => ({
      status: 200,
      corpo: consultarConvite(ctx, textoDoCorpo(corpo, 'codigo')),
    })),

    rota('POST', '/api/convites/aceitar', { publica: true, porCodigo: true }, ({ ctx, corpo }) => {
      const codigo = textoDoCorpo(corpo, 'codigo');
      const apelido = textoDoCorpo(corpo, 'apelido');
      const { seq, ...resposta } = aceitarConvite(ctx, codigo, apelido);
      ctx.eventos.publicar(resposta.resenha.id, seq);
      return { status: 201, corpo: resposta };
    }),

    rota('POST', '/api/acesso/transferencia/usar', { publica: true, porCodigo: true }, ({ ctx, corpo }) => ({
      status: 200,
      corpo: usarTransferencia(ctx, textoDoCorpo(corpo, 'codigo')),
    })),
  ];
}
