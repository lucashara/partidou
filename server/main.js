// Entrada do processo: sobe o servidor e encerra com segurança em SIGTERM e SIGINT.
import { lerConfiguracao } from './configuracao.js';
import { criarRegistro } from './registro.js';
import { criarServidor } from './servidor.js';

const config = lerConfiguracao();
const registro = criarRegistro({ diretorio: config.logDir });
const servidor = criarServidor(config, { registro });
await servidor.iniciar();

let encerrando = false;
async function encerrar(/** @type {string} */ sinal) {
  if (encerrando) return;
  encerrando = true;
  registro.info('encerrando', { sinal });
  setTimeout(() => process.exit(1), 8000).unref();
  await servidor.encerrar();
  process.exit(0);
}

// Estado indefinido após falha não tratada: registrar e deixar o supervisor reiniciar.
for (const evento of ['uncaughtException', 'unhandledRejection']) {
  process.on(evento, (motivo) => {
    registro.erro(evento, { mensagem: String(motivo?.message ?? motivo) });
    process.exit(1);
  });
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
