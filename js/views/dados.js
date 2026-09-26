// Backup, restauração, planilha e histórico geral.

import { exportData, importData, listProducts, recentMovements } from '../store.js';
import { $, esc, icon, toast, when, confirmSheet, download } from '../ui.js';
import { beep, soundEnabled, setSoundEnabled } from '../sound.js';

export default async function mountDados(root) {
  const [products, movements] = await Promise.all([listProducts(), recentMovements(60)]);
  const names = Object.fromEntries(products.map((p) => [p.code, p.name]));
  let persisted = false;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch { /* sem suporte */ }

  const label = (m) => ({
    entrada: `Entrada de ${m.delta}`,
    saida: `Saída de ${Math.abs(m.delta)}`,
    ajuste: `Ajuste ${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)}`,
    contagem: `Contagem ${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)}`,
  }[m.type] || m.type);

  root.innerHTML = `
    <div class="screen screen-data">
      <header class="topbar">
        <a class="icon-btn" href="#/" aria-label="Voltar ao armário">${icon('back')}</a>
        <h1 class="topbar-title">Dados</h1>
      </header>
      <main class="content stack">
        <p class="lead">Seus dados ficam só neste celular${persisted ? ', protegidos contra limpeza automática do navegador' : ''}. Baixe um backup de vez em quando.</p>
        <div class="stack-sm">
          <button type="button" class="btn btn-primary" data-export>Baixar backup</button>
          <label class="btn btn-quiet file-btn">Restaurar backup<input type="file" accept="application/json,.json" data-import class="sr-only"></label>
          <button type="button" class="btn btn-quiet" data-csv>Baixar planilha</button>
        </div>

        <section>
          <h2 class="list-title">Som</h2>
          <label class="switch-row">
            <span>Bip ao ler um código</span>
            <input type="checkbox" class="switch" data-sound ${soundEnabled() ? 'checked' : ''}>
          </label>
        </section>

        <section>
          <h2 class="list-title">Instalar no celular</h2>
          <p class="sheet-text">No Android, abra o menu do Chrome e toque em Instalar app. No iPhone, toque em Compartilhar no Safari e depois em Adicionar à Tela de Início.</p>
        </section>

        <section>
          <h2 class="list-title">Últimos registros</h2>
          ${movements.length ? `<ul class="history">${movements.map((m) => `
            <li class="history-item type-${m.type}">
              <span><strong>${esc(names[m.code] || 'Produto removido')}</strong> ${esc(label(m))}</span>
              <span class="history-qty">ficou ${m.qtyAfter}</span>
              <span class="history-when">${when(m.at)}</span>
            </li>`).join('')}</ul>` : '<p class="empty">Nenhum registro ainda.</p>'}
        </section>
      </main>
    </div>`;

  $('[data-sound]', root).addEventListener('change', (e) => {
    setSoundEnabled(e.target.checked);
    if (e.target.checked) beep('ok');
  });

  $('[data-export]', root).addEventListener('click', async () => {
    const data = await exportData();
    download(`armario-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('Backup baixado.', { duration: 2500 });
  });

  $('[data-csv]', root).addEventListener('click', async () => {
    const list = (await listProducts()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Produto', 'Marca', 'Tamanho', 'Quantidade', 'Avisar com', 'Código'].map(cell).join(';')]
      .concat(list.map((p) => [p.name, p.brand, p.size, p.qty, p.minQty, p.code].map(cell).join(';')));
    download(`armario-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
    toast('Planilha baixada.', { duration: 2500 });
  });

  $('[data-import]', root).addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast('Não foi possível ler esse arquivo. Escolha um backup .json baixado por este app.');
      return;
    }
    const ok = await confirmSheet({
      title: 'Restaurar este backup?',
      text: 'Tudo o que está no armário agora será substituído pelo conteúdo do arquivo.',
      confirm: 'Restaurar backup',
      danger: true,
    });
    if (!ok) return;
    try {
      const n = await importData(data);
      toast(`Backup restaurado com ${n} produtos.`);
      location.hash = '#/';
    } catch (err) {
      toast(err.message);
    }
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
