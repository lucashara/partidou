export const ALFABETO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const TAMANHO_CONVITE = 12;
const TAMANHO_TRANSFERENCIA = 8;

/**
 * Maiúsculas, sem espaço nem hífen, O vira 0 e I e L viram 1 (confusões previstas pelo alfabeto Crockford).
 * @param {unknown} texto
 */
export function normalizarCodigo(texto) {
  return String(texto ?? '')
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * Insere hífen a cada `grupo` caracteres: `ABCD-EFGH-JKMN`. Código já agrupado não duplica hífen.
 * @param {string} codigo
 * @param {number} [grupo]
 */
export function formatarCodigo(codigo, grupo = 4) {
  const limpo = codigo.replaceAll('-', '');
  const partes = [];
  for (let i = 0; i < limpo.length; i += grupo) partes.push(limpo.slice(i, i + grupo));
  return partes.join('-');
}

/**
 * @param {unknown} texto
 * @param {number} tamanho
 */
function valido(texto, tamanho) {
  const codigo = normalizarCodigo(texto);
  return codigo.length === tamanho && [...codigo].every((c) => ALFABETO_CROCKFORD.includes(c));
}

export const codigoConviteValido = (/** @type {unknown} */ texto) => valido(texto, TAMANHO_CONVITE);
export const codigoTransferenciaValido = (/** @type {unknown} */ texto) => valido(texto, TAMANHO_TRANSFERENCIA);
