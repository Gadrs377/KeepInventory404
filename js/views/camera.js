// Visor da câmera compartilhado pelo leitor (entrada/saída) e pela contagem.

import { createScanner, cameraSupported } from '../scanner.js';
import { isValidCode } from '../lookup.js';
import { $, icon, openSheet, vibrate } from '../ui.js';
import { beep } from '../sound.js';

const ERRORS = {
  denied: 'O app não tem permissão para usar a câmera. Libere a câmera para este site nas configurações do navegador, ou digite o código.',
  unsupported: 'Este navegador não dá acesso à câmera. Abra o app pelo endereço https, ou digite o código.',
  nocamera: 'Não encontramos uma câmera neste aparelho. Digite o código.',
  decoder: 'O leitor de código não carregou. Confira a internet e abra esta tela de novo, ou digite o código.',
};

/**
 * Monta o visor em `host`. `onCode(code)` deve devolver uma Promise; o leitor
 * volta a ler quando ela termina.
 */
export function mountCamera(host, { onCode, compact = false }) {
  host.innerHTML = `
    <div class="viewfinder ${compact ? 'is-compact' : ''}">
      <video muted playsinline aria-label="Imagem da câmera"></video>
      <div class="aim" aria-hidden="true"><span class="aim-line"></span></div>
      <p class="cam-msg" hidden></p>
      <button type="button" class="cam-hint" data-byname hidden>Não está lendo? <strong>Buscar pelo nome</strong></button>
      <div class="cam-tools">
        <button type="button" class="cam-tool" data-torch hidden aria-pressed="false">${icon('torch')}Lanterna</button>
        <button type="button" class="cam-tool" data-manual>${icon('keyboard')}Digitar código</button>
      </div>
    </div>`;

  const video = $('video', host);
  const aim = $('.aim', host);
  const msg = $('.cam-msg', host);
  const torchBtn = $('[data-torch]', host);
  const hintBtn = $('[data-byname]', host);
  let alive = true;
  let handling = false;
  let paused = false;
  let torchOn = false;
  let hintTimer = 0;

  // Depois de uns segundos sem ler nada, oferece a busca pelo nome.
  const HINT_AFTER = 9000;
  function armHint() {
    clearTimeout(hintTimer);
    hintBtn.hidden = true;
    hintTimer = setTimeout(() => {
      if (alive && scanner.running && !handling && !paused) hintBtn.hidden = false;
    }, HINT_AFTER);
  }

  async function handle(code) {
    if (handling) return;
    handling = true;
    clearTimeout(hintTimer);
    hintBtn.hidden = true;
    scanner.pause();
    try {
      await onCode(code);
    } finally {
      handling = false;
      if (alive && !paused) { scanner.resume(); armHint(); }
    }
  }

  const scanner = createScanner(video, {
    onCode(code) {
      if (!isValidCode(code)) { scanner.resume(); return; }
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

  return {
    handle,
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
          <button type="submit" class="btn btn-primary">Buscar produto</button>
          <button type="button" class="btn btn-quiet" data-nocode>${icon('search')}Sem código? Buscar pelo nome</button>
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
        close(code);
      });
      $('[data-nocode]', body).addEventListener('click', () => close(`SEM-${Date.now()}`));
    },
  });
}
