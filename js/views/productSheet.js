// A folha de produto: a mesma para entrada, saída e contagem.
// Muda só o título, os limites do seletor e o botão principal.
//
// Um código de barras normalmente aponta para um produto, mas pode apontar para
// vários (fabricante que reusa o código entre sabores, embalagem sem código
// próprio etiquetada com o mesmo número). Nesse caso a folha primeiro pergunta
// qual deles está na mão, e sempre deixa cadastrar mais um com o mesmo código.

import { lookup, lookupRemote, searchStores, identifyPhoto } from '../lookup.js';
import { addStock, removeStock, ensureProduct, setCounted, getCountDraft, getProduct, newProductId, productsByBarcode, listProducts } from '../store.js';
import { AREAS, guessArea } from '../areas.js';
import { parseExpiry, maskExpiry, formatDate, daysUntil } from '../dates.js';
import { photoToDataUrl } from '../photo.js';
import { beep } from '../sound.js';
import { $, $$, esc, icon, openSheet, stepper, subtitle, thumb, tag, tagState, plural, stockNote } from '../ui.js';

const ACTION = {
  entrada: (n) => `Adicionar ${n}`,
  saida: (n) => `Dar baixa em ${n}`,
  contagem: () => 'Salvar contagem',
};
const ACTION_ICON = { entrada: 'in', saida: 'out', contagem: 'count' };
const actionLabel = (mode, n) => `${icon(ACTION_ICON[mode])}${ACTION[mode](n)}`;

