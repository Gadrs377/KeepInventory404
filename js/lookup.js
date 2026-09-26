// Descobre o que é um código de barras. Primeiro no armário, depois no Open
// Food Facts e nas lojas online brasileiras (pelo repassador em worker/).

import { productsByBarcode } from './store.js';
import { API_URL } from './config.js';

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'product_name,product_name_pt,generic_name_pt,brands,quantity,image_front_small_url';

export function isValidCode(code) {
  return /^\d{8,14}$/.test(code) || /^SEM-\d+$/.test(code);
}

// Dígito verificador dos códigos EAN/UPC/GTIN (8, 12, 13 e 14 números).
// O leitor da câmera já confere; isto pega erro de digitação no código manual.
export function checkDigitOk(code) {
  if (![8, 12, 13, 14].includes(code.length)) return true;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// Resolve com { status: 'local', products } quando o código já está no armário
// (um ou mais produtos), ou com o resultado de lookupRemote.
export async function lookup(code) {
  const local = code.startsWith('SEM-') ? [] : await productsByBarcode(code);
  if (local.length) return { status: 'local', products: local };
  return lookupRemote(code);
}

// Resolve com { status: 'found' | 'notfound' | 'offline', info? }
// Consulta Open Food Facts e as lojas (pelo repassador) ao mesmo tempo. As lojas
// têm nomes completos em português e cobrem limpeza e beleza, então têm preferência.
export async function lookupRemote(code) {
  if (code.startsWith('SEM-')) return { status: 'notfound' };
  if (!navigator.onLine) return { status: 'offline' };
  // As duas consultas começam juntas; quem achar primeiro com dados de loja ganha.
  const offPromise = lookupOff(code);
  const store = await lookupStores(code);
  if (store.status === 'found') return { status: 'found', info: store.info };
  const off = await offPromise;
  if (off.status === 'found') return off;
  if (store.status === 'offline' && off.status === 'offline') return { status: 'offline' };
  return { status: 'notfound' };
}

async function lookupOff(code) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${OFF_URL}${encodeURIComponent(code)}?fields=${FIELDS}`, { signal: ctrl.signal });
    if (res.status === 404) return { status: 'notfound' };
    if (!res.ok) return { status: 'offline' };
    const data = await res.json();
    const p = data.product;
    if (data.status !== 1 || !p) return { status: 'notfound' };
    const name = (p.product_name_pt || p.product_name || p.generic_name_pt || '').trim();
    const brand = (p.brands || '').split(',')[0].trim();
    const info = {
      name: capitalize(name),
      brand,
      size: (p.quantity || '').trim(),
      image: safeImage(p.image_front_small_url),
      source: 'off',
    };
    return { status: name ? 'found' : 'notfound', info };
  } catch {
    return { status: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

async function lookupStores(code) {
  try {
    const data = await apiGet(`/lookup?ean=${encodeURIComponent(code)}`, 9000);
    if (!data.found || !data.product || !data.product.name) return { status: 'notfound' };
    return { status: 'found', info: fromStore(data.product) };
  } catch {
    return { status: 'offline' };
  }
}

// Busca por nome nas lojas. Resolve com a lista de produtos (pode ser vazia).
// Lança erro se o repassador estiver fora do ar.
export async function searchStores(query, signal) {
  const data = await apiGet(`/search?q=${encodeURIComponent(query)}`, 9000, signal);
  return (data.results || []).filter((p) => p && p.name).map(fromStore);
}

function fromStore(p) {
  return {
    name: String(p.name || '').trim(),
    brand: String(p.brand || '').trim(),
    size: String(p.size || '').trim(),
    image: safeImage(p.image),
    category: String(p.category || ''),
    ean: /^\d{8,14}$/.test(p.ean || '') ? p.ean : '',
    source: 'loja',
  };
}

async function apiGet(path, timeout, outerSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const onAbort = () => ctrl.abort();
  if (outerSignal) outerSignal.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
  }
}

function capitalize(s) {
  return s ? s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1) : s;
}

function safeImage(url) {
  return typeof url === 'string' && url.startsWith('https://') ? url : '';
}

// Manda a foto da embalagem para a IA do repassador. Resolve com o que ela leu
// ({ brand, product, variant, size, query }) e as sugestões das lojas (results).
export async function identifyPhoto(dataUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${API_URL}/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ...data, results: (data.results || []).filter((p) => p && p.name).map(fromStore) };
  } finally {
    clearTimeout(timer);
  }
}
