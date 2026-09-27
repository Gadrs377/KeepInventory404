// Regras de estoque. Toda mudança de quantidade passa por aqui e grava o
// movimento na mesma transação, para o número e o histórico nunca divergirem.

import { tx, promisify, getAll, get, put, del } from './db.js';
import { guessArea, AREA_IDS } from './areas.js';

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn()); }

const clampInt = (n, min = 0, max = 9999) => Math.min(max, Math.max(min, Math.round(Number(n) || 0)));

export async function listProducts() {
  return getAll('products');
}

export async function getProduct(code) {
  return get('products', code);
}

// Todos os produtos que têm este código de barras (normalmente um, às vezes vários).
export async function productsByBarcode(barcode) {
  return tx('products', 'readonly', (s) => promisify(s.products.index('barcodes').getAll(barcode)));
}

// Identificador para um produto novo. O primeiro produto de um código usa o
// próprio código (compatível com a v1); os seguintes ganham um sufixo.
export async function newProductId(barcode) {
  if (!(await getProduct(barcode))) return barcode;
  return `${barcode}~${Date.now().toString(36)}`;
}

export function isLow(p) {
  return p.minQty > 0 && p.qty > 0 && p.qty <= p.minQty;
}

function defaultBarcodes(code) {
  if (code.startsWith('SEM-')) return [];
  return [code.split('~')[0]];
}

function newProduct(code, info = {}) {
  const now = Date.now();
  return {
    code,
    barcodes: Array.isArray(info.barcodes) ? info.barcodes : defaultBarcodes(code),
    name: (info.name || '').trim() || 'Produto sem nome',
    brand: (info.brand || '').trim(),
    size: (info.size || '').trim(),
    image: info.image || '',
    category: (info.category || '').trim(),
    area: AREA_IDS.includes(info.area) ? info.area : guessArea(info),
    qty: 0,
    minQty: clampInt(info.minQty ?? 1),
    source: info.source || 'manual',
    createdAt: now,
    updatedAt: now,
    // Remédio achado na base da Anvisa: princípio ativo, tarja, registro etc.
    ...(info.med ? { med: info.med } : {}),
  };
}

// ---------- Lotes (validade) ----------
// Cada entrada pode ter uma validade: vira um lote { code, qty, expiresAt }.
// A soma dos lotes nunca passa da quantidade do produto; o resto são unidades
// sem data. Quando a quantidade cai, saem primeiro as unidades sem data (as mais
// antigas) e depois os lotes que vencem antes.

export const isIsoDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

async function lotsOf(s, code) {
  return (await promisify(s.lots.index('code').getAll(code))).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.id - b.id);
}

async function trimLots(s, lots, qty) {
  let excess = lots.reduce((a, l) => a + l.qty, 0) - qty;
  for (const lot of lots) {
    if (excess <= 0) break;
    const take = Math.min(lot.qty, excess);
    excess -= take;
    if (take === lot.qty) await promisify(s.lots.delete(lot.id));
    else await promisify(s.lots.put({ ...lot, qty: lot.qty - take }));
  }
}

// Aplica `delta` ao produto `code` e grava o movimento. `info` cria o produto se não existir.
// `expiresAt`, numa entrada: uma data (AAAA-MM-DD) para todas as unidades, ou
// uma lista [{ expiresAt, qty }] quando cada parte vence num dia.
async function move(code, type, delta, info, expiresAt) {
  const dated = (Array.isArray(expiresAt) ? expiresAt : [{ expiresAt, qty: delta }])
    .filter((l) => l && isIsoDate(l.expiresAt));
  const result = await tx(['products', 'movements', 'lots'], 'readwrite', async (s) => {
    let p = await promisify(s.products.get(code));
    if (!p) {
      if (!info) throw new Error('Esse produto não está mais no armário.');
      p = newProduct(code, info);
    } else if (info && info.name) {
      // Permite corrigir nome/marca no momento da leitura.
      p = { ...p, name: info.name.trim() || p.name, brand: info.brand ?? p.brand, size: info.size ?? p.size, image: p.image || info.image || '' };
    }
    const qtyBefore = p.qty;
    const qtyAfter = qtyBefore + delta;
    if (qtyAfter < 0) throw new Error(`Só tem ${qtyBefore} no armário. Tire ${qtyBefore} ou menos.`);
    const lotsBefore = await lotsOf(s, code);
    if (delta > 0 && dated.length) {
      let rest = delta; // a soma das datas nunca passa do que entrou
      for (const l of dated) {
        const qty = Math.min(clampInt(l.qty, 1), rest);
        if (qty <= 0) break;
        await promisify(s.lots.add({ code, qty, expiresAt: l.expiresAt, addedAt: Date.now() }));
        rest -= qty;
      }
    } else if (delta < 0) {
      await trimLots(s, lotsBefore, qtyAfter);
    }
    p = { ...p, qty: qtyAfter, updatedAt: Date.now() };
    await promisify(s.products.put(p));
    const movement = { code, type, delta, qtyBefore, qtyAfter, at: Date.now(), lotsBefore };
    if (delta > 0 && dated.length) movement.expiresAt = dated[0].expiresAt;
    movement.id = await promisify(s.movements.add(movement));
    return { product: p, movement };
  });
  emit();
  return result;
}

