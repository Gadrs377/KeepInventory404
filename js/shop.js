// Estado da lista de compras (marcados, itens soltos, frequência) e o número
// na aba Compras. Fica no localStorage deste celular.

import { listProducts, recentMovements } from './store.js';
import { consumptionByProduct, shoppingSuggestions } from './consumo.js';

const KEY = 'ki.shop';

export function loadShop() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { every: Number(s.every) || 7, checked: s.checked || {}, extra: Array.isArray(s.extra) ? s.extra : [] };
  } catch {
    return { every: 7, checked: {}, extra: [] };
  }
}

export function saveShop(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sem armazenamento */ }
  refreshShopBadge();
}

// Põe um item solto na lista (pelo menu do Armário). Não repete o que já está lá.
export function addToShopList(name) {
  const state = loadShop();
  const exists = state.extra.some((x) => !x.checked && x.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
  if (!exists) state.extra.push({ id: Date.now(), name, checked: false });
  saveShop(state);
  return !exists;
}

export async function shopSuggestions(every) {
  const [list, moves] = await Promise.all([listProducts(), recentMovements(5000)]);
  return { products: list, items: shoppingSuggestions(list, consumptionByProduct(list, moves), every) };
}

// Número na aba Compras: o que ainda falta pegar, como o contador do iPhone.
let badgeRun = 0;
export async function refreshShopBadge() {
  const run = ++badgeRun;
  const link = document.querySelector('.tab-item[href="#/compras"]');
  // Barra escondida (leitor, produto): não recalcula a cada leitura.
  if (!link || link.closest('.is-hidden')) return;
  const state = loadShop();
  const { items } = await shopSuggestions(state.every);
  if (run !== badgeRun || !link.isConnected) return;
  const n = items.filter((i) => !state.checked[i.product.code]).length + state.extra.filter((x) => !x.checked).length;
  let badge = link.querySelector('.tab-badge');
  if (!n) { if (badge) badge.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'tab-badge';
    link.querySelector('.tab-icons').append(badge);
  }
  badge.innerHTML = `<span aria-hidden="true">${n > 99 ? '99+' : n}</span><span class="sr-only">, ${n} ${n === 1 ? 'item' : 'itens'} para comprar</span>`;
  // Número mudou: o selo dá um pulo (na primeira vez que aparece, só entra).
  if (badge.dataset.n && badge.dataset.n !== String(n)) {
    badge.classList.remove('is-bump');
    void badge.offsetWidth;
    badge.classList.add('is-bump');
  }
  badge.dataset.n = String(n);
}
