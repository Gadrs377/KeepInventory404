// Componentes compartilhados: escape de HTML, etiqueta, folha, aviso, seletor e confirmação.

import { ICONS } from './icons.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Etiqueta de gôndola. O texto oculto dá o sentido do número para leitores de tela.
export function tag(qty, state = '', srLabel = 'No armário') {
  const sr = srLabel ? `<span class="sr-only">${esc(srLabel)}: </span>` : '';
  return `<span class="tag ${state}">${sr}<span class="tag-n">${qty}</span></span>`;
}

// Texto do estado do estoque, para não depender só da cor da etiqueta.
export function stockNote(p) {
  if (p.qty === 0) return 'Zerado';
  if (p.minQty > 0 && p.qty <= p.minQty) return 'Acabando';
  return '';
}

// Pílula de estado: fica separada do nome e da marca, como os selos de
// estoque dos apps de inventário. O texto diz o estado; a cor só reforça.
// Tipos: low (acabando), zero, soon (vence em até 7 dias), watch (até 30),
// expired (já venceu), new (produto novo).
export function pill(kind, text) {
  const ico = { soon: 'calendar', watch: 'calendar', expired: 'calendar', low: 'hourglass', zero: 'dashed' }[kind];
  return `<span class="pill pill-${kind}">${ico ? icon(ico) : ''}${esc(text)}</span>`;
}

export function stockPill(p) {
  if (p.qty === 0) return pill('zero', 'Zerado');
  if (p.minQty > 0 && p.qty <= p.minQty) return pill('low', 'Acabando');
  return '';
}

// Depois de tirar: o aviso conta o que isso mudou, não só o número.
// "Acabando" já põe o produto na lista de compras (sugestão automática).
export function afterUseText(p) {
  if (p.minQty > 0 && p.qty <= p.minQty) {
    return p.qty === 0 ? ' Acabou; já está na lista de compras.' : ' Está acabando; já está na lista de compras.';
  }
  return p.qty === 0 ? ' Acabou.' : '';
}

export function tagState(p) {
  if (p.qty === 0) return 'is-zero';
  if (p.minQty > 0 && p.qty <= p.minQty) return 'is-low';
  return '';
}

