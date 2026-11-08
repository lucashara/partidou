import { ErroApp, requisicaoInvalida } from '../erros.js';

export const LIMITE_CORPO = 16 * 1024;
export const CLIENTE_DESCONECTOU = 'CLIENTE_DESCONECTOU';

/** O corpo não foi lido por inteiro: a conexão precisa fechar depois da resposta. */
function corpoGrande() {
  return new ErroApp(413, 'CORPO_GRANDE', 'Corpo da requisição acima do limite de 16 KiB.', { fecharConexao: true });
}

/**
 * Lê o corpo JSON (objeto). Sem corpo devolve `{}`; rotas que exigem campos validam o objeto.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, any>>}
 */
export async function lerCorpoJson(req) {
  const declarado = Number(req.headers['content-length'] ?? 0);
  if (declarado > LIMITE_CORPO) throw corpoGrande();
  const temCorpo = declarado > 0 || req.headers['transfer-encoding'] !== undefined;
  if (!temCorpo) return {};
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
    throw new ErroApp(415, 'TIPO_NAO_SUPORTADO', 'Content-Type deve ser application/json.');
  }
  const partes = [];
  let total = 0;
  try {
    for await (const parte of req) {
      total += parte.length;
      if (total > LIMITE_CORPO) throw corpoGrande();
      partes.push(parte);
    }
  } catch (e) {
    if (e instanceof ErroApp) throw e;
    // Upload interrompido pelo cliente não é falha do servidor.
    throw new ErroApp(400, CLIENTE_DESCONECTOU, 'Conexão encerrada antes do fim do corpo.', { fecharConexao: true });
  }
  if (total === 0) return {};
  let valor;
  try {
    valor = JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    throw requisicaoInvalida('JSON inválido.');
  }
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw requisicaoInvalida('O corpo deve ser um objeto JSON.');
  }
  return valor;
}
