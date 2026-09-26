// Inicialização e roteador por hash.

import mountArmario from './views/armario.js';
import mountScan from './views/scan.js';
import mountInventario from './views/inventario.js';
import mountRevisao from './views/revisao.js';
import mountProduto from './views/produto.js';
import mountDados from './views/dados.js';
import mountCompras from './views/compras.js';
import mountCupons from './views/cupons.js';
import { closeSheet, closeMenu, hideStaleToast, $ } from './ui.js';
import { refreshShopBadge } from './shop.js';
import { onChange } from './store.js';
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

// Tipo de transição entre telas, como no iPhone: as abas trocam no lugar
// (esmaecem), telas de detalhe entram pela direita e voltam para a direita,
// o leitor sobe de baixo como uma tela modal.
const TAB_PATHS = ['/', '/compras', '/cupons', '/dados'];
function depth(path) {
  if (/^\/(entrada|saida)/.test(path)) return 'modal';
  if (TAB_PATHS.includes(path)) return 0;
  if (path === '/revisao') return 2;
  return 1;
}
function navKind(from, to) {
  if (from === null) return '';
  const a = depth(from);
  const b = depth(to);
  if (b === 'modal') return a === 'modal' ? 'fade' : 'up';
  if (a === 'modal') return 'down';
  if (b > a) return 'push';
  if (b < a) return 'pop';
  return 'fade';
}
let prevPath = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

async function route() {
  const id = ++navId;
  const path = location.hash.replace(/^#/, '') || '/';
  const match = ROUTES.map(([re, view]) => [path.match(re), view]).find(([m]) => m);
  if (!match) {
    location.replace('#/');
    return;
  }
  const kind = navKind(prevPath, path);
  prevPath = path;
  closeMenu();

  async function render() {
    closeSheet(null);
    hideStaleToast();
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch { /* ignora */ }
    }
    cleanup = null;
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
    refreshShopBadge();
  }

  if (kind && document.startViewTransition && !reducedMotion.matches) {
    const html = document.documentElement;
    html.dataset.nav = kind;
    const t = document.startViewTransition(render);
    t.finished.catch(() => {}).then(() => { if (html.dataset.nav === kind) delete html.dataset.nav; });
    try { await t.updateCallbackDone; } catch { /* a tela já foi desenhada ou falhou */ }
  } else {
    await render();
  }
}

unlockAudio();

// Material que acende a partir do toque (liquid glass): o ponto vai para
// --press-x/--press-y e o CSS desenha o brilho enquanto o botão está pressionado.
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.scan-fab, .floating-bar .btn, .mode-opt span');
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--press-x', `${e.clientX - r.left}px`);
  el.style.setProperty('--press-y', `${e.clientY - r.top}px`);
}, { passive: true });
window.addEventListener('hashchange', route);
onChange(() => refreshShopBadge());
route();

// Pede ao navegador para não apagar os dados sozinho.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then((ok) => ok || navigator.storage.persist()).catch(() => {});
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
