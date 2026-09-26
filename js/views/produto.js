// Página do produto: dados, validades, consumo, ajuste manual e histórico.

import { getProduct, updateProduct, setStock, movementsFor, deleteProduct, lotsFor, addLot, removeLot, onChange, undoMovement, addStock, removeStock, applyInfo } from '../store.js';
import { lookupRemote, identifyPhoto, checkDigitOk } from '../lookup.js';
import { photoToDataUrl } from '../photo.js';
import { AREAS, isMed } from '../areas.js';
import { medByEan, medInfo } from '../remedios.js';
import { medFacts } from './remedioInfo.js';
import { consumptionByProduct, rateText, daysLeft } from '../consumo.js';
import { parseExpiry, maskExpiry, formatDate, daysUntil, icsFor, SOON_DAYS } from '../dates.js';
import { $, esc, icon, stepper, subtitle, tag, tagState, thumb, toast, when, confirmSheet, stockPill, openSheet, download, plural, afterUseText, vibrate } from '../ui.js';

const TYPE_LABEL = {
  entrada: (m) => `Entrada de ${m.delta}`,
  saida: (m) => `Saída de ${Math.abs(m.delta)}`,
  ajuste: (m) => `Ajuste ${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)}`,
  contagem: (m) => `Contagem ${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)}`,
};

