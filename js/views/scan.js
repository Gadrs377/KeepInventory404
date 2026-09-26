// Leitor único: Entrada e Saída na mesma tela. O interruptor da faixa troca o
// modo (e a cor) sem desligar a câmera. O que foi registrado aparece como um cupom.
//
// Modo rápido (como o caixa do mercado): cada leitura de um produto conhecido
// soma ou tira 1 na hora, só com o bip. O que o app não conhece, ou um código
// com mais de um produto, fica em "Para resolver" até o fim. Fica ligado por
// padrão na Saída (quase sempre sai 1) e desligado na Entrada.

import { mountCamera } from './camera.js';
import { showProductSheet } from './productSheet.js';
import { showReceipt } from './receipt.js';
import { undoMovement, productsByBarcode, addStock, removeStock, getProduct, setStock, updateProduct } from '../store.js';
import { AREAS } from '../areas.js';
import { warmUp } from '../scanner.js';
import { beep } from '../sound.js';
import { $, esc, icon, toast, hideToast, plural, openSheet, vibrate, stepper, thumb, subtitle } from '../ui.js';

const COPY = {
  entrada: {
    title: 'Entrada', sign: '+',
    hint: 'Aponte para o código de barras',
    fastHint: 'Cada leitura soma 1. Produto novo fica para o fim.',
  },
  saida: {
    title: 'Saída', sign: '−',
    hint: 'Aponte para o código de barras',
    fastHint: 'Cada leitura tira 1. Produto desconhecido fica para o fim.',
  },
};

// Modo rápido lembrado por modo. Sem escolha salva: ligado na Saída.
function loadFast(mode) {
  try {
    const v = localStorage.getItem(`ki.fast.${mode}`);
    return v === null ? mode === 'saida' : v === '1';
  } catch {
    return mode === 'saida';
  }
}
function saveFast(mode, on) {
  try { localStorage.setItem(`ki.fast.${mode}`, on ? '1' : '0'); } catch { /* sem armazenamento */ }
}

