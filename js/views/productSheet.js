// A folha de produto: a mesma para entrada, saída e contagem.
// Muda só o título, os limites do seletor e o botão principal.
//
// Um código de barras normalmente aponta para um produto, mas pode apontar para
// vários (fabricante que reusa o código entre sabores, embalagem sem código
// próprio etiquetada com o mesmo número). Nesse caso a folha primeiro pergunta
// qual deles está na mão, e sempre deixa cadastrar mais um com o mesmo código.

import { lookup, lookupRemote, searchStores } from '../lookup.js';
import { addStock, removeStock, ensureProduct, setCounted, getCountDraft, getProduct, newProductId, productsByBarcode } from '../store.js';
import { beep } from '../sound.js';
import { $, $$, esc, openSheet, stepper, subtitle, thumb, tag, tagState, plural, stockNote } from '../ui.js';

const ACTION = {
  entrada: (n) => `Adicionar ${n}`,
  saida: (n) => `Dar baixa em ${n}`,
  contagem: () => 'Salvar contagem',
};

const NEW_MSG = {
  found: 'Novo no armário. Confira o nome antes de salvar.',
  notfound: 'Não encontramos esse código. Digite o nome e escolha o produto nas sugestões.',
  offline: 'Sem internet para buscar esse código. Digite o nome do produto para cadastrar.',
  nocode: 'Digite o nome e escolha o produto nas sugestões. Se ele tiver código de barras, o app passa a reconhecê-lo.',
  other: 'Outro produto com o mesmo código de barras. Dê um nome que diferencie os dois, por exemplo o sabor.',
};

/**
 * Abre a folha a partir de um código lido (`barcode`) ou de um produto já
 * conhecido (`productId`, ex.: toque numa linha da contagem).
 * Resolve com:
 *   { kind: 'entrada' | 'saida', product, movement, n }
 *   { kind: 'contagem', product, n }
 *   { kind: 'switch', code }   (saída de produto não cadastrado → cadastrar como entrada)
 *   null                       (fechou sem registrar)
 */
export function showProductSheet({ mode, barcode, productId }) {
  return openSheet({
    mode,
    label: 'Produto lido',
    render(body, close) {
      const ctx = { body, close, mode, barcode };
      loading(ctx, barcode || '');
      start(ctx, productId).catch((err) => {
        body.insertAdjacentHTML('beforeend', `<p class="field-error">${esc(err.message)}</p>`);
      });
    },
  });
}

async function start(ctx, productId) {
  if (productId) {
    const p = await getProduct(productId);
    if (!ctx.body.isConnected) return;
    return p ? productForm(ctx, p, { fromList: true }) : ctx.close(null);
  }
  const result = await lookup(ctx.barcode);
  if (!ctx.body.isConnected) return;

  if (result.status === 'local') {
    if (result.products.length === 1) return productForm(ctx, result.products[0], {});
    return chooser(ctx, result.products);
  }
  if (ctx.mode === 'saida') return notInCupboard(ctx);
  return newForm(ctx, ctx.barcode.startsWith('SEM-') ? { status: 'nocode' } : result);
}

function loading({ body }, code) {
  body.innerHTML = `
    <div class="product-head is-loading">
      ${thumb(null, 'md')}
      <div class="product-meta">
        <p class="product-name">Buscando produto</p>
        <p class="product-code">${esc(code.startsWith('SEM-') ? 'Produto sem código' : code)}</p>
      </div>
    </div>`;
}

// ---------- Vários produtos no mesmo código ----------

function chooser(ctx, products) {
  const { body, mode, barcode } = ctx;
  const sorted = products.slice().sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'pt-BR'));
  body.innerHTML = `
    <h2 class="sheet-title">Qual destes?</h2>
    <p class="sheet-text">O código ${esc(barcode)} está em ${plural(products.length, 'produto', 'produtos')} do armário.</p>
    <ul class="pick">
      ${sorted.map((p) => {
        const empty = mode === 'saida' && p.qty === 0;
        return `
        <li>
          <button type="button" class="pick-row" data-id="${esc(p.code)}" ${empty ? 'aria-disabled="true"' : ''}>
            ${thumb(p)}
            <span class="row-main">
              <span class="row-name">${esc(p.name)}</span>
              <span class="row-sub">${empty ? 'Nenhum no armário' : [stockNote(p) && `<strong class="stock-note">${stockNote(p)}</strong>`, subtitle(p)].filter(Boolean).join(', ') || '&nbsp;'}</span>
            </span>
            ${tag(p.qty, tagState(p))}
          </button>
        </li>`;
      }).join('')}
    </ul>
    ${mode === 'saida' ? '' : '<button type="button" class="btn btn-quiet" data-other>Cadastrar outro produto com este código</button>'}`;

  $$('.pick-row', body).forEach((btn) => btn.addEventListener('click', () => {
    const p = products.find((x) => x.code === btn.dataset.id);
    if (btn.getAttribute('aria-disabled') === 'true') {
      beep('error');
      btn.querySelector('.row-sub').textContent = 'Nenhum no armário. Escolha outro.';
      return;
    }
    productForm(ctx, p, { fromChooser: true });
  }));
  const other = $('[data-other]', body);
  if (other) other.addEventListener('click', () => newForm(ctx, { status: 'other' }));
}

