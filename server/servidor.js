// Composição: banco, limites, SSE, estáticos e servidor HTTP. Separado de main.js para os testes subirem o servidor real.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from './banco.js';
import { criarEstaticos } from './estaticos.js';
import { criarEventos } from './eventos.js';
import { criarFaxina } from './faxina.js';
import { criarApp } from './http/app.js';
import { criarPortao } from './http/portao.js';
import { criarLimitador } from './limitador.js';
import { criarRegistro } from './registro.js';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
// Estado completo de 5000 partidas tem cerca de 2 MB: 16 respostas ao mesmo tempo cabem folgadas no heap de 160 MB.
const ESTADOS_SIMULTANEOS = 16;

/**
 * @param {import('./configuracao.js').Configuracao} config
 * @param {{ relogio?: () => number, registro?: import('./registro.js').Registro, espelhoDoRegistro?: boolean,
 *   limites?: object, conexoesSse?: object, estadosSimultaneos?: number, diretorios?: { publico: string, compartilhado: string } }} [opcoes]
 */
export function criarServidor(config, opcoes = {}) {
  const relogio = opcoes.relogio ?? Date.now;
  const registro =
    opcoes.registro ?? criarRegistro({ diretorio: config.logDir, espelho: opcoes.espelhoDoRegistro ?? true });
  const banco = abrirBanco(config.dbPath);
  const limitador = criarLimitador({ relogio, limites: opcoes.limites });
  const eventos = criarEventos(opcoes.conexoesSse);
  const estaticos = criarEstaticos(
    opcoes.diretorios ?? { publico: `${RAIZ}public`, compartilhado: `${RAIZ}compartilhado` },
    { recarregar: config.dev },
  );
  const portaoDeEstado = criarPortao(opcoes.estadosSimultaneos ?? ESTADOS_SIMULTANEOS);
  const ctx = { banco, config, relogio, eventos, limitador, registro, estaticos, portaoDeEstado };
  const faxina = criarFaxina(ctx);
  const http = createServer(criarApp(ctx));
  http.keepAliveTimeout = 65_000;
  http.headersTimeout = 15_000;
  http.requestTimeout = 30_000;

  return {
    ctx,
    http,
    /** Escuta em `porta` (0 escolhe uma efêmera) e devolve a porta efetiva. */
    iniciar(porta = config.port, host = config.host) {
      return new Promise((resolver, rejeitar) => {
        http.once('error', rejeitar);
        http.listen(porta, host, () => {
          http.off('error', rejeitar);
          const endereco = /** @type {import('node:net').AddressInfo} */ (http.address());
          faxina.executar();
          registro.info('iniciado', { porta: endereco.port, host, ativos: estaticos.versao() });
          resolver(endereco.port);
        });
      });
    },
    /** Fecha SSE, para de aceitar conexões, aguarda as em curso e fecha o banco. */
    async encerrar() {
      eventos.encerrar();
      limitador.encerrar();
      faxina.encerrar();
      await new Promise((resolver) => {
        http.close(() => resolver(undefined));
        http.closeIdleConnections();
        setTimeout(() => http.closeAllConnections(), 3000).unref();
      });
      banco.fechar();
    },
  };
}