export default function mountScan(root, { mode: initialMode, code: initialCode }) {
  let mode = initialMode;
  let fast = loadFast(mode);
  // Uma linha por produto e modo: { mode, product, n }, a mais recente no fim.
  const session = new Map();
  // Leituras que esperam o fim: { mode, barcode, reads, reason }
  const pending = new Map();
  warmUp();

  root.innerHTML = `
    <div class="screen screen-scan has-floating-bar mode-${mode}">
      <header class="band">
        <div class="band-text">
          <h1 class="sr-only">Leitor</h1>
          <div class="mode-switch" role="radiogroup" aria-label="Registrar">
            ${['entrada', 'saida'].map((m) => `
              <label class="mode-opt">
                <input type="radio" name="scan-mode" value="${m}" ${m === mode ? 'checked' : ''}>
                <span>${icon(m === 'entrada' ? 'in' : 'out')}${COPY[m].title}</span>
              </label>`).join('')}
          </div>
          <p class="band-hint" data-hint></p>
          <label class="band-switch">
            <input type="checkbox" class="switch switch-on-mode" data-fast ${fast ? 'checked' : ''}>
            <span>${icon('bolt')}Modo rápido</span>
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
        <section class="receipt" aria-label="Registros desta sessão">
          <ul class="receipt-lines"></ul>
          <p class="receipt-total"></p>
        </section>
      </main>
      <footer class="floating-bar glass-regular glass-static">
        <button type="button" class="btn btn-primary btn-lg" data-finish>${icon('check')}Concluir</button>
      </footer>
    </div>`;

  const screen = $('.screen-scan', root);
  const lines = $('.receipt-lines', root);
  const total = $('.receipt-total', root);
  const hint = $('[data-hint]', root);
  const fastInput = $('[data-fast]', root);
  const pendingBox = $('.pending', root);
  const pendingList = $('.pending-list', root);

  // "Aponte para o código" é óbvio numa tela de câmera: a linha só aparece
  // para explicar o modo rápido.
  function renderHint() {
    hint.textContent = fast ? COPY[mode].fastHint : '';
    hint.hidden = !fast;
  }

  // Troca de modo sem desmontar a tela: a câmera continua ligada.
  function setMode(next) {
    if (next === mode) return;
    screen.classList.replace(`mode-${mode}`, `mode-${next}`);
    mode = next;
    fast = loadFast(mode);
    fastInput.checked = fast;
    const radio = $(`input[name=scan-mode][value="${mode}"]`, root);
    if (radio) radio.checked = true;
    renderHint();
    history.replaceState(null, '', `#/${mode}`);
    vibrate(10);
  }

  const signed = (s) => `${COPY[s.mode].sign}${s.n}`;
  const signedNet = (net) => `${net > 0 ? '+' : net < 0 ? '−' : ''}${Math.abs(net)}`;
  const netOf = (entries) => entries.reduce((a, s) => a + (s.mode === 'entrada' ? s.n : -s.n), 0);

  function renderSession() {
    if (!session.size) {
      lines.innerHTML = '<li class="receipt-empty">O que você guardar ou tirar aparece aqui.</li>';
      total.hidden = true;
      return;
    }
    const entries = [...session.values()];
    // Cada linha abre a edição: dá para corrigir antes de concluir.
    lines.innerHTML = entries.slice().reverse().map((s) => `
      <li>
        <button type="button" class="receipt-line receipt-edit" data-edit="${esc(`${s.mode}:${s.product.code}`)}" aria-label="Editar ${esc(s.product.name)}, ${signed(s)}">
          <span class="receipt-name">${esc(s.product.name)}</span>
          <span class="receipt-dots" aria-hidden="true"></span>
          <span class="receipt-n">${signed(s)}</span>
        </button>
      </li>`).join('');
    total.hidden = false;
    total.innerHTML = `<span>${plural(entries.length, 'produto', 'produtos')}</span><span class="receipt-n">${signedNet(netOf(entries))}</span>`;
  }

  function renderPending() {
    pendingBox.hidden = !pending.size;
    pendingList.innerHTML = [...pending.entries()].map(([key, p]) => `
      <li class="pending-row">
        <span class="row-main">
          <span class="row-name">${esc(p.reason)}</span>
          <span class="row-sub">${COPY[p.mode].title}, código ${esc(p.barcode)}${p.reads > 1 ? `, lido ${p.reads} vezes` : ''}</span>
        </span>
        <button type="button" class="btn btn-quiet btn-sm" data-resolve="${esc(key)}" aria-label="Resolver o código ${esc(p.barcode)}">Resolver</button>
      </li>`).join('');
  }

  function record(m, product, movement, n) {
    const key = `${m}:${product.code}`;
    const entry = session.get(key) || { mode: m, product, n: 0 };
    session.delete(key); // volta para o fim: é a linha mais recente
    entry.product = product;
    entry.n += n;
    session.set(key, entry);
    renderSession();
    toast(`${m === 'entrada' ? '+' : '−'}${n} ${product.name}. Agora tem ${product.qty}.`, {
      mode: m,
      action: 'Desfazer',
      onAction: async () => {
        try {
          const restored = await undoMovement(movement.id);
          entry.n -= n;
          entry.product = restored;
          if (entry.n <= 0) session.delete(key);
          renderSession();
          toast('Registro desfeito.', { duration: 2500 });
        } catch (err) {
          toast(err.message, { duration: 4000 });
        }
      },
    });
  }

  // Editar uma linha da sessão: quantidade registrada, nome e ambiente.
  // A diferença na quantidade vira um ajuste no estoque (0 desfaz a linha).
  async function editEntry(key) {
    const entry = session.get(key);
    if (!entry) return;
    const product = (await getProduct(entry.product.code)) || entry.product;
    const sign = entry.mode === 'entrada' ? 1 : -1;
    // Saída: dá para tirar no máximo o que ainda tem mais o que já saiu nesta linha.
    const max = entry.mode === 'saida' ? entry.n + product.qty : 999;
    cam.pause();
    await openSheet({
      mode: entry.mode,
      label: `Editar ${product.name}`,
      render(body, close) {
        body.innerHTML = `
          <form class="stack" novalidate>
            <div class="product-head">
              ${thumb(product, 'md')}
              <div class="product-meta">
                <p class="product-name">${esc(product.name)}</p>
                ${subtitle(product) ? `<p class="product-sub">${subtitle(product)}</p>` : ''}
              </div>
            </div>
            <div class="field">
              <span class="field-label">${entry.mode === 'entrada' ? 'Quantidade que entrou' : 'Quantidade que saiu'}</span>
              <div class="stepper-host stepper-sm"></div>
              <p class="field-note">0 tira esta linha da sessão e devolve o estoque.</p>
            </div>
            <label class="field"><span class="field-label">Nome</span>
              <input class="input" name="name" maxlength="80" value="${esc(product.name)}" autocomplete="off"></label>
            <fieldset class="segmented">
              <legend class="field-label">Onde fica</legend>
              <div class="segmented-track">
                ${AREAS.map((a) => `
                  <label class="segment"><input type="radio" name="area" value="${a.id}" ${a.id === (product.area || 'cozinha') ? 'checked' : ''}><span>${a.short}</span></label>`).join('')}
              </div>
            </fieldset>
            <button type="submit" class="btn btn-mode btn-lg">${icon('check')}Salvar</button>
          </form>`;
        const step = stepper($('.stepper-host', body), { value: entry.n, min: 0, max, label: 'Quantidade registrada' });
        $('form', body).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const fresh = await getProduct(product.code);
            const diff = step.value - entry.n;
            if (diff) await setStock(product.code, fresh.qty + sign * diff, 'ajuste');
            const name = $('input[name=name]', body).value.trim();
            const area = $('input[name=area]:checked', body)?.value;
            if (name !== product.name || area !== product.area) await updateProduct(product.code, { name, area });
            entry.n = step.value;
            entry.product = await getProduct(product.code);
            if (entry.n === 0) session.delete(key);
            // O nome mudou para as outras linhas do mesmo produto também.
            for (const other of session.values()) if (other.product.code === product.code) other.product = entry.product;
            renderSession();
            close(true);
            toast(entry.n === 0 ? `${entry.product.name} saiu da sessão.` : 'Linha atualizada.', { duration: 2500 });
          } catch (err) {
            toast(err.message, { duration: 4000 });
          }
        });
      },
    });
    cam.resume();
  }

  lines.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) editEntry(btn.dataset.edit);
  });

  // Fluxo normal: a folha pergunta a quantidade.
  async function sheetFlow(barcode, qty, m = mode) {
    const r = await showProductSheet({ mode: m, barcode, qty });
    if (!r) return false;
    if (r.kind === 'switch') {
      // Saída de algo que não está no armário: vira entrada aqui mesmo.
      setMode('entrada');
      return sheetFlow(r.code, qty, 'entrada');
    }
    record(m, r.product, r.movement, r.n);
    return true;
  }

  // Modo rápido: 1 por leitura, sem folha.
  async function fastFlow(barcode) {
    const m = mode;
    const local = barcode.startsWith('SEM-') ? [] : await productsByBarcode(barcode);
    if (local.length === 1) {
      const p = local[0];
      if (m === 'saida' && p.qty === 0) {
        beep('error');
        toast(`${p.name} já está zerado no armário.`, { duration: 3000 });
        return;
      }
      const r = m === 'entrada' ? await addStock(p.code, 1) : await removeStock(p.code, 1);
      record(m, r.product, r.movement, 1);
      return;
    }
    if (barcode.startsWith('SEM-')) { await sheetFlow(barcode); return; }
    const reason = local.length ? `${local.length} produtos com este código` : (m === 'entrada' ? 'Produto novo' : 'Não está no armário');
    const key = `${m}:${barcode}`;
    const p = pending.get(key) || { mode: m, barcode, reads: 0, reason };
    p.reads += 1;
    pending.set(key, p);
    vibrate([30, 60, 30]);
    renderPending();
    toast(`${reason}. Ficou em Para resolver.`, { duration: 2500 });
  }

  async function handleCode(barcode) {
    if (fast) return fastFlow(barcode);
    return sheetFlow(barcode);
  }

  $('.mode-switch', root).addEventListener('change', (e) => {
    if (e.target.name === 'scan-mode') setMode(e.target.value);
  });

  pendingList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-resolve]');
    if (!btn) return;
    const key = btn.dataset.resolve;
    const p = pending.get(key);
    if (!p) return;
    cam.pause();
    try {
      const done = await sheetFlow(p.barcode, p.reads, p.mode);
      if (done) { pending.delete(key); renderPending(); }
    } finally {
      cam.resume();
    }
  });

  fastInput.addEventListener('change', () => {
    fast = fastInput.checked;
    saveFast(mode, fast);
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
    const modes = new Set(entries.map((s) => s.mode));
    await showReceipt({
      mode: modes.size > 1 ? 'misto' : entries[0].mode,
      lines: entries.map((s) => ({ name: s.product.name, value: signed(s), sub: `ficou ${s.product.qty}` })),
      total: { label: plural(entries.length, 'produto', 'produtos'), value: signedNet(netOf(entries)) },
    });
    location.hash = '#/';
  });

  renderHint();
  renderSession();
  const cam = mountCamera($('.cam-host', root), { onCode: handleCode });
  if (initialCode) cam.handle(initialCode);

  return () => cam.stop();
}