// ---------- Saída de algo que não está no armário ----------

function notInCupboard({ body, close, barcode }) {
  beep('error');
  body.innerHTML = `
    ${head({ name: 'Produto desconhecido', code: barcode }, null)}
    <p class="sheet-text">Esse produto não está no armário. Se ele acabou de chegar, cadastre como entrada.</p>
    <div class="sheet-actions">
      <button type="button" class="btn btn-entrada" data-switch>Cadastrar como entrada</button>
      <button type="button" class="btn btn-quiet" data-cancel>Fechar</button>
    </div>`;
  $('[data-switch]', body).addEventListener('click', () => close({ kind: 'switch', code: barcode }));
  $('[data-cancel]', body).addEventListener('click', () => close(null));
}

// ---------- Produto já cadastrado ----------

async function productForm(ctx, local, { fromList = false, fromChooser = false }) {
  const { body, close, mode } = ctx;

  if (mode === 'saida' && local.qty === 0) {
    beep('error');
    body.innerHTML = `
      ${head(local, local)}
      <p class="sheet-text">Não tem nenhum no armário. Se ainda tem, corrija a quantidade pela contagem ou na página do produto.</p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-primary" data-cancel>Fechar</button>
      </div>`;
    $('[data-cancel]', body).addEventListener('click', () => close(null));
    return;
  }

  const draft = mode === 'contagem' ? await getCountDraft() : null;
  const counted = draft && Object.hasOwn(draft.counts, local.code) ? draft.counts[local.code] : null;
  const limits = {
    entrada: { min: 1, max: 999, value: 1 },
    saida: { min: 1, max: local.qty, value: 1 },
    contagem: { min: 0, max: 999, value: counted ?? local.qty },
  }[mode];

  // "Não é este?" só faz sentido quando o produto veio de uma leitura com um só resultado.
  const canAddOther = !fromList && !fromChooser && mode !== 'saida' && ctx.barcode && !ctx.barcode.startsWith('SEM-');

  body.innerHTML = `
    <form class="stack" novalidate>
      ${head(local, local)}
      ${mode === 'contagem' ? '<p class="stepper-label">Quantos tem?</p>' : ''}
      <div class="stepper-host"></div>
      <button type="submit" class="btn btn-mode btn-lg"></button>
      ${canAddOther ? '<button type="button" class="btn btn-quiet" data-other>Não é este? Cadastrar outro produto com este código</button>' : ''}
    </form>`;

  const submit = $('[type=submit]', body);
  const step = stepper($('.stepper-host', body), {
    ...limits,
    label: mode === 'contagem' ? 'Quantos tem' : 'Quantidade',
    onChange: (n) => { submit.textContent = ACTION[mode](n); },
  });
  const other = $('[data-other]', body);
  if (other) other.addEventListener('click', () => newForm(ctx, { status: 'other' }));

  onSubmit(ctx, step, async (n) => {
    if (mode === 'entrada') return { kind: 'entrada', ...(await addStock(local.code, n)), n };
    if (mode === 'saida') return { kind: 'saida', ...(await removeStock(local.code, n)), n };
    await setCounted(local.code, n);
    return { kind: 'contagem', product: local, n };
  });
}

// ---------- Produto novo ----------
// O campo "Nome do produto" também busca nas lojas enquanto a pessoa digita:
// tocar numa sugestão preenche nome, marca, tamanho e foto.

