// Small, deterministic image operations; no CDN or additional runtime.
function otsu(hist, total) {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0; let count = 0; let best = -1; let threshold = 127;
  for (let t = 0; t < 256; t++) {
    count += hist[t];
    if (!count) continue;
    const rest = total - count;
    if (!rest) break;
    sumB += t * hist[t];
    const delta = sumB / count - (sum - sumB) / rest;
    const score = count * rest * delta * delta;
    if (score > best) { best = score; threshold = t; }
  }
  return threshold;
}

export function filterPixels(pixels, w, h, { mode = 'otsu', blur = 0 } = {}) {
  // Printed/embossed marks sometimes separate from the background in one
  // color channel. Stretch percentiles, so glare doesn't set the whole range.
  if (mode === 'red' || mode === 'blue') {
    const channel = mode === 'red' ? 0 : 2;
    const values = new Uint8Array(w * h);
    for (let i=0;i<values.length;i++) values[i]=pixels[i*4+channel];
    const sorted=values.slice().sort();
    const lo=sorted[Math.floor(sorted.length*.01)],hi=sorted[Math.floor(sorted.length*.99)];
    for(let i=0;i<values.length;i++) {
      const v=255*(values[i]-lo)/Math.max(1,hi-lo);
      pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=v; pixels[i*4+3]=255;
    }
    return;
  }
  let gray = new Float32Array(w * h);
  for (let j = 0; j < gray.length; j++) gray[j] = pixels[j * 4] * .299 + pixels[j * 4 + 1] * .587 + pixels[j * 4 + 2] * .114;
  for (let r = 0; r < Math.min(3, blur); r++) {
    const tmp = new Float32Array(gray.length);
    const out = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - 1); const b = Math.min(w - 1, x + 1);
      let s = 0; for (let k = a; k <= b; k++) s += gray[y * w + k];
      tmp[y * w + x] = s / (b - a + 1);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = Math.max(0, y - 1); const b = Math.min(h - 1, y + 1);
      let s = 0; for (let k = a; k <= b; k++) s += tmp[k * w + x];
      out[y * w + x] = s / (b - a + 1);
    }
    gray = out;
  }
  const hist = new Uint32Array(256);
  for (const n of gray) hist[Math.max(0, Math.min(255, Math.round(n)))]++;
  let global = otsu(hist, gray.length);
  // For local filters use the border to estimate background polarity. The
  // original and gray passes are also tried, so a bad inversion isn't final.
  let border = 0; let count = 0;
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 24))) {
    border += gray[y * w] + gray[y * w + w - 1]; count += 2;
  }
  const invert = mode === 'otsu'
    ? gray.reduce((n, p) => n + (p <= global), 0) > gray.length / 2
    : border / count < 100;
  if (invert) { for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i]; global = 255 - global; }

  let thresholds;
  if (mode === 'adaptive') {
    // Otsu in overlapping local windows, sampled on a grid and interpolated.
    const step = 48; const cols = Math.ceil(w / step) + 1; const rows = Math.ceil(h / step) + 1;
    const grid = new Float32Array(cols * rows);
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.max(0, gx * step - step); const x1 = Math.min(w, gx * step + step);
      const y0 = Math.max(0, gy * step - step); const y1 = Math.min(h, gy * step + step);
      hist.fill(0); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[Math.round(gray[y * w + x])]++;
      grid[gy * cols + gx] = otsu(hist, (x1 - x0) * (y1 - y0));
    }
    thresholds = new Float32Array(gray.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = Math.floor(x / step); const gy = Math.floor(y / step); const fx = x / step - gx; const fy = y / step - gy;
      const top = grid[gy * cols + gx] * (1 - fx) + grid[gy * cols + gx + 1] * fx;
      const bottom = grid[(gy + 1) * cols + gx] * (1 - fx) + grid[(gy + 1) * cols + gx + 1] * fx;
      thresholds[y * w + x] = top * (1 - fy) + bottom * fy;
    }
  } else if (mode === 'sauvola') {
    const stride = w + 1; const sum = new Float64Array(stride * (h + 1)); const squares = new Float64Array(sum.length);
    for (let y = 1; y <= h; y++) {
      let row = 0; let rowSq = 0;
      for (let x = 1; x <= w; x++) {
        const v = gray[(y - 1) * w + x - 1]; row += v; rowSq += v * v;
        sum[y * stride + x] = sum[(y - 1) * stride + x] + row;
        squares[y * stride + x] = squares[(y - 1) * stride + x] + rowSq;
      }
    }
    thresholds = new Float32Array(gray.length);
    const area = (a, x0, y0, x1, y1) => a[y1 * stride + x1] - a[y0 * stride + x1] - a[y1 * stride + x0] + a[y0 * stride + x0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 15); const y0 = Math.max(0, y - 15); const x1 = Math.min(w, x + 16); const y1 = Math.min(h, y + 16);
      const n = (x1 - x0) * (y1 - y0); const mean = area(sum, x0, y0, x1, y1) / n;
      const deviation = Math.sqrt(Math.max(0, area(squares, x0, y0, x1, y1) / n - mean * mean));
      thresholds[y * w + x] = mean * (1 + .22 * (deviation / 128 - 1));
    }
  }
  for (let j = 0; j < gray.length; j++) {
    const v = mode === 'gray' ? gray[j] : gray[j] <= (thresholds ? thresholds[j] : global) ? 0 : 255;
    pixels[j * 4] = v; pixels[j * 4 + 1] = v; pixels[j * 4 + 2] = v; pixels[j * 4 + 3] = 255;
  }
}

export function prepareFrame(source, { box = { x: .08, y: .36, w: .84, h: .28 }, width = 1000, maxH = 600, maxScale = 2, blur = 1, mode = 'otsu', angle = 0 } = {}, canvas = document.createElement('canvas')) {
  const vw = source.videoWidth || source.naturalWidth || source.width;
  const vh = source.videoHeight || source.naturalHeight || source.height;
  if (!vw || !vh) throw new Error('Quadro da câmera indisponível');
  const sx = Math.max(0, Math.min(vw - 1, Math.round(vw * box.x)));
  const sy = Math.max(0, Math.min(vh - 1, Math.round(vh * box.y)));
  const sw = Math.max(1, Math.min(vw - sx, Math.round(vw * box.w)));
  const sh = Math.max(1, Math.min(vh - sy, Math.round(vh * box.h)));
  // Uma foto parada (câmera fixa, sem tremor de vídeo) aguenta um recorte maior:
  // `maxScale`/`maxH` sobem para a leitura de reforço com foto nítida.
  const scale = Math.min(maxScale, width / sw, maxH / sh);
  const w = Math.max(1, Math.round(sw * scale)); const h = Math.max(1, Math.round(sh * scale));
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  if (mode !== 'raw') {
    const image = ctx.getImageData(0, 0, w, h);
    filterPixels(image.data, w, h, { mode, blur }); ctx.putImageData(image, 0, 0);
  }
  if (angle) {
    const copy = document.createElement('canvas'); copy.width = w; copy.height = h; copy.getContext('2d').drawImage(canvas, 0, 0);
    const radians = angle * Math.PI / 180;
    canvas.width = Math.ceil(w * Math.abs(Math.cos(radians)) + h * Math.abs(Math.sin(radians))) + 16;
    canvas.height = Math.ceil(h * Math.abs(Math.cos(radians)) + w * Math.abs(Math.sin(radians))) + 16;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(radians); ctx.drawImage(copy, -w / 2, -h / 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return canvas;
}
