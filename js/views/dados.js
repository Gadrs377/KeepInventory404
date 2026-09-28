// Backup, restauração, planilha e histórico geral.

import { exportData, importData, listProducts, recentMovements } from '../store.js';
import { $, esc, icon, toast, when, confirmSheet, download, tabBar } from '../ui.js';
import { beep, soundEnabled, setSoundEnabled } from '../sound.js';
import { debugEnabled, setDebugEnabled } from '../expiryDebug.js';

export default async function mountDados(root) {
  const [products, movements] = await Promise.all([listProducts(), recentMovements(60)]);
  const names = Object.fromEntries(products.map((p) => [p.code, p.name]));
  let persisted = false;
  // Já instalado na tela de início: a explicação de como instalar sobra.
  const installed = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch { /* sem suporte */ }

  const label = (m) => ({
    entrada: `Entrada de ${m.delta}`,
    saida: `Saída de ${Math.abs(m.delta)}`,
    ajuste: `Ajuste ${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)}`,
    contagem: `Contagem ${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)}`,
  }[m.type] || m.type);

  root.innerHTML = `
    <div class="screen screen-data has-tabbar">
      <header class="home-head">
        <h1 class="page-title">Mais</h1>
      </header>
      <main class="content stack">
        <ul class="group" aria-label="Atalhos">
          <li><a class="group-row" href="#/inventario"><span class="group-icon is-contagem">${icon('count')}</span><span class="group-label">Contar o armário</span>${icon('chevron', 'group-chevron')}</a></li>
        </ul>

        <h2 class="list-title">Backup</h2>
        <ul class="group">
          <li><button type="button" class="group-row" data-export><span class="group-icon">${icon('download')}</span><span class="group-label">Baixar backup</span></button></li>
          <li><label class="group-row file-btn"><span class="group-icon">${icon('upload')}</span><span class="group-label">Restaurar backup</span><input type="file" accept="application/json,.json" data-import class="sr-only"></label></li>
          <li><button type="button" class="group-row" data-csv><span class="group-icon">${icon('table')}</span><span class="group-label">Baixar planilha</span></button></li>
        </ul>
        <p class="group-note">Os dados ficam só neste celular${persisted ? ', protegidos contra limpeza automática' : ''}. Baixe um backup de vez em quando.</p>

        <h2 class="list-title">Som</h2>
        <ul class="group">
          <li><label class="group-row"><span class="group-icon">${icon('sound')}</span><span class="group-label">Bip ao ler um código</span><input type="checkbox" class="switch" data-sound ${soundEnabled() ? 'checked' : ''}></label></li>
        </ul>

        <h2 class="list-title">Ajuda para melhorar</h2>
        <ul class="group">
          <li><label class="group-row"><span class="group-icon">${icon('fileText')}</span><span class="group-label">Diagnóstico da leitura de validade</span><input type="checkbox" class="switch" data-debug ${debugEnabled() ? 'checked' : ''}></label></li>
        </ul>
        <p class="group-note">Mostra, embaixo da câmera, o que o leitor viu em cada tentativa e por que não confirmou. Tem um botão para copiar tudo e mandar para quem cuida do app.</p>
        <ul class="group">
          <li><a class="group-row" href="#/testes"><span class="group-icon">${icon('bolt')}</span><span class="group-label">Testes (leitor com GPU)</span>${icon('chevron', 'group-chevron')}</a></li>
        </ul>

        <section class="install-note" ${installed ? 'hidden' : ''}>
          <h2 class="list-title">Instalar no celular</h2>
          <p class="group-note">iPhone: no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Android: no Chrome, abra o menu e toque em Instalar app.</p>
        </section>

        <section>
          <h2 class="list-title">Últimos registros</h2>
          ${movements.length ? `<ul class="history">${movements.map((m) => `
            <li class="history-item history-log type-${m.type}">
              <strong class="history-name">${esc(names[m.code] || 'Produto removido')}</strong>
              <span class="history-qty">ficou ${m.qtyAfter}</span>
              <span class="history-when"><span class="history-type">${esc(label(m))}</span> · ${when(m.at)}</span>
            </li>`).join('')}</ul>` : '<p class="empty">Nenhum registro ainda.</p>'}
        </section>
      </main>
      ${tabBar('mais')}
    </div>`;

  $('[data-sound]', root).addEventListener('change', (e) => {
    setSoundEnabled(e.target.checked);
    if (e.target.checked) beep('ok');
  });

  $('[data-debug]', root).addEventListener('change', (e) => setDebugEnabled(e.target.checked));

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
      toast('Não deu para ler esse arquivo. Escolha um backup baixado em Mais.');
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
