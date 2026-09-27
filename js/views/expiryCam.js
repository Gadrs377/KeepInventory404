// Ler a validade apontando a câmera para a data impressa, sem IA na nuvem: o
// leitor de texto roda no celular (js/ocr.js) e js/dates.js acha a validade no
// meio do texto (ignora lote e fabricação).
//
// Tesseract tenta filtros/segmentações diferentes. Quando não confirma, ativa
// Paddle local e alterna os dois motores. Ambos alimentam sugestões e votos
// recentes; a pessoa continua conferindo a data antes de salvar.
//
// Enquanto não tem certeza, as datas lidas viram botões embaixo da câmera
// (até 3), numa fileira que ocupa a largura toda. Nada some e nada troca de
// ordem; quando chega uma data nova as outras encolhem devagar, e por meio
// segundo nenhuma aceita toque, para o dedo não acertar a data errada.

import { ocrWorker, prepareFrame, readResult, releaseOcr } from '../ocr.js';
import { createPaddleReader } from '../paddleOcr.js';
import { TESSERACT_VARIANTS, needsPaddle, createExpiryConsensus } from '../expiryRecognition.js';
import { findExpiryCandidates, formatDate } from '../dates.js';
import { beep } from '../sound.js';
import { $, icon, vibrate } from '../ui.js';

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
    const consensus = createExpiryConsensus({ skip });
    const paddle = createPaddleReader();
    let paddleState = 'idle';
    let loadingPaddle = null;
    let tessFailed = false;
    let tessErrors = 0;
    let frameTime = -1;
    let activeSince = performance.now();
    let lastEngine = 'paddle';
    let visibilityEpoch = 0;
    const visibilityChanged = () => { consensus.reset(); frameTime = -1; activeSince = performance.now(); visibilityEpoch++; };
    document.addEventListener('visibilitychange', visibilityChanged);
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
      // Data inteira e curta ("15/10/26"): o CSS mostra a que cabe com respiro.
      const [y, m, d] = iso.split('-');
      btn.innerHTML = `${icon('calendar')}<span class="exp-pick-long">${formatDate(iso)}</span><span class="exp-pick-short" aria-hidden="true">${d}/${m}/${y.slice(2)}</span>`;
      btn.setAttribute('aria-label', `Usar ${formatDate(iso)}`);
      picks.append(btn);
      picks.dataset.changed = String(performance.now());
      requestAnimationFrame(() => requestAnimationFrame(() => btn.classList.remove('is-new')));
    }
    picks.addEventListener('click', (e) => {
      const btn = e.target.closest('.exp-pick');
      // Logo depois de uma data nova, as vagas ainda estão se ajeitando: ignora.
      if (!btn || performance.now() - Number(picks.dataset.changed || 0) < PICK_GUARD_MS) return;
      vibrate(20);
      done(btn.dataset.iso);
    });

    function finish(iso) {
      if (!alive) return;
      alive = false;
      gone.disconnect();
      paddle.dispose();
      releaseOcr();
      document.removeEventListener('visibilitychange', visibilityChanged);
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

    function startPaddle() {
      if (paddleState !== 'idle' || !alive) return;
      paddleState = 'loading';
      status.textContent = 'Preparando uma leitura mais detalhada';
      loadingPaddle = paddle.ready().then(() => {
        if (alive) { paddleState = 'ready'; status.textContent = 'Mantenha a validade na mira'; }
      }).catch(() => {
        if (alive) {
          paddleState = 'failed';
          status.textContent = tessFailed ? 'Não foi possível ler. Digite a data.' : 'Continue apontando ou digite a data';
        }
        paddle.dispose();
      });
    }

    async function loop() {
      const pause = ms => new Promise(r => setTimeout(r, ms));
      while (alive) {
        if (document.hidden || video.readyState < 2 || !video.videoWidth || video.currentTime === frameTime) { await pause(150); continue; }
        if (tessFailed || needsPaddle(turn, performance.now() - activeSince)) startPaddle();
        // Do not run inference while Paddle is compiling its models: that
        // peak is already expensive on a phone. Cancellation terminates it.
        if (paddleState === 'loading') { await loadingPaddle; continue; }
        if (tessFailed && paddleState !== 'ready') return;
        const engine = paddleState === 'ready' && (tessFailed || lastEngine !== 'paddle') ? 'paddle' : 'tesseract';
        lastEngine = engine;
        const frame = video.currentTime; frameTime = frame;
        const epoch = visibilityEpoch;
        const variant = engine === 'paddle' ? { mode: 'raw', blur: 0, width: 1000 } : TESSERACT_VARIANTS[turn++ % TESSERACT_VARIANTS.length];
        let result;
        try {
          prepareFrame(video, { ...variant, box: aimBox(video, aim) }, canvas);
          result = engine === 'paddle' ? await paddle.read(canvas) : await readResult(canvas, { psm: variant.psm });
          if (engine === 'tesseract') tessErrors = 0;
        } catch {
          if (!alive) return;
          if (engine === 'paddle') { paddleState = 'failed'; paddle.dispose(); }
          else if (++tessErrors >= 3) tessFailed = true;
          status.textContent = 'Tente outro ângulo ou digite a data';
          await pause(250);
          continue;
        }
        if (!alive) return;
        if (document.hidden || epoch !== visibilityEpoch) continue;
        const candidates = findExpiryCandidates(result.text);
        for (const found of candidates) addPick(found.iso);
        const accepted = consensus.add({ candidates, engine, confidence: result.confidence, frame, at: performance.now() });
        if (accepted) {
          beep('ok'); vibrate(40); done(accepted); return;
        }
        if (candidates.some(c => c.ambiguous)) status.textContent = 'Há mais de uma data. Toque na validade correta';
        // Yield to camera/interaction and avoid immediately rereading the same
        // decoded frame. The next pass uses a fresh frame and another variant.
        await pause(engine === 'paddle' ? 220 : 120);
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
        tessFailed = true;
        if (alive) startPaddle();
      }
      if (!alive) return;
      status.textContent = 'Aponte para a data de validade';
      activeSince = performance.now();
      loop().catch(() => { if (alive) status.textContent = 'Não foi possível ler. Digite a data.'; });
    })();
  });
  promise.stop = () => stop();
  return promise;
}
