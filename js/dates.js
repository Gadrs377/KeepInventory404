// Datas de validade: leitura do que a pessoa digita, textos curtos e o
// arquivo de calendário (.ics).

export const SOON_DAYS = 7;    // aviso forte: vence nesta semana
export const WATCH_DAYS = 30;  // filtro "Vencendo"

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Lê a validade como vem impressa na embalagem: "15/10/26", "15/10/2026",
 * "10/26" ou "10/2026". Só mês e ano vale até o último dia do mês.
 * Devolve AAAA-MM-DD ou '' se não der para entender.
 */
export function parseExpiry(text) {
  const parts = String(text || '').trim().split(/[^\d]+/).filter(Boolean);
  let d; let m; let y;
  if (parts.length === 1) {
    const s = parts[0];
    if (s.length === 4) [m, y] = [s.slice(0, 2), s.slice(2)];
    else if (s.length === 6) {
      // DDMMAA, e se o mês não fizer sentido, MMAAAA.
      if (Number(s.slice(2, 4)) >= 1 && Number(s.slice(2, 4)) <= 12) [d, m, y] = [s.slice(0, 2), s.slice(2, 4), s.slice(4)];
      else [m, y] = [s.slice(0, 2), s.slice(2)];
    } else if (s.length === 8) [d, m, y] = [s.slice(0, 2), s.slice(2, 4), s.slice(4)];
    else return '';
  } else if (parts.length === 2) [m, y] = parts;
  else if (parts.length === 3) [d, m, y] = parts;
  else return '';
  let year = Number(y);
  if (y.length === 2) year += 2000;
  else if (y.length !== 4) return '';
  const month = Number(m);
  if (!(month >= 1 && month <= 12) || year < 2000 || year > 2099) return '';
  const day = d === undefined ? lastDay(year, month) : Number(d);
  if (!(day >= 1 && day <= lastDay(year, month))) return '';
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Coloca as barras enquanto a pessoa digita: 151026 -> 15/10/26.
export function maskExpiry(text) {
  const digits = String(text || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  // Mês/ano com 4 dígitos (10/2026): o "mês" 20 não existe, então é ano.
  if (Number(digits.slice(2, 4)) > 12) return `${digits.slice(0, 2)}/${digits.slice(2, 6)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function daysUntil(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}

export function formatDate(iso, withYear = true) {
  const [y, m, d] = iso.split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

// "Venceu 12/09", "Vence hoje", "Vence amanhã", "Vence em 5 dias", "Vence 15/10"
export function expiryText(iso) {
  const n = daysUntil(iso);
  if (n < 0) return `Venceu ${formatDate(iso, false)}`;
  if (n === 0) return 'Vence hoje';
  if (n === 1) return 'Vence amanhã';
  if (n <= SOON_DAYS) return `Vence em ${n} dias`;
  return `Vence ${formatDate(iso, n > 300)}`;
}

// Arquivo .ics com um evento no dia da validade e alarme 3 dias antes.
export function icsFor(items) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const escText = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const events = items.map(({ name, qty, expiresAt, uid }) => {
    const day = expiresAt.replace(/-/g, '');
    const [y, m, d] = expiresAt.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '');
    return [
      'BEGIN:VEVENT',
      `UID:${uid}@keepinventory404`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${escText(`Vence: ${name}${qty > 1 ? ` (${qty})` : ''}`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escText(`${name} vence em 3 dias`)}`,
      'TRIGGER:-P3D',
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KeepInventory404//Armario//PT', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}
