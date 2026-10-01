// Revisão do Conferir: o resumo em números, o que não apareceu (com Zerar e
// "Zerar os N") e as diferenças. "Aplicar e concluir" muda o armário e
// imprime o cupom.

import { listProducts, getCountDraft, diffCount, applyCount } from '../store.js';
import { $, esc, icon, plural, toast, thumb, vibrate } from '../ui.js';
import { showReceipt } from './receipt.js';
import { tel } from '../telemetry.js';
import { countUp } from '../motion.js';

export default async function mountRevisao(root) {
  const [products, draft] = await Promise.all([listProducts(), getCountDraft()]);
  if (!draft) {
    location.replace('#/inventario');
    return;
  }
  const { changes, missing } = diffCount(products, draft);
  const missingWithStock = missing.filter((p) => p.qty > 0).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  changes.sort((a, b) => a.product.name.localeCompare(b.product.name, 'pt-BR'));
  const zeroed = new Set();

  const signed = (d) => (d > 0 ? `+${d}` : `−${Math.abs(d)}`);
  const counted = Object.keys(draft.counts).length;
  const back = draft.kind === 'tudo' ? '#/conferir' : '#/inventario';

  root.innerHTML = `
    <div class="screen screen-review has-floating-bar">
      <header class="topbar nav-bar">
        <a class="icon-btn glass-btn" href="${back}" aria-label="Voltar para conferir">${icon('chevronLeft')}</a>
        <span class="nav-title" aria-hidden="true">Revisão</span>
      </header>
      <main class="content">
        <h1 class="page-title review-title">Revisão</h1>
        <div class="review-sum">
          <div><b>${counted}</b><span>${counted === 1 ? 'conferido' : 'conferidos'}</span></div>
          <div><b>${changes.length}</b><span>${changes.length === 1 ? 'diferença' : 'diferenças'}</span></div>
          <div><b>${draft.dates || 0}</b><span>${(draft.dates || 0) === 1 ? 'data marcada' : 'datas marcadas'}</span></div>
        </div>

        ${missingWithStock.length ? `
        <section class="review-sec">
          <div class="review-head"><h2 class="list-title">Não apareceram (${missingWithStock.length})</h2>
            <button type="button" class="link-btn is-danger" data-zero-all>Zerar ${missingWithStock.length === 1 ? 'o 1' : `os ${missingWithStock.length}`}</button></div>
          <ul class="review-list">${missingWithStock.map((p) => `
            <li class="review-row" data-code="${esc(p.code)}">
              ${thumb(p)}
              <span class="row-main"><span class="row-name">${esc(p.name)}</span><span class="row-sub" data-sub>O armário diz ${p.qty}</span></span>
              <button type="button" class="btn btn-quiet btn-sm review-zero" data-zero="${esc(p.code)}" aria-pressed="false">Zerar</button>
            </li>`).join('')}</ul>
          <p class="group-note">Sem Zerar, fica como está.</p>
        </section>` : ''}

        <section class="review-sec">
          <h2 class="list-title">${changes.length ? `Diferenças (${changes.length})` : counted ? 'Tudo o que foi conferido confere' : 'Nenhum produto foi conferido'}</h2>
          ${changes.length ? `<ul class="review-list">${changes.map((c) => `
            <li class="review-row">
              ${thumb(c.product)}
              <span class="row-main"><span class="row-name">${esc(c.product.name)}</span><span class="row-sub">Era ${c.from}, contou ${c.to}</span></span>
              <span class="diff-delta ${c.to > c.from ? 'is-up' : 'is-down'}">${signed(c.to - c.from)}</span>
            </li>`).join('')}</ul>` : `<p class="empty">${counted ? 'As quantidades do armário já estavam certas.' : 'Volte e leia os produtos para conferir.'}</p>`}
        </section>
      </main>
      <footer class="floating-bar glass-regular">
        <button type="button" class="btn btn-primary btn-lg" data-apply>${icon('check')}Aplicar e concluir</button>
      </footer>
    </div>`;

  root.querySelectorAll('.review-sum b').forEach((b) => countUp(b, Number(b.textContent) || 0));

  // Zerar por linha (de novo desfaz) e "Zerar os N" de uma vez.
  function setZero(code, on) {
    const row = root.querySelector(`.review-row[data-code="${CSS.escape(code)}"]`);
    if (!row) return;
    const p = missingWithStock.find((x) => x.code === code);
    if (on) zeroed.add(code); else zeroed.delete(code);
    row.classList.toggle('is-zeroed', on);
    const btn = row.querySelector('[data-zero]');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'Manter' : 'Zerar';
    row.querySelector('[data-sub]').textContent = on ? `Vai zerar (era ${p.qty})` : `O armário diz ${p.qty}`;
  }
  root.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zero]');
    if (z) { vibrate(8); setZero(z.dataset.zero, !zeroed.has(z.dataset.zero)); return; }
    if (e.target.closest('[data-zero-all]')) {
      const all = missingWithStock.every((p) => zeroed.has(p.code));
      vibrate(10);
      missingWithStock.forEach((p) => setZero(p.code, !all));
      e.target.closest('[data-zero-all]').textContent = all ? `Zerar ${missingWithStock.length === 1 ? 'o 1' : `os ${missingWithStock.length}`}` : 'Manter todos';
    }
  });

  const applyBtn = $('[data-apply]', root);
  applyBtn.addEventListener('click', async () => {
    applyBtn.disabled = true;
    applyBtn.setAttribute('aria-busy', 'true');
    const zeroList = [...zeroed];
    try {
      const n = await applyCount(zeroList);
      // Diferenças entre o armário do app e o real: sinal de saída esquecida.
      tel('contagem', {
        contados: counted,
        jeito: draft.kind || 'contar',
        ambiente: draft.area || 'tudo',
        datas: draft.dates || 0,
        diferencas: changes.slice(0, 40).map((c) => ({ nome: c.product.name, de: c.from, para: c.to })),
        naoContados: missingWithStock.length,
        zerou: zeroList.length,
      });
      const applied = changes.map((c) => ({ name: c.product.name, from: c.from, to: c.to }))
        .concat(missingWithStock.filter((p) => zeroed.has(p.code)).map((p) => ({ name: p.name, from: p.qty, to: 0 })));
      if (n && applied.length) {
        const net = applied.reduce((a, c) => a + c.to - c.from, 0);
        await showReceipt({
          mode: 'contagem',
          lines: applied.map((c) => ({ name: c.name, value: signed(c.to - c.from), sub: `${c.from} para ${c.to}` })),
          total: { label: plural(applied.length, 'produto ajustado', 'produtos ajustados'), value: net ? signed(net) : '0' },
        });
      } else {
        toast(`Armário conferido. ${counted ? 'Tudo confere.' : ''}`, { mode: 'contagem' });
      }
      location.hash = '#/';
    } catch (err) {
      applyBtn.disabled = false;
      applyBtn.removeAttribute('aria-busy');
      toast(err.message);
    }
  });
}
