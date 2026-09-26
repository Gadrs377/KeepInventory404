// Visor da câmera compartilhado pelo leitor (entrada/saída) e pela contagem.

import { createScanner, cameraSupported } from '../scanner.js';
import { isValidCode, checkDigitOk, notaParam } from '../lookup.js';
import { $, icon, openSheet, vibrate } from '../ui.js';
import { beep } from '../sound.js';

const ERRORS = {
  denied: 'O app não tem permissão para usar a câmera. Libere a câmera para este site nas configurações do navegador, ou digite o código.',
  unsupported: 'Este navegador não dá acesso à câmera. Abra o app pelo endereço https, ou digite o código.',
  nocamera: 'Nenhuma câmera encontrada neste aparelho. Digite o código.',
  decoder: 'O leitor de código não carregou. Confira a internet e abra esta tela de novo, ou digite o código.',
};

/**
 * Monta o visor em `host`. `onCode(code)` deve devolver uma Promise; o leitor
 * volta a ler quando ela termina. Com `onNota`, o botão de QR Code põe o visor
 * no modo nota fiscal: mira quadrada, instrução e "Colar o link" como alternativa.
 */
export function mountCamera(host, { onCode, onNota = null, compact = false }) {
  host.innerHTML = `
    <div class="viewfinder ${compact ? 'is-compact' : ''}">
      <video muted playsinline aria-label="Imagem da câmera"></video>
      <div class="aim" aria-hidden="true"><span class="aim-line"></span></div>
      <p class="cam-msg" hidden></p>
      <p class="cam-loading" aria-live="polite"><span class="spinner" aria-hidden="true"></span>Abrindo a câmera</p>
      <button type="button" class="cam-hint" data-byname hidden>Não lê ou não tem código? <strong>Ver outras formas</strong></button>
      ${onNota ? '<p class="cam-qr-note" hidden>Aponte para o QR Code no fim do cupom</p><button type="button" class="cam-hint cam-paste" data-paste hidden>Não lê? <strong>Colar o link da nota</strong></button>' : ''}
      <div class="cam-tools">
        <button type="button" class="cam-tool" data-torch hidden aria-pressed="false" aria-label="Lanterna">${icon('torch')}</button>
        <button type="button" class="cam-tool" data-manual aria-label="Digitar código">${icon('keyboard')}</button>
        <button type="button" class="cam-tool" data-nocode-tool aria-label="Produto sem código de barras">${icon('package')}</button>
        ${onNota ? `<button type="button" class="cam-tool" data-nota aria-pressed="false" aria-label="Ler o QR Code da nota fiscal">${icon('qrCode')}</button>` : ''}
      </div>
    </div>`;

  const video = $('video', host);
  const aim = $('.aim', host);
  const msg = $('.cam-msg', host);
  const torchBtn = $('[data-torch]', host);
  const hintBtn = $('[data-byname]', host);
  const viewfinder = $('.viewfinder', host);
  const camLoading = $('.cam-loading', host);
  // A câmera demora um instante para abrir: a mensagem some quando a imagem chega.
  video.addEventListener('playing', () => { camLoading.hidden = true; viewfinder.classList.add('is-live'); });
  let alive = true;
  let handling = false;
  let paused = false;
  let torchOn = false;
  let hintTimer = 0;
  let qrMode = false;

  // Depois de uns segundos sem ler nada, oferece a busca pelo nome.
  const HINT_AFTER = 9000;
  function armHint() {
    clearTimeout(hintTimer);
    hintBtn.hidden = true;
    if (pasteBtn) pasteBtn.hidden = true;
    // No modo nota, a alternativa é colar o link (e aparece mais cedo).
    hintTimer = setTimeout(() => {
      if (!alive || !scanner.running || handling || paused) return;
      if (qrMode) { if (pasteBtn) pasteBtn.hidden = false; } else hintBtn.hidden = false;
    }, qrMode ? 6000 : HINT_AFTER);
  }

  async function handle(code, fn = onCode) {
    if (handling) return;
    handling = true;
    clearTimeout(hintTimer);
    hintBtn.hidden = true;
    scanner.pause();
    try {
      await fn(code);
    } finally {
      handling = false;
      if (alive && !paused) { scanner.resume(); armHint(); }
    }
  }

  const scanner = createScanner(video, {
    onCode(code) {
      if (!isValidCode(code)) {
        // QR Code da nota fiscal: importa a compra inteira (em qualquer modo).
        const p = onNota && notaParam(code);
        if (p) { beep('ok'); vibrate(40); setQrMode(false); handle(p, onNota); return; }
        if (qrMode) flash('Esse QR Code não é de nota fiscal', 'saida');
        scanner.resume();
        return;
      }
      // No modo nota, código de barras de produto não conta.
      if (qrMode) { scanner.resume(); return; }
      aim.classList.remove('is-hit');
      void aim.offsetWidth;
      aim.classList.add('is-hit');
      beep('ok');
      vibrate(40);
      handle(code);
    },
    onError({ kind }) {
      msg.textContent = ERRORS[kind] || ERRORS.nocamera;
      msg.hidden = false;
      host.querySelector('.viewfinder').classList.add('is-off');
    },
  });

  async function start() {
    await scanner.start();
    if (alive && scanner.running && qrMode) scanner.setHighRes(true);
    if (alive && scanner.running && scanner.torchAvailable()) torchBtn.hidden = false;
    if (alive && scanner.running) armHint();
  }

  torchBtn.addEventListener('click', async () => {
    torchOn = !torchOn;
    const ok = await scanner.setTorch(torchOn);
    if (!ok) torchOn = false;
    torchBtn.setAttribute('aria-pressed', String(torchOn));
  });

  $('[data-manual]', host).addEventListener('click', async () => {
    scanner.pause();
    clearTimeout(hintTimer);
    const code = await manualCodeSheet();
    if (code) await handle(code);
    else if (alive && !paused) { scanner.resume(); armHint(); }
  });

  // Modo nota fiscal: a mesma câmera, com mira quadrada e resolução maior
  // (o QR Code do cupom é denso e vem impresso pequeno).
  const notaBtn = $('[data-nota]', host);
  const qrNote = $('.cam-qr-note', host);
  const pasteBtn = $('[data-paste]', host);
  function setQrMode(on) {
    if (!notaBtn || on === qrMode) return;
    qrMode = on;
    viewfinder.classList.toggle('is-qr', on);
    notaBtn.setAttribute('aria-pressed', String(on));
    qrNote.hidden = !on;
    hintBtn.hidden = true;
    pasteBtn.hidden = true;
    scanner.setHighRes(on);
    if (alive && scanner.running && !paused) armHint();
  }
  if (notaBtn) {
    notaBtn.addEventListener('click', () => { vibrate(8); setQrMode(!qrMode); });
    pasteBtn.addEventListener('click', async () => {
      scanner.pause();
      clearTimeout(hintTimer);
      pasteBtn.hidden = true;
      const { notaEntrySheet } = await import('./nota.js');
      const p = await notaEntrySheet();
      if (p) { setQrMode(false); await handle(p, onNota); }
      else if (alive && !paused) { scanner.resume(); armHint(); }
    });
  }

  // Produto sem código de barras: abre as formas de registrar sem ler código.
  $('[data-nocode-tool]', host).addEventListener('click', () => handle(`SEM-${Date.now()}`));

  // Sem código: a folha abre direto na busca pelo nome.
  hintBtn.addEventListener('click', () => handle(`SEM-${Date.now()}`));

  const onVisibility = () => {
    if (!alive) return;
    if (document.hidden) scanner.stop();
    else if (!scanner.running) start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  if (cameraSupported()) start();
  else scanner.start(); // dispara a mensagem de "sem suporte"

  // Confirmação em cima da imagem ("+1 Leite Moça"): sobe e some, para quem
  // está olhando o pacote e não o rodapé da tela.
  function flash(text, mode) {
    const pop = document.createElement('p');
    pop.className = `cam-pop mode-${mode}`;
    pop.setAttribute('aria-hidden', 'true');
    pop.textContent = text;
    viewfinder.querySelectorAll('.cam-pop').forEach((el) => el.remove());
    viewfinder.append(pop);
    setTimeout(() => pop.remove(), 1600);
  }

  return {
    handle,
    flash,
    setQrMode,
    pause() {
      paused = true;
      clearTimeout(hintTimer);
      hintBtn.hidden = true;
      scanner.pause();
    },
    resume() {
      paused = false;
      if (alive && !handling) { scanner.resume(); armHint(); }
    },
    stop() {
      alive = false;
      clearTimeout(hintTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      scanner.stop();
    },
  };
}

export function manualCodeSheet() {
  return openSheet({
    label: 'Digitar código',
    render(body, close) {
      body.innerHTML = `
        <h2 class="sheet-title">Código de barras</h2>
        <form class="stack" novalidate>
          <div class="field">
            <label class="field-label" for="manual-code">Números embaixo das barras</label>
            <input class="input input-code" id="manual-code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="7891000100103" maxlength="14" aria-describedby="manual-code-error">
            <p class="field-error" id="manual-code-error" hidden></p>
          </div>
          <button type="submit" class="btn btn-primary">${icon('search')}Buscar produto</button>
          <button type="button" class="btn btn-quiet" data-nocode>${icon('package')}Produto sem código de barras</button>
        </form>`;
      const form = $('form', body);
      const input = $('input', body);
      const error = $('.field-error', body);
      setTimeout(() => input.focus(), 250);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = input.value.replace(/\D/g, '');
        if (!isValidCode(code)) {
          error.textContent = 'Digite os 8 a 14 números que aparecem embaixo das barras.';
          error.hidden = false;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        if (!checkDigitOk(code)) {
          error.textContent = 'Esses números não conferem: o último é um dígito de controle. Confira na embalagem e digite de novo.';
          error.hidden = false;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return;
        }
        close(code);
      });
      $('[data-nocode]', body).addEventListener('click', () => close(`SEM-${Date.now()}`));
    },
  });
}