// Foto da embalagem por cima de um ícone de pacote; se a foto falhar, sobra o ícone.
// Remédio nunca mostra foto: só o ícone de comprimido.
const medLike = (p) => !!p && (p.area === 'remedios' || !!p.med);
export function thumb(p, size = 'sm') {
  const med = medLike(p);
  const img = p && p.image && !med
    ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<span class="thumb thumb-${size}${med ? ' thumb-med' : ''}" aria-hidden="true">${icon(med ? 'pill' : 'package')}${img}</span>`;
}

// Fim da lista de sugestões quando houve foto: nenhuma serve? Usa o que a foto
// leu. A própria foto aparece, com o nome lido embaixo, para conferir antes.
export function photoPickRow(p, alone = false) {
  return `
    ${alone ? '' : '<li class="pick-caption" aria-hidden="true">Nenhuma dessas?</li>'}
    <li>
      <button type="button" class="pick-row suggest-row suggest-photo" data-photo-use>
        ${thumb(p)}
        <span class="row-main">
          <span class="row-name">Usar o que a foto leu</span>
          <span class="row-sub">${esc(p.name)}</span>
        </span>
        ${icon('chevron', 'row-chevron')}
      </button>
    </li>`;
}

// Marca e tamanho. Em remédio, o princípio ativo vem antes (o nome comercial
// não diz o que é), a não ser que o nome já seja o princípio ativo (genérico).
export function subtitle(p) {
  if (p && p.med && p.med.substancia) {
    const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const first = fold(p.name) === fold(p.med.substancia) ? p.brand : p.med.substancia;
    return [first, p.size].filter(Boolean).map(esc).join(', ');
  }
  return [p.brand, p.size].filter(Boolean).map(esc).join(', ');
}

// Retorno tátil. Android: navigator.vibrate. iPhone: o Safari não tem vibrate,
// mas desde o iOS 18 alternar um <input type="checkbox" switch> dispara o
// háptico do sistema; um interruptor invisível é alternado a cada chamada.
// Só funciona dentro de um toque da pessoa (não na leitura automática).
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function iosHaptic() {
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}

export function vibrate(ms = 40) {
  try {
    if (navigator.vibrate && navigator.vibrate(ms)) return;
  } catch { /* sem vibração */ }
  if (isIOS) {
    try { iosHaptic(); } catch { /* sem háptico */ }
  }
}

// ---------- Ícones (Phosphor, ver icons.js) ----------

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ---------- Barra de abas (como no iPhone/WhatsApp) ----------
// Quatro abas numa cápsula de vidro e, separado, o botão de ler código, que
// abre o leitor no último modo usado. Aba ativa: ícone cheio e texto forte.

const TABS = [
  { id: 'armario', href: '#/', label: 'Armário', icon: 'package', active: 'packageFill' },
  { id: 'compras', href: '#/compras', label: 'Compras', icon: 'cart', active: 'cartFill' },
  { id: 'cupons', href: '#/cupons', label: 'Cupons', icon: 'receipt', active: 'receiptFill' },
  { id: 'mais', href: '#/dados', label: 'Mais', icon: 'menu', active: 'menuFill' },
];

export function lastScanMode() {
  try { return localStorage.getItem('ki.lastMode') === 'saida' ? 'saida' : 'entrada'; } catch { return 'entrada'; }
}

// A barra fica fora das telas e sobrevive à troca de aba, para a pílula de
// vidro deslizar de uma aba para a outra (como no iOS 26). As telas só dizem
// qual aba é a delas: tabBar('compras') marca e devolve nada.
let wantedTab = null;
export function tabBar(current) {
  wantedTab = current;
  return '';
}

const HAS_LINEAR = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');
const SPRING_EASE_SOFT = !HAS_LINEAR ? 'cubic-bezier(0.2, 0, 0, 1)' : 'linear(0, 0.043 3.6%, 0.142 7.1%, 0.267 10.7%, 0.396 14.3%, 0.518 17.9%, 0.626 21.4%, 0.717 25%, 0.792 28.6%, 0.851 32.1%, 0.897 35.7%, 0.932 39.3%, 0.957 42.9%, 0.975 46.4%, 0.987 50%, 0.995 53.6%, 1 57.1%, 1.003 60.7%, 1.005 67.9%, 1.003 82.1%, 1)';
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let bar = null;
function buildTabBar() {
  bar = document.createElement('div');
  bar.id = 'tabbar';
  bar.className = 'tabbar-wrap is-hidden';
  bar.innerHTML = `
    <nav class="tabbar glass-regular" aria-label="Seções">
      <span class="tab-glide" aria-hidden="true"></span>
      ${TABS.map((t) => `
        <a class="tab-item" href="${t.href}" data-tab="${t.id}" draggable="false">
          <span class="tab-icons">${icon(t.icon, 'tab-off')}${icon(t.active, 'tab-on')}</span><span class="tab-label">${t.label}</span>
        </a>`).join('')}
    </nav>
    <a class="scan-fab glass-regular" href="#/entrada" draggable="false">${icon('barcode')}</a>`;
  document.body.append(bar);
  enableScrub(bar.querySelector('.tabbar'));
  window.addEventListener('resize', () => placeGlide(false));
}

function items() { return [...bar.querySelectorAll('.tab-item')]; }

// Pílula sob a aba escolhida. Desliza com mola; no caminho estica um pouco,
// como uma gota de vidro, e volta ao tamanho ao chegar.
function placeGlide(animate = true, x = null) {
  const glide = bar.querySelector('.tab-glide');
  const nav = bar.querySelector('.tabbar');
  const active = bar.querySelector('.tab-item[aria-current="page"]');
  if (!active) { glide.style.opacity = '0'; return; }
  const nr = nav.getBoundingClientRect();
  const ar = active.getBoundingClientRect();
  const to = x === null ? ar.left - nr.left : Math.max(4, Math.min(nr.width - ar.width - 4, x - nr.left - ar.width / 2));
  const from = parseFloat(glide.dataset.x || 'NaN');
  glide.style.width = `${ar.width}px`;
  glide.style.opacity = '1';
  if (!animate || reducedMotion()) glide.classList.add('no-anim');
  glide.style.translate = `${to}px 0`;
  glide.dataset.x = String(to);
  if (!animate || reducedMotion()) { void glide.offsetWidth; glide.classList.remove('no-anim'); return; }
  if (Number.isFinite(from) && Math.abs(from - to) > 2 && x === null) {
    glide.classList.remove('is-moving');
    void glide.offsetWidth;
    glide.classList.add('is-moving');
    clearTimeout(glide._t);
    glide._t = setTimeout(() => glide.classList.remove('is-moving'), 180);
  }
}

// Arrastar o dedo pela barra: a pílula vira uma lente e segue o dedo; ao
// soltar, vai para a aba mais perto.
function enableScrub(nav) {
  let s = null;
  nav.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    s = { x: e.clientX, id: e.pointerId, on: false };
  });
  nav.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    if (!s.on) {
      if (Math.abs(e.clientX - s.x) < 8) return;
      s.on = true;
      nav.classList.add('is-scrubbing');
      try { nav.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
    }
    const glide = nav.querySelector('.tab-glide');
    glide.classList.add('no-anim');
    placeGlide(true, e.clientX);
    const over = nearest(e.clientX);
    items().forEach((it) => it.classList.toggle('is-over', it === over));
  });
  const end = (e) => {
    if (!s) return;
    const was = s.on;
    s = null;
    if (!was) return;
    nav.classList.remove('is-scrubbing');
    nav.querySelector('.tab-glide').classList.remove('no-anim');
    items().forEach((it) => it.classList.remove('is-over'));
    const target = nearest(e.clientX);
    nav.dataset.justScrubbed = '1';
    setTimeout(() => { delete nav.dataset.justScrubbed; }, 60);
    if (target && location.hash !== target.getAttribute('href')) {
      vibrate(8);
      location.hash = target.getAttribute('href');
    } else placeGlide(true);
  };
  nav.addEventListener('pointerup', end);
  nav.addEventListener('pointercancel', (e) => end(e));
  nav.addEventListener('click', (e) => {
    if (nav.dataset.justScrubbed) { e.preventDefault(); return; }
    // A pílula sai já no toque, sem esperar a tela nova ficar pronta.
    const it = e.target.closest('.tab-item');
    if (!it || it.getAttribute('aria-current')) return;
    items().forEach((x) => (x === it ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current')));
    placeGlide(true);
    vibrate(6);
  }, true);
}
function nearest(x) {
  let best = null;
  let dist = Infinity;
  for (const it of items()) {
    const r = it.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - x);
    if (d < dist) { dist = d; best = it; }
  }
  return best;
}

// Chamado pelo roteador depois de cada tela: marca a aba, mostra ou esconde a
// barra (desce com mola nas telas de detalhe) e atualiza o botão do leitor.
export function updateTabBar() {
  if (!bar) buildTabBar();
  const current = wantedTab;
  wantedTab = null;
  const wasHidden = bar.classList.contains('is-hidden');
  bar.classList.toggle('is-hidden', !current);
  bar.inert = !current;
  for (const it of items()) {
    const on = it.dataset.tab === current;
    if (on) it.setAttribute('aria-current', 'page'); else it.removeAttribute('aria-current');
  }
  const mode = lastScanMode();
  const fab = bar.querySelector('.scan-fab');
  fab.href = `#/${mode}`;
  fab.classList.remove('mode-entrada', 'mode-saida');
  fab.classList.add(`mode-${mode}`);
  fab.setAttribute('aria-label', `Ler código de barras (${mode === 'saida' ? 'Saída' : 'Entrada'})`);
  if (current) placeGlide(!wasHidden);
}

