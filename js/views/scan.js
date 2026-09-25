// Leitor em modo Entrada ou Saída.

import { mountCamera } from './camera.js';
import { showProductSheet } from './productSheet.js';
import { undoMovement } from '../store.js';
import { warmUp } from '../scanner.js';
import { $, esc, icon, toast, plural } from '../ui.js';

const COPY = {
  entrada: { title: 'Entrada', hint: 'Aponte para o código de barras do que está guardando', session: 'Nesta entrada', sign: '+' },
  saida: { title: 'Saída', hint: 'Aponte para o código de barras do que está tirando', session: 'Nesta saída', sign: '−' },
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
      <section class="session" aria-live="polite">
        <p class="session-summary"></p>
        <ul class="session-list"></ul>
        <a class="btn btn-primary" href="#/" data-done>Concluir</a>
      </section>
    </div>`;

  const summary = $('.session-summary', root);
  const list = $('.session-list', root);

  function renderSession() {
    if (!session.length) {
      summary.textContent = 'Nada registrado ainda.';
      list.innerHTML = '';
      return;
    }
    const units = session.reduce((a, s) => a + s.n, 0);
    summary.textContent = `${copy.session}: ${plural(session.length, 'registro', 'registros')}, ${plural(units, 'unidade', 'unidades')}`;
    list.innerHTML = session.slice().reverse().slice(0, 6).map((s) => `
      <li><span class="session-name">${esc(s.product.name)}</span><span class="session-n">${copy.sign}${s.n}</span></li>`).join('');
  }

  async function handleCode(code) {
    const r = await showProductSheet({ mode, code });
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
