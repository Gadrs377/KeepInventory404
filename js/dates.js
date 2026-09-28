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
const EXP_LABEL = /\b(VAL(IDADE)?|VALID|VENC(IMENTO)?|VCTO|VTO|EXP(IRY|IRA)?|CONSUMIR|ANTES\s*DE|BEST|BB|USE)\b|\bV(?=\s*[:.]?\s*\d)/g;
// "VAL:" mal lido em tinta impressa, visto nos vídeos reais (RL:, BL:, U9L:,
// UAL:, URL:, UPL:): duas ou três letras terminando em L, no começo da
// linha, com dois-pontos e uma data logo depois. Não começa com F/P (FAB e
// PROD mal lidos) nem L (lote), não é ML, e a data tem de vir depois de
// qualquer fabricação no texto e não ter passado há mais de 60 dias.
const LOOSE_EXP_LABEL = /(?<=(?:^|\n)[ \t]*)(?![FPL]|ML\b)[A-Z0-9]{1,2}L(?=[ \t]*:[ \t]*\d)/g;
const RECENT_DAYS = -60;
const FAB_LABEL = /\b(FAB(R(ICACAO|ICADO)?)?|PROD(UCAO|UZIDO)?|EMB(ALADO)?|MFG|MFD)\b|\b[FP](?=\s*[:.]?\s*\d)/g;
const LOT_LABEL = /\b(LOTE?|LT)\b|\bL(?=\s*[:.]?\s*\d)/g;

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
 * Candidatos de validade. Rótulos FAB/LOTE excluem a data, não apenas reduzem
 * sua pontuação. Se houver ambiguidade, a câmera oferece escolha manual.
 * `today` (AAAA-MM-DD) serve para os testes.
 */
