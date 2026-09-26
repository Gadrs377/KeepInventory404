// Histórico de cupons: cada Entrada, Saída ou Contagem concluída.

import { listReceipts } from '../store.js';
import { showReceipt } from './receipt.js';
import { $, esc, icon, when } from '../ui.js';

const INFO = {
  entrada: { title: 'Entrada', icon: 'in' },
  saida: { title: 'Saída', icon: 'out' },
  contagem: { title: 'Contagem', icon: 'count' },
  misto: { title: 'Entrada e saída', icon: 'receipt' },
};

export default async function mountCupons(root) {
  const list = await listReceipts();
  root.innerHTML = `
    <div class="screen screen-cupons">
      <header class="topbar">
        <a class="icon-btn" href="#/dados" aria-label="Voltar para Mais">${icon('back')}</a>
        <h1 class="topbar-title">Cupons</h1>
      </header>
      <main class="content">
        ${list.length ? `<ul class="rows cupons">${list.map((r, i) => {
          const info = INFO[r.mode] || INFO.entrada;
          return `
          <li>
            <button type="button" class="row cupom-row mode-${esc(r.mode)}" data-i="${i}">
              <span class="cupom-icon" aria-hidden="true">${icon(info.icon)}</span>
              <span class="row-main">
                <span class="row-name">${info.title}, ${esc(r.total.label)}</span>
                <span class="row-sub">${when(r.at)}</span>
              </span>
              <span class="cupom-total">${esc(r.total.value)}</span>
            </button>
          </li>`;
        }).join('')}</ul>`
        : `<div class="empty-state">
            <p class="empty-lead">Nenhum cupom ainda.</p>
            <p>Os cupons aparecem aqui quando você toca em Concluir numa entrada, numa saída ou depois de aplicar uma contagem.</p>
          </div>`}
      </main>
    </div>`;

  const rows = $('.cupons', root);
  if (rows) {
    rows.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-i]');
      const r = btn && list[Number(btn.dataset.i)];
      if (r) showReceipt({ ...r });
    });
  }
}
