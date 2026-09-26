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

export function tagState(p) {
  if (p.qty === 0) return 'is-zero';
  if (p.minQty > 0 && p.qty <= p.minQty) return 'is-low';
  return '';
}

// Foto da embalagem por cima de um ícone de pacote; se a foto falhar, sobra o ícone.
export function thumb(p, size = 'sm') {
  const img = p && p.image
    ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<span class="thumb thumb-${size}" aria-hidden="true">${icon('package')}${img}</span>`;
}

export function subtitle(p) {
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

export function tabBar(current) {
  return `
    <div class="tabbar-wrap">
      <nav class="tabbar glass-regular" aria-label="Seções">
        ${TABS.map((t) => `
          <a class="tab-item" href="${t.href}" ${t.id === current ? 'aria-current="page"' : ''}>
            ${icon(t.id === current ? t.active : t.icon)}<span>${t.label}</span>
          </a>`).join('')}
      </nav>
      <a class="scan-fab glass-regular mode-${lastScanMode()}" href="#/${lastScanMode()}" aria-label="Ler código de barras (${lastScanMode() === 'saida' ? 'Saída' : 'Entrada'})">${icon('barcode')}</a>
    </div>`;
}

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
  return () => io.disconnect();
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
  host.innerHTML = `
    <span class="toast-text">${esc(message)}</span>
    ${action ? `<button type="button" class="toast-action">${esc(action)}</button>
      <button type="button" class="toast-close" aria-label="Fechar aviso">${icon('close')}</button>` : ''}`;
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
    $('.toast-close', host).addEventListener('click', hideToast);
  } else {
    toastTimer = setTimeout(hideToast, duration);
  }
}

export function hideToast() {
  const host = $('#toast');
  if (host) { host.hidden = true; host.innerHTML = ''; }
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
export function openSheet({ mode = '', label = 'Produto', render, className = '' }) {
  closeSheet(null);
  const root = $('#sheet-root');
  const trigger = document.activeElement;
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet glass-thick ${className} ${mode ? `mode-${mode}` : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">
      <div class="sheet-grip" aria-hidden="true"></div>
      <button type="button" class="icon-btn sheet-close" data-close aria-label="Fechar">${icon('close')}</button>
      <div class="sheet-body"></div>
    </section>`;
  root.hidden = false;
  document.body.classList.add('has-sheet');
  const app = $('#app');
  if (app) app.inert = true;
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
    requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      if (!sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
    });
  });
}

export function closeSheet(value = null) {
  const state = openSheetState;
  if (!state) return;
  openSheetState = null;
  state.cleanup && state.cleanup();
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
    setTimeout(() => ghost.remove(), sheet.dataset.flung ? 320 : 200);
  }
  root.hidden = true;
  root.innerHTML = '';
  document.body.classList.remove('has-sheet');
  const app = $('#app');
  if (app) app.inert = false;
  if (state.trigger && state.trigger.isConnected && typeof state.trigger.focus === 'function') {
    state.trigger.focus({ preventScroll: true });
  }
  state.resolve(value);
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
    <div class="menu glass-thick" role="menu" aria-label="${esc(label)}">
      ${items.map((it, i) => `
        <button type="button" class="menu-item ${it.danger ? 'is-danger' : ''}" role="menuitem" data-i="${i}">
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
      buttons[0] && buttons[0].focus({ preventScroll: true });
    });
  });
}

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
    toast('Não deu para compartilhar neste navegador.', { duration: 3000 });
    return false;
  }
}

// Conversa nova no Claude com a pergunta já escrita.
export function claudeUrl(prompt) {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}