export function setTabBarInert(on) {
  if (bar) bar.inert = on || bar.classList.contains('is-hidden');
}

// ---------- Indicador que desliza (seletores e abas de cima) ----------
// Um só preenchimento por seletor, que desliza e estica até a opção escolhida
// em vez de piscar de uma para outra. Transição CSS: pode ser interrompida.

export function glideTo(container, active, { line = false } = {}) {
  if (!container || !active) return;
  let ind = container.querySelector(':scope > .glide');
  const prev = container._glide;
  const next = line
    ? { x: active.offsetLeft, y: active.offsetTop + active.offsetHeight - 3, w: active.offsetWidth, h: 3 }
    : { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight };
  const put = (r) => {
    ind.style.width = `${r.w}px`;
    ind.style.height = `${r.h}px`;
    ind.style.translate = `${r.x}px ${r.y}px`;
  };
  if (!ind) {
    ind = document.createElement('span');
    ind.className = `glide${line ? ' glide-line' : ''}`;
    ind.setAttribute('aria-hidden', 'true');
    container.prepend(ind);
    container.classList.add('has-glide');
    ind.classList.add('no-anim');
    put(prev || next);
    void ind.offsetWidth;
    ind.classList.remove('no-anim');
  }
  container._glide = next;
  if (reducedMotion()) { ind.classList.add('no-anim'); put(next); return; }
  const moved = prev && Math.abs(prev.x - next.x) > 1;
  put(next);
  if (moved) {
    ind.classList.remove('is-moving');
    void ind.offsetWidth;
    ind.classList.add('is-moving');
    clearTimeout(ind._t);
    ind._t = setTimeout(() => ind.classList.remove('is-moving'), 170);
  }
}

