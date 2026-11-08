// Servidor real para o Playwright: banco temporário e limites folgados para os fluxos criarem várias resenhas.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerConfiguracao } from '../server/configuracao.js';
import { criarRegistro } from '../server/registro.js';
import { criarServidor } from '../server/servidor.js';

const PORTA = Number(process.env.E2E_PORTA ?? 8802);
const pasta = mkdtempSync(join(tmpdir(), 'partidou-e2e-'));
const config = { ...lerConfiguracao({}), dbPath: join(pasta, 'e2e.db'), logDir: null };

const servidor = criarServidor(config, {
  registro: criarRegistro({ diretorio: null, espelho: false }),
  limites: {
    criacaoPorHora: 100_000,
    semTokenPorMinuto: 100_000,
    escritaPorMinuto: 100_000,
    leituraPorMinuto: 100_000,
    falhasAntesDoBloqueio: 100_000,
    disjuntorFalhasPorHora: 100_000_000,
  },
});
await servidor.iniciar(PORTA, '127.0.0.1');

async function encerrar() {
  await servidor.encerrar();
  rmSync(pasta, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
