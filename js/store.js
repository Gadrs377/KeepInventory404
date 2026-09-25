// Regras de estoque. Toda mudança de quantidade passa por aqui e grava o
// movimento na mesma transação, para o número e o histórico nunca divergirem.

import { tx, promisify, getAll, get, put, del } from './db.js';

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

export function isLow(p) {
  return p.minQty > 0 && p.qty > 0 && p.qty <= p.minQty;
}

function newProduct(code, info = {}) {
  const now = Date.now();
  return {
    code,
    name: (info.name || '').trim() || 'Produto sem nome',
    brand: (info.brand || '').trim(),
    size: (info.size || '').trim(),
    image: info.image || '',
    qty: 0,
    minQty: clampInt(info.minQty ?? 1),
    source: info.source || 'manual',
    createdAt: now,
    updatedAt: now,
  };
}

// Aplica `delta` ao produto `code` e grava o movimento. `info` cria o produto se não existir.
async function move(code, type, delta, info) {
  const result = await tx(['products', 'movements'], 'readwrite', async (s) => {
    let p = await promisify(s.products.get(code));
    if (!p) {
      if (!info) throw new Error('Produto não cadastrado');
      p = newProduct(code, info);
    } else if (info && info.name) {
      // Permite corrigir nome/marca no momento da leitura.
      p = { ...p, name: info.name.trim() || p.name, brand: info.brand ?? p.brand, size: info.size ?? p.size, image: p.image || info.image || '' };
    }
    const qtyBefore = p.qty;
    const qtyAfter = qtyBefore + delta;
    if (qtyAfter < 0) throw new Error(`Só tem ${qtyBefore} no armário`);
    p = { ...p, qty: qtyAfter, updatedAt: Date.now() };
    await promisify(s.products.put(p));
    const movement = { code, type, delta, qtyBefore, qtyAfter, at: Date.now() };
    movement.id = await promisify(s.movements.add(movement));
    return { product: p, movement };
  });
  emit();
  return result;
}

export function addStock(code, n, info) {
  return move(code, 'entrada', clampInt(n, 1), info);
}

export function removeStock(code, n) {
  return move(code, 'saida', -clampInt(n, 1));
}

export async function setStock(code, n, type = 'ajuste') {
  const p = await getProduct(code);
  if (!p) throw new Error('Produto não cadastrado');
  const target = clampInt(n);
  if (target === p.qty) return { product: p, movement: null };
  return move(code, type, target - p.qty);
}

export async function updateProduct(code, fields) {
  const p = await getProduct(code);
  if (!p) throw new Error('Produto não cadastrado');
  const next = {
    ...p,
    name: (fields.name ?? p.name).trim() || p.name,
    brand: (fields.brand ?? p.brand).trim(),
    size: (fields.size ?? p.size).trim(),
    minQty: clampInt(fields.minQty ?? p.minQty),
    updatedAt: Date.now(),
  };
  await put('products', next);
  emit();
  return next;
}

// Cadastra sem mexer no estoque (usado pela contagem antes de salvar a quantidade).
export async function ensureProduct(code, info) {
  const existing = await getProduct(code);
  if (existing) return existing;
  const p = newProduct(code, info);
  await put('products', p);
  emit();
  return p;
}

export async function deleteProduct(code) {
  await tx(['products', 'movements'], 'readwrite', async (s) => {
    s.products.delete(code);
    const keys = await promisify(s.movements.index('code').getAllKeys(code));
    keys.forEach((k) => s.movements.delete(k));
  });
  emit();
}

// Desfaz um movimento, desde que seja o último do produto.
export async function undoMovement(id) {
  const result = await tx(['products', 'movements'], 'readwrite', async (s) => {
    const m = await promisify(s.movements.get(id));
    if (!m) throw new Error('Esse registro já foi desfeito');
    const all = await promisify(s.movements.index('code').getAll(m.code));
    const last = all.reduce((a, b) => (b.id > a.id ? b : a), all[0]);
    if (last.id !== id) throw new Error('Já houve outro registro depois deste');
    const p = await promisify(s.products.get(m.code));
    if (!p) throw new Error('Produto não existe mais');
    const restored = { ...p, qty: m.qtyBefore, updatedAt: Date.now() };
    await promisify(s.products.put(restored));
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

  await tx(['products', 'movements', 'meta'], 'readwrite', async (s) => {
    const now = Date.now();
    for (const [code, to] of targets) {
      const p = await promisify(s.products.get(code));
      if (!p || p.qty === to) continue;
      await promisify(s.movements.add({ code, type: 'contagem', delta: to - p.qty, qtyBefore: p.qty, qtyAfter: to, at: now }));
      await promisify(s.products.put({ ...p, qty: to, updatedAt: now }));
    }
    await promisify(s.meta.delete('countDraft'));
  });
  emit();
  return targets.length;
}

// ---------- Backup ----------

export async function exportData() {
  const [products, movements] = await Promise.all([getAll('products'), getAll('movements')]);
  return { app: 'KeepInventory404', version: 1, exportedAt: new Date().toISOString(), products, movements };
}

export async function importData(data) {
  if (!data || data.app !== 'KeepInventory404' || !Array.isArray(data.products) || !Array.isArray(data.movements)) {
    throw new Error('Esse arquivo não é um backup do KeepInventory404');
  }
  await tx(['products', 'movements', 'meta'], 'readwrite', async (s) => {
    await promisify(s.products.clear());
    await promisify(s.movements.clear());
    await promisify(s.meta.delete('countDraft'));
    for (const p of data.products) {
      if (typeof p.code !== 'string') continue;
      s.products.put({ ...newProduct(p.code, p), ...p, qty: clampInt(p.qty), minQty: clampInt(p.minQty) });
    }
    for (const m of data.movements) s.movements.put(m);
  });
  emit();
  return data.products.length;
}
