// Componentes compartilhados: escape de HTML, etiqueta, folha, aviso, seletor e confirmação.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function tag(qty, state = '') {
  return `<span class="tag ${state}" aria-label="${qty} no armário">${qty}</span>`;
}

export function tagState(p) {
  if (p.qty === 0) return 'is-zero';
  if (p.minQty > 0 && p.qty <= p.minQty) return 'is-low';
  return '';
}

export function thumb(p, size = 'sm') {
  if (p && p.image) {
    return `<img class="thumb thumb-${size}" src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'thumb thumb-${size} thumb-empty'}))">`;
  }
  const letter = p && p.name ? esc(p.name.trim().charAt(0).toLocaleUpperCase('pt-BR')) : '';
  return `<span class="thumb thumb-${size} thumb-empty" aria-hidden="true">${letter}</span>`;
}

export function subtitle(p) {
  return [p.brand, p.size].filter(Boolean).map(esc).join(', ');
}

export function vibrate(ms = 40) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* sem vibração */ }
}

// ---------- Ícones (SVG inline, traço de 2px) ----------

const ICONS = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  torch: '<path d="M8 3h8l-1 6H9L8 3zM9 9h6v4l-1.5 8h-3L9 13V9z"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  in: '<path d="M12 4v12M6 10l6 6 6-6M5 20h14"/>',
  out: '<path d="M12 20V8M6 14l6-6 6 6M5 4h14"/>',
  count: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ---------- Aviso (toast) ----------

let toastTimer;
let toastAt = 0;
export function toast(message, { action, onAction, mode = '', duration = 5000 } = {}) {
  const host = $('#toast');
  clearTimeout(toastTimer);
  toastAt = Date.now();
  host.className = `toast ${mode ? `mode-${mode}` : ''}`;
  host.innerHTML = `<span class="toast-text">${esc(message)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
  host.hidden = false;
  if (action) {
    $('.toast-action', host).addEventListener('click', () => {
      host.hidden = true;
      onAction && onAction();
    }, { once: true });
  }
  toastTimer = setTimeout(() => { host.hidden = true; }, duration);
}

// Ao trocar de tela, esconde avisos antigos; mantém o que acabou de ser criado
// (ex.: "Contagem aplicada" mostrado junto com a volta ao Armário).
export function hideStaleToast() {
  const host = $('#toast');
  if (host && Date.now() - toastAt > 1000) host.hidden = true;
}

// ---------- Folha inferior (sheet) ----------

let openSheetState = null;

/**
 * Abre uma folha. `render(body)` preenche o conteúdo. Resolve quando fecha,
 * com o valor passado a close(value).
 */
export function openSheet({ mode = '', label = 'Produto', render }) {
  closeSheet(null);
  const root = $('#sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet ${mode ? `mode-${mode}` : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <button type="button" class="icon-btn sheet-close" data-close aria-label="Fechar">${icon('close')}</button>
      <div class="sheet-body"></div>
    </section>`;
  root.hidden = false;
  document.body.classList.add('has-sheet');
  const sheet = $('.sheet', root);
  const body = $('.sheet-body', root);

  return new Promise((resolve) => {
    const state = { resolve, root };
    openSheetState = state;
    $$('[data-close]', root).forEach((el) => el.addEventListener('click', () => closeSheet(null)));
    enableDrag(sheet);
    const onKey = (e) => { if (e.key === 'Escape') closeSheet(null); };
    document.addEventListener('keydown', onKey);
    state.cleanup = () => document.removeEventListener('keydown', onKey);
    render(body, (value) => closeSheet(value));
    requestAnimationFrame(() => sheet.classList.add('is-open'));
  });
}

export function closeSheet(value = null) {
  const state = openSheetState;
  if (!state) return;
  openSheetState = null;
  state.cleanup && state.cleanup();
  const root = state.root;
  root.hidden = true;
  root.innerHTML = '';
  document.body.classList.remove('has-sheet');
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
    sheet.style.transform = '';
    if (dy > 90) closeSheet(null);
    dy = 0;
  };
  grip.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
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
          <button type="button" class="btn btn-ghost" data-no>${esc(cancel)}</button>
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