export function addStock(code, n, info, expiresAt) {
  return move(code, 'entrada', clampInt(n, 1), info, expiresAt);
}

export function removeStock(code, n) {
  return move(code, 'saida', -clampInt(n, 1));
}

export async function setStock(code, n, type = 'ajuste') {
  const p = await getProduct(code);
  if (!p) throw new Error('Esse produto não está mais no armário.');
  const target = clampInt(n);
  if (target === p.qty) return { product: p, movement: null };
  return move(code, type, target - p.qty);
}

export async function lotsFor(code) {
  return tx('lots', 'readonly', (s) => lotsOf(s, code));
}

export async function listLots() {
  return (await getAll('lots')).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

// Dá validade a unidades que já estão no armário sem data.
export async function addLot(code, n, expiresAt) {
  if (!isIsoDate(expiresAt)) throw new Error('Digite a data de validade.');
  const qty = clampInt(n, 1);
  await tx(['products', 'lots'], 'readwrite', async (s) => {
    const p = await promisify(s.products.get(code));
    if (!p) throw new Error('Esse produto não está mais no armário.');
    const lots = await lotsOf(s, code);
    const free = p.qty - lots.reduce((a, l) => a + l.qty, 0);
    if (qty > free) throw new Error(free ? `Só ${free === 1 ? 'uma unidade está' : `${free} unidades estão`} sem validade.` : 'Todas as unidades já têm validade.');
    await promisify(s.lots.add({ code, qty, expiresAt, addedAt: Date.now() }));
  });
  emit();
}

export async function removeLot(id) {
  await del('lots', id);
  emit();
}

export async function updateProduct(code, fields) {
  const p = await getProduct(code);
  if (!p) throw new Error('Esse produto não está mais no armário.');
  const next = {
    ...p,
    name: (fields.name ?? p.name).trim() || p.name,
    brand: (fields.brand ?? p.brand).trim(),
    size: (fields.size ?? p.size).trim(),
    minQty: clampInt(fields.minQty ?? p.minQty),
    area: AREA_IDS.includes(fields.area) ? fields.area : (p.area || guessArea(p)),
    updatedAt: Date.now(),
  };
  await put('products', next);
  emit();
  return next;
}

// Guarda mais um código de barras num produto (embalagem nova, código trocado).
export async function addBarcode(code, barcode) {
  const p = await getProduct(code);
  if (!p) throw new Error('Esse produto não está mais no armário.');
  const barcodes = Array.isArray(p.barcodes) ? p.barcodes : [];
  if (barcodes.includes(barcode)) return p;
  const next = { ...p, barcodes: [...barcodes, barcode], updatedAt: Date.now() };
  await put('products', next);
  emit();
  return next;
}

// Cadastra sem mexer no estoque (usado pela contagem antes de salvar a quantidade).
// Corrigir um cadastro feito à mão: troca nome, marca, tamanho e foto pelos
// dados de uma loja e, se veio de uma leitura, passa a reconhecer o código.
export async function applyInfo(code, info, barcode = '') {
  const p = await getProduct(code);
  if (!p) throw new Error('Esse produto não está mais no armário.');
  const barcodes = Array.isArray(p.barcodes) ? p.barcodes.slice() : [];
  if (barcode && !barcodes.includes(barcode)) barcodes.push(barcode);
  const next = {
    ...p,
    name: String(info.name || '').trim() || p.name,
    brand: String(info.brand ?? p.brand ?? '').trim(),
    size: String(info.size ?? p.size ?? '').trim(),
    image: info.image || p.image || '',
    category: info.category || p.category || '',
    source: info.source || 'loja',
    barcodes,
    updatedAt: Date.now(),
  };
  // Remédio: vai para o ambiente Remédios e fica sem foto.
  if (info.med) Object.assign(next, { med: info.med, area: 'remedios', image: '' });
  await put('products', next);
  emit();
  return next;
}

export async function ensureProduct(code, info) {
  const existing = await getProduct(code);
  if (existing) return existing;
  const p = newProduct(code, info);
  await put('products', p);
  emit();
  return p;
}

export async function deleteProduct(code) {
  await tx(['products', 'movements', 'lots'], 'readwrite', async (s) => {
    s.products.delete(code);
    const keys = await promisify(s.movements.index('code').getAllKeys(code));
    keys.forEach((k) => s.movements.delete(k));
    const lotKeys = await promisify(s.lots.index('code').getAllKeys(code));
    lotKeys.forEach((k) => s.lots.delete(k));
  });
  emit();
}

// Desfaz um movimento, desde que seja o último do produto.
export async function undoMovement(id) {
  const result = await tx(['products', 'movements', 'lots'], 'readwrite', async (s) => {
    const m = await promisify(s.movements.get(id));
    if (!m) throw new Error('Esse registro já foi desfeito.');
    const all = await promisify(s.movements.index('code').getAll(m.code));
    const last = all.reduce((a, b) => (b.id > a.id ? b : a), all[0]);
    if (last.id !== id) throw new Error('Não dá para desfazer: já houve outro registro depois deste.');
    const p = await promisify(s.products.get(m.code));
    if (!p) throw new Error('Esse produto não está mais no armário.');
    const restored = { ...p, qty: m.qtyBefore, updatedAt: Date.now() };
    await promisify(s.products.put(restored));
    // Volta os lotes para como estavam antes do movimento.
    if (Array.isArray(m.lotsBefore)) {
      const now = await promisify(s.lots.index('code').getAllKeys(m.code));
      for (const k of now) await promisify(s.lots.delete(k));
      for (const lot of m.lotsBefore) await promisify(s.lots.put(lot));
    }
    await promisify(s.movements.delete(id));
    return restored;
  });
  emit();
  return result;
}

export async function movementsFor(code, limit = 50) {
  const list = await tx('movements', 'readonly', (s) => promisify(s.movements.index('code').getAll(code)));
  return list.sort((a, b) => b.at - a.at).slice(0, limit);
}

export async function recentMovements(limit = 100) {
  const list = await getAll('movements');
  return list.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ---------- Inventário (contagem) ----------

export async function getCountDraft() {
  const row = await get('meta', 'countDraft');
  return row ? row.value : null;
}

export async function saveCountDraft(draft) {
  await put('meta', { key: 'countDraft', value: draft });
}

export async function discardCountDraft() {
  await del('meta', 'countDraft');
}

export async function startCount() {
  const draft = (await getCountDraft()) || { startedAt: Date.now(), counts: {} };
  await saveCountDraft(draft);
  return draft;
}

export async function setCounted(code, n) {
  const draft = await startCount();
  draft.counts[code] = clampInt(n);
  await saveCountDraft(draft);
  return draft;
}

export function diffCount(products, draft) {
  const changes = [];
  const missing = [];
  for (const p of products) {
    if (Object.hasOwn(draft.counts, p.code)) {
      const counted = draft.counts[p.code];
      if (counted !== p.qty) changes.push({ product: p, from: p.qty, to: counted });
    } else {
      missing.push(p);
    }
  }
  return { changes, missing };
}

export async function applyCount(zeroMissing) {
  const draft = await getCountDraft();
  if (!draft) return 0;
  const products = await listProducts();
  const { changes, missing } = diffCount(products, draft);
  const targets = changes.map((c) => [c.product.code, c.to]);
  if (zeroMissing) missing.filter((p) => p.qty > 0).forEach((p) => targets.push([p.code, 0]));

  await tx(['products', 'movements', 'meta', 'lots'], 'readwrite', async (s) => {
    const now = Date.now();
    for (const [code, to] of targets) {
      const p = await promisify(s.products.get(code));
      if (!p || p.qty === to) continue;
      const lotsBefore = await lotsOf(s, code);
      if (to < p.qty) await trimLots(s, lotsBefore, to);
      await promisify(s.movements.add({ code, type: 'contagem', delta: to - p.qty, qtyBefore: p.qty, qtyAfter: to, at: now, lotsBefore }));
      await promisify(s.products.put({ ...p, qty: to, updatedAt: now }));
    }
    await promisify(s.meta.delete('countDraft'));
  });
  emit();
  return targets.length;
}

// ---------- Cupons ----------
// Os últimos cupons ficam em meta.receipts (mais novo primeiro).

const MAX_RECEIPTS = 60;

export async function listReceipts() {
  const row = await get('meta', 'receipts');
  return row && Array.isArray(row.value) ? row.value : [];
}

export async function saveReceipt(receipt) {
  const list = await listReceipts();
  const entry = { id: Date.now(), at: Date.now(), ...receipt };
  await put('meta', { key: 'receipts', value: [entry, ...list].slice(0, MAX_RECEIPTS) });
  return entry;
}

// ---------- Nota fiscal (NFC-e) ----------
// meta.nfceMap: "CNPJ:código do mercado" → código do produto. É assim que o app
// aprende: na primeira nota a pessoa diz qual produto é; nas próximas entra sozinho.
// meta.notas: chaves das notas já importadas (para avisar antes de somar duas vezes).

async function metaValue(key, fallback) {
  const row = await get('meta', key);
  return row && row.value ? row.value : fallback;
}

export function nfceMap() {
  return metaValue('nfceMap', {});
}

export async function learnNfce(pairs) {
  const map = await nfceMap();
  for (const [k, code] of pairs) map[k] = code;
  await put('meta', { key: 'nfceMap', value: map });
}

export async function notaImported(key) {
  return (await metaValue('notas', {}))[key] || null;
}

export async function markNota(key, info) {
  const notas = await metaValue('notas', {});
  notas[key] = { at: Date.now(), ...info };
  await put('meta', { key: 'notas', value: notas });
}

// Último preço pago, vindo da nota: { value, unit, store, at }.
export async function setLastPrice(code, price) {
  const p = await getProduct(code);
  if (!p) return;
  await put('products', { ...p, lastPrice: price });
}

// ---------- Backup ----------

export async function exportData() {
  const [products, movements, lots, receipts, nfce, notas] = await Promise.all([getAll('products'), getAll('movements'), getAll('lots'), listReceipts(), nfceMap(), metaValue('notas', {})]);
  return { app: 'KeepInventory404', version: 2, exportedAt: new Date().toISOString(), products, movements, lots, receipts, nfceMap: nfce, notas };
}

export async function importData(data) {
  if (!data || data.app !== 'KeepInventory404' || !Array.isArray(data.products) || !Array.isArray(data.movements)) {
    throw new Error('Esse arquivo não é um backup do Armário.');
  }
  await tx(['products', 'movements', 'meta', 'lots'], 'readwrite', async (s) => {
    await promisify(s.products.clear());
    await promisify(s.movements.clear());
    await promisify(s.lots.clear());
    await promisify(s.meta.delete('countDraft'));
    if (Array.isArray(data.receipts)) await promisify(s.meta.put({ key: 'receipts', value: data.receipts.slice(0, MAX_RECEIPTS) }));
    if (data.nfceMap && typeof data.nfceMap === 'object') await promisify(s.meta.put({ key: 'nfceMap', value: data.nfceMap }));
    if (data.notas && typeof data.notas === 'object') await promisify(s.meta.put({ key: 'notas', value: data.notas }));
    for (const p of data.products) {
      if (typeof p.code !== 'string') continue;
      const base = newProduct(p.code, p);
      s.products.put({ ...base, ...p, barcodes: base.barcodes, area: AREA_IDS.includes(p.area) ? p.area : base.area, qty: clampInt(p.qty), minQty: clampInt(p.minQty) });
    }
    for (const m of data.movements) s.movements.put(m);
    // Backups da versão 1 não têm lotes.
    for (const l of Array.isArray(data.lots) ? data.lots : []) {
      if (l && typeof l.code === 'string' && isIsoDate(l.expiresAt) && l.qty > 0) s.lots.put(l);
    }
  });
  emit();
  return data.products.length;
}
