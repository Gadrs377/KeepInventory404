// Tela de testes (#/testes, pelo menu Mais). Bagunçada de propósito: serve
// para medir coisas no próprio celular, não mexe no armário e não aparece em
// nenhum outro lugar do app.
//
// Leitor com GPU: compara o Paddle de produção (vendor/paddle/v3, só
// WebAssembly) com o pacote de teste que usa a GPU (vendor/paddle/gpu1), nas
// mesmas imagens, e mede quanto cada um leva. O "estresse" repete leituras na
// GPU até dar erro ou chegar ao limite (no iPhone já houve relato de travar
// depois de ~500 leituras seguidas).

import { createPaddleReader } from '../paddleOcr.js';
import { findExpiryCandidates, formatDate } from '../dates.js';
import { $, esc, icon, toast, download } from '../ui.js';
import { BANCADA_URL, copyForBancada } from '../expiryDebug.js';
import { gpuAllowed, gpuOffReason, gpuReset } from '../gpuGuard.js';
import { readExpiryWithCamera } from './expiryCam.js';
import { usageList, usageClear } from '../expiryUsage.js';

const SAMPLES = { copo: 'vendor/paddle/amostras/copo.jpg', chocolate: 'vendor/paddle/amostras/chocolate.jpg' };
const ENGINES = {
  // Prazo largo: a 1ª leitura na GPU inclui preparar os programas dela.
  v3: { label: 'Atual (sem GPU)', opts: { readTimeout: 180000 } },
  gpu: { label: 'GPU 1.24', opts: { gpu: 'webgpu', pack: 'gpu1', readTimeout: 180000 } },
  gpu2: { label: 'GPU 1.30', opts: { gpu: 'webgpu', pack: 'gpu2', readTimeout: 180000 } },
  gpuwasm: { label: '1.30 sem GPU', opts: { gpu: 'wasm', pack: 'gpu2', readTimeout: 180000 } },
};

