// A folha de produto: a mesma para entrada, saída e contagem.
// Muda só o título, os limites do seletor e o botão principal.
//
// Um código de barras normalmente aponta para um produto, mas pode apontar para
// vários (fabricante que reusa o código entre sabores, embalagem sem código
// próprio etiquetada com o mesmo número). Nesse caso a folha primeiro pergunta
// qual deles está na mão, e sempre deixa cadastrar mais um com o mesmo código.

import { lookup, lookupRemote, searchStores, identifyPhoto, areaFromWeb } from '../lookup.js';
import { searchProducts, highlight } from '../search.js';
import { addStock, removeStock, ensureProduct, setCounted, getCountDraft, getProduct, newProductId, productsByBarcode, listProducts, addBarcode } from '../store.js';
import { AREAS, guessAreaInfo } from '../areas.js';
import { tel } from '../telemetry.js';
import { expiryRowHtml, bindExpiryRow } from './expiryLots.js';
import { photoToDataUrl, photoThumb, photoProduct } from '../photo.js';
import { beep } from '../sound.js';
import { $, $$, esc, icon, openSheet, stepper, subtitle, thumb, tag, tagState, plural, stockPill, skeletonRows, photoPickRow, revealSegment } from '../ui.js';

const ACTION = {
  entrada: (n) => `Guardar ${n}`,
  saida: (n) => `Tirar ${n}`,
  contagem: () => 'Salvar contagem',
};
const ACTION_ICON = { entrada: 'in', saida: 'out', contagem: 'count' };
const actionLabel = (mode, n) => `${icon(ACTION_ICON[mode])}${ACTION[mode](n)}`;

const NEW_MSG = {
  found: 'Novo no armário. Confira o nome antes de salvar.',
  med: 'Remédio da lista da Anvisa. Marque a validade que está na caixa.',
  notfound: 'Esse código não está nas lojas. Digite o nome e escolha o produto nas sugestões.',
  offline: 'Sem internet para buscar esse código. Digite o nome do produto para cadastrar.',
  nocode: 'Digite o nome e escolha o produto nas sugestões. Não sabe o nome? Fotografe a embalagem.',
  photo: 'Fotografe a frente da embalagem. A marca e o nome viram sugestões das lojas.',
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
    title: { entrada: 'Guardar', saida: 'Tirar', contagem: 'Contar' }[mode] || '',
    label: barcode && barcode.startsWith('SEM-') ? 'Produto sem código' : 'Produto lido',
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
  if (ctx.barcode.startsWith('SEM-')) return noCodeChoice(ctx);
  // Na saída só interessa o que já está no armário: não espera a internet.
  if (ctx.mode === 'saida') {
    const local = await productsByBarcode(ctx.barcode);
    if (!ctx.body.isConnected) return;
    if (!local.length) return notInCupboard(ctx);
    return local.length === 1 ? productForm(ctx, local[0], {}) : chooser(ctx, local);
  }
  // Primeiro sem a web (~3 s). Nenhuma loja nem catálogo tem: as opções
  // aparecem já, e a web continua procurando por baixo.
  const result = await lookup(ctx.barcode, { web: false });
  if (!ctx.body.isConnected) return;

  if (result.status === 'local') {
    if (result.products.length === 1) return productForm(ctx, result.products[0], {});
    return chooser(ctx, result.products);
  }
  if (ctx.mode === 'saida') return notInCupboard(ctx);
  if (result.status === 'notfound' && !ctx.barcode.startsWith('SEM-')) return notFoundChoice(ctx);
  return newForm(ctx, ctx.barcode.startsWith('SEM-') ? { status: 'nocode' } : result);
}

