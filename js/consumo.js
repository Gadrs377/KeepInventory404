// Ritmo de consumo e lista de compras sugerida, a partir do histórico.
// Conta como consumo: saídas e ajustes ou contagens que baixaram o estoque.
// Olha os últimos 60 dias; com menos de 7 dias de histórico, divide por 7 para
// não exagerar o ritmo de quem acabou de começar.

const DAY = 86400000;
const WINDOW_DAYS = 60;
const MIN_DAYS = 7;

/** Map code -> { perDay, used, days } */
export function consumptionByProduct(products, movements, now = Date.now()) {
  const since = now - WINDOW_DAYS * DAY;
  const used = new Map();
  const first = new Map();
  for (const m of movements) {
    if (m.at < since) continue;
    if (!first.has(m.code) || m.at < first.get(m.code)) first.set(m.code, m.at);
    if (m.delta < 0 && (m.type === 'saida' || m.type === 'ajuste' || m.type === 'contagem')) {
      used.set(m.code, (used.get(m.code) || 0) - m.delta);
    }
  }
  const out = new Map();
  for (const p of products) {
    const u = used.get(p.code) || 0;
    const start = Math.max(since, Math.min(p.createdAt || now, first.get(p.code) || now));
    const days = Math.max(MIN_DAYS, (now - start) / DAY);
    out.set(p.code, { perDay: u / days, used: u, days });
  }
  return out;
}

// "cerca de 3 por semana", "cerca de 2 por mês"
export function rateText(perDay) {
  if (!(perDay > 0)) return '';
  const week = perDay * 7;
  if (week >= 1) return `cerca de ${Math.round(week)} por semana`;
  const month = perDay * 30;
  return `cerca de ${Math.max(1, Math.round(month))} por mês`;
}

export function daysLeft(p, perDay) {
  if (!(perDay > 0)) return Infinity;
  return p.qty / perDay;
}

/**
 * Sugestões de compra: o que está no mínimo ou acaba antes da próxima compra.
 * `every` = dias entre uma compra e outra. Quantidade sugerida = o bastante
 * para chegar à próxima compra e ainda sobrar o mínimo.
 */
export function shoppingSuggestions(products, rates, every = 7) {
  const out = [];
  for (const p of products) {
    const r = rates.get(p.code) || { perDay: 0, used: 0 };
    const perDay = r.used >= 2 ? r.perDay : 0; // uma saída só não é ritmo
    const left = p.qty === 0 ? 0 : daysLeft(p, perDay);
    const low = p.minQty > 0 && p.qty <= p.minQty;
    const runsOut = perDay > 0 && left <= every;
    if (!low && !runsOut) continue;
    const target = Math.max(p.minQty + 1, Math.ceil(perDay * every) + p.minQty);
    const buy = Math.max(1, target - p.qty);
    let reason;
    if (p.qty === 0) reason = 'Zerado';
    else if (low) reason = `Acabando, tem ${p.qty}`;
    else reason = `Acaba em cerca de ${Math.max(1, Math.round(left))} dias`;
    out.push({ product: p, buy, reason, rate: rateText(perDay), left });
  }
  return out.sort((a, b) => a.left - b.left || a.product.name.localeCompare(b.product.name, 'pt-BR'));
}