// "3,2× mais rápido" ou "32× mais lento" que o atual.
const speed = (base, ms) => {
  const k = base / ms;
  const f = (x) => (x >= 10 ? Math.round(x) : x.toFixed(1).replace('.', ','));
  return k >= 1 ? `${f(k)}× mais rápido` : `${f(1 / k)}× mais lento`;
};
// Vídeos reais (tests/real) no lugar da câmera: MP4 para o iPhone; o WebM do
// repositório para o Chromium dos testes (que não toca H.264). `region`
// (x, y, largura, altura, 0–1) enquadra o vídeo com a validade no meio, onde
// fica a mira, como se a pessoa mirasse pelo app (os vídeos não foram
// gravados assim), com folga em volta para o painel de fotos.
const CAM_VIDEOS = {
  copo: { label: 'Copo', ref: '2026-09-17', region: [0.05, 0.17, 0.85, 0.44], src: ['vendor/paddle/amostras/copo.mp4', 'tests/real/copo-tinta-impressa.webm'] },
  chocolate: { label: 'Chocolate', ref: '2027-08-11', region: [0, 0.13, 1, 0.5], src: ['vendor/paddle/amostras/chocolate.mp4', 'tests/real/chocolate-tinta-prata-foil.webm'] },
};
const CAM_MODES = {
  antes: { label: 'Antes', experiment: { gpu: false, legacy: true } },
  agora: { label: 'Agora', experiment: { gpu: true, legacy: false } },
};
const CAM_SECONDS = 90;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export default function mountTestes(root) {
  root.innerHTML = `
    <div class="screen screen-tests">
      <header class="topbar nav-bar"><a class="icon-btn glass-btn" href="#/dados" aria-label="Voltar">${icon('chevronLeft')}</a></header>
      <main class="content stack tests">
        <h1 class="page-title">Testes</h1>
        <p class="group-note">Só mede coisas neste celular. Não muda nada no armário.</p>

        <h2 class="list-title">Leitor de validade com GPU</h2>
        <pre class="tests-pre" data-env>Verificando a GPU…</pre>
        <p class="group-note" data-gpu-state></p>
        <button type="button" class="btn btn-quiet btn-sm" data-gpu-reset hidden>Religar a GPU na câmera</button>
        <fieldset class="tests-opts">
          <legend>Imagem</legend>
          <label><input type="radio" name="img" value="copo" checked> Copo (tinta preta)</label>
          <label><input type="radio" name="img" value="chocolate"> Chocolate (tinta prata)</label>
          <label><input type="radio" name="img" value="mine" data-mine-radio disabled> Foto minha <small data-mine-name>(escolha abaixo)</small></label>
          <label class="btn btn-quiet btn-sm tests-pick">Escolher foto do celular<input type="file" accept="image/*" data-file class="tests-file"></label>
          <p class="group-note" data-photo-status aria-live="polite"></p>
        </fieldset>
        <fieldset class="tests-opts">
          <legend>Modelo</legend>
          <label><input type="radio" name="tier" value="small" checked> small (leitura ao vivo)</label>
          <label><input type="radio" name="tier" value="medium"> medium (fotos; baixa 139 MB na 1ª vez)</label>
        </fieldset>
        <fieldset class="tests-opts">
          <legend>Opções</legend>
          <label>Leituras por motor <input type="number" min="2" max="30" value="6" data-n class="tests-num"></label>
          <label><input type="checkbox" data-eng="gpu2" checked> GPU com onnxruntime 1.30 (novo)</label>
          <label><input type="checkbox" data-eng="gpu"> GPU com onnxruntime 1.24 (derrubou o app no iPhone)</label>
          <label><input type="checkbox" data-eng="gpuwasm"> onnxruntime 1.30 sem GPU</label>
        </fieldset>
        <img class="tests-img" alt="Imagem usada no teste" data-preview>
        <div class="tests-actions">
          <button type="button" class="btn btn-primary" data-run>Comparar</button>
          <button type="button" class="btn btn-quiet" data-stress>Estresse GPU</button>
          <button type="button" class="btn btn-quiet" data-stop disabled>Parar</button>
          <button type="button" class="btn btn-quiet" data-copy>Copiar resultado</button>
          <button type="button" class="btn btn-quiet" data-clear>Limpar resultados</button>
        </div>

        <h2 class="list-title">Câmera com vídeos reais</h2>
        <p class="group-note">A câmera de validade inteira, com vídeos de embalagens de verdade no lugar da câmera, nos dois jeitos. Mede quando a data certa aparece, quando pergunta e quando confirma. Até ${CAM_SECONDS} s por vez.</p>
        <fieldset class="tests-opts">
          <legend>Vídeos</legend>
          ${Object.entries(CAM_VIDEOS).map(([k, v]) => `<label><input type="checkbox" data-vid="${k}" checked> ${v.label} (validade ${formatDate(v.ref)})</label>`).join('')}
        </fieldset>
        <fieldset class="tests-opts">
          <legend>Jeitos</legend>
          <label><input type="checkbox" data-cmode="antes" checked> Antes (sem GPU, medium na mira)</label>
          <label><input type="checkbox" data-cmode="agora" checked> Agora (GPU, palpite e recorte)</label>
          <label>Repetições <input type="number" min="1" max="5" value="2" data-reps class="tests-num"></label>
        </fieldset>
        <button type="button" class="btn btn-primary" data-camrun>Rodar a câmera com os vídeos</button>
        <div class="tests-cam" data-camhost hidden></div>
        <div data-camtable></div>

        <h2 class="list-title">Uso real da validade</h2>
        <p class="group-note">Cada vez que a câmera de validade abriu de verdade (fora desta tela): quanto levou e como terminou. Vai junto no "Enviar para o Claude".</p>
        <div data-usage></div>
        <button type="button" class="btn btn-quiet btn-sm" data-usage-clear>Apagar o registro de uso</button>

        <h2 class="list-title">Resolução da câmera</h2>
        <p class="group-note">Abre a câmera de trás pedindo 12 MP (4:3), 4K e 1080p e mostra quanto o celular entrega de verdade.</p>
        <button type="button" class="btn btn-quiet" data-camres>Ver a resolução da câmera</button>

        <a class="btn btn-primary" data-send href="${BANCADA_URL}" target="_blank" rel="noopener">Enviar para o Claude</a>
        <p class="group-note">Copia o resultado e abre a Bancada. Lá, toque e segure no campo e escolha Colar.</p>
        <div data-table></div>
        <pre class="tests-pre tests-log" data-log></pre>
      </main>
    </div>`;

  const log = $('[data-log]', root);
  const table = $('[data-table]', root);
  const preview = $('[data-preview]', root);
  const fileInput = $('[data-file]', root);
  const mineRadio = $('[data-mine-radio]', root);
  const mineName = $('[data-mine-name]', root);
  const photoStatus = $('[data-photo-status]', root);
  const buttons = ['[data-run]', '[data-stress]', '[data-copy]', '[data-camrun]'].map((s) => $(s, root));
  const stopBtn = $('[data-stop]', root);
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del: (k) => { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
  };
  // Tudo desta tela fica guardado no aparelho (opções, resultados, registro):
  // o iPhone às vezes fecha o app em segundo plano (ao abrir a Bancada, o
  // seletor de fotos ou a câmera) e a tela voltava do zero. `running` marca
  // o teste em andamento: se ainda estiver lá ao reabrir, o app caiu no meio.
  const STATE = 'ki.testes.estado';
  const fresh = () => ({ kind: 'testes-gpu', when: new Date().toISOString(), ua: navigator.userAgent, env: null, runs: [], events: [] });
  let saved = null;
  try { saved = JSON.parse(store.get(STATE) || 'null'); } catch { saved = null; }
  let report = saved && saved.report ? saved.report : fresh();
  let lastTable = saved && saved.table ? saved.table : [];
  let running = null;
  const event = (what, detail = null) => { report.events.push({ t: new Date().toISOString(), what, detail }); persist(); };
  // Grava na hora, sem esperar: o que acontece logo antes de o iPhone fechar o
  // app (abrir o seletor, começar uma leitura) é justamente o que importa.
  function persist() {
    const checked = (name) => $(`input[name=${name}]:checked`, root)?.value || null;
    const list = (sel, key) => [...root.querySelectorAll(sel)].filter((c) => c.checked).map((c) => c.dataset[key]);
    const opts = {
      img: checked('img'), tier: checked('tier'), n: $('[data-n]', root).value, engines: list('[data-eng]', 'eng'),
      vids: list('[data-vid]', 'vid'), cmodes: list('[data-cmode]', 'cmode'), reps: $('[data-reps]', root).value,
    };
    store.set(STATE, JSON.stringify({ report, table: lastTable, log: log.textContent, opts, running }));
  }
  function setRunning(r) { running = r; persist(); }
  let alive = true;
  let stopping = false;
  let busy = false;
  let wake = null;
  let current = null; // leitor aberto agora (para parar)
  let mine = null; // data URL da foto escolhida, já reduzida (≤ 1600 px)

  const say = (line) => { log.textContent = `${line}\n${log.textContent}`.slice(0, 20000); persist(); };
  const pick = (name) => $(`input[name=${name}]:checked`, root).value;

  // Ambiente: tem GPU para a web? Qual?
  (async () => {
    const lines = [`Navegador: ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '')}`];
    let gpu = 'não (navigator.gpu não existe)';
    try {
      if (navigator.gpu) {
        const a = await navigator.gpu.requestAdapter();
        const i = a && (a.info || (a.requestAdapterInfo && await a.requestAdapterInfo())) || {};
        gpu = a ? `sim — ${[i.vendor, i.architecture, i.description].filter(Boolean).join(' ') || 'adaptador sem nome'}` : 'não (sem adaptador)';
      }
    } catch (e) { gpu = `erro: ${e.message}`; }
    lines.push(`GPU para a web: ${gpu}`);
    lines.push(`Instalado na tela de início: ${matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'sim' : 'não'}`);
    report.env = lines;
    if (alive) $('[data-env]', root).textContent = lines.join('\n');
  })();

  // A câmera de validade usa a GPU no leitor rápido; se o app caiu durante
  // uma leitura nela, fica desligada neste aparelho (js/gpuGuard.js).
  function showGpuState() {
    const off = gpuOffReason();
    $('[data-gpu-state]', root).textContent = off
      ? `GPU na câmera de validade: desligada (o app caiu durante uma leitura nela em ${new Date(off.at).toLocaleString('pt-BR')}).`
      : `GPU na câmera de validade: ${gpuAllowed() ? 'ligada' : 'indisponível neste aparelho'}.`;
    $('[data-gpu-reset]', root).hidden = !off;
  }
  showGpuState();
  $('[data-gpu-reset]', root).addEventListener('click', () => { gpuReset(); event('gpu-religada'); showGpuState(); toast('GPU religada na câmera.', { duration: 2500 }); });

  // Volta do jeito que estava.
  if (saved) {
    const o = saved.opts || {};
    for (const [name, value] of [['img', o.img], ['tier', o.tier]]) {
      const r = value && $(`input[name=${name}][value="${value}"]`, root);
      if (r && !r.disabled) r.checked = true;
    }
    if (o.n) $('[data-n]', root).value = o.n;
    if (Array.isArray(o.engines)) for (const c of root.querySelectorAll('[data-eng]')) c.checked = o.engines.includes(c.dataset.eng);
    if (Array.isArray(o.vids)) for (const c of root.querySelectorAll('[data-vid]')) c.checked = o.vids.includes(c.dataset.vid);
    if (Array.isArray(o.cmodes)) for (const c of root.querySelectorAll('[data-cmode]')) c.checked = o.cmodes.includes(c.dataset.cmode);
    if (o.reps) $('[data-reps]', root).value = o.reps;
    log.textContent = saved.log || '';
    if (lastTable.length) renderTable(lastTable);
    if (saved.running) {
      const r = saved.running;
      say(`⚠ O app fechou no meio do teste (${r.what}, ${r.label || ''} ${r.tier}, leitura ${r.read}${r.of ? ` de ${r.of}` : ''}, ${Math.round((Date.now() - r.since) / 1000)} s depois de começar). Provavelmente o iPhone fechou por falta de memória.`);
      event('caiu-durante-teste', r);
    }
  }
  event('abriu-tela', { recarga: (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]?.type) || '?' });

  async function loadImage() {
    const which = pick('img');
    const src = which === 'mine' ? mine : SAMPLES[which];
    if (!src) throw new Error('Escolha uma foto primeiro');
    const img = await imageFrom(src);
    preview.src = src;
    // Mesmo limite de tamanho que a câmera usa nas fotos.
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    return { img, w: Math.round(img.naturalWidth * k), h: Math.round(img.naturalHeight * k), which };
  }
  // Abre uma imagem com onload/onerror (img.decode() falha à toa no Safari
  // com fotos grandes).
  function imageFrom(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('o navegador não conseguiu abrir essa imagem'));
      img.src = src;
    });
  }

  // ---------- Foto do celular ----------
  // O campo de arquivo fica por cima do botão (transparente): o toque cai nele
  // direto, sem abrir o seletor por código (o Safari às vezes bloqueia). A
  // foto é reduzida na hora e guardada no aparelho: se o iPhone fechar o app
  // enquanto o seletor está aberto (falta de memória), ela volta ao reabrir,
  // e a tela avisa que isso aconteceu.
  const PICKING = 'ki.testes.escolhendo';
  const PHOTO = 'ki.testes.foto';
  function photoSay(text) { photoStatus.textContent = text; say(`[foto] ${text}`); }
  function useMine(dataUrl, name) {
    mine = dataUrl;
    mineRadio.disabled = false;
    mineRadio.checked = true;
    mineName.textContent = `(${name})`;
    persist();
    loadImage().catch((e) => photoSay(`Não deu para mostrar a foto: ${e.message}`));
  }
  const pickingSince = Number(store.get(PICKING) || 0);
  if (pickingSince && Date.now() - pickingSince < 10 * 60000) {
    photoSay('A tela recarregou enquanto você escolhia a foto. Provavelmente o iPhone fechou o app por falta de memória. Tente de novo; se repetir, feche outros apps.');
    event('recarregou-escolhendo-foto', { segundos: Math.round((Date.now() - pickingSince) / 1000) });
  }
  store.del(PICKING);
  try {
    const photo = JSON.parse(store.get(PHOTO) || 'null');
    if (photo && photo.url) {
      useMine(photo.url, photo.name);
      // A foto volta, mas a imagem escolhida é a que estava marcada.
      const was = saved && saved.opts && saved.opts.img;
      if (was && was !== 'mine') { $(`input[name=img][value="${was}"]`, root).checked = true; persist(); loadImage().catch(() => {}); }
    }
  } catch { store.del(PHOTO); }

  fileInput.addEventListener('click', () => { store.set(PICKING, String(Date.now())); event('abriu-seletor'); });
  fileInput.addEventListener('cancel', () => { store.del(PICKING); event('cancelou-seletor'); });
  fileInput.addEventListener('change', async () => {
    store.del(PICKING);
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) { photoSay('Nenhuma foto escolhida.'); event('sem-arquivo'); return; }
    const info = { nome: file.name, tipo: file.type || '?', kb: Math.round(file.size / 1024) };
    photoSay(`Abrindo ${file.name} (${info.tipo}, ${info.kb} KB)…`);
    const t0 = performance.now();
    const url = URL.createObjectURL(file);
    try {
      let src;
      try { src = await imageFrom(url); }
      catch (e) {
        // Plano B: alguns formatos abrem por createImageBitmap e não por <img>.
        if (!('createImageBitmap' in window)) throw e;
        src = await createImageBitmap(file);
      }
      const w0 = src.naturalWidth || src.width;
      const h0 = src.naturalHeight || src.height;
      const k = Math.min(1, 1600 / Math.max(w0, h0));
      const c = document.createElement('canvas');
      c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      if (src.close) src.close();
      const dataUrl = c.toDataURL('image/jpeg', 0.92);
      Object.assign(info, { original: `${w0}x${h0}`, usada: `${c.width}x${c.height}`, ms: Math.round(performance.now() - t0) });
      event('foto-escolhida', info);
      const kept = store.set(PHOTO, JSON.stringify({ url: dataUrl, name: file.name }));
      useMine(dataUrl, file.name);
      photoSay(`Foto pronta: ${file.name}, ${w0}×${h0} → ${c.width}×${c.height}${kept ? '' : ' (não coube na memória do aparelho; some se a tela recarregar)'}.`);
    } catch (e) {
      event('foto-falhou', { ...info, erro: e.message });
      photoSay(`Não deu para abrir ${file.name}: ${String(e.message).replace(/\.+$/, '')}. Tente outra foto ou tire uma nova.`);
    } finally { URL.revokeObjectURL(url); }
  });

  // Miniatura da foto da pessoa, para o Claude ver o que o leitor viu.
  function thumbOf(image) {
    if (image.which !== 'mine') return null;
    const k = Math.min(1, 480 / Math.max(image.w, image.h));
    const c = document.createElement('canvas');
    c.width = Math.round(image.w * k); c.height = Math.round(image.h * k);
    c.getContext('2d').drawImage(image.img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  }
  function canvasOf({ img, w, h }) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
  }

  function setBusy(on) {
    busy = on;
    for (const b of buttons) b.disabled = on;
    stopBtn.disabled = !on;
    if (on) {
      stopping = false;
      // Tela acesa durante o teste (iOS 18.4+ no app instalado).
      if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then((l) => { wake = l; }).catch(() => {});
    } else if (wake) { wake.release().catch(() => {}); wake = null; }
  }

  // `entry`: o teste em andamento, já dentro de report.runs; cada leitura
  // entra nele na hora, para uma queda do app não apagar os tempos.
  async function runEngine(key, image, tier, n, entry) {
    const { label, opts } = ENGINES[key];
    say(`▶ ${label} (${tier}): preparando…`);
    const reader = createPaddleReader(tier, opts);
    current = reader;
    const out = { engine: key, label, tier, image: image.which, reads: [], texts: [] };
    entry.runs.push(out);
    try {
      const t0 = performance.now();
      setRunning({ what: 'comparar', engine: key, label, tier, read: 0, of: n, since: Date.now() });
      const ready = await reader.ready();
      out.initMs = Math.round(performance.now() - t0);
      out.providers = ready.summary ? `${ready.summary.detProvider}/${ready.summary.recProvider}` : 'wasm/wasm';
      say(`  pronto em ${(out.initMs / 1000).toFixed(1)} s (${out.providers})`);
      for (let i = 0; i < n && alive && !stopping; i++) {
        setRunning({ what: 'comparar', engine: key, label, tier, read: i + 1, of: n, since: t0 + performance.timeOrigin });
        const c = canvasOf(image);
        const t = performance.now();
        const r = await reader.read(c);
        const ms = Math.round(performance.now() - t);
        out.reads.push(ms);
        out.texts.push(r.text.replace(/\n/g, ' | '));
        say(`  leitura ${i + 1}: ${ms} ms — ${r.text.replace(/\n/g, ' | ').slice(0, 80)}`);
      }
    } catch (e) {
      out.error = e.message;
      say(`  ✖ erro: ${e.message}`);
    } finally {
      reader.dispose();
      current = null;
      setRunning(null);
    }
    out.firstMs = out.reads[0] ?? null;
    out.medianMs = median(out.reads.slice(1));
    const dates = findExpiryCandidates(out.texts[0] || '');
    out.dates = dates.map((d) => d.iso);
    persist();
    return out;
  }

  function renderTable(runs) {
    const base = runs.find((r) => r.engine === 'v3' && !r.error);
    table.innerHTML = `<table class="tests-table">
      <thead><tr><th>Motor</th><th>Preparar</th><th>1ª leitura</th><th>Demais (mediana)</th><th>Datas lidas</th></tr></thead>
      <tbody>${runs.map((r) => `<tr>
        <td>${esc(r.label)}<br><small>${esc(r.providers || '')}</small></td>
        <td>${r.initMs != null ? `${(r.initMs / 1000).toFixed(1)} s` : '—'}</td>
        <td>${r.reads && r.reads.length ? `${r.reads[0]} ms` : '—'}</td>
        <td>${r.error ? `<b>erro</b>: ${esc(r.error)}`
          : r.medianMs == null ? `<b>parou</b> depois de ${r.reads ? r.reads.length : 0} leitura(s)${r.reads && r.reads.length > 1 ? `: ${r.reads.slice(1).join(', ')} ms` : ''}`
          : `<b>${r.medianMs} ms</b>${base && r !== base && base.medianMs ? `<br><small>${speed(base.medianMs, r.medianMs)}</small>` : ''}`}</td>
        <td>${r.dates && r.dates.length ? r.dates.map((d) => esc(formatDate(d))).join(', ') : '—'}${base && r !== base && r.texts[0] !== undefined ? `<br><small>${r.texts[0] === base.texts[0] ? 'mesmo texto do atual' : 'texto diferente do atual'}</small>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  $('[data-run]', root).addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    let entry = null;
    try {
      const image = await loadImage();
      const tier = pick('tier');
      const n = Math.max(2, Math.min(30, Number($('[data-n]', root).value) || 6));
      const keys = ['v3', ...[...root.querySelectorAll('[data-eng]')].filter((c) => c.checked).map((c) => c.dataset.eng)];
      say(`— Comparar: ${image.which}, ${image.w}×${image.h}, ${tier}, ${n} leituras —`);
      entry = { kind: 'comparar', image: image.which, size: `${image.w}x${image.h}`, thumb: thumbOf(image), runs: [], incompleto: true };
      report.runs.push(entry);
      lastTable = entry.runs;
      for (const key of keys) {
        if (!alive || stopping) break;
        await runEngine(key, image, tier, n, entry);
        renderTable(entry.runs);
      }
      delete entry.incompleto;
      persist();
      say('✔ pronto — o resultado fica guardado aqui até você tocar em Limpar resultados');
    } catch (e) { say(`✖ ${e.message}`); }
    finally { if (alive) setBusy(false); }
  });

  $('[data-stress]', root).addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    const LIMIT = 600;
    const tier = pick('tier');
    const engine = ['gpu2', 'gpu'].find((k) => $(`[data-eng="${k}"]`, root).checked) || 'gpu2';
    const reader = createPaddleReader(tier, ENGINES[engine].opts);
    current = reader;
    const out = { kind: 'estresse', engine, label: ENGINES[engine].label, tier, count: 0, error: null };
    try {
      const image = await loadImage();
      out.image = image.which;
      say(`— Estresse ${ENGINES[engine].label} (${tier}): até ${LIMIT} leituras seguidas —`);
      setRunning({ what: 'estresse', engine, label: ENGINES[engine].label, tier, read: 0, of: LIMIT, since: Date.now() });
      await reader.ready();
      const t0 = performance.now();
      let last = t0;
      while (out.count < LIMIT && alive && !stopping) {
        await reader.read(canvasOf(image));
        out.count++;
        if (out.count % 5 === 0) setRunning({ ...running, read: out.count });
        if (out.count % 20 === 0) {
          const now = performance.now();
          say(`  ${out.count} leituras, últimas 20: ${Math.round((now - last) / 20)} ms cada`);
          last = now;
        }
      }
      out.seconds = Math.round((performance.now() - t0) / 1000);
      say(`✔ ${out.count} leituras em ${out.seconds} s${stopping ? ' (parado)' : ''}`);
    } catch (e) {
      out.error = e.message;
      say(`✖ parou na leitura ${out.count + 1}: ${e.message}`);
    } finally {
      reader.dispose();
      current = null;
      report.runs.push(out);
      setRunning(null);
      if (alive) setBusy(false);
    }
  });

  // ---------- Câmera com vídeos reais ----------
  const camHost = $('[data-camhost]', root);
  const camTable = $('[data-camtable]', root);

  async function openVideo(srcs) {
    let last = null;
    for (const src of srcs) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.src = src;
      try {
        await new Promise((resolve, reject) => {
          v.onloadeddata = resolve;
          v.onerror = () => reject(new Error(`não abriu ${src}`));
          setTimeout(() => reject(new Error(`${src} demorou`)), 20000);
        });
        await v.play();
        return v;
      } catch (e) { last = e && e.message; v.removeAttribute('src'); v.load(); }
    }
    throw new Error(`Nenhum dos vídeos abriu neste navegador (${last || '?'})`);
  }

  // O que a pessoa viu, a partir do registro da câmera (como tests/real-video.mjs).
  function summarizeCam(log, ref) {
    const ev = (what) => log.filter((e) => e.kind === 'event' && e.what === what);
    const shown = [...ev('pick'), ...ev('confirmed')].sort((a, b) => a.t - b.t);
    const at = (list) => { const e = list.find((x) => x.iso === ref); return e ? e.t : null; };
    const reads = log.filter((e) => e.kind === 'read');
    const confirmed = ev('confirmed')[0] || null;
    const small = ev('small-ready')[0];
    return {
      shownAt: at(shown), askedAt: at(ev('ask')), confirmedAt: confirmed && confirmed.iso === ref ? confirmed.t : null,
      wrongConfirmed: confirmed && confirmed.iso !== ref ? confirmed.iso : null,
      wrongShown: [...new Set(shown.filter((e) => e.iso !== ref).map((e) => e.iso))],
      reads: reads.length, photos: ev('shutter').length, smallBackend: small ? small.detail : null,
      // Quando cada leitura viu a data certa (s desde o início), as 8 primeiras.
      refAt: reads.filter((e) => (e.dates || []).some((d) => d.iso === ref)).slice(0, 8).map((e) => Math.round(e.t / 100) / 10),
      // Por que as leituras que viram a data certa não contaram (REJECT_TEXT).
      whyNot: reads.filter((e) => (e.dates || []).some((d) => d.iso === ref)).reduce((acc, e) => { const k = `${e.engine}:${e.result}`; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    };
  }

  async function runCamOnce(videoKey, modeKey, rep, reps) {
    const vid = CAM_VIDEOS[videoKey]; const mode = CAM_MODES[modeKey];
    say(`▶ Câmera: ${vid.label}, ${mode.label} (${rep} de ${reps})`);
    setRunning({ what: 'câmera com vídeo', label: `${vid.label} ${mode.label}`, tier: '', read: rep, of: reps, since: Date.now() });
    const out = { kind: 'camera-video', video: videoKey, mode: modeKey, rep };
    let video = null; let timer = 0; let draw = 0; let task = null;
    const origGum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    try {
      video = await openVideo(vid.src);
      out.src = video.currentSrc.split('/').pop();
      const [rx, ry, rw, rh] = vid.region;
      const c = document.createElement('canvas');
      c.width = Math.round(video.videoWidth * rw); c.height = Math.round(video.videoHeight * rh);
      const g = c.getContext('2d');
      const paint = () => { try { g.drawImage(video, video.videoWidth * rx, video.videoHeight * ry, c.width, c.height, 0, 0, c.width, c.height); } catch { /* quadro ainda não pronto */ } };
      paint();
      draw = setInterval(paint, 66);
      const stream = c.captureStream(15);
      navigator.mediaDevices.getUserMedia = async () => stream;
      camHost.hidden = false;
      camHost.innerHTML = '<div></div>';
      const start = performance.now();
      task = readExpiryWithCamera(camHost.firstElementChild, { experiment: mode.experiment, debug: false });
      timer = setTimeout(() => task.stop(), CAM_SECONDS * 1000);
      const stopCheck = setInterval(() => { if (stopping || !alive) task.stop(); }, 500);
      const accepted = await task;
      clearInterval(stopCheck);
      out.ms = Math.round(performance.now() - start);
      out.accepted = accepted || null;
      Object.assign(out, summarizeCam(task.log(), vid.ref));
      const t = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
      say(`  data certa na tela ${t(out.shownAt)}, perguntou ${t(out.askedAt)}, confirmou ${out.confirmedAt != null ? t(out.confirmedAt) : out.wrongConfirmed ? `ERRADO (${out.wrongConfirmed})` : 'não'}, ${out.photos} fotos, ${out.reads} leituras, leitor rápido ${out.smallBackend || '?'}`);
    } catch (e) {
      out.error = e.message;
      say(`  ✖ ${e.message}`);
    } finally {
      clearTimeout(timer); clearInterval(draw);
      if (task) task.stop();
      if (origGum) navigator.mediaDevices.getUserMedia = origGum;
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      camHost.innerHTML = ''; camHost.hidden = true;
      setRunning(null);
    }
    return out;
  }

  function renderCamTable() {
    const runs = report.runs.filter((r) => r.kind === 'camera-video' && !r.error);
    if (!runs.length) { camTable.innerHTML = ''; return; }
    const t = (ms) => (ms == null ? '—' : `${Math.round(ms / 1000)} s`);
    const rows = [];
    for (const [vk, vid] of Object.entries(CAM_VIDEOS)) {
      for (const [mk, mode] of Object.entries(CAM_MODES)) {
        const rs = runs.filter((r) => r.video === vk && r.mode === mk);
        if (!rs.length) continue;
        const ok = rs.filter((r) => r.confirmedAt != null);
        const asked = rs.filter((r) => r.askedAt != null);
        const shown = rs.filter((r) => r.shownAt != null);
        const wrong = rs.filter((r) => r.wrongConfirmed).length;
        rows.push(`<tr><td>${esc(vid.label)}<br><small>${esc(mode.label)}</small></td>
          <td>${ok.length}/${rs.length}${ok.length ? `<br><small>mediana ${t(median(ok.map((r) => r.confirmedAt)))}</small>` : ''}${wrong ? `<br><b>${wrong} errada(s)</b>` : ''}</td>
          <td>${asked.length}/${rs.length}${asked.length ? `<br><small>mediana ${t(median(asked.map((r) => r.askedAt)))}</small>` : ''}</td>
          <td>${shown.length}/${rs.length}${shown.length ? `<br><small>mediana ${t(median(shown.map((r) => r.shownAt)))}</small>` : ''}</td></tr>`);
      }
    }
    camTable.innerHTML = `<table class="tests-table"><thead><tr><th>Vídeo</th><th>Confirmou sozinho</th><th>Perguntou</th><th>Data certa na tela</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  renderCamTable(); // resultados guardados de antes

  // Uso real (js/expiryUsage.js): o resumo e as 15 últimas.
  const usageHost = $('[data-usage]', root);
  function renderUsage() {
    const list = usageList();
    if (!list.length) { usageHost.innerHTML = '<p class="group-note">Nenhuma leitura ainda.</p>'; return; }
    const count = {};
    for (const e of list) count[e.how || '?'] = (count[e.how || '?'] || 0) + 1;
    const byCamera = list.filter((e) => ['sozinho', 'pergunta', 'botão', 'painel'].includes(e.how) && e.ms != null);
    const typed = list.filter((e) => e.how === 'digitou');
    const kept = typed.filter((e) => e.keptGuess).length;
    const secs = (ms) => (ms == null ? '—' : `${Math.round(ms / 1000)} s`);
    const when = (iso) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    usageHost.innerHTML = `
      <p class="group-note">${list.length} leituras, ${Object.entries(count).map(([k, n]) => `${esc(k)} ${n}`).join(', ')}${byCamera.length ? `, pela câmera, mediana ${secs(median(byCamera.map((e) => e.ms)))}` : ''}${typed.length ? `, digitou ${typed.length} (a data sugerida ficou em ${kept})` : ''}</p>
      <table class="tests-table"><thead><tr><th>Quando</th><th>Como</th><th>Tempo</th><th>Salvou</th></tr></thead><tbody>
      ${list.slice(-15).reverse().map((e) => `<tr><td>${when(e.at)}</td><td>${esc(e.how || '?')}</td><td>${secs(e.ms)}</td><td>${e.saved ? 'sim' : 'não'}</td></tr>`).join('')}
      </tbody></table>`;
  }
  renderUsage();
  $('[data-usage-clear]', root).addEventListener('click', () => {
    if (!confirm('Apagar o registro de uso da validade?')) return;
    usageClear();
    renderUsage();
  });

  $('[data-camres]', root).addEventListener('click', async () => {
    say('— Resolução da câmera —');
    const out = { kind: 'camera-res', imageCapture: 'ImageCapture' in window, asks: [] };
    for (const [label, width, height] of [['12 MP (4:3)', 4032, 3024], ['4K', 3840, 2160], ['1080p', 1920, 1080]]) {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: width }, height: { ideal: height } } });
        const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream;
        await v.play().catch(() => {});
        for (let i = 0; i < 40 && !v.videoWidth; i++) await new Promise((r) => setTimeout(r, 50));
        const track = stream.getVideoTracks()[0];
        const set = track.getSettings ? track.getSettings() : {};
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        const got = { pediu: label, veio: `${v.videoWidth}×${v.videoHeight}`, fps: set.frameRate ? Math.round(set.frameRate) : null, max: caps.width ? `${caps.width.max}×${caps.height.max}` : null };
        out.asks.push(got);
        say(`  pediu ${label}: veio ${got.veio}${got.fps ? ` a ${got.fps} q/s` : ''}${got.max ? ` (máximo ${got.max})` : ''}`);
      } catch (e) {
        out.asks.push({ pediu: label, erro: String(e && e.message || e) });
        say(`  pediu ${label}: erro ${e && e.message}`);
      } finally {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    say(`  foto em resolução de foto (ImageCapture): ${out.imageCapture ? 'tem' : 'não tem'}`);
    report.runs.push(out);
    persist();
  });

  $('[data-camrun]', root).addEventListener('click', async () => {
    if (busy) return;
    const vids = [...root.querySelectorAll('[data-vid]')].filter((c) => c.checked).map((c) => c.dataset.vid);
    const modes = [...root.querySelectorAll('[data-cmode]')].filter((c) => c.checked).map((c) => c.dataset.cmode);
    const reps = Math.max(1, Math.min(5, Number($('[data-reps]', root).value) || 1));
    if (!vids.length || !modes.length) { toast('Escolha pelo menos um vídeo e um jeito.'); return; }
    setBusy(true);
    say(`— Câmera com vídeos: ${vids.join(', ')} × ${modes.join(', ')}, ${reps} vez(es), até ${CAM_SECONDS} s cada —`);
    try {
      // Intercala os jeitos, para o celular esquentar igual para os dois.
      for (let rep = 1; rep <= reps; rep++) {
        for (const v of vids) {
          for (const m of modes) {
            if (!alive || stopping) break;
            report.runs.push(await runCamOnce(v, m, rep, reps));
            persist();
            renderCamTable();
            await pause(1500);
          }
        }
      }
      say('✔ câmera com vídeos: pronto');
    } finally { if (alive) setBusy(false); }
  });

  stopBtn.addEventListener('click', () => { stopping = true; say('… parando depois da leitura atual'); });

  $('[data-send]', root).addEventListener('click', (e) => {
    if (busy) { e.preventDefault(); toast('Espere o teste terminar.'); return; }
    if (!report.runs.length && !report.events.length) { e.preventDefault(); toast('Rode um teste antes de enviar.'); return; }
    copyForBancada(forBancada(), () => toast('Não deu para copiar. Use Copiar resultado e cole na Bancada.', { duration: 5000 }));
  });

  // A Bancada guarda até 240 KB por envio: tira as miniaturas mais antigas
  // e, se ainda precisar, os testes mais antigos.
  function forBancada() {
    const copy = JSON.parse(JSON.stringify(report));
    copy.log = log.textContent.slice(0, 12000); // mais recente primeiro
    copy.usoReal = usageList().slice(-100);
    let text = JSON.stringify(copy);
    for (const r of copy.runs) { if (text.length < 230000) break; if (r.thumb) { r.thumb = null; text = JSON.stringify(copy); } }
    while (text.length >= 230000 && copy.runs.length > 1) { copy.runs.shift(); copy.cortado = true; text = JSON.stringify(copy); }
    return text;
  }

  $('[data-clear]', root).addEventListener('click', () => {
    if (busy) return;
    const env = report.env;
    report = fresh();
    report.env = env;
    lastTable = [];
    table.innerHTML = '';
    camTable.innerHTML = '';
    log.textContent = '';
    persist();
    toast('Resultados apagados.', { duration: 2000 });
  });

  $('[data-copy]', root).addEventListener('click', async () => {
    const text = JSON.stringify(report, null, 1);
    try { await navigator.clipboard.writeText(text); toast('Resultado copiado. Cole numa mensagem.'); }
    catch { download(`testes-${Date.now()}.json`, text, 'application/json'); toast('Resultado baixado.'); }
  });

  root.addEventListener('change', (e) => {
    if (e.target.name === 'img') loadImage().catch((err) => say(`✖ imagem: ${err.message}`));
    persist();
  });
  if (!mine) loadImage().catch((err) => say(`✖ imagem: ${err.message}`));

  return () => {
    alive = false;
    // Saiu da tela pelo app (não é queda): o teste em andamento só para.
    if (running) { report.events.push({ t: new Date().toISOString(), what: 'saiu-da-tela-durante-teste', detail: running }); running = null; }
    persist();
    if (current) current.dispose();
    if (wake) wake.release().catch(() => {});
  };
}
