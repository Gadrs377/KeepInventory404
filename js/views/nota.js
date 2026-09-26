// Importar a compra pelo QR Code da nota fiscal (NFC-e do RS).
// O Worker lê a página da SEFAZ; aqui a pessoa revisa os itens, diz qual
// produto do armário é cada um (o app aprende por mercado) e guarda tudo de uma vez.

import { fetchNota, checkDigitOk } from '../lookup.js';
import { listProducts, newProductId, addStock, nfceMap, learnNfce, notaImported, markNota, setLastPrice } from '../store.js';
import { guessArea } from '../areas.js';
import { $, esc, icon, openSheet, stepper, plural, thumb, skeletonRows, vibrate, pill } from '../ui.js';
import { showReceipt } from './receipt.js';

// Vendido por peso ou volume: conta como 1 pacote e começa de fora (fruta, pão).
const WEIGHT = new Set(['KG', 'G', 'GR', 'L', 'LT', 'ML']);
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !/^\d/.test(t));

// "LEITE COND MOCA 395G" → "Leite Cond Moca 395g"
export function prettyName(s) {
  return String(s || '').toLowerCase()
    .replace(/(^|[\s/(-])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(\d+(?:[.,]\d+)?)\s?(Kg|G|Gr|Ml|L|Lt|Un)\b/g, (_, n, u) => `${n}${u.toLowerCase()}`)
    .replace(/\s+/g, ' ')
    .trim()
    // Sobras de unidade no fim do nome da nota: "Banana Prata Kg", "Alface Emb Un"
    .replace(/(\s+(kg|un|emb|und|pct|pc))+$/i, '');
}

export function sizeFromName(s) {
  const m = /(\d+(?:[.,]\d+)?)\s?(kg|g|gr|ml|l|lt)\b/i.exec(s || '');
  return m ? `${m[1]} ${m[2].toLowerCase().replace('gr', 'g').replace('lt', 'l')}` : '';
}

// Quanto do nome da nota aparece no nome do produto. As notas abreviam
// ("COND" de condensado), então vale o começo de palavra.
export function matchScore(noteName, productName) {
  const a = tokens(noteName);
  const b = tokens(productName);
  if (!a.length || !b.length) return 0;
  let hit = 0;
  for (const t of a) if (b.some((u) => u.startsWith(t) || t.startsWith(u))) hit += 1;
  return hit / Math.max(a.length, 2);
}

const GENERIC = new Set(['companhia', 'cia', 'comercial', 'comercio', 'supermercado', 'supermercados', 'mercado', 'distribuidora', 'atacado', 'atacadista', 'ind', 'industria', 'ltda', 'sa', 's/a', 'de', 'do', 'da', 'e', 'lojas', 'rede']);
export function storeName(razao) {
  const words = String(razao || '').split(/\s+/).filter(Boolean);
  const first = words.find((w) => !GENERIC.has(w.toLowerCase())) || words[0] || 'Mercado';
  return prettyName(first);
}

/** Abre a importação. Resolve true quando algo entrou no armário. */
export async function importNota(p) {
  const result = await openSheet({
    mode: 'entrada',
    title: 'Nota fiscal',
    label: 'Nota fiscal',
    className: 'sheet-tall',
    render(body, close) { load(body, close, p); },
  });
  if (!result) return false;
  await showReceipt(result);
  return true;
}

function loadingHtml() {
  return `
    <div class="nota-head" aria-busy="true">
      <span class="skel skel-line" style="width:46%;height:22px" aria-hidden="true"></span>
      <span class="skel skel-line skel-short" aria-hidden="true"></span>
    </div>
    <p class="loading-note" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span data-note>Buscando a nota na SEFAZ</span></p>
    ${skeletonRows(5, 'nota-items')}`;
}

async function load(body, close, p) {
  body.innerHTML = loadingHtml();
  const note = $('[data-note]', body);
  const slow = setTimeout(() => { if (note.isConnected) note.textContent = 'A SEFAZ está demorando. Mais um instante'; }, 5000);
  let data;
  try {
    data = await fetchNota(p);
  } catch (err) {
    if (!body.isConnected) return;
    body.innerHTML = `
      <div class="empty-state nota-error">
        <p class="empty-lead">Não deu para ler a nota</p>
        <p>${esc(err.message)}</p>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn btn-primary" data-retry>${icon('undo')}Tentar de novo</button>
      </div>`;
    $('[data-retry]', body).addEventListener('click', () => load(body, close, p));
    return;
  } finally {
    clearTimeout(slow);
  }
  if (!body.isConnected) return;
  const [map, products, already] = await Promise.all([nfceMap(), listProducts(), notaImported(data.key)]);
  review(body, close, data, prepare(data, map, products), products, already);
}

// Uma linha por código da nota (o mesmo item em duas linhas soma).
function prepare(data, map, products) {
  const byCode = new Map(products.map((x) => [x.code, x]));
  const rows = [];
  const seen = new Map();
  for (const it of data.items) {
    const weight = WEIGHT.has(it.unit);
    const qty = weight ? 1 : Math.max(1, Math.round(it.qty));
    if (it.code && seen.has(it.code) && !weight) {
      const r = seen.get(it.code);
      r.qty += qty;
      r.total += it.total;
      continue;
    }
    const ean = /^(\d{8}|\d{12,14})$/.test(it.code) && checkDigitOk(it.code) ? it.code : '';
    let product = null;
    const learned = map[`${data.store.cnpj}:${it.code}`];
    if (learned && byCode.has(learned)) product = byCode.get(learned);
    if (!product && ean) product = products.find((x) => (x.barcodes || []).includes(ean)) || null;
    const guesses = product ? [] : products
      .map((x) => [x, matchScore(it.name, x.name)])
      .filter(([, sc]) => sc >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([x]) => x);
    const r = { it, qty, total: it.total, ean, product, guesses, name: prettyName(it.name), on: !weight || !!product, weight };
    rows.push(r);
    if (it.code) seen.set(it.code, r);
  }
  return rows;
}

function review(body, close, data, rows, products, already) {
  const store = storeName(data.store.name);
  const when = data.issuedAt ? dayFmt.format(new Date(data.issuedAt)) : '';
  let open = -1;

  const sub = (r) => {
    if (!r.on) return r.weight ? 'Vendido por peso, fica de fora' : 'Fica de fora';
    if (r.product) return `Já no armário, tem ${r.product.qty}`;
    return 'Produto novo';
  };

  body.innerHTML = `
    <div class="nota-head">
      <p class="nota-store">${esc(store)}</p>
      <p class="nota-meta">${esc([when, plural(data.items.length, 'item', 'itens'), money.format(data.total)].filter(Boolean).join(', '))}</p>
    </div>
    ${already ? `<p class="nota-warn">${icon('receipt')}<span>Esta nota já entrou no armário em ${esc(dayFmt.format(new Date(already.at)))}. Guardar de novo soma outra vez.</span></p>` : ''}
    <p class="field-note">Toque num item para trocar o nome, dizer qual produto do armário é ou mudar a quantidade. Da próxima vez, os itens deste mercado já vêm certos.</p>
    <ul class="nota-items">${rows.map((r, i) => `<li class="nota-item" data-i="${i}"></li>`).join('')}</ul>
    <div class="sheet-footer"><button type="button" class="btn btn-mode btn-lg" data-save></button></div>`;

  const list = $('.nota-items', body);
  const saveBtn = $('[data-save]', body);

  function paint(i) {
    const r = rows[i];
    const li = list.children[i];
    const isOpen = open === i;
    // Abrindo agora: desenha fechado e abre no quadro seguinte, para a linha
    // expandir com mola em vez de aparecer de uma vez.
    const opening = isOpen && !li.classList.contains('is-open');
    li.className = `nota-item${r.on ? '' : ' is-off'}${isOpen && !opening ? ' is-open' : ''}`;
    if (opening) requestAnimationFrame(() => requestAnimationFrame(() => li.classList.add('is-open')));
    const title = r.product ? r.product.name : r.name;
    li.innerHTML = `
      <div class="nota-line">
        <input type="checkbox" class="check" data-on ${r.on ? 'checked' : ''} aria-label="Guardar ${esc(title)}">
        <button type="button" class="nota-main" data-open aria-expanded="${isOpen}">
          <span class="row-main">
            <span class="row-name">${esc(title)}</span>
            <span class="row-meta">${r.on && !r.product ? pill('new', 'Novo') : ''}<span class="row-sub">${esc(r.on && !r.product ? '' : sub(r))}</span></span>
          </span>
          <span class="nota-qty">${r.on ? `+${r.qty}` : ''}</span>
          ${icon('chevron', 'nota-chev')}
        </button>
      </div>
      <div class="nota-edit" ${isOpen ? '' : 'inert'}>
        <div class="nota-edit-in">
          <p class="nota-src">Na nota: ${esc(r.it.name)}, ${esc(money.format(r.total))}</p>
          ${r.product ? `
            <div class="nota-link">
              ${thumb(r.product)}
              <span class="row-main"><span class="row-sub">Vai para</span><span class="row-name">${esc(r.product.name)}</span></span>
              <button type="button" class="btn btn-quiet btn-sm" data-unlink>Trocar</button>
            </div>` : `
            <label class="field"><span class="field-label">Nome no armário</span>
              <input class="input" data-name maxlength="80" value="${esc(r.name)}" autocomplete="off"></label>
            ${r.guesses.length ? `<div class="field"><span class="field-label">Ou é um destes?</span>
              <div class="nota-guesses">${r.guesses.map((x) => `<button type="button" class="chip" data-pick="${esc(x.code)}">${esc(x.name)}</button>`).join('')}</div></div>` : ''}
            <label class="field"><span class="field-label">Procurar no armário</span>
              <input class="input" data-q type="search" maxlength="40" autocomplete="off" placeholder="Ex.: sabonete"></label>
            <div class="nota-guesses" data-found></div>`}
          <div class="field"><span class="field-label">Quantidade</span><div class="stepper-host stepper-sm" data-qty></div></div>
        </div>
      </div>`;
    if (isOpen) {
      stepper($('[data-qty]', li), {
        value: r.qty, min: 1, max: 99, label: 'Quantidade',
        onChange: (n) => { r.qty = n; const q = $('.nota-qty', li); if (q && r.on) q.textContent = `+${n}`; updateSave(); },
      });
    }
  }

  function updateSave() {
    const on = rows.filter((r) => r.on);
    saveBtn.innerHTML = on.length ? `${icon('in')}Guardar ${plural(on.length, 'item', 'itens')}` : 'Marque um item para guardar';
    saveBtn.disabled = !on.length;
  }

  // Fechar: só recolhe (a animação de fechar usa o mesmo conteúdo).
  function collapse(i) {
    const li = list.children[i];
    li.classList.remove('is-open');
    $('.nota-edit', li).inert = true;
    $('[data-open]', li).setAttribute('aria-expanded', 'false');
  }

  function toggleOpen(i) {
    const prev = open;
    open = open === i ? -1 : i;
    if (prev >= 0) collapse(prev);
    if (open === i) {
      paint(i);
      setTimeout(() => list.children[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 260);
    }
  }

  rows.forEach((_, i) => paint(i));
  updateSave();

  list.addEventListener('change', (e) => {
    const li = e.target.closest('.nota-item');
    if (!li || !e.target.matches('[data-on]')) return;
    const i = Number(li.dataset.i);
    rows[i].on = e.target.checked;
    vibrate(6);
    paint(i);
    $('[data-on]', list.children[i]).focus();
    updateSave();
  });
  list.addEventListener('input', (e) => {
    const li = e.target.closest('.nota-item');
    if (!li) return;
    const r = rows[Number(li.dataset.i)];
    if (e.target.matches('[data-name]')) {
      r.name = e.target.value;
      $('.row-name', li).textContent = r.name || 'Produto novo';
    }
    if (e.target.matches('[data-q]')) {
      const q = norm(e.target.value.trim());
      const found = q.length < 2 ? [] : products.filter((x) => norm(`${x.name} ${x.brand}`).includes(q)).slice(0, 5);
      $('[data-found]', li).innerHTML = found.map((x) => `<button type="button" class="chip" data-pick="${esc(x.code)}">${esc(x.name)}</button>`).join('')
        || (q.length >= 2 ? '<p class="field-note">Nada no armário com esse nome.</p>' : '');
    }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.nota-item');
    if (!li) return;
    const i = Number(li.dataset.i);
    const r = rows[i];
    if (e.target.closest('[data-open]')) { toggleOpen(i); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      r.product = products.find((x) => x.code === pick.dataset.pick) || null;
      r.on = true;
      vibrate(8);
      paint(i);
      updateSave();
      return;
    }
    if (e.target.closest('[data-unlink]')) {
      r.product = null;
      paint(i);
      const q = $('[data-q]', li);
      if (q) q.focus();
    }
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.setAttribute('aria-busy', 'true');
    try {
      const chosen = rows.filter((r) => r.on);
      const lines = [];
      const learn = [];
      const at = data.issuedAt ? Date.parse(data.issuedAt) : Date.now();
      let n = 0;
      for (const [k, r] of chosen.entries()) {
        let code;
        if (r.product) {
          code = r.product.code;
          await addStock(code, r.qty);
        } else {
          const name = r.name.trim() || prettyName(r.it.name);
          code = r.ean ? await newProductId(r.ean) : `SEM-${Date.now().toString(36)}${k}`;
          await addStock(code, r.qty, { name, size: sizeFromName(r.it.name), area: guessArea({ name }), barcodes: r.ean ? [r.ean] : [], source: 'nota' });
        }
        if (r.it.code) learn.push([`${data.store.cnpj}:${r.it.code}`, code]);
        await setLastPrice(code, { value: r.it.unitPrice, unit: r.it.unit, store, at });
        lines.push({ name: r.product ? r.product.name : (r.name.trim() || prettyName(r.it.name)), value: `+${r.qty}`, sub: money.format(r.total) });
        n += r.qty;
      }
      await learnNfce(learn);
      await markNota(data.key, { store, total: data.total, items: chosen.length });
      close({
        mode: 'entrada',
        lines,
        total: { label: plural(lines.length, 'produto', 'produtos'), value: `+${n}` },
        note: `${store}, ${money.format(data.total)}`,
      });
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.removeAttribute('aria-busy');
      body.insertAdjacentHTML('beforeend', `<p class="field-error" role="alert">${esc(err.message)}</p>`);
    }
  });
}

// Folha de entrada: explica onde fica o QR Code e aceita colar o link.
export function notaEntrySheet({ camera = false } = {}) {
  return openSheet({
    title: 'Nota fiscal',
    label: 'Importar nota fiscal',
    render(body, close) {
      body.innerHTML = `
        <p class="sheet-text">Aponte a câmera para o QR Code no fim do cupom do mercado. Todos os itens da compra entram de uma vez.</p>
        <form class="stack" novalidate>
          <label class="field"><span class="field-label">Ou cole o link da nota</span>
            <input class="input" name="link" inputmode="url" autocomplete="off" placeholder="https://dfe-portal.svrs.rs.gov.br/..." aria-describedby="nota-link-error"></label>
          <p class="field-error" id="nota-link-error" hidden></p>
          <button type="submit" class="btn btn-primary">${icon('receipt')}Ler a nota</button>
          ${camera ? `<a class="btn btn-quiet" href="#/entrada" data-camera>${icon('camera')}Abrir a câmera</a>` : ''}
        </form>`;
      const input = $('input', body);
      const error = $('.field-error', body);
      $('form', body).addEventListener('submit', async (e) => {
        e.preventDefault();
        const { notaParam } = await import('../lookup.js');
        const p = notaParam(input.value);
        if (!p) {
          error.textContent = 'Cole o link que o QR Code do cupom abre. Ele começa com https e tem "p=" seguido de 44 números.';
          error.hidden = false;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        close(p);
      });
    },
  });
}
