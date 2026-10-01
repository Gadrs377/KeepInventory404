// Leitor: Guardar e Tirar na mesma tela. O seletor da faixa troca o modo (e a
// cor) sem desligar a câmera. Cada leitura de um produto conhecido guarda ou
// tira 1 na hora; o cartão embaixo da câmera tem − número + para corrigir (no
// lugar do antigo "Rápido" e do Desfazer). O que foi registrado aparece num
// cupom vivo; Concluir imprime o cupom final.

import { mountCamera } from './camera.js';
import { showProductSheet } from './productSheet.js';
import { showReceipt } from './receipt.js';
import { undoMovement, productsByBarcode, addStock, removeStock, getProduct, updateProduct, addLot } from '../store.js';
import { addToShopList } from '../shop.js';
import { AREAS } from '../areas.js';
import { warmUp } from '../scanner.js';
import { beep } from '../sound.js';
import { tel } from '../telemetry.js';
import { expirySheet } from './expiryLots.js';
import { formatDate } from '../dates.js';
import { $, esc, icon, toast, hideToast, plural, openSheet, vibrate, stepper, thumb, subtitle, glideTo } from '../ui.js';

const COPY = {
  entrada: { title: 'Guardar', sign: '+', head: 'Guardando' },
  saida: { title: 'Tirar', sign: '−', head: 'Tirando' },
};

