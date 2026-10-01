// Página do produto (e do remédio, a mesma página): foto ou caixa no centro,
// nome, os três blocos Tirar 1 / número / Guardar 1, validades e histórico.
// O resto (nome, marca, onde fica, aviso) fica em Editar.

import { getProduct, updateProduct, movementsFor, lotsFor, onChange, undoMovement, addStock, removeStock, applyInfo } from '../store.js';
import { lookupRemote, identifyPhoto, checkDigitOk } from '../lookup.js';
import { photoToDataUrl, photoThumb, photoProduct } from '../photo.js';
import { medByEan, medInfo } from '../remedios.js';
import { medFacts, medBoxHtml, rxCardHtml, rxNeed, boxDataOf, fitMedBox } from './remedioInfo.js';
import { consumptionByProduct, rateText, daysLeft } from '../consumo.js';
import { formatDate, daysUntil, relativeDays, icsFor, SOON_DAYS } from '../dates.js';
import { contLeft, contDaysLeft, contStart, contEndText, CONT_WARN_DAYS } from '../continuo.js';
import { editProduct, fixQuantity, markExpiry, confirmDiscard, unitWord } from '../actions.js';
import { tiltable, boxEnter, blisterEnter, pop, sway } from '../motion.js';
import { $, esc, icon, subtitle, tag, tagState, thumb, toast, when, stockPill, openSheet, stepper, download, plural, afterUseText, vibrate, tabBar, photoPickRow } from '../ui.js';

const TYPE_LABEL = {
  entrada: (m) => `Guardou ${m.delta}`,
  saida: (m) => `Tirou ${Math.abs(m.delta)}`,
  descarte: (m) => `Jogou fora ${Math.abs(m.delta)}`,
  ajuste: (m) => `Ajustou para ${m.qtyAfter} (eram ${m.qtyBefore})`,
  contagem: (m) => `Contou ${m.qtyAfter} (eram ${m.qtyBefore})`,
};

const isMedProduct = (p) => !!(p.med || p.area === 'remedios');

