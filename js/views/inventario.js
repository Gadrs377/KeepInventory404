// Conferir o armário: lê cada produto e confere a quantidade (e, em "Conferir
// tudo", marca a data que falta). O rascunho fica salvo a cada produto, dá
// para parar e continuar depois. Dois jeitos na mesma tela:
//   kind 'tudo'   Conferir tudo (quantidade e datas, numa passada)
//   kind 'contar' Só contar (nunca pede data)

import { mountCamera } from './camera.js';
import { showProductSheet } from './productSheet.js';
import { expirySheet } from './expiryLots.js';
import { listProducts, listLots, startCount, getCountDraft, saveCountDraft, discardCountDraft, onChange, productsByBarcode, getProduct, lotsFor, addLot } from '../store.js';
import { discardLot, unitWord } from '../actions.js';
import { AREAS } from '../areas.js';
import { warmUp } from '../scanner.js';
import { daysUntil, formatDate, relativeDays } from '../dates.js';
import { $, esc, icon, openSheet, thumb, toast, plural, vibrate, stepper } from '../ui.js';
import { morph } from '../morph.js';

// ~37 s por produto, da telemetria de 30/09.
const SECONDS_PER_PRODUCT = 37;
const INTRO_KEY = 'ki.conferir.intro';

export default function mountInventario(root, m = {}) {
  const kind = m.kind === 'tudo' ? 'tudo' : 'contar';
  const COPY = kind === 'tudo'
    ? { title: 'Conferir o armário', done: 'conferidos', head: 'Conferidos', verb: 'conferido' }
    : { title: 'Contar o armário', done: 'contados', head: 'Contados', verb: 'contado' };
  warmUp();
  root.innerHTML = `
    <div class="screen screen-count has-floating-bar mode-contagem">
      <header class="band band-slim count-band">
        <button type="button" class="icon-btn band-close" data-exit aria-label="Sair">${icon('close')}</button>
        <div class="band-center">
          <h1 class="band-name">${COPY.title}</h1>
          <p class="band-count" data-progress></p>
        </div>
        <span class="ring" aria-hidden="true"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" class="ring-bg"/><circle cx="18" cy="18" r="14" class="ring-fg" pathLength="100"/></svg></span>
      </header>
      <main>
        <div class="cam-host"></div>
        <div class="last-host count-card" aria-live="polite"></div>
        <section class="live-ticket" aria-label="${COPY.head}"></section>
      </main>
      <footer class="floating-bar glass-regular glass-static scan-bar">
        <button type="button" class="btn btn-quiet btn-lg" data-type>${icon('keyboard')}Digitar</button>
        <a class="btn btn-mode btn-lg" href="#/revisao" data-review>${icon('listChecks')}Revisar</a>
      </footer>
    </div>`;

  const card = $('.count-card', root);
  const ticket = $('.live-ticket', root);
  const progress = $('[data-progress]', root);
  const ringFg = $('.ring-fg', root);
  const review = $('[data-review]', root);
  let alive = true;
  let products = [];
  let lotsBy = new Map();
  let draft = null;
  let lastCode = '';
  let order = []; // códigos na ordem em que foram conferidos

  const inScope = (p) => !draft || !draft.area || draft.area === 'tudo' || (p.area || 'cozinha') === draft.area;

  async function refresh() {
    const [list, d, lots] = await Promise.all([listProducts(), getCountDraft(), listLots()]);
    if (!alive) return;
    products = list;
    draft = d || { counts: {}, startedAt: Date.now() };
    lotsBy = new Map();
    for (const l of lots) { if (!lotsBy.has(l.code)) lotsBy.set(l.code, []); lotsBy.get(l.code).push(l); }
    if (!order.length) order = Object.keys(draft.counts);
    const scope = products.filter(inScope);
    const done = scope.filter((p) => Object.hasOwn(draft.counts, p.code)).length;
    progress.textContent = scope.length ? `${done} de ${scope.length}` : '';
    ringFg.style.strokeDasharray = `${scope.length ? Math.round((done / scope.length) * 100) : 0} 100`;
    const ring = $('.ring', root);
    if (scope.length && done === scope.length && !ring.classList.contains('is-full')) { ring.classList.add('is-full'); vibrate([10, 60, 20]); }
    else if (done < scope.length) ring.classList.remove('is-full');
    review.classList.toggle('is-disabled', done === 0);
    review.setAttribute('aria-disabled', String(done === 0));
    renderTicket(scope, done);
    renderCard();
  }

  function renderTicket(scope, done) {
    const counted = order.filter((c) => Object.hasOwn(draft.counts, c)).map((c) => products.find((p) => p.code === c)).filter(Boolean);
    const left = scope.length - done;
    if (!counted.length) {
      morph(ticket, `
        <div class="scan-empty" data-key="empty">
          <p class="scan-empty-lead">Leia o código do primeiro produto</p>
          <p>${kind === 'tudo' ? 'Se a quantidade estiver errada, ajuste. Se faltar a data, marque ou pule.' : 'Se a quantidade estiver errada, ajuste no − e no +.'}</p>
          ${left ? `<button type="button" class="link-btn" data-left>Ver os ${left} que faltam</button>` : ''}
        </div>`);
      return;
    }
    morph(ticket, `
      <div class="paper" data-key="paper">
        <p class="paper-head">${COPY.head}</p>
        <ul class="paper-lines">
          ${counted.slice().reverse().map((p) => {
            const n = draft.counts[p.code];
            const marked = (draft.marked || {})[p.code];
            return `
            <li class="${p.code === lastCode ? 'is-last' : ''}" data-key="pl-${esc(p.code)}">
              <button type="button" class="paper-line" data-code="${esc(p.code)}" aria-label="Corrigir ${esc(p.name)}, ${n}">
                <span class="paper-name">${esc(p.name)}${marked ? `<span class="paper-sub">, vence ${esc(formatDate(marked, false))}</span>` : ''}</span>
                <span class="paper-dots" aria-hidden="true"></span>
                <span class="paper-n"><span data-roll>${n}</span>${n === p.qty ? '<span class="paper-ok" aria-label="confere"> ✓</span>' : ''}</span>
                ${icon('chevron', 'paper-chev')}
              </button>
            </li>`;
          }).join('')}
        </ul>
        <p class="paper-total"><span>${plural(counted.length, COPY.verb, COPY.done)}</span>${left ? `<button type="button" class="paper-more" data-left>Ver os ${left} que faltam</button>` : '<span>Todos</span>'}</p>
      </div>
      <p class="paper-hint">Toque numa linha para corrigir</p>`);
  }

  // Cartão do produto que acabou de ser lido: − número + (a contagem), as datas
  // que já tem e, se venceu, o aviso com Jogar fora.
  function renderCard() {
    const p = products.find((x) => x.code === lastCode);
    if (!p || !Object.hasOwn(draft.counts, p.code)) { morph(card, ''); return; }
    const n = draft.counts[p.code];
    const lots = lotsBy.get(p.code) || [];
    const past = lots.filter((l) => daysUntil(l.expiresAt) < 0);
    const sub = n !== p.qty ? `<span class="diff-note">O armário dizia ${p.qty}</span>`
      : kind === 'tudo' && lots.length && lots.reduce((a, l) => a + l.qty, 0) >= n ? 'Todas com data' : `${unitWord(p, n)}`;
    // Mesmo produto (− e +, data marcada): muda só o que mudou. Outro produto:
    // o cartão chega de novo.
    const same = card.dataset.code === p.code;
    card.dataset.code = p.code;
    const html = `
      <div class="last-card mode-contagem" data-key="card-${esc(p.code)}">
        <div class="last-row">
          ${thumb(p, 'md')}
          <div class="last-text">
            <p class="last-name">${esc(p.name)}</p>
            <div class="last-sub">
              <span>${sub}</span>
              <div class="last-step" role="group" aria-label="Quantos tem">
                <button type="button" class="last-step-btn" data-step="-1" aria-label="Menos 1" ${n ? '' : 'disabled'}>${icon('minus')}</button>
                <span class="tag tag-mode last-n" aria-live="polite" data-roll>${n}</span>
                <button type="button" class="last-step-btn" data-step="1" aria-label="Mais 1">${icon('plus')}</button>
              </div>
            </div>
          </div>
        </div>
        ${kind === 'tudo' && lots.length && !past.length ? `
        <ul class="peek-dates count-dates">${lots.map((l) => `<li>${icon('calendar')}<b>${formatDate(l.expiresAt)}</b><span>${unitWord(p, l.qty)}</span></li>`).join('')}</ul>` : ''}
      </div>
      ${kind === 'tudo' && past.length ? `
      <div class="act-card count-expired">
        <div class="act-head"><b>${esc(relativeDays(past[0].expiresAt))}</b><span>${formatDate(past[0].expiresAt)}</span></div>
        <div class="act-row">
          <button type="button" class="btn btn-quiet btn-lg" data-keep-lot>Ainda está bom</button>
          <button type="button" class="btn btn-mode mode-saida btn-lg" data-drop-lot="${past[0].id}">${icon('trash')}${(p.med || p.area === 'remedios') ? 'Separar' : 'Jogar fora'}</button>
        </div>
        <p class="act-note">${(p.med || p.area === 'remedios') ? 'Remédio vencido vai para a farmácia, não para o lixo comum.' : 'Jogar fora tira do armário. Depois, você escolhe se vai para as Compras.'}</p>
      </div>` : ''}
      ${n === p.qty && !past.length ? '<p class="count-hint">Se o número estiver errado, ajuste no − e no +. Senão, leia o próximo.</p>' : ''}`;
    if (same) morph(card, html); else card.innerHTML = html;
  }

  async function setCount(code, n) {
    const d = await startCount();
    if (kind === 'tudo') d.kind = 'tudo';
    d.counts[code] = Math.max(0, n);
    await saveCountDraft(d);
    order = order.filter((c) => c !== code).concat(code);
    lastCode = code;
    await refresh();
  }

  // Produto conhecido: a contagem começa no que o armário diz (é conferir);
  // zerado no app mas está na mão, começa em 1.
  async function countKnown(p) {
    const d = await getCountDraft();
    const already = d && Object.hasOwn(d.counts, p.code);
    if (!already) await setCount(p.code, Math.max(1, p.qty));
    else { lastCode = p.code; order = order.filter((c) => c !== p.code).concat(p.code); renderCard(); renderTicket(products.filter(inScope), products.filter(inScope).filter((x) => Object.hasOwn(draft.counts, x.code)).length); }
    cam.flash(`${draft.counts[p.code]} ${p.name}`, 'contagem');
    vibrate(15);
    if (kind === 'tudo') await askDates(p);
  }

  // Conferir tudo: faltando data, a câmera da data abre logo em seguida.
  async function askDates(p) {
    const cur = (await getProduct(p.code)) || p;
    const lots = await lotsFor(cur.code);
    const n = draft.counts[cur.code] ?? cur.qty;
    const free = Math.min(n, cur.qty) - lots.reduce((a, l) => a + l.qty, 0);
    if (free <= 0 || lots.some((l) => daysUntil(l.expiresAt) < 0)) return;
    const head = `
      <div class="product-head exp-product">
        ${thumb(cur, 'md')}
        <div class="product-meta">
          <p class="product-name">${esc(cur.name)}</p>
          <p class="product-sub">${free === n ? `${unitWord(cur, n)}, sem data` : `${free} de ${n} sem data`}</p>
        </div>
      </div>`;
    cam.pause();
    let picked = null;
    try {
      picked = await expirySheet({ free, existing: lots.map((l) => ({ expiresAt: l.expiresAt, qty: l.qty })), mode: 'contagem', label: `Validade de ${cur.name}`, doneClass: 'btn-mode', head });
    } finally {
      cam.resume();
    }
    if (!picked || !picked.length) return;
    for (const l of picked) await addLot(cur.code, l.qty, l.expiresAt);
    const d = await startCount();
    d.marked = { ...(d.marked || {}), [cur.code]: picked[0].expiresAt };
    d.dates = (d.dates || 0) + picked.length;
    await saveCountDraft(d);
    await refresh();
  }

  async function handleCode(barcode) {
    const local = barcode.startsWith('SEM-') ? [] : await productsByBarcode(barcode);
    if (local.length === 1) { await countKnown(local[0]); return; }
    // Produto novo, sem código ou vários com o mesmo código: a folha pergunta.
    const r = await showProductSheet({ mode: 'contagem', barcode });
    if (r && r.product) {
      order = order.filter((c) => c !== r.product.code).concat(r.product.code);
      lastCode = r.product.code;
      await refresh();
      if (kind === 'tudo') await askDates(r.product);
    }
  }

  card.addEventListener('click', async (e) => {
    const step = e.target.closest('[data-step]');
    if (step && !step.disabled && lastCode) {
      vibrate(8);
      await setCount(lastCode, (draft.counts[lastCode] || 0) + Number(step.dataset.step));
      return;
    }
    if (e.target.closest('[data-keep-lot]')) {
      const p = products.find((x) => x.code === lastCode);
      if (p) await askDates({ ...p });
      card.querySelector('.count-expired')?.remove();
      return;
    }
    const drop = e.target.closest('[data-drop-lot]');
    if (drop) {
      const p = await getProduct(lastCode);
      const lot = (lotsBy.get(lastCode) || []).find((l) => String(l.id) === drop.dataset.dropLot);
      if (!p || !lot) return;
      await discardLot(p, lot);
      // O que foi jogado fora sai também da contagem.
      await setCount(p.code, Math.max(0, (draft.counts[p.code] || 0) - lot.qty));
    }
  });

  // Corrigir uma linha: quantos tem, com o seletor.
  async function editCount(code) {
    const p = products.find((x) => x.code === code);
    if (!p) return;
    cam.pause();
    const n = await openSheet({
      mode: 'contagem',
      label: `Quantos ${p.name}`,
      title: 'Quantos tem?',
      render(body, close) {
        body.innerHTML = `
          <form class="stack" novalidate>
            <div class="product-head">${thumb(p, 'md')}<div class="product-meta"><p class="product-name">${esc(p.name)}</p><p class="product-sub">O armário diz ${p.qty}</p></div></div>
            <div class="stepper-host stepper-lg" data-n></div>
            <div class="sheet-sticky"><button type="submit" class="btn btn-mode btn-lg">${icon('check')}Salvar</button></div>
          </form>`;
        const st = stepper($('[data-n]', body), { value: Object.hasOwn(draft.counts, code) ? draft.counts[code] : p.qty, min: 0, max: 9999, label: 'Quantos tem' });
        $('form', body).addEventListener('submit', (e) => { e.preventDefault(); close(st.value); });
      },
    });
    cam.resume();
    if (n === null || n === undefined) return;
    await setCount(code, n);
  }

  ticket.addEventListener('click', (e) => {
    if (e.target.closest('[data-left]')) { openLeft(); return; }
    const line = e.target.closest('[data-code]');
    if (line) editCount(line.dataset.code);
  });

  // "Ver os 15 que faltam": por ambiente, com Contar (para o que não tem código).
  async function openLeft() {
    cam.pause();
    await openSheet({
      mode: 'contagem',
      label: 'O que falta conferir',
      render(body, close) {
        const left = products.filter((p) => inScope(p) && !Object.hasOwn(draft.counts, p.code));
        const draw = () => {
          const rest = products.filter((p) => inScope(p) && !Object.hasOwn(draft.counts, p.code));
          body.innerHTML = `
            <h2 class="sheet-title">Faltam ${rest.length}</h2>
            <p class="sheet-text sheet-text-sm">Sem código? Toque em Contar e conte sem ler.</p>
            ${AREAS.map((a) => {
              const rows = rest.filter((p) => (p.area || 'cozinha') === a.id);
              if (!rows.length) return '';
              return `<h3 class="list-title">${a.label} (${rows.length})</h3>
                <ul class="left-list">${rows.map((p) => `
                  <li class="left-row">${thumb(p)}<span class="row-main"><span class="row-name">${esc(p.name)}</span><span class="row-sub">O armário diz ${p.qty}</span></span>
                    <button type="button" class="btn btn-quiet btn-sm" data-count="${esc(p.code)}">Contar</button></li>`).join('')}</ul>`;
            }).join('')}
            ${rest.length ? '' : '<p class="empty">Tudo conferido.</p>'}`;
        };
        if (!left.length) close(null);
        draw();
        body.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-count]');
          if (!b) return;
          close(null);
          await editCount(b.dataset.count);
        });
      },
    });
    cam.resume();
  }

  review.addEventListener('click', (e) => {
    if (review.classList.contains('is-disabled')) {
      e.preventDefault();
      toast('Confira pelo menos um produto antes de revisar.', { duration: 3000 });
    }
  });
  $('[data-type]', root).addEventListener('click', () => cam.manual());

  $('[data-exit]', root).addEventListener('click', async () => {
    const d = await getCountDraft();
    if (!d || !Object.keys(d.counts).length) {
      await discardCountDraft();
      location.hash = '#/';
      return;
    }
    const choice = await openSheet({
      mode: 'contagem',
      label: 'Sair',
      render(body, close) {
        body.innerHTML = `
          <h2 class="sheet-title">Continuar depois?</h2>
          <p class="sheet-text">O armário só muda quando você aplicar, na revisão.</p>
          <div class="sheet-actions">
            <button type="button" class="btn btn-mode" data-keep>Salvar e sair</button>
            <button type="button" class="btn btn-danger-ghost" data-discard>Descartar o que conferiu</button>
          </div>`;
        $('[data-keep]', body).addEventListener('click', () => close('keep'));
        $('[data-discard]', body).addEventListener('click', () => close('discard'));
      },
    });
    if (choice === 'discard') await discardCountDraft();
    if (choice) location.hash = '#/';
  });

  const off = onChange(() => { if (alive) refresh(); });
  let cam = null;

  // Primeira vez: o que é, em três passos, quanto tempo leva e o que conferir.
  async function begin() {
    const existing = await getCountDraft();
    const all = await listProducts();
    const used = AREAS.filter((a) => all.some((p) => (p.area || 'cozinha') === a.id));
    let seen = false;
    try { seen = !!localStorage.getItem(INTRO_KEY); } catch { /* sem armazenamento */ }
    if (!existing && (!seen || used.length > 1)) {
      const area = await introSheet(all, used, !seen);
      if (area === null) { location.hash = '#/'; return; }
      try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* sem armazenamento */ }
      await saveCountDraft({ startedAt: Date.now(), counts: {}, kind, area });
    } else if (!existing) {
      await saveCountDraft({ startedAt: Date.now(), counts: {}, kind, area: 'tudo' });
    }
    if (!alive) return;
    await refresh();
    cam = mountCamera($('.cam-host', root), { onCode: handleCode, bar: true, compact: false, sound: () => 'ok' });
  }

  function introSheet(all, used, first) {
    const est = (area) => {
      const n = all.filter((p) => area === 'tudo' || (p.area || 'cozinha') === area).length;
      const min = Math.max(1, Math.round((n * SECONDS_PER_PRODUCT) / 60));
      return `${plural(n, 'produto', 'produtos')}. Leva uns ${plural(min, 'minuto', 'minutos')}.`;
    };
    return openSheet({
      mode: 'contagem',
      label: COPY.title,
      title: COPY.title,
      render(body, close) {
        let area = 'tudo';
        body.innerHTML = `
          ${first ? `
          <ol class="steps">
            <li><b>1</b><span>Leia cada produto do armário.</span></li>
            <li><b>2</b><span>${kind === 'tudo' ? 'Se a quantidade estiver errada, ajuste. Se faltar a data, marque ou pule.' : 'Se a quantidade estiver errada, ajuste.'}</span></li>
            <li><b>3</b><span>No fim, revise o que não apareceu e aplique.</span></li>
          </ol>` : ''}
          ${used.length > 1 ? `
          <p class="field-label">O que conferir</p>
          <div class="chips" role="radiogroup" aria-label="O que conferir">
            <button type="button" class="chip" role="radio" aria-checked="true" data-area="tudo">Tudo</button>
            ${used.map((a) => `<button type="button" class="chip" role="radio" aria-checked="false" data-area="${a.id}">${a.short}</button>`).join('')}
          </div>` : ''}
          <p class="field-note" data-est>${est('tudo')} Dá para parar e continuar depois.</p>
          <div class="sheet-sticky"><button type="button" class="btn btn-mode btn-lg" data-go>${icon('listChecks')}Começar</button></div>`;
        body.addEventListener('click', (e) => {
          const c = e.target.closest('[data-area]');
          if (c) {
            area = c.dataset.area;
            body.querySelectorAll('[data-area]').forEach((b) => b.setAttribute('aria-checked', String(b === c)));
            $('[data-est]', body).textContent = `${est(area)} Dá para parar e continuar depois.`;
            vibrate(6);
            return;
          }
          if (e.target.closest('[data-go]')) close(area);
        });
      },
    });
  }

  begin();

  return () => {
    alive = false;
    off();
    if (cam) cam.stop();
  };
}
