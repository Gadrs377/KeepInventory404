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

const SAMPLES = { copo: 'vendor/paddle/amostras/copo.jpg', chocolate: 'vendor/paddle/amostras/chocolate.jpg' };
const ENGINES = {
  // Prazo largo: a 1ª leitura na GPU inclui preparar os programas dela.
  v3: { label: 'Atual (sem GPU)', opts: { readTimeout: 180000 } },
  gpu: { label: 'GPU', opts: { gpu: 'webgpu', readTimeout: 180000 } },
  gpuwasm: { label: 'Pacote novo sem GPU', opts: { gpu: 'wasm', readTimeout: 180000 } },
};

// "3,2× mais rápido" ou "32× mais lento" que o atual.
const speed = (base, ms) => {
  const k = base / ms;
  const f = (x) => (x >= 10 ? Math.round(x) : x.toFixed(1).replace('.', ','));
  return k >= 1 ? `${f(k)}× mais rápido` : `${f(1 / k)}× mais lento`;
};
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
          <label><input type="checkbox" data-extra> Também o pacote novo sem GPU</label>
        </fieldset>
        <img class="tests-img" alt="Imagem usada no teste" data-preview>
        <div class="tests-actions">
          <button type="button" class="btn btn-primary" data-run>Comparar</button>
          <button type="button" class="btn btn-quiet" data-stress>Estresse GPU</button>
          <button type="button" class="btn btn-quiet" data-stop disabled>Parar</button>
          <button type="button" class="btn btn-quiet" data-copy>Copiar resultado</button>
        </div>
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
  const buttons = ['[data-run]', '[data-stress]', '[data-copy]'].map((s) => $(s, root));
  const stopBtn = $('[data-stop]', root);
  const report = { kind: 'testes-gpu', when: new Date().toISOString(), ua: navigator.userAgent, env: null, runs: [], events: [] };
  const event = (what, detail = null) => report.events.push({ t: new Date().toISOString(), what, detail });
  let alive = true;
  let stopping = false;
  let busy = false;
  let wake = null;
  let current = null; // leitor aberto agora (para parar)
  let mine = null; // data URL da foto escolhida, já reduzida (≤ 1600 px)

  const say = (line) => { log.textContent = `${line}\n${log.textContent}`.slice(0, 20000); };
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
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del: (k) => { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
  };
  function photoSay(text) { photoStatus.textContent = text; say(`[foto] ${text}`); }
  function useMine(dataUrl, name) {
    mine = dataUrl;
    mineRadio.disabled = false;
    mineRadio.checked = true;
    mineName.textContent = `(${name})`;
    loadImage().catch((e) => photoSay(`Não deu para mostrar a foto: ${e.message}`));
  }
  const pickingSince = Number(store.get(PICKING) || 0);
  if (pickingSince && Date.now() - pickingSince < 10 * 60000) {
    photoSay('A tela recarregou enquanto você escolhia a foto. Provavelmente o iPhone fechou o app por falta de memória. Tente de novo; se repetir, feche outros apps.');
    event('recarregou-escolhendo-foto', { segundos: Math.round((Date.now() - pickingSince) / 1000) });
  }
  store.del(PICKING);
  try {
    const saved = JSON.parse(store.get(PHOTO) || 'null');
    if (saved && saved.url) { useMine(saved.url, saved.name); event('foto-restaurada', { nome: saved.name }); }
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

  async function runEngine(key, image, tier, n) {
    const { label, opts } = ENGINES[key];
    say(`▶ ${label} (${tier}): preparando…`);
    const reader = createPaddleReader(tier, opts);
    current = reader;
    const out = { engine: key, label, tier, image: image.which, reads: [], texts: [] };
    try {
      const t0 = performance.now();
      const ready = await reader.ready();
      out.initMs = Math.round(performance.now() - t0);
      out.providers = ready.summary ? `${ready.summary.detProvider}/${ready.summary.recProvider}` : 'wasm/wasm';
      say(`  pronto em ${(out.initMs / 1000).toFixed(1)} s (${out.providers})`);
      for (let i = 0; i < n && alive && !stopping; i++) {
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
    }
    out.firstMs = out.reads[0] ?? null;
    out.medianMs = median(out.reads.slice(1));
    const dates = findExpiryCandidates(out.texts[0] || '');
    out.dates = dates.map((d) => d.iso);
    return out;
  }

  function renderTable(runs) {
    const base = runs.find((r) => r.engine === 'v3' && !r.error);
    table.innerHTML = `<table class="tests-table">
      <thead><tr><th>Motor</th><th>Preparar</th><th>1ª leitura</th><th>Demais (mediana)</th><th>Datas lidas</th></tr></thead>
      <tbody>${runs.map((r) => `<tr>
        <td>${esc(r.label)}<br><small>${esc(r.providers || '')}</small></td>
        <td>${r.initMs != null ? `${(r.initMs / 1000).toFixed(1)} s` : '—'}</td>
        <td>${r.firstMs != null ? `${r.firstMs} ms` : '—'}</td>
        <td>${r.error ? `<b>erro</b>: ${esc(r.error)}` : `<b>${r.medianMs} ms</b>${base && r !== base && base.medianMs ? `<br><small>${speed(base.medianMs, r.medianMs)}</small>` : ''}`}</td>
        <td>${r.dates && r.dates.length ? r.dates.map((d) => esc(formatDate(d))).join(', ') : '—'}${base && r !== base && r.texts[0] !== undefined ? `<br><small>${r.texts[0] === base.texts[0] ? 'mesmo texto do atual' : 'texto diferente do atual'}</small>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  $('[data-run]', root).addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    const runs = [];
    try {
      const image = await loadImage();
      const tier = pick('tier');
      const n = Math.max(2, Math.min(30, Number($('[data-n]', root).value) || 6));
      const keys = ['v3', 'gpu', ...($('[data-extra]', root).checked ? ['gpuwasm'] : [])];
      say(`— Comparar: ${image.which}, ${image.w}×${image.h}, ${tier}, ${n} leituras —`);
      for (const key of keys) {
        if (!alive || stopping) break;
        runs.push(await runEngine(key, image, tier, n));
        renderTable(runs);
      }
      report.runs.push({ kind: 'comparar', image: image.which, size: `${image.w}x${image.h}`, thumb: thumbOf(image), runs });
      say('✔ pronto');
    } catch (e) { say(`✖ ${e.message}`); }
    finally { if (alive) setBusy(false); }
  });

  $('[data-stress]', root).addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    const LIMIT = 600;
    const tier = pick('tier');
    const reader = createPaddleReader(tier, ENGINES.gpu.opts);
    current = reader;
    const out = { kind: 'estresse', tier, count: 0, error: null };
    try {
      const image = await loadImage();
      out.image = image.which;
      say(`— Estresse GPU (${tier}): até ${LIMIT} leituras seguidas —`);
      await reader.ready();
      const t0 = performance.now();
      let last = t0;
      while (out.count < LIMIT && alive && !stopping) {
        await reader.read(canvasOf(image));
        out.count++;
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
      if (alive) setBusy(false);
    }
  });

  stopBtn.addEventListener('click', () => { stopping = true; say('… parando depois da leitura atual'); });

  $('[data-send]', root).addEventListener('click', (e) => {
    if (busy) { e.preventDefault(); toast('Espere o teste terminar.'); return; }
    if (!report.runs.length && !report.events.length) { e.preventDefault(); toast('Rode um teste antes de enviar.'); return; }
    copyForBancada(JSON.stringify(report), () => toast('Não deu para copiar. Use Copiar resultado e cole na Bancada.', { duration: 5000 }));
  });

  $('[data-copy]', root).addEventListener('click', async () => {
    const text = JSON.stringify(report, null, 1);
    try { await navigator.clipboard.writeText(text); toast('Resultado copiado. Cole numa mensagem.'); }
    catch { download(`testes-${Date.now()}.json`, text, 'application/json'); toast('Resultado baixado.'); }
  });

  root.addEventListener('change', (e) => {
    if (e.target.name === 'img') loadImage().catch((err) => say(`✖ imagem: ${err.message}`));
  });
  if (!mine) loadImage().catch((err) => say(`✖ imagem: ${err.message}`));

  return () => {
    alive = false;
    if (current) current.dispose();
    if (wake) wake.release().catch(() => {});
  };
}
