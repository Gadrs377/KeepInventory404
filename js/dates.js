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

// "18 de outubro de 2026": a data grande da confirmação, como o iPhone escreve.
const longFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export function formatDateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return longFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

// "Daqui a 21 dias", "Vence hoje", "Venceu há 3 dias": a linha embaixo da data.
export function relativeDays(iso) {
  const n = daysUntil(iso);
  if (n < -1) return `Venceu há ${-n} dias`;
  if (n === -1) return 'Venceu ontem';
  if (n === 0) return 'Vence hoje';
  if (n === 1) return 'Vence amanhã';
  return `Daqui a ${n} dias`;
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

// ---------- Validade lida da embalagem (câmera ou texto colado) ----------
// O texto vem do leitor de texto (OCR) ou do "Escanear texto" do iPhone e
// traz ruído: lote, fabricação, hora, letras trocadas por números. Acha as
// datas, descarta o que é fabricação ou lote e fica com a validade.

const MONTH_NAMES = {
  JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5, JUN: 6, JUL: 7,
  AGO: 8, AUG: 8, SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12,
};
// Rótulos que vêm antes da data na embalagem.
const EXP_LABEL = /\b(VAL(IDADE)?|VALID|VENC(IMENTO)?|VCTO|VTO|EXP(IRY|IRA)?|CONSUMIR|BEST|BB|USE)\b|\bV\s*[:.]/g;
const FAB_LABEL = /\b(FAB(R(ICACAO|ICADO)?)?|PROD(UCAO|UZIDO)?|EMB(ALADO)?|MFG|MFD|F\s*[:.]|P\s*[:.]|D\s*[:.]?\s*F)\b/g;
const LOT_LABEL = /\b(LOTE?|LT|L\s*[:.])\b/g;

// Leitor confunde letras e números: só dentro de trechos que já têm número.
const OCR_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', T: '7', S: '5', B: '8', Z: '2', G: '6' };

function labelsBefore(re, text) {
  const at = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) at.push(m.index + m[0].length);
  return at;
}

/**
 * Resolve com { iso, raw } da validade encontrada no texto, ou null.
 * `today` (AAAA-MM-DD) serve para os testes.
 */
export function findExpiry(text, today = todayIso()) {
  let t = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  // "15 OUT 2026", "OUT/26", "15OUT26" -> meses em número
  t = t.replace(/(?:(\d{1,2})\s*[\/.\-]?\s*)?(?<![A-Z])(JAN|FEV|FEB|MAR|ABR|APR|MAI|MAY|JUN|JUL|AGO|AUG|SET|SEP|OUT|OCT|NOV|DEZ|DEC)[A-Z]*\.?\s*[\/.\-]?\s*(\d{2,4})\b/g,
    (_, d, mon, y) => `${d ? `${d}/` : ''}${String(MONTH_NAMES[mon]).padStart(2, '0')}/${y}`);
  // Rótulo grudado no número ("V25/03/27", "VAL10/26"): separa.
  t = t.replace(/\b(VAL(?:IDADE)?|VENC|VCTO|VTO|EXP|FAB|LOTE|LT|V|F|L|P)(?=\d)/g, '$1 ');
  // Corrige letras dentro de trechos com cara de data (tem dígito e separador).
  t = t.replace(/(?<![A-Z])[0-9OQDILTSBZG|]{1,4}(?:\s*[\/.\-]\s*[0-9OQDILTSBZG|]{1,4}){1,2}/g, (m) => (/\d/.test(m) ? m.replace(/[OQDILTSBZG|]/g, (c) => OCR_DIGIT[c]) : m));

  const exp = labelsBefore(EXP_LABEL, t);
  const fab = labelsBefore(FAB_LABEL, t);
  const lot = labelsBefore(LOT_LABEL, t);
  const near = (list, i) => list.some((p) => p <= i && i - p <= 6);

  const [ty, tm, td] = today.split('-').map(Number);
  const now = Date.UTC(ty, tm - 1, td);
  const found = [];
  const add = (raw, index, iso) => {
    if (!iso) return;
    const [y, m, d] = iso.split('-').map(Number);
    const days = (Date.UTC(y, m - 1, d) - now) / 86400000;
    if (days < -730 || days > 3650) return; // fora do razoável para validade
    let score = 0;
    if (near(exp, index)) score += 4;
    if (near(fab, index)) score -= 4;
    if (near(lot, index)) score -= 6;
    if (days >= -30) score += 1;
    found.push({ iso, raw, index, score });
  };
  const SEP = '\\s*[\\/.\\-]\\s*';
  // dia/mês/ano (ano com 2 ou 4 números)
  const dmy = new RegExp(`(?<![0-9])(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{4}|\\d{2})(?![0-9])`, 'g');
  let m;
  const used = [];
  while ((m = dmy.exec(t))) {
    used.push([m.index, m.index + m[0].length]);
    add(m[0], m.index, parseExpiry(`${m[1]}/${m[2]}/${m[3]}`));
  }
  // mês/ano, fora do que já virou dia/mês/ano ("10/26", "10/2026")
  const my = new RegExp(`(?<![0-9/.\\-])(\\d{1,2})${SEP}(\\d{4}|\\d{2})(?![0-9/.\\-]*\\d)`, 'g');
  while ((m = my.exec(t))) {
    if (used.some(([a, b]) => m.index >= a && m.index < b)) continue;
    if (Number(m[1]) < 1 || Number(m[1]) > 12) continue;
    add(m[0], m.index, parseExpiry(`${m[1]}/${m[2]}`));
  }
  // Tudo junto só com rótulo de validade na frente: "VAL 151026" ou "VAL15102026"
  const compact = /(\d{6}|\d{8})(?!\d)/g;
  while ((m = compact.exec(t))) {
    if (!near(exp, m.index)) continue;
    add(m[0], m.index, parseExpiry(m[1]));
  }
  if (!found.length) return null;
  // Maior pontuação; empate fica com a data mais distante (fabricação vem antes).
  found.sort((a, b) => b.score - a.score || b.iso.localeCompare(a.iso));
  return { iso: found[0].iso, raw: found[0].raw.trim() };
}

// O que vai no campo de validade enquanto a pessoa digita. Texto com letras ou
// comprido (colado, ou do "Escanear texto" do iPhone) passa por findExpiry;
// números digitados só ganham as barras.
export function expiryInputValue(raw) {
  const v = String(raw || '');
  if (/[A-Za-z]/.test(v) || v.replace(/\s/g, '').length > 10) {
    const found = findExpiry(v);
    if (found) {
      const [y, m, d] = found.iso.split('-');
      return `${d}/${m}/${y}`;
    }
  }
  return maskExpiry(v);
}

