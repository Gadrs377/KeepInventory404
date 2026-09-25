// Descobre o que é um código de barras. Primeiro no armário, depois no Open Food Facts.

import { getProduct } from './store.js';

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'product_name,product_name_pt,generic_name_pt,brands,quantity,image_front_small_url';

export function isValidCode(code) {
  return /^\d{8,14}$/.test(code) || /^SEM-\d+$/.test(code);
}

// Resolve com { status: 'local' | 'found' | 'notfound' | 'offline', product?, info? }
export async function lookup(code) {
  const local = await getProduct(code);
  if (local) return { status: 'local', product: local };
  if (code.startsWith('SEM-')) return { status: 'notfound' };
  if (!navigator.onLine) return { status: 'offline' };

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

function capitalize(s) {
  return s ? s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1) : s;
}

function safeImage(url) {
  return typeof url === 'string' && url.startsWith('https://') ? url : '';
}
