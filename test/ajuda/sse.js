// @ts-nocheck: testes usam objetos de resposta dinâmicos; os tipos do servidor são conferidos em server/.
// Cliente SSE mínimo para os testes: acumula o texto recebido e permite esperar por um trecho.
import http from 'node:http';

/**
 * @param {string} url
 * @param {string} caminho
 * @param {string} token
 */
export function abrirSse(url, caminho, token) {
  return new Promise((resolve, reject) => {
    const req = http.get(url + caminho, { headers: { Authorization: `Bearer ${token}` }, agent: false }, (res) => {
      let texto = '';
      let fechada = false;
      /** @type {Array<() => void>} */
      const ouvintes = [];
      res.setEncoding('utf8');
      res.on('data', (pedaco) => {
        texto += pedaco;
        for (const o of ouvintes) o();
      });
      res.on('close', () => {
        fechada = true;
        for (const o of ouvintes) o();
      });
      resolve({
        status: res.statusCode,
        cabecalhos: res.headers,
        texto: () => texto,
        fechada: () => fechada,
        /** Espera o texto acumulado satisfazer o predicado. */
        esperar(/** @type {(t: string, fechada: boolean) => boolean} */ predicado, ms = 2000) {
          return new Promise((ok, falha) => {
            const verificar = () => {
              if (predicado(texto, fechada)) ok(texto);
            };
            const timer = setTimeout(() => falha(new Error(`SSE sem o trecho esperado: ${JSON.stringify(texto)}`)), ms);
            ouvintes.push(() => {
              verificar();
              if (predicado(texto, fechada)) clearTimeout(timer);
            });
            verificar();
            if (predicado(texto, fechada)) clearTimeout(timer);
          });
        },
        fechar: () => req.destroy(),
      });
    });
    req.on('error', reject);
  });
}
