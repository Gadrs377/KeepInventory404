// Cupom do fim da sessão: sai da "impressora" com a borda de baixo rasgada.
// Serve para Entrada, Saída e Contagem. Pode ser compartilhado como texto.

import { $, esc, openSheet, plural, shareText, icon, vibrate } from '../ui.js';
import { saveReceipt } from '../store.js';

const TITLE = { entrada: 'Guardado', saida: 'Tirado', contagem: 'Conferido', misto: 'Guardado e tirado' };

const stampFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * lines: [{ name, value, sub? }]   value já com sinal ("+2", "−1")
 * total: { label, value }
 * Resolve quando a pessoa fecha. Sem `at`, é um cupom novo: é guardado no
 * histórico. Com `at`, é um cupom antigo aberto de novo pelo histórico.
 */
export function showReceipt({ mode, lines, total, note = '', at }) {
  const isNew = !at;
  const stamp = stampFmt.format(new Date(at || Date.now())).replace(',', '');
  if (isNew) saveReceipt({ mode, lines, total }).catch(() => {});
  return openSheet({
    mode,
    label: 'Cupom',
    className: 'sheet-solid',
    render(body, close) {
      body.innerHTML = `
        <h2 class="sheet-title">${isNew ? 'Pronto' : 'Cupom'}</h2>
        <button type="button" class="icon-btn sheet-share" data-share aria-label="Compartilhar cupom">${icon('share')}</button>
        <div class="receipt-stage">
          <div class="printer-slot" aria-hidden="true"></div>
          <div class="ticket-clip">
            <article class="ticket mode-${mode}" aria-label="Cupom" style="--print-ms: ${Math.min(1700, 600 + lines.length * 110)}ms">
              <header class="ticket-head">
                <p class="ticket-title">${TITLE[mode]}</p>
                <p class="ticket-meta">${esc(stamp)}</p>
              </header>
              <ul class="ticket-lines">
                ${lines.map((l) => `
                  <li class="ticket-line">
                    <span class="ticket-row">
                      <span class="ticket-name">${esc(l.name)}</span>
                      <span class="ticket-dots" aria-hidden="true"></span>
                      <span class="ticket-n">${esc(l.value)}</span>
                    </span>
                    ${l.sub ? `<span class="ticket-sub">${esc(l.sub)}</span>` : ''}
                  </li>`).join('')}
              </ul>
              <p class="ticket-total"><span>${esc(total.label)}</span><span class="ticket-n">${esc(total.value)}</span></p>
              ${note ? `<p class="ticket-note">${esc(note)}</p>` : ''}
              <p class="ticket-foot" aria-hidden="true"><span class="ticket-barcode"></span>ARMÁRIO ATUALIZADO</p>
            </article>
          </div>
        </div>
        <p class="ticket-hint">Toque fora do cupom para fechar.</p>`;

      // O cupom desce da impressora (CSS); o celular vibra de leve como o papel saindo.
      if (isNew && !matchMedia('(prefers-reduced-motion: reduce)').matches) vibrate([12, 70, 12, 70, 12]);

      // Como uma notificação de pagamento: o cupom é a tela; tocar fora fecha.
      body.addEventListener('click', (e) => {
        if (e.target.closest('.ticket, [data-share]')) return;
        close(true);
      });
      $('[data-share]', body).addEventListener('click', () => {
        const text = [
          `${TITLE[mode]} ${stamp}`,
          '',
          ...lines.map((l) => `${l.name}: ${l.value}${l.sub ? ` (${l.sub})` : ''}`),
          '',
          `${total.label}: ${total.value}`,
        ].join('\n');
        shareText(`${TITLE[mode]} do armário`, text);
      });
    },
  });
}

export function receiptTotal(count, units, sign) {
  return { label: plural(count, 'produto', 'produtos'), value: `${sign}${units}` };
}
