// Histórico de cupons: cada Entrada, Saída ou Contagem concluída.

import { listReceipts } from '../store.js';
import { showReceipt } from './receipt.js';
import { $, esc, icon, tabBar, plural } from '../ui.js';
import { stagger } from '../motion.js';

let cascaded = false; // a lista entra em cascata só na primeira vez da sessão

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
  entrada: { icon: 'in', title: (r) => `Guardou ${plural(r.lines.length, 'produto', 'produtos')}` },
  saida: { icon: 'out', title: (r) => `Tirou ${plural(r.lines.length, 'produto', 'produtos')}` },
  contagem: { icon: 'listChecks', title: () => 'Conferiu o armário' },
  misto: { icon: 'receipt', title: (r) => `Guardou e tirou, ${plural(r.lines.length, 'produto', 'produtos')}` },
};
// Nota fiscal: "Nota fiscal do Zaffari" (a nota do cupom diz "Zaffari, R$ 160,59").
const titleOf = (r) => (r.note && r.mode === 'entrada' ? `Nota fiscal do ${r.note.split(',')[0]}` : (INFO[r.mode] || INFO.entrada).title(r));
const subOf = (r) => [timeFmt.format(new Date(r.at)), r.mode === 'contagem' ? r.total.label : r.note ? plural(r.lines.length, 'item', 'itens') : ''].filter(Boolean).join(', ');

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
          const mode = r.note && r.mode === 'entrada' ? 'nota' : r.mode;
          return `${head}
          <li>
            <button type="button" class="row cupom-row mode-${esc(mode === 'nota' ? 'entrada' : r.mode)}" data-i="${i}">
              <span class="cupom-icon is-${esc(mode)}" aria-hidden="true">${icon(mode === 'nota' ? 'receipt' : info.icon)}</span>
              <span class="row-main">
                <span class="row-name">${esc(titleOf(r))}</span>
                <span class="row-sub">${esc(subOf(r))}</span>
              </span>
              <span class="cupom-total">${esc(r.total.value)}</span>
              ${icon('chevron', 'row-chevron')}
            </button>
          </li>`;
        }).join('') + '</ul>'
        : `<div class="empty-state">
            <span class="empty-icon is-receipt" aria-hidden="true">${icon('receipt')}</span>
            <p class="empty-lead">Nenhum cupom ainda</p>
            <p>Ao concluir no leitor ou aplicar o Conferir, o cupom fica aqui.</p>
            <a class="btn btn-primary" href="#/entrada">${icon('barcode')}Abrir o leitor</a>
          </div>`}
      </main>
      ${tabBar('cupons')}
    </div>`;

  const rows = $('.content', root);
  if (!cascaded && list.length) { cascaded = true; stagger(root.querySelectorAll('.cupom-row'), { step: 40, max: 10 }); }
  if (list.length) {
    rows.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-i]');
      const r = btn && list[Number(btn.dataset.i)];
      if (r) showReceipt({ ...r });
    });
  }
}
