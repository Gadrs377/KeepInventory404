// Tela inicial: o que tem no armário e quanto, por ambiente da casa.
// No topo, uma ação só (Conferir) e o "Pede atenção", que filtra a lista no
// lugar. Cada linha tem um "−" que dá baixa de 1 na hora, com Desfazer.

import { listProducts, listLots, getCountDraft, isLow, onChange, addStock, removeStock, undoMovement, lastConferirAt } from '../store.js';
import { addToShopList } from '../shop.js';
import { AREAS, isMed } from '../areas.js';
import { searchMeds } from '../remedios.js';
import { scoreProduct, highlight } from '../search.js';
import { medSheet, anvisaResultsHtml } from './remedioInfo.js';
import { tel } from '../telemetry.js';
import { showProductSheet } from './productSheet.js';
import { daysUntil, expiryText, formatDate, SOON_DAYS, WATCH_DAYS } from '../dates.js';
import { editProduct, markExpiry, confirmDiscard, unitWord } from '../actions.js';
import { conferirMenu } from './conferirMenu.js';
import { $, esc, icon, plural, subtitle, tag, tagState, thumb, toast, vibrate, tabBar, openMenu, skeletonRows, glideTo, pill, stockPill, afterUseText, reducedMotion } from '../ui.js';

let savedFilter = 'todos';
let savedArea = 'tudo';
let savedQuery = '';
let firstShow = true; // a lista entra em cascata só na primeira vez que aparece

// Dias sem conferir antes de o lembrete entrar no "Pede atenção".
const CONFERIR_EVERY = 30;
const DAY = 86400000;

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

// Etiqueta de data, no lugar da quantidade, quando a lista mostra o que vence:
// "01/10" grande e "amanhã" embaixo.
function dateTag(iso) {
  const n = daysUntil(iso);
  const sub = n < -1 ? `há ${-n} dias` : n === -1 ? 'ontem' : n === 0 ? 'hoje' : n === 1 ? 'amanhã'
    : n < 7 ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(new Date(`${iso}T12:00`)).replace('-feira', '')
      : `em ${n} dias`;
  return `<span class="date-tag${n < 0 ? ' is-past' : n > SOON_DAYS ? ' is-later' : ''}"><span class="sr-only">Validade: </span><b>${formatDate(iso, false)}</b><em>${esc(sub)}</em></span>`;
}

