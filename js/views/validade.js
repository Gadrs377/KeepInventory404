// Modo Validade: para marcar depois as datas do que já está no armário (chegou
// das compras, guardou tudo e deixou as validades para outra hora). Lê o código
// de barras, acha o produto e já abre a câmera da data. Em cima da câmera
// aparecem as datas que o produto já tem, para não marcar de novo a embalagem
// que já tinha data.

import { mountCamera } from './camera.js';
import { expirySheet, datesListHtml } from './expiryLots.js';
import { productsByBarcode, listProducts, listLots, getProduct, lotsFor, addLot, removeLot, onChange, discardStock } from '../store.js';
import { formatDate, todayIso, relativeDays } from '../dates.js';
import { addToShopList } from '../shop.js';
import { beep } from '../sound.js';
import { tel } from '../telemetry.js';
import { $, esc, icon, toast, hideToast, plural, openSheet, thumb, subtitle, vibrate } from '../ui.js';
import { morph } from '../morph.js';

export default function mountValidade(root) {
  // Marcadas nesta visita: code -> { product, dates: ['2026-10-15', ...] }
  const done = new Map();

  root.innerHTML = `
    <div class="screen screen-scan screen-validade has-floating-bar mode-validade">
      <header class="band band-slim count-band">
        <a class="icon-btn band-close" href="#/" aria-label="Fechar e voltar ao armário">${icon('close')}</a>
        <div class="band-center">
          <h1 class="band-name">Marcar validades</h1>
          <p class="band-count" data-marked></p>
        </div>
        <span class="band-end" aria-hidden="true"></span>
      </header>
      <main>
        <div class="cam-host"></div>
        <section class="receipt live-ticket" aria-label="Validades marcadas agora">
          <div class="paper">
            <p class="paper-head">Marcadas</p>
            <ul class="receipt-lines paper-lines"></ul>
            <p class="receipt-total paper-total"></p>
          </div>
        </section>
        <section class="val-shelf" aria-labelledby="val-shelf-title">
          <h2 class="list-title" id="val-shelf-title">No armário</h2>
          <p class="val-shelf-note"></p>
          <ul class="quick-list val-list"></ul>
        </section>
      </main>
      <footer class="floating-bar glass-regular glass-static scan-bar">
        <button type="button" class="btn btn-quiet btn-lg" data-type>${icon('keyboard')}Digitar</button>
        <button type="button" class="btn btn-mode btn-lg" data-finish>${icon('check')}Concluir</button>
      </footer>
    </div>`;

  const lines = $('.receipt-lines', root);
  const total = $('.receipt-total', root);
  const receipt = $('.receipt', root);
  const shelfList = $('.val-list', root);
  const shelfNote = $('.val-shelf-note', root);
  let shelf = [];

  // O que tem no armário e as datas já marcadas: os que têm unidade sem data
  // vêm primeiro. Tocar marca sem precisar ler o código.
  async function renderShelf() {
    const [products, lots] = await Promise.all([listProducts(), listLots()]);
    const byCode = new Map();
    for (const l of lots) { if (!byCode.has(l.code)) byCode.set(l.code, []); byCode.get(l.code).push(l); }
    shelf = products.filter((p) => p.qty > 0).map((p) => {
      const mine = byCode.get(p.code) || [];
      return { p, lots: mine, free: Math.max(0, p.qty - mine.reduce((a, l) => a + l.qty, 0)) };
    }).sort((a, b) => (b.free > 0) - (a.free > 0) || a.p.name.localeCompare(b.p.name, 'pt-BR'));
    const missing = shelf.filter((x) => x.free > 0);
    shelfNote.textContent = !shelf.length ? 'O armário está vazio.'
      : missing.length ? `${plural(missing.length, 'produto tem', 'produtos têm')} unidade sem data. Leia o código ou toque no produto.`
        : 'Todos os produtos já têm data.';
    morph(shelfList, shelf.map((x) => `
      <li data-key="v-${esc(x.p.code)}">
        <button type="button" class="quick-row val-row${x.free ? ' is-missing' : ''}" data-code="${esc(x.p.code)}">
          ${thumb(x.p)}
          <span class="row-main">
            <span class="row-name">${esc(x.p.name)}</span>
            <span class="val-dates">
              ${x.lots.map((l) => `<span class="val-date">${icon('calendar')}${esc(formatDate(l.expiresAt))}${l.qty > 1 ? ` ×${l.qty}` : ''}</span>`).join('')}
              ${x.free ? `<span class="val-free">${x.free === x.p.qty ? (x.free === 1 ? 'Sem data' : `${x.free} sem data`) : `${x.free} sem data`}</span>` : ''}
            </span>
          </span>
          ${icon('chevron', 'val-chev')}
        </button>
      </li>`).join(''));
  }
  shelfList.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-code]');
    if (!b) return;
    const x = shelf.find((y) => y.p.code === b.dataset.code);
    if (!x) return;
    cam.pause();
    try { await markProduct(x.p, ''); } finally { cam.resume(); }
  });
  const offChange = onChange(() => renderShelf());

  function render() {
    receipt.hidden = !done.size;
    if (!done.size) {
      morph(lines, '');
      total.hidden = true;
      return;
    }
    const entries = [...done.values()].reverse();
    morph(lines, entries.map((e) => `
      <li data-key="l-${esc(e.product.code)}">
        <a class="receipt-line paper-line" href="#/produto/${encodeURIComponent(e.product.code)}" aria-label="${esc(e.product.name)}, ${esc(e.dates.map(formatDate).join(', '))}">
          <span class="receipt-name paper-name">${esc(e.product.name)}</span>
          <span class="paper-dots" aria-hidden="true"></span>
          <span class="receipt-n paper-n">${esc(e.dates.map((d) => formatDate(d).slice(0, 5)).join(', '))}</span>
        </a>
      </li>`).join(''));
    total.hidden = false;
    const n = entries.reduce((a, e) => a + e.dates.length, 0);
    morph(total, `<span>${plural(entries.length, 'produto', 'produtos')}</span><span class="receipt-n paper-n">${plural(n, 'data', 'datas')}</span>`);
    $('[data-marked]', root).textContent = plural(n, 'marcada', 'marcadas');
  }

  // Aviso com uma ação (ir para a Entrada, abrir o produto) ou só Continuar.
  function notice({ title, text, html = '', product = null, action = null }) {
    return openSheet({
      mode: 'validade',
      label: title,
      render(body, close) {
        body.innerHTML = `
          ${product ? `<div class="product-head">${thumb(product, 'md')}<div class="product-meta"><p class="product-name">${esc(product.name)}</p>${subtitle(product) ? `<p class="product-sub">${subtitle(product)}</p>` : ''}</div></div>` : ''}
          <h2 class="sheet-title">${esc(title)}</h2>
          ${text ? `<p class="sheet-text">${text}</p>` : ''}
          ${html}
          <div class="sheet-actions">
            ${action ? `<button type="button" class="btn btn-mode" data-act>${esc(action.label)}</button>` : ''}
            <button type="button" class="btn ${action ? 'btn-quiet' : 'btn-mode'}" data-go>Ler o próximo</button>
          </div>`;
        if (action) $('[data-act]', body).addEventListener('click', () => { close(null); action.run(); });
        $('[data-go]', body).addEventListener('click', () => close(null));
      },
    });
  }

  // Vários produtos com o mesmo código, ou busca pelo nome (sem código).
  // `missing`: code -> unidades sem data (os que faltam vêm primeiro).
  function pickProduct(list, { search = false, missing = new Map() } = {}) {
    return openSheet({
      mode: 'validade',
      label: 'Qual produto?',
      title: search ? 'Procurar no armário' : 'Qual destes?',
      render(body, close) {
        body.innerHTML = `
          ${search ? `<div class="search" role="search">${icon('search')}<input type="search" placeholder="Nome do produto" aria-label="Nome do produto" autocomplete="off" enterkeyhint="search"></div>` : ''}
          <ul class="pick"></ul>`;
        const ul = $('.pick', body);
        const draw = (q = '') => {
          const words = q.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
          const hay = (p) => `${p.name} ${p.brand || ''}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');
          const shown = list.filter((p) => words.every((w) => hay(p).includes(w)))
            .sort((a, b) => ((missing.get(b.code) || 0) > 0) - ((missing.get(a.code) || 0) > 0)).slice(0, 30);
          ul.innerHTML = shown.length ? shown.map((p) => {
            const free = missing.get(p.code) || 0;
            return `
            <li><button type="button" class="pick-row" data-code="${esc(p.code)}">${thumb(p)}<span class="row-main"><span class="row-name">${esc(p.name)}</span><span class="row-sub">${free ? `<span class="val-free">${free === p.qty && free === 1 ? 'Sem data' : `${free} sem data`}</span>` : 'Todas com data'}</span></span></button></li>`;
          }).join('')
            : '<li class="sheet-text">Nada com esse nome no armário.</li>';
        };
        draw();
        const input = $('input', body);
        if (input) { input.addEventListener('input', () => draw(input.value)); setTimeout(() => input.focus(), 300); }
        ul.addEventListener('click', (e) => {
          const b = e.target.closest('[data-code]');
          if (b) close(list.find((p) => p.code === b.dataset.code) || null);
        });
      },
    });
  }

  async function markProduct(product, barcode, msCodigo = null) {
    const cur = (await getProduct(product.code)) || product;
    const lots = await lotsFor(cur.code);
    const dated = lots.reduce((a, l) => a + l.qty, 0);
    const free = cur.qty - dated;
    const log = { codigo: barcode, nome: cur.name, qtd: cur.qty, jaMarcadas: lots.map((l) => ({ data: l.expiresAt, qtd: l.qty })), livres: free, msCodigo };
    if (cur.qty <= 0) {
      beep('error');
      tel('validade-modo', { ...log, resultado: 'zerado' });
      await notice({
        title: 'Está zerado no armário',
        text: 'Para marcar a validade, guarde pela Entrada primeiro.',
        product: cur,
        action: { label: 'Guardar pela Entrada', run: () => { location.hash = `#/entrada/${encodeURIComponent(barcode)}`; } },
      });
      return;
    }
    if (free <= 0) {
      // Sem folha: quem está conferindo o armário vê as datas e lê o próximo.
      tel('validade-modo', { ...log, resultado: 'todas com data' });
      vibrate(15);
      const dates = lots.slice(0, 3).map((l) => `${formatDate(l.expiresAt)}${l.qty > 1 ? ` (${l.qty})` : ''}`).join(', ');
      toast(`${cur.name}: já tem data. ${dates}${lots.length > 3 ? ' e mais' : ''}.`, {
        mode: 'validade',
        duration: 5000,
        action: 'Abrir',
        onAction: () => { location.hash = `#/produto/${encodeURIComponent(cur.code)}`; },
      });
      return;
    }
    // O produto reconhecido fica no topo: quem leu o código errado vê na hora.
    const head = `
      <div class="product-head exp-product">
        ${thumb(cur, 'md')}
        <div class="product-meta">
          <p class="product-name">${esc(cur.name)}</p>
          <p class="product-sub">${free === cur.qty ? (cur.qty === 1 ? '1 unidade, sem data' : `${cur.qty} unidades, nenhuma com data`) : `${free} de ${cur.qty} sem data`}</p>
        </div>
      </div>`;
    const picked = await expirySheet({
      free,
      existing: lots.map((l) => ({ expiresAt: l.expiresAt, qty: l.qty })),
      mode: 'validade',
      label: `Validade de ${cur.name}`,
      doneClass: 'btn-mode',
      head,
    });
    if (!picked || !picked.length) {
      tel('validade-modo', { ...log, resultado: 'fechou' });
      return;
    }
    const ids = [];
    try {
      for (const l of picked) ids.push(await addLot(cur.code, l.qty, l.expiresAt));
    } catch (err) {
      toast(err.message, { duration: 4000 });
      tel('validade-modo', { ...log, resultado: 'erro', erro: err.message });
      return;
    }
    const entry = done.get(cur.code) || { product: cur, dates: [] };
    done.delete(cur.code);
    entry.product = cur;
    entry.dates.push(...picked.map((l) => l.expiresAt));
    done.set(cur.code, entry);
    render();
    vibrate(15);
    const units = picked.reduce((a, l) => a + l.qty, 0);
    tel('validade-modo', { ...log, resultado: 'marcou', datas: picked.map((l) => ({ data: l.expiresAt, qtd: l.qty })) });
    // Data que já passou: o app diz e oferece jogar fora ali mesmo.
    const today = todayIso();
    const expired = picked.map((l, i) => ({ ...l, id: ids[i] })).filter((l) => l.expiresAt < today);
    if (expired.length) {
      const n = expired.reduce((a, l) => a + l.qty, 0);
      const med = cur.area === 'remedios';
      toast(`${cur.name}: ${relativeDays(expired[0].expiresAt).toLowerCase()}.`, {
        mode: 'validade',
        duration: 8000,
        action: med ? 'Separar para descartar' : 'Jogar fora',
        onAction: async () => {
          try {
            for (const l of expired) await removeLot(l.id);
            await discardStock(cur.code, n);
            tel('validade-modo', { ...log, resultado: 'jogou fora', qtd: n });
            // Remédio vencido não vai no lixo comum: as farmácias recebem.
            toast(`${cur.name}: ${plural(n, 'saiu', 'saíram')} do armário.${med ? ' Leve a caixa a uma farmácia: elas recebem remédio vencido.' : ''}`, {
              mode: 'saida',
              duration: 6000,
              action: 'Adicionar às Compras',
              onAction: () => { addToShopList(cur.name); toast('Adicionado às Compras.', { duration: 2000 }); },
            });
          } catch (err) {
            toast(err.message, { duration: 4000 });
          }
        },
      });
      return;
    }
    toast(`${cur.name}: ${picked.map((l) => formatDate(l.expiresAt)).join(', ')} em ${plural(units, 'unidade', 'unidades')}.`, {
      mode: 'validade',
      duration: 5000,
      action: 'Desfazer',
      onAction: async () => {
        try {
          for (const id of ids) await removeLot(id);
          entry.dates.splice(entry.dates.length - picked.length, picked.length);
          if (!entry.dates.length) done.delete(cur.code);
          render();
          tel('validade-modo', { ...log, resultado: 'desfez', datas: picked.map((l) => ({ data: l.expiresAt, qtd: l.qty })) });
          toast('Desfeito.', { duration: 2500 });
        } catch (err) {
          toast(err.message, { duration: 4000 });
        }
      },
    });
  }

  async function handleCode(barcode, msCodigo = null) {
    // "Buscar pelo nome" do leitor: procura entre o que tem no armário.
    if (barcode.startsWith('SEM-')) {
      const list = (await listProducts()).filter((p) => p.qty > 0).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const p = await pickProduct(list, { search: true, missing: new Map(shelf.map((x) => [x.p.code, x.free])) });
      if (p) await markProduct(p, '');
      return;
    }
    const local = await productsByBarcode(barcode);
    if (!local.length) {
      beep('error');
      tel('validade-modo', { codigo: barcode, resultado: 'não está no armário', msCodigo });
      await notice({
        title: 'Esse produto não está no armário',
        text: 'Guarde pela Entrada; lá também dá para marcar a validade.',
        action: { label: 'Guardar pela Entrada', run: () => { location.hash = `#/entrada/${encodeURIComponent(barcode)}`; } },
      });
      return;
    }
    const product = local.length === 1 ? local[0] : await pickProduct(local);
    if (product) await markProduct(product, barcode, msCodigo);
  }

  $('[data-finish]', root).addEventListener('click', () => {
    cam.stop();
    hideToast();
    if (done.size) {
      const n = [...done.values()].reduce((a, e) => a + e.dates.length, 0);
      toast(`${plural(n, 'validade marcada', 'validades marcadas')} em ${plural(done.size, 'produto', 'produtos')}.`, { duration: 3000 });
    }
    location.hash = '#/';
  });

  render();
  renderShelf();
  // Telemetria: quanto tempo a câmera do código levou para ler, contando de
  // quando ela ficou pronta (ao abrir ou ao voltar de um produto).
  let readyAt = Date.now();
  const onCode = async (barcode) => {
    const msCodigo = Date.now() - readyAt;
    try { await handleCode(barcode, barcode.startsWith('SEM-') ? null : msCodigo); } finally { readyAt = Date.now(); }
  };
  const cam = mountCamera($('.cam-host', root), { onCode, altLabel: 'Procurar pelo nome', bar: true });
  $('[data-type]', root).addEventListener('click', () => cam.manual());
  cam.notice('Leia o código de barras do produto');
  return () => { cam.stop(); offChange(); };
}
