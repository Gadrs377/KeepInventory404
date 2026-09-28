// Leitura de texto no próprio celular (Tesseract.js, em vendor/tesseract), sem
// internet e sem IA na nuvem. Usada para a data de validade impressa na
// embalagem. Só baixa os arquivos (uns 7 MB) na primeira vez; depois ficam
// guardados no aparelho.

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;
let workerPromise = null;
let activeWorker = null;
let generation = 0;
let queue = Promise.resolve();
const cancellations = new Set();

export function releaseOcr() {
  generation++;
  for (const cancel of [...cancellations]) cancel(new Error('Leitura encerrada'));
  cancellations.clear();
  activeWorker?.terminate(); activeWorker = null;
  workerPromise = null; queue = Promise.resolve();
}

function bounded(promise, ms) {
  return new Promise((resolve, reject) => {
    const cancel = error => { clearTimeout(timer); cancellations.delete(cancel); reject(error); };
    const timer = setTimeout(() => { cancel(new Error('Leitor demorou demais')); releaseOcr(); }, ms);
    cancellations.add(cancel);
    promise.then(value => { clearTimeout(timer); cancellations.delete(cancel); resolve(value); }, cancel);
  });
}

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
    const epoch = generation;
    const promise = bounded((async () => {
      if (!window.Tesseract) await loadScript(`${BASE}tesseract.min.js`);
      if (epoch !== generation) throw new Error('Leitura encerrada');
      // "por" ajuda a desambiguar rótulos e meses em português (VALIDADE, OUT,
      // DEZ…) que "eng" sozinho não tem razão para achar prováveis. Medido em
      // 16 leituras de teste, carregar os dois juntos não deixou mais lento
      // (mediana quase igual à de "eng" sozinho, com o mesmo whitelist e PSM).
      // Sem chamada de rede: os dois pacotes já vieram baixados juntos.
      const worker = await window.Tesseract.createWorker('eng+por', 1, {
        workerPath: `${BASE}worker.min.js`,
        corePath: `${BASE}core`,
        langPath: `${BASE}lang`,
        workerBlobURL: false,
        logger: (m) => { if (onProgress && m && typeof m.progress === 'number' && /load|init/i.test(m.status || '')) onProgress(m.progress); },
      });
      if (epoch !== generation) { worker.terminate(); throw new Error('Leitura encerrada'); }
      activeWorker = worker;
      // Um bloco de texto; só números, separadores e letras maiúsculas
      // (rótulos como VAL e FAB, e meses como OUT).
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: '0123456789/.-: ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        preserve_interword_spaces: '1',
      });
      return worker;
    })(), 45000);
    workerPromise = promise;
    promise.catch(() => { if (workerPromise === promise) releaseOcr(); });
  }
  return workerPromise;
}

// Recognition calls are serialized because PSM is a worker-wide parameter.
export function readResult(canvas, { psm = 6 } = {}) {
  const epoch = generation;
  const job = queue.then(async () => {
    if (epoch !== generation) throw new Error('Leitura encerrada');
    const worker = await ocrWorker();
    return bounded((async () => {
      await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
      const { data } = await worker.recognize(canvas);
      return { text: data?.text || '', confidence: Number(data?.confidence) || 0 };
    })(), 15000);
  });
  queue = job.catch(() => {});
  return job;
}
export async function readText(canvas, options) {
  return (await readResult(canvas, options)).text;
}
export { dotLine, prepareFrame, thickenDark } from './ocrImage.js';
