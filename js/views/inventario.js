// Contagem física do armário. O rascunho fica salvo a cada item contado.

import { mountCamera } from './camera.js';
import { showProductSheet } from './productSheet.js';
import { listProducts, startCount, getCountDraft, discardCountDraft, onChange } from '../store.js';
import { warmUp } from '../scanner.js';
import { $, esc, icon, openSheet, subtitle, tag, thumb, toast } from '../ui.js';

export default function mountInventario(root) {
  warmUp();
  root.innerHTML = `
    <div class="screen screen-count has-floating-bar mode-contagem">
      <header class="band">
        <div class="band-text">
          <h1 class="band-title">Contagem</h1>
          <p class="band-hint" data-progress>Conte o que está no armário</p>
        </div>
        <button type="button" class="icon-btn" data-exit aria-label="Sair da contagem">${icon('close')}</button>
      </header>
      <main>
        <div class="cam-host"></div>
        <div class="count-lists"></div>
      </main>
      <footer class="floating-bar glass-regular">
        <a class="btn btn-mode btn-lg" href="#/revisao" data-review>${icon('count')}Revisar</a>
      </footer>
    </div>`;

  const lists = $('.count-lists', root);
  const progress = $('[data-progress]', root);
  const review = $('[data-review]', root);
  let alive = true;

  async function refresh() {
    const [products, draft] = await Promise.all([listProducts(), getCountDraft()]);
    if (!alive) return;
    const counts = draft ? draft.counts : {};
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
    const pending = products.filter((p) => !Object.hasOwn(counts, p.code)).sort(byName);
    const done = products.filter((p) => Object.hasOwn(counts, p.code)).sort(byName);
    progress.textContent = products.length
      ? `${done.length} de ${products.length} produtos contados`
      : 'Leia o código de cada produto e diga quantos tem';
    review.classList.toggle('is-disabled', done.length === 0);
    review.setAttribute('aria-disabled', String(done.length === 0));

    const row = (p, counted) => `
      <li>
        <button type="button" class="row" data-code="${esc(p.code)}">
          ${thumb(p)}
          <span class="row-main">
            <span class="row-name">${esc(p.name)}</span>
            <span class="row-sub">${counted === undefined ? `No app: ${p.qty}` : `Era ${p.qty}`}${subtitle(p) ? `, ${subtitle(p)}` : ''}</span>
          </span>
          ${counted === undefined ? '<span class="tag is-empty"><span class="sr-only">Ainda não contado</span></span>' : tag(counted, 'is-counted', 'Contados')}
        </button>
      </li>`;

    lists.innerHTML = `
      ${pending.length ? `<h2 class="list-title">Faltam contar</h2><ul class="rows">${pending.map((p) => row(p)).join('')}</ul>` : ''}
      ${done.length ? `<h2 class="list-title">Contados</h2><ul class="rows">${done.map((p) => row(p, counts[p.code])).join('')}</ul>` : ''}
      ${!products.length ? '<p class="empty">O armário está vazio. Leia um código para contar e cadastrar de uma vez.</p>' : ''}
      ${products.length && !pending.length ? '<p class="empty">Tudo contado. Toque em Revisar para ver as diferenças.</p>' : ''}`;
  }

  async function count(target) {
    const r = await showProductSheet({ mode: 'contagem', ...target });
    if (r) {
      toast(`${r.product.name}: ${r.n} contados.`, { mode: 'contagem', duration: 2500 });
      refresh();
    }
  }

  lists.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-code]');
    if (btn) count({ productId: btn.dataset.code });
  });

  review.addEventListener('click', (e) => {
    if (review.classList.contains('is-disabled')) {
      e.preventDefault();
      toast('Conte pelo menos um produto antes de revisar.', { duration: 3000 });
    }
  });

  $('[data-exit]', root).addEventListener('click', async () => {
    const draft = await getCountDraft();
    if (!draft || !Object.keys(draft.counts).length) {
      await discardCountDraft();
      location.hash = '#/';
      return;
    }
    const choice = await openSheet({
      mode: 'contagem',
      label: 'Sair da contagem',
      render(body, close) {
        body.innerHTML = `
          <h2 class="sheet-title">Guardar a contagem para continuar depois?</h2>
          <p class="sheet-text">O estoque só muda quando você aplicar a contagem na revisão.</p>
          <div class="sheet-actions">
            <button type="button" class="btn btn-mode" data-keep>Guardar e sair</button>
            <button type="button" class="btn btn-danger-ghost" data-discard>Descartar contagem</button>
          </div>`;
        $('[data-keep]', body).addEventListener('click', () => close('keep'));
        $('[data-discard]', body).addEventListener('click', () => close('discard'));
      },
    });
    if (choice === 'discard') await discardCountDraft();
    if (choice) location.hash = '#/';
  });

  const off = onChange(refresh);
  startCount().then(refresh);
  const cam = mountCamera($('.cam-host', root), { onCode: (barcode) => count({ barcode }), compact: true });

  return () => {
    alive = false;
    off();
    cam.stop();
  };
}
