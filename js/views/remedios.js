// Aba Remédios: os remédios da casa (com validade em destaque) e a busca na
// lista da Anvisa pelo nome, pelo princípio ativo ou pelo laboratório.
// Sem fotos: de remédio o app mostra só os dados oficiais.

import { listProducts, listLots, isLow, onChange, removeStock, undoMovement } from '../store.js';
import { isMed } from '../areas.js';
import { searchMeds, baseInfo } from '../remedios.js';
import { daysUntil, expiryText, formatDate, SOON_DAYS, WATCH_DAYS } from '../dates.js';
import { medSheet } from './remedioInfo.js';
import { showProductSheet } from './productSheet.js';
import { $, esc, icon, subtitle, tag, tagState, thumb, toast, vibrate, tabBar, skeletonRows, pill, stockPill, afterUseText } from '../ui.js';

let savedQuery = '';
let savedFilter = 'todos';

export default function mountRemedios(root) {
  root.innerHTML = `
    <div class="screen screen-home screen-meds has-tabbar">
      <header class="home-head">
        <h1 class="page-title">Remédios</h1>
      </header>
      <div class="home-tools glass-thick">
        <label class="search">
          ${icon('search')}
          <input type="search" placeholder="Nome ou princípio ativo" aria-label="Buscar remédio pelo nome ou princípio ativo" value="${esc(savedQuery)}" autocomplete="off" enterkeyhint="search">
        </label>
      </div>
      <div class="summary" role="group" aria-label="Mostrar só" hidden></div>
      <main class="shelf" aria-live="polite" aria-busy="true">${skeletonRows(3)}</main>
      <p class="meds-source" data-source></p>
      ${tabBar('remedios')}
    </div>`;

  const shelf = $('.shelf', root);
  const chips = $('.summary', root);
  const search = $('input[type=search]', root);
  const source = $('[data-source]', root);
  let meds = [];
  let nextExpiry = new Map();
  let alive = true;
  let found = null;   // resultados da Anvisa para a busca atual (null: não buscou)
  let searching = false;
  let searchError = false;
  let timer = 0;
  let searchId = 0;

  const expiry = (p) => (p.qty > 0 && nextExpiry.has(p.code) ? nextExpiry.get(p.code) : '');
  const FILTERS = [
    { id: 'vencidos', label: 'Vencidos', icon: 'warning', test: (p) => { const e = expiry(p); return !!e && daysUntil(e) < 0; } },
    { id: 'vencendo', label: 'Vencendo', icon: 'calendar', test: (p) => { const e = expiry(p); return !!e && daysUntil(e) >= 0 && daysUntil(e) <= WATCH_DAYS; } },
    { id: 'acabando', label: 'Acabando', icon: 'hourglass', test: (p) => isLow(p) || p.qty === 0 },
  ];

  function rowMeta(p) {
    const e = expiry(p);
    let expPill = '';
    // Em remédio a validade aparece sempre, não só quando está perto.
    if (e) {
      const n = daysUntil(e);
      expPill = pill(n < 0 ? 'expired' : n <= SOON_DAYS ? 'soon' : 'watch', expiryText(e));
    }
    const pills = stockPill(p) + expPill;
    return `<span class="row-meta">${pills}<span class="row-sub">${subtitle(p) || (pills ? '' : '&nbsp;')}</span></span>`;
  }

  const homeRow = (p) => `
    <li class="row-item" data-code="${esc(p.code)}">
      <div class="row-slide">
        <a class="row" href="#/produto/${encodeURIComponent(p.code)}">
          ${thumb(p)}
          <span class="row-main">
            <span class="row-name">${esc(p.name)}</span>
            ${rowMeta(p)}
          </span>
          ${tag(p.qty, tagState(p), 'Em casa')}
        </a>
        ${p.qty > 0
          ? `<button type="button" class="row-minus" data-minus="${esc(p.code)}" aria-label="Tirar 1 de ${esc(p.name)}">${icon('minus')}</button>`
          : '<span class="row-minus-space" aria-hidden="true"></span>'}
      </div>
    </li>`;

  // Resultados da Anvisa agrupados pelo remédio: o título diz o nome e o
  // princípio ativo, e cada linha é uma caixa (dose e quantidade), que é o
  // que distingue uma da outra.
  function anvisaGroups(rows) {
    const groups = new Map();
    for (const r of rows) {
      const k = fold(`${r.nome}|${r.substancia}`);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    return [...groups.values()].map((g) => {
      const r0 = g[0];
      const generic = fold(r0.substancia) === fold(r0.nome);
      return `
      <h3 class="found-title"><span class="found-name">${esc(r0.nome)}</span>${generic ? '' : `<span class="found-sub">${esc(r0.substancia)}</span>`}</h3>
      <ul class="rows meds-found">${g.map((r) => `
        <li>
          <button type="button" class="row" data-ean="${esc(r.ean)}">
            <span class="row-main">
              <span class="row-name">${esc(r.tamanho || 'Apresentação sem descrição')}</span>
              <span class="row-meta">${r.vendido ? '' : pill('watch', 'Sem venda recente')}<span class="row-sub">${esc(r.laboratorio)}</span></span>
            </span>
            ${icon('chevron', 'row-chevron')}
          </button>
        </li>`).join('')}
      </ul>`;
    }).join('');
  }

  // O que vence antes aparece primeiro; sem validade, pelo nome.
  const byExpiry = (a, b) => {
    const ea = expiry(a) || '9999';
    const eb = expiry(b) || '9999';
    return ea.localeCompare(eb) || a.name.localeCompare(b.name, 'pt-BR');
  };

  function render() {
    const q = savedQuery.trim();
    const counts = Object.fromEntries(FILTERS.map((f) => [f.id, meds.filter(f.test).length]));
    chips.hidden = !!q || !meds.length || (savedFilter === 'todos' && !counts.vencidos && !counts.vencendo && !counts.acabando);
    chips.innerHTML = FILTERS.map((f) => `
      <button type="button" class="tile tile-${f.id}${counts[f.id] ? '' : ' is-empty'}" aria-pressed="${savedFilter === f.id}" data-filter="${f.id}">
        <span class="tile-icon" aria-hidden="true">${icon(f.icon)}</span>
        <span class="tile-n">${counts[f.id]}</span>
        <span class="tile-label">${f.label}</span>
      </button>`).join('');

    let html = '';
    if (q) {
      const words = fold(q).split(/\s+/).filter(Boolean);
      const mine = meds.filter((p) => words.every((w) => fold(`${p.name} ${p.brand} ${p.med ? p.med.substancia : ''}`).includes(w))).sort(byExpiry);
      if (mine.length) html += `<h2 class="list-title shelf-title">Em casa<span class="title-count">${mine.length}</span></h2><ul class="rows">${mine.map(homeRow).join('')}</ul>`;
      html += '<h2 class="list-title shelf-title">Na lista da Anvisa</h2>';
      if (q.length < 3) html += '<p class="empty meds-hint">Digite pelo menos 3 letras para buscar na lista da Anvisa.</p>';
      else if (searchError) html += `<div class="empty-filter"><p>Sem internet para buscar na lista da Anvisa agora.</p><button type="button" class="btn btn-quiet btn-sm" data-retry>Tentar de novo</button></div>`;
      else if (searching && !found) html += skeletonRows(3);
      else if (found && found.length) html += `${anvisaGroups(found)}${found.length >= 40 ? '<p class="empty meds-hint">Mostrando os 40 primeiros. Digite mais para achar o certo, por exemplo a dose.</p>' : ''}`;
      else if (found) html += `<p class="empty meds-hint">Nada na lista da Anvisa com “${esc(q)}”. Confira a grafia ou busque pelo princípio ativo.</p>`;
    } else if (!meds.length) {
      html = `
        <div class="empty-state">
          <p class="empty-lead">Nenhum remédio em casa ainda</p>
          <p>Leia o código de barras da caixa. O app acha o remédio na lista da Anvisa e mostra princípio ativo, tarja e bula. Marque a validade para ser avisado antes de vencer.</p>
          <a class="btn btn-primary" href="#/entrada">${icon('barcode')}Abrir o leitor</a>
          <p class="field-note">Sem a caixa por perto? Busque pelo nome aqui em cima.</p>
        </div>`;
    } else {
      const filter = FILTERS.find((f) => f.id === savedFilter);
      const visible = meds.filter((p) => !filter || filter.test(p)).sort(byExpiry);
      html = visible.length
        ? `<ul class="rows">${visible.map(homeRow).join('')}</ul>`
        : `<div class="empty-filter"><p>Nenhum remédio ${filter.label.toLowerCase()} agora.</p><button type="button" class="btn btn-quiet btn-sm" data-reset>Mostrar todos</button></div>`;
    }
    shelf.innerHTML = html;
    shelf.removeAttribute('aria-busy');
  }

  async function runSearch() {
    const q = savedQuery.trim();
    const id = ++searchId;
    if (q.length < 3) { found = null; searching = false; searchError = false; render(); return; }
    searching = true;
    searchError = false;
    render();
    try {
      const rows = await searchMeds(q);
      if (!alive || id !== searchId) return;
      found = rows;
    } catch {
      if (!alive || id !== searchId) return;
      found = null;
      searchError = true;
    }
    searching = false;
    render();
  }

  async function load() {
    const [list, lots] = await Promise.all([listProducts(), listLots()]);
    if (!alive) return;
    meds = list.filter(isMed);
    nextExpiry = new Map();
    for (const lot of lots) if (!nextExpiry.has(lot.code)) nextExpiry.set(lot.code, lot.expiresAt);
    render();
  }

  search.addEventListener('input', () => {
    savedQuery = search.value;
    found = null;
    clearTimeout(timer);
    render();
    timer = setTimeout(runSearch, 250);
  });

  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    savedFilter = savedFilter === btn.dataset.filter ? 'todos' : btn.dataset.filter;
    render();
  });

  shelf.addEventListener('click', async (e) => {
    const minus = e.target.closest('[data-minus]');
    if (minus) {
      minus.disabled = true;
      try {
        const { product, movement } = await removeStock(minus.dataset.minus, 1);
        vibrate(15);
        toast(`−1 ${product.name}. Agora tem ${product.qty}.${afterUseText(product)}`, {
          mode: 'saida',
          action: 'Desfazer',
          onAction: async () => {
            try { await undoMovement(movement.id); toast('Desfeito.', { duration: 2500 }); } catch (err) { toast(err.message, { duration: 4000 }); }
          },
        });
      } catch (err) {
        minus.disabled = false;
        toast(err.message, { duration: 3000 });
      }
      return;
    }
    if (e.target.closest('[data-reset]')) { savedFilter = 'todos'; render(); return; }
    if (e.target.closest('[data-retry]')) { runSearch(); return; }
    const hit = e.target.closest('[data-ean]');
    if (!hit) return;
    const ean = await medSheet(hit.dataset.ean);
    if (!ean || !alive) return;
    // "Guardar em casa": a mesma folha da Entrada, já com o remédio achado.
    const r = await showProductSheet({ mode: 'entrada', barcode: ean });
    if (r && r.kind === 'entrada') toast(`${r.product.name} guardado. Agora tem ${r.product.qty}.`, { mode: 'entrada', duration: 3000 });
  });

  baseInfo().then((info) => {
    if (!alive || !info) return;
    source.innerHTML = `Dados da tabela CMED da Anvisa${info.data ? ` de ${esc(formatDate(info.data))}` : ''}, com ${Number(info.codigos).toLocaleString('pt-BR')} códigos de barras. Remédio aparece sem foto, só com os dados oficiais.`;
  }).catch(() => {});

  const off = onChange(load);
  load();
  if (savedQuery.trim().length >= 3) runSearch();
  return () => { alive = false; clearTimeout(timer); off(); };
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
