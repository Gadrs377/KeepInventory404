// Página do produto: dados, ajuste manual e histórico.

import { getProduct, updateProduct, setStock, movementsFor, deleteProduct } from '../store.js';
import { $, esc, icon, stepper, subtitle, tag, tagState, thumb, toast, when, confirmSheet, stockNote } from '../ui.js';

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
        <header class="topbar"><a class="icon-btn" href="#/" aria-label="Voltar">${icon('back')}</a></header>
        <main class="content"><p class="empty">Esse produto não está mais no armário.</p>
        <a class="btn btn-primary" href="#/">Voltar ao armário</a></main>
      </div>`;
    return;
  }
  const history = await movementsFor(code, 30);
  const barcodes = Array.isArray(p.barcodes) ? p.barcodes : [];
  const niceCode = barcodes.length ? `Código ${barcodes.join(', ')}` : 'Produto sem código';

  root.innerHTML = `
    <div class="screen screen-product">
      <header class="topbar">
        <a class="icon-btn" href="#/" aria-label="Voltar ao armário">${icon('back')}</a>
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

        <form class="stack product-form" novalidate>
          <label class="field"><span class="field-label">Nome</span>
            <input class="input" name="name" maxlength="80" value="${esc(p.name)}" autocomplete="off"></label>
          <div class="field-row">
            <label class="field"><span class="field-label">Marca</span>
              <input class="input" name="brand" maxlength="40" value="${esc(p.brand)}" autocomplete="off"></label>
            <label class="field"><span class="field-label">Tamanho</span>
              <input class="input" name="size" maxlength="20" value="${esc(p.size)}" autocomplete="off" placeholder="Ex.: 1 kg"></label>
          </div>
          <div class="field">
            <span class="field-label">Avisar quando tiver esta quantidade ou menos</span>
            <div class="stepper-host stepper-sm" data-min></div>
          </div>
          <div class="field">
            <span class="field-label">Quantidade no armário</span>
            <div class="stepper-host stepper-sm" data-qty></div>
          </div>
          <button type="submit" class="btn btn-primary">Salvar alterações</button>
        </form>

        <section>
          <h2 class="list-title">Histórico</h2>
          ${history.length ? `<ul class="history">${history.map((m) => `
            <li class="history-item type-${m.type}">
              <span>${TYPE_LABEL[m.type] ? TYPE_LABEL[m.type](m) : esc(m.type)}</span>
              <span class="history-qty">ficou ${m.qtyAfter}</span>
              <span class="history-when">${when(m.at)}</span>
            </li>`).join('')}</ul>` : '<p class="empty">Nenhum registro ainda.</p>'}
        </section>

        <button type="button" class="btn btn-danger-ghost" data-delete>Remover do armário</button>
      </main>
    </div>`;

  const minStep = stepper($('[data-min]', root), { value: p.minQty, min: 0, max: 999, label: 'Avisar com' });
  const qtyStep = stepper($('[data-qty]', root), { value: p.qty, min: 0, max: 9999, label: 'Quantidade' });

  $('form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = (n) => $(`[name=${n}]`, root).value;
    try {
      await updateProduct(code, {
        name: val('name'),
        brand: val('brand'),
        size: val('size'),
        minQty: minStep.value,
      });
      await setStock(code, qtyStep.value, 'ajuste');
      toast('Alterações salvas.', { duration: 2500 });
      location.hash = '#/';
    } catch (err) {
      toast(err.message);
    }
  });

  $('[data-delete]', root).addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: `Remover ${p.name}?`,
      text: 'O produto e todo o histórico dele saem do armário. Isso não pode ser desfeito.',
      confirm: 'Remover produto',
      danger: true,
    });
    if (!ok) return;
    await deleteProduct(code);
    toast(`${p.name} removido.`, { duration: 3000 });
    location.hash = '#/';
  });
}