export default async function mountProduto(root, { code }) {
  const p = await getProduct(code);
  if (!p) {
    root.innerHTML = `
      <div class="screen">
        <header class="topbar nav-bar"><a class="icon-btn glass-btn" href="#/" aria-label="Voltar">${icon('chevronLeft')}</a></header>
        <main class="content"><p class="empty">Esse produto não está mais no armário.</p>
        <a class="btn btn-primary" href="#/">Voltar ao armário</a></main>
      </div>`;
    return;
  }
  const [history, allMoves] = await Promise.all([movementsFor(code, 30), movementsFor(code, 1000)]);
  const rate = consumptionByProduct([p], allMoves).get(code);
  const perDay = rate && rate.used >= 2 ? rate.perDay : 0;
  const left = daysLeft(p, perDay);
  const med = isMedProduct(p);
  const home = { href: '#/', label: 'Voltar ao armário' };
  const trusted = p.source === 'loja' || ['off', 'obf', 'opf', 'anvisa', 'foto', 'comunidade'].includes(p.source);

  // Selo colado na caixa do remédio, como um adesivo; no produto, a pílula.
  const sticker = (prod) => (stockPill(prod) ? `<span class="mbox-sticker hero-pills">${stockPill(prod)}</span>` : '<span class="mbox-sticker hero-pills" hidden></span>');

  root.innerHTML = `
    <div class="screen screen-product has-tabbar${med ? ' is-med' : ''}">
      <header class="topbar nav-bar">
        <a class="icon-btn glass-btn" href="${home.href}" aria-label="${home.label}">${icon('chevronLeft')}</a>
        <span class="nav-title" aria-hidden="true">${esc(p.name)}</span>
        <button type="button" class="nav-text-btn" data-edit>Editar</button>
      </header>
      <main class="content">
        <section class="product-hero">
          ${med ? medBoxHtml(boxDataOf(p), { sticker: sticker(p) }) : thumb(p, 'lg')}
          <div class="product-meta">
            <h1 class="page-title${med ? ' sr-only-soft' : ''}">${esc(p.name)}</h1>
            ${subtitle(p) && !med ? `<p class="product-sub">${subtitle(p)}</p>` : ''}
            ${med ? '' : stockPill(p) ? `<p class="hero-pills">${stockPill(p)}</p>` : '<p class="hero-pills" hidden></p>'}
          </div>
        </section>

        <div data-alert></div>
        ${med ? '<div data-cont data-place="top"></div>' : ''}

        <div class="quick-actions">
          <button type="button" class="btn btn-quiet btn-stack" data-use="-1" ${p.qty ? '' : 'disabled'}>${icon('minus')}Tirar 1</button>
          <button type="button" class="hero-qty" data-edit-qty aria-label="Corrigir a quantidade">${tag(p.qty, `${tagState(p)} tag-lg`)}<span class="hero-qty-label">${med ? (p.qty === 1 ? 'caixa' : 'caixas') : 'no armário'}</span></button>
          <button type="button" class="btn btn-quiet btn-stack" data-use="1">${icon('plus')}Guardar 1</button>
        </div>

        ${p.med ? rxCardHtml(p.med) : ''}

        <div data-med-offer hidden></div>

        ${p.med ? `
        <section aria-labelledby="med-title">
          <h2 class="list-title" id="med-title">Sobre o remédio</h2>
          <div class="group-card">${medFacts(p.med)}</div>
        </section>` : ''}
        ${med ? '<div data-cont data-place="bottom"></div>' : ''}

        <section aria-labelledby="lots-title">
          <h2 class="list-title" id="lots-title">Validades</h2>
          <div data-lots></div>
        </section>

        ${perDay || (p.lastPrice && p.lastPrice.value) ? `
        <section aria-labelledby="use-title">
          <h2 class="list-title" id="use-title">Consumo</h2>
          <div class="group-card">
            ${perDay ? `<p class="sheet-text">Sai ${esc(rateText(perDay))}.${p.qty > 0 && left < 120 ? ` O que tem dura cerca de ${Math.max(1, Math.round(left))} dias.` : ''}</p>` : ''}
            ${p.lastPrice && p.lastPrice.value ? `<p class="sheet-text">Último preço ${esc(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.lastPrice.value))}${p.lastPrice.unit && p.lastPrice.unit !== 'UN' ? ` o ${esc(p.lastPrice.unit.toLowerCase())}` : ''}, ${esc(p.lastPrice.store || 'mercado')}, ${esc(new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(p.lastPrice.at)))}.</p>` : ''}
          </div>
        </section>` : ''}

        <section aria-labelledby="hist-title">
          <h2 class="list-title" id="hist-title">Histórico</h2>
          <div class="group-card">
          ${history.length ? `<ul class="history">${history.map((m) => `
            <li class="history-item type-${m.type}">
              <span class="history-type">${TYPE_LABEL[m.type] ? TYPE_LABEL[m.type](m) : esc(m.type)}</span>
              <span class="history-at">${when(m.at)}</span>
            </li>`).join('')}</ul>` : '<p class="sheet-text">Nenhum registro ainda.</p>'}
          </div>
        </section>
      </main>
      ${tabBar('armario')}
    </div>`;

  // Barra do topo como no iPhone: transparente sobre o topo da página; quando o
  // nome (ou a caixa) sai de vista, ganha vidro e o nome aparece pequeno no meio.
  const screenEl = $('.screen-product', root);
  const heroTitle = $('.product-hero .mbox', root) || $('.product-hero .page-title', root);
  const navIo = new IntersectionObserver(([e]) => screenEl.classList.toggle('is-scrolled', !e.isIntersecting && e.boundingClientRect.top < 60), { rootMargin: '-56px 0px 0px 0px' });
  navIo.observe(heroTitle);
  // A caixa do remédio entra girando e assenta; o selo cola; o dedo inclina a caixa.
  const box = $('.product-hero .mbox', root);
  let untilt = () => {};
  let unsway = () => {};
  if (box) {
    fitMedBox(root);
    if (!document.documentElement.dataset.nav) boxEnter(box);
    untilt = tiltable(box.querySelector('.mbox-3d'));
    // Rolando a página, a caixa fica um pouco para trás e, quando a página
    // para, balança para a frente e assenta (motion.js sway).
    unsway = sway(box.parentElement, { items: ':scope > .mbox', lean: 0, drop: 0.004, maxDrop: 8, pitch: 0.9 });
  }

  // Mostra a quantidade nova no meio e no botão Tirar 1.
  function showQty(product, dir = '') {
    $('.hero-qty .tag', root).outerHTML = tag(product.qty, `${tagState(product)} tag-lg ${dir}`);
    if (dir) pop($('.hero-qty .tag', root), { scale: dir === 'is-up' ? 1.12 : 0.9 });
    if (med) $('.hero-qty-label', root).textContent = product.qty === 1 ? 'caixa' : 'caixas';
    const pills = $('.hero-pills', root);
    if (pills) { pills.innerHTML = stockPill(product); pills.hidden = !stockPill(product); }
    $('[data-use="-1"]', root).disabled = product.qty === 0;
  }

  // Tirar 1 e Guardar 1 no topo: o que mais se faz na página do produto.
  $('.quick-actions', root).addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-use]');
    if (!btn || btn.disabled) return;
    const delta = Number(btn.dataset.use);
    try {
      const { product, movement } = delta < 0 ? await removeStock(code, 1) : await addStock(code, 1);
      vibrate(12);
      showQty(product, delta < 0 ? 'is-down' : 'is-up');
      toast(`${delta < 0 ? '−1' : '+1'}. Agora tem ${product.qty}.${delta < 0 ? afterUseText(product) : ''}`, {
        mode: delta < 0 ? 'saida' : 'entrada',
        action: 'Desfazer',
        onAction: async () => {
          try {
            showQty(await undoMovement(movement.id));
            toast('Desfeito.', { duration: 2500 });
          } catch (err) {
            toast(err.message, { duration: 4000 });
          }
        },
      });
    } catch (err) {
      toast(err.message, { duration: 3000 });
    }
  });

  // Editar: a mesma folha da home. "Nome estranho?" fica lá dentro, para quem
  // precisa, sem ocupar a página.
  async function openEdit() {
    const r = await editProduct(code, { fixName: !trusted });
    if (r === 'deleted') { location.hash = home.href; return; }
    if (r === 'fixname') {
      const cur = (await getProduct(code)) || p;
      if (await fixNameSheet(cur)) {
        toast('Nome corrigido.', { duration: 2500 });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      return;
    }
    if (r === 'saved') window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  $('[data-edit]', root).addEventListener('click', openEdit);
  $('[data-edit-qty]', root).addEventListener('click', async () => {
    const product = await fixQuantity(code);
    if (product) showQty(product);
  });

  // ---------- Vencido (remédio): o que pede ação vem primeiro ----------
  const alertHost = $('[data-alert]', root);
  function renderAlert(cur, lots) {
    const past = med ? lots.filter((l) => daysUntil(l.expiresAt) < 0) : [];
    if (!past.length) { alertHost.innerHTML = ''; return; }
    const l = past[0];
    alertHost.innerHTML = `
      <div class="act-card">
        <div class="act-head"><b>${esc(relativeDays(l.expiresAt))}</b><span>${formatDate(l.expiresAt)}, ${unitWord(cur, l.qty)}</span></div>
        <button type="button" class="btn btn-mode mode-saida btn-lg" data-discard-lot="${l.id}">${icon('trash')}Separar para descartar</button>
        <p class="act-note">Remédio vencido não vai no lixo comum. As farmácias recebem.</p>
      </div>`;
  }
  alertHost.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-discard-lot]');
    if (!b) return;
    const cur = await getProduct(code);
    const lot = lots.find((x) => String(x.id) === b.dataset.discardLot);
    if (cur && lot) await confirmDiscard(cur, lot);
  });

  // ---------- Uso contínuo (remédio) ----------
  // Ligado, o cartão com a cartela fica no alto (pede atenção); desligado, a
  // chave fica embaixo, depois da ficha, sem ocupar o topo do remédio eventual.
  const contTop = $('[data-cont][data-place="top"]', root);
  const contBottom = $('[data-cont][data-place="bottom"]', root);
  const contHost = contTop && { addEventListener: (t, f) => { contTop.addEventListener(t, f); contBottom.addEventListener(t, f); } };
  function renderCont(cur) {
    if (!contTop) return;
    const on = !!(cur.continuo && cur.cont);
    contTop.innerHTML = '';
    contBottom.innerHTML = '';
    if (!on) {
      contBottom.innerHTML = `
        <div class="cont-card is-off">
          <label class="cont-head"><span><b>Uso contínuo</b><em>Avisa antes de acabar e põe nas Compras.</em></span>
            <input type="checkbox" class="switch" data-cont-toggle role="switch" aria-label="Uso contínuo"></label>
        </div>`;
      return;
    }
    const total = Math.min(60, cur.cont.perBox);
    const leftN = Math.round(contLeft(cur));
    const shown = Math.min(total, leftN);
    const d = contDaysLeft(cur);
    contTop.innerHTML = `
      <div class="cont-card">
        <label class="cont-head"><span><b>Uso contínuo</b></span>
          <input type="checkbox" class="switch" data-cont-toggle role="switch" checked aria-label="Uso contínuo"></label>
        <div class="blister" style="--cols:${total > 30 ? 12 : 10}" role="img" aria-label="Cerca de ${leftN} comprimidos">
          ${Array.from({ length: total }, (_, i) => `<i class="${i < shown ? 'is-on' : ''}" style="--i:${i}"></i>`).join('')}
        </div>
        <div class="cont-row">
          <span><b>Cerca de ${plural(leftN, 'comprimido', 'comprimidos')}</b><em>${plural(cur.cont.perDay, 'por dia', 'por dia').replace(/^(\d+) /, '$1 ')}${Number.isFinite(d) ? `. Acaba por volta de ${contEndText(cur)}.` : '.'}</em></span>
          <button type="button" class="btn btn-quiet btn-sm" data-cont-count>Contar</button>
        </div>
        <div class="cont-perday"><span>Toma por dia</span><div class="stepper-host stepper-xs" data-perday></div></div>
        ${d <= CONT_WARN_DAYS ? `<p class="cont-note">${icon('cart')}Já está nas Compras${rxNeed(cur.med) ? ', com o aviso da receita' : ''}.</p>` : ''}
      </div>`;
    if (!contTop.dataset.shown) { contTop.dataset.shown = '1'; blisterEnter($('.blister', contTop)); }
    stepper($('[data-perday]', contTop), {
      value: cur.cont.perDay, min: 1, max: 12, label: 'Comprimidos por dia',
      onChange: async (v) => {
        if (v === cur.cont.perDay) return;
        const now = Date.now();
        const next = { ...cur.cont, n: contLeft(cur, now), at: now, perDay: v };
        await updateProduct(code, { cont: next });
      },
    });
  }
  if (contHost) {
    contHost.addEventListener('change', async (e) => {
      if (!e.target.matches('[data-cont-toggle]')) return;
      const cur = await getProduct(code);
      if (e.target.checked) await updateProduct(code, { continuo: true, cont: contStart(cur) });
      else await updateProduct(code, { continuo: false, cont: null });
      vibrate(8);
    });
    contHost.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-cont-count]')) return;
      const cur = await getProduct(code);
      const n = await countPills(cur);
      if (n === null) return;
      await updateProduct(code, { cont: { ...cur.cont, n, at: Date.now() } });
      toast(`Conta corrigida: ${plural(n, 'comprimido', 'comprimidos')}.`, { duration: 2500 });
    });
  }

  // ---------- Validades ----------
  const lotsHost = $('[data-lots]', root);
  let lots = [];

  async function renderLots() {
    const cur = await getProduct(code);
    lots = await lotsFor(code);
    if (!cur || !lotsHost.isConnected) return;
    showQty(cur);
    renderAlert(cur, lots);
    renderCont(cur);
    const dated = lots.reduce((a, l) => a + l.qty, 0);
    const free = cur.qty - dated;
    lotsHost.innerHTML = `
      <ul class="form-rows lot-rows">
        ${lots.map((l) => {
          const n = daysUntil(l.expiresAt);
          const state = n < 0 ? 'is-past' : n <= SOON_DAYS ? 'is-soon' : '';
          return `
          <li class="form-row is-static lot-row ${state}">
            <span class="form-row-label">
              <span class="exp-lot-date">${icon('calendar')}${formatDate(l.expiresAt)}</span>
              <span class="exp-lot-sub">${esc(relativeDays(l.expiresAt))}, ${unitWord(cur, l.qty)}</span>
            </span>
            <button type="button" class="icon-btn exp-lot-drop" data-remove-lot="${l.id}" aria-label="Apagar a validade ${formatDate(l.expiresAt)}">${icon('trash')}</button>
          </li>`;
        }).join('')}
        ${free > 0 ? `
          <li class="form-row is-static lot-row is-free">
            <span class="form-row-label"><span class="exp-lot-date">Sem data</span><span class="exp-lot-sub">${unitWord(cur, free)}</span></span>
            <button type="button" class="btn btn-quiet btn-sm lot-mark" data-add-lot>Marcar</button>
          </li>` : ''}
        ${!lots.length && !cur.qty ? '<li class="form-row is-static"><span class="form-row-label is-muted">Nada no armário agora.</span></li>' : ''}
        ${lots.length && !lots.every((l) => daysUntil(l.expiresAt) < 0) ? `<li><button type="button" class="form-row is-action" data-ics>${icon('calendar')}<span class="form-row-label">Lembrete no calendário</span>${icon('chevron', 'row-chevron')}</button></li>` : ''}
      </ul>
      ${lots.length && free > 0 ? `<p class="group-note">Ao tirar, ${free === 1 ? 'sai primeiro a unidade sem data' : `saem primeiro as ${free} sem data`}, depois a que vence antes.</p>`
        : lots.length > 1 ? '<p class="group-note">Ao tirar, sai primeiro o que vence antes.</p>' : ''}`;
  }

  lotsHost.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-remove-lot]');
    if (rm) {
      const { removeLot } = await import('../store.js');
      await removeLot(Number(rm.dataset.removeLot));
      toast('Validade apagada. As unidades continuam no armário.', { duration: 3000 });
      return;
    }
    if (e.target.closest('[data-ics]')) {
      download(`validade-${p.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.ics`,
        icsFor(lots.map((l) => ({ name: p.name, qty: l.qty, expiresAt: l.expiresAt, uid: `${code}-${l.id}` }))), 'text/calendar');
      toast('Abra o arquivo baixado para pôr no calendário. O lembrete toca 3 dias antes.', { duration: 5000 });
      return;
    }
    if (e.target.closest('[data-add-lot]')) {
      const cur = await getProduct(code);
      const free = cur.qty - lots.reduce((a, l) => a + l.qty, 0);
      try { await markExpiry(code, free); } catch (err) { toast(err.message, { duration: 4000 }); }
    }
  });

  const offLots = onChange(() => renderLots());
  const off = () => { offLots(); navIo.disconnect(); untilt(); unsway(); };
  renderLots();

  // Produto cadastrado antes dos remédios (ou pelas lojas) cujo código está na
  // lista da Anvisa: oferece trocar pelos dados oficiais e passar para Remédios.
  const barcodes = Array.isArray(p.barcodes) ? p.barcodes : [];
  if (!p.med && barcodes.length) {
    Promise.all(barcodes.map((b) => medByEan(b).catch(() => null))).then((found) => {
      const i = found.findIndex(Boolean);
      const offer = $('[data-med-offer]', root);
      if (i < 0 || !offer || !offer.isConnected) return;
      offer.hidden = false;
      offer.className = 'med-offer';
      offer.innerHTML = `
        <p class="sheet-text">${icon('pill')}Este código é de um remédio da lista da Anvisa: ${esc(found[i].nome)}, ${esc(found[i].tamanho)}.</p>
        <button type="button" class="btn btn-quiet btn-sm" data-use-med>Usar os dados da Anvisa</button>
        <p class="field-note">O produto passa para Remédios, com princípio ativo, tarja e bula, e fica sem foto.</p>`;
      $('[data-use-med]', offer).addEventListener('click', async () => {
        try {
          await applyInfo(code, medInfo(found[i]));
          toast('Agora está em Remédios, com os dados da Anvisa.', { duration: 3000 });
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (err) {
          toast(err.message, { duration: 3000 });
        }
      });
    });
  }

  return off;
}

