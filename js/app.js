// Inicialização e roteador por hash.

import mountArmario from './views/armario.js';
import mountScan from './views/scan.js';
import mountInventario from './views/inventario.js';
import mountRevisao from './views/revisao.js';
import mountProduto from './views/produto.js';
import mountDados from './views/dados.js';
import mountCompras from './views/compras.js';
import mountCupons from './views/cupons.js';
import { closeSheet, hideStaleToast, $ } from './ui.js';
import { unlockAudio } from './sound.js';

const ROUTES = [
  [/^\/?$/, mountArmario],
  // Entrada e Saída são a mesma tela; o endereço só diz em que modo ela abre.
  [/^\/(entrada|saida)(?:\/([^/]+))?$/, (root, m) => mountScan(root, { mode: m[1], code: m[2] && decodeURIComponent(m[2]) })],
  [/^\/inventario$/, mountInventario],
  [/^\/revisao$/, mountRevisao],
  [/^\/produto\/([^/]+)$/, (root, m) => mountProduto(root, { code: decodeURIComponent(m[1]) })],
  [/^\/dados$/, mountDados],
  [/^\/compras$/, mountCompras],
  [/^\/cupons$/, mountCupons],
];

const root = $('#app');
let cleanup = null;
let navId = 0;

async function route() {
  const id = ++navId;
  const path = location.hash.replace(/^#/, '') || '/';
  closeSheet(null);
  hideStaleToast();
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch { /* ignora */ }
  }
  cleanup = null;

  const match = ROUTES.map(([re, view]) => [path.match(re), view]).find(([m]) => m);
  if (!match) {
    location.replace('#/');
    return;
  }
  const [m, view] = match;
  document.body.dataset.screen = view === mountArmario ? 'home' : 'other';
  const result = await view(root, m);
  if (id !== navId) {
    if (typeof result === 'function') result();
    return;
  }
  cleanup = result;
  const heading = root.querySelector('h1');
  if (heading) document.title = `${heading.textContent} | Armário`;
  window.scrollTo(0, 0);
}

unlockAudio();
window.addEventListener('hashchange', route);
route();

// Pede ao navegador para não apagar os dados sozinho.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then((ok) => ok || navigator.storage.persist()).catch(() => {});
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