// Seletores de rádio (ambiente nas folhas, Entrada | Saída): o indicador nasce
// no primeiro toque, sobre a opção atual, e desliza quando a escolha muda.
const SEG = '.segmented-track, .mode-switch';
const checkedLabel = (track) => track.querySelector('input:checked')?.closest('label');
function armSegment(e) {
  const track = e.target.closest && e.target.closest(SEG);
  if (track && !track.querySelector(':scope > .glide')) glideTo(track, checkedLabel(track));
}
document.addEventListener('pointerdown', armSegment, true);
document.addEventListener('keydown', armSegment, true);
document.addEventListener('change', (e) => {
  const track = e.target.closest && e.target.closest(SEG);
  if (track && e.target.type === 'radio') glideTo(track, e.target.closest('label'));
});

// ---------- Título grande que encolhe (como no iPhone) ----------
// Quando o título grande sai de baixo da barra, aparece o título pequeno no
// topo, numa barra de vidro. Tocar nela volta ao começo da tela.

export function collapsingTitle(root) {
  const screen = root.querySelector('.screen');
  const h1 = root.querySelector('.home-head .page-title');
  if (!screen || !h1 || !('IntersectionObserver' in window)) return () => {};
  const bar = document.createElement('div');
  bar.className = 'mini-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = `<span class="mini-title">${esc(h1.textContent)}</span>`;
  screen.prepend(bar);
  bar.addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  const io = new IntersectionObserver(([e]) => {
    screen.classList.toggle('is-collapsed', !e.isIntersecting && e.boundingClientRect.top < bar.offsetHeight);
  }, { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` });
  io.observe(h1);
  // O título grande reage à rolagem: esmaece subindo e cresce um pouco quando
  // a pessoa puxa a lista para baixo além do topo (o "elástico" do iPhone).
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = window.scrollY;
      h1.style.scale = y < 0 ? String(1 + Math.min(-y, 120) / 600) : '';
      h1.style.opacity = y > 0 ? String(Math.max(0, 1 - y / (h1.offsetHeight * 1.3))) : '';
    });
  };
  if (!reducedMotion()) window.addEventListener('scroll', onScroll, { passive: true });
  return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); };
}

// Linhas-esqueleto: o formato do que vai chegar, enquanto carrega.
export function skeletonRows(n = 4, cls = 'rows') {
  return `<ul class="${cls} skeleton-list" aria-hidden="true">${Array.from({ length: n }, (_, i) => `
    <li class="skel-row"><span class="skel skel-thumb"></span><span class="skel-lines"><span class="skel skel-line" style="width:${[68, 52, 74, 60, 46][i % 5]}%"></span><span class="skel skel-line skel-short"></span></span><span class="skel skel-tag"></span></li>`).join('')}</ul>`;
}

// ---------- Aviso (toast) ----------
// Aviso com ação (Desfazer) fica até ser dispensado, trocado por outro ou até
// mudar de tela. Aviso sem ação some sozinho. O anúncio para leitores de tela
// vai por uma região fixa (#toast-live), sempre presente no DOM.

let toastTimer;
let toastAt = 0;
export function toast(message, { action, onAction, mode = '', duration = 4000 } = {}) {
  const host = $('#toast');
  clearTimeout(toastTimer);
  toastAt = Date.now();
  host.className = `toast ${mode ? `mode-${mode} has-mode` : ''}`;
  // Como os avisos do sistema: o que aconteceu em destaque, numa linha, e o
  // resto embaixo, menor. O ícone repete o gesto (guardar, tirar, contar).
  const cut = message.indexOf('. ');
  const head = cut > 0 && cut < 80 ? message.slice(0, cut) : message;
  const rest = cut > 0 && cut < 80 ? message.slice(cut + 2) : '';
  const glyph = { entrada: 'in', saida: 'out', contagem: 'count' }[mode];
  host.innerHTML = `
    ${glyph ? `<span class="toast-icon" aria-hidden="true">${icon(glyph)}</span>` : ''}
    <span class="toast-text"><span class="toast-head">${esc(head)}</span>${rest ? `<span class="toast-sub">${esc(rest)}</span>` : ''}</span>
    ${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
  host.hidden = false;
  // Entra com mola, como os avisos do sistema; reinicia a cada aviso novo.
  host.classList.remove('is-in');
  void host.offsetWidth;
  host.classList.add('is-in');
  const live = $('#toast-live');
  if (live) live.textContent = message;
  if (action) {
    $('.toast-action', host).addEventListener('click', () => {
      hideToast();
      onAction && onAction();
    }, { once: true });
    // Como o Desfazer do Mail: some sozinho, com mais tempo, e espera enquanto
    // o dedo ou o foco do teclado estiver no aviso.
    const wait = Math.max(duration, 8000);
    const arm = () => { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, wait); };
    host.onpointerenter = host.onfocusin = () => clearTimeout(toastTimer);
    host.onpointerleave = host.onfocusout = arm;
    arm();
  } else {
    host.onpointerenter = host.onfocusin = host.onpointerleave = host.onfocusout = null;
    toastTimer = setTimeout(hideToast, duration);
  }
}

export function hideToast() {
  const host = $('#toast');
  if (host && !host.hidden) {
    // Sai mais suave do que entrou: desce um pouco e some.
    if (reducedMotion()) { host.hidden = true; host.innerHTML = ''; } else {
      host.classList.remove('is-in');
      host.classList.add('is-out');
      setTimeout(() => { if (host.classList.contains('is-out')) { host.hidden = true; host.innerHTML = ''; host.classList.remove('is-out'); } }, 200);
    }
  }
  const live = $('#toast-live');
  if (live) live.textContent = '';
}

// Ao trocar de tela, esconde avisos antigos; mantém o que acabou de ser criado
// (ex.: "Contagem aplicada" mostrado junto com a volta ao Armário).
export function hideStaleToast() {
  if (Date.now() - toastAt > 1000) hideToast();
}

// ---------- Folha inferior (sheet) ----------

let openSheetState = null;

/**
 * Abre uma folha. `render(body)` preenche o conteúdo. Resolve quando fecha,
 * com o valor passado a close(value).
 * Acessibilidade: o resto da tela fica `inert`, o foco entra na folha e volta
 * para quem abriu quando ela fecha.
 */
export function openSheet({ mode = '', label = 'Produto', render, className = '', title = '' }) {
  closeSheet(null);
  const root = $('#sheet-root');
  const trigger = document.activeElement;
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet glass-thick ${className} ${mode ? `mode-${mode}` : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-bar">
        <button type="button" class="icon-btn glass-btn sheet-close" data-close aria-label="Fechar">${icon('close')}</button>
        <div class="sheet-bar-title"></div>
        <div class="sheet-bar-end"></div>
      </div>
      <div class="sheet-body"></div>
    </section>`;
  root.hidden = false;
  document.body.classList.add('has-sheet');
  const app = $('#app');
  if (app) app.inert = true;
  setTabBarInert(true);
  if (title) $('.sheet', root).dataset.title = title;
  // A tela de trás recua e escurece, como um cartão empilhado no iPhone.
  // Não nas telas com barra fixa própria (leitor, contagem): ela pularia.
  if (app && window.innerWidth < 640 && !app.querySelector('.floating-bar') && !reducedMotion()) {
    app.style.transformOrigin = `50% ${window.scrollY + window.innerHeight * 0.5}px`;
    document.body.classList.add('sheet-stack');
  }
  const sheet = $('.sheet', root);
  const body = $('.sheet-body', root);

  return new Promise((resolve) => {
    const state = { resolve, root, trigger };
    openSheetState = state;
    $$('[data-close]', root).forEach((el) => el.addEventListener('click', () => closeSheet(null)));
    enableDrag(sheet);
    const onKey = (e) => { if (e.key === 'Escape') closeSheet(null); };
    document.addEventListener('keydown', onKey);
    state.cleanup = () => document.removeEventListener('keydown', onKey);
    render(body, (value) => closeSheet(value));
    hoistHeader(sheet);
    // Conteúdo trocado (buscando → formulário): o título novo sobe para a barra.
    // Só um aviso acrescentado no fim não mexe no título.
    const hoist = new MutationObserver((list) => {
      const added = list.flatMap((m) => [...m.addedNodes]);
      if (added.includes(body.firstElementChild) || body.querySelector(':scope > .sheet-title, :scope > .sheet-share')) hoistHeader(sheet);
    });
    hoist.observe(body, { childList: true });
    requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      if (!sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
      // Só a folha alta empurra a tela de trás (como a folha grande do iPhone);
      // a média fica por cima, sem mexer no fundo.
      if (sheet.offsetHeight < window.innerHeight * 0.7) document.body.classList.remove('sheet-stack');
    });
    state.cleanupMotion = sheetMotion(sheet, body);
    const prevCleanup = state.cleanup;
    state.cleanup = () => { prevCleanup(); hoist.disconnect(); };
  });
}

export function closeSheet(value = null) {
  const state = openSheetState;
  if (!state) return;
  openSheetState = null;
  state.cleanup && state.cleanup();
  state.cleanupMotion && state.cleanupMotion();
  document.body.classList.remove('sheet-stack');
  const root = state.root;
  // Saída suave: o conteúdo vai para uma cópia que desce 12px e some,
  // e a raiz fica livre na hora para a próxima folha.
  const sheet = $('.sheet', root);
  if (sheet && sheet.classList.contains('is-open')) {
    const ghost = document.createElement('div');
    ghost.className = `sheet-ghost${sheet.dataset.flung ? ' is-flung' : ''}`;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    while (root.firstChild) ghost.appendChild(root.firstChild);
    document.body.appendChild(ghost);
    requestAnimationFrame(() => ghost.classList.add('is-leaving'));
    setTimeout(() => ghost.remove(), 340);
  }
  root.hidden = true;
  root.innerHTML = '';
  document.body.classList.remove('has-sheet');
  const app = $('#app');
  if (app) app.inert = false;
  setTabBarInert(false);
  if (state.trigger && state.trigger.isConnected && typeof state.trigger.focus === 'function') {
    state.trigger.focus({ preventScroll: true });
  }
  state.resolve(value);
}

// Cabeçalho como no iOS 26: X à esquerda, título pequeno no meio e a ação
// (compartilhar) à direita. As telas escrevem o título no corpo; ele sobe.
function hoistHeader(sheet) {
  const body = sheet.querySelector('.sheet-body');
  const title = body.querySelector(':scope > .sheet-title');
  const share = body.querySelector(':scope > .sheet-share');
  const fallback = sheet.dataset.title;
  const slot = sheet.querySelector('.sheet-bar-title');
  if (title) slot.replaceChildren(title);
  else if (fallback) slot.innerHTML = `<h2 class="sheet-title">${esc(fallback)}</h2>`;
  else slot.replaceChildren();
  sheet.querySelector('.sheet-bar-end').replaceChildren(...(share ? [share] : []));
  if (title) sheet.setAttribute('aria-label', title.textContent.trim());
}

// Quando o conteúdo da folha muda (buscando → formulário) ou cresce (sugestões,
// validade), a borda de cima sobe com mola em vez de pular, e o conteúdo novo
// entra esmaecendo de leve.
function sheetMotion(sheet, body) {
  if (reducedMotion() || !('ResizeObserver' in window)) return () => {};
  const openedAt = performance.now();
  let lastH = 0;
  const settled = () => performance.now() - openedAt > 540 && !sheet.classList.contains('is-dragging');
  const ro = new ResizeObserver(() => {
    const h = sheet.offsetHeight;
    const d = h - lastH;
    lastH = h;
    if (!settled() || d < 6) return;
    sheet.animate([{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)' }], { duration: 520, easing: SPRING_EASE_SOFT });
  });
  ro.observe(body);
  const mo = new MutationObserver((list) => {
    if (!settled() || !list.some((m) => m.target === body && m.addedNodes.length)) return;
    body.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  });
  mo.observe(body, { childList: true });
  return () => { ro.disconnect(); mo.disconnect(); };
}

export function sheetIsOpen() {
  return !!openSheetState;
}

// Arrastar para fechar, como no iPhone: pela alça ou por qualquer ponto da
// folha quando ela já está no topo da rolagem. Fecha se passar de um terço da
// altura ou se o gesto for rápido; senão volta com mola.
function enableDrag(sheet) {
  const SKIP = 'input, textarea, select, .stepper, .segmented, .ticket-clip';
  let start = null; // { y, x, t, fromGrip }
  let dragging = false;
  let dy = 0;
  let last = [];
  const reset = () => { start = null; dragging = false; dy = 0; last = []; };

  sheet.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const fromGrip = !!e.target.closest('.sheet-grip');
    if (!fromGrip && (e.pointerType === 'mouse' || e.target.closest(SKIP))) return;
    start = { y: e.clientY, x: e.clientX, fromGrip, id: e.pointerId };
    last = [{ y: e.clientY, t: e.timeStamp }];
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const d = e.clientY - start.y;
    if (!dragging) {
      const down = d > 8 && Math.abs(e.clientX - start.x) < d;
      if (!down || (!start.fromGrip && sheet.scrollTop > 0)) {
        if (Math.abs(d) > 8 || Math.abs(e.clientX - start.x) > 8) reset();
        return;
      }
      dragging = true;
      sheet.classList.add('is-dragging');
      try { sheet.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
    }
    dy = Math.max(0, d);
    sheet.style.transform = `translateY(${dy}px)`;
    last.push({ y: e.clientY, t: e.timeStamp });
    if (last.length > 5) last.shift();
  });
  const end = () => {
    if (!start) return;
    if (!dragging) { reset(); return; }
    const a = last[0];
    const b = last[last.length - 1];
    const v = b && a && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0; // px/ms
    sheet.classList.remove('is-dragging');
    if (dy > sheet.offsetHeight / 3 || (v > 0.5 && dy > 40)) {
      sheet.dataset.flung = '1';
      closeSheet(null);
    } else {
      sheet.style.transform = '';
    }
    reset();
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
  // Puxando para baixo com a folha no topo, o navegador não rola nem cancela o
  // gesto; para cima, a folha rola normalmente.
  let touchY = 0;
  sheet.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!start) return;
    const down = e.touches[0].clientY > touchY;
    if (dragging || (down && (start.fromGrip || sheet.scrollTop <= 0))) e.preventDefault();
  }, { passive: false });
}

// ---------- Menu (como o menu suspenso do iPhone) ----------

/**
 * Abre um menu preso a `anchor`. items: [{ label, icon, danger, onSelect }].
 * Resolve quando fecha. Setas mudam o item, Esc fecha, o foco volta ao botão.
 */
export function openMenu(anchor, items, { label = 'Opções' } = {}) {
  closeMenu();
  const host = document.createElement('div');
  host.className = 'menu-root';
  host.innerHTML = `
    <div class="menu-scrim"></div>
    <div class="menu glass-thick" role="menu" aria-label="${esc(label)}" tabindex="-1">
      ${items.map((it, i) => `
        <button type="button" class="menu-item ${it.danger ? 'is-danger' : ''}" role="menuitem" data-i="${i}" style="--i:${i}">
          <span>${esc(it.label)}</span>${it.icon ? icon(it.icon) : ''}
        </button>`).join('')}
    </div>`;
  document.body.append(host);
  const menuEl = $('.menu', host);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(280, window.innerWidth - 24);
  menuEl.style.width = `${w}px`;
  const h = menuEl.offsetHeight;
  const left = Math.min(window.innerWidth - w - 12, Math.max(12, r.right - w));
  const below = r.bottom + 8 + h < window.innerHeight - 12;
  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${below ? r.bottom + 8 : Math.max(12, r.top - 8 - h)}px`;
  menuEl.style.transformOrigin = `${Math.round(r.left + r.width / 2 - left)}px ${below ? 0 : h}px`;
  anchor.setAttribute('aria-expanded', 'true');
  const buttons = $$('.menu-item', host);

  return new Promise((resolve) => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const at = buttons.indexOf(document.activeElement);
        const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
      if (e.key === 'Tab') done(null);
    };
    const onScroll = () => done(null);
    function done(i) {
      if (!host.isConnected) return;
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      anchor.removeAttribute('aria-expanded');
      host.classList.add('is-leaving');
      host.inert = true;
      setTimeout(() => host.remove(), 160);
      openMenuState = null;
      if (i !== null) {
        vibrate(8);
        if (anchor.isConnected) anchor.focus({ preventScroll: true });
        items[i].onSelect && items[i].onSelect();
      } else if (anchor.isConnected) anchor.focus({ preventScroll: true });
      resolve(i);
    }
    openMenuState = { done };
    $('.menu-scrim', host).addEventListener('pointerdown', (e) => { e.preventDefault(); done(null); });
    menuEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) done(Number(b.dataset.i));
    });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => window.addEventListener('scroll', onScroll, true), 50);
    requestAnimationFrame(() => {
      host.classList.add('is-open');
      if (lastInputKeyboard) buttons[0] && buttons[0].focus({ preventScroll: true });
      else menuEl.focus({ preventScroll: true });
    });
  });
}

