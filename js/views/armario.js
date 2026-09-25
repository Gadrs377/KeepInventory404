// Tela inicial: o que tem no armário e quanto.

import { listProducts, getCountDraft, isLow, onChange } from '../store.js';
import { $, esc, icon, plural, subtitle, tag, tagState, thumb } from '../ui.js';

let savedFilter = 'todos';
let savedQuery = '';

export default function mountArmario(root) {
  root.innerHTML = `
    <div class="screen screen-home">
      <header class="home-head">
        <div>
          <h1 class="page-title">Armário</h1>
          <p class="home-summary" data-summary>&nbsp;</p>
        </div>
        <div class="home-actions">
          <a class="btn btn-quiet btn-sm" href="#/inventario">${icon('count')}Contar</a>
          <a class="icon-btn" href="#/dados" aria-label="Dados e backup">${icon('menu')}</a>
        </div>
      </header>
      <div class="home-tools">
        <label class="search">
          ${icon('search')}
          <input type="search" placeholder="Buscar no armário" aria-label="Buscar no armário" value="${esc(savedQuery)}" autocomplete="off">
        </label>
        <div class="tabs" role="tablist" aria-label="Filtro"></div>
      </div>
      <div class="draft-note" hidden></div>
      <main class="shelf" aria-live="polite"></main>
      <nav class="modebar" aria-label="Registrar">
        <a class="mode-btn mode-entrada" href="#/entrada">${icon('in')}<span>Entrada</span></a>
        <a class="mode-btn mode-saida" href="#/saida">${icon('out')}<span>Saída</span></a>
      </nav>
    </div>`;

  const shelf = $('.shelf', root);
  const tabs = $('.tabs', root);
  const summary = $('[data-summary]', root);
  const search = $('input[type=search]', root);
  const draftNote = $('.draft-note', root);
  let products = [];
  let alive = true;

  const FILTERS = [
    { id: 'todos', label: 'Todos', test: () => true },
    { id: 'acabando', label: 'Acabando', test: isLow },
    { id: 'zerados', label: 'Zerados', test: (p) => p.qty === 0 },
  ];

  function render() {
    const low = products.filter(isLow).length;
    const zero = products.filter((p) => p.qty === 0).length;
    summary.textContent = products.length
      ? [plural(products.length, 'produto', 'produtos'), low && `${low} acabando`, zero && plural(zero, 'zerado', 'zerados')].filter(Boolean).join(', ')
      : 'Nada guardado ainda';

    const counts = { todos: products.length, acabando: low, zerados: zero };
    tabs.innerHTML = FILTERS.map((f) => `
      <button type="button" class="tab" role="tab" aria-selected="${savedFilter === f.id}" data-filter="${f.id}">
        ${f.label}${f.id !== 'todos' && counts[f.id] ? ` <span class="tab-n">${counts[f.id]}</span>` : ''}
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
    const visible = products
      .filter(filter.test)
      .filter((p) => !q || `${p.name} ${p.brand} ${p.code}`.toLocaleLowerCase('pt-BR').includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'pt-BR'));

    shelf.innerHTML = visible.length
      ? `<ul class="rows">${visible.map((p) => `
          <li>
            <a class="row" href="#/produto/${encodeURIComponent(p.code)}">
              ${thumb(p)}
              <span class="row-main">
                <span class="row-name">${esc(p.name)}</span>
                <span class="row-sub">${subtitle(p) || (isLow(p) ? 'Acabando' : '&nbsp;')}</span>
              </span>
              ${tag(p.qty, tagState(p))}
            </a>
          </li>`).join('')}</ul>`
      : `<p class="empty">${q ? `Nada no armário com "${esc(savedQuery.trim())}".` : 'Nenhum produto neste filtro.'}</p>`;
  }

  async function load() {
    const [list, draft] = await Promise.all([listProducts(), getCountDraft()]);
    if (!alive) return;
    products = list;
    const n = draft ? Object.keys(draft.counts).length : 0;
    draftNote.hidden = !n;
    if (n) {
      draftNote.innerHTML = `<span>Contagem em andamento, ${plural(n, 'produto contado', 'produtos contados')}.</span><a class="btn btn-quiet btn-sm" href="#/inventario">Continuar</a>`;
    }
    render();
  }

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    savedFilter = btn.dataset.filter;
    render();
  });
  search.addEventListener('input', () => {
    savedQuery = search.value;
    render();
  });

  const off = onChange(load);
  load();
  return () => { alive = false; off(); };
}