async function newForm(ctx, result) {
  const { body, mode } = ctx;
  let barcode = ctx.barcode;
  let info = result.info || {};
  const limits = {
    entrada: { min: 1, max: 999, value: 1 },
    contagem: { min: 0, max: 999, value: 1 },
  }[mode];

  body.innerHTML = `
    <form class="stack" novalidate>
      <div data-head>${head({ ...info, name: info.name || 'Produto novo', code: barcode }, null)}</div>
      <p class="sheet-text" data-msg>${esc(NEW_MSG[result.status] || NEW_MSG.notfound)}</p>
      ${result.status === 'offline' ? '<button type="button" class="btn btn-quiet btn-sm" data-retry>Buscar de novo</button>' : ''}
      <div class="field">
        <label class="field-label" for="new-name">Nome do produto</label>
        <input class="input" id="new-name" name="name" type="search" enterkeyhint="done" autocomplete="off" maxlength="80"
          value="${esc(info.name || '')}" placeholder="Ex.: feijão camil" aria-describedby="new-name-error new-name-status">
        <p class="field-error" id="new-name-error" hidden></p>
        <p class="suggest-status" id="new-name-status" aria-live="polite"></p>
        <ul class="pick suggest" hidden></ul>
      </div>
      ${mode === 'contagem' ? '<p class="stepper-label">Quantos tem?</p>' : ''}
      <div class="stepper-host"></div>
      <button type="submit" class="btn btn-mode btn-lg"></button>
    </form>`;

  const submit = $('[type=submit]', body);
  const nameInput = $('input[name=name]', body);
  const nameError = $('#new-name-error', body);
  const status = $('#new-name-status', body);
  const list = $('.suggest', body);
  const headHost = $('[data-head]', body);
  const step = stepper($('.stepper-host', body), {
    ...limits,
    label: mode === 'contagem' ? 'Quantos tem' : 'Quantidade',
    onChange: (n) => { submit.textContent = ACTION[mode](n); },
  });

  let suggestions = [];
  let timer = 0;
  let ctrl = null;

  function showSuggestions(items, query) {
    suggestions = items;
    list.hidden = !items.length;
    list.innerHTML = items.map((p, i) => `
      <li>
        <button type="button" class="pick-row suggest-row" data-i="${i}">
          ${thumb(p)}
          <span class="row-main">
            <span class="row-name">${esc(p.name)}</span>
            <span class="row-sub">${subtitle(p) || '&nbsp;'}</span>
          </span>
        </button>
      </li>`).join('');
    status.textContent = items.length
      ? `${plural(items.length, 'sugestão', 'sugestões')} das lojas. Toque na certa ou continue digitando.`
      : `Nada encontrado para “${query}”. Pode salvar só com o nome.`;
  }

  async function runSearch(query) {
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    status.textContent = 'Procurando nas lojas';
    try {
      const items = await searchStores(query, ctrl.signal);
      if (body.isConnected && nameInput.value.trim() === query) showSuggestions(items, query);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (body.isConnected) { list.hidden = true; status.textContent = 'Sem conexão com as lojas agora. Pode salvar só com o nome.'; }
    }
  }

  nameInput.addEventListener('input', () => {
    const q = nameInput.value.trim();
    if (q) { nameInput.removeAttribute('aria-invalid'); nameError.hidden = true; }
    clearTimeout(timer);
    if (q.length < 3) { if (ctrl) ctrl.abort(); list.hidden = true; status.textContent = ''; return; }
    timer = setTimeout(() => runSearch(q), 350);
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-i]');
    if (!btn) return;
    const p = suggestions[Number(btn.dataset.i)];
    if (!p) return;
    // Produto sem código: a sugestão traz o código de barras de verdade.
    if (barcode.startsWith('SEM-') && p.ean) {
      const existing = await productsByBarcode(p.ean);
      if (existing.length) {
        ctx.barcode = p.ean;
        return existing.length === 1 ? productForm(ctx, existing[0], {}) : chooser(ctx, existing);
      }
      barcode = p.ean;
    }
    info = { ...p };
    result = { status: 'found', info };
    nameInput.value = p.name;
    list.hidden = true;
    status.textContent = '';
    headHost.innerHTML = head({ ...p, code: barcode }, null);
    $('[data-msg]', body).textContent = 'Confira o nome antes de salvar.';
    submit.focus({ preventScroll: true });
  });

  if (!nameInput.value) setTimeout(() => nameInput.focus(), 250);

  const retry = $('[data-retry]', body);
  if (retry) {
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      retry.textContent = 'Buscando';
      const again = await lookupRemote(barcode);
      if (body.isConnected) newForm(ctx, again);
    });
  }

  onSubmit(ctx, step, async (n) => {
    if (!nameInput.value.trim()) {
      nameInput.setAttribute('aria-invalid', 'true');
      nameError.textContent = 'Digite o nome do produto para cadastrar.';
      nameError.hidden = false;
      nameInput.focus();
      return undefined;
    }
    const id = barcode.startsWith('SEM-') ? barcode : await newProductId(barcode);
    const { ean, ...rest } = info;
    const newInfo = {
      ...(result.status === 'other' ? {} : rest),
      name: nameInput.value.trim(),
      barcodes: barcode.startsWith('SEM-') ? [] : [barcode],
      source: result.status === 'found' ? (info.source || 'off') : 'manual',
    };
    if (mode === 'entrada') return { kind: 'entrada', ...(await addStock(id, n, newInfo)), n };
    const product = await ensureProduct(id, newInfo);
    await setCounted(id, n);
    return { kind: 'contagem', product, n };
  });
}

// ---------- Partes comuns ----------

function onSubmit({ body, close }, step, action) {
  const form = $('form', body);
  const submit = $('[type=submit]', body);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const result = await action(step.value);
      if (result === undefined) { submit.disabled = false; return; }
      close(result);
    } catch (err) {
      submit.disabled = false;
      form.insertAdjacentHTML('beforeend', `<p class="field-error">${esc(err.message)}</p>`);
    }
  });
}

function head(p, local) {
  const sub = subtitle(p);
  const code = p.code && !p.code.startsWith('SEM-') ? p.code.split('~')[0] : 'Produto sem código';
  return `
    <div class="product-head">
      ${thumb(p, 'md')}
      <div class="product-meta">
        <p class="product-name">${esc(p.name || 'Produto novo')}</p>
        ${sub ? `<p class="product-sub">${sub}</p>` : ''}
        <p class="product-code">${esc(code)}</p>
      </div>
      ${local ? `<div class="product-stock"><span class="product-stock-label">No armário</span>${tag(local.qty, tagState(local), '')}</div>` : ''}
    </div>`;
}