export default function mountScan(root, { mode: initialMode, code: initialCode }) {
  let mode = initialMode;
  try { localStorage.setItem('ki.lastMode', mode); } catch { /* sem armazenamento */ }
  // Uma linha por produto e modo: { mode, product, n, moves: [{ id, n }] },
  // a mais recente no fim. `moves` permite desfazer de verdade (sem criar
  // saídas falsas no histórico) quando o − do cartão corrige.
  const session = new Map();
  let lastKey = '';
  // Telemetria da sessão: correções, desfazer e trocas de modo.
  const stats = { startedAt: Date.now(), edits: 0, undos: 0, switches: 0, lastSwitch: 0, lastSwitchFrom: '', concluded: false };
  warmUp();

  root.innerHTML = `
    <div class="screen screen-scan has-floating-bar mode-${mode}">
      <header class="band band-slim">
        <h1 class="sr-only">Leitor</h1>
        <a class="icon-btn band-close" href="#/" aria-label="Fechar e voltar ao armário">${icon('close')}</a>
        <div class="mode-switch" role="radiogroup" aria-label="Registrar">
          ${['entrada', 'saida'].map((m) => `
            <label class="mode-opt">
              <input type="radio" name="scan-mode" value="${m}" ${m === mode ? 'checked' : ''}>
              <span>${icon(m === 'entrada' ? 'in' : 'out')}${COPY[m].title}</span>
            </label>`).join('')}
        </div>
        <span class="band-end" aria-hidden="true"></span>
      </header>
      <main>
        <div class="cam-host"></div>
        <div class="last-host" aria-live="polite"></div>
        <section class="live-ticket" aria-label="Registrados agora"></section>
      </main>
      <footer class="floating-bar glass-regular glass-static scan-bar">
        <button type="button" class="btn btn-quiet btn-lg" data-type>${icon('keyboard')}Digitar</button>
        <button type="button" class="btn btn-quiet btn-lg" data-nota>${icon('qrCode')}Nota fiscal</button>
        <button type="button" class="btn btn-mode btn-lg" data-finish hidden>${icon('check')}Concluir</button>
      </footer>
    </div>`;

  const screen = $('.screen-scan', root);
  const lastHost = $('.last-host', root);
  const ticket = $('.live-ticket', root);
  const notaBtn = $('[data-nota]', root);
  const finishBtn = $('[data-finish]', root);

  // Troca de modo sem desmontar a tela: a câmera continua ligada.
  function setMode(next) {
    if (next === mode) return;
    stats.switches += 1;
    stats.lastSwitch = Date.now();
    stats.lastSwitchFrom = mode;
    screen.classList.replace(`mode-${mode}`, `mode-${next}`);
    mode = next;
    const radio = $(`input[name=scan-mode][value="${mode}"]`, root);
    if (radio) { radio.checked = true; glideTo($('.mode-switch', root), radio.closest('label')); }
    history.replaceState(null, '', `#/${mode}`);
    try { localStorage.setItem('ki.lastMode', mode); } catch { /* sem armazenamento */ }
    vibrate(10);
    renderTicket();
  }

  const signed = (s) => `${COPY[s.mode].sign}${s.n}`;
  const signedNet = (net) => `${net > 0 ? '+' : net < 0 ? '−' : ''}${Math.abs(net)}`;
  const netOf = (entries) => entries.reduce((a, s) => a + (s.mode === 'entrada' ? s.n : -s.n), 0);

  // ---------- Cartão da última leitura ----------
  function renderLast(fresh = false) {
    const s = session.get(lastKey);
    if (!s) { lastHost.innerHTML = ''; return; }
    const p = s.product;
    const ended = s.mode === 'saida' && p.qty === 0;
    const sub = ended ? '<strong>Acabou.</strong> Era a última.' : `Agora <strong>${p.qty}</strong> no armário`;
    lastHost.innerHTML = `
      <div class="last-card mode-${s.mode}${fresh ? ' is-fresh' : ''}">
        <div class="last-row">
          ${thumb(p, 'md')}
          <div class="last-text">
            <p class="last-name">${esc(p.name)}</p>
            <div class="last-sub">
              <span>${sub}</span>
              <div class="last-step" role="group" aria-label="Quantidade desta leitura">
                <button type="button" class="last-step-btn" data-step="-1" aria-label="Menos 1">${icon('minus')}</button>
                <button type="button" class="tag tag-mode last-n" data-type-n aria-label="${s.mode === 'entrada' ? 'Entraram' : 'Saíram'} ${s.n}. Tocar para digitar">${signed(s)}</button>
                <button type="button" class="last-step-btn" data-step="1" aria-label="Mais 1" ${s.mode === 'saida' && p.qty === 0 ? 'disabled' : ''}>${icon('plus')}</button>
              </div>
            </div>
          </div>
        </div>
        ${s.mode === 'entrada'
          ? `<button type="button" class="btn btn-quiet last-act" data-expiry>${icon('calendar')}${s.dates ? `Validade ${esc(s.dates)}` : 'Marcar validade'}</button>`
          : ended ? `<button type="button" class="btn btn-quiet last-act" data-shop>${icon('cart')}Adicionar às Compras</button>` : ''}
      </div>`;
  }

  // ---------- Cupom vivo ----------
  function renderTicket() {
    const entries = [...session.values()];
    notaBtn.hidden = !!entries.length || mode !== 'entrada';
    finishBtn.hidden = !entries.length;
    $('[data-type]', root).classList.toggle('is-wide', !entries.length && mode !== 'entrada');
    if (!entries.length) {
      ticket.innerHTML = `
        <div class="scan-empty">
          <p class="scan-empty-lead">Nada lido ainda</p>
          <p>Cada leitura ${mode === 'entrada' ? 'guarda' : 'tira'} 1.</p>
          <p>Para ${mode === 'entrada' ? 'guardar' : 'tirar'} 2, tire da mira e leia de novo.</p>
        </div>`;
      return;
    }
    const modes = new Set(entries.map((s) => s.mode));
    const head = modes.size > 1 ? 'Guardando e tirando' : COPY[entries[0].mode].head;
    ticket.innerHTML = `
      <div class="paper">
        <p class="paper-head">${head}</p>
        <ul class="paper-lines">
          ${entries.slice().reverse().map((s) => {
            const key = `${s.mode}:${s.product.code}`;
            return `
            <li class="${key === lastKey ? 'is-last' : ''}">
              <button type="button" class="paper-line" data-edit="${esc(key)}" aria-label="Corrigir ${esc(s.product.name)}, ${signed(s)}">
                <span class="paper-name">${esc(s.product.name)}</span>
                <span class="paper-dots" aria-hidden="true"></span>
                <span class="paper-n">${signed(s)}</span>
                ${icon('chevron', 'paper-chev')}
              </button>
            </li>`;
          }).join('')}
        </ul>
        <p class="paper-total"><span>${plural(entries.length, 'produto', 'produtos')}</span><span class="paper-n">${signedNet(netOf(entries))}</span></p>
      </div>
      <p class="paper-hint">Toque numa linha para corrigir</p>`;
  }

  function record(m, product, movement, n, { fresh = true } = {}) {
    const key = `${m}:${product.code}`;
    const entry = session.get(key) || { mode: m, product, n: 0, moves: [] };
    session.delete(key); // volta para o fim: é a linha mais recente
    entry.product = product;
    entry.n += n;
    entry.moves.push({ id: movement.id, n });
    session.set(key, entry);
    lastKey = key;
    renderLast(fresh);
    renderTicket();
    cam.flash(`${m === 'entrada' ? '+' : '−'}${n} ${product.name}`, m);
  }

  // Muda o total de uma linha para `target`. Diminuir desfaz os movimentos
  // (o histórico não ganha uma saída que não houve); aumentar registra mais.
  async function setEntryN(key, target) {
    const entry = session.get(key);
    if (!entry || target === entry.n) return;
    const code = entry.product.code;
    while (entry.n > target && entry.moves.length) {
      const mv = entry.moves.pop();
      const restored = await undoMovement(mv.id);
      entry.n -= mv.n;
      entry.product = restored;
      stats.undos += 1;
      if (stats.lastSwitch && Date.now() - stats.lastSwitch < 60000) {
        tel('troca-desfeita', { de: stats.lastSwitchFrom, para: entry.mode, segundos: Math.round((Date.now() - stats.lastSwitch) / 1000) });
      }
    }
    if (target > entry.n) {
      const more = target - entry.n;
      const r = entry.mode === 'entrada' ? await addStock(code, more) : await removeStock(code, more);
      entry.moves.push({ id: r.movement.id, n: more });
      entry.n += more;
      entry.product = r.product;
    }
    if (entry.n <= 0) {
      session.delete(key);
      if (lastKey === key) lastKey = [...session.keys()].pop() || '';
    }
    renderLast();
    renderTicket();
  }

  lastHost.addEventListener('click', async (e) => {
    const s = session.get(lastKey);
    if (!s) return;
    const step = e.target.closest('[data-step]');
    if (step && !step.disabled) {
      vibrate(8);
      try { await setEntryN(lastKey, s.n + Number(step.dataset.step)); } catch (err) { toast(err.message, { duration: 3000 }); }
      return;
    }
    if (e.target.closest('[data-type-n]')) { await typeQuantity(lastKey); return; }
    if (e.target.closest('[data-shop]')) {
      toast(addToShopList(s.product.name) ? `${s.product.name} está nas Compras.` : `${s.product.name} já estava nas Compras.`, { duration: 2500 });
      return;
    }
    if (e.target.closest('[data-expiry]')) {
      cam.pause();
      try {
        const picked = await expirySheet({ free: s.n, mode: 'entrada' });
        if (picked && picked.length) {
          for (const l of picked) await addLot(s.product.code, l.qty, l.expiresAt);
          s.dates = picked.map((l) => formatDate(l.expiresAt)).join(', ');
          renderLast();
          toast(`Validade ${s.dates}.`, { mode: 'entrada', duration: 2500 });
        }
      } finally {
        cam.resume();
      }
    }
  });

  // Tocar no número do cartão: teclado de números ("Quantas unidades entraram?").
  async function typeQuantity(key) {
    const s = session.get(key);
    if (!s) return;
    const fresh = (await getProduct(s.product.code)) || s.product;
    const base = s.mode === 'entrada' ? fresh.qty - s.n : fresh.qty + s.n;
    const max = s.mode === 'saida' ? base : 999;
    cam.pause();
    const n = await openSheet({
      mode: s.mode,
      label: 'Digitar a quantidade',
      render(body, close) {
        body.innerHTML = `
          <form class="stack qty-type" novalidate>
            <div class="product-head">${thumb(fresh, 'md')}<div class="product-meta"><p class="product-name">${esc(fresh.name)}</p>
              <p class="product-sub">${s.mode === 'entrada' ? 'Quantas unidades entraram?' : 'Quantas unidades saíram?'}</p></div></div>
            <input class="input qty-big" type="text" inputmode="numeric" pattern="[0-9]*" value="${s.n}" aria-label="Quantidade" autocomplete="off">
            <div class="qty-foot"><span data-after></span><button type="submit" class="btn btn-mode btn-lg" data-ok></button></div>
          </form>`;
        const input = $('input', body);
        const after = $('[data-after]', body);
        const ok = $('[data-ok]', body);
        const upd = () => {
          const v = Math.max(0, Math.min(max, parseInt(input.value.replace(/\D/g, ''), 10) || 0));
          after.textContent = `Fica com ${s.mode === 'entrada' ? base + v : base - v} no armário`;
          ok.innerHTML = `${icon('check')}${v ? `${COPY[s.mode].title} ${v}` : 'Tirar da lista'}`;
          return v;
        };
        upd();
        input.addEventListener('input', upd);
        setTimeout(() => { input.focus(); input.select(); }, 300);
        $('form', body).addEventListener('submit', (e) => { e.preventDefault(); close(upd()); });
      },
    });
    cam.resume();
    if (n === null || n === undefined) return;
    stats.edits += 1;
    try { await setEntryN(key, n); } catch (err) { toast(err.message, { duration: 3000 }); }
  }

  // Corrigir uma linha do cupom: quantidade, nome e onde fica.
  async function editEntry(key) {
    const entry = session.get(key);
    if (!entry) return;
    const product = (await getProduct(entry.product.code)) || entry.product;
    const max = entry.mode === 'saida' ? entry.n + product.qty : 999;
    cam.pause();
    const r = await openSheet({
      mode: entry.mode,
      label: `Corrigir ${product.name}`,
      title: 'Corrigir',
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
              <p class="field-note">Com 0, a linha sai e o armário volta a ter o que tinha.</p>
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
        $('form', body).addEventListener('submit', (e) => {
          e.preventDefault();
          close({ n: step.value, name: $('input[name=name]', body).value.trim(), area: $('input[name=area]:checked', body)?.value });
        });
      },
    });
    cam.resume();
    if (!r) return;
    try {
      if (r.name !== product.name || r.area !== product.area) {
        await updateProduct(product.code, { name: r.name, area: r.area });
        const fresh = await getProduct(product.code);
        for (const other of session.values()) if (other.product.code === product.code) other.product = { ...other.product, name: fresh.name, area: fresh.area };
      }
      stats.edits += 1;
      await setEntryN(key, r.n);
      toast(r.n === 0 ? `${product.name} saiu da lista.` : 'Linha corrigida.', { duration: 2500 });
    } catch (err) {
      toast(err.message, { duration: 4000 });
    }
  }

  ticket.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) editEntry(btn.dataset.edit);
  });

  // Produto que o app não conhece (ou um código com vários): a folha pergunta.
  async function sheetFlow(barcode, qty, m = mode) {
    const r = await showProductSheet({ mode: m, barcode, qty });
    if (!r) return false;
    if (r.kind === 'switch') {
      // Tirar algo que não está no armário: vira Guardar aqui mesmo.
      setMode('entrada');
      return sheetFlow(r.code, qty, 'entrada');
    }
    record(m, r.product, r.movement, r.n);
    return true;
  }

  // Cada leitura de um produto conhecido: 1 na hora, só com o bip.
  async function handleCode(barcode) {
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
    await sheetFlow(barcode);
  }

  $('.mode-switch', root).addEventListener('change', (e) => {
    if (e.target.name === 'scan-mode') setMode(e.target.value);
  });

  $('[data-type]', root).addEventListener('click', () => cam.manual());
  notaBtn.addEventListener('click', () => {
    const on = !cam.qrMode;
    cam.setQrMode(on);
    notaBtn.classList.toggle('is-on', on);
    notaBtn.setAttribute('aria-pressed', String(on));
    vibrate(8);
  });

  finishBtn.addEventListener('click', async () => {
    stats.concluded = true;
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

  renderTicket();
  // Nota fiscal lida (ou link colado): um cartão diz de onde é, quantos itens
  // e o total ("Ver os 7 itens"); a revisão abre por cima, e tudo entra de uma vez.
  async function handleNota(p) {
    if (mode !== 'entrada') setMode('entrada');
    notaBtn.classList.remove('is-on');
    const nota = await import('./nota.js');
    lastKey = '';
    lastHost.innerHTML = `
      <div class="last-card nota-card is-fresh">
        <div class="last-row"><span class="nota-ico" aria-hidden="true">${icon('receipt')}</span>
          <div class="last-text"><p class="last-name">Nota fiscal</p><div class="last-sub"><span><span class="spinner" aria-hidden="true"></span> Buscando a nota</span></div></div></div>
      </div>`;
    let data;
    try {
      data = await nota.fetchNota(p);
    } catch (err) {
      lastHost.innerHTML = `
        <div class="last-card nota-card">
          <div class="last-row"><span class="nota-ico" aria-hidden="true">${icon('receipt')}</span>
            <div class="last-text"><p class="last-name">Não deu para ler a nota</p><div class="last-sub"><span>${esc(err.message)}</span></div></div></div>
          <div class="act-row"><button type="button" class="btn btn-quiet btn-lg" data-nota-no>Agora não</button><button type="button" class="btn btn-mode btn-lg" data-nota-retry>Tentar de novo</button></div>
        </div>`;
      return;
    }
    const s = nota.notaSummary(data);
    lastHost.innerHTML = `
      <div class="last-card nota-card is-fresh">
        <div class="last-row"><span class="nota-ico" aria-hidden="true">${icon('receipt')}</span>
          <div class="last-text"><p class="last-name">Nota fiscal do ${esc(s.store)}</p><div class="last-sub"><span>${esc([s.when, plural(s.items, 'item', 'itens'), s.total].filter(Boolean).join(', '))}</span></div></div></div>
        <div class="act-row"><button type="button" class="btn btn-quiet btn-lg" data-nota-no>Agora não</button><button type="button" class="btn btn-mode btn-lg" data-nota-go>${icon('listChecks')}Ver os ${s.items} itens</button></div>
      </div>`;
    notaPending = { p, data };
  }
  let notaPending = null;
  lastHost.addEventListener('click', async (e) => {
    if (e.target.closest('[data-nota-no]')) { notaPending = null; renderLast(); return; }
    if (e.target.closest('[data-nota-retry]')) { cam.handle(notaPending ? notaPending.p : '', handleNota); return; }
    if (e.target.closest('[data-nota-go]') && notaPending) {
      const { p, data } = notaPending;
      const { importNota } = await import('./nota.js');
      cam.pause();
      const done = await importNota(p, data);
      cam.resume();
      notaPending = null;
      renderLast();
      if (done && !session.size) location.hash = '#/';
    }
  });

  const cam = mountCamera($('.cam-host', root), { onCode: handleCode, onNota: handleNota, bar: true, sound: () => (mode === 'saida' ? 'out' : 'in') });
  if (initialCode) cam.handle(initialCode);
  // Veio de "Ler a nota fiscal" (Armário, Compras): abre já no modo nota.
  try {
    if (sessionStorage.getItem('ki.qr')) { sessionStorage.removeItem('ki.qr'); cam.setQrMode(true); notaBtn.classList.add('is-on'); }
  } catch { /* sem armazenamento */ }

  // Resumo de cada ida ao leitor, concluída ou não.
  function telSession() {
    const entries = [...session.values()];
    tel('sessao', {
      modo: initialMode,
      modos: [...new Set(entries.map((s) => s.mode))],
      produtos: session.size,
      unidades: entries.reduce((a, s) => a + s.n, 0),
      correcoes: stats.edits,
      desfazer: stats.undos,
      trocas: stats.switches,
      concluiu: stats.concluded,
      segundos: Math.round((Date.now() - stats.startedAt) / 1000),
    });
  }

  return () => { telSession(); cam.stop(); };
}
