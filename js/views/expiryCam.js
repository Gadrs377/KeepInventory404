// Ler a validade apontando a câmera para a data impressa, sem IA na nuvem: o
// leitor de texto roda no celular (js/ocr.js) e js/dates.js acha a validade no
// meio do texto (ignora lote e fabricação).
//
// Tesseract tenta filtros/segmentações diferentes. Quando não confirma, ativa
// Paddle local (camada "small", rápida) e alterna os dois motores. Ambos
// alimentam sugestões e votos recentes; a pessoa continua conferindo a data
// antes de salvar.
//
// Enquanto não tem certeza, as datas lidas viram botões embaixo da câmera
// (até 3), numa fileira que ocupa a largura toda. Nada some e nada troca de
// ordem; quando chega uma data nova as outras encolhem devagar, e por meio
// segundo nenhuma aceita toque, para o dedo não acertar a data errada.
//
// Sem confirmar por muito tempo, sugere inclinar a embalagem ou mudar a luz
// e, sozinho, tira e lê fotos paradas nesse meio-tempo — uma tentativa
// independente a cada troca de dica. Nunca junta pixels de fotos diferentes,
// e os filtros de uma mesma foto contam como uma foto só na votação. A foto
// tenta o Tesseract primeiro e depois o Paddle "medium" (mais lento, enxerga
// mais em material difícil), que carrega em segundo plano assim que o small
// fica pronto — nunca trava a leitura contínua esperando por ele. Ainda
// oferece a câmera do próprio celular (foco, HDR e resolução cheia) e, se a
// embalagem continuar difícil, sugere digitar olhando a melhor foto.

import { ocrWorker, prepareFrame, readResult, releaseOcr, thickenDark } from '../ocr.js';
import { readDotPrint } from '../dotPrint.js';
import { createPaddleReader, createSmallReader, sharedReader } from '../paddleOcr.js';
import { textRows } from '../ocrLayout.js';
import { guessRegion, fingerprint } from '../dateRegion.js';
import { createFindPanel } from './expiryFind.js';
import {
  TESSERACT_VARIANTS, PADDLE_VARIANTS, needsPaddle, createExpiryConsensus,
  STRUGGLE_MS, TILT_HINTS, BURST_TESSERACT_VARIANTS, BURST_PADDLE_VARIANTS,
  PHOTO_BOX, PHOTO_TESSERACT_VARIANTS, LEGACY_BURST_TESSERACT_VARIANTS, LEGACY_BURST_PADDLE_VARIANTS, HARD_AFTER_BURSTS, HARD_AFTER_MS, REJECT_TEXT,
} from '../expiryRecognition.js';
import { frameIssue, sharpness } from '../frameQuality.js';
import { debugEnabled, BANCADA_URL, copyForBancada } from '../expiryDebug.js';
import { findExpiryCandidates, formatDate } from '../dates.js';
import { beep } from '../sound.js';
import { $, icon, vibrate, reducedMotion, toast, download } from '../ui.js';

const MAX_PICKS = 3;
const PICK_GUARD_MS = 450;
const HINT_CYCLE_MS = 4200;
const QUALITY_MS = 1200;
const NATIVE_MAX_SIDE = 2400;
// Mesma data em tantas imagens diferentes, bem à frente das outras (a mesma
// regra que põe a data em destaque): a câmera pergunta "É esta?" em vez de
// esperar um rótulo que talvez nunca apareça (a validade às vezes fica longe
// do "VAL", noutra linha da embalagem). Era 4 até a versão 3.49: a data certa
// ficava em destaque, com "2×", "3×", e a pergunta demorava a vir.
const ASK_AFTER = 2;
const LEAD = 2;
// 4K quando a câmera deixa (as traseiras dos iPhones deixam): a mira pega
// só um pedaço do quadro, e com 1080p esse pedaço tinha ~870 px de largura.
// O Safari não tem ImageCapture (foto em resolução de foto), então o quadro
// do vídeo é o máximo que a página consegue. Pedido "ideal": se não der, o
// navegador entrega o mais perto (o registro diz quanto veio).
const CAMERA = { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } };

const ISSUE_TEXT = {
  dark: 'Está escuro. Acenda uma luz perto da embalagem',
  glare: 'Tem reflexo em cima da data. Incline um pouco para tirar o brilho',
  blur: 'Segure parado, com a data dentro da mira',
};
const HARD_TEXT = 'Essa embalagem está difícil de ler pela câmera. Mostre onde está a validade numa das fotos abaixo, ou digite a data.';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const photoSource = (seq) => `photo-${seq}`;
const variantName = (v) => `${v.mode}${v.psm ? `/psm${v.psm}` : ''}${v.angle ? `/${v.angle}°` : ''}`;
const DEBUG_EVENT = {
  pick: 'data virou botão', tap: 'tocou na data', confirmed: 'confirmou sozinho', shutter: 'foto automática',
  native: 'foto do celular', hard: 'avisou que está difícil', ask: 'perguntou "é esta data?"', issue: 'aviso de imagem',
  camera: 'câmera', 'small-ready': 'Paddle small pronto', 'small-failed': 'Paddle small falhou', 'medium-ready': 'Paddle medium pronto',
  'medium-failed': 'Paddle medium falhou', error: 'leitura falhou', declined: 'respondeu que não é',
  'find-photo': 'foto no painel', 'find-yes': 'confirmou o palpite', 'find-tap': 'tocou na foto', 'find-read': 'leu o pedaço',
  'find-fail': 'não leu o pedaço', 'find-none': 'não está em nenhuma', 'find-switch': 'trocou de foto',
};

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

// A foto do ImageCapture costuma ter outra proporção que o vídeo (4:3 contra
// 16:9): o vídeo é um recorte central do mesmo sensor. Leva a mira para a foto.
function mapBox(box, vw, vh, pw, ph) {
  const va = vw / vh; const pa = pw / ph;
  if (Math.abs(va - pa) < 0.01) return box;
  if (pa < va) { const f = pa / va; return { x: box.x, w: box.w, y: (1 - f) / 2 + box.y * f, h: box.h * f }; }
  const f = va / pa;
  return { y: box.y, h: box.h, x: (1 - f) / 2 + box.x * f, w: box.w * f };
}

// Quanto texto uma leitura achou (só para escolher a melhor foto a mostrar).
function textScore({ text = '', confidence = 0 }) {
  return (text.match(/[0-9A-Za-z]/g) || []).length * Math.max(0, confidence) / 100;
}

