// Inicialização e roteador por hash.

import mountArmario from './views/armario.js';
import mountScan from './views/scan.js';
import mountInventario from './views/inventario.js';
import mountRevisao from './views/revisao.js';
import mountProduto from './views/produto.js';
import mountDados from './views/dados.js';
import mountCompras from './views/compras.js';
import mountCupons from './views/cupons.js';
import { closeSheet, closeMenu, hideStaleToast, collapsingTitle, toast, updateTabBar, $ } from './ui.js';
import { refreshShopBadge } from './shop.js';
import { onChange } from './store.js';
import { unlockAudio } from './sound.js';
import { enableSwipeBack } from './swipeBack.js';

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
  if (b === 'modal') return a === 'modal' ? '' : 'up';
  if (a === 'modal') return 'down';
  if (b > a) return 'push';
  if (b < a) return 'pop';
  // Entre abas: esmaecimento curto enquanto a pílula da barra anda.
  return 'tab';
}
let prevPath = null;
// Voltar pelo gesto da borda: a tela já saiu com o dedo, a de trás só esmaece.
let swipedBack = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

async function route() {
  const id = ++navId;
  const path = location.hash.replace(/^#/, '') || '/';
  const match = ROUTES.map(([re, view]) => [path.match(re), view]).find(([m]) => m);
  if (!match) {
    location.replace('#/');
    return;
  }
  const kind = swipedBack ? 'fade' : navKind(prevPath, path);
  swipedBack = false;
  prevPath = path;
  rememberTab(path);
  closeMenu();

  async function render() {
    closeSheet(null);
    hideStaleToast();
    settleSwipe();
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
    updateTabBar();
    const offTitle = collapsingTitle(root);
    cleanup = () => { offTitle(); if (typeof result === 'function') result(); };
    const heading = root.querySelector('h1');
    if (heading) document.title = `${heading.textContent} | Armário`;
    window.scrollTo(0, 0);
    refreshShopBadge();
  }

  if (kind && document.startViewTransition) {
    const html = document.documentElement;
    // "Reduzir movimento" ligado: no lugar de deslizar, um esmaecimento curto
    // (é o que a Apple recomenda: trocar movimento em x, y e z por fade).
    html.dataset.nav = reducedMotion.matches ? 'fade' : kind;
    const t = document.startViewTransition(render);
    t.ready.catch(() => {});
    t.finished.catch(() => {}).then(() => {
      if (html.dataset.nav === kind || html.dataset.nav === 'fade') delete html.dataset.nav;
      // Nomes de troca animada postos só para esta navegação (linha → produto).
      document.querySelectorAll('[data-vt]').forEach((el) => { el.style.viewTransitionName = ''; delete el.dataset.vt; });
    });
    try { await t.updateCallbackDone; } catch { /* a tela já foi desenhada ou falhou */ }
  } else {
    await render();
  }
}

unlockAudio();

// Abrir o app instalado volta para a aba em que a pessoa estava, como os apps
// do iPhone fazem. Só a aba: telas de detalhe e o leitor começam de novo.
const TAB_KEY = 'ki.tab';
const installed = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
function rememberTab(path) {
  if (!TAB_PATHS.includes(path)) return;
  try { localStorage.setItem(TAB_KEY, path); } catch { /* sem armazenamento */ }
}
if (installed && /^#?\/?$/.test(location.hash)) {
  let saved = null;
  try { saved = localStorage.getItem(TAB_KEY); } catch { /* sem armazenamento */ }
  if (saved && saved !== '/' && TAB_PATHS.includes(saved)) history.replaceState(null, '', `#${saved}`);
}

const settleSwipe = enableSwipeBack({
  root,
  // O link "Voltar" do topo da tela; nas abas e no leitor não há.
  backLink: () => {
    const path = location.hash.replace(/^#/, '') || '/';
    if (depth(path) === 0 || depth(path) === 'modal') return null;
    return root.querySelector('header a[href^="#/"][aria-label^="Voltar"]');
  },
  onCommit: (href) => {
    swipedBack = true;
    if (location.hash === href) { swipedBack = false; settleSwipe(); return; }
    location.hash = href;
  },
});

// Tamanho do texto escolhido no iPhone (Ajustes → Tela e Brilho → Tamanho do
// Texto, ou Acessibilidade): o Safari entrega em -apple-system-body. Vira a
// base do app (rem), de 14 a 34 px, o dobro do padrão de 17, como a Apple pede.
function applyTextSize() {
  if (!(window.CSS && CSS.supports && CSS.supports('font', '-apple-system-body'))) return;
  const probe = document.createElement('span');
  probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden;';
  document.body.append(probe);
  const px = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  if (!px) return;
  const size = Math.min(34, Math.max(14, px));
  document.documentElement.style.fontSize = `${size}px`;
  // Texto grande: blocos lado a lado viram uma coluna.
  document.documentElement.classList.toggle('text-large', size >= 22);
}
applyTextSize();
// A pessoa pode mudar o tamanho com o app aberto em segundo plano.
document.addEventListener('visibilitychange', () => { if (!document.hidden) applyTextSize(); });

// Material que acende a partir do toque (liquid glass): o ponto vai para
// --press-x/--press-y e o CSS desenha o brilho enquanto o botão está pressionado.
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.scan-fab, .floating-bar .btn, .mode-opt span, .btn-primary, .btn-mode');
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--press-x', `${e.clientX - r.left}px`);
  el.style.setProperty('--press-y', `${e.clientY - r.top}px`);
}, { passive: true });
window.addEventListener('hashchange', route);
onChange(() => refreshShopBadge());

// Sem internet o app continua funcionando; só não busca nomes nas lojas.
window.addEventListener('offline', () => toast('Sem internet. O armário continua funcionando; nomes novos você digita.', { duration: 4500 }));
window.addEventListener('online', () => toast('Internet de volta.', { duration: 2000 }));
route();

// Pede ao navegador para não apagar os dados sozinho.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then((ok) => ok || navigator.storage.persist()).catch(() => {});
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
