// Leitor em modo Entrada ou Saída. O que foi registrado aparece como um cupom.
//
// Modo rápido (como o caixa do mercado): cada leitura de um produto conhecido
// soma ou tira 1 na hora, só com o bip. O que o app não conhece, ou um código
// com mais de um produto, fica em "Para resolver" até o fim.

import { mountCamera } from './camera.js';
import { showProductSheet } from './productSheet.js';
import { showReceipt, receiptTotal } from './receipt.js';
import { undoMovement, productsByBarcode, addStock, removeStock } from '../store.js';
import { warmUp } from '../scanner.js';
import { beep } from '../sound.js';
import { $, esc, icon, toast, hideToast, plural, openSheet, vibrate } from '../ui.js';

const COPY = {
  entrada: {
    title: 'Entrada', sign: '+',
    hint: 'Aponte para o código de barras do que está guardando',
    fastHint: 'Cada leitura soma 1. Produtos novos ficam para o fim.',
    empty: 'Os produtos que você guardar aparecem aqui.',
  },
  saida: {
    title: 'Saída', sign: '−',
    hint: 'Aponte para o código de barras do que está tirando',
    fastHint: 'Cada leitura tira 1. O que o app não conhece fica para o fim.',
    empty: 'Os produtos que você tirar aparecem aqui.',
  },
};

const FAST_KEY = 'ki.fast';
function loadFast() {
  try { return localStorage.getItem(FAST_KEY) === '1'; } catch { return false; }
}
function saveFast(on) {
  try { localStorage.setItem(FAST_KEY, on ? '1' : '0'); } catch { /* sem armazenamento */ }
}