export function findExpiryCandidates(text, today = todayIso()) {
  let t = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  // Confusão observada no Paddle: OUT -> 0UT. Correção limitada a nomes de
  // meses junto de ano; não transforma palavras/lotes arbitrários em datas.
  t = t.replace(/\b(0UT|0CT|N0V)(?=\s*[/.\-]?\s*\d{2,4}\b)/g, m => m.replace('0', 'O'));
  // "15 OUT 2026", "OUT/26", "15OUT26" -> meses em número
  t = t.replace(/(?:(\d{1,2})\s*[\/.\-]?\s*)?(?<![A-Z])(JAN|FEV|FEB|MAR|ABR|APR|MAI|MAY|JUN|JUL|AGO|AUG|SET|SEP|OUT|OCT|NOV|DEZ|DEC)[A-Z]*\.?\s*[\/.\-]?\s*(\d{2,4})\b/g,
    (_, d, mon, y) => `${d ? `${d}/` : ''}${String(MONTH_NAMES[mon]).padStart(2, '0')}/${y}`);
  // A correção O -> 0 fica restrita ao início de uma data após V/F.
  t = t.replace(/\b([VF])O(?=\d[ \t/.-])/g, (_, label) => `${label}0`);
  t = t.replace(/\b([VF])\s*\.:/g, '$1:');
  // Rótulo grudado no número ("V25/03/27", "VAL10/26"): separa.
  t = t.replace(/\b(VAL(?:IDADE)?|VENC|VCTO|VTO|EXP|FAB|LOTE|LT|V|F|L|P)(?=\d)/g, '$1 ');
  // Corrige letras dentro de trechos com cara de data (tem dígito e separador).
  t = t.replace(/(?<![A-Z])[0-9OQDILTSBZG|]{1,4}(?:\s*[\/.\-]\s*[0-9OQDILTSBZG|]{1,4}){1,2}/g, (m) => (/\d/.test(m) ? m.replace(/[OQDILTSBZG|]/g, (c) => OCR_DIGIT[c]) : m));

  const exp = labelsBefore(EXP_LABEL, t);
  const loose = labelsBefore(LOOSE_EXP_LABEL, t);
  const fab = labelsBefore(FAB_LABEL, t);
  // Cabeçalho junto, "VAL/LOTE: 11/08/27 L123" ou "FAB/LOTE: …": a data vem
  // primeiro e é do rótulo anterior à barra; o LOTE fala do código depois.
  const lot = labelsBefore(LOT_LABEL, t).filter((end) => {
    const start = t.lastIndexOf('/', end);
    return !(start >= 0 && end - start <= 6 && [...exp, ...fab].some((p) => start - p >= 0 && start - p <= 2));
  });
  const labelAt = (i) => {
    const labels = [...exp.map(p => [p, 'expiry']), ...loose.map(p => [p, 'loose']), ...fab.map(p => [p, 'manufacture']), ...lot.map(p => [p, 'lot'])]
      .filter(([p]) => p <= i && i - p <= 48).sort((a, b) => b[0] - a[0]);
    if (!labels.length) return null;
    const [p, label] = labels[0];
    // Another number between label and candidate breaks that association.
    return /\d/.test(t.slice(p, i)) ? null : label;
  };

  const [ty, tm, td] = today.split('-').map(Number);
  const now = Date.UTC(ty, tm - 1, td);
  const found = [];
  const fabDates = [];
  const add = (raw, index, iso) => {
    if (!iso) return;
    const [y, m, d] = iso.split('-').map(Number);
    const days = (Date.UTC(y, m - 1, d) - now) / 86400000;
    let label = labelAt(index);
    // Fora do razoável para validade. Com "VAL" escrito na frente, uma data de
    // anos atrás é real (o sabonete esquecido no armário, vencido em 2021);
    // sem rótulo, provavelmente é outra coisa (fabricação, lote, leitura errada).
    if (days > 3650 || days < (label === 'expiry' ? -3650 : -730)) return;
    if (label === 'manufacture') { fabDates.push(iso); return; }
    if (label === 'lot') return;
    const loose = label === 'loose' && days > RECENT_DAYS;
    let score = label === 'expiry' || loose ? 4 : 0;
    if (days >= -30) score += 1;
    found.push({ iso, raw: raw.trim(), index, score, days, labeled: label === 'expiry' || loose, labelBy: label === 'expiry' ? 'label' : loose ? 'loose-label' : null });
  };
  const SEP = '\\s*[\\/.\\-]\\s*';
  // dia/mês/ano (ano com 2 ou 4 números)
  const dmy = new RegExp(`(?<![0-9])(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{4}|\\d{2})(?![0-9])`, 'g');
  let m;
  const used = [];
  // Recognize ISO first, so a suffix cannot be interpreted as month/year.
  const ymd = /(?<![\dA-Z])(20\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/g;
  while ((m = ymd.exec(t))) {
    used.push([m.index, m.index + m[0].length]);
    add(m[0], m.index, parseExpiry(`${m[3]}/${m[2]}/${m[1]}`));
  }
  while ((m = dmy.exec(t))) {
    if (used.some(([a, b]) => m.index >= a && m.index < b)) continue;
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
  const compact = /(?<![\dA-Z])(\d{8}|\d{6}|\d{4})(?![\dA-Z])/g;
  while ((m = compact.exec(t))) {
    if (labelAt(m.index) !== 'expiry') continue;
    add(m[0], m.index, parseExpiry(m[1]));
  }
  // Missing separators: only accept under an explicit validity label.
  const spaced = /(?<![\dA-Z])(\d{1,2})[ \t]+(\d{1,2})[ \t]+(20\d{2}|\d{2})(?!\d)/g;
  while ((m = spaced.exec(t))) {
    used.push([m.index, m.index + m[0].length]);
    if (labelAt(m.index) === 'expiry') add(m[0], m.index, parseExpiry(`${m[1]}/${m[2]}/${m[3]}`));
  }
  // Mês e ano separados por espaço; não cruza linhas nem extrai sufixo D M A.
  const spacedMonth = /(?<![\dA-Z/.\-])(\d{1,2})[ \t]+(20\d{2}|\d{2})(?![\dA-Z]|[ \t]+\d)/g;
  while ((m = spacedMonth.exec(t))) {
    if (used.some(([a, b]) => m.index >= a && m.index < b)) continue;
    if (labelAt(m.index) === 'expiry') add(m[0], m.index, parseExpiry(`${m[1]}/${m[2]}`));
  }
  if (!found.length) return [];
  // Rótulo mal lido antes de uma data que não passa da fabricação: não confia.
  for (const f of found) if (f.labelBy === 'loose-label' && fabDates.some((d) => d >= f.iso)) { f.labeled = false; f.labelBy = null; f.score -= 4; }
  found.sort((a, b) => b.score - a.score || b.iso.localeCompare(a.iso));
  const byIso = new Map();
  for (const f of found) if (!byIso.has(f.iso)) byIso.set(f.iso, f);
  const unique = [...byIso.values()];
  // Sem rótulo junto da data, mas o bloco diz qual é: uma única data futura
  // que sobrou (a) numa etiqueta com fabricação ("FAB:05/08/24" numa linha,
  // "17/09/26" na outra; a validade vem depois da fabricação) ou (b) com um
  // rótulo de validade em outra parte do recorte ("CONSUMIR ANTES DE" longe
  // da data). Precisa vir depois de toda fabricação lida e não ter passado há
  // mais de 60 dias.
  if (unique.length === 1 && !unique[0].labeled && unique[0].days > RECENT_DAYS) {
    const only = unique[0];
    const afterFab = (fabDates.length || /\bFAB\s*[:.]/.test(t)) && fabDates.every((f) => f < only.iso);
    const labelElsewhere = exp.length > 0;
    if (afterFab || labelElsewhere) { only.labeled = true; only.labelBy = afterFab ? 'fab-block' : 'label-elsewhere'; }
  }
  const preferred = unique.filter(f => f.labeled);
  const choices = preferred.length ? preferred : unique;
  return choices.map(({ days, ...f }) => ({ ...f, ambiguous: choices.length > 1 }));
}

export function findExpiry(text, today = todayIso()) {
  const choices = findExpiryCandidates(text, today);
  return choices.length === 1 ? { iso: choices[0].iso, raw: choices[0].raw } : null;
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
    // Do not strip a rejected FAB/LOTE label and accidentally accept its digits.
    if (/[A-Za-z]/.test(v)) return '';
  }
  return maskExpiry(v);
}
