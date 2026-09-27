// Histórico de cupons: cada Entrada, Saída ou Contagem concluída.

import { listReceipts } from '../store.js';
import { showReceipt } from './receipt.js';
import { $, esc, icon, tabBar } from '../ui.js';

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

// Seções por dia, como no app Carteira: Hoje, Ontem, "segunda-feira, 22 de setembro".
function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yest.toDateString()) return 'Ontem';
  const s = dayFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const INFO = {
  entrada: { title: 'Entrada', icon: 'in' },
  saida: { title: 'Saída', icon: 'out' },
  contagem: { title: 'Contagem', icon: 'count' },
  misto: { title: 'Entrada e saída', icon: 'receipt' },
};

export default async function mountCupons(root) {
  const list = await listReceipts();
  root.innerHTML = `
    <div class="screen screen-cupons has-tabbar">
      <header class="home-head">
        <h1 class="page-title">Cupons</h1>
      </header>
      <main class="content">
        ${list.length ? list.map((r, i) => {
          const info = INFO[r.mode] || INFO.entrada;
          const day = dayLabel(r.at);
          const head = i === 0 || dayLabel(list[i - 1].at) !== day
            ? `${i ? '</ul>' : ''}<h2 class="list-title">${day}</h2><ul class="rows cupons">` : '';
          return `${head}
          <li>
            <button type="button" class="row cupom-row mode-${esc(r.mode)}" data-i="${i}">
              <span class="cupom-icon" aria-hidden="true">${icon(info.icon)}</span>
              <span class="row-main">
                <span class="row-name">${info.title}, ${esc(r.total.label)}</span>
                <span class="row-sub">${timeFmt.format(new Date(r.at))}</span>
              </span>
              <span class="cupom-total">${esc(r.total.value)}</span>
            </button>
          </li>`;
        }).join('') + '</ul>'
        : `<div class="empty-state">
            <p class="empty-lead">Nenhum cupom ainda</p>
            <p>Ao concluir uma leitura ou uma contagem, o cupom fica aqui.</p>
            <a class="btn btn-primary" href="#/entrada">${icon('barcode')}Abrir o leitor</a>
          </div>`}
      </main>
      ${tabBar('cupons')}
    </div>`;

  const rows = $('.content', root);
  if (list.length) {
    rows.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-i]');
      const r = btn && list[Number(btn.dataset.i)];
      if (r) showReceipt({ ...r });
    });
  }
}
