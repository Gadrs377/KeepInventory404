// Ler a validade apontando a câmera para a data impressa, sem IA na nuvem: o
// leitor de texto roda no celular (js/ocr.js) e js/dates.js acha a validade no
// meio do texto (ignora lote e fabricação).
//
// Cada quadro passa por um ajuste diferente da imagem (tamanho e quanto juntar
// os pontinhos da impressão a jato). A data só é aceita quando duas leituras
// concordam; se discordarem, a vencedora precisa estar duas na frente.
// Medido com 32 embalagens simuladas: 30 certas, nenhuma errada.
//
// Enquanto não tem certeza, as datas lidas viram botões embaixo da câmera
// (até 3). Cada botão fica no lugar em que apareceu: nada some, nada troca de
// posição, para o dedo não acertar a data errada. Um botão recém-chegado só
// aceita toque depois de meio segundo.

import { ocrWorker, prepareFrame, readText } from '../ocr.js';
import { findExpiry, formatDate } from '../dates.js';
import { beep } from '../sound.js';
import { $, icon, vibrate } from '../ui.js';

// [juntar pontos, largura da imagem]: primeiro a imagem cheia, depois reduzida.
const VARIANTS = [[1, 1000], [2, 700], [1, 550], [3, 1000], [1, 450], [0, 1000], [2, 550], [4, 1000], [1, 700]];
const MAX_PICKS = 3;
const PICK_GUARD_MS = 450;

function claimCamera(on) {
  window.dispatchEvent(new CustomEvent('ki:camera', { detail: { claim: on } }));
}

// Parte do quadro da câmera que aparece dentro da mira, levando em conta o
// corte do vídeo (object-fit: cover).
function aimBox(video, aim) {
  const v = video.getBoundingClientRect();
  const a = aim.getBoundingClientRect();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.max(v.width / vw, v.height / vh);
  const offX = (vw * scale - v.width) / 2;
  const offY = (vh * scale - v.height) / 2;
  const x = (a.left - v.left + offX) / scale / vw;
  const y = (a.top - v.top + offY) / scale / vh;
  const w = a.width / scale / vw;
  const h = a.height / scale / vh;
  const clamp = (n) => Math.max(0, Math.min(1, n));
  return { x: clamp(x), y: clamp(y), w: Math.min(w, 1 - clamp(x)), h: Math.min(h, 1 - clamp(y)) };
}

/**
 * Monta a câmera em `host`. Resolve com AAAA-MM-DD, ou null se cancelar.
 * A promessa tem `.stop()` para desligar a câmera por fora (ao sair da página).
 * `skip`: datas já escolhidas; não entram sozinhas de novo (a câmera ainda pode
 * estar na mesma embalagem), mas aparecem para tocar.
 */
export function readExpiryWithCamera(host, { skip = [] } = {}) {
  let stop = () => {};
  const promise = new Promise((resolve) => {
    host.hidden = false;
    host.innerHTML = `
      <div class="viewfinder is-compact exp-vf">
        <video muted playsinline aria-label="Imagem da câmera"></video>
        <div class="aim exp-aim" aria-hidden="true"></div>
        <p class="exp-status" role="status">Abrindo a câmera</p>
        <div class="cam-tools" hidden><button type="button" class="cam-tool" data-torch hidden aria-pressed="false" aria-label="Lanterna">${icon('torch')}</button></div>
      </div>
      <div class="exp-picks" role="group" aria-label="Datas lidas" aria-live="polite">
        <p class="exp-picks-hint">As datas lidas aparecem aqui</p>
      </div>`;
    const video = $('video', host);
    const aim = $('.exp-aim', host);
    const status = $('.exp-status', host);
    const picks = $('.exp-picks', host);
    const torchBtn = $('[data-torch]', host);
    const canvas = document.createElement('canvas');
    let stream = null;
    let alive = true;
    let torchOn = false;
    const votes = {};
    const shown = new Set();
    let turn = 0;

    // Nova data lida: entra na próxima vaga livre e ali fica.
    function addPick(iso) {
      if (shown.has(iso) || shown.size >= MAX_PICKS) return;
      shown.add(iso);
      const hint = $('.exp-picks-hint', picks);
      if (hint) hint.remove();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'exp-pick is-new';
      btn.dataset.iso = iso;
      btn.dataset.born = String(performance.now());
      btn.innerHTML = `${icon('calendar')}<span>${formatDate(iso)}</span>`;
      btn.setAttribute('aria-label', `Usar ${formatDate(iso)}`);
      picks.append(btn);
      requestAnimationFrame(() => requestAnimationFrame(() => btn.classList.remove('is-new')));
    }
    picks.addEventListener('click', (e) => {
      const btn = e.target.closest('.exp-pick');
      if (!btn || performance.now() - Number(btn.dataset.born) < PICK_GUARD_MS) return;
      vibrate(20);
      done(btn.dataset.iso);
    });

    function finish(iso) {
      if (!alive) return;
      alive = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      claimCamera(false);
      host.innerHTML = '';
      host.hidden = true;
      resolve(iso);
    }
    // A folha fechou com a câmera aberta: solta a câmera.
    const gone = new MutationObserver(() => { if (!host.isConnected) finish(null); });
    gone.observe(document.body, { childList: true, subtree: true });
    const done = (iso) => { gone.disconnect(); finish(iso); };

    stop = () => done(null);
    torchBtn.addEventListener('click', async () => {
      const track = stream && stream.getVideoTracks()[0];
      if (!track) return;
      torchOn = !torchOn;
      try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch { torchOn = false; }
      torchBtn.setAttribute('aria-pressed', String(torchOn));
    });

    async function loop() {
      while (alive) {
        if (video.readyState < 2 || !video.videoWidth) { await new Promise((r) => setTimeout(r, 120)); continue; }
        const [blur, width] = VARIANTS[turn++ % VARIANTS.length];
        let text = '';
        try { text = await readText(prepareFrame(video, { box: aimBox(video, aim), blur, width }, canvas)); } catch { /* quadro ruim */ }
        if (!alive) return;
        const found = findExpiry(text);
        if (!found) continue;
        votes[found.iso] = (votes[found.iso] || 0) + 1;
        const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
        const [iso, n] = ranked[0];
        const second = ranked[1] ? ranked[1][1] : 0;
        addPick(found.iso);
        if (n >= 2 && n - second >= 2 && !skip.includes(iso)) {
          beep('ok');
          vibrate(40);
          done(iso);
          return;
        }
      }
    }

    (async () => {
      claimCamera(true);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch {
        status.textContent = 'Sem acesso à câmera. Digite a data.';
        claimCamera(false);
        return;
      }
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      try { await video.play(); } catch { /* o quadro chega mesmo assim */ }
      const track = stream.getVideoTracks()[0];
      const caps = track && track.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) { torchBtn.hidden = false; torchBtn.parentElement.hidden = false; }
      // Foco contínuo, quando a câmera deixa: a data fica perto da lente.
      try { if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* segue */ }
      status.textContent = 'Preparando o leitor de validade';
      try {
        await ocrWorker((p) => { if (alive) status.textContent = `Preparando o leitor de validade (só na primeira vez) ${Math.round(p * 100)}%`; });
      } catch {
        status.textContent = 'O leitor não carregou. Confira a internet ou digite a data.';
        return;
      }
      if (!alive) return;
      status.textContent = 'Aponte para a data de validade';
      loop();
    })();
  });
  promise.stop = () => stop();
  return promise;
}
