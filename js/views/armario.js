// Tela inicial: o que tem no armário e quanto, por ambiente da casa.
// Cada linha tem um "−" que dá baixa de 1 na hora, sem câmera, com Desfazer.

import { listProducts, listLots, getCountDraft, isLow, onChange, addStock, removeStock, undoMovement } from '../store.js';
import { addToShopList } from '../shop.js';
import { AREAS, isMed } from '../areas.js';
import { searchMeds } from '../remedios.js';
import { medSheet, anvisaResultsHtml } from './remedioInfo.js';
import { showProductSheet } from './productSheet.js';
import { daysUntil, expiryText, SOON_DAYS, WATCH_DAYS } from '../dates.js';
import { $, esc, icon, plural, subtitle, tag, tagState, thumb, toast, vibrate, tabBar, openMenu, skeletonRows, glideTo, pill, stockPill, afterUseText } from '../ui.js';

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
        <div class="head-actions">
          <button type="button" class="head-pill" data-nota>${icon('qrCode')}<span class="head-pill-label">Nota fiscal</span></button>
        </div>
      </header>
      <div class="home-tools glass-thick">
        <label class="search">
          ${icon('search')}
          <input type="search" placeholder="Buscar no armário" aria-label="Buscar no armário" value="${esc(savedQuery)}" autocomplete="off">
        </label>
        <div class="tabs" role="group" aria-label="Ambiente"></div>
      </div>
      <div class="draft-note" hidden></div>
      <div class="summary" role="group" aria-label="Mostrar só" hidden></div>
      <main class="shelf" aria-live="polite" aria-busy="true">${skeletonRows(5)}</main>
      ${tabBar('armario')}
    </div>`;

  const shelf = $('.shelf', root);
  const tabs = $('.tabs', root);
  const chips = $('.summary', root);
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
  // Busca na lista da Anvisa: em Remédios, ou em Tudo quando nada em casa bate.
  let meds = { q: '', rows: null, error: false };
  let medTimer = 0;
  let medId = 0;

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

    // Blocos de resumo, como as listas inteligentes do app Lembretes: quantos
    // estão acabando, zerados e vencendo no ambiente escolhido. Tocar filtra a
    // lista; tocar de novo volta para todos. Sem nada, o bloco fica apagado.
    const inArea = products.filter((p) => savedArea === 'tudo' || (p.area || 'cozinha') === savedArea);
    const counts = Object.fromEntries(FILTERS.map((f) => [f.id, inArea.filter(f.test).length]));
    const urgent = inArea.some((p) => expiresSoon(p, SOON_DAYS));
    const TILE_ICON = { acabando: 'hourglass', zerados: 'dashed', vencendo: 'calendar' };
    // Sem nada acabando, zerado ou vencendo, os blocos não têm o que mostrar: somem.
    chips.hidden = !products.length || (savedFilter === 'todos' && !counts.acabando && !counts.zerados && !counts.vencendo);
    chips.innerHTML = FILTERS.filter((f) => f.id !== 'todos').map((f) => `
      <button type="button" class="tile tile-${f.id}${f.id === 'vencendo' && urgent ? ' is-urgent' : ''}${counts[f.id] ? '' : ' is-empty'}" aria-pressed="${savedFilter === f.id}" data-filter="${f.id}">
        <span class="tile-icon" aria-hidden="true">${icon(TILE_ICON[f.id])}</span>
        <span class="tile-n">${counts[f.id]}</span>
        <span class="tile-label">${f.label}${f.id === 'vencendo' && urgent ? '<span class="sr-only">, algo vence nesta semana</span>' : ''}</span>
      </button>`).join('');

    if (!products.length) {
      shelf.innerHTML = `
        <div class="empty-state">
          <p class="empty-lead">Nada guardado ainda</p>
          <p>Leia o código de barras de um pacote e ele aparece aqui com o número de unidades.</p>
          <a class="btn btn-primary" href="#/entrada">${icon('barcode')}Abrir o leitor</a>
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
    // Em "Tudo", com mais de um ambiente, a lista vem separada por ambiente
    // (como a despensa, a geladeira e o armário dos apps de despensa).
    const grouped = showTabs && savedArea === 'tudo';
    const areaIndex = (p) => Math.max(0, AREAS.findIndex((a) => a.id === (p.area || 'cozinha')));
    if (grouped) visible.sort((a, b) => areaIndex(a) - areaIndex(b));
    if (keepOrder) {
      const at = (p) => (lastOrder.has(p.code) ? lastOrder.get(p.code) : Infinity);
      visible.sort((a, b) => at(a) - at(b));
    }
    lastOrder = new Map(visible.map((p, i) => [p.code, i]));
    const moved = (p) => (lastQty.has(p.code) && lastQty.get(p.code) !== p.qty ? (p.qty > lastQty.get(p.code) ? 'is-up' : 'is-down') : '');

    const entering = firstShow && visible.length;
    firstShow = false;
    const rowHtml = (p, i) => `
          <li class="row-item" data-code="${esc(p.code)}" data-qty="${p.qty}" style="--i:${Math.min(i, 12)}">
            <span class="swipe-bg" aria-hidden="true"><span class="swipe-act swipe-plus">${icon('plus')}1</span><span class="swipe-act swipe-minus">${icon('minus')}1</span></span>
            <div class="row-slide">
            <a class="row" draggable="false" href="#/produto/${encodeURIComponent(p.code)}">
              ${thumb(p)}
              <span class="row-main">
                <span class="row-name">${esc(p.name)}</span>
                ${rowMeta(p)}
              </span>
              ${tag(p.qty, `${tagState(p)} ${moved(p)}`)}
            </a>
            ${p.qty > 0
              ? `<button type="button" class="row-minus" data-minus="${esc(p.code)}" aria-label="Tirar 1 de ${esc(p.name)}">${icon('minus')}</button>`
              : '<span class="row-minus-space" aria-hidden="true"></span>'}
            </div>
          </li>`;
    const ulClass = `rows${entering ? ' is-entering' : ''}`;
    let listHtml = '';
    if (grouped) {
      let i = 0;
      for (const a of AREAS) {
        const rows = visible.filter((p) => (p.area || 'cozinha') === a.id);
        if (!rows.length) continue;
        listHtml += `<h2 class="list-title list-title-icon shelf-title">${icon(a.icon)}${a.label}<span class="title-count">${rows.length}</span></h2>
          <ul class="${ulClass}">${rows.map((p) => rowHtml(p, i++)).join('')}</ul>`;
      }
    } else {
      listHtml = `<ul class="${ulClass}">${visible.map(rowHtml).join('')}</ul>`;
    }
    shelf.innerHTML = (visible.length
      ? listHtml
      : `<div class="empty-filter">
          <p>${q ? `Nada ${savedArea === 'tudo' ? 'no armário' : `em ${esc(AREAS.find((a) => a.id === savedArea).short)}`} com “${esc(savedQuery.trim())}”.` : emptyText(filter.id)}</p>
          <button type="button" class="btn btn-quiet btn-sm" data-reset>${q ? 'Limpar busca' : 'Mostrar todos'}</button>
        </div>`) + medsHtml(visible.length);

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

  // Remédios da lista da Anvisa para o que foi digitado. Em Remédios aparece
  // sempre; em Tudo, só quando nada em casa bate e a Anvisa conhece o nome.
  function wantMeds(localHits) {
    const q = savedQuery.trim();
    if (q.length < 3) return false;
    return savedArea === 'remedios' || (savedArea === 'tudo' && !localHits);
  }
  function medsHtml(localHits) {
    const q = savedQuery.trim();
    if (!wantMeds(localHits)) return '';
    const title = '<h2 class="list-title list-title-icon shelf-title">' + icon('pill') + 'Na lista da Anvisa</h2>';
    if (meds.q !== q) {
      clearTimeout(medTimer);
      medTimer = setTimeout(() => runMeds(q), 250);
      return savedArea === 'remedios' ? title + skeletonRows(2) : '';
    }
    if (meds.error) return savedArea === 'remedios' ? `${title}<p class="empty meds-hint">Sem internet para buscar na lista da Anvisa agora.</p>` : '';
    if (!meds.rows || !meds.rows.length) return savedArea === 'remedios' ? `${title}<p class="empty meds-hint">Nada na lista da Anvisa com “${esc(q)}”. Busque pelo princípio ativo, por exemplo “dipirona”.</p>` : '';
    return title + anvisaResultsHtml(meds.rows) + (meds.rows.length >= 40 ? '<p class="empty meds-hint">Mostrando os 40 primeiros. Digite a dose para achar o certo.</p>' : '');
  }
  async function runMeds(q) {
    const id = ++medId;
    let rows = null;
    let error = false;
    try { rows = await searchMeds(q); } catch { error = true; }
    if (!alive || id !== medId || savedQuery.trim() !== q) return;
    meds = { q, rows, error };
    render();
  }

  // Linha de baixo: pílulas de estado (estoque e validade) e, depois, marca e
  // tamanho em texto comum. Assim o estado não parece parte do nome.
  // Em remédio a validade aparece sempre, não só quando está perto.
  function rowMeta(p) {
    const exp = expiresSoon(p) || (isMed(p) && p.qty > 0 && nextExpiry.has(p.code)) ? nextExpiry.get(p.code) : '';
    let expPill = '';
    if (exp) {
      const n = daysUntil(exp);
      expPill = pill(n < 0 ? 'expired' : n <= SOON_DAYS ? 'soon' : 'watch', expiryText(exp));
    }
    const pills = stockPill(p) + expPill;
    return `<span class="row-meta">${pills}<span class="row-sub">${subtitle(p) || (pills ? '' : '&nbsp;')}</span></span>`;
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
      draftNote.innerHTML = `<span>Contagem em andamento, ${plural(n, 'produto contado', 'produtos contados')}.</span><a class="btn btn-quiet btn-sm" href="#/inventario">Continuar contagem</a>`;
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
      toast(`${delta < 0 ? '−1' : '+1'} ${product.name}. Agora tem ${product.qty}.${delta < 0 ? afterUseText(product) : ''}`, {
        mode: delta < 0 ? 'saida' : 'entrada',
        action: 'Desfazer',
        onAction: async () => {
          try {
            await undoMovement(movement.id);
            toast('Desfeito.', { duration: 2500 });
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
    const hit = e.target.closest('[data-ean]');
    if (hit) { openMed(hit.dataset.ean); return; }
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
    // A aba escolhida vem inteira para a vista (a fileira rola quando não cabe).
    btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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
      { label: 'Guardar 1', icon: 'plus', onSelect: () => minusOne(code, null, 1) },
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

  // Remédio da lista da Anvisa: os dados e "Guardar em casa" (a folha da Entrada).
  async function openMed(ean) {
    const chosen = await medSheet(ean);
    if (!chosen || !alive) return;
    const r = await showProductSheet({ mode: 'entrada', barcode: chosen });
    if (r && r.kind === 'entrada') toast(`${r.product.name} guardado. Agora tem ${r.product.qty}.`, { mode: 'entrada', duration: 3000 });
  }

  // Nota fiscal: ação da tela no canto de cima, como a Apple faz; abre o leitor
  // já no modo QR Code.
  $('[data-nota]', root).addEventListener('click', () => {
    try { sessionStorage.setItem('ki.qr', '1'); } catch { /* sem armazenamento */ }
    location.hash = '#/entrada';
  });

  const off = onChange(load);
  load();
  return () => { alive = false; clearTimeout(medTimer); off(); };
}