/**
 * Monta a câmera em `host`. Resolve com AAAA-MM-DD, ou null se cancelar.
 * A promessa tem `.stop()` para desligar a câmera por fora (ao sair da página).
 * `skip`: datas já escolhidas; não entram sozinhas de novo (a câmera ainda pode
 * estar na mesma embalagem), mas aparecem para tocar.
 * `onBestPhoto(dataUrl)`: a foto com mais texto legível até agora, para
 * mostrar ao lado do campo de digitar. `onHard()`: a embalagem parece difícil
 * demais para a câmera (hora de sugerir digitar). `onLikely({ iso, n, monthOnly })`:
 * a data vista em mais imagens (ou null), para já vir escrita ao digitar.
 * `onType()`: a pessoa pediu para digitar de dentro do painel de fotos.
 * `experiment` (só a tela de testes): `{ gpu: false }` usa o leitor rápido sem
 * GPU; `{ legacy: true }` faz as fotos automáticas como até a versão 3.47
 * (5 + 5 filtros, medium na mira, sem palpite nem recorte).
 * `debug`: mostra o painel de diagnóstico (padrão: opção em Mais ou ?debug).
 * A promessa também tem `.log()`, o registro de cada tentativa e evento.
 */
export function readExpiryWithCamera(host, { skip = [], onEvidence = () => {}, onBestPhoto = () => {}, onHard = () => {}, onLikely = () => {}, onType = null, debug = debugEnabled(), experiment = {} } = {}) {
  const useGpu = experiment.gpu !== false;
  const legacy = !!experiment.legacy;
  const log = [];
  let stop = () => {};
  const promise = new Promise((resolve) => {
    host.hidden = false;
    host.innerHTML = `
      <div class="viewfinder is-compact exp-vf">
        <video muted playsinline aria-label="Imagem da câmera"></video>
        <div class="aim exp-aim" aria-hidden="true"></div>
        <div class="exp-shutter" aria-hidden="true"></div>
        <p class="exp-status" role="status">Abrindo a câmera</p>
        <div class="cam-tools" hidden><button type="button" class="cam-tool" data-torch hidden aria-pressed="false" aria-label="Lanterna">${icon('torch')}</button></div>
      </div>
      <div class="exp-picks" role="group" aria-label="Datas lidas" aria-live="polite">
        <p class="exp-picks-hint">As datas lidas aparecem aqui</p>
      </div>
      <div class="exp-ask" role="group" aria-live="polite" hidden>
        <p class="exp-ask-text"></p>
        <div class="exp-ask-actions">
          <button type="button" class="btn btn-primary" data-ask-yes>Sim</button>
          <button type="button" class="btn btn-quiet" data-ask-no>Não</button>
        </div>
      </div>
      <div class="exp-struggle" hidden>
        <p class="exp-struggle-hint" aria-live="polite"></p>
        <div class="exp-find" hidden></div>
        <button type="button" class="btn exp-alt" data-photo>${icon('camera')}<span>Usar a câmera do celular</span></button>
        <input type="file" accept="image/*" capture="environment" hidden data-photo-input>
      </div>${debug ? `
      <details class="exp-debug" open>
        <summary>Diagnóstico da leitura</summary>
        <img class="exp-debug-shot" alt="Último recorte enviado ao leitor" hidden>
        <ol class="exp-debug-log"></ol>
        <button type="button" class="btn exp-alt" data-debug-copy>${icon('download')}<span>Copiar diagnóstico</span></button>
        <a class="btn exp-alt" data-debug-send href="${BANCADA_URL}" target="_blank" rel="noopener">${icon('share')}<span>Enviar para o Claude</span></a>
      </details>` : ''}`;
    const video = $('video', host);
    const aim = $('.exp-aim', host);
    const shutterEl = $('.exp-shutter', host);
    const status = $('.exp-status', host);
    const picks = $('.exp-picks', host);
    const torchBtn = $('[data-torch]', host);
    const struggle = $('.exp-struggle', host);
    const struggleHint = $('.exp-struggle-hint', host);
    const photoBtn = $('[data-photo]', host);
    const photoInput = $('[data-photo-input]', host);
    const askBox = $('.exp-ask', host);
    const findHost = $('.exp-find', host);
    const findPanel = createFindPanel(findHost, {
      onRead: (region, photo, progress) => readRegion(region, photo, progress),
      onType: (crop) => { if (crop) { try { onBestPhoto(crop); } catch { /* segue */ } } if (onType) onType(); },
      note: (what, detail) => note({ kind: 'event', what, detail: detail == null ? null : JSON.stringify(detail) }),
    });
    const askText = $('.exp-ask-text', host);
    const canvas = document.createElement('canvas');
    const original = document.createElement('canvas');
    // Fotos têm canvas próprios: a leitura ao vivo pode voltar a rodar enquanto
    // uma foto espera o Paddle medium ficar pronto.
    const photoCanvas = document.createElement('canvas');
    const photoEvidence = document.createElement('canvas');
    const qualityCanvas = document.createElement('canvas');
    const bestCanvas = document.createElement('canvas');
    const evidence = new Map();
    let stream = null;
    let alive = true;
    let torchOn = false;
    // Uma foto está usando o worker do Paddle small, o mesmo da leitura ao vivo:
    // a leitura ao vivo pausa. (O Tesseract já tem fila própria, e o medium
    // tem worker próprio: esses rodam junto com a leitura ao vivo.)
    let busy = false;
    let bursting = false; // uma foto está em andamento (inclui esperar o modelo)
    let liveReading = false;
    let nativeOpen = false; // a pessoa saiu para a câmera do celular
    let nativePending = false; // uma foto do celular espera a vez: a automática cede
    let nativeReading = false; // lendo a foto do celular: o status fica nela
    const consensus = createExpiryConsensus({ skip });
    // Duas camadas do mesmo PP-OCRv6: "small" na leitura contínua (rápida,
    // tenta muitos quadros) e "medium" só nas fotos (mais lenta por leitura,
    // mas enxerga mais em material difícil). Ver docs/LEITURA_VALIDADE.md.
    // O small tenta a GPU (3× mais rápido no iPhone) e volta sozinho para o
    // leitor sem GPU; o medium fica sem GPU (na GPU derrubou o app).
    // Os leitores ficam de uma abertura para a outra (sharedReader): criar e
    // destruir a cada vez fazia o iPhone fechar o app por memória.
    const paddleLive = useGpu ? sharedReader('small-gpu', createSmallReader)
      : sharedReader('small-wasm', () => Object.assign(createPaddleReader('small'), { backend: () => 'wasm' }));
    let paddleLiveState = 'idle';
    let loadingPaddleLive = null;
    const paddleBurst = sharedReader('medium', () => createPaddleReader('medium'));
    let paddleBurstState = 'idle';
    let loadingPaddleBurst = null;
    let tessFailed = false;
    let tessErrors = 0;
    let frameTime = -1;
    let activeSince = performance.now();
    let lastEngine = 'paddle';
    let visibilityEpoch = 0;
    const shown = new Set();
    // Cada data: em quantas imagens diferentes apareceu (os filtros de uma foto
    // contam como uma imagem) e em quantas veio com rótulo de validade.
    const seen = new Map();
    let asking = null;
    const declined = new Set();
    let likelyKey = '';
    let turn = 0;
    let paddleTurn = 0;
    let struggleTimer = null;
    let hintPhase = 0;
    let burstSeq = 0;
    let burstsWithoutConfirm = 0;
    let hard = false;
    let bestScore = -1;
    let lastQualityAt = 0;
    let lastIssue = null;
    let issueStreak = 0;
    let shownIssue = null;

    // Com a pergunta "É esta?" aberta, as instruções de rotina não tiram a
    // atenção dela; só erros e o andamento da foto do celular (`urgent`).
    function setStatus(text, { urgent = false } = {}) {
      status.textContent = asking && !urgent ? 'Confira a data abaixo' : text;
      shownIssue = null;
    }

    // ---------- Diagnóstico ----------
    // Cada tentativa (motor, filtro, texto lido, datas e por que a votação
    // recusou) e cada evento. Sempre registrado; o painel só aparece com o
    // diagnóstico ligado.
    const t0 = performance.now();
    const debugList = debug ? $('.exp-debug-log', host) : null;
    const debugShot = debug ? $('.exp-debug-shot', host) : null;
    let lastShotAt = 0;
    function note(entry, shotCanvas = null) {
      const e = { t: Math.round(performance.now() - t0), ...entry };
      log.push(e);
      if (log.length > 400) log.shift();
      if (!debugList) return;
      const li = document.createElement('li');
      const when = `${(e.t / 1000).toFixed(1)}s`;
      if (e.kind === 'read') {
        const dates = e.dates.length ? e.dates.map((d) => `${formatDate(d.iso)}${d.labeled ? ' (VAL)' : ''}`).join(', ') : '—';
        const why = `${REJECT_TEXT[e.result] || e.result}${e.detail != null ? ` (${e.detail})` : ''}`;
        li.textContent = `${when} ${e.engine === 'paddle' ? 'Paddle' : 'Tesseract'} ${e.filter} [${e.source}] “${(e.text || '').replace(/\s+/g, ' ').slice(0, 70)}” → ${dates} · ${why}`;
        if (e.result === 'confirmed') li.className = 'is-ok';
      } else {
        li.textContent = `${when} • ${DEBUG_EVENT[e.what] || e.what}${e.iso ? ` ${formatDate(e.iso)}` : ''}${e.detail ? ` (${e.detail})` : ''}`;
        li.className = 'is-event';
      }
      debugList.prepend(li);
      while (debugList.children.length > 14) debugList.lastChild.remove();
      const now = performance.now();
      if (shotCanvas && now - lastShotAt > 700) {
        lastShotAt = now;
        try { debugShot.src = shotCanvas.toDataURL('image/jpeg', .7); debugShot.hidden = false; } catch { /* segue sem imagem */ }
      }
    }
    function noteRead({ engine, variant, source, result, candidates }, shotCanvas) {
      const why = consensus.why() || { code: '?', detail: null };
      note({
        kind: 'read', engine, filter: variantName(variant), source, text: String(result.text || '').slice(0, 400), confidence: Math.round(result.confidence),
        dates: candidates.map((c) => ({ iso: c.iso, labeled: !!c.labeled, ambiguous: !!c.ambiguous })), result: why.code, detail: why.detail,
      }, shotCanvas);
    }
    if (debug) {
      const debugPayload = () => JSON.stringify({ kind: 'diagnóstico da validade', app: 'KeepInventory404', when: new Date().toISOString(), ua: navigator.userAgent, screen: [innerWidth, innerHeight], video: [video.videoWidth, video.videoHeight], log });
      $('[data-debug-send]', host).addEventListener('click', () => {
        copyForBancada(debugPayload(), () => toast('Não deu para copiar. Use Copiar diagnóstico e cole na Bancada.', { duration: 5000 }));
      });
      $('[data-debug-copy]', host).addEventListener('click', async () => {
        const payload = JSON.stringify({
          app: 'KeepInventory404', when: new Date().toISOString(), ua: navigator.userAgent,
          screen: [innerWidth, innerHeight], video: [video.videoWidth, video.videoHeight], log,
        }, null, 1);
        try { await navigator.clipboard.writeText(payload); toast('Diagnóstico copiado. Cole numa mensagem.'); }
        catch { download(`diagnostico-validade-${Date.now()}.json`, payload, 'application/json'); toast('Diagnóstico baixado.'); }
      });
    }

    const visibilityChanged = () => {
      // Voltando da câmera do celular: não recomeça do zero, só religa a
      // câmera daqui (o iOS pode ter encerrado a trilha).
      if (nativeOpen) { if (!document.hidden) ensureCamera(); return; }
      consensus.reset(); frameTime = -1; activeSince = performance.now(); visibilityEpoch++; armStruggleHelp();
    };
    document.addEventListener('visibilitychange', visibilityChanged);

    // Sem confirmar por um tempo: sugere inclinar a caixa ou mudar a luz (ajuda
    // com relevo e reflexo) e tira sozinho uma foto parada a cada troca de dica.
    // Cada foto é independente: quem decide é a mesma votação de sempre.
    function armStruggleHelp() {
      clearInterval(struggleTimer);
      struggle.hidden = true;
      struggleTimer = setInterval(() => {
        if (!alive || document.hidden || nativeOpen) return;
        const elapsed = performance.now() - activeSince;
        if (elapsed < STRUGGLE_MS) return;
        if (elapsed >= HARD_AFTER_MS && bestScore >= 0) becomeHard();
        hintPhase = struggle.hidden ? 0 : (hintPhase + 1) % TILT_HINTS.length;
        struggleHint.textContent = hard ? HARD_TEXT : TILT_HINTS[hintPhase];
        struggle.classList.toggle('is-hard', hard);
        struggle.hidden = false;
        if (!bursting) takeSharpPhoto();
      }, HINT_CYCLE_MS);
    }

    function becomeHard() {
      // Já existe uma data vista várias vezes esperando resposta: não é hora
      // de dizer que a embalagem está difícil.
      if (hard || asking) return;
      hard = true;
      note({ kind: 'event', what: 'hard' });
      findPanel.open();
      struggleHint.textContent = HARD_TEXT;
      struggle.classList.add('is-hard');
      try { onHard(); } catch { /* a câmera segue */ }
    }

    // Nova data lida: entra na próxima vaga livre e ali fica.
    function addPick(iso) {
      if (shown.has(iso) || shown.size >= MAX_PICKS) return;
      shown.add(iso);
      note({ kind: 'event', what: 'pick', iso });
      const hint = $('.exp-picks-hint', picks);
      if (hint) hint.remove();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'exp-pick is-new';
      btn.dataset.iso = iso;
      // Data inteira e curta ("15/10/26"): o CSS mostra a que cabe com respiro.
      const [y, m, d] = iso.split('-');
      btn.innerHTML = `${icon('calendar')}<span class="exp-pick-long">${formatDate(iso)}</span><span class="exp-pick-short" aria-hidden="true">${d}/${m}/${y.slice(2)}</span><span class="exp-pick-count" aria-hidden="true"></span>`;
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
      note({ kind: 'event', what: 'tap', iso: btn.dataset.iso });
      done(btn.dataset.iso);
    });

    function finish(iso) {
      if (!alive) return;
      if (iso) { try { onEvidence(evidence.get(iso) || null); } catch { /* confirmação ainda funciona */ } }
      alive = false;
      gone.disconnect();
      clearInterval(struggleTimer);
      paddleLive.dispose();
      paddleBurst.dispose();
      findPanel.dispose();
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

    function startPaddleLive() {
      if (paddleLiveState !== 'idle' || !alive) return;
      paddleLiveState = 'loading';
      setStatus('Só um instante');
      loadingPaddleLive = paddleLive.ready().then(() => {
        if (!alive) return;
        paddleLiveState = 'ready';
        note({ kind: 'event', what: 'small-ready', detail: paddleLive.backend() === 'gpu' ? 'GPU' : 'sem GPU' });
        setStatus('Mantenha a validade na mira');
        // Com o small pronto, a embalagem já se mostrou difícil: prepara o
        // medium em segundo plano, para as fotos não precisarem esperar.
        startPaddleBurst();
      }).catch(() => {
        if (alive) {
          paddleLiveState = 'failed';
          note({ kind: 'event', what: 'small-failed' });
          setStatus(tessFailed ? 'Não foi possível ler. Digite a data.' : 'Continue apontando ou digite a data', { urgent: true });
        }
        paddleLive.kill();
      });
    }

    // Em segundo plano e sem aviso: nenhuma leitura espera por ele, exceto a
    // foto tirada com a câmera do celular (a pessoa pediu uma leitura cuidadosa).
    function startPaddleBurst() {
      if (paddleBurstState !== 'idle' || !alive) return;
      paddleBurstState = 'loading';
      loadingPaddleBurst = paddleBurst.ready().then(() => {
        if (alive) { paddleBurstState = 'ready'; note({ kind: 'event', what: 'medium-ready' }); }
      }).catch(() => {
        if (alive) { paddleBurstState = 'failed'; note({ kind: 'event', what: 'medium-failed' }); }
        paddleBurst.kill();
      });
    }

    // Guarda a evidência (recorte + texto cru), põe a data numa vaga, se
    // houver, e conta em quantas imagens diferentes cada data apareceu.
    function recordCandidates(candidates, evidenceCanvas, source) {
      for (const found of candidates) {
        if (!evidence.has(found.iso) && evidence.size < MAX_PICKS) evidence.set(found.iso, {
          image: evidenceCanvas.toDataURL('image/jpeg', .8), raw: found.raw,
          monthOnly: /^\d{1,2}\s*[/.\- ]\s*\d{2,4}$|^\d{4}$/.test(found.raw),
        });
        const s = seen.get(found.iso) || { sources: new Set(), labeled: 0 };
        s.sources.add(source);
        if (found.labeled) s.labeled++;
        seen.set(found.iso, s);
        addPick(found.iso);
      }
      if (candidates.length) updatePicks();
    }

    // A data à frente (em imagens diferentes) entre as que estão nas vagas.
    function leader() {
      const ranked = [...shown].map((iso) => ({ iso, n: seen.get(iso)?.sources.size || 0 })).sort((a, b) => b.n - a.n);
      const first = ranked[0];
      if (!first || first.n - (ranked[1]?.n || 0) < LEAD) return null;
      return first;
    }

    // Quantas vezes cada data foi vista, e a mais provável em destaque. Nada
    // muda de lugar: só o número e o fundo da data.
    function updatePicks() {
      const lead = leader();
      for (const btn of picks.querySelectorAll('.exp-pick')) {
        const n = seen.get(btn.dataset.iso)?.sources.size || 0;
        $('.exp-pick-count', btn).textContent = n >= 2 ? `${n}×` : '';
        btn.classList.toggle('is-likely', !!lead && lead.n >= 2 && lead.iso === btn.dataset.iso);
        btn.setAttribute('aria-label', `Usar ${formatDate(btn.dataset.iso)}${n >= 2 ? `, lida ${n} vezes` : ''}`);
      }
      tellLikely(lead);
      maybeAsk(lead);
    }

    function tellLikely(lead) {
      const likely = lead && lead.n >= 2 && !declined.has(lead.iso) ? { iso: lead.iso, n: lead.n, monthOnly: !!evidence.get(lead.iso)?.monthOnly } : null;
      const key = likely ? `${likely.iso}:${likely.n}` : '';
      if (key === likelyKey) return;
      likelyKey = key;
      try { onLikely(likely); } catch { /* a câmera segue */ }
    }

    // Pergunta sobre a data mais vista. Só uma data futura, ou que já veio com
    // rótulo de validade: a fabricação (sempre passada) não vira pergunta.
    function maybeAsk(lead) {
      if (asking || !lead || lead.n < ASK_AFTER || declined.has(lead.iso) || skip.includes(lead.iso)) return;
      const past = lead.iso < new Date().toISOString().slice(0, 10);
      if (past && !seen.get(lead.iso).labeled) return;
      asking = lead.iso;
      askText.textContent = `Li ${formatDate(lead.iso)} mais de uma vez. É a validade?`;
      askBox.hidden = false;
      setStatus('Confira a data abaixo', { urgent: true });
      note({ kind: 'event', what: 'ask', iso: lead.iso, detail: `${lead.n} imagens` });
      vibrate(15);
    }
    $('[data-ask-yes]', askBox).addEventListener('click', () => {
      if (!asking) return;
      vibrate(20);
      note({ kind: 'event', what: 'tap', iso: asking, detail: 'pergunta' });
      done(asking);
    });
    $('[data-ask-no]', askBox).addEventListener('click', () => {
      if (!asking) return;
      note({ kind: 'event', what: 'declined', iso: asking });
      declined.add(asking);
      asking = null;
      tellLikely(leader());
      askBox.hidden = true;
      setStatus(shown.size ? 'Toque na validade certa ou continue apontando' : 'Mantenha a validade na mira');
    });

    // O que atrapalha dentro da mira (pouca luz, reflexo, tremido). Só fala
    // depois de ver o mesmo problema duas vezes seguidas, e só volta à
    // instrução normal quando ele some duas vezes: nada de texto piscando.
    function checkQuality() {
      const now = performance.now();
      if (nativeReading || asking || now - lastQualityAt < QUALITY_MS) return;
      lastQualityAt = now;
      let issue;
      try {
        prepareFrame(video, { mode: 'raw', width: 320, box: aimBox(video, aim) }, qualityCanvas);
        issue = frameIssue(qualityCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, qualityCanvas.width, qualityCanvas.height));
      } catch { return; }
      if (issue === lastIssue) issueStreak++; else { lastIssue = issue; issueStreak = 1; }
      if (issueStreak < 2) return;
      if (issue && shownIssue !== issue) { status.textContent = ISSUE_TEXT[issue]; shownIssue = issue; note({ kind: 'event', what: 'issue', detail: issue }); }
      else if (!issue && shownIssue) setStatus('Mantenha a validade na mira');
    }

    // Um piscar branco na imagem: a foto automática foi tirada agora.
    function shutter() {
      vibrate(10);
      if (!reducedMotion()) shutterEl.animate([{ opacity: 0.75 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
    }

    function keepBest(score, still, box) {
      if (score <= bestScore) return;
      bestScore = score;
      try {
        prepareFrame(still, { mode: 'raw', width: 1400, maxH: 1400, box }, bestCanvas);
        onBestPhoto(bestCanvas.toDataURL('image/jpeg', .85));
      } catch { /* sem foto para mostrar */ }
    }

    // Foto parada do vídeo: quando o aparelho tem câmera de foto (ImageCapture,
    // não existe no Safari), pega mais pixels do sensor; senão congela o quadro
    // atual, para todos os filtros lerem exatamente a mesma imagem.
    async function captureStill(box) {
      const track = stream && stream.getVideoTracks()[0];
      if (track && track.readyState === 'live' && 'ImageCapture' in window) {
        try {
          // takePhoto() pode nunca responder se a trilha cair no meio.
          const blob = await Promise.race([new ImageCapture(track).takePhoto(), pause(3000).then(() => { throw new Error('foto demorou'); })]);
          const photo = await createImageBitmap(blob);
          return { still: photo, blob, how: `foto ${photo.width}×${photo.height}`, box: mapBox(box, video.videoWidth, video.videoHeight, photo.width, photo.height) };
        } catch { /* segue com o quadro do vídeo */ }
      }
      if (!video.videoWidth) return null;
      const frame = document.createElement('canvas');
      frame.width = video.videoWidth; frame.height = video.videoHeight;
      frame.getContext('2d').drawImage(video, 0, 0);
      return { still: frame, how: `quadro ${frame.width}×${frame.height}`, box };
    }

    // Lê uma foto: Tesseract primeiro, depois o Paddle rápido (small). Todos os
    // filtros votam, mas a foto conta como uma só na regra de "duas imagens
    // diferentes". `stopWhenFound`: a foto já deu uma data com rótulo, os
    // outros filtros param (a mesma foto conta como uma imagem só).
    // `onProgress(k, total)`.
    async function readStill({ still, box, seq, tessVariants, paddleVariants, yields = false, stopWhenFound = false, onProgress = () => {} }) {
      const source = photoSource(seq);
      let i = 0; let score = 0; let found = 0; let sure = false;
      const total = (tessFailed ? 0 : tessVariants.length) + paddleVariants.length;
      const stopped = () => !alive || (yields && nativePending) || (stopWhenFound && sure);
      async function tryVariants(engine, variants, read, exclusive = false) {
        if (exclusive) busy = true;
        try {
          while (exclusive && liveReading && alive) await pause(40);
          for (const variant of variants) {
            if (stopped()) return;
            onProgress(i + 1, total);
            let result;
            try {
              prepareFrame(still, { ...variant, box }, photoCanvas);
              result = await read(photoCanvas, variant);
            } catch { i++; continue; }
            if (!alive) return;
            score += textScore(result);
            const candidates = findExpiryCandidates(result.text);
            found += candidates.length;
            if (candidates.length === 1 && candidates[0].labeled) sure = true;
            recordCandidates(candidates, photoEvidence, source);
            const accepted = consensus.add({ candidates, engine, confidence: result.confidence, frame: `${source}-${i}`, source, at: performance.now() });
            noteRead({ engine, variant, source, result, candidates }, photoCanvas);
            i++;
            if (accepted) { note({ kind: 'event', what: 'confirmed', iso: accepted }); beep('ok'); vibrate(40); done(accepted); return; }
          }
        } finally { if (exclusive) busy = false; }
      }
      if (!tessFailed) await tryVariants('tesseract', tessVariants, (c, v) => readResult(c, { psm: v.psm }));
      if (stopped()) return { score, found };
      // Nas fotos, só o leitor rápido: o detalhado (medium) lê o pedaço do
      // palpite (readGuessAuto) ou o que a pessoa mostrar no painel.
      if (legacy) {
        const reader = paddleBurstState === 'ready' ? paddleBurst : paddleLiveState === 'ready' ? paddleLive : null;
        if (reader) await tryVariants('paddle', paddleVariants, (c) => reader.read(c), reader === paddleLive);
      } else if (paddleLiveState === 'ready') await tryVariants('paddle', paddleVariants, (c) => paddleLive.read(c), true);
      return { score, found };
    }

    // Foto automática durante a dica de inclinar/luz.
    async function takeSharpPhoto() {
      if (bursting || !alive) return;
      bursting = true;
      const seq = burstSeq++;
      let shot = null;
      try {
        shot = await captureStill(aimBox(video, aim));
        if (!alive || !shot) return;
        shutter();
        note({ kind: 'event', what: 'shutter', detail: `${photoSource(seq)}, ${shot.how}` });
        setStatus('Foto tirada. Lendo');
        prepareFrame(shot.still, { mode: 'raw', width: 900, maxH: 700, box: shot.box }, photoEvidence);
        const { score } = await readStill({
          ...shot, seq, yields: true,
          tessVariants: legacy ? LEGACY_BURST_TESSERACT_VARIANTS : BURST_TESSERACT_VARIANTS,
          paddleVariants: legacy ? LEGACY_BURST_PADDLE_VARIANTS : BURST_PADDLE_VARIANTS,
        });
        if (!alive || nativePending) return;
        keepBest(score, shot.still, shot.box);
        if (legacy) {
          if (++burstsWithoutConfirm >= HARD_AFTER_BURSTS) becomeHard();
          setStatus(shown.size ? 'Toque na validade certa ou continue apontando' : 'Mantenha a validade na mira');
          return;
        }
        const pooled = { ...(await addPhotoToPool(shot.still, 'auto', score, false, shot.blob || null)), still: shot.still };
        if (!alive) return;
        recordCandidates(pooled.candidates, photoEvidence, photoSource(seq));
        // Recorte automático: onde o rápido acha que está a validade, o
        // detalhado (medium) lê só aquele pedaço, e o resultado vota.
        if (pooled.guess && !nativePending) await readGuessAuto(pooled, photoSource(seq));
        if (!alive || nativePending) return;
        if (++burstsWithoutConfirm >= HARD_AFTER_BURSTS) becomeHard();
        setStatus(shown.size ? 'Toque na validade certa ou continue apontando' : 'Mantenha a validade na mira');
      } finally {
        // A foto do ImageCapture (4032×3024 no iPhone) ocupa ~48 MB aberta.
        if (shot && shot.still && shot.still.close) shot.still.close();
        if (alive) bursting = false;
      }
    }

    // Foto da câmera do próprio celular: foco, HDR e resolução cheia. O leitor
    // rápido lê a foto inteira (as datas viram botões) e marca onde acha que
    // está a validade; a foto abre no painel para a pessoa confirmar ou tocar
    // no lugar certo, e o detalhado lê só aquele pedaço.
    async function readNativePhoto(file) {
      nativePending = true;
      while (bursting && alive) await pause(50);
      nativePending = false;
      if (!alive) return;
      bursting = true; nativeReading = true;
      const seq = burstSeq++;
      note({ kind: 'event', what: 'native', detail: photoSource(seq) });
      setStatus('Lendo a sua foto', { urgent: true });
      try {
        let bitmap;
        try { bitmap = await createImageBitmap(file); } catch { setStatus('Não deu para abrir a foto. Tente de novo ou digite a data', { urgent: true }); return; }
        if (!alive) return;
        const photo = document.createElement('canvas');
        const k = Math.min(1, NATIVE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        photo.width = Math.round(bitmap.width * k); photo.height = Math.round(bitmap.height * k);
        photo.getContext('2d').drawImage(bitmap, 0, 0, photo.width, photo.height);
        if (bitmap.close) bitmap.close();
        prepareFrame(photo, { mode: 'raw', width: 900, maxH: 900, box: PHOTO_BOX }, photoEvidence);
        startPaddleLive();
        if (paddleLiveState === 'loading') {
          setStatus('Preparando o leitor', { urgent: true });
          try { await loadingPaddleLive; } catch { /* segue com o Tesseract */ }
          if (!alive) return;
        }
        let found = 0;
        if (paddleLiveState !== 'ready') {
          // Sem o Paddle: o Tesseract lê a foto inteira, como antes.
          ({ found } = await readStill({
            still: photo, box: PHOTO_BOX, seq, tessVariants: PHOTO_TESSERACT_VARIANTS, paddleVariants: [], stopWhenFound: true,
            onProgress: (n, total) => setStatus(`Lendo a sua foto (${n} de ${total})`, { urgent: true }),
          }));
          if (!alive) return;
        }
        setStatus('Lendo a sua foto', { urgent: true });
        const { candidates, guess } = await addPhotoToPool(photo, 'celular', 1e6, true, file);
        if (!alive) return;
        recordCandidates(candidates, photoEvidence, photoSource(seq));
        found += candidates.length;
        // Foto que a pessoa mesma tirou é a melhor para conferir a olho.
        keepBest(1e6, photo, PHOTO_BOX);
        setStatus(found ? 'Achei uma data. Toque nela, ou confira na foto abaixo' : guess ? 'Confira na foto abaixo se a validade está marcada' : 'Toque na foto abaixo onde está a validade', { urgent: true });
        findHost.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
      } finally {
        if (alive) { bursting = false; nativeReading = false; }
      }
    }

    // ---------- Fotos para o painel "A validade está aqui?" ----------
    // A foto inteira (reduzida a 1600 px) vai para o painel com as linhas de
    // texto que o leitor rápido achou nela e o palpite de onde está a
    // validade. Também devolve as datas lidas na foto inteira.
    async function addPhotoToPool(still, source, baseScore, select = false, full = null) {
      const c = document.createElement('canvas');
      prepareFrame(still, { mode: 'raw', box: PHOTO_BOX, width: 1600, maxH: 1600, maxScale: 1 }, c);
      let rows = []; let candidates = [];
      if (paddleLiveState === 'ready') {
        busy = true;
        try {
          while (liveReading && alive) await pause(40);
          const r = await paddleLive.read(c);
          rows = textRows(r.items || []);
          candidates = findExpiryCandidates(r.text);
        } catch { /* a foto entra sem palpite */ } finally { busy = false; }
      }
      if (!alive) return { candidates: [], guess: null, rows, canvas: c };
      const guess = guessRegion(rows, c.width, c.height);
      // Nitidez medida numa cópia pequena: fotos tremidas vão para o fim da fila.
      let sharp = 0;
      try {
        prepareFrame(c, { mode: 'raw', box: PHOTO_BOX, width: 320, maxH: 320, maxScale: 1 }, qualityCanvas);
        sharp = sharpness(qualityCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, qualityCanvas.width, qualityCanvas.height));
      } catch { /* sem medida */ }
      const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob || !alive) return { candidates, guess, rows, canvas: c };
      // A foto em resolução cheia, para ler o pedaço marcado: a do painel é
      // reduzida a 1600 px; a do celular tem 4032, o quadro 4K tem 3840.
      let fullBlob = full;
      if (!fullBlob && still.width > c.width) fullBlob = await new Promise((resolve) => still.toBlob ? still.toBlob(resolve, 'image/jpeg', 0.92) : resolve(null));
      if (!alive) return { candidates, guess, rows, canvas: c };
      findPanel.add({
        blob, full: fullBlob || null, url: URL.createObjectURL(blob), w: c.width, h: c.height, rows, rowsW: c.width, rowsH: c.height, guess,
        score: baseScore + (guess ? 50 : 0) + Math.min(40, sharp / 5), sharp: Math.round(sharp), print: fingerprint(c), source,
      }, { select });
      // O painel só aparece quando há o que mostrar: um palpite, uma foto da
      // própria pessoa, ou a embalagem já se mostrou difícil.
      if (guess || select || hard) findPanel.open();
      return { candidates, guess, rows, canvas: c };
    }

    // Altura de uma linha de texto dentro de `region`, em px de uma imagem de
    // altura `H`, pelas linhas do leitor rápido (medidas numa de altura
    // `rowsH`). null se o rápido não viu linha ali.
    function lineHeightIn(rows, rowsH, region, H) {
      const inside = (rows || []).filter((r) => r.y + r.h / 2 >= region.y * rowsH && r.y + r.h / 2 <= (region.y + region.h) * rowsH).map((r) => r.h).sort((x, y) => x - y);
      return inside.length ? inside[inside.length >> 1] * 0.75 * (H / rowsH) : null;
    }

    // O pedaço para o medium, da imagem em resolução cheia, com o texto
    // perto de 40 px de altura (o medium põe cada linha em 48 px): texto
    // pequeno ganha pixels de verdade, texto grande não pesa à toa.
    function cropForMedium(source, region, lineH, out = document.createElement('canvas')) {
      if (lineH) prepareFrame(source, { mode: 'raw', box: region, width: 2000, maxH: 1000, maxScale: Math.min(3, 40 / lineH) }, out);
      else prepareFrame(source, { mode: 'raw', box: region, width: 1400, maxH: 700, maxScale: 3 }, out);
      return out;
    }

    // Validade em pontinhos (lata): só quando a leitura normal do pedaço não
    // achou data nenhuma (js/dotPrint.js). `rows`: as linhas do leitor rápido
    // na mesma escala de `source`, só para estimar a altura de uma linha.
    async function readDots(source, lineH, region, seed = []) {
      if (paddleBurstState !== 'ready') return { iso: null, text: '', texts: [] };
      lineH = lineH || region.h * source.height / 3;
      return readDotPrint((c) => paddleBurst.read(c), source, region, { lineH, parse: (t) => findExpiryCandidates(t, undefined, { dots: true }), seed, alive: () => alive });
    }

    // O medium lê o pedaço do palpite de uma foto automática (sem esperar o
    // medium carregar: se ainda não está pronto, fica para a próxima foto).
    // Vota como qualquer leitura da mesma foto (conta como uma imagem só).
    async function readGuessAuto({ still, canvas, guess: region, rows }, source) {
      if (paddleBurstState !== 'ready') return;
      // Do quadro em resolução cheia, não da cópia de 1600 px do painel.
      const src = still && still.width ? still : canvas;
      const lineH = lineHeightIn(rows, canvas.height, region, src.height);
      let crop;
      try { crop = cropForMedium(src, region, lineH); } catch { return; }
      let result;
      try { result = await paddleBurst.read(crop); } catch { return; }
      if (!alive) return;
      let candidates = findExpiryCandidates(result.text);
      let mode = 'medium-recorte';
      // Nada no recorte: tenta como validade em pontinhos.
      if (!candidates.length) {
        const dots = await readDots(src, lineH, region, [result.text]);
        if (!alive) return;
        if (dots.iso) { result = { ...result, text: dots.text }; candidates = findExpiryCandidates(dots.text, undefined, { dots: true }); mode = 'medium-pontos'; }
      }
      recordCandidates(candidates, crop, source);
      const accepted = consensus.add({ candidates, engine: 'paddle', confidence: result.confidence, frame: `${source}-recorte`, source, at: performance.now() });
      noteRead({ engine: 'paddle', variant: { mode }, source, result, candidates }, crop);
      if (accepted) { note({ kind: 'event', what: 'confirmed', iso: accepted }); beep('ok'); vibrate(40); done(accepted); }
    }

    // Lê só o pedaço que a pessoa mostrou: o detalhado (medium, sem GPU) e
    // dois filtros do Tesseract. Uma data clara vai direto para a
    // confirmação, com o pedaço como prova; mais de uma vira botões.
    async function readRegion(region, photo, progress) {
      const t0 = performance.now();
      // A foto em resolução cheia (a do celular inteira, o quadro 4K), não a
      // de 1600 px mostrada no painel.
      let full;
      try { full = await createImageBitmap(photo.full || photo.blob); } catch { full = await createImageBitmap(photo.blob); }
      const lineH = lineHeightIn(photo.rows, photo.rowsH, region, full.height);
      const crop = cropForMedium(full, region, lineH);
      const cropUrl = crop.toDataURL('image/jpeg', 0.85);
      const texts = [];
      // O texto da leitura de pontinhos aceita mês torto ("0E2"): já votou.
      const parse = ([engine, text]) => findExpiryCandidates(text, undefined, { dots: engine === 'medium pontos' });
      startPaddleBurst();
      if (paddleBurstState === 'loading') {
        progress('Preparando a leitura detalhada (na 1ª vez baixa uns 140 MB)');
        try { await loadingPaddleBurst; } catch { /* segue com o rápido */ }
      }
      if (!alive) return { status: 'ok' };
      progress('Lendo esse pedaço');
      try {
        if (paddleBurstState === 'ready') texts.push(['medium', (await paddleBurst.read(crop)).text, 2]);
        else if (paddleLiveState === 'ready') {
          busy = true;
          try { while (liveReading && alive) await pause(40); texts.push(['small', (await paddleLive.read(crop)).text, 2]); }
          finally { busy = false; }
        }
      } catch { /* segue com o Tesseract */ }
      if (!tessFailed) {
        for (const [mode, psm] of [['gray', 6], ['sauvola', 6]]) {
          if (!alive) return { status: 'ok' };
          const c = document.createElement('canvas');
          prepareFrame(crop, { mode, blur: 0, box: PHOTO_BOX, width: 1000, maxH: 600 }, c);
          try { texts.push([`tesseract ${mode}`, (await readResult(c, { psm })).text, 1]); } catch { /* sem Tesseract */ }
        }
      }
      if (!alive) return { status: 'ok' };
      // Nenhuma data: tenta como validade em pontinhos (lata).
      if (!texts.some((t) => parse(t).length) && paddleBurstState === 'ready') {
        progress('Tentando juntar os pontinhos da impressão');
        const dots = await readDots(full, lineH, region, texts.filter(([engine]) => engine === 'medium').map(([, text]) => text));
        if (dots.iso) texts.push(['medium pontos', dots.text, 2]);
        else if (dots.texts.length) note({ kind: 'event', what: 'find-read', detail: `pontos sem acordo: ${dots.texts.map((t) => `“${t.replace(/\s+/g, ' ').slice(0, 30)}”`).join(' · ')}` });
      }
      if (!alive) return { status: 'ok' };
      // Nenhuma data: tenta de novo com os pontinhos "engordados" (validade
      // impressa em pontos, como nas tampas).
      if (!texts.some((t) => parse(t).length) && paddleBurstState === 'ready') {
        for (const passes of [4, 5]) {
          if (!alive) return { status: 'ok' };
          progress('Tentando de novo, com os pontos juntos');
          try { texts.push([`medium pontos ${passes}`, (await paddleBurst.read(thickenDark(crop, passes))).text, 2]); } catch { /* segue */ }
          if (findExpiryCandidates(texts[texts.length - 1][1]).length) break;
        }
      }
      if (!alive) return { status: 'ok' };
      note({ kind: 'event', what: 'find-read', detail: `${Math.round(performance.now() - t0)} ms: ${texts.map(([e, t]) => `${e} “${t.replace(/\s+/g, ' ').slice(0, 50)}”`).join(' · ')}` }, crop);
      if (full.close) full.close();
      const byIso = new Map();
      for (const entry of texts) {
        const weight = entry[2];
        for (const found of parse(entry)) {
          const v = byIso.get(found.iso) || { ...found, n: 0 };
          v.n += weight; v.labeled ||= found.labeled;
          byIso.set(found.iso, v);
        }
      }
      let list = [...byIso.values()];
      if (!list.length) return { status: 'none', crop: cropUrl };
      if (list.some((c) => c.labeled)) list = list.filter((c) => c.labeled);
      list.sort((a, b) => b.n - a.n);
      const proof = (c) => ({ image: cropUrl, raw: c.raw, monthOnly: /^\d{1,2}\s*[/.\- ]\s*\d{2,4}$|^\d{4}$/.test(c.raw) });
      if (list.length === 1 || list[0].n > list[1].n) {
        const iso = list[0].iso;
        evidence.set(iso, proof(list[0]));
        note({ kind: 'event', what: 'confirmed', iso, detail: 'mostrado na foto' });
        beep('ok'); vibrate(40);
        done(iso);
        return { status: 'ok' };
      }
      for (const c of list) { evidence.set(c.iso, proof(c)); addPick(c.iso); }
      return { status: 'several' };
    }

    photoBtn.addEventListener('click', () => {
      if (!alive) return;
      startPaddleBurst();
      nativeOpen = true;
      photoInput.value = '';
      photoInput.click();
    });
    photoInput.addEventListener('change', () => {
      const file = photoInput.files && photoInput.files[0];
      nativeOpen = false;
      ensureCamera();
      if (file) readNativePhoto(file);
    });
    photoInput.addEventListener('cancel', () => { nativeOpen = false; ensureCamera(); });

    // O iOS encerra a câmera da página quando a câmera do celular abre.
    async function ensureCamera() {
      if (!alive) return;
      const track = stream && stream.getVideoTracks()[0];
      if (track && track.readyState === 'live') { if (video.paused) video.play().catch(() => {}); return; }
      try {
        const next = await navigator.mediaDevices.getUserMedia(CAMERA);
        if (!alive) { next.getTracks().forEach((t) => t.stop()); return; }
        if (stream) stream.getTracks().forEach((t) => t.stop());
        stream = next;
        video.srcObject = stream;
        await video.play().catch(() => {});
      } catch {
        setStatus('A câmera parou. Toque em Digitar a data, ou feche e abra de novo', { urgent: true });
      }
    }

    async function loop() {
      while (alive) {
        if (busy) { await pause(150); continue; } // uma foto está sendo lida
        if (document.hidden || video.readyState < 2 || !video.videoWidth || video.currentTime === frameTime) { await pause(150); continue; }
        if (tessFailed || needsPaddle(turn, performance.now() - activeSince)) startPaddleLive();
        // Do not run inference while Paddle is compiling its models: that
        // peak is already expensive on a phone. Cancellation terminates it.
        if (paddleLiveState === 'loading') { await loadingPaddleLive; continue; }
        if (tessFailed && paddleLiveState !== 'ready') return;
        checkQuality();
        const engine = paddleLiveState === 'ready' && (tessFailed || lastEngine !== 'paddle') ? 'paddle' : 'tesseract';
        lastEngine = engine;
        const frame = video.currentTime; frameTime = frame;
        const epoch = visibilityEpoch;
        const variant = engine === 'paddle' ? PADDLE_VARIANTS[paddleTurn++ % PADDLE_VARIANTS.length] : TESSERACT_VARIANTS[turn++ % TESSERACT_VARIANTS.length];
        let result;
        liveReading = true;
        try {
          prepareFrame(video, { mode:'raw', width:640, box:aimBox(video, aim) }, original);
          prepareFrame(video, { ...variant, box: aimBox(video, aim) }, canvas);
          result = engine === 'paddle' ? await paddleLive.read(canvas) : await readResult(canvas, { psm: variant.psm });
          if (engine === 'tesseract') tessErrors = 0;
        } catch {
          if (!alive) return;
          note({ kind: 'event', what: 'error', detail: engine });
          if (engine === 'paddle') { paddleLiveState = 'failed'; paddleLive.kill(); }
          else if (++tessErrors >= 3) tessFailed = true;
          setStatus('Tente outro ângulo ou digite a data', { urgent: true });
          await pause(250);
          continue;
        } finally { liveReading = false; }
        if (!alive) return;
        if (document.hidden || epoch !== visibilityEpoch) continue;
        const candidates = findExpiryCandidates(result.text);
        recordCandidates(candidates, original, `video-${frame.toFixed(2)}`);
        const accepted = consensus.add({ candidates, engine, confidence: result.confidence, frame, at: performance.now() });
        noteRead({ engine, variant, source: `video-${frame.toFixed(2)}`, result, candidates }, canvas);
        if (accepted) {
          note({ kind: 'event', what: 'confirmed', iso: accepted });
          beep('ok'); vibrate(40); done(accepted); return;
        }
        if (candidates.some(c => c.ambiguous)) setStatus('Há mais de uma data. Toque na validade correta');
        // Yield to camera/interaction and avoid immediately rereading the same
        // decoded frame. The next pass uses a fresh frame and another variant.
        await pause(engine === 'paddle' ? 220 : 120);
      }
    }

    (async () => {
      claimCamera(true);
      try {
        stream = await navigator.mediaDevices.getUserMedia(CAMERA);
      } catch {
        setStatus('Sem acesso à câmera. Digite a data.', { urgent: true });
        claimCamera(false);
        return;
      }
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      try { await video.play(); } catch { /* o quadro chega mesmo assim */ }
      const track = stream.getVideoTracks()[0];
      const caps = track && track.getCapabilities ? track.getCapabilities() : {};
      try {
        const set = track.getSettings ? track.getSettings() : {};
        const max = caps.width && caps.height ? ` (máx ${caps.width.max}×${caps.height.max})` : '';
        note({ kind: 'event', what: 'camera', detail: `${video.videoWidth || set.width}×${video.videoHeight || set.height}${set.frameRate ? ` a ${Math.round(set.frameRate)} q/s` : ''}${max}` });
      } catch { /* sem detalhes */ }
      if (caps.torch) { torchBtn.hidden = false; torchBtn.parentElement.hidden = false; }
      // Foco contínuo, quando a câmera deixa: a data fica perto da lente.
      try { if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* segue */ }
      setStatus('Preparando o leitor de validade');
      try {
        await ocrWorker((p) => { if (alive) status.textContent = `Preparando o leitor de validade (só na primeira vez) ${Math.round(p * 100)}%`; });
      } catch {
        tessFailed = true;
        if (alive) startPaddleLive();
      }
      if (!alive) return;
      setStatus('Aponte para a data de validade');
      activeSince = performance.now();
      armStruggleHelp();
      loop().catch(() => { if (alive) setStatus('Não foi possível ler. Digite a data.'); });
    })();
  });
  promise.stop = () => stop();
  promise.log = () => log.slice();
  return promise;
}
