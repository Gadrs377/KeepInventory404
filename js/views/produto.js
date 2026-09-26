// Página do produto: dados, validades, consumo, ajuste manual e histórico.

import { getProduct, updateProduct, setStock, movementsFor, deleteProduct, lotsFor, addLot, removeLot, onChange, undoMovement } from '../store.js';
import { AREAS } from '../areas.js';
import { consumptionByProduct, rateText, daysLeft } from '../consumo.js';
import { parseExpiry, maskExpiry, formatDate, daysUntil, icsFor, SOON_DAYS } from '../dates.js';
import { $, esc, icon, stepper, subtitle, tag, tagState, thumb, toast, when, confirmSheet, stockNote, openSheet, download, plural } from '../ui.js';

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

  root.innerHTML = `
    <div class="screen screen-product">
      <header class="topbar nav-bar">
        <a class="icon-btn glass-btn" href="#/" aria-label="Voltar ao armário">${icon('chevronLeft')}</a>
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
            ${stockNote(p) ? `<p class="stock-note">${stockNote(p)}</p>` : ''}
          </div>
          ${tag(p.qty, `${tagState(p)} tag-lg`)}
        </section>

        <section class="stock-fix" aria-labelledby="stock-title">
          <h2 class="list-title" id="stock-title">Quantidade no armário</h2>
          <div class="stock-fix-row">
            <div class="stepper-host stepper-sm" data-qty></div>
            <button type="button" class="btn btn-quiet" data-fix hidden>${icon('check')}<span></span></button>
          </div>
          <p class="field-note">Só para acertar a contagem.</p>
        </section>

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
      location.hash = '#/';
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
