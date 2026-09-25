// Leitor em modo Entrada ou Saída. O que foi registrado aparece como um cupom.

import { mountCamera } from './camera.js';
import { showProductSheet } from './productSheet.js';
import { undoMovement } from '../store.js';
import { warmUp } from '../scanner.js';
import { $, esc, icon, toast, plural } from '../ui.js';

const COPY = {
  entrada: { title: 'Entrada', hint: 'Aponte para o código de barras do que está guardando', sign: '+', empty: 'Os produtos que você guardar aparecem aqui.' },
  saida: { title: 'Saída', hint: 'Aponte para o código de barras do que está tirando', sign: '−', empty: 'Os produtos que você tirar aparecem aqui.' },
};

export default function mountScan(root, { mode, code: initialCode }) {
  const copy = COPY[mode];
  const session = []; // { movement, product, n }
  warmUp();

  root.innerHTML = `
    <div class="screen screen-scan mode-${mode}">
      <header class="band">
        <div class="band-text">
          <h1 class="band-title">${copy.title}</h1>
          <p class="band-hint">${copy.hint}</p>
        </div>
        <a class="icon-btn" href="#/" aria-label="Fechar e voltar ao armário">${icon('close')}</a>
      </header>
      <div class="cam-host"></div>
      <section class="receipt" aria-live="polite" aria-label="Registros desta ${copy.title.toLowerCase()}">
        <ul class="receipt-lines"></ul>
        <p class="receipt-total"></p>
      </section>
      <footer class="footer-bar">
        <a class="btn btn-primary btn-lg" href="#/">Concluir</a>
      </footer>
    </div>`;

  const lines = $('.receipt-lines', root);
  const total = $('.receipt-total', root);

  function renderSession() {
    if (!session.length) {
      lines.innerHTML = `<li class="receipt-empty">${copy.empty}</li>`;
      total.hidden = true;
      return;
    }
    const units = session.reduce((a, s) => a + s.n, 0);
    lines.innerHTML = session.slice().reverse().map((s) => `
      <li class="receipt-line">
        <span class="receipt-name">${esc(s.product.name)}</span>
        <span class="receipt-dots" aria-hidden="true"></span>
        <span class="receipt-n">${copy.sign}${s.n}</span>
      </li>`).join('');
    total.hidden = false;
    total.innerHTML = `<span>${plural(session.length, 'produto', 'produtos')}</span><span class="receipt-n">${copy.sign}${units}</span>`;
  }

  async function handleCode(barcode) {
    const r = await showProductSheet({ mode, barcode });
    if (!r) return;
    if (r.kind === 'switch') {
      location.hash = `#/entrada/${encodeURIComponent(r.code)}`;
      return;
    }
    const entry = { movement: r.movement, product: r.product, n: r.n };
    session.push(entry);
    renderSession();
    const verb = mode === 'entrada' ? `Adicionado ${r.n}` : `Baixa de ${r.n}`;
    toast(`${verb}. ${r.product.name} agora tem ${r.product.qty}.`, {
      mode,
      action: 'Desfazer',
      onAction: async () => {
        try {
          await undoMovement(r.movement.id);
          session.splice(session.indexOf(entry), 1);
          renderSession();
          toast('Registro desfeito.', { duration: 2500 });
        } catch (err) {
          toast(err.message, { duration: 4000 });
        }
      },
    });
  }

  renderSession();
  const cam = mountCamera($('.cam-host', root), { onCode: handleCode });
  if (initialCode) cam.handle(initialCode);

  return () => cam.stop();
}