// ---------- Nenhuma loja tem o código ----------
// Duas saídas: fotografar a frente da embalagem (a IA lê o nome e procura nas
// lojas) ou digitar o nome. Enquanto a pessoa decide, a web procura o código;
// se achar, aparece no lugar da linha "Ainda procurando", sem empurrar nada.
function notFoundChoice(ctx) {
  const { body } = ctx;
  const token = {};
  ctx.screen = token;
  body.innerHTML = `
    <div class="stack notfound">
      <p class="notfound-code">${icon('barcode')}<span>${esc(ctx.barcode)}</span></p>
      <h2 class="sheet-title notfound-title">Nenhuma loja tem este código</h2>
      <p class="sheet-text">Fotografe a frente da embalagem, onde está o nome. O resto se preenche sozinho.</p>
      <label class="btn btn-mode btn-lg file-btn">${icon('camera')}<span>Fotografar a frente</span>
        <input type="file" accept="image/*" capture="environment" class="sr-only" data-front>
      </label>
      <button type="button" class="btn btn-quiet btn-lg" data-type-name>${icon('keyboard')}Digitar o nome</button>
      <div class="web-slot" aria-live="polite" data-web><p class="loading-note"><span class="spinner" aria-hidden="true"></span><span>Ainda procurando na internet</span></p></div>
    </div>`;
  $('[data-front]', body).addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) newForm(ctx, { status: 'photo' }, { photo: file });
  });
  $('[data-type-name]', body).addEventListener('click', () => newForm(ctx, { status: 'notfound' }));
  lookupRemote(ctx.barcode).then((web) => {
    if (!body.isConnected || ctx.screen !== token) return;
    const slot = $('[data-web]', body);
    if (web.status !== 'found') {
      slot.innerHTML = '<p class="loading-note">A internet também não tem este código.</p>';
      return;
    }
    const p = web.info;
    slot.innerHTML = `
      <div class="web-found">
        ${thumb(p)}
        <span class="row-main"><span class="row-sub">Na internet</span><span class="row-name">${esc(p.name)}</span></span>
        <button type="button" class="btn btn-quiet btn-sm" data-web-use>É este</button>
      </div>`;
    $('[data-web-use]', slot).addEventListener('click', () => newForm(ctx, web));
  }).catch(() => {
    if (body.isConnected && ctx.screen === token) $('[data-web]', body).innerHTML = '';
  });
}

// ---------- Produto sem código de barras (entrada e contagem) ----------
// A caixa já foi para o lixo, ou o produto nunca teve código (pão, fruta, feira).
// Três caminhos, do mais comum para o menos: já está no armário (compra de
// novo), escrever o nome (com sugestões das lojas) ou, por último, fotografar
// a embalagem (a IA lê marca e produto). A foto é o último recurso.

function noCodeChoice(ctx) {
  const { body } = ctx;
  body.innerHTML = `
    <h2 class="sheet-title">Produto sem código</h2>
    <p class="sheet-text">A caixa já foi para o lixo, ou o produto não tem código de barras?</p>
    <ul class="group choice-group">
      <li><button type="button" class="group-row" data-way="local">
        <span class="group-icon is-entrada">${icon('package')}</span>
        <span class="group-label">Já está no armário<span class="group-sub">Escolha na lista e diga quantos</span></span>
        ${icon('chevron', 'group-chevron')}
      </button></li>
      <li><button type="button" class="group-row" data-way="name">
        <span class="group-icon">${icon('keyboard')}</span>
        <span class="group-label">Digitar o nome<span class="group-sub">As lojas sugerem o produto enquanto você digita</span></span>
        ${icon('chevron', 'group-chevron')}
      </button></li>
      <li><label class="group-row file-btn" data-way="photo">
        <span class="group-icon">${icon('camera')}</span>
        <span class="group-label">Fotografar a embalagem<span class="group-sub">Para quando não souber o nome</span></span>
        ${icon('chevron', 'group-chevron')}
        <input type="file" accept="image/*" capture="environment" class="sr-only" data-way-photo>
      </label></li>
    </ul>`;
  $('[data-way="local"]', body).addEventListener('click', () => searchLocal(ctx, { all: true, title: 'Qual produto do armário?' }));
  $('[data-way="name"]', body).addEventListener('click', () => newForm(ctx, { status: 'nocode' }));
  // A câmera do celular abre direto no toque (a foto escolhida segue para o formulário).
  $('[data-way-photo]', body).addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) newForm(ctx, { status: 'photo' }, { photo: file });
  });
}

