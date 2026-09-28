// Quando usar a GPU (WebGPU) no leitor de validade. No iPhone (iOS 27) o
// Paddle small com o onnxruntime 1.30 na GPU ficou ~3× mais rápido e aguentou
// 600 leituras seguidas; o onnxruntime 1.24 e o modelo medium derrubaram o
// app (docs/INTERFACES.md, versões 3.46 e 3.47).
//
// Proteção: antes de cada leitura na GPU fica uma marca no aparelho, apagada
// quando a leitura termina. Se o app cair no meio (o iPhone fecha o app, sem
// erro que dê para tratar), a marca sobra; na próxima vez a GPU fica
// desligada neste aparelho e o leitor sem GPU assume. A tela de testes pode
// religar.
const READING = 'ki.gpu.lendo';
const OFF = 'ki.gpu.desligada';

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const del = (k) => { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } };

// Olhado uma vez, quando o app abre: marca que sobrou = queda na última vez.
const crashed = get(READING);
if (crashed) { set(OFF, JSON.stringify({ at: Date.now(), since: Number(crashed) })); del(READING); }

/** A GPU pode ser tentada neste aparelho agora? */
export function gpuAllowed() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && !get(OFF);
}
/** Por que está desligada (para o diagnóstico), ou null. */
export function gpuOffReason() {
  try { return JSON.parse(get(OFF) || 'null'); } catch { return null; }
}
export function gpuReadStarted() { set(READING, String(Date.now())); }
export function gpuReadEnded() { del(READING); }
export function gpuReset() { del(OFF); del(READING); }
