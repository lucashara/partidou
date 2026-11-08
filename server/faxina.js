// Retenção: apaga o que já não autentica nem convida. Sem isso, sessões, convites e códigos só crescem.
import { SESSAO_VALIDADE_MS } from './nucleo/acesso.js';

const DIA_MS = 24 * 3600_000;
const RETENCAO_MS = 30 * DIA_MS;
export const INTERVALO_FAXINA_MS = 6 * 3600_000;

/**
 * Remove sessões e convites revogados ou expirados há mais de 30 dias e transferências usadas ou expiradas.
 * @param {Pick<import('./tipos.js').Contexto, 'banco' | 'relogio'>} ctx
 */
export function executarFaxina({ banco, relogio }) {
  const agora = relogio();
  const corte = agora - RETENCAO_MS;
  return banco.transacao(() => ({
    sessoes: banco.executar(
      'DELETE FROM sessoes WHERE (revogada_em IS NOT NULL AND revogada_em < ?) OR ultimo_uso_em < ?',
      corte,
      corte - SESSAO_VALIDADE_MS,
    ).changes,
    convites: banco.executar(
      'DELETE FROM convites WHERE (revogado_em IS NOT NULL AND revogado_em < ?) OR expira_em < ?',
      corte,
      corte,
    ).changes,
    transferencias: banco.executar('DELETE FROM transferencias WHERE usada_em IS NOT NULL OR expira_em < ?', agora)
      .changes,
  }));
}

/**
 * Agenda a faxina periódica; `executar` roda uma passada e registra o que removeu.
 * @param {Pick<import('./tipos.js').Contexto, 'banco' | 'relogio' | 'registro'>} ctx
 * @param {number} [intervaloMs]
 */
export function criarFaxina(ctx, intervaloMs = INTERVALO_FAXINA_MS) {
  function executar() {
    try {
      const removidos = executarFaxina(ctx);
      if (removidos.sessoes + removidos.convites + removidos.transferencias > 0) {
        ctx.registro.info('faxina', removidos);
      }
    } catch (e) {
      ctx.registro.erro('faxina_falhou', { mensagem: String(/** @type {Error} */ (e)?.message ?? e) });
    }
  }
  const temporizador = setInterval(executar, intervaloMs);
  temporizador.unref();
  return { executar, encerrar: () => clearInterval(temporizador) };
}
