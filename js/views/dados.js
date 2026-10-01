// Backup, restauração, planilha e histórico geral.

import { exportData, importData, listProducts, recentMovements } from '../store.js';
import { $, esc, icon, toast, when, confirmSheet, download, tabBar, openSheet } from '../ui.js';
import { askTilt } from '../motion.js';
import { backupNow, lastBackupAt, backupKey, formatCode, fetchBackup, restoreBackup } from '../backup.js';
import { beep, soundEnabled, setSoundEnabled } from '../sound.js';
import { debugEnabled, setDebugEnabled } from '../expiryDebug.js';

const tiltOn = () => { try { return localStorage.getItem('ki.tilt') !== '0'; } catch { return true; } };

export default async function mountDados(root) {
  const [products, movements] = await Promise.all([listProducts(), recentMovements(60)]);
  const names = Object.fromEntries(products.map((p) => [p.code, p.name]));
  let persisted = false;
  // Já instalado na tela de início: a explicação de como instalar sobra.
  const installed = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch { /* sem suporte */ }

  const label = (m) => ({
    entrada: `Guardou ${m.delta}`,
    saida: `Tirou ${Math.abs(m.delta)}`,
    descarte: `Jogou fora ${Math.abs(m.delta)}`,
    ajuste: `Ajustou para ${m.qtyAfter} (eram ${m.qtyBefore})`,
    contagem: `Contou ${m.qtyAfter} (eram ${m.qtyBefore})`,
  }[m.type] || m.type);

  root.innerHTML = `
    <div class="screen screen-data has-tabbar">
      <header class="home-head">
        <h1 class="page-title">Mais</h1>
      </header>
      <main class="content stack">
        <h2 class="list-title">Armário</h2>
        <ul class="group">
          <li><button type="button" class="group-row" data-conferir aria-haspopup="menu"><span class="group-icon is-contagem">${icon('listChecks')}</span><span class="group-label">Conferir o armário</span>${icon('chevron', 'group-chevron')}</button></li>
          <li><a class="group-row" href="#/cupons"><span class="group-icon">${icon('receipt')}</span><span class="group-label">Cupons</span>${icon('chevron', 'group-chevron')}</a></li>
        </ul>

        <h2 class="list-title">Dados</h2>
        <ul class="group">
          <li><button type="button" class="group-row" data-auto><span class="group-icon">${icon('upload')}</span><span class="group-label">Cópia automática</span><span class="group-value" data-auto-at>${autoText()}</span></button></li>
          <li><button type="button" class="group-row" data-export><span class="group-icon">${icon('download')}</span><span class="group-label">Baixar uma cópia</span></button></li>
          <li><button type="button" class="group-row" data-restore-auto><span class="group-icon">${icon('upload')}</span><span class="group-label">Restaurar uma cópia</span>${icon('chevron', 'group-chevron')}</button></li>
          <li><button type="button" class="group-row" data-csv><span class="group-icon">${icon('table')}</span><span class="group-label">Baixar planilha</span></button></li>
        </ul>
        <p class="group-note">Uma cópia vai sozinha para o servidor do app sempre que o armário muda. Para levar o armário a outro celular, use "Restaurar uma cópia" com o código desta casa.${persisted ? ' Neste celular, os dados estão protegidos contra limpeza automática.' : ''}</p>

        <h2 class="list-title">Som e movimento</h2>
        <ul class="group">
          <li><label class="group-row"><span class="group-icon">${icon('sound')}</span><span class="group-label">Bip ao ler um código</span><input type="checkbox" class="switch" data-sound ${soundEnabled() ? 'checked' : ''}></label></li>
          <li><label class="group-row"><span class="group-icon">${icon('sparkle')}</span><span class="group-label">Reagir ao movimento do celular</span><input type="checkbox" class="switch" data-tilt ${tiltOn() ? 'checked' : ''}></label></li>
        </ul>
        <p class="group-note">A caixa do remédio e os ícones do "Pede atenção" mexem um pouquinho quando o celular inclina.</p>

        <section class="install-note" ${installed ? 'hidden' : ''}>
          <h2 class="list-title">Instalar no celular</h2>
          <p class="group-note">iPhone: no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Android: no Chrome, abra o menu e toque em Instalar app.</p>
        </section>

        <section>
          <h2 class="list-title">Últimos registros</h2>
          ${movements.length ? `<ul class="history">${movements.map((m) => `
            <li class="history-item history-log type-${m.type}">
              <strong class="history-name">${esc(names[m.code] || 'Produto removido')}</strong>
              <span class="history-at">${when(m.at)}</span>
              <span class="history-type">${esc(label(m))}</span>
              <span class="history-qty">ficou ${m.qtyAfter}</span>
            </li>`).join('')}</ul>` : '<p class="empty">Nenhum registro ainda.</p>'}
        </section>
        <h2 class="list-title">Avançado</h2>
        <ul class="group">
          <li><label class="group-row"><span class="group-icon">${icon('fileText')}</span><span class="group-label">Diagnóstico da leitura de validade</span><input type="checkbox" class="switch" data-debug ${debugEnabled() ? 'checked' : ''}></label></li>
          <li><a class="group-row" href="#/testes"><span class="group-icon">${icon('bolt')}</span><span class="group-label">Testes (leitor com GPU)</span>${icon('chevron', 'group-chevron')}</a></li>
        </ul>
        <p class="group-note">O diagnóstico mostra, embaixo da câmera, o que o leitor viu em cada tentativa e por que não confirmou.</p>
      </main>
      ${tabBar('mais')}
    </div>`;

  $('[data-tilt]', root).addEventListener('change', (e) => {
    try { localStorage.setItem('ki.tilt', e.target.checked ? '1' : '0'); } catch { /* sem armazenamento */ }
    if (e.target.checked) askTilt();
  });
  $('[data-sound]', root).addEventListener('change', (e) => {
    setSoundEnabled(e.target.checked);
    if (e.target.checked) beep('ok');
  });

  $('[data-debug]', root).addEventListener('change', (e) => setDebugEnabled(e.target.checked));

  // Cópia automática: tocar faz uma agora.
  const autoAt = $('[data-auto-at]', root);
  $('[data-auto]', root).addEventListener('click', async () => {
    autoAt.textContent = 'Copiando…';
    try {
      await backupNow();
      autoAt.textContent = autoText();
      toast('Cópia feita.', { duration: 2000 });
    } catch {
      autoAt.textContent = autoText();
      toast('Sem internet para copiar agora. Tenta de novo sozinho mais tarde.', { duration: 3500 });
    }
  });

  $('[data-restore-auto]', root).addEventListener('click', () => {
    openSheet({
      label: 'Restaurar uma cópia',
      render(body, close) {
        body.innerHTML = `
          <h2 class="sheet-title">Restaurar uma cópia</h2>
          <p class="sheet-text">Código desta casa:</p>
          <p class="backup-code" data-code>${esc(formatCode(backupKey()))}</p>
          <button type="button" class="btn btn-quiet btn-sm" data-copy>${icon('share')}Copiar o código</button>
          <form class="stack" novalidate>
            <label class="field"><span class="field-label">Código da cópia</span>
              <input class="input" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ex.: A1B2 C3D4 …" aria-describedby="restore-note"></label>
            <p class="field-note" id="restore-note">No outro celular, abra Mais › Restaurar uma cópia e copie o código de lá. Tudo o que está no armário deste celular é substituído.</p>
            <button type="submit" class="btn btn-primary btn-lg">${icon('download')}Buscar a cópia</button>
          </form>
          <label class="btn btn-quiet file-btn restore-file">${icon('upload')}<span>Usar um arquivo baixado</span><input type="file" accept="application/json,.json" data-import class="sr-only"></label>`;
        $('[data-import]', body).addEventListener('change', (e) => { close(null); restoreFile(e); });
        $('[data-copy]', body).addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(formatCode(backupKey())); toast('Código copiado.', { duration: 2000 }); } catch { toast('Não deu para copiar. Anote o código.', { duration: 3000 }); }
        });
        $('form', body).addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = $('button[type=submit]', body);
          btn.disabled = true;
          try {
            const fetched = await fetchBackup($('input[name=code]', body).value);
            const n = (fetched.data.products || []).length;
            close(null);
            const ok = await confirmSheet({
              title: `Restaurar ${n === 1 ? '1 produto' : `${n} produtos`}?`,
              text: `Cópia de ${new Date(fetched.t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Tudo o que está no armário agora será substituído.`,
              confirm: 'Restaurar a cópia',
              danger: true,
            });
            if (!ok) return;
            const count = await restoreBackup(fetched);
            toast(`Cópia restaurada com ${count} produtos.`);
            location.hash = '#/';
          } catch (err) {
            btn.disabled = false;
            toast(err.message, { duration: 4000 });
          }
        });
      },
    });
  });

  $('[data-export]', root).addEventListener('click', async () => {
    const data = await exportData();
    download(`armario-copia-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('Cópia baixada.', { duration: 2500 });
  });

  $('[data-csv]', root).addEventListener('click', async () => {
    const list = (await listProducts()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Produto', 'Marca', 'Tamanho', 'Quantidade', 'Avisar com', 'Código'].map(cell).join(';')]
      .concat(list.map((p) => [p.name, p.brand, p.size, p.qty, p.minQty, p.code].map(cell).join(';')));
    download(`armario-${today()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
    toast('Planilha baixada.', { duration: 2500 });
  });

  async function restoreFile(e) {
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
      toast(`Cópia restaurada com ${n} produtos.`);
      location.hash = '#/';
    } catch (err) {
      toast(err.message);
    }
  }

  $('[data-conferir]', root).addEventListener('click', async (e) => {
    const { conferirMenu } = await import('./conferirMenu.js');
    conferirMenu(e.currentTarget);
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// "Hoje, 01:49", "Ontem, 22:10", "29/09", ou ainda nada.
function autoText() {
  const t = lastBackupAt();
  if (!t) return 'Ainda não fez';
  const d = new Date(t);
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return `Hoje, ${hm}`;
  if (days === 1) return `Ontem, ${hm}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

