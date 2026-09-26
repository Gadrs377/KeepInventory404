// Tela inicial: o que tem no armário e quanto, por ambiente da casa.

import { listProducts, listLots, getCountDraft, isLow, onChange } from '../store.js';
import { AREAS } from '../areas.js';
import { daysUntil, expiryText, SOON_DAYS, WATCH_DAYS } from '../dates.js';
import { $, esc, icon, plural, subtitle, tag, tagState, thumb, stockNote } from '../ui.js';

let savedFilter = 'todos';
let savedArea = 'tudo';
let savedQuery = '';

export default function mountArmario(root) {
  root.innerHTML = `
    <div class="screen screen-home has-floating-bar">
      <header class="home-head">
        <div>
          <h1 class="page-title">Armário</h1>
          <p class="home-summary" data-summary>&nbsp;</p>
        </div>
        <a class="icon-btn" href="#/dados" aria-label="Dados e backup">${icon('menu')}</a>
      </header>
      <nav class="home-links" aria-label="Outras telas">
        <a class="btn btn-quiet btn-sm" href="#/compras">${icon('cart')}Compras</a>
        <a class="btn btn-quiet btn-sm" href="#/inventario">${icon('count')}Contar</a>
      </nav>
      <div class="home-tools glass-thick">
        <label class="search">
          ${icon('search')}
          <input type="search" placeholder="Buscar no armário" aria-label="Buscar no armário" value="${esc(savedQuery)}" autocomplete="off">
        </label>
        <div class="tabs" role="group" aria-label="Ambiente"></div>
      </div>
      <div class="chips" role="group" aria-label="Mostrar só" hidden></div>
      <div class="draft-note" hidden></div>
      <div class="draft-note alert-note" data-expiring hidden></div>
      <main class="shelf" aria-live="polite"></main>
      <nav class="modebar floating-bar glass-regular" aria-label="Registrar">
        <a class="mode-btn mode-entrada" href="#/entrada">${icon('in')}<span>Entrada</span></a>
        <a class="mode-btn mode-saida" href="#/saida">${icon('out')}<span>Saída</span></a>
      </nav>
    </div>`;

  const shelf = $('.shelf', root);
  const tabs = $('.tabs', root);
  const chips = $('.chips', root);
  const summary = $('[data-summary]', root);
  const search = $('input[type=search]', root);
  const draftNote = $('.draft-note', root);
  const expiringNote = $('[data-expiring]', root);
  let products = [];
  let nextExpiry = new Map(); // code -> AAAA-MM-DD do lote que vence antes
  let alive = true;

  const expiresSoon = (p, days = WATCH_DAYS) => nextExpiry.has(p.code) && daysUntil(nextExpiry.get(p.code)) <= days;
  const FILTERS = [
    { id: 'todos', label: 'Todos', test: () => true },
    { id: 'acabando', label: 'Acabando', test: isLow },
    { id: 'zerados', label: 'Zerados', test: (p) => p.qty === 0 },
    { id: 'vencendo', label: 'Vencendo', test: (p) => expiresSoon(p) },
  ];
  const TABS = [{ id: 'tudo', short: 'Tudo' }, ...AREAS];

  function render() {
    const low = products.filter(isLow).length;
    const zero = products.filter((p) => p.qty === 0).length;
    summary.textContent = products.length
      ? [plural(products.length, 'produto', 'produtos'), low && `${low} acabando`, zero && plural(zero, 'zerado', 'zerados')].filter(Boolean).join(', ')
      : 'Nada guardado ainda';

    tabs.innerHTML = TABS.map((t) => `
      <button type="button" class="tab" aria-pressed="${savedArea === t.id}" data-area="${t.id}">${t.short}</button>`).join('');

    // Filtros de estado, contados dentro do ambiente escolhido. Só aparecem quando têm algo.
    const inArea = products.filter((p) => savedArea === 'tudo' || (p.area || 'cozinha') === savedArea);
    const counts = Object.fromEntries(FILTERS.map((f) => [f.id, inArea.filter(f.test).length]));
    const shown = FILTERS.filter((f) => f.id !== 'todos' && (counts[f.id] || savedFilter === f.id));
    chips.hidden = !shown.length;
    chips.innerHTML = shown.map((f) => `
      <button type="button" class="chip chip-${f.id}" aria-pressed="${savedFilter === f.id}" data-filter="${f.id}">
        ${f.label} <span class="chip-n">${counts[f.id]}</span>
      </button>`).join('');

    // Aviso de validade: o que venceu ou vence nesta semana, em qualquer ambiente.
    const urgent = products.filter((p) => p.qty > 0 && expiresSoon(p, SOON_DAYS))
      .sort((a, b) => nextExpiry.get(a.code).localeCompare(nextExpiry.get(b.code)));
    expiringNote.hidden = !urgent.length || savedFilter === 'vencendo';
    if (urgent.length) {
      const first = urgent[0];
      const text = urgent.length === 1
        ? `${esc(first.name)}: ${expiryText(nextExpiry.get(first.code)).toLowerCase()}.`
        : `${plural(urgent.length, 'produto vence', 'produtos vencem')} nesta semana. O primeiro: ${esc(first.name)}.`;
      expiringNote.innerHTML = `<span>${icon('calendar')}${text}</span><button type="button" class="btn btn-quiet btn-sm" data-show-expiring>Ver</button>`;
    }

    if (!products.length) {
      shelf.innerHTML = `
        <div class="empty-state">
          <p class="empty-lead">Comece pela Entrada.</p>
          <p>Toque em Entrada, aponte a câmera para o código de barras de um pacote do armário e confirme a quantidade. Ele aparece aqui com o número de unidades.</p>
        </div>`;
      return;
    }

    const q = savedQuery.trim().toLocaleLowerCase('pt-BR');
    const filter = FILTERS.find((f) => f.id === savedFilter) || FILTERS[0];
    const rank = (p) => (isLow(p) ? 0 : p.qty === 0 ? 1 : 2);
    const byExpiry = (a, b) => nextExpiry.get(a.code).localeCompare(nextExpiry.get(b.code));
    const visible = inArea
      .filter(filter.test)
      .filter((p) => !q || `${p.name} ${p.brand} ${p.code}`.toLocaleLowerCase('pt-BR').includes(q))
      .sort(filter.id === 'vencendo' ? byExpiry : (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'pt-BR'));

    shelf.innerHTML = visible.length
      ? `<ul class="rows">${visible.map((p) => `
          <li>
            <a class="row" href="#/produto/${encodeURIComponent(p.code)}">
              ${thumb(p)}
              <span class="row-main">
                <span class="row-name">${esc(p.name)}</span>
                <span class="row-sub">${rowSub(p)}</span>
              </span>
              ${tag(p.qty, tagState(p))}
            </a>
          </li>`).join('')}</ul>`
      : `<div class="empty-filter">
          <p>${q ? `Nada ${savedArea === 'tudo' ? 'no armário' : `em ${esc(AREAS.find((a) => a.id === savedArea).short)}`} com “${esc(savedQuery.trim())}”.` : emptyText(filter.id)}</p>
          <button type="button" class="btn btn-quiet btn-sm" data-reset>${q ? 'Limpar busca' : 'Mostrar todos'}</button>
        </div>`;
  }

  function rowSub(p) {
    const exp = expiresSoon(p) && p.qty > 0 ? nextExpiry.get(p.code) : '';
    const expNote = exp && (daysUntil(exp) <= SOON_DAYS ? `<strong class="stock-note">${expiryText(exp)}</strong>` : expiryText(exp));
    return [stockNote(p) && `<strong class="stock-note">${stockNote(p)}</strong>`, expNote, subtitle(p)].filter(Boolean).join(', ') || '&nbsp;';
  }

  function emptyText(id) {
    const where = savedArea === 'tudo' ? '' : ` em ${AREAS.find((a) => a.id === savedArea).short}`;
    if (id === 'todos') return `Nada guardado${where} ainda.`;
    const what = { acabando: 'acabando', zerados: 'zerado', vencendo: 'vencendo' }[id];
    return `Nenhum produto ${what}${where} agora.`;
  }

  async function load() {
    const [list, draft, lots] = await Promise.all([listProducts(), getCountDraft(), listLots()]);
    if (!alive) return;
    products = list;
    nextExpiry = new Map();
    for (const lot of lots) if (!nextExpiry.has(lot.code)) nextExpiry.set(lot.code, lot.expiresAt);
    const n = draft ? Object.keys(draft.counts).length : 0;
    draftNote.hidden = !n;
    if (n) {
      draftNote.innerHTML = `<span>Contagem em andamento, ${plural(n, 'produto contado', 'produtos contados')}.</span><a class="btn btn-quiet btn-sm" href="#/inventario">Continuar</a>`;
    }
    render();
  }

  shelf.addEventListener('click', (e) => {
    if (!e.target.closest('[data-reset]')) return;
    if (savedQuery.trim()) { savedQuery = ''; search.value = ''; } else { savedFilter = 'todos'; savedArea = 'tudo'; }
    render();
    search.focus();
  });
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-area]');
    if (!btn) return;
    savedArea = btn.dataset.area;
    render();
  });
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    savedFilter = savedFilter === btn.dataset.filter ? 'todos' : btn.dataset.filter;
    render();
  });
  expiringNote.addEventListener('click', (e) => {
    if (!e.target.closest('[data-show-expiring]')) return;
    savedFilter = 'vencendo';
    savedArea = 'tudo';
    render();
    chips.querySelector('[aria-pressed="true"]')?.focus();
  });
  search.addEventListener('input', () => {
    savedQuery = search.value;
    render();
  });

  const off = onChange(load);
  load();
  return () => { alive = false; off(); };
}
