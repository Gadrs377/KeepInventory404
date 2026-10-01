// Lista de compras: o app sugere pelo mínimo de cada produto e pelo ritmo de
// consumo, a pessoa marca o que já pegou e pode acrescentar itens soltos.
// Também monta a pergunta para o Claude (lista da semana e receitas com o que vence).
// O que é de vez em quando (frequência, Claude) fica no menu "…" do topo.

import { listLots, onChange } from '../store.js';
import { AREAS } from '../areas.js';
import { daysUntil, expiryText, WATCH_DAYS } from '../dates.js';
import { loadShop as loadState, saveShop as saveState, shopSuggestions } from '../shop.js';
import { rxNeed } from './remedioInfo.js';
import { morph } from '../morph.js';
import { $, esc, icon, plural, stepper, shareText, claudeUrl, thumb, toast, tabBar, openMenu, openSheet, skeletonRows, pill } from '../ui.js';

const AREA_ICON = { cozinha: 'pot', limpeza: 'spray', beleza: 'lotus', remedios: 'pill' };

export default function mountCompras(root) {
  const state = loadState();
  let alive = true;
  let items = [];
  let products = [];
  let expiring = [];
  // Marcados descem para o fim do grupo, mas só depois de o risco aparecer.
  const sunk = new Set(Object.keys(state.checked));

  root.innerHTML = `
    <div class="screen screen-shop has-tabbar">
      <header class="home-head">
        <h1 class="page-title">Compras</h1>
        <div class="head-actions">
          <button type="button" class="icon-btn" data-share aria-label="Compartilhar lista">${icon('share')}</button>
          <button type="button" class="icon-btn" data-more aria-haspopup="menu" aria-label="Mais opções da lista">${icon('more')}</button>
        </div>
      </header>
      <main class="content">
        <p class="lead" data-lead>Montando a lista pelo seu consumo</p>
        <form class="shop-add" novalidate>
          <div class="shop-add-row">
            <input class="input" id="shop-extra" maxlength="60" autocomplete="off" placeholder="Adicionar à lista" aria-label="Adicionar à lista" enterkeyhint="done">
            <button type="submit" class="btn btn-quiet btn-icon" aria-label="Adicionar">${icon('plus')}</button>
          </div>
        </form>
        <div class="shop-lists" aria-busy="true">${skeletonRows(4, 'shop-list')}</div>
        <div class="shop-back">
          <span>Voltou do mercado?</span>
          <button type="button" class="btn btn-quiet btn-sm" data-nota>${icon('qrCode')}Ler a nota fiscal</button>
        </div>

      </main>
      ${tabBar('compras')}
    </div>`;

  const lists = $('.shop-lists', root);
  const lead = $('[data-lead]', root);

  // Frequência das compras: numa folha, porque muda quase nunca.
  function everySheet() {
    return openSheet({
      label: 'Frequência das compras',
      render(body, close) {
        body.innerHTML = `
          <h2 class="sheet-title">Compras a cada</h2>
          <div class="every-row"><div class="stepper-host stepper-sm"></div><span>dias</span></div>
          <p class="sheet-text">A sugestão cobre o que vai acabar até a próxima compra, mais o mínimo de cada produto.</p>
          <div class="sheet-actions"><button type="button" class="btn btn-primary" data-ok>Salvar</button></div>`;
        const step = stepper($('.stepper-host', body), { value: state.every, min: 1, max: 60, label: 'Dias entre compras' });
        $('[data-ok]', body).addEventListener('click', () => close(step.value));
      },
    }).then((n) => {
      if (!n || n === state.every) return;
      state.every = n;
      saveState(state);
      load();
    });
  }

  $('[data-more]', root).addEventListener('click', (e) => {
    const items = [
      { label: `Compras a cada ${plural(state.every, 'dia', 'dias')}`, icon: 'calendar', onSelect: everySheet },
      { label: 'Revisar a lista com o Claude', icon: 'chat', onSelect: () => window.open(claudeUrl(listPrompt()), '_blank', 'noopener') },
    ];
    if (expiring.length) items.push({ label: 'Pedir receitas com o que vence', icon: 'pot', onSelect: () => window.open(claudeUrl(recipesPrompt()), '_blank', 'noopener') });
    openMenu(e.currentTarget, items, { label: 'Opções da lista' });
  });

  function render() {
    const first = lists.hasAttribute('aria-busy');
    lists.removeAttribute('aria-busy');
    const open = items.filter((i) => !state.checked[i.product.code]).length + state.extra.filter((x) => !x.checked).length;
    const all = items.length + state.extra.length;
    lead.textContent = all
      ? (open ? `${plural(open, 'item para comprar', 'itens para comprar')}, pensando nos próximos ${plural(state.every, 'dia', 'dias')}.` : 'Tudo no carrinho. Boas compras.')
      : '';
    lead.hidden = !all;

    // Remédios num cartão só: a ida à farmácia, com a receita de cada um.
    const isMedItem = (i) => !!(i.product.med || i.product.area === 'remedios');
    // Dentro de cada grupo, o que já está no carrinho vai para o fim.
    const sink = (rows) => rows.slice().sort((a, b) => Number(sunk.has(a.product.code)) - Number(sunk.has(b.product.code)));
    const meds = sink(items.filter(isMedItem));
    const itemRow = (i) => {
      const done = !!state.checked[i.product.code];
      return `
        <li data-key="shop-${esc(i.product.code)}">
          <label class="shop-item ${done ? 'is-done' : ''}">
            <input type="checkbox" class="check" data-code="${esc(i.product.code)}" ${done ? 'checked' : ''}>
            ${thumb(i.product)}
            <span class="row-main">
              <span class="row-name">${esc(i.product.name)}</span>
              <span class="row-meta">${done ? '<span class="row-sub">No carrinho</span>' : statusOf(i)}</span>
            </span>
            <span class="shop-qty"><span class="sr-only">Comprar </span>${i.buy}</span>
          </label>
        </li>`;
    };
    const needs = meds.map((i) => rxNeed(i.product.med)).filter(Boolean).length;
    const groups = AREAS.filter((a) => a.id !== 'remedios').map((a) => ({ ...a, rows: sink(items.filter((i) => !isMedItem(i) && (i.product.area || 'cozinha') === a.id)) })).filter((g) => g.rows.length);
    const done = Object.keys(state.checked).length + state.extra.filter((x) => x.checked).length;
    morph(lists, (meds.length ? `
      <section class="pharm" aria-labelledby="pharm-title" data-key="pharm">
        <div class="pharm-head"><h2 id="pharm-title">Farmácia</h2><span>${plural(meds.length, 'remédio', 'remédios')}</span></div>
        <ul class="shop-list">${meds.map(itemRow).join('')}</ul>
        ${needs ? `<p class="pharm-note">${icon('fileText')}Leve ${needs === 1 ? 'a receita' : `as ${needs} receitas`}.</p>` : ''}
      </section>` : '') + groups.map((g) => `
      <h2 class="list-title list-title-icon" data-key="h-${g.id}">${icon(AREA_ICON[g.id])}${g.label}<span class="title-count">${g.rows.length}</span></h2>
      <ul class="shop-list" data-key="ul-${g.id}">${g.rows.map(itemRow).join('')}</ul>`).join('')
      + (state.extra.length ? `
      <h2 class="list-title" data-key="h-outros">Outros</h2>
      <ul class="shop-list" data-key="ul-outros">${state.extra.map((x) => `
        <li data-key="x-${x.id}">
          <div class="shop-item ${x.checked ? 'is-done' : ''}">
            <input type="checkbox" class="check" id="x-${x.id}" data-extra="${x.id}" ${x.checked ? 'checked' : ''}>
            <label class="row-main" for="x-${x.id}"><span class="row-name">${esc(x.name)}</span></label>
            <button type="button" class="icon-btn" data-remove="${x.id}" aria-label="Remover ${esc(x.name)} da lista">${icon('close')}</button>
          </div>
        </li>`).join('')}</ul>` : '')
      + (all ? '' : `
      <div class="empty-state" data-key="empty">
        <span class="empty-icon" aria-hidden="true">${icon('cart')}</span>
        <p class="empty-lead">Nada para comprar</p>
        <p>O que estiver acabando aparece aqui.</p>
      </div>`)
      + (done ? `<button type="button" class="btn btn-quiet btn-sm shop-clear" data-clear data-key="clear">${icon('check')}Limpar marcados</button>` : ''), { animate: !first });
  }

  // Estado em pílula (Zerado, Acabando) e o resto em texto: quanto tem, previsão, ritmo.
  function statusOf(i) {
    const p = i.product;
    const rx = rxNeed(p.med);
    if (rx) return `<span class="rx-need ${rx.cls}">${esc(rx.text)}</span><span class="row-sub">${esc(i.reason)}</span>`;
    if (p.qty === 0) return `${pill('zero', 'Zerado')}<span class="row-sub">${esc(i.rate)}</span>`;
    if (i.reason.startsWith('Acabando')) return `${pill('low', 'Acabando')}<span class="row-sub">${esc([`tem ${p.qty}`, i.rate].filter(Boolean).join(', '))}</span>`;
    return `<span class="row-sub">${esc([i.reason, i.rate].filter(Boolean).join(', '))}</span>`;
  }

  function listText() {
    const lines = [];
    for (const a of AREAS) {
      const rows = items.filter((i) => (i.product.area || 'cozinha') === a.id && !state.checked[i.product.code]);
      if (!rows.length) continue;
      lines.push(`${a.label}:`);
      rows.forEach((i) => lines.push(`- ${i.product.name}${i.product.size ? ` (${i.product.size})` : ''}: ${i.buy}`));
    }
    const extra = state.extra.filter((x) => !x.checked);
    if (extra.length) {
      lines.push('Outros:');
      extra.forEach((x) => lines.push(`- ${x.name}`));
    }
    return lines.join('\n');
  }

  function listPrompt() {
    const stock = products.slice(0, 80).map((p) => `- ${p.name}: ${p.qty}${p.minQty ? ` (mínimo ${p.minQty})` : ''}`).join('\n');
    return [
      `Somos uma casa de 2 pessoas e fazemos compras a cada ${state.every} dias.`,
      'Este é o nosso armário agora (produto: quantidade):',
      stock || '(vazio)',
      '',
      'O app de estoque sugeriu esta lista:',
      listText() || '(nada)',
      '',
      'Revise a lista comigo: falta algo óbvio? Alguma quantidade está exagerada? Responda com a lista final, agrupada por seção do mercado.',
    ].join('\n');
  }

  function recipesPrompt() {
    const soon = expiring.map(({ p, date }) => `- ${p.name}: ${expiryText(date).toLowerCase()}`).join('\n');
    const rest = products.filter((p) => p.qty > 0 && (p.area || 'cozinha') === 'cozinha').slice(0, 60).map((p) => p.name).join(', ');
    return [
      'Estes itens do nosso armário vencem logo:',
      soon,
      '',
      `Também temos: ${rest || 'pouca coisa'}.`,
      '',
      'Sugira 3 receitas simples para 2 pessoas que usem primeiro o que vence. Diga o que falta comprar para cada uma.',
    ].join('\n');
  }

  async function load() {
    const [{ products: list, items: suggested }, lots] = await Promise.all([shopSuggestions(state.every), listLots()]);
    if (!alive) return;
    products = list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    items = suggested;
    // Marcações de produtos que saíram da lista (já foram repostos) não valem mais.
    for (const code of Object.keys(state.checked)) if (!items.some((i) => i.product.code === code)) delete state.checked[code];
    saveState(state);
    const byCode = new Map(list.map((p) => [p.code, p]));
    const seen = new Set();
    expiring = lots.filter((l) => daysUntil(l.expiresAt) <= WATCH_DAYS && byCode.has(l.code) && !seen.has(l.code) && seen.add(l.code))
      .map((l) => ({ p: byCode.get(l.code), date: l.expiresAt }));
    render();
  }

  lists.addEventListener('change', (e) => {
    const box = e.target.closest('.check');
    if (!box) return;
    if (box.dataset.code) {
      if (box.checked) state.checked[box.dataset.code] = true;
      else delete state.checked[box.dataset.code];
    } else {
      const x = state.extra.find((i) => String(i.id) === box.dataset.extra);
      if (x) x.checked = box.checked;
    }
    saveState(state);
    const code = box.dataset.code;
    render();
    if (box.checked) {
      // O círculo pula ao encher.
      box.classList.remove('is-pop'); void box.offsetWidth; box.classList.add('is-pop');
      // Risca como uma caneta e, um instante depois, desce para o fim do grupo.
      const item = box.closest('.shop-item');
      if (item) { item.classList.add('is-striking'); setTimeout(() => item.classList.remove('is-striking'), 600); }
      if (code) setTimeout(() => { if (!alive || !state.checked[code]) return; sunk.add(code); render(); }, 520);
    } else if (code && sunk.delete(code)) {
      render();
    }
  });

  lists.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      state.extra = state.extra.filter((x) => String(x.id) !== rm.dataset.remove);
      saveState(state);
      render();
      return;
    }
    if (e.target.closest('[data-clear]')) {
      state.checked = {};
      sunk.clear();
      state.extra = state.extra.filter((x) => !x.checked);
      saveState(state);
      render();
      toast('Itens marcados removidos da lista.', { duration: 2000 });
    }
  });

  $('.shop-add', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#shop-extra', root);
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    state.extra.push({ id: Date.now(), name, checked: false });
    saveState(state);
    input.value = '';
    render();
    input.focus();
  });

  $('[data-nota]', root).addEventListener('click', () => {
    try { sessionStorage.setItem('ki.qr', '1'); } catch { /* sem armazenamento */ }
    location.hash = '#/entrada';
  });

  $('[data-share]', root).addEventListener('click', () => {
    const text = listText();
    if (!text) { toast('A lista está vazia.', { duration: 2500 }); return; }
    shareText('Lista de compras', `Lista de compras\n\n${text}`);
  });

  const off = onChange(load);
  load();
  return () => { alive = false; off(); };
}