// "Contar" do uso contínuo: quantos comprimidos tem agora.
function countPills(p) {
  return openSheet({
    label: 'Contar os comprimidos',
    title: 'Quantos comprimidos tem?',
    render(body, close) {
      body.innerHTML = `
        <form class="stack" novalidate>
          <p class="sheet-text">${esc(p.name)}: some todas as caixas abertas.</p>
          <div class="stepper-host stepper-lg" data-n></div>
          <div class="sheet-sticky"><button type="submit" class="btn btn-primary btn-lg">${icon('check')}Salvar</button></div>
        </form>`;
      const step = stepper($('[data-n]', body), { value: Math.round(contLeft(p) || 0), min: 0, max: 9999, label: 'Comprimidos' });
      setTimeout(() => $('.stepper-value', body)?.focus({ preventScroll: true }), 380);
      $('form', body).addEventListener('submit', (e) => { e.preventDefault(); close(step.value); });
    },
  });
}

// Corrigir um nome esquisito: busca o nome certo nas lojas pelo código de
// barras que o produto já tem, lendo o código com a câmera ou pela foto da
// embalagem (IA). Tocar numa sugestão troca nome, marca, tamanho e foto.
function fixNameSheet(p) {
  let cam = null;
  let scanned = '';
  const sheet = openSheet({
    title: 'Buscar o nome certo',
    label: 'Buscar o nome certo',
    render(body, close) {
      const saved = (p.barcodes || [])[0] || '';
      body.innerHTML = `
        <p class="sheet-text">Agora: <strong>${esc(p.name)}</strong></p>
        <div class="fix-tools">
          <button type="button" class="btn btn-quiet btn-sm" data-scan>${icon('barcode')}Ler o código</button>
          <label class="btn btn-quiet btn-sm file-btn" data-photo-btn>${icon('camera')}<span>Fotografar a embalagem</span>
            <input type="file" accept="image/*" capture="environment" class="sr-only" data-photo></label>
        </div>
        <div class="fix-cam" hidden></div>
        <p class="loading-note" aria-live="polite"><span class="spinner" aria-hidden="true" hidden></span><span data-status></span></p>
        <ul class="pick suggest" hidden></ul>`;
      const status = $('[data-status]', body);
      const spinner = $('.spinner', body);
      const list = $('.suggest', body);
      const camHost = $('.fix-cam', body);
      let items = [];
      let fromPhoto = null; // o que a foto leu, para o fim da lista
      const busy = (text) => { spinner.hidden = false; status.textContent = text; list.hidden = true; };
      const done = (text) => { spinner.hidden = true; status.textContent = text; };
      const show = (found, from) => {
        items = found.filter((x) => x && x.name);
        list.innerHTML = items.map((x, i) => `
          <li><button type="button" class="pick-row suggest-row" data-i="${i}">
            ${thumb(x)}
            <span class="row-main"><span class="row-name">${esc(x.name)}</span><span class="row-sub">${subtitle(x) || '&nbsp;'}</span></span>
          </button></li>`).join('') + (fromPhoto ? photoPickRow(fromPhoto, !items.length) : '');
        list.hidden = !items.length && !fromPhoto;
        done(items.length ? `${plural(items.length, 'sugestão', 'sugestões')} ${from}.`
          : fromPhoto ? 'As lojas não têm esse produto. Dá para usar o que está na embalagem.'
            : `Nada encontrado ${from}. Leia o código ou fotografe a embalagem.`);
      };
      async function byCode(code) {
        busy(`Procurando o código ${code} nas lojas`);
        const r = await lookupRemote(code);
        if (!body.isConnected) return;
        if (r.status === 'found') show([r.info], 'pelo código');
        else done(r.status === 'offline' ? 'Sem internet para buscar agora.' : 'As lojas não conhecem esse código. Fotografe a embalagem.');
      }
      if (saved) byCode(saved);
      else done('Leia o código da embalagem ou fotografe.');

      $('[data-scan]', body).addEventListener('click', async () => {
        camHost.hidden = false;
        if (cam) return;
        const { mountCamera } = await import('./camera.js');
        cam = mountCamera(camHost, {
          compact: true,
          onCode: async (code) => {
            if (!checkDigitOk(code)) return;
            scanned = code;
            cam.stop(); cam = null;
            camHost.hidden = true;
            await byCode(code);
          },
        });
      });
      $('[data-photo]', body).addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        busy('Lendo a embalagem. Leva uns 5 segundos.');
        try {
          const [read, mini] = await Promise.all([identifyPhoto(await photoToDataUrl(file)), photoThumb(file).catch(() => '')]);
          if (!body.isConnected) return;
          fromPhoto = photoProduct(read, p.med || p.area === 'remedios' ? '' : mini);
          if (read.results.length || fromPhoto) show(read.results, 'pela foto');
          else done('Não deu para ler a embalagem. Tente outra foto, mais de perto e com luz.');
        } catch {
          if (body.isConnected) done('Não deu para enviar a foto agora. Confira a internet e tente de novo.');
        }
      });
      list.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-i], [data-photo-use]');
        if (!btn) return;
        try {
          await applyInfo(p.code, btn.dataset.photoUse !== undefined ? fromPhoto : items[Number(btn.dataset.i)], scanned);
          close(true);
        } catch (err) {
          done(err.message);
        }
      });
    },
  });
  return sheet.finally(() => { if (cam) cam.stop(); });
}
