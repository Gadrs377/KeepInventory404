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
  return `<span class="tag ${state}">${sr}${qty}</span>`;
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
    ghost.className = 'sheet-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    while (root.firstChild) ghost.appendChild(root.firstChild);
    document.body.appendChild(ghost);
    requestAnimationFrame(() => ghost.classList.add('is-leaving'));
    setTimeout(() => ghost.remove(), 200);
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

function enableDrag(sheet) {
  const grip = $('.sheet-grip', sheet);
  let startY = null;
  let dy = 0;
  const onMove = (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const onUp = () => {
    if (startY === null) return;
    startY = null;
    sheet.classList.remove('is-dragging');
    sheet.style.transform = '';
    if (dy > 90) closeSheet(null);
    dy = 0;
  };
  grip.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    sheet.classList.add('is-dragging');
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', onUp);
  grip.addEventListener('pointercancel', onUp);
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