export default async function mountProduto(root, { code }) {
  const p = await getProduct(code);
  if (!p) {
    root.innerHTML = `
      <div class="screen">
        <header class="topbar nav-bar"><a class="icon-btn glass-btn" href="#/" aria-label="Voltar">${icon('chevronLeft')}</a></header>
        <main class="content"><p class="empty">Esse produto não está mais no armário. Ele pode ter sido removido.</p>
        <a class="btn btn-primary" href="#/">Voltar ao armário</a></main>
      </div>`;
    return;
  }
  const [history, allMoves] = await Promise.all([movementsFor(code, 30), movementsFor(code, 1000)]);
  const rate = consumptionByProduct([p], allMoves).get(code);
  const perDay = rate && rate.used >= 2 ? rate.perDay : 0;
  const left = daysLeft(p, perDay);
  const usage = perDay
    ? `Vocês usam ${rateText(perDay)}.${p.qty > 0 && left < 120 ? ` O que tem dura cerca de ${Math.max(1, Math.round(left))} dias.` : ''}`
    : 'Aparece depois de algumas saídas.';
  const barcodes = Array.isArray(p.barcodes) ? p.barcodes : [];
  const niceCode = barcodes.length ? `Código ${barcodes.join(', ')}` : 'Produto sem código';
  // Remédio volta para a aba Remédios; o resto, para o Armário.
  const home = isMed(p) ? { href: '#/remedios', label: 'Voltar aos remédios' } : { href: '#/', label: 'Voltar ao armário' };

  root.innerHTML = `
    <div class="screen screen-product">
      <header class="topbar nav-bar">
        <a class="icon-btn glass-btn" href="${home.href}" aria-label="${home.label}">${icon('chevronLeft')}</a>
        <span class="nav-title" aria-hidden="true">${esc(p.name)}</span>
        <button type="button" class="icon-btn glass-btn" data-edit aria-label="Editar detalhes">${icon('pencil')}</button>
      </header>
      <main class="content">
        <section class="product-hero">
          ${thumb(p, 'lg')}
          <div class="product-meta">
            <h1 class="page-title">${esc(p.name)}</h1>
            <p class="product-sub">${subtitle(p) || '&nbsp;'}</p>
            <p class="product-code">${esc(niceCode)}</p>
            ${stockPill(p) ? `<p class="hero-pills">${stockPill(p)}</p>` : ''}
            ${p.source === 'loja' || p.source === 'off' || p.source === 'anvisa' ? '' : '<button type="button" class="link-sm" data-fixname>Nome estranho? Buscar o nome certo</button>'}
          </div>
          ${tag(p.qty, `${tagState(p)} tag-lg`)}
        </section>

        <div class="quick-actions">
          <button type="button" class="btn btn-quiet" data-use="-1" ${p.qty ? '' : 'disabled'}>${icon('minus')}Tirar 1</button>
          <button type="button" class="btn btn-quiet" data-use="1">${icon('plus')}Guardar 1</button>
        </div>

        <div data-med-offer hidden></div>

        ${p.med ? `
        <section aria-labelledby="med-title">
          <h2 class="list-title" id="med-title">Sobre o remédio</h2>
          ${medFacts(p.med)}
        </section>` : ''}

        <section aria-labelledby="lots-title">
          <h2 class="list-title" id="lots-title">Validade</h2>
          <div data-lots></div>
        </section>

        <section>
          <h2 class="list-title">Consumo</h2>
          <p class="sheet-text">${esc(usage)}</p>
          ${p.lastPrice && p.lastPrice.value ? `<p class="sheet-text">Último preço ${esc(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.lastPrice.value))}${p.lastPrice.unit && p.lastPrice.unit !== 'UN' ? ` o ${esc(p.lastPrice.unit.toLowerCase())}` : ''}, ${esc(p.lastPrice.store || 'mercado')}, ${esc(new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(p.lastPrice.at)))}.</p>` : ''}
          <p class="field-note">${p.minQty > 0 ? `Aparece como acabando com ${p.minQty} ou menos.` : 'Sem aviso de acabando.'}</p>
        </section>

        <section class="stock-fix" aria-labelledby="stock-title">
          <h2 class="list-title" id="stock-title">Corrigir a quantidade</h2>
          <div class="stock-fix-row">
            <div class="stepper-host stepper-sm" data-qty></div>
            <button type="button" class="btn btn-quiet" data-fix hidden>${icon('check')}<span></span></button>
          </div>
          <p class="field-note">Para quando o número do app não bate com o armário.</p>
        </section>

        <section>
          <h2 class="list-title">Histórico</h2>
          ${history.length ? `<ul class="history">${history.map((m) => `
            <li class="history-item type-${m.type}">
              <span>${TYPE_LABEL[m.type] ? TYPE_LABEL[m.type](m) : esc(m.type)}</span>
              <span class="history-qty">ficou ${m.qtyAfter}</span>
              <span class="history-when">${when(m.at)}</span>
            </li>`).join('')}</ul>` : '<p class="empty">Nenhum registro ainda.</p>'}
        </section>

      </main>
    </div>`;

  // Barra do topo como no iPhone: transparente sobre o topo da página; quando o
  // nome sai de vista, ganha vidro e o nome aparece pequeno no meio.
  const screenEl = $('.screen-product', root);
  const heroTitle = $('.product-hero .page-title', root);
  const navIo = new IntersectionObserver(([e]) => screenEl.classList.toggle('is-scrolled', !e.isIntersecting && e.boundingClientRect.top < 60), { rootMargin: '-56px 0px 0px 0px' });
  navIo.observe(heroTitle);

  // Correção de estoque separada dos detalhes: só grava quando a pessoa confirma.
  let currentQty = p.qty;
  const fixBtn = $('[data-fix]', root);
  const qtyStep = stepper($('[data-qty]', root), {
    value: p.qty, min: 0, max: 9999, label: 'Quantidade no armário',
    onChange: (n) => {
      if (!fixBtn) return;
      fixBtn.hidden = n === currentQty;
      $('span', fixBtn).textContent = `Corrigir para ${n}`;
    },
  });
  // Mostra a quantidade nova no topo, no botão Tirar 1 e no seletor de correção.
  function showQty(product, dir = '') {
    currentQty = product.qty;
    qtyStep.set(product.qty);
    fixBtn.hidden = true;
    $('.product-hero .tag', root).outerHTML = tag(product.qty, `${tagState(product)} tag-lg ${dir}`);
    const pills = $('.hero-pills', root);
    if (pills) pills.innerHTML = stockPill(product);
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

  const fixName = $('[data-fixname]', root);
  if (fixName) {
    fixName.addEventListener('click', async () => {
      const cur = (await getProduct(code)) || p;
      if (await fixNameSheet(cur)) {
        toast('Nome corrigido.', { duration: 2500 });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    });
  }

  fixBtn.addEventListener('click', async () => {
    const target = qtyStep.value;
    try {
      const { product, movement } = await setStock(code, target, 'ajuste');
      currentQty = product.qty;
      fixBtn.hidden = true;
      $('.product-hero .tag', root).outerHTML = tag(product.qty, `${tagState(product)} tag-lg`);
      toast(`Quantidade corrigida para ${product.qty}.`, {
        action: movement ? 'Desfazer' : undefined,
        onAction: async () => {
          try {
            const restored = await undoMovement(movement.id);
            currentQty = restored.qty;
            qtyStep.set(restored.qty);
            $('.product-hero .tag', root).outerHTML = tag(restored.qty, `${tagState(restored)} tag-lg`);
            toast('Correção desfeita.', { duration: 2500 });
          } catch (err) {
            toast(err.message, { duration: 4000 });
          }
        },
      });
    } catch (err) {
      toast(err.message);
    }
  });

  // Detalhes numa folha "Editar", como nos Contatos do iPhone: a página fica
  // para consultar, e o que é raro (renomear, apagar) sai do caminho.
  $('[data-edit]', root).addEventListener('click', async () => {
    const cur = (await getProduct(code)) || p;
    const r = await editSheet(cur);
    if (r === 'delete') {
      const ok = await confirmSheet({
        title: `Remover ${cur.name}?`,
        text: 'O produto e todo o histórico dele saem do armário. Isso não pode ser desfeito.',
        confirm: 'Remover produto',
        danger: true,
      });
      if (!ok) return;
      await deleteProduct(code);
      toast(`${cur.name} removido.`, { duration: 3000 });
      location.hash = home.href;
    } else if (r) {
      toast('Detalhes salvos.', { duration: 2500 });
      // Desenha a página de novo pelo roteador (limpa os ouvintes da versão antiga).
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  });

  // ---------- Validades ----------
  const lotsHost = $('[data-lots]', root);
  let lots = [];

  async function renderLots() {
    const cur = await getProduct(code);
    lots = await lotsFor(code);
    if (!cur || !lotsHost.isConnected) return;
    const dated = lots.reduce((a, l) => a + l.qty, 0);
    const free = cur.qty - dated;
    lotsHost.innerHTML = `
      ${lots.length ? `<ul class="lots">${lots.map((l) => {
        const n = daysUntil(l.expiresAt);
        return `
        <li class="lot ${n <= SOON_DAYS ? 'is-soon' : ''}">
          <span class="lot-main">
            <span class="lot-date">${formatDate(l.expiresAt)}</span>
            <span class="lot-sub">${plural(l.qty, 'unidade', 'unidades')}, ${n < 0 ? 'já venceu' : n === 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : `daqui a ${n} dias`}</span>
          </span>
          <button type="button" class="icon-btn" data-remove-lot="${l.id}" aria-label="Apagar validade de ${formatDate(l.expiresAt)}">${icon('trash')}</button>
        </li>`;
      }).join('')}</ul>` : ''}
      <p class="sheet-text">${lots.length
        ? (free > 0
          ? `${free === 1 ? 'A unidade sem data sai' : `As ${free} unidades sem data saem`} primeiro na baixa, depois o que vence antes.`
          : 'Na baixa, sai primeiro o que vence antes.')
        : (cur.qty ? 'Sem validade marcada.' : 'Sem unidades no armário.')}</p>
      <div class="lot-actions">
        ${free > 0 ? '<button type="button" class="btn btn-quiet btn-sm" data-add-lot>' + icon('calendar') + 'Marcar validade</button>' : ''}
        ${lots.length ? '<button type="button" class="btn btn-quiet btn-sm" data-ics>' + icon('calendar') + 'Criar lembrete</button>' : ''}
      </div>`;
  }

  lotsHost.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-remove-lot]');
    if (rm) {
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
      await lotSheet(cur, free);
    }
  });

  const offLots = onChange(() => renderLots());
  const off = () => { offLots(); navIo.disconnect(); };
  renderLots();

  // Produto cadastrado antes da aba Remédios (ou pelas lojas) cujo código está
  // na lista da Anvisa: oferece trocar pelos dados oficiais e mudar de aba.
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
        <p class="field-note">O produto passa para a aba Remédios, com princípio ativo, tarja e bula, e fica sem foto.</p>`;
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

// Dá validade a unidades que já estão no armário sem data.
function lotSheet(p, free) {
  return openSheet({
    label: 'Marcar validade',
    render(body, close) {
      body.innerHTML = `
        <h2 class="sheet-title">Marcar validade</h2>
        <form class="stack" novalidate>
          <div class="field">
            <label class="field-label" for="lot-date">Validade</label>
            <input class="input input-date" id="lot-date" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="DD/MM/AA ou MM/AA" aria-describedby="lot-note">
            <p class="field-note" id="lot-note" aria-live="polite">Como está na embalagem. Só mês e ano vale até o fim do mês.</p>
          </div>
          <div class="field">
            <span class="field-label">Quantas unidades têm essa data</span>
            <div class="stepper-host stepper-sm"></div>
          </div>
          <button type="submit" class="btn btn-primary">Salvar validade</button>
        </form>`;
      const input = $('#lot-date', body);
      const note = $('#lot-note', body);
      const step = stepper($('.stepper-host', body), { value: free, min: 1, max: free, label: 'Unidades' });
      input.addEventListener('input', () => {
        input.value = maskExpiry(input.value);
        input.removeAttribute('aria-invalid');
        note.classList.remove('is-error');
        const iso = parseExpiry(input.value);
        note.textContent = iso ? `Vence em ${formatDate(iso)}.` : 'Como está na embalagem. Só mês e ano vale até o fim do mês.';
      });
      setTimeout(() => input.focus(), 250);
      $('form', body).addEventListener('submit', async (e) => {
        e.preventDefault();
        const iso = parseExpiry(input.value);
        if (!iso) {
          input.setAttribute('aria-invalid', 'true');
          note.classList.add('is-error');
          note.textContent = 'Não entendi a data. Use dia/mês/ano (15/10/26) ou mês/ano (10/26).';
          input.focus();
          return;
        }
        try {
          await addLot(p.code, step.value, iso);
          toast(`Validade ${formatDate(iso)} marcada em ${plural(step.value, 'unidade', 'unidades')}.`, { duration: 3000 });
          close(true);
        } catch (err) {
          note.classList.add('is-error');
          note.textContent = err.message;
        }
      });
    },
  });
}

function editSheet(p) {
  return openSheet({
    label: 'Editar detalhes',
    render(body, close) {
      body.innerHTML = `
        <h2 class="sheet-title">Editar</h2>
        <form class="stack" novalidate>
          <label class="field"><span class="field-label">Nome</span>
            <input class="input" name="name" maxlength="80" value="${esc(p.name)}" autocomplete="off"></label>
          <div class="field-row">
            <label class="field"><span class="field-label">Marca</span>
              <input class="input" name="brand" maxlength="40" value="${esc(p.brand)}" autocomplete="off"></label>
            <label class="field"><span class="field-label">Tamanho</span>
              <input class="input" name="size" maxlength="20" value="${esc(p.size)}" autocomplete="off" placeholder="Ex.: 1 kg"></label>
          </div>
          <fieldset class="segmented">
            <legend class="field-label">Onde fica</legend>
            <div class="segmented-track">
              ${AREAS.map((a) => `
                <label class="segment"><input type="radio" name="area" value="${a.id}" ${a.id === (p.area || 'cozinha') ? 'checked' : ''}><span>${a.short}</span></label>`).join('')}
            </div>
          </fieldset>
          <div class="field">
            <span class="field-label">Avisar quando tiver esta quantidade ou menos</span>
            <div class="stepper-host stepper-sm" data-min></div>
          </div>
          <p class="field-error" role="alert" hidden></p>
          <div class="sheet-actions">
            <button type="submit" class="btn btn-primary">${icon('check')}Salvar</button>
            <button type="button" class="btn btn-danger-ghost" data-delete>${icon('trash')}Remover do armário</button>
          </div>
        </form>`;
      const minStep = stepper($('[data-min]', body), { value: p.minQty, min: 0, max: 999, label: 'Avisar com' });
      const err = $('.field-error', body);
      $('[data-delete]', body).addEventListener('click', () => close('delete'));
      $('form', body).addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = (n) => $(`[name=${n}]`, body).value;
        try {
          await updateProduct(p.code, {
            name: val('name'),
            brand: val('brand'),
            size: val('size'),
            minQty: minStep.value,
            area: $('input[name=area]:checked', body)?.value,
          });
          close('saved');
        } catch (e2) {
          err.hidden = false;
          err.textContent = e2.message;
        }
      });
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
      const busy = (text) => { spinner.hidden = false; status.textContent = text; list.hidden = true; };
      const done = (text) => { spinner.hidden = true; status.textContent = text; };
      const show = (found, from) => {
        items = found.filter((x) => x && x.name);
        list.innerHTML = items.map((x, i) => `
          <li><button type="button" class="pick-row suggest-row" data-i="${i}">
            ${thumb(x)}
            <span class="row-main"><span class="row-name">${esc(x.name)}</span><span class="row-sub">${subtitle(x) || '&nbsp;'}</span></span>
          </button></li>`).join('');
        list.hidden = !items.length;
        done(items.length ? `${plural(items.length, 'sugestão', 'sugestões')} ${from}. Toque na certa.` : `Nada encontrado ${from}. Tente ler o código ou fotografar a embalagem.`);
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
          const read = await identifyPhoto(await photoToDataUrl(file));
          if (body.isConnected) show(read.results, 'pela foto');
        } catch {
          if (body.isConnected) done('Não deu para enviar a foto agora. Confira a internet e tente de novo.');
        }
      });
      list.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-i]');
        if (!btn) return;
        try {
          await applyInfo(p.code, items[Number(btn.dataset.i)], scanned);
          close(true);
        } catch (err) {
          done(err.message);
        }
      });
    },
  });
  return sheet.finally(() => { if (cam) cam.stop(); });
}