// Como o iPhone: menu aberto pelo toque não mostra anel de foco; pelo teclado,
// a primeira opção já vem focada para andar com as setas.
let lastInputKeyboard = false;
document.addEventListener('keydown', () => { lastInputKeyboard = true; }, true);
document.addEventListener('pointerdown', () => { lastInputKeyboard = false; }, true);

let openMenuState = null;
export function closeMenu() {
  if (openMenuState) openMenuState.done(null);
}

// ---------- Seletor de quantidade ----------

/**
 * Monta um seletor dentro de `host`. Retorna { get value, set(n), setMax(n) }.
 * O número é um <input inputmode="numeric"> para aceitar digitação direta.
 */
export function stepper(host, { value = 1, min = 1, max = 999, label = 'Quantidade', onChange } = {}) {
  host.classList.add('stepper');
  host.innerHTML = `
    <button type="button" class="stepper-btn" data-step="-1" aria-label="Diminuir">${icon('minus')}</button>
    <input class="stepper-value" type="text" inputmode="numeric" pattern="[0-9]*" aria-label="${esc(label)}" autocomplete="off">
    <button type="button" class="stepper-btn" data-step="1" aria-label="Aumentar">${icon('plus')}</button>`;
  const input = $('.stepper-value', host);
  const [dec, inc] = $$('.stepper-btn', host);
  let current = value;

  function set(n, fromInput = false) {
    const parsed = Math.round(Number(n));
    current = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
    if (!fromInput || String(current) !== input.value) input.value = String(current);
    dec.disabled = current <= min;
    inc.disabled = current >= max;
    onChange && onChange(current);
  }

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn) return;
    set(current + Number(btn.dataset.step));
    // O número pula para o lado do toque, como os contadores do iPhone.
    input.classList.remove('is-up', 'is-down');
    void input.offsetWidth;
    input.classList.add(Number(btn.dataset.step) > 0 ? 'is-up' : 'is-down');
    vibrate(10);
  });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    if (digits === '') { input.value = ''; return; }
    set(Number(digits), true);
  });
  input.addEventListener('blur', () => set(input.value === '' ? min : current));

  set(value);
  return {
    get value() { return current; },
    set,
    setMax(m) { max = m; set(current); },
  };
}

