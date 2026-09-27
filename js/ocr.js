// Leitura de texto no próprio celular (Tesseract.js, em vendor/tesseract), sem
// internet e sem IA na nuvem. Usada para a data de validade impressa na
// embalagem. Só baixa os arquivos (uns 7 MB) na primeira vez; depois ficam
// guardados no aparelho.

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;
let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('O leitor de validade não carregou. Confira a internet e tente de novo.'));
    document.head.append(s);
  });
}

// `onProgress(0..1)` acompanha o download da primeira vez.
export function ocrWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      if (!window.Tesseract) await loadScript(`${BASE}tesseract.min.js`);
      const worker = await window.Tesseract.createWorker('eng', 1, {
        workerPath: `${BASE}worker.min.js`,
        corePath: `${BASE}core`,
        langPath: `${BASE}lang`,
        workerBlobURL: false,
        logger: (m) => { if (onProgress && m && typeof m.progress === 'number' && /load|init/i.test(m.status || '')) onProgress(m.progress); },
      });
      // Um bloco de texto; só números, separadores e letras maiúsculas
      // (rótulos como VAL e FAB, e meses como OUT).
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: '0123456789/.-: ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        preserve_interword_spaces: '1',
      });
      return worker;
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

/**
 * Recorta a faixa da mira do quadro da câmera e prepara para a leitura:
 * cinza, contraste esticado, e (com `blur`) um desfoque que junta os pontinhos
 * da impressão a jato antes de separar tinta de fundo (limiar de Otsu).
 * Texto sai preto sobre branco, seja qual for a cor da embalagem.
 */
export function prepareFrame(video, { box = { x: 0.08, y: 0.36, w: 0.84, h: 0.28 }, blur = 1, width = 1000 } = {}, canvas = document.createElement('canvas')) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sx = Math.round(vw * box.x);
  const sy = Math.round(vh * box.y);
  const sw = Math.round(vw * box.w);
  const sh = Math.round(vh * box.h);
  const scale = Math.min(2, width / sw);
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  let gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;

  // Desfoque em caixa (raio `blur`), separável: junta os pontos da tinta.
  for (let r = blur; r > 0; r--) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0; let n = 0;
        for (let k = -1; k <= 1; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += gray[y * w + xx]; n++; } }
        tmp[y * w + x] = s / n;
      }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0; let n = 0;
        for (let k = -1; k <= 1; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
        out[y * w + x] = s / n;
      }
    }
    gray = out;
  }

  // Limiar de Otsu sobre o histograma.
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0; let wB = 0; let best = 0; let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  // A tinta é a minoria dos pixels: se o escuro for maioria, a data é clara
  // sobre fundo escuro e a imagem é invertida.
  let dark = 0;
  for (let i = 0; i < gray.length; i++) if (gray[i] <= thr) dark++;
  const invert = dark > total / 2;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const ink = invert ? gray[j] > thr : gray[j] <= thr;
    const v = ink ? 0 : 255;
    px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function readText(canvas) {
  const worker = await ocrWorker();
  const { data } = await worker.recognize(canvas);
  return (data && data.text) || '';
}
