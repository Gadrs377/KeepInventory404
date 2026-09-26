// Revisão da contagem: mostra o que vai mudar e aplica.

import { listProducts, getCountDraft, diffCount, applyCount } from '../store.js';
import { $, esc, icon, plural, toast } from '../ui.js';

export default async function mountRevisao(root) {
  const [products, draft] = await Promise.all([listProducts(), getCountDraft()]);
  if (!draft) {
    location.replace('#/inventario');
    return;
  }
  const { changes, missing } = diffCount(products, draft);
  const missingWithStock = missing.filter((p) => p.qty > 0);
  changes.sort((a, b) => a.product.name.localeCompare(b.product.name, 'pt-BR'));

  const signed = (d) => (d > 0 ? `+${d}` : `−${Math.abs(d)}`);

  root.innerHTML = `
    <div class="screen screen-review has-floating-bar mode-contagem">
      <header class="band">
        <a class="icon-btn" href="#/inventario" aria-label="Voltar para a contagem">${icon('back')}</a>
        <div class="band-text">
          <h1 class="band-title">Revisar contagem</h1>
          <p class="band-hint">${plural(Object.keys(draft.counts).length, 'produto contado', 'produtos contados')}</p>
        </div>
      </header>
      <main class="content">
        <h2 class="list-title">${changes.length ? plural(changes.length, 'produto vai mudar', 'produtos vão mudar') : 'Tudo o que foi contado confere'}</h2>
        ${changes.length ? `<ul class="diff-list">${changes.map((c) => `
          <li class="diff">
            <span class="diff-name">${esc(c.product.name)}</span>
            <span class="diff-qty">${c.from} para ${c.to}</span>
            <span class="diff-delta ${c.to > c.from ? 'is-up' : 'is-down'}">${signed(c.to - c.from)}</span>
          </li>`).join('')}</ul>` : '<p class="empty">Nenhuma diferença entre o armário e o sistema nos itens contados.</p>'}

        ${missingWithStock.length ? `
        <fieldset class="choice">
          <legend class="list-title">${plural(missingWithStock.length, 'produto com estoque não foi contado', 'produtos com estoque não foram contados')}</legend>
          <p class="sheet-text">${missingWithStock.slice(0, 5).map((p) => esc(p.name)).join(', ')}${missingWithStock.length > 5 ? ` e mais ${missingWithStock.length - 5}` : ''}.</p>
          <label class="radio"><input type="radio" name="missing" value="keep" checked> Manter como estão</label>
          <label class="radio"><input type="radio" name="missing" value="zero"> Zerar os não contados</label>
        </fieldset>` : ''}
      </main>
      <footer class="floating-bar glass-regular">
        <button type="button" class="btn btn-mode btn-lg" data-apply>Aplicar contagem</button>
      </footer>
    </div>`;

  const applyBtn = $('[data-apply]', root);
  applyBtn.addEventListener('click', async () => {
    applyBtn.disabled = true;
    const zero = $('input[name=missing]:checked', root)?.value === 'zero';
    try {
      const n = await applyCount(zero);
      toast(n ? `Contagem aplicada. ${plural(n, 'produto ajustado', 'produtos ajustados')}.` : 'Contagem aplicada. Nada precisou mudar.', { mode: 'contagem' });
      location.hash = '#/';
    } catch (err) {
      applyBtn.disabled = false;
      toast(err.message);
    }
  });
}
