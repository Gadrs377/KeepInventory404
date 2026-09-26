// Tela inicial: o que tem no armário e quanto, por ambiente da casa.
// Cada linha tem um "−" que dá baixa de 1 na hora, sem câmera, com Desfazer.

import { listProducts, listLots, getCountDraft, isLow, onChange, addStock, removeStock, undoMovement } from '../store.js';
import { addToShopList } from '../shop.js';
import { AREAS } from '../areas.js';
import { daysUntil, expiryText, SOON_DAYS, WATCH_DAYS } from '../dates.js';
import { $, esc, icon, plural, subtitle, tag, tagState, thumb, stockNote, toast, vibrate, tabBar, openMenu, skeletonRows, glideTo } from '../ui.js';

let savedFilter = 'todos';
let savedArea = 'tudo';
let savedQuery = '';
let firstShow = true; // a lista entra em cascata só na primeira vez que aparece

// Nome para a troca animada de cada linha (tem de ser um identificador de CSS).
const vtName = (code) => `row-${[...code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;

// A linha tocada "vira" a página do produto: foto, nome e etiqueta ganham os
// mesmos nomes que o topo da página do produto e voam até lá.
function markHero(li) {
  const parts = [['.thumb', 'hero-thumb'], ['.row-name', 'hero-title'], ['.tag', 'hero-tag']];
  for (const [sel, name] of parts) {
    const el = li.querySelector(sel);
    if (el) { el.style.viewTransitionName = name; el.dataset.vt = ''; }
  }
}

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
      <main class="shelf" aria-live="polite" aria-busy="true">${skeletonRows(5)}</main>
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
  // Quantidade da última vez que a lista foi desenhada: o número que mudou
  // rola para cima ou para baixo, como os contadores do iPhone.
  let lastQty = new Map();

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
    if (showTabs) glideTo(tabs, tabs.querySelector('[aria-pressed="true"]'), { line: true });

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
          <p class="empty-lead">Comece pelo leitor.</p>
          <p>Toque no botão do código de barras, embaixo à direita, e aponte a câmera para um pacote do armário. Ele aparece aqui com o número de unidades.</p>
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
    const moved = (p) => (lastQty.has(p.code) && lastQty.get(p.code) !== p.qty ? (p.qty > lastQty.get(p.code) ? 'is-up' : 'is-down') : '');

    const entering = firstShow && visible.length;
    firstShow = false;
    shelf.innerHTML = visible.length
      ? `<ul class="rows${entering ? ' is-entering' : ''}">${visible.map((p, i) => `
          <li class="row-item" data-code="${esc(p.code)}" data-qty="${p.qty}" style="--i:${Math.min(i, 12)}">
            <span class="swipe-bg" aria-hidden="true"><span class="swipe-act swipe-plus">${icon('plus')}1</span><span class="swipe-act swipe-minus">${icon('minus')}1</span></span>
            <div class="row-slide">
            <a class="row" draggable="false" href="#/produto/${encodeURIComponent(p.code)}">
              ${thumb(p)}
              <span class="row-main">
                <span class="row-name">${esc(p.name)}</span>
                <span class="row-sub">${rowSub(p)}</span>
              </span>
              ${tag(p.qty, `${tagState(p)} ${moved(p)}`)}
            </a>
            ${p.qty > 0
              ? `<button type="button" class="row-minus" data-minus="${esc(p.code)}" aria-label="Tirar 1 de ${esc(p.name)}">${icon('minus')}</button>`
              : '<span class="row-minus-space" aria-hidden="true"></span>'}
            </div>
          </li>`).join('')}</ul>`
      : `<div class="empty-filter">
          <p>${q ? `Nada ${savedArea === 'tudo' ? 'no armário' : `em ${esc(AREAS.find((a) => a.id === savedArea).short)}`} com “${esc(savedQuery.trim())}”.` : emptyText(filter.id)}</p>
          <button type="button" class="btn btn-quiet btn-sm" data-reset>${q ? 'Limpar busca' : 'Mostrar todos'}</button>
        </div>`;

    lastQty = new Map(products.map((p) => [p.code, p.qty]));
    shelf.removeAttribute('aria-busy');

    // Voltando do produto: a linha dele recebe os nomes para a página "encolher" nela.
    let hero = '';
    try { hero = sessionStorage.getItem('ki.hero') || ''; sessionStorage.removeItem('ki.hero'); } catch { /* sem armazenamento */ }
    const heroLi = hero && shelf.querySelector(`.row-item[data-code="${CSS.escape(hero)}"]`);
    if (heroLi) markHero(heroLi);

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
  async function minusOne(code, btn, delta = -1) {
    if (btn) btn.disabled = true;
    try {
      const { product, movement } = delta < 0 ? await removeStock(code, 1) : await addStock(code, 1);
      vibrate(15);
      toast(`${delta < 0 ? '−1' : '+1'} ${product.name}. Agora tem ${product.qty}.`, {
        mode: delta < 0 ? 'saida' : 'entrada',
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
      if (btn) btn.disabled = false;
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
    renderAnimated();
  });
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    savedFilter = savedFilter === btn.dataset.filter ? 'todos' : btn.dataset.filter;
    keepOrder = false;
    renderAnimated();
  });
  search.addEventListener('input', () => {
    savedQuery = search.value;
    keepOrder = false;
    render();
  });

  // Arrastar a linha, como no Mail do iPhone: para a esquerda tira 1, para a
  // direita põe 1. Passando do ponto a ação "arma" (vibra e cresce); soltando,
  // acontece e a linha volta com mola. O "−" continua lá como alternativa.
  const ARM = 88;
  let swipe = null;
  shelf.addEventListener('pointerdown', (e) => {
    const slide = e.target.closest('.row-slide');
    if (!slide || e.button > 0 || e.target.closest('[data-minus]')) return;
    swipe = { slide, li: slide.parentElement, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, dx: 0, armed: false };
  });
  shelf.addEventListener('pointermove', (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (!swipe.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      swipe.on = true;
      suppressClick = true;
      swipe.slide.classList.add('is-swiping');
      try { swipe.slide.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
    }
    const qty = Number(swipe.li.dataset.qty);
    let d = dx < 0 && qty === 0 ? dx * 0.25 : dx; // zerado: resiste, não há o que tirar
    if (Math.abs(d) > ARM) d = Math.sign(d) * (ARM + (Math.abs(d) - ARM) * 0.4);
    swipe.dx = d;
    swipe.slide.style.transform = `translateX(${d}px)`;
    swipe.li.classList.toggle('swipe-left', d < 0);
    swipe.li.classList.toggle('swipe-right', d > 0);
    const armed = Math.abs(d) >= ARM && !(d < 0 && qty === 0);
    if (armed !== swipe.armed) { swipe.armed = armed; swipe.li.classList.toggle('is-armed', armed); if (armed) vibrate(12); }
  });
  const endSwipe = () => {
    if (!swipe) return;
    const { slide, li, armed, dx, on } = swipe;
    swipe = null;
    if (!on) return;
    slide.classList.remove('is-swiping');
    slide.style.transform = '';
    setTimeout(() => li.classList.remove('swipe-left', 'swipe-right', 'is-armed'), 420);
    if (armed) {
      keepOrder = true;
      minusOne(li.dataset.code, null, dx < 0 ? -1 : 1);
    }
  };
  shelf.addEventListener('pointerup', endSwipe);
  shelf.addEventListener('pointercancel', endSwipe);

  // Toque longo (ou botão direito) numa linha: menu rápido, como no iPhone.
  function rowMenu(row) {
    const code = decodeURIComponent(row.getAttribute('href').split('/').pop());
    const p = products.find((x) => x.code === code);
    if (!p) return;
    vibrate(10);
    row.classList.add('is-lifted');
    keepOrder = true;
    openMenu(row, [
      { label: 'Tirar 1', icon: 'minus', onSelect: () => { if (p.qty > 0) minusOne(code, null, -1); else toast(`${p.name} já está zerado.`, { duration: 2500 }); } },
      { label: 'Pôr 1', icon: 'plus', onSelect: () => minusOne(code, null, 1) },
      { label: 'Pôr na lista de compras', icon: 'cart', onSelect: () => toast(addToShopList(p.name) ? `${p.name} está na lista de compras.` : `${p.name} já estava na lista.`, { duration: 2500 }) },
      { label: 'Ver produto', icon: 'chevron', onSelect: () => { location.hash = row.getAttribute('href'); } },
    ], { label: p.name }).then(() => row.classList.remove('is-lifted'));
  }
  let press = null;
  let suppressClick = false;
  shelf.addEventListener('pointerdown', (e) => {
    suppressClick = false;
    const row = e.target.closest('a.row');
    if (!row || e.pointerType === 'mouse') return;
    press = { row, x: e.clientX, y: e.clientY, timer: setTimeout(() => { suppressClick = true; press = null; rowMenu(row); }, 480) };
  });
  const cancelPress = (e) => {
    if (!press) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 8) return;
    clearTimeout(press.timer);
    press = null;
  };
  ['pointermove', 'pointerup', 'pointercancel'].forEach((t) => shelf.addEventListener(t, cancelPress));
  shelf.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('a.row');
    if (!row) return;
    e.preventDefault();
    if (suppressClick) return; // o toque longo já abriu o menu
    rowMenu(row);
  });
  shelf.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); e.stopImmediatePropagation(); suppressClick = false; return; }
    const row = e.target.closest('a.row');
    if (row) {
      const li = row.closest('.row-item');
      markHero(li);
      try { sessionStorage.setItem('ki.hero', li.dataset.code); } catch { /* sem armazenamento */ }
    }
  }, true);

  // Trocar de ambiente ou de filtro: as linhas que continuam deslizam para o
  // novo lugar, as que saem somem e as novas aparecem (View Transitions).
  function renderAnimated() {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduced) { render(); return; }
    const name = () => shelf.querySelectorAll('.row-item').forEach((li, i) => {
      if (i > 40) return;
      li.style.viewTransitionName = vtName(li.dataset.code);
      li.style.viewTransitionClass = 'row';
      li.dataset.vt = '';
    });
    name();
    // A faixa de busca e filtros fica viva: o sublinhado das abas desliza nela.
    const tools = root.querySelector('.home-tools');
    tools.style.viewTransitionName = 'home-tools';
    tools.dataset.vt = '';
    const t = document.startViewTransition(() => { render(); name(); });
    t.ready.catch(() => {});
    t.finished.catch(() => {}).then(() => root.querySelectorAll('[data-vt]').forEach((el) => { el.style.viewTransitionName = ''; delete el.dataset.vt; }));
  }

  const off = onChange(load);
  load();
  return () => { alive = false; off(); };
}
