// O que atrapalha a leitura dentro da mira: pouca luz, reflexo estourado ou
// imagem tremida. Serve só para dizer isso à pessoa; nenhum quadro deixa de
// ser lido por causa desta medida (descartar quadros "ruins" já piorou a
// leitura antes — ver docs/TESTES_VALIDADES_REAIS.md).
//
// Recebe pixels RGBA de um recorte de ~320 px de largura. Os limites vieram de
// quadros reais do vídeo da lata (docs/LEITURA_VALIDADE.md): tremido ficou
// abaixo de ~35 na variância do Laplaciano, os nítidos acima de ~95.
export const DARK_MEAN = 45;
export const GLARE_SHARE = 0.025;
export const BLUR_VARIANCE = 35;

export function frameIssue({ data, width, height }) {
  const gray = new Float32Array(width * height);
  let sum = 0; let blown = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
    gray[i] = v; sum += v;
    if (v >= 250) blown++;
  }
  if (sum / gray.length < DARK_MEAN) return 'dark';
  if (blown / gray.length >= GLARE_SHARE) return 'glare';
  let n = 0; let mean = 0; let m2 = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      n++; const d = lap - mean; mean += d / n; m2 += d * (lap - mean);
    }
  }
  if (n && m2 / n < BLUR_VARIANCE) return 'blur';
  return null;
}

/** Nitidez (variância do Laplaciano) de um recorte pequeno: maior é mais nítido. */
export function sharpness({ data, width, height }) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  let n = 0; let mean = 0; let m2 = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      n++; const d = lap - mean; mean += d / n; m2 += d * (lap - mean);
    }
  }
  return n ? m2 / n : 0;
}
