// Formatação de datas e números em pt-BR no fuso do aparelho.
import { diaLocal } from '../../compartilhado/datas.js';

const fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
const fDiaAno = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const limpar = (texto) => texto.replace('.', '');
const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

export const hora = (instante) => fHora.format(instante);

/** "Sáb, 7 nov" (com o ano quando não é o corrente). */
export function diaCurto(instante, agora = Date.now()) {
  const mesmoAno = new Date(instante).getFullYear() === new Date(agora).getFullYear();
  const partes = Object.fromEntries((mesmoAno ? fDia : fDiaAno).formatToParts(instante).map((p) => [p.type, p.value]));
  const base = `${capitalizar(limpar(partes.weekday))}, ${partes.day} ${limpar(partes.month)}`;
  return mesmoAno ? base : `${base} ${partes.year}`;
}

/** "Hoje", "Ontem" ou o dia curto. */
export function rotuloDia(instante, agora = Date.now()) {
  const dia = diaLocal(instante);
  if (dia === diaLocal(agora)) return 'Hoje';
  if (dia === diaLocal(agora - 86_400_000)) return 'Ontem';
  return diaCurto(instante, agora);
}

/** "há 5 min", "há 2 h", ou o dia curto a partir de 24 h. */
export function haQuanto(instante, agora = Date.now()) {
  const s = Math.max(0, Math.round((agora - instante) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `há ${Math.floor(s / 3600)} h`;
  return diaCurto(instante, agora);
}

export const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;

export const sinal = (n) => (n > 0 ? `+${n}` : String(n));