// ---------- Confirmação ----------

export function confirmSheet({ title, text, confirm, cancel = 'Cancelar', danger = false, mode = '' }) {
  return openSheet({
    mode,
    label: title,
    render(body, close) {
      body.innerHTML = `
        <h2 class="sheet-title">${esc(title)}</h2>
        ${text ? `<p class="sheet-text">${esc(text)}</p>` : ''}
        <div class="sheet-actions">
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>
          <button type="button" class="btn btn-quiet" data-no>${esc(cancel)}</button>
        </div>`;
      $('[data-yes]', body).addEventListener('click', () => close(true));
      $('[data-no]', body).addEventListener('click', () => close(false));
    },
  }).then((v) => v === true);
}

// ---------- Datas ----------

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

export function when(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `hoje ${timeFmt.format(d)}`;
  if (d.toDateString() === yest.toDateString()) return `ontem ${timeFmt.format(d)}`;
  return `${dateFmt.format(d)} ${timeFmt.format(d)}`;
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------- Arquivos e compartilhamento ----------

export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Abre o compartilhar do celular; sem ele, copia o texto.
export async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return true;
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Texto copiado. Cole onde quiser.', { duration: 3000 });
    return true;
  } catch {
    toast('Não deu para compartilhar neste navegador. Tente pelo Chrome ou pelo Safari.', { duration: 3000 });
    return false;
  }
}

// Conversa nova no Claude com a pergunta já escrita.
export function claudeUrl(prompt) {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}