export default function mountScan(root, { mode, code: initialCode }) {
  const copy = COPY[mode];
  // Uma linha por produto: { product, n, movements: [] }, a mais recente no fim.
  const session = new Map();
  // Leituras que esperam o fim: { barcode, reads, reason }
  const pending = new Map();
  let fast = loadFast();
  warmUp();

  root.innerHTML = `
    <div class="screen screen-scan has-floating-bar mode-${mode}">
      <header class="band">
        <div class="band-text">
          <h1 class="band-title">${copy.title}</h1>
          <p class="band-hint" data-hint></p>
          <label class="band-switch">
            <input type="checkbox" class="switch switch-on-mode" data-fast ${fast ? 'checked' : ''}>
            <span>Modo rápido</span>
          </label>
        </div>
        <a class="icon-btn" href="#/" aria-label="Fechar e voltar ao armário">${icon('close')}</a>
      </header>
      <main>
        <div class="cam-host"></div>
        <section class="pending" aria-label="Leituras para resolver" hidden>
          <h2 class="list-title">Para resolver</h2>
          <ul class="pending-list"></ul>
        </section>
        <section class="receipt" aria-label="Registros desta ${copy.title.toLowerCase()}">
          <ul class="receipt-lines"></ul>
          <p class="receipt-total"></p>
        </section>
      </main>
      <footer class="floating-bar glass-regular glass-static">
        <button type="button" class="btn btn-primary btn-lg" data-finish>Concluir</button>
      </footer>
    </div>`;

  const lines = $('.receipt-lines', root);
  const total = $('.receipt-total', root);
  const hint = $('[data-hint]', root);
  const pendingBox = $('.pending', root);
  const pendingList = $('.pending-list', root);

  function renderHint() {
    hint.textContent = fast ? copy.fastHint : copy.hint;
  }

  function renderSession() {
    if (!session.size) {
      lines.innerHTML = `<li class="receipt-empty">${copy.empty}</li>`;
      total.hidden = true;
      return;
    }
    const entries = [...session.values()];
    const units = entries.reduce((a, s) => a + s.n, 0);
    lines.innerHTML = entries.slice().reverse().map((s) => `
      <li class="receipt-line">
        <span class="receipt-name">${esc(s.product.name)}</span>
        <span class="receipt-dots" aria-hidden="true"></span>
        <span class="receipt-n">${copy.sign}${s.n}</span>
      </li>`).join('');
    total.hidden = false;
    total.innerHTML = `<span>${plural(entries.length, 'produto', 'produtos')}</span><span class="receipt-n">${copy.sign}${units}</span>`;
  }

  function renderPending() {
    pendingBox.hidden = !pending.size;
    pendingList.innerHTML = [...pending.values()].map((p) => `
      <li class="pending-row">
        <span class="row-main">
          <span class="row-name">${esc(p.reason)}</span>
          <span class="row-sub">Código ${esc(p.barcode)}${p.reads > 1 ? `, lido ${p.reads} vezes` : ''}</span>
        </span>
        <button type="button" class="btn btn-quiet btn-sm" data-resolve="${esc(p.barcode)}" aria-label="Resolver o código ${esc(p.barcode)}">Resolver</button>
      </li>`).join('');
  }

  function record(product, movement, n) {
    const entry = session.get(product.code) || { product, n: 0, movements: [] };
    session.delete(product.code); // volta para o fim: é a linha mais recente
    entry.product = product;
    entry.n += n;
    entry.movements.push({ movement, n });
    session.set(product.code, entry);
    renderSession();
    const verb = mode === 'entrada' ? `Adicionado ${n}` : `Baixa de ${n}`;
    toast(`${verb}. ${product.name} agora tem ${product.qty}.`, {
      mode,
      action: 'Desfazer',
      onAction: async () => {
        try {
          const restored = await undoMovement(movement.id);
          entry.n -= n;
          entry.movements = entry.movements.filter((m) => m.movement.id !== movement.id);
          entry.product = restored;
          if (entry.n <= 0) session.delete(product.code);
          renderSession();
          toast('Registro desfeito.', { duration: 2500 });
        } catch (err) {
          toast(err.message, { duration: 4000 });
        }
      },
    });
  }

  // Fluxo normal: a folha pergunta a quantidade.
  async function sheetFlow(barcode, qty) {
    const r = await showProductSheet({ mode, barcode, qty });
    if (!r) return false;
    if (r.kind === 'switch') {
      location.hash = `#/entrada/${encodeURIComponent(r.code)}`;
      return false;
    }
    record(r.product, r.movement, r.n);
    return true;
  }

  // Modo rápido: 1 por leitura, sem folha.
  async function fastFlow(barcode) {
    const local = barcode.startsWith('SEM-') ? [] : await productsByBarcode(barcode);
    if (local.length === 1) {
      const p = local[0];
      if (mode === 'saida' && p.qty === 0) {
        beep('error');
        toast(`${p.name} já está zerado no armário.`, { duration: 3000 });
        return;
      }
      const r = mode === 'entrada' ? await addStock(p.code, 1) : await removeStock(p.code, 1);
      record(r.product, r.movement, 1);
      return;
    }
    if (barcode.startsWith('SEM-')) { await sheetFlow(barcode); return; }
    const reason = local.length ? `${local.length} produtos com este código` : (mode === 'entrada' ? 'Produto novo' : 'Não está no armário');
    const p = pending.get(barcode) || { barcode, reads: 0, reason };
    p.reads += 1;
    pending.set(barcode, p);
    vibrate([30, 60, 30]);
    renderPending();
    toast(`${reason}. Ficou em Para resolver.`, { duration: 2500 });
  }

  async function handleCode(barcode) {
    if (fast) return fastFlow(barcode);
    return sheetFlow(barcode);
  }

  pendingList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-resolve]');
    if (!btn) return;
    const p = pending.get(btn.dataset.resolve);
    if (!p) return;
    cam.pause();
    try {
      const done = await sheetFlow(p.barcode, p.reads);
      if (done) { pending.delete(p.barcode); renderPending(); }
    } finally {
      cam.resume();
    }
  });

  $('[data-fast]', root).addEventListener('change', (e) => {
    fast = e.target.checked;
    saveFast(fast);
    renderHint();
    toast(fast ? 'Modo rápido ligado. Cada leitura conta 1.' : 'Modo rápido desligado. O app pergunta a quantidade.', { duration: 2500 });
  });

  $('[data-finish]', root).addEventListener('click', async () => {
    if (pending.size) {
      cam.pause();
      const choice = await openSheet({
        mode,
        label: 'Leituras para resolver',
        render(body, close) {
          body.innerHTML = `
            <h2 class="sheet-title">${plural(pending.size, 'leitura ficou', 'leituras ficaram')} sem registrar</h2>
            <p class="sheet-text">Elas não mudaram o armário. Resolva agora ou conclua sem elas.</p>
            <div class="sheet-actions">
              <button type="button" class="btn btn-mode" data-back>Resolver agora</button>
              <button type="button" class="btn btn-quiet" data-anyway>Concluir sem elas</button>
            </div>`;
          $('[data-back]', body).addEventListener('click', () => close('back'));
          $('[data-anyway]', body).addEventListener('click', () => close('anyway'));
        },
      });
      if (choice !== 'anyway') {
        cam.resume();
        if (choice === 'back') pendingBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    if (!session.size) { location.hash = '#/'; return; }
    cam.stop();
    hideToast();
    const entries = [...session.values()];
    await showReceipt({
      mode,
      lines: entries.map((s) => ({ name: s.product.name, value: `${copy.sign}${s.n}`, sub: `ficou ${s.product.qty}` })),
      total: receiptTotal(entries.length, entries.reduce((a, s) => a + s.n, 0), copy.sign),
    });
    location.hash = '#/';
  });

  renderHint();
  renderSession();
  const cam = mountCamera($('.cam-host', root), { onCode: handleCode, mode });
  if (initialCode) cam.handle(initialCode);

  return () => cam.stop();
}