const NEW_MSG = {
  found: 'Novo no armário. Confira o nome antes de salvar.',
  notfound: 'Não encontramos esse código. Digite o nome e escolha o produto nas sugestões.',
  offline: 'Sem internet para buscar esse código. Digite o nome do produto para cadastrar.',
  nocode: 'Digite o nome ou tire uma foto da embalagem e escolha o produto nas sugestões.',
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
 * `qty` sugere a quantidade inicial (ex.: um código lido 3 vezes no modo rápido).
 */
export function showProductSheet({ mode, barcode, productId, qty = 1 }) {
  return openSheet({
    mode,
    label: barcode && barcode.startsWith('SEM-') ? 'Buscar pelo nome' : 'Produto lido',
    render(body, close) {
      const ctx = { body, close, mode, barcode, qty };
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
  if (ctx.barcode.startsWith('SEM-') && ctx.mode === 'saida') return searchLocal(ctx);
  const result = await lookup(ctx.barcode);
  if (!ctx.body.isConnected) return;

  if (result.status === 'local') {
    if (result.products.length === 1) return productForm(ctx, result.products[0], {});
    return chooser(ctx, result.products);
  }
  if (ctx.mode === 'saida') return notInCupboard(ctx);
  return newForm(ctx, ctx.barcode.startsWith('SEM-') ? { status: 'nocode' } : result);
}

// ---------- Saída sem código: procura no armário pelo nome ----------

async function searchLocal(ctx) {
  const { body } = ctx;
  const products = (await listProducts()).filter((p) => p.qty > 0);
  if (!body.isConnected) return;
  body.innerHTML = `
    <h2 class="sheet-title">O que está tirando?</h2>
    <div class="field">
      <label class="field-label" for="local-q">Nome do produto</label>
      <input class="input" id="local-q" type="search" enterkeyhint="search" autocomplete="off" maxlength="60" placeholder="Ex.: leite" aria-describedby="local-status">
      <p class="suggest-status" id="local-status" aria-live="polite"></p>
    </div>
    <ul class="pick suggest"></ul>`;
  const input = $('input', body);
  const list = $('.suggest', body);
  const status = $('#local-status', body);
  const render = () => {
    const found = matchLocal(products, input.value).slice(0, 8);
    list.innerHTML = found.map((p) => localRow(p)).join('');
    list.hidden = !found.length;
    status.textContent = input.value.trim() && !found.length ? `Nada no armário com “${input.value.trim()}”.` : '';
  };
  input.addEventListener('input', render);
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-local]');
    if (btn) productForm(ctx, products.find((p) => p.code === btn.dataset.local), { fromList: true });
  });
  render();
  setTimeout(() => input.focus(), 250);
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Produtos do armário que têm todas as palavras digitadas.
function matchLocal(products, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return products.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  return products.filter((p) => {
    const text = fold(`${p.name} ${p.brand}`);
    return words.every((w) => text.includes(w));
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function localRow(p) {
  return `
    <li>
      <button type="button" class="pick-row suggest-row" data-local="${esc(p.code)}">
        ${thumb(p)}
        <span class="row-main">
          <span class="row-name">${esc(p.name)}</span>
          <span class="row-sub"><strong class="stock-note">No armário: ${p.qty}</strong>${subtitle(p) ? `, ${subtitle(p)}` : ''}</span>
        </span>
      </button>
    </li>`;
}

// ---------- Validade (só na entrada) ----------
// Escondida atrás de um botão: a maioria das leituras não precisa dela.

function expiryHtml() {
  return `
    <div class="expiry">
      <button type="button" class="btn btn-link btn-expiry" data-expiry-open aria-expanded="false" aria-controls="exp-field">${icon('calendar')}Adicionar validade</button>
      <div class="field" id="exp-field" hidden>
        <label class="field-label" for="exp-input">Validade</label>
        <input class="input input-date" id="exp-input" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/AA ou MM/AA" aria-describedby="exp-note">
        <p class="field-note" id="exp-note" aria-live="polite">Como está na embalagem. Só mês e ano vale até o fim do mês.</p>
      </div>
    </div>`;
}

// Liga o campo. get() devolve AAAA-MM-DD, '' (vazio) ou null (inválido, já avisado).
function bindExpiry(body) {
  const open = $('[data-expiry-open]', body);
  if (!open) return { get: () => '' };
  const field = $('#exp-field', body);
  const input = $('#exp-input', body);
  const note = $('#exp-note', body);
  const HELP = note.textContent;
  open.addEventListener('click', () => {
    open.hidden = true;
    open.setAttribute('aria-expanded', 'true');
    field.hidden = false;
    input.focus();
  });
  input.addEventListener('input', () => {
    input.value = maskExpiry(input.value);
    input.removeAttribute('aria-invalid');
    note.classList.remove('is-error');
    const iso = parseExpiry(input.value);
    if (!iso) { note.textContent = HELP; return; }
    const n = daysUntil(iso);
    note.textContent = n < 0
      ? `Essa data já passou (${formatDate(iso)}). Confira na embalagem.`
      : `Vence em ${formatDate(iso)}, ${n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `daqui a ${n} dias`}.`;
  });
  return {
    get() {
      if (field.hidden || !input.value.trim()) return '';
      const iso = parseExpiry(input.value);
      if (iso) return iso;
      input.setAttribute('aria-invalid', 'true');
      note.classList.add('is-error');
      note.textContent = 'Não entendi a data. Use dia/mês/ano (15/10/26) ou mês/ano (10/26).';
      input.focus();
      return null;
    },
  };
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
    ${mode === 'saida' ? '' : `<button type="button" class="btn btn-quiet" data-other>${icon('plus')}Cadastrar outro produto com este código</button>`}`;

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
      <button type="button" class="btn btn-entrada" data-switch>${icon('in')}Cadastrar como entrada</button>
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
    entrada: { min: 1, max: 999, value: ctx.qty || 1 },
    saida: { min: 1, max: local.qty, value: Math.min(ctx.qty || 1, local.qty) },
    contagem: { min: 0, max: 999, value: counted ?? local.qty },
  }[mode];

  // "Não é este?" só faz sentido quando o produto veio de uma leitura com um só resultado.
  const canAddOther = !fromList && !fromChooser && mode !== 'saida' && ctx.barcode && !ctx.barcode.startsWith('SEM-');

  body.innerHTML = `
    <form class="stack" novalidate>
      ${head(local, local)}
      ${mode === 'contagem' ? '<p class="stepper-label">Quantos tem?</p>' : ''}
      <div class="stepper-host"></div>
      ${mode === 'entrada' ? expiryHtml() : ''}
      <button type="submit" class="btn btn-mode btn-lg"></button>
      ${canAddOther ? '<button type="button" class="btn btn-quiet" data-other>Não é este? Cadastrar outro produto com este código</button>' : ''}
    </form>`;

  const submit = $('[type=submit]', body);
  const step = stepper($('.stepper-host', body), {
    ...limits,
    label: mode === 'contagem' ? 'Quantos tem' : 'Quantidade',
    onChange: (n) => { submit.innerHTML = actionLabel(mode, n); },
  });
  const other = $('[data-other]', body);
  if (other) other.addEventListener('click', () => newForm(ctx, { status: 'other' }));
  const expiry = bindExpiry(body);

  onSubmit(ctx, step, async (n) => {
    if (mode === 'entrada') {
      const expiresAt = expiry.get();
      if (expiresAt === null) return undefined;
      return { kind: 'entrada', ...(await addStock(local.code, n, undefined, expiresAt)), n };
    }
    if (mode === 'saida') return { kind: 'saida', ...(await removeStock(local.code, n)), n };
    await setCounted(local.code, n);
    return { kind: 'contagem', product: local, n };
  });
}

// ---------- Produto novo ----------
// O campo "Nome do produto" busca no armário e nas lojas enquanto a pessoa
// digita. Se nem assim achar, a foto da embalagem vai para a IA, que lê marca e
// produto e devolve sugestões das lojas. Tocar numa sugestão preenche tudo.

async function newForm(ctx, result) {
  const { body, mode } = ctx;
  let barcode = ctx.barcode;
  let info = result.info || {};
  const noCode = barcode.startsWith('SEM-');
  const limits = {
    entrada: { min: 1, max: 999, value: ctx.qty || 1 },
    contagem: { min: 0, max: 999, value: 1 },
  }[mode];
  let area = guessArea(info);
  let areaTouched = false;

  body.innerHTML = `
    <form class="stack" novalidate>
      <div data-head>${head({ ...info, name: info.name || (noCode ? 'Buscar pelo nome' : 'Produto novo'), code: barcode }, null)}</div>
      <p class="sheet-text" data-msg>${esc(NEW_MSG[result.status] || NEW_MSG.notfound)}</p>
      ${result.status === 'offline' ? '<button type="button" class="btn btn-quiet btn-sm" data-retry>Buscar de novo</button>' : ''}
      <div class="field">
        <label class="field-label" for="new-name">Nome do produto</label>
        <input class="input" id="new-name" name="name" type="search" enterkeyhint="done" autocomplete="off" maxlength="80"
          value="${esc(info.name || '')}" placeholder="Ex.: feijão camil" aria-describedby="new-name-error new-name-status">
        <p class="field-error" id="new-name-error" hidden></p>
        <p class="suggest-status" id="new-name-status" aria-live="polite"></p>
        <ul class="pick suggest" hidden></ul>
        ${result.status === 'found' ? '' : `
        <label class="btn btn-quiet file-btn" data-photo-btn>${icon('camera')}<span>Tirar foto da embalagem</span>
          <input type="file" accept="image/*" capture="environment" data-photo class="sr-only">
        </label>`}
      </div>
      <fieldset class="segmented">
        <legend class="field-label">Onde fica</legend>
        <div class="segmented-track">
          ${AREAS.map((a) => `
            <label class="segment"><input type="radio" name="area" value="${a.id}" ${a.id === area ? 'checked' : ''}><span>${a.short}</span></label>`).join('')}
        </div>
      </fieldset>
      ${mode === 'contagem' ? '<p class="stepper-label">Quantos tem?</p>' : ''}
      <div class="stepper-host"></div>
      ${mode === 'entrada' ? expiryHtml() : ''}
      <button type="submit" class="btn btn-mode btn-lg"></button>
    </form>`;

  const submit = $('[type=submit]', body);
  const nameInput = $('input[name=name]', body);
  const nameError = $('#new-name-error', body);
  const status = $('#new-name-status', body);
  const list = $('.suggest', body);
  const headHost = $('[data-head]', body);
  const photoInput = $('[data-photo]', body);
  const photoBtn = $('[data-photo-btn]', body);
  const step = stepper($('.stepper-host', body), {
    ...limits,
    label: mode === 'contagem' ? 'Quantos tem' : 'Quantidade',
    onChange: (n) => { submit.innerHTML = actionLabel(mode, n); },
  });
  const expiry = bindExpiry(body);

  function setArea(id, fromUser = false) {
    if (fromUser) areaTouched = true;
    else if (areaTouched) return;
    area = id;
    const radio = $(`input[name=area][value="${id}"]`, body);
    if (radio) radio.checked = true;
  }
  $('.segmented', body).addEventListener('change', (e) => {
    if (e.target.name === 'area') setArea(e.target.value, true);
  });

  // Sem código, o produto pode já estar no armário: ele aparece primeiro.
  let locals = [];
  if (noCode) listProducts().then((l) => { locals = l; });

  let suggestions = [];
  let timer = 0;
  let ctrl = null;

  function showSuggestions(items, query, from = 'lojas') {
    suggestions = items;
    const mine = noCode && query ? matchLocal(locals, query).slice(0, 3) : [];
    list.hidden = !items.length && !mine.length;
    list.innerHTML = mine.map((p) => localRow(p)).join('') + items.map((p, i) => `
      <li>
        <button type="button" class="pick-row suggest-row" data-i="${i}">
          ${thumb(p)}
          <span class="row-main">
            <span class="row-name">${esc(p.name)}</span>
            <span class="row-sub">${subtitle(p) || '&nbsp;'}</span>
          </span>
        </button>
      </li>`).join('');
    const n = items.length + mine.length;
    status.textContent = n
      ? `${plural(n, 'sugestão', 'sugestões')}${mine.length ? ', primeiro o que já está no armário' : ` ${from === 'foto' ? 'pela foto' : 'das lojas'}`}. Toque na certa ou continue digitando.`
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
      if (!body.isConnected) return;
      if (noCode && matchLocal(locals, query).length) { showSuggestions([], query); return; }
      list.hidden = true;
      status.textContent = 'Sem conexão com as lojas agora. Pode salvar só com o nome.';
    }
  }

  nameInput.addEventListener('input', () => {
    const q = nameInput.value.trim();
    if (q) { nameInput.removeAttribute('aria-invalid'); nameError.hidden = true; }
    setArea(guessArea({ ...info, name: q }));
    clearTimeout(timer);
    if (ctrl) ctrl.abort();
    // O que já está no armário aparece na hora; as lojas chegam depois.
    if (noCode && q.length >= 2 && matchLocal(locals, q).length) showSuggestions([], q);
    else list.hidden = true;
    if (q.length < 3) {
      if (list.hidden) status.textContent = '';
      return;
    }
    status.textContent = 'Procurando nas lojas';
    timer = setTimeout(() => runSearch(q), 350);
  });

  list.addEventListener('click', async (e) => {
    const localBtn = e.target.closest('[data-local]');
    if (localBtn) {
      const p = locals.find((x) => x.code === localBtn.dataset.local);
      if (p) productForm(ctx, p, { fromList: true });
      return;
    }
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
    setArea(guessArea(p));
    headHost.innerHTML = head({ ...p, code: barcode }, null);
    $('[data-msg]', body).textContent = 'Confira o nome antes de salvar.';
    if (photoBtn) photoBtn.hidden = true;
    submit.focus({ preventScroll: true });
  });

  // Foto da embalagem -> IA -> sugestões das lojas.
  if (photoInput) {
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files && photoInput.files[0];
      photoInput.value = '';
      if (!file) return;
      if (ctrl) ctrl.abort();
      clearTimeout(timer);
      photoBtn.classList.add('is-busy');
      photoBtn.setAttribute('aria-disabled', 'true');
      photoInput.disabled = true;
      $('span', photoBtn).textContent = 'Lendo a embalagem';
      status.textContent = 'Lendo a embalagem. Leva uns 5 segundos.';
      list.hidden = true;
      try {
        const read = await identifyPhoto(await photoToDataUrl(file));
        if (!body.isConnected) return;
        const guess = [read.brand, read.product, read.variant, read.size].filter(Boolean).join(' ');
        if (guess && !nameInput.value.trim()) nameInput.value = guess.charAt(0).toLocaleUpperCase('pt-BR') + guess.slice(1);
        setArea(guessArea({ name: `${read.product} ${read.variant}`, brand: read.brand }));
        if (read.results.length) showSuggestions(read.results, guess, 'foto');
        else status.textContent = guess ? `A foto parece ser “${guess}”, mas as lojas não têm. Confira o nome e salve.` : 'Não deu para ler a embalagem. Tente outra foto, mais de perto e com luz, ou digite o nome.';
      } catch {
        if (body.isConnected) status.textContent = 'Não deu para enviar a foto agora. Confira a internet ou digite o nome.';
      } finally {
        if (body.isConnected) {
          photoBtn.classList.remove('is-busy');
          photoBtn.removeAttribute('aria-disabled');
          photoInput.disabled = false;
          $('span', photoBtn).textContent = 'Tirar outra foto';
        }
      }
    });
  }

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
    const expiresAt = mode === 'entrada' ? expiry.get() : '';
    if (expiresAt === null) return undefined;
    const id = barcode.startsWith('SEM-') ? barcode : await newProductId(barcode);
    const { ean, ...rest } = info;
    const newInfo = {
      ...(result.status === 'other' ? {} : rest),
      name: nameInput.value.trim(),
      area,
      barcodes: barcode.startsWith('SEM-') ? [] : [barcode],
      source: result.status === 'found' ? (info.source || 'off') : 'manual',
    };
    if (mode === 'entrada') return { kind: 'entrada', ...(await addStock(id, n, newInfo, expiresAt)), n };
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