export default function mountArmario(root, m = {}) {
  // Voltando de um produto (botão, gesto da borda ou fechar o leitor)?
  const returning = m.nav === 'pop' || m.nav === 'fade';
  root.innerHTML = `
    <div class="screen screen-home has-tabbar">
      <header class="home-head">
        <h1 class="page-title">Armário</h1>
        <div class="head-actions">
          <button type="button" class="head-pill" data-conferir aria-haspopup="menu" hidden>${icon('listChecks')}<span class="head-pill-label">Conferir</span></button>
        </div>
      </header>
      <div class="home-tools glass-thick" hidden>
        <div class="search" role="search">
          ${icon('search')}
          <input type="search" placeholder="Buscar no armário" aria-label="Buscar no armário" value="${esc(savedQuery)}"
            autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
          <button type="button" class="search-clear" aria-label="Limpar busca" ${savedQuery ? '' : 'hidden'}><span aria-hidden="true">${icon('close')}</span></button>
        </div>
        <div class="tabs" role="group" aria-label="Ambiente"></div>
      </div>
      <div class="draft-note" hidden></div>
      <div class="attn-strip" role="group" aria-label="Pede atenção" hidden></div>
      <p class="sr-only" role="status" data-found></p>
      <main class="shelf" aria-busy="true">${skeletonRows(5)}</main>
      ${tabBar('armario')}
    </div>`;

  const shelf = $('.shelf', root);
  const tools = $('.home-tools', root);
  const tabs = $('.tabs', root);
  const strip = $('.attn-strip', root);
  const search = $('input[type=search]', root);
  const clearBtn = $('.search-clear', root);
  const conferirBtn = $('[data-conferir]', root);
  const foundNote = $('[data-found]', root);
  let foundTimer = 0;
  const draftNote = $('.draft-note', root);
  let products = [];
  let lotsBy = new Map(); // code -> lotes, do que vence antes ao depois
  let lastConferir = 0;
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

  const nextExpiry = (p) => { const l = lotsBy.get(p.code); return l && l.length ? l[0].expiresAt : ''; };
  const expiresIn = (p) => { const e = nextExpiry(p); return e && p.qty > 0 ? daysUntil(e) : Infinity; };
  const withoutDate = (p) => p.qty - (lotsBy.get(p.code) || []).reduce((a, l) => a + l.qty, 0);

  // "Pede atenção": só o que existe, nesta ordem. Os dias sem conferir só
  // aparecem passado o intervalo, e tocar neles abre o Conferir.
  const ATTN = [
    { id: 'vencidos', icon: 'warning', test: (p) => expiresIn(p) < 0, label: (n, list) => (list.every(isMed) ? (n === 1 ? 'remédio vencido' : 'remédios vencidos') : n === 1 ? 'vencido' : 'vencidos'), title: (n) => plural(n, 'vencido', 'vencidos') },
    { id: 'semana', icon: 'calendar', test: (p) => expiresIn(p) >= 0 && expiresIn(p) <= SOON_DAYS, label: (n) => (n === 1 ? 'vence esta semana' : 'vencem esta semana'), title: (n) => `${n} ${n === 1 ? 'vence' : 'vencem'} esta semana` },
    { id: 'acabando', icon: 'hourglass', test: isLow, label: () => 'acabando', title: (n) => `${n} acabando` },
    { id: 'zerados', icon: 'dashed', test: (p) => p.qty === 0, label: (n) => (n === 1 ? 'zerado' : 'zerados'), title: (n) => plural(n, 'zerado', 'zerados') },
  ];
  const TABS = [{ id: 'tudo', short: 'Tudo' }, ...AREAS];

  function render() {
    const empty = !products.length;
    // Armário vazio: sem Conferir, sem busca, sem "Pede atenção" (não há o que mostrar).
    conferirBtn.hidden = empty;
    tools.hidden = empty;

    // Abas de ambiente só quando os produtos estão em mais de um lugar da casa.
    const usedAreas = new Set(products.map((p) => p.area || 'cozinha'));
    const showTabs = usedAreas.size > 1;
    if (!showTabs || (savedArea !== 'tudo' && !usedAreas.has(savedArea))) savedArea = 'tudo';
    tabs.hidden = !showTabs;
    tabs.innerHTML = showTabs ? TABS.filter((t) => t.id === 'tudo' || usedAreas.has(t.id)).map((t) => `
      <button type="button" class="tab" aria-pressed="${savedArea === t.id}" data-area="${t.id}">${t.short}</button>`).join('') : '';
    if (showTabs) glideTo(tabs, tabs.querySelector('[aria-pressed="true"]'), { line: true });
    search.placeholder = savedArea === 'remedios' ? 'Buscar em casa e na Anvisa' : 'Buscar no armário';
    search.setAttribute('aria-label', search.placeholder);

    const inArea = products.filter((p) => savedArea === 'tudo' || (p.area || 'cozinha') === savedArea);
    const q = savedQuery.trim();
    const scores = new Map();
    if (q) for (const p of products) { const n = scoreProduct(p, q); if (n) scores.set(p.code, n); }
    const inScope = q ? inArea.filter((p) => scores.has(p.code)) : inArea;

    // ---- Pede atenção ----
    const groups = ATTN.map((a) => ({ ...a, list: inScope.filter(a.test) })).filter((a) => a.list.length);
    if (savedFilter !== 'todos' && !groups.some((g) => g.id === savedFilter)) savedFilter = 'todos';
    const days = lastConferir ? Math.floor((Date.now() - lastConferir) / DAY) : 0;
    const oldest = products.reduce((a, p) => Math.min(a, p.createdAt || Date.now()), Date.now());
    const dueDays = lastConferir ? days : Math.floor((Date.now() - oldest) / DAY);
    const conferirDue = !empty && !q && dueDays >= CONFERIR_EVERY;
    // Buscando, o "Pede atenção" sai: a lista já diz quantos achou.
    strip.hidden = empty || !!q || (!groups.length && !conferirDue);
    // A cascata de entrada só na primeira vez que os blocos aparecem.
    strip.classList.toggle('is-first', !strip.dataset.shown && !strip.hidden);
    if (!strip.hidden) strip.dataset.shown = '1';
    strip.innerHTML = strip.hidden ? '' : `<div class="attn">${groups.map((g) => `
      <button type="button" class="att att-${g.id}${g.id === 'vencidos' && g.list.every(isMed) ? ' is-med' : ''}" aria-pressed="${savedFilter === g.id}" data-filter="${g.id}">
        <span class="att-i" aria-hidden="true">${icon(g.icon)}</span>
        <span class="att-n">${g.list.length}</span>
        <span class="att-l">${esc(g.label(g.list.length, g.list))}</span>
      </button>`).join('')}${conferirDue ? `
      <button type="button" class="att att-conferir" data-due>
        <span class="att-i" aria-hidden="true">${icon('listChecks')}</span>
        <span class="att-n">${dueDays}</span>
        <span class="att-l">dias sem conferir</span>
      </button>` : ''}</div>`;

    if (empty) {
      shelf.innerHTML = `
        <div class="empty-state empty-first">
          <span class="empty-icon" aria-hidden="true">${icon('package')}</span>
          <p class="empty-lead">Armário vazio</p>
          <p>Guarde o primeiro produto lendo o código de barras, ou a nota fiscal da última compra.</p>
          <a class="btn btn-primary btn-lg" href="#/entrada">${icon('barcode')}Ler um código</a>
          <button type="button" class="btn btn-quiet btn-lg" data-nota>${icon('qrCode')}Ler a nota fiscal</button>
        </div>`;
      shelf.removeAttribute('aria-busy');
      return;
    }

    const filter = groups.find((g) => g.id === savedFilter);
    const byDate = filter && (filter.id === 'vencidos' || filter.id === 'semana');
    const rank = (p) => (isLow(p) ? 0 : p.qty === 0 ? 1 : 2);
    // Buscando: o mais parecido com o que foi digitado vem primeiro (ver js/search.js).
    const byScore = (a, b) => scores.get(b.code) - scores.get(a.code) || a.name.localeCompare(b.name, 'pt-BR');
    const visible = (filter ? filter.list : inScope).slice()
      .sort(q ? byScore : byDate ? (a, b) => nextExpiry(a).localeCompare(nextExpiry(b)) : (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'pt-BR'));
    const outside = q ? scores.size - inScope.length : 0;
    // Em "Tudo", com mais de um ambiente, a lista vem separada por ambiente.
    const grouped = showTabs && savedArea === 'tudo' && !filter && !q;
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
          <li class="row-item${byDate ? ' has-acts' : ''}" data-code="${esc(p.code)}" data-qty="${p.qty}" style="--i:${Math.min(i, 12)}">
            <span class="swipe-bg" aria-hidden="true"><span class="swipe-act swipe-plus">${icon('plus')}1</span><span class="swipe-act swipe-minus">${icon('minus')}1</span></span>
            <div class="row-slide">
            <a class="row" draggable="false" href="#/produto/${encodeURIComponent(p.code)}">
              ${thumb(p)}
              <span class="row-main">
                <span class="row-name">${q ? highlight(p.name, q) : esc(p.name)}</span>
                ${rowMeta(p, byDate)}
              </span>
              ${byDate ? dateTag(nextExpiry(p)) : tag(p.qty, `${tagState(p)} ${moved(p)}`)}
            </a>
            ${byDate ? '' : p.qty > 0
              ? `<button type="button" class="row-minus" data-minus="${esc(p.code)}" aria-label="Tirar 1 de ${esc(p.name)}">${icon('minus')}</button>`
              : '<span class="row-minus-space" aria-hidden="true"></span>'}
            </div>
            ${byDate ? `
            <div class="row-acts">
              <button type="button" class="btn btn-quiet btn-sm" data-shop="${esc(p.code)}">${icon('cart')}Adicionar às Compras</button>
              <button type="button" class="btn btn-quiet btn-sm" data-discard="${esc(p.code)}">${icon('trash')}${isMed(p) ? 'Separar para descartar' : 'Jogar fora'}</button>
            </div>` : ''}
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
    // Filtro do "Pede atenção" ligado: o título diz o que é e "Mostrar tudo" volta.
    const head = filter
      ? `<div class="filter-head"><h2>${esc(filter.title(filter.list.length))}</h2><button type="button" class="link-btn" data-reset>Mostrar tudo</button></div>`
      : q && visible.length ? `<div class="filter-head is-search"><h2>${visible.length} no armário</h2></div>` : '';
    shelf.innerHTML = head + (visible.length
      ? listHtml + (outside ? `<div class="search-more"><p>Mais ${plural(outside, 'produto', 'produtos')} com “${esc(q)}” fora de ${esc(AREAS.find((a) => a.id === savedArea)?.short || '')}.</p><button type="button" class="btn btn-quiet btn-sm" data-widen>Mostrar</button></div>` : '')
      : q ? `
        <div class="empty-state empty-search">
          <span class="empty-icon" aria-hidden="true">${icon('search')}</span>
          <p class="empty-lead">${outside ? `Nada em ${esc(AREAS.find((a) => a.id === savedArea)?.short || '')} com “${esc(q)}”` : `Nada no armário com “${esc(q)}”`}</p>
          <p>${outside ? `Mas tem ${plural(outside, 'produto', 'produtos')} no resto do armário.` : 'Confira a escrita, ou guarde o produto lendo o código.'}</p>
          ${outside ? '<button type="button" class="btn btn-quiet btn-lg" data-widen>Buscar no armário todo</button>' : `
          <a class="btn btn-primary btn-lg" href="#/entrada">${icon('barcode')}Ler o código</a>
          <button type="button" class="btn btn-quiet btn-lg" data-shop-q>${icon('cart')}Adicionar às Compras</button>`}
        </div>`
        : `<div class="empty-filter"><p>Nada guardado em ${esc(AREAS.find((a) => a.id === savedArea)?.short || 'nenhum lugar')} ainda.</p></div>`)
      + medsHtml(visible.length);
    announce(q, visible.length);

    lastQty = new Map(products.map((p) => [p.code, p.qty]));
    shelf.removeAttribute('aria-busy');

    // Voltando do produto: a linha dele recebe os nomes para a página "encolher"
    // nela e fica marcada um instante, apagando devagar.
    let hero = '';
    try { hero = sessionStorage.getItem('ki.hero') || ''; sessionStorage.removeItem('ki.hero'); } catch { /* sem armazenamento */ }
    const heroLi = returning && hero && shelf.querySelector(`.row-item[data-code="${CSS.escape(hero)}"]`);
    if (heroLi) {
      markHero(heroLi);
      heroLi.classList.add('is-return');
      setTimeout(() => heroLi.classList.remove('is-return'), 450);
    }

    if (refocus) {
      const again = shelf.querySelector(`[data-minus="${CSS.escape(refocus)}"]`);
      (again || search).focus({ preventScroll: true });
      refocus = null;
    }
  }

  // Leitor de tela: quantos produtos a busca achou, depois de uma pausa.
  function announce(q, n) {
    clearTimeout(foundTimer);
    if (!q) { foundNote.textContent = ''; return; }
    foundTimer = setTimeout(() => { foundNote.textContent = n ? `${plural(n, 'produto encontrado', 'produtos encontrados')}.` : 'Nenhum produto encontrado.'; }, 700);
  }

  function setQuery(value) {
    savedQuery = value;
    search.value = value;
    clearBtn.hidden = !value;
    keepOrder = false;
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
    const title = '<div class="filter-head is-anvisa"><h2>Na lista da Anvisa</h2></div>';
    if (meds.q !== q) {
      clearTimeout(medTimer);
      medTimer = setTimeout(() => runMeds(q), 250);
      return savedArea === 'remedios' ? title + skeletonRows(2) : '';
    }
    if (meds.error) return savedArea === 'remedios' ? `${title}<p class="empty meds-hint">Sem internet para buscar na lista da Anvisa agora.</p>` : '';
    if (!meds.rows || !meds.rows.length) return savedArea === 'remedios' ? `${title}<p class="empty meds-hint">Nada na lista da Anvisa com “${esc(q)}”. Busque pelo princípio ativo, por exemplo “dipirona”.</p>` : '';
    return title.replace('</h2>', `</h2><span class="filter-count">${plural(meds.rows.length, 'apresentação', 'apresentações')}</span>`) + anvisaResultsHtml(meds.rows) + (meds.rows.length >= 40 ? '<p class="empty meds-hint">Mostrando as 40 primeiras. Digite a dose para achar a certa.</p>' : '');
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
  // tamanho em texto comum. Em remédio a validade aparece sempre.
  function rowMeta(p, byDate) {
    const exp = nextExpiry(p);
    let expPill = '';
    if (!byDate && exp && p.qty > 0 && (daysUntil(exp) <= WATCH_DAYS || isMed(p))) {
      const n = daysUntil(exp);
      expPill = pill(n < 0 ? 'expired' : n <= SOON_DAYS ? 'soon' : 'watch', n < 0 && isMed(p) ? 'Vencido' : expiryText(exp));
    }
    const pills = byDate ? '' : stockPill(p) + expPill;
    const sub = byDate ? `${unitWord(p, p.qty)} no armário` : subtitle(p);
    return `<span class="row-meta">${pills}<span class="row-sub">${sub || (pills ? '' : '&nbsp;')}</span></span>`;
  }

  async function load() {
    const [list, draft, lots, conf] = await Promise.all([listProducts(), getCountDraft(), listLots(), lastConferirAt()]);
    if (!alive) return;
    products = list;
    lastConferir = conf;
    lotsBy = new Map();
    for (const lot of lots) {
      if (!lotsBy.has(lot.code)) lotsBy.set(lot.code, []);
      lotsBy.get(lot.code).push(lot);
    }
    for (const l of lotsBy.values()) l.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    const n = draft ? Object.keys(draft.counts).length : 0;
    draftNote.hidden = !n;
    if (n) {
      draftNote.innerHTML = `<span>Conferir em andamento, ${plural(n, 'produto conferido', 'produtos conferidos')}.</span><a class="btn btn-quiet btn-sm" href="#/${draft.kind === 'tudo' ? 'conferir' : 'inventario'}">Continuar</a>`;
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
      return product;
    } catch (err) {
      if (btn) btn.disabled = false;
      toast(err.message, { duration: 3000 });
      return null;
    }
  }

  shelf.addEventListener('click', async (e) => {
    const minus = e.target.closest('[data-minus]');
    if (minus) {
      refocus = minus.dataset.minus;
      keepOrder = true;
      minusOne(minus.dataset.minus, minus);
      return;
    }
    const shop = e.target.closest('[data-shop]');
    if (shop) {
      const p = products.find((x) => x.code === shop.dataset.shop);
      if (p) toast(addToShopList(p.name) ? `${p.name} está nas Compras.` : `${p.name} já estava nas Compras.`, { duration: 2500 });
      return;
    }
    const discard = e.target.closest('[data-discard]');
    if (discard) {
      const p = products.find((x) => x.code === discard.dataset.discard);
      const lot = p && (lotsBy.get(p.code) || [])[0];
      if (p && lot) await confirmDiscard(p, lot);
      return;
    }
    if (e.target.closest('[data-shop-q]')) {
      const q = savedQuery.trim();
      if (q) toast(addToShopList(q) ? `${q} está nas Compras.` : `${q} já estava nas Compras.`, { duration: 2500 });
      return;
    }
    if (e.target.closest('[data-nota]')) { openNota(); return; }
    const hit = e.target.closest('[data-ean]');
    if (hit) { openMed(hit.dataset.ean); return; }
    if (e.target.closest('[data-widen]')) {
      savedFilter = 'todos'; savedArea = 'tudo';
      keepOrder = false;
      renderAnimated();
      return;
    }
    if (!e.target.closest('[data-reset]')) return;
    savedFilter = 'todos';
    keepOrder = false;
    renderAnimated();
  });
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-area]');
    if (!btn) return;
    savedArea = btn.dataset.area;
    keepOrder = false;
    btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    renderAnimated();
  });
  // "Pede atenção": tocar filtra no lugar (o bloco fica preto); de novo, volta.
  strip.addEventListener('click', (e) => {
    if (e.target.closest('[data-due]')) { conferirMenu(e.target.closest('[data-due]')); return; }
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    savedFilter = savedFilter === btn.dataset.filter ? 'todos' : btn.dataset.filter;
    keepOrder = false;
    vibrate(6);
    btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    renderAnimated();
  });
  conferirBtn.addEventListener('click', () => conferirMenu(conferirBtn));

  // Telemetria: o que foi buscado e não estava no armário (depois de parar de digitar).
  let searchTel = 0;
  search.addEventListener('input', () => {
    setQuery(search.value);
    render();
    clearTimeout(searchTel);
    searchTel = setTimeout(async () => {
      const q = savedQuery.trim();
      if (q.length < 2) return;
      const hits = (await listProducts()).filter((p) => scoreProduct(p, q)).length;
      if (!hits) tel('busca-armario', { q, area: savedArea });
    }, 1800);
  });
  // X: apaga e continua no campo, com o teclado aberto, para digitar outra coisa.
  clearBtn.addEventListener('click', () => {
    setQuery('');
    render();
    search.focus();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); if (search.value) { setQuery(''); render(); } else search.blur(); }
    if (e.key === 'Enter') { e.preventDefault(); search.blur(); }
  });
  $('.search', root).addEventListener('click', (e) => { if (!e.target.closest('button')) search.focus(); });

  // Arrastar a linha, como no Mail do iPhone: para a esquerda tira 1, para a
  // direita põe 1. Passando do ponto a ação "arma" (vibra e cresce); soltando,
  // acontece e a linha volta com mola. O "−" continua lá como alternativa.
  const ARM = 88;
  let swipe = null;
  shelf.addEventListener('pointerdown', (e) => {
    const slide = e.target.closest('.row-slide');
    if (!slide || e.button > 0 || e.target.closest('[data-minus]') || slide.parentElement.classList.contains('has-acts')) return;
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
      if (press) { clearTimeout(press.timer); press = null; }
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

  // Toque longo (ou botão direito): sobe o mesmo cartão do leitor, com −/+ e as
  // validades, e um menu curto embaixo. O fundo desfoca, como no iPhone.
  async function rowPeek(row) {
    const code = decodeURIComponent(row.getAttribute('href').split('/').pop());
    const p = products.find((x) => x.code === code);
    if (!p) return;
    vibrate(10);
    keepOrder = true;
    const { peekCard } = await import('./peek.js');
    peekCard(row.closest('.row-item'), p, lotsBy.get(code) || [], {
      onStep: (delta) => minusOne(code, null, delta),
      items: [
        { label: 'Adicionar às Compras', icon: 'cart', onSelect: () => toast(addToShopList(p.name) ? `${p.name} está nas Compras.` : `${p.name} já estava nas Compras.`, { duration: 2500 }) },
        ...(withoutDate(p) > 0 ? [{ label: 'Marcar validade', icon: 'calendar', onSelect: () => markExpiry(code, withoutDate(p)) }] : []),
        { label: 'Editar', icon: 'pencil', onSelect: () => editProduct(code) },
        { label: 'Ver produto', icon: 'chevron', onSelect: () => { location.hash = row.getAttribute('href'); } },
      ],
    });
  }
  let press = null;
  let suppressClick = false;
  shelf.addEventListener('pointerdown', (e) => {
    suppressClick = false;
    const row = e.target.closest('a.row');
    if (!row || e.pointerType === 'mouse') return;
    press = { row, x: e.clientX, y: e.clientY, timer: setTimeout(() => { suppressClick = true; press = null; rowPeek(row); }, 480) };
    row.classList.add('is-pressing');
  });
  const cancelPress = (e) => {
    if (!press) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 8) return;
    press.row.classList.remove('is-pressing');
    clearTimeout(press.timer);
    press = null;
  };
  ['pointermove', 'pointerup', 'pointercancel'].forEach((t) => shelf.addEventListener(t, cancelPress));
  shelf.addEventListener('pointerup', () => shelf.querySelectorAll('.is-pressing').forEach((r) => r.classList.remove('is-pressing')));
  shelf.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('a.row');
    if (!row) return;
    e.preventDefault();
    if (suppressClick) return; // o toque longo já abriu o cartão
    rowPeek(row);
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
    if (!document.startViewTransition || reducedMotion()) { render(); return; }
    const name = () => shelf.querySelectorAll('.row-item').forEach((li, i) => {
      if (i > 40) return;
      li.style.viewTransitionName = vtName(li.dataset.code);
      li.style.viewTransitionClass = 'row';
      li.dataset.vt = '';
    });
    name();
    // A faixa de busca e o "Pede atenção" ficam vivos durante a troca.
    tools.style.viewTransitionName = 'home-tools';
    tools.dataset.vt = '';
    strip.style.viewTransitionName = 'home-attn';
    strip.dataset.vt = '';
    const t = document.startViewTransition(() => { render(); name(); });
    t.ready.catch(() => {});
    t.finished.catch(() => {}).then(() => root.querySelectorAll('[data-vt]').forEach((el) => { el.style.viewTransitionName = ''; delete el.dataset.vt; }));
  }

  // Remédio da lista da Anvisa: os dados e "Guardar no armário" (a folha da Entrada).
  async function openMed(ean) {
    const chosen = await medSheet(ean);
    if (!chosen || !alive) return;
    const r = await showProductSheet({ mode: 'entrada', barcode: chosen });
    if (r && r.kind === 'entrada') toast(`${r.product.name} guardado. Agora tem ${r.product.qty}.`, { mode: 'entrada', duration: 3000 });
  }

  // Nota fiscal: abre o leitor já no modo QR Code.
  function openNota() {
    try { sessionStorage.setItem('ki.qr', '1'); } catch { /* sem armazenamento */ }
    location.hash = '#/entrada';
  }

  const off = onChange(load);
  load();
  return () => { alive = false; clearTimeout(medTimer); clearTimeout(foundTimer); off(); };
}
