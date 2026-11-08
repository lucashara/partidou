// Log em JSON por linha, com rotação por tamanho (10 arquivos de 5 MB). Nunca registrar corpo, token nem código.
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NOME = 'partidou';

/**
 * @typedef {(evento: string, dados?: Record<string, unknown>) => void} Escritor
 * @typedef {{ info: Escritor, aviso: Escritor, erro: Escritor }} Registro
 */

/**
 * @param {{ diretorio: string | null, maxBytes?: number, arquivos?: number, espelho?: boolean }} opcoes
 *   `diretorio` nulo desliga a escrita em arquivo (testes).
 * @returns {Registro}
 */
export function criarRegistro({ diretorio, maxBytes = 5 * 1024 * 1024, arquivos = 10, espelho = true }) {
  if (diretorio) mkdirSync(diretorio, { recursive: true });
  const atual = diretorio ? join(diretorio, `${NOME}.log`) : null;

  function rotacionar(/** @type {string} */ arquivo, /** @type {number} */ tamanhoNovo) {
    if (!existsSync(arquivo) || statSync(arquivo).size + tamanhoNovo <= maxBytes) return;
    rmSync(`${arquivo}.${arquivos - 1}`, { force: true });
    for (let i = arquivos - 2; i >= 1; i--) {
      if (existsSync(`${arquivo}.${i}`)) renameSync(`${arquivo}.${i}`, `${arquivo}.${i + 1}`);
    }
    renameSync(arquivo, `${arquivo}.1`);
  }

  function escrever(/** @type {string} */ nivel, /** @type {string} */ evento, /** @type {object} */ dados) {
    const linha = `${JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...dados })}\n`;
    if (atual) {
      // Disco cheio ou sem permissão não pode derrubar o servidor; o espelho em stdout continua.
      try {
        rotacionar(atual, Buffer.byteLength(linha));
        appendFileSync(atual, linha);
      } catch {
        process.stdout.write(
          `${JSON.stringify({ t: new Date().toISOString(), nivel: 'erro', evento: 'log_arquivo_indisponivel' })}\n`,
        );
      }
    }
    if (espelho) process.stdout.write(linha);
  }

  return {
    info: (evento, dados = {}) => escrever('info', evento, dados),
    aviso: (evento, dados = {}) => escrever('aviso', evento, dados),
    erro: (evento, dados = {}) => escrever('erro', evento, dados),
  };
}
