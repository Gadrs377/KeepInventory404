// Modo Validade: para marcar depois as datas do que já está no armário (chegou
// das compras, guardou tudo e deixou as validades para outra hora). Lê o código
// de barras, acha o produto e já abre a câmera da data. Em cima da câmera
// aparecem as datas que o produto já tem, para não marcar de novo a embalagem
// que já tinha data.

import { mountCamera } from './camera.js';
import { expirySheet } from './expiryLots.js';
import { productsByBarcode, listProducts, getProduct, lotsFor, addLot } from '../store.js';
import { formatDate } from '../dates.js';
import { beep } from '../sound.js';
import { tel } from '../telemetry.js';
import { $, esc, icon, toast, hideToast, plural, openSheet, thumb, subtitle, vibrate } from '../ui.js';

export default function mountValidade(root) {
  // Marcadas nesta visita: code -> { product, dates: ['2026-10-15', ...] }
  const done = new Map();

  root.innerHTML = `
    <div class="screen screen-scan screen-validade has-floating-bar mode-validade">
      <header class="band band-slim">
        <a class="icon-btn" href="#/" aria-label="Fechar e voltar ao armário">${icon('close')}</a>
        <h1 class="band-title">${icon('calendar')}Validade</h1>
      </header>
      <main>
        <div class="cam-host"></div>
        <section class="receipt" aria-label="Validades marcadas agora">
          <ul class="receipt-lines"></ul>
          <p class="receipt-total"></p>
        </section>
      </main>
      <footer class="floating-bar glass-regular glass-static">
        <button type="button" class="btn btn-primary btn-lg" data-finish>${icon('check')}Concluir</button>
      </footer>
    </div>`;

  const lines = $('.receipt-lines', root);
  const total = $('.receipt-total', root);

  function render() {
    if (!done.size) {
      lines.innerHTML = '<li class="receipt-empty">Leia o código de um produto do armário para marcar a validade.</li>';
      total.hidden = true;
      return;
    }
    const entries = [...done.values()].reverse();
    lines.innerHTML = entries.map((e) => `
      <li>
        <a class="receipt-line" href="#/produto/${encodeURIComponent(e.product.code)}" aria-label="${esc(e.product.name)}, ${esc(e.dates.map(formatDate).join(', '))}">
          <span class="receipt-name">${esc(e.product.name)}</span>
          <span class="receipt-dots" aria-hidden="true"></span>
          <span class="receipt-n">${esc(e.dates.map((d) => formatDate(d).slice(0, 5)).join(', '))}</span>
        </a>
      </li>`).join('');
    total.hidden = false;
    const n = entries.reduce((a, e) => a + e.dates.length, 0);
    total.innerHTML = `<span>${plural(entries.length, 'produto', 'produtos')}</span><span class="receipt-n">${plural(n, 'data', 'datas')}</span>`;
  }

  // Aviso com uma ação (ir para a Entrada, abrir o produto) ou só Continuar.
  function notice({ title, text, product = null, action = null }) {
    return openSheet({
      mode: 'validade',
      label: title,
      render(body, close) {
        body.innerHTML = `
          ${product ? `<div class="product-head">${thumb(product, 'md')}<div class="product-meta"><p class="product-name">${esc(product.name)}</p>${subtitle(product) ? `<p class="product-sub">${subtitle(product)}</p>` : ''}</div></div>` : ''}
          <h2 class="sheet-title">${esc(title)}</h2>
          ${text ? `<p class="sheet-text">${text}</p>` : ''}
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
  function pickProduct(list, { search = false } = {}) {
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
          const shown = list.filter((p) => words.every((w) => hay(p).includes(w))).slice(0, 30);
          ul.innerHTML = shown.length ? shown.map((p) => `
            <li><button type="button" class="pick-row" data-code="${esc(p.code)}">${thumb(p)}<span class="row-main"><span class="row-name">${esc(p.name)}</span><span class="row-sub">Tem ${p.qty}</span></span></button></li>`).join('')
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

  async function markProduct(product, barcode) {
    const cur = (await getProduct(product.code)) || product;
    const lots = await lotsFor(cur.code);
    const dated = lots.reduce((a, l) => a + l.qty, 0);
    const free = cur.qty - dated;
    const log = { codigo: barcode, nome: cur.name, qtd: cur.qty, jaMarcadas: lots.map((l) => ({ data: l.expiresAt, qtd: l.qty })), livres: free };
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
      tel('validade-modo', { ...log, resultado: 'todas com data' });
      await notice({
        title: `Todas as ${plural(cur.qty, 'unidade', 'unidades')} já têm data`,
        text: esc(lots.map((l) => `${formatDate(l.expiresAt)} (${plural(l.qty, 'unidade', 'unidades')})`).join(', ')) + '. Se alguma está errada, corrija na página do produto.',
        product: cur,
        action: { label: 'Abrir o produto', run: () => { location.hash = `#/produto/${encodeURIComponent(cur.code)}`; } },
      });
      return;
    }
    const picked = await expirySheet({
      free,
      existing: lots.map((l) => ({ expiresAt: l.expiresAt, qty: l.qty })),
      mode: 'validade',
      label: `Validade de ${cur.name}`,
      doneClass: 'btn-mode',
    });
    if (!picked || !picked.length) {
      tel('validade-modo', { ...log, resultado: 'fechou' });
      return;
    }
    try {
      for (const l of picked) await addLot(cur.code, l.qty, l.expiresAt);
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
    toast(`${cur.name}: ${picked.map((l) => formatDate(l.expiresAt)).join(', ')} em ${plural(units, 'unidade', 'unidades')}.`, { mode: 'validade', duration: 3000 });
  }

  async function handleCode(barcode) {
    // "Buscar pelo nome" do leitor: procura entre o que tem no armário.
    if (barcode.startsWith('SEM-')) {
      const list = (await listProducts()).filter((p) => p.qty > 0).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const p = await pickProduct(list, { search: true });
      if (p) await markProduct(p, '');
      return;
    }
    const local = await productsByBarcode(barcode);
    if (!local.length) {
      beep('error');
      tel('validade-modo', { codigo: barcode, resultado: 'não está no armário' });
      await notice({
        title: 'Esse produto não está no armário',
        text: 'Guarde pela Entrada; lá também dá para marcar a validade.',
        action: { label: 'Guardar pela Entrada', run: () => { location.hash = `#/entrada/${encodeURIComponent(barcode)}`; } },
      });
      return;
    }
    const product = local.length === 1 ? local[0] : await pickProduct(local);
    if (product) await markProduct(product, barcode);
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
  const cam = mountCamera($('.cam-host', root), { onCode: handleCode, altLabel: 'Procurar pelo nome' });
  cam.notice('Leia o código de barras do produto');
  return () => cam.stop();
}
