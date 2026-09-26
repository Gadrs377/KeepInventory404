// Tela inicial: o que tem no armário e quanto, por ambiente da casa.
// Cada linha tem um "−" que dá baixa de 1 na hora, sem câmera, com Desfazer.

import { listProducts, listLots, getCountDraft, isLow, onChange, removeStock, undoMovement } from '../store.js';
import { AREAS } from '../areas.js';
import { daysUntil, expiryText, SOON_DAYS, WATCH_DAYS } from '../dates.js';
import { $, esc, icon, plural, subtitle, tag, tagState, thumb, stockNote, toast, vibrate, tabBar } from '../ui.js';

let savedFilter = 'todos';
let savedArea = 'tudo';
let savedQuery = '';

export default function mountArmario(root) {
  root.innerHTML = `
    <div class="screen screen-home has-tabbar">
      <header class="home-head">
        <h1 class="page-title">Armário</h1>
      </header>
      <div class="home-tools glass-thick">
        <label class="search">
          ${icon('search')}
          <input type="search" placeholder="Buscar no armário" aria-label="Buscar no armário" value="${esc(savedQuery)}" autocomplete="off">
        </label>
        <div class="tabs" role="group" aria-label="Ambiente"></div>
        <div class="chips" role="group" aria-label="Mostrar só" hidden></div>
      </div>
      <div class="draft-note" hidden></div>
      <main class="shelf" aria-live="polite"></main>
      ${tabBar('armario')}
    </div>`;

  const shelf = $('.shelf', root);
  const tabs = $('.tabs', root);
  const chips = $('.chips', root);
  const search = $('input[type=search]', root);
  const draftNote = $('.draft-note', root);
  let products = [];
  let nextExpiry = new Map(); // code -> AAAA-MM-DD do lote que vence antes
  let alive = true;
  let refocus = null; // devolve o foco ao "−" depois de a lista ser redesenhada
  // Depois de um "−", a lista mantém a ordem em que estava: um produto que passa
  // a "acabando" não pula para o topo debaixo do dedo. Volta a ordenar quando a
  // pessoa busca, filtra ou troca de ambiente.
  let keepOrder = false;
  let lastOrder = new Map();

  const expiresSoon = (p, days = WATCH_DAYS) => p.qty > 0 && nextExpiry.has(p.code) && daysUntil(nextExpiry.get(p.code)) <= days;
  const FILTERS = [
    { id: 'todos', label: 'Todos', test: () => true },
    { id: 'acabando', label: 'Acabando', test: isLow },
    { id: 'zerados', label: 'Zerados', test: (p) => p.qty === 0 },
    { id: 'vencendo', label: 'Vencendo', test: (p) => expiresSoon(p) },
  ];
  const TABS = [{ id: 'tudo', short: 'Tudo' }, ...AREAS];

  function render() {
    // Abas de ambiente só quando os produtos estão em mais de um lugar da casa.
    const usedAreas = new Set(products.map((p) => p.area || 'cozinha'));
    const showTabs = usedAreas.size > 1;
    if (!showTabs) savedArea = 'tudo';
    tabs.hidden = !showTabs;
    tabs.innerHTML = showTabs ? TABS.filter((t) => t.id === 'tudo' || usedAreas.has(t.id)).map((t) => `
      <button type="button" class="tab" aria-pressed="${savedArea === t.id}" data-area="${t.id}">${t.short}</button>`).join('') : '';

    // Filtros de estado, contados dentro do ambiente escolhido. Só aparecem quando têm algo.
    // "Vencendo" fica amarelo quando algo vence nesta semana (substitui o antigo aviso).
    const inArea = products.filter((p) => savedArea === 'tudo' || (p.area || 'cozinha') === savedArea);
    const counts = Object.fromEntries(FILTERS.map((f) => [f.id, inArea.filter(f.test).length]));
    const urgent = inArea.some((p) => expiresSoon(p, SOON_DAYS));
    const shown = FILTERS.filter((f) => f.id !== 'todos' && (counts[f.id] || savedFilter === f.id));
    chips.hidden = !shown.length;
    chips.innerHTML = shown.map((f) => `
      <button type="button" class="chip chip-${f.id} ${f.id === 'vencendo' && urgent ? 'is-urgent' : ''}" aria-pressed="${savedFilter === f.id}" data-filter="${f.id}">
        ${f.label} <span class="chip-n">${counts[f.id]}</span>${f.id === 'vencendo' && urgent ? '<span class="sr-only">, algo vence nesta semana</span>' : ''}
      </button>`).join('');

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
    if (keepOrder) {
      const at = (p) => (lastOrder.has(p.code) ? lastOrder.get(p.code) : Infinity);
      visible.sort((a, b) => at(a) - at(b));
    }
    lastOrder = new Map(visible.map((p, i) => [p.code, i]));

    shelf.innerHTML = visible.length
      ? `<ul class="rows">${visible.map((p) => `
          <li class="row-item">
            <a class="row" href="#/produto/${encodeURIComponent(p.code)}">
              ${thumb(p)}
              <span class="row-main">
                <span class="row-name">${esc(p.name)}</span>
                <span class="row-sub">${rowSub(p)}</span>
              </span>
              ${tag(p.qty, tagState(p))}
            </a>
            ${p.qty > 0
              ? `<button type="button" class="row-minus" data-minus="${esc(p.code)}" aria-label="Tirar 1 de ${esc(p.name)}">${icon('minus')}</button>`
              : '<span class="row-minus-space" aria-hidden="true"></span>'}
          </li>`).join('')}</ul>`
      : `<div class="empty-filter">
          <p>${q ? `Nada ${savedArea === 'tudo' ? 'no armário' : `em ${esc(AREAS.find((a) => a.id === savedArea).short)}`} com “${esc(savedQuery.trim())}”.` : emptyText(filter.id)}</p>
          <button type="button" class="btn btn-quiet btn-sm" data-reset>${q ? 'Limpar busca' : 'Mostrar todos'}</button>
        </div>`;

    if (refocus) {
      const again = shelf.querySelector(`[data-minus="${CSS.escape(refocus)}"]`);
      (again || search).focus({ preventScroll: true });
      refocus = null;
    }
  }

  function rowSub(p) {
    const exp = expiresSoon(p) ? nextExpiry.get(p.code) : '';
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

  // Baixa de 1 direto da lista. A ordem das linhas não muda na hora, para o
  // dedo não acertar outro produto num segundo toque.
  async function minusOne(code, btn) {
    btn.disabled = true;
    try {
      const { product, movement } = await removeStock(code, 1);
      vibrate(15);
      toast(`−1 ${product.name}. Agora tem ${product.qty}.`, {
        mode: 'saida',
        action: 'Desfazer',
        onAction: async () => {
          try {
            await undoMovement(movement.id);
            toast('Baixa desfeita.', { duration: 2500 });
          } catch (err) {
            toast(err.message, { duration: 4000 });
          }
        },
      });
    } catch (err) {
      btn.disabled = false;
      toast(err.message, { duration: 3000 });
    }
  }

  shelf.addEventListener('click', (e) => {
    const minus = e.target.closest('[data-minus]');
    if (minus) {
      refocus = minus.dataset.minus;
      keepOrder = true;
      minusOne(minus.dataset.minus, minus);
      return;
    }
    if (!e.target.closest('[data-reset]')) return;
    if (savedQuery.trim()) { savedQuery = ''; search.value = ''; } else { savedFilter = 'todos'; savedArea = 'tudo'; }
    keepOrder = false;
    render();
    search.focus();
  });
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-area]');
    if (!btn) return;
    savedArea = btn.dataset.area;
    keepOrder = false;
    render();
  });
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    savedFilter = savedFilter === btn.dataset.filter ? 'todos' : btn.dataset.filter;
    keepOrder = false;
    render();
  });
  search.addEventListener('input', () => {
    savedQuery = search.value;
    keepOrder = false;
    render();
  });

  const off = onChange(load);
  load();
  return () => { alive = false; off(); };
}
