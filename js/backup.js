// Cópia automática do armário no repassador (docs/SYSTEM_DESIGN.md, seção 5.8).
// Sempre que o armário muda, depois de uns segundos parado, o backup inteiro
// (o mesmo de "Baixar backup") vai comprimido com a chave da casa. A chave é
// um texto aleatório que fica no celular; em outro celular, digitar o mesmo
// código traz a cópia. Ainda sem cifrar (PLANO_MELHORIAS, seção 15).

import { API_URL } from './config.js';
import { exportData, importData, onChange, listProducts } from './store.js';
import { tel } from './telemetry.js';

const KEY = 'ki.backup.chave';
const AT = 'ki.backup.at';
const WAIT = 20000;      // parado há 20 s
const MIN_GAP = 300000;  // no máximo uma cópia a cada 5 min
let timer = 0;
let lastTry = 0;
let running = false;

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

export function backupKey() {
  let k = store.get(KEY);
  if (!k || !/^[a-z0-9]{24,48}$/.test(k)) {
    // 24 letras e números, sem os que se confundem (0 e o, 1, i e l).
    const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
    k = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => ABC[b % ABC.length]).join('');
    store.set(KEY, k);
  }
  return k;
}

// Código para mostrar e digitar: em grupos de 4, sem diferença de maiúscula.
export const formatCode = (k) => k.replace(/(.{4})(?=.)/g, '$1 ').toUpperCase();
export const parseCode = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function lastBackupAt() {
  const v = Number(store.get(AT));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

// gzip quando o navegador tem (iPhone com iOS 16.4 ou mais); senão, o texto.
export async function packBackup(data) {
  const text = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'undefined') return text;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unpackBackup(bytes) {
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = gz
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

// Manda agora. Resolve com a hora da cópia, ou lança erro.
export async function backupNow() {
  if (running) return lastBackupAt();
  running = true;
  lastTry = Date.now();
  try {
    // Armário vazio (app recém-instalado) nunca sobrescreve uma cópia.
    if (!(await listProducts()).length) return lastBackupAt();
    const body = await packBackup(await exportData());
    const res = await fetch(`${API_URL}/backup?chave=${backupKey()}`, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { t } = await res.json();
    store.set(AT, String(t || Date.now()));
    return t;
  } catch (err) {
    tel('backup', { erro: String((err && err.message) || err).slice(0, 120) });
    throw err;
  } finally {
    running = false;
  }
}

function schedule() {
  clearTimeout(timer);
  const wait = Math.max(WAIT, MIN_GAP - (Date.now() - lastTry));
  timer = setTimeout(() => {
    if (!navigator.onLine) { schedule(); return; }
    backupNow().catch(() => {});
  }, wait);
}

// Liga a cópia automática: a cada mudança no armário e ao abrir, se a última
// cópia tiver mais de um dia.
export function startAutoBackup() {
  onChange(schedule);
  if (Date.now() - lastBackupAt() > 86400000) setTimeout(() => backupNow().catch(() => {}), 8000);
}

// Traz a cópia de um código (este celular ou outro) e substitui o armário.
export async function fetchBackup(code) {
  const key = parseCode(code);
  if (!/^[a-z0-9]{24,48}$/.test(key)) throw new Error('Esse código não está completo. Confira as letras e os números.');
  let res;
  try {
    res = await fetch(`${API_URL}/backup?chave=${key}`);
  } catch {
    throw new Error('Sem internet para buscar a cópia agora.');
  }
  if (res.status === 404) throw new Error('Nenhuma cópia com esse código.');
  if (!res.ok) throw new Error('Não deu para buscar a cópia agora. Tente de novo.');
  const { t, dados } = await res.json();
  const bin = atob(dados);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { t, data: await unpackBackup(bytes), key };
}

export async function restoreBackup(fetched) {
  const n = await importData(fetched.data);
  // A casa passa a usar o código da cópia: as próximas vão para o mesmo lugar.
  store.set(KEY, fetched.key);
  store.set(AT, String(fetched.t));
  return n;
}