// ---------- Saída sem código: procura no armário pelo nome ----------

async function searchLocal(ctx, { all = false, title = 'O que está tirando?' } = {}) {
  const { body } = ctx;
  const products = (await listProducts()).filter((p) => all || p.qty > 0);
  if (!body.isConnected) return;
  body.innerHTML = `
    <h2 class="sheet-title">${esc(title)}</h2>
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
    list.innerHTML = found.map((p) => localRow(p, input.value)).join('');
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

// Produtos do armário para o que foi digitado (js/search.js); sem nada
// digitado, os mexidos por último.
function matchLocal(products, query) {
  if (!String(query || '').trim()) return products.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  return searchProducts(products, query);
}

function localRow(p, query = '') {
  return `
    <li>
      <button type="button" class="pick-row suggest-row" data-local="${esc(p.code)}">
        ${thumb(p)}
        <span class="row-main">
          <span class="row-name">${String(query).trim() ? highlight(p.name, query) : esc(p.name)}</span>
          <span class="row-sub"><strong class="stock-note">No armário: ${p.qty}</strong>${subtitle(p) ? `, ${subtitle(p)}` : ''}</span>
        </span>
      </button>
    </li>`;
}

// Enquanto procura: esqueleto do produto e o que está acontecendo agora.
// Se a loja demora, a frase muda para a pessoa saber que não travou.
function loading({ body }, code) {
  body.innerHTML = `
    <div class="product-head is-loading" aria-busy="true">
      <span class="skel skel-thumb-md" aria-hidden="true"></span>
      <div class="product-meta">
        <p class="sr-only">Buscando produto</p>
        <span class="skel skel-line" style="width:72%" aria-hidden="true"></span>
        <span class="skel skel-line skel-short" aria-hidden="true"></span>
        <p class="product-code">${esc(code.startsWith('SEM-') ? 'Produto sem código' : code)}</p>
      </div>
    </div>
    <p class="loading-note" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span data-note>Procurando no armário e nas lojas</span></p>
    <span class="skel skel-block" aria-hidden="true"></span>`;
  const note = $('[data-note]', body);
  const slow = setTimeout(() => { if (note.isConnected) note.textContent = 'A loja está demorando. Mais um instante'; }, 3500);
  const slower = setTimeout(() => { if (note.isConnected) note.textContent = 'As lojas ainda não responderam. Se preferir, digite o nome'; }, 7000);
  new MutationObserver((_, obs) => { if (!note.isConnected) { clearTimeout(slow); clearTimeout(slower); obs.disconnect(); } }).observe(body, { childList: true });
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
              <span class="row-meta">${empty ? '' : stockPill(p)}<span class="row-sub">${empty ? 'Nenhum no armário' : subtitle(p) || (stockPill(p) ? '' : '&nbsp;')}</span></span>
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

// Saída de um código que o armário não conhece. Três causas comuns, cada uma
// com o seu caminho: leitura errada, produto que ninguém cadastrou, ou produto
// que já está no armário com outro código (embalagem nova, fardo x unidade).
function notInCupboard(ctx) {
  const { body, close, barcode } = ctx;
  beep('error');
  body.innerHTML = `
    <h2 class="sheet-title">Esse código não está no armário</h2>
    <p class="sheet-text">Código ${esc(barcode)}. O que aconteceu?</p>
    <ul class="group choice-group">
      <li><button type="button" class="group-row" data-link>
        <span class="group-icon">${icon('search')}</span>
        <span class="group-label">É um produto que já está no armário<span class="group-sub">Escolha qual; da próxima vez, este código já abre ele</span></span>
        ${icon('chevron', 'group-chevron')}</button></li>
      <li><button type="button" class="group-row" data-switch>
        <span class="group-icon is-entrada">${icon('plus')}</span>
        <span class="group-label">Esqueci de cadastrar<span class="group-sub">Cadastre agora com quantos ainda tem no armário</span></span>
        ${icon('chevron', 'group-chevron')}</button></li>
      <li><button type="button" class="group-row" data-reread>
        <span class="group-icon">${icon('barcode')}</span>
        <span class="group-label">Leu errado<span class="group-sub">Fecha e volta a ler; aponte para o código do produto, não o da caixa</span></span>
        ${icon('chevron', 'group-chevron')}</button></li>
    </ul>`;
  $('[data-switch]', body).addEventListener('click', () => close({ kind: 'switch', code: barcode }));
  $('[data-reread]', body).addEventListener('click', () => close(null));
  $('[data-link]', body).addEventListener('click', () => linkToProduct(ctx));
}

// Liga o código lido a um produto que já existe e segue com a saída dele.
async function linkToProduct(ctx) {
  const { body, barcode } = ctx;
  const products = await listProducts();
  if (!body.isConnected) return;
  body.innerHTML = `
    <h2 class="sheet-title">Qual produto é?</h2>
    <p class="sheet-text">O código ${esc(barcode)} passa a abrir o produto que você escolher.</p>
    <div class="field">
      <label class="field-label" for="link-q">Nome do produto</label>
      <input class="input" id="link-q" type="search" enterkeyhint="search" autocomplete="off" maxlength="60" placeholder="Ex.: leite" aria-describedby="link-status">
      <p class="suggest-status" id="link-status" aria-live="polite"></p>
    </div>
    <ul class="pick suggest"></ul>`;
  const input = $('input', body);
  const list = $('.suggest', body);
  const status = $('#link-status', body);
  const render = () => {
    const found = matchLocal(products, input.value).slice(0, 8);
    list.innerHTML = found.map((p) => localRow(p, input.value)).join('');
    list.hidden = !found.length;
    status.textContent = input.value.trim() && !found.length ? `Nada no armário com “${input.value.trim()}”.` : '';
  };
  input.addEventListener('input', render);
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-local]');
    if (!btn) return;
    const p = await addBarcode(btn.dataset.local, barcode);
    productForm(ctx, p, {});
  });
  render();
  setTimeout(() => input.focus(), 250);
}

// ---------- Produto já cadastrado ----------

async function productForm(ctx, local, { fromList = false, fromChooser = false }) {
  const { body, close, mode } = ctx;

  if (mode === 'saida' && local.qty === 0) {
    beep('error');
    body.innerHTML = `
      ${head(local, local)}
      <p class="sheet-text">Está zerado no armário. Se ainda tem, corrija a quantidade na página do produto.</p>
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
      ${mode === 'entrada' ? expiryRowHtml() : ''}
      <div class="sheet-sticky"><button type="submit" class="btn btn-mode btn-lg"></button></div>
      ${canAddOther ? '<button type="button" class="btn btn-link btn-other" data-other>Não é este? Cadastrar outro</button>' : ''}
    </form>`;

  const submit = $('[type=submit]', body);
  let expiry = null;
  const step = stepper($('.stepper-host', body), {
    ...limits,
    label: mode === 'contagem' ? 'Quantos tem' : 'Quantidade',
    onChange: (n) => { submit.innerHTML = actionLabel(mode, n); if (expiry) expiry.refresh(); },
  });
  const other = $('[data-other]', body);
  if (other) other.addEventListener('click', () => newForm(ctx, { status: 'other' }));
  expiry = bindExpiryRow(body, { total: () => step.value, form: $('form', body) });

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

async function newForm(ctx, result, { photo = null } = {}) {
  const { body, mode } = ctx;
  ctx.screen = null;
  let barcode = ctx.barcode;
  let info = result.info || {};
  const noCode = barcode.startsWith('SEM-');
  const limits = {
    entrada: { min: 1, max: 999, value: ctx.qty || 1 },
    contagem: { min: 0, max: 999, value: 1 },
  }[mode];
  const firstGuess = guessAreaInfo(info);
  let area = firstGuess.area;
  let areaTouched = false;
  // Telemetria do cadastro: o último palpite e o que a web respondeu.
  let lastGuess = firstGuess;
  let webArea = null;
  const openedAt = performance.now();

  body.innerHTML = `
    <form class="stack" novalidate>
      <div data-head>${head({ ...info, name: info.name || 'Produto novo', code: barcode }, null)}</div>
      <p class="sheet-text" data-msg>${esc(info.med ? NEW_MSG.med : NEW_MSG[result.status] || NEW_MSG.notfound)}</p>
      ${result.status === 'offline' ? '<button type="button" class="btn btn-quiet btn-sm" data-retry>Buscar de novo</button>' : ''}
      <div class="field">
        <label class="field-label" for="new-name">Nome do produto</label>
        <input class="input" id="new-name" name="name" type="search" enterkeyhint="done" autocomplete="off" maxlength="80"
          value="${esc(info.name || '')}" placeholder="Ex.: feijão camil" aria-describedby="new-name-error new-name-status">
        <p class="field-error" id="new-name-error" hidden></p>
        <p class="suggest-status" id="new-name-status" aria-live="polite"></p>
        <button type="button" class="suggest-front" data-front-name hidden>${icon('camera')}<span><span class="suggest-front-label">Usar o que está na embalagem</span><span class="suggest-front-name"></span></span></button>
        <ul class="pick suggest" hidden></ul>
        ${result.status === 'found' ? '' : `
        <label class="btn btn-quiet file-btn" data-photo-btn>${icon('camera')}<span>Fotografar a embalagem</span>
          <input type="file" accept="image/*" capture="environment" data-photo class="sr-only">
        </label>`}
      </div>
      <fieldset class="segmented" data-area>
        <legend class="field-label">Onde fica</legend>
        <div class="segmented-track">
          ${AREAS.map((a) => `
            <label class="segment"><input type="radio" name="area" value="${a.id}" ${a.id === area ? 'checked' : ''}><span>${a.short}</span></label>`).join('')}
        </div>
        <p class="area-hint" data-area-hint hidden>Confira onde fica.</p>
      </fieldset>
      ${mode === 'contagem' ? '<p class="stepper-label">Quantos tem?</p>' : ''}
      <div class="stepper-host"></div>
      ${mode === 'entrada' ? expiryRowHtml() : ''}
      <div class="sheet-sticky"><button type="submit" class="btn btn-mode btn-lg"></button></div>
    </form>`;

  const submit = $('[type=submit]', body);
  const nameInput = $('input[name=name]', body);
  const nameError = $('#new-name-error', body);
  const status = $('#new-name-status', body);
  const list = $('.suggest', body);
  const headHost = $('[data-head]', body);
  const photoInput = $('[data-photo]', body);
  const photoBtn = $('[data-photo-btn]', body);
  let expiry = null;
  const step = stepper($('.stepper-host', body), {
    ...limits,
    label: mode === 'contagem' ? 'Quantos tem' : 'Quantidade',
    onChange: (n) => { submit.innerHTML = actionLabel(mode, n); if (expiry) expiry.refresh(); },
  });
  expiry = bindExpiryRow(body, { total: () => step.value, form: $('form', body) });

  const areaBox = $('[data-area]', body);
  const areaHint = $('[data-area-hint]', body);
  function setArea(id, fromUser = false) {
    if (fromUser) areaTouched = true;
    else if (areaTouched) return;
    area = id;
    const radio = $(`input[name=area][value="${id}"]`, body);
    if (radio) { radio.checked = true; revealSegment(radio.closest('label')); }
  }
  function showUnsure(unsure) {
    // Sem nome ainda, não há o que conferir.
    const on = unsure && !areaTouched && !!(nameInput.value.trim() || info.name);
    areaHint.hidden = !on;
    areaBox.classList.toggle('is-unsure', on);
  }
  // Sem certeza (areas.js): pergunta ao Mercado Livre pelo repassador; se ele
  // também não souber, a folha pede para conferir.
  let areaCtrl = null;
  let areaTimer = 0;
  function askWeb(name) {
    clearTimeout(areaTimer);
    if (areaCtrl) areaCtrl.abort();
    if (name.length < 3 || areaTouched) return;
    areaTimer = setTimeout(async () => {
      areaCtrl = new AbortController();
      const web = await areaFromWeb(name, areaCtrl.signal);
      if (!web || areaTouched || !body.isConnected || (nameInput.value.trim() || info.name || '') !== name) return;
      webArea = web;
      setArea(web);
      showUnsure(false);
    }, 500);
  }
  function applyGuess(p) {
    if (areaTouched) return;
    const g = guessAreaInfo(p);
    lastGuess = g;
    webArea = null;
    setArea(g.area);
    showUnsure(!g.sure);
    if (g.sure) { clearTimeout(areaTimer); if (areaCtrl) areaCtrl.abort(); } else askWeb(String(p.name || '').trim());
  }
  // Clique também: tocar no ambiente que já estava marcado confirma a escolha
  // (e ensina), mas não dispara "change".
  const pickArea = (e) => { if (e.target.name === 'area') { setArea(e.target.value, true); showUnsure(false); } };
  $('.segmented', body).addEventListener('change', pickArea);
  $('.segmented', body).addEventListener('click', pickArea);
  if (!firstGuess.sure) { showUnsure(true); askWeb(String(info.name || '').trim()); }

  // Sem código, o produto pode já estar no armário: ele aparece primeiro.
  let locals = [];
  if (noCode) listProducts().then((l) => { locals = l; });

  let suggestions = [];
  let timer = 0;
  let ctrl = null;
  // O que a foto leu (nome, marca, tamanho, miniatura), se houve foto.
  let fromPhoto = null;
  const photoRow = (alone) => (fromPhoto && result.status !== 'from-photo' ? photoPickRow(fromPhoto, alone) : '');

  function showSuggestions(items, query, from = 'lojas') {
    suggestions = items;
    const mine = noCode && query ? matchLocal(locals, query).slice(0, 3) : [];
    list.hidden = !items.length && !mine.length && !photoRow();
    list.innerHTML = mine.map((p) => localRow(p, query)).join('') + items.map((p, i) => `
      <li>
        <button type="button" class="pick-row suggest-row" data-i="${i}">
          ${thumb(p)}
          <span class="row-main">
            <span class="row-name">${esc(p.name)}</span>
            <span class="row-sub">${subtitle(p) || '&nbsp;'}</span>
          </span>
        </button>
      </li>`).join('') + photoRow(!items.length && !mine.length);
    const n = items.length + mine.length;
    status.textContent = n
      ? `${plural(n, 'sugestão', 'sugestões')}${mine.length ? ', primeiro o que já está no armário' : ` ${from === 'foto' ? 'pela foto' : 'das lojas'}`}.`
      : `Nada encontrado para “${query}”. ${fromPhoto ? 'Dá para usar o que está na embalagem.' : 'Dá para salvar só com o nome.'}`;
  }

  // Usa o que a foto leu: nome, marca, tamanho e a própria foto como miniatura.
  function usePhoto(auto = false) {
    info = { ...fromPhoto };
    result = { status: 'from-photo', info };
    nameInput.value = info.name;
    nameInput.removeAttribute('aria-invalid');
    nameError.hidden = true;
    list.hidden = true;
    status.textContent = '';
    applyGuess(info);
    headHost.innerHTML = head({ ...info, code: barcode }, null);
    $('[data-msg]', body).textContent = auto
      ? 'As lojas não têm esse produto. Nome, marca e tamanho vieram da foto: confira antes de salvar.'
      : 'Nome, marca e tamanho vieram da foto. Confira antes de salvar.';
    submit.focus({ preventScroll: true });
  }

  async function runSearch(query) {
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    status.textContent = 'Procurando nas lojas';
    if (list.hidden) { list.hidden = false; list.innerHTML = skeletonRows(3, 'skel-in-pick').replace(/^<ul[^>]*>|<\/ul>$/g, ''); }
    try {
      const items = await searchStores(query, ctrl.signal);
      if (body.isConnected && nameInput.value.trim() === query) showSuggestions(items, query);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (!body.isConnected) return;
      if (noCode && matchLocal(locals, query).length) { showSuggestions([], query); return; }
      list.hidden = true;
      status.textContent = 'Sem conexão com as lojas. Dá para salvar só com o nome.';
    }
  }

  // Nome escolhido numa sugestão da busca, diferente do que a foto leu: ao
  // tocar no campo, oferece o nome da embalagem (evita ficar com um nome
  // estranho que a busca trouxe).
  const frontBtn = $('[data-front-name]', body);
  const showFront = () => {
    const on = !!fromPhoto && result.status === 'found' && nameInput.value.trim() !== fromPhoto.name;
    frontBtn.hidden = !on;
    if (on) $('.suggest-front-name', frontBtn).textContent = fromPhoto.name;
  };
  nameInput.addEventListener('focus', showFront);
  frontBtn.addEventListener('click', () => {
    nameInput.value = fromPhoto.name;
    frontBtn.hidden = true;
    applyGuess({ ...info, name: fromPhoto.name });
    nameInput.focus();
  });

  nameInput.addEventListener('input', () => {
    const q = nameInput.value.trim();
    if (frontBtn && !frontBtn.hidden && q === fromPhoto?.name) frontBtn.hidden = true;
    if (q) { nameInput.removeAttribute('aria-invalid'); nameError.hidden = true; }
    applyGuess({ ...info, name: q });
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
    if (e.target.closest('[data-photo-use]')) { usePhoto(); return; }
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
    applyGuess(p);
    headHost.innerHTML = head({ ...p, code: barcode }, null);
    $('[data-msg]', body).textContent = 'Confira o nome antes de salvar.';
    if (photoBtn) photoBtn.hidden = true;
    submit.focus({ preventScroll: true });
  });

  // Foto da embalagem -> IA -> sugestões das lojas.
  async function readPhoto(file) {
      if (ctrl) ctrl.abort();
      clearTimeout(timer);
      photoBtn.classList.add('is-busy');
      photoBtn.setAttribute('aria-disabled', 'true');
      photoInput.disabled = true;
      $('span', photoBtn).textContent = 'Lendo a embalagem';
      status.textContent = 'Lendo a embalagem. Leva uns 5 segundos.';
      list.hidden = true;
      try {
        const [read, mini] = await Promise.all([identifyPhoto(await photoToDataUrl(file)), photoThumb(file).catch(() => '')]);
        if (!body.isConnected) return;
        fromPhoto = photoProduct(read, mini);
        if (result.status === 'from-photo') { info = {}; result = { status: 'notfound', info }; }
        if (fromPhoto && !nameInput.value.trim()) nameInput.value = fromPhoto.name;
        if (fromPhoto) applyGuess(fromPhoto);
        // Lojas acharam: a lista mostra, e no fim dá para usar o que a foto leu.
        // Não acharam: o que a foto leu é a única opção e já entra no formulário.
        const results = fromPhoto ? sameBrand(read.results, fromPhoto) : read.results;
        if (results.length) {
          showSuggestions(results, fromPhoto ? fromPhoto.name : '', 'foto');
          if (fromPhoto) $('[data-msg]', body).textContent = `Na embalagem: ${fromPhoto.name}. Toque no produto certo ou, no fim da lista, use o que está na embalagem.`;
        }
        else if (fromPhoto) usePhoto(true);
        else status.textContent = 'Não deu para ler a embalagem. Tente outra foto, mais de perto e com luz, ou digite o nome.';
      } catch {
        if (body.isConnected) status.textContent = 'Não deu para enviar a foto agora. Confira a internet ou digite o nome.';
      } finally {
        if (body.isConnected) {
          photoBtn.classList.remove('is-busy');
          photoBtn.removeAttribute('aria-disabled');
          photoInput.disabled = false;
          $('span', photoBtn).textContent = 'Fotografar de novo';
        }
      }
  }
  if (photoInput) {
    photoInput.addEventListener('change', () => {
      const file = photoInput.files && photoInput.files[0];
      photoInput.value = '';
      if (file) readPhoto(file);
    });
  }

  // Veio da escolha "Fotografar a embalagem": a foto já foi tirada, lê agora.
  if (photo && photoInput) readPhoto(photo);
  else if (!nameInput.value) setTimeout(() => nameInput.focus(), 250);

  const retry = $('[data-retry]', body);
  if (retry) {
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      retry.setAttribute('aria-busy', 'true');
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
    if (fromPhoto && result.status !== 'found' && result.status !== 'from-photo' && nameInput.value.trim() === fromPhoto.name) {
      info = { ...fromPhoto };
      result = { status: 'from-photo', info };
    }
    const { ean, ...rest } = info;
    const newInfo = {
      ...(result.status === 'other' ? {} : rest),
      name: nameInput.value.trim(),
      area,
      // Escolhido à mão: ensina os próximos parecidos (areas.js).
      areaByUser: areaTouched,
      barcodes: barcode.startsWith('SEM-') ? [] : [barcode],
      source: result.status === 'found' ? (info.source || 'off') : result.status === 'from-photo' ? 'foto' : 'manual',
    };
    // Remédio nunca guarda foto (regra da Anvisa).
    if (area === 'remedios') newInfo.image = '';
    tel('cadastro', {
      codigo: barcode, modo: mode, qtd: n, status: result.status, fonte: newInfo.source,
      nomeAchado: info.name || '', nome: newInfo.name, nomeMudou: !!info.name && info.name !== newInfo.name,
      foto: newInfo.image ? (String(newInfo.image).startsWith('data:') ? 'do celular' : 'da busca') : '',
      ambiente: area, palpite: lastGuess, palpiteWeb: webArea, escolhidoAMao: areaTouched,
      acertou: area === (webArea || lastGuess.area), validade: !!expiresAt, segundos: Math.round((performance.now() - openedAt) / 1000),
    });
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
    submit.setAttribute('aria-busy', 'true');
    try {
      const result = await action(step.value);
      if (result === undefined) { submit.disabled = false; submit.removeAttribute('aria-busy'); return; }
      close(result);
    } catch (err) {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
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

// Resultados da busca pela foto: só os da marca que a IA leu (a busca às vezes
// traz outra marca, ou um título em outro idioma), com o tamanho igual primeiro.
const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sizeKey = (x) => fold(x).replace(/\s+/g, '').replace(/,/g, '.');
export function sameBrand(items, read) {
  const brand = fold(read.brand).trim();
  const kept = brand ? items.filter((p) => fold(`${p.brand} ${p.name}`).includes(brand)) : items.slice();
  const size = sizeKey(read.size);
  if (!size) return kept;
  const hasSize = (p) => sizeKey(`${p.size} ${p.name}`).includes(size);
  return kept.filter(hasSize).concat(kept.filter((p) => !hasSize(p)));
}

