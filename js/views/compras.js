// Lista de compras: o app sugere pelo mínimo de cada produto e pelo ritmo de
// consumo, a pessoa marca o que já pegou e pode acrescentar itens soltos.
// Também monta a pergunta para o Claude (lista da semana e receitas com o que vence).

import { listProducts, listLots, recentMovements, onChange } from '../store.js';
import { AREAS } from '../areas.js';
import { consumptionByProduct, shoppingSuggestions } from '../consumo.js';
import { daysUntil, expiryText, WATCH_DAYS } from '../dates.js';
import { $, esc, icon, plural, stepper, shareText, claudeUrl, thumb, toast } from '../ui.js';

const KEY = 'ki.shop';
const AREA_ICON = { cozinha: 'pot', limpeza: 'spray', beleza: 'lotus' };

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { every: Number(s.every) || 7, checked: s.checked || {}, extra: Array.isArray(s.extra) ? s.extra : [] };
  } catch {
    return { every: 7, checked: {}, extra: [] };
  }
}
function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sem armazenamento */ }
}

export default function mountCompras(root) {
  const state = loadState();
  let alive = true;
  let items = [];
  let products = [];
  let expiring = [];

  root.innerHTML = `
    <div class="screen screen-shop has-floating-bar">
      <header class="topbar">
        <a class="icon-btn" href="#/" aria-label="Voltar ao armário">${icon('back')}</a>
        <h1 class="topbar-title">Compras</h1>
      </header>
      <main class="content">
        <p class="lead" data-lead>&nbsp;</p>
        <div class="shop-lists"></div>

        <form class="shop-add" novalidate>
          <label class="field-label" for="shop-extra">Acrescentar à lista</label>
          <div class="shop-add-row">
            <input class="input" id="shop-extra" maxlength="60" autocomplete="off" placeholder="Ex.: pão, frutas" enterkeyhint="done">
            <button type="submit" class="btn btn-quiet">${icon('plus')}Acrescentar</button>
          </div>
        </form>

        <section class="shop-every">
          <h2 class="list-title">Vocês fazem compras a cada</h2>
          <div class="every-row">
            <div class="stepper-host stepper-sm" data-every></div>
            <span>dias</span>
          </div>
          <p class="sheet-text">A sugestão cobre o que vai acabar até a próxima compra, mais o mínimo de cada produto.</p>
        </section>

        <section>
          <h2 class="list-title">Perguntar ao Claude</h2>
          <p class="sheet-text">Abre uma conversa nova no Claude com o armário e a lista já escritos. Nada é enviado sem você tocar em Enviar lá.</p>
          <div class="stack-sm">
            <a class="btn btn-quiet" data-ask="lista" target="_blank" rel="noopener">${icon('chat')}Revisar a lista com o Claude</a>
            <a class="btn btn-quiet" data-ask="receitas" target="_blank" rel="noopener" hidden>${icon('chat')}Pedir receitas com o que vence</a>
          </div>
        </section>
      </main>
      <footer class="floating-bar glass-regular">
        <button type="button" class="btn btn-primary btn-lg" data-share>${icon('share')}Compartilhar lista</button>
      </footer>
    </div>`;

  const lists = $('.shop-lists', root);
  const lead = $('[data-lead]', root);
  const askList = $('[data-ask="lista"]', root);
  const askRecipes = $('[data-ask="receitas"]', root);

  stepper($('[data-every]', root), {
    value: state.every, min: 1, max: 60, label: 'Dias entre compras',
    onChange: (n) => {
      if (n === state.every) return;
      state.every = n;
      saveState(state);
      load();
    },
  });

  function render() {
    const open = items.filter((i) => !state.checked[i.product.code]).length + state.extra.filter((x) => !x.checked).length;
    const all = items.length + state.extra.length;
    lead.textContent = all
      ? (open ? `${plural(open, 'item para comprar', 'itens para comprar')}.` : 'Tudo marcado. Boas compras.')
      : 'Nada para comprar agora. Quando algo chegar no mínimo ou for acabar antes da próxima compra, aparece aqui.';

    const groups = AREAS.map((a) => ({ ...a, rows: items.filter((i) => (i.product.area || 'cozinha') === a.id) })).filter((g) => g.rows.length);
    lists.innerHTML = groups.map((g) => `
      <h2 class="list-title list-title-icon">${icon(AREA_ICON[g.id])}${g.label}</h2>
      <ul class="shop-list">${g.rows.map((i) => {
        const done = !!state.checked[i.product.code];
        return `
        <li>
          <label class="shop-item ${done ? 'is-done' : ''}">
            <input type="checkbox" class="check" data-code="${esc(i.product.code)}" ${done ? 'checked' : ''}>
            ${thumb(i.product)}
            <span class="row-main">
              <span class="row-name">${esc(i.product.name)}</span>
              <span class="row-sub">${esc([i.reason, i.rate].filter(Boolean).join(', '))}</span>
            </span>
            <span class="shop-qty"><span class="sr-only">Comprar </span>${i.buy}</span>
          </label>
        </li>`;
      }).join('')}</ul>`).join('')
      + (state.extra.length ? `
      <h2 class="list-title">Outros</h2>
      <ul class="shop-list">${state.extra.map((x) => `
        <li>
          <div class="shop-item ${x.checked ? 'is-done' : ''}">
            <input type="checkbox" class="check" id="x-${x.id}" data-extra="${x.id}" ${x.checked ? 'checked' : ''}>
            <label class="row-main" for="x-${x.id}"><span class="row-name">${esc(x.name)}</span></label>
            <button type="button" class="icon-btn" data-remove="${x.id}" aria-label="Tirar ${esc(x.name)} da lista">${icon('close')}</button>
          </div>
        </li>`).join('')}</ul>` : '');

    const done = Object.keys(state.checked).length + state.extra.filter((x) => x.checked).length;
    if (done) lists.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-quiet btn-sm shop-clear" data-clear>${icon('check')}Limpar marcados</button>`);

    askList.href = claudeUrl(listPrompt());
    askRecipes.hidden = !expiring.length;
    if (expiring.length) askRecipes.href = claudeUrl(recipesPrompt());
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
    const [list, moves, lots] = await Promise.all([listProducts(), recentMovements(5000), listLots()]);
    if (!alive) return;
    products = list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    items = shoppingSuggestions(list, consumptionByProduct(list, moves), state.every);
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
    render();
    lists.querySelector(box.dataset.code ? `[data-code="${CSS.escape(box.dataset.code)}"]` : `[data-extra="${box.dataset.extra}"]`)?.focus();
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
      state.extra = state.extra.filter((x) => !x.checked);
      saveState(state);
      render();
      toast('Marcados limpos.', { duration: 2000 });
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

  $('[data-share]', root).addEventListener('click', () => {
    const text = listText();
    if (!text) { toast('A lista está vazia.', { duration: 2500 }); return; }
    shareText('Lista de compras', `Lista de compras\n\n${text}`);
  });

  const off = onChange(load);
  load();
  return () => { alive = false; off(); };
}
