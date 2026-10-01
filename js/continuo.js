// Remédio de uso contínuo: o app estima quantos comprimidos sobram pelo ritmo
// (quantos por dia) e avisa antes de acabar. É uma conta, não uma contagem:
// "Contar" na página do remédio corrige.
//
// p.cont = { perDay, perBox, n, at }: em `at` (ms) havia `n` comprimidos;
// cada dia saem `perDay`; cada caixa guardada soma `perBox`.

const DAY = 86400000;
export const CONT_WARN_DAYS = 7; // avisa "acabando" e põe nas Compras uma semana antes

// Comprimidos (ou cápsulas, drágeas...) por caixa, pelo tamanho da Anvisa:
// "0,5 mg, 30 comprimidos" -> 30. Sem número: 30, o mais comum.
export function perBoxOf(p) {
  const t = String((p && p.med && p.med.tamanho) || (p && p.size) || '');
  const m = t.match(/(\d+)\s*(comprimidos?|c[áa]psulas?|dr[áa]geas?|sach[êe]s?|ades[ií]vos?|unidades?)/i);
  return m ? Number(m[1]) : 30;
}

export function contLeft(p, now = Date.now()) {
  if (!p || !p.continuo || !p.cont) return null;
  const { perDay, n, at } = p.cont;
  return Math.max(0, n - (perDay * (now - at)) / DAY);
}

// Dias até acabar (fração), ou null quando não é de uso contínuo.
export function contDaysLeft(p, now = Date.now()) {
  const left = contLeft(p, now);
  if (left === null) return null;
  return p.cont.perDay > 0 ? left / p.cont.perDay : Infinity;
}

export function contLow(p, now = Date.now()) {
  const d = contDaysLeft(p, now);
  return d !== null && d <= CONT_WARN_DAYS;
}

// Liga o uso contínuo partindo das caixas que estão no armário, cheias.
export function contStart(p, perDay = 1) {
  const perBox = perBoxOf(p);
  return { perDay, perBox, n: Math.max(0, p.qty) * perBox, at: Date.now() };
}

// Caixas guardadas somam comprimidos (rebase em "agora").
export function contAdd(p, boxes, now = Date.now()) {
  const left = contLeft(p, now) ?? 0;
  return { ...p.cont, n: left + boxes * p.cont.perBox, at: now };
}

// "Acaba por volta de 7/10"
export function contEndText(p, now = Date.now()) {
  const d = contDaysLeft(p, now);
  if (d === null || !Number.isFinite(d)) return '';
  const end = new Date(now + d * DAY);
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'numeric' }).format(end);
}
