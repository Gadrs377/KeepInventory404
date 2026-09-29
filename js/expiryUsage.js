// Registro do uso real da leitura de validade: um resumo por vez que a folha
// de validade abre a câmera (quanto levou, como terminou, se salvou). Fica só
// no celular (localStorage) e vai para a Bancada pela tela de testes, para
// medir o app no uso de verdade em vez de só nos vídeos de teste.

import { tel } from './telemetry.js';

const KEY = 'ki.validade.uso';
const MAX = 200;

export function usageList() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

/** Grava (ou atualiza, pelo `id`) um resumo. */
export function usageSave(entry) {
  try {
    const list = usageList().filter((e) => e.id !== entry.id);
    list.push({ ...entry });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch { /* sem espaço ou sem localStorage: o app segue */ }
  // Mesma visita, mesmo id: a telemetria guarda a versão mais nova.
  tel('validade', entry, `val-${entry.id}`);
}

export function usageClear() {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
}

/**
 * Resumo do registro da câmera (expiryCam.js, `promise.log()`): como terminou
 * e o que aconteceu no caminho. `iso`: a data com que a câmera terminou.
 */
export function summarizeCamera(log, iso) {
  const ev = (what) => log.filter((e) => e.kind === 'event' && e.what === what);
  const last = [...log].reverse().find((e) => e.kind === 'event' && (e.what === 'confirmed' || e.what === 'tap'));
  let how = 'saiu da câmera';
  if (iso && last) {
    if (last.what === 'confirmed') how = last.detail === 'mostrado na foto' ? 'painel' : 'sozinho';
    else how = last.detail === 'pergunta' ? 'pergunta' : 'botão';
  }
  const shown = iso ? ev('pick').find((e) => e.iso === iso) : null;
  const small = ev('small-ready')[0];
  const camera = ev('camera')[0];
  return {
    how,
    shownMs: shown ? shown.t : null,
    reads: log.filter((e) => e.kind === 'read').length,
    photos: ev('shutter').length,
    phonePhoto: ev('native').length > 0,
    photoHint: ev('suggest-photo').length > 0,
    panel: ev('find-show').length > 0,
    asked: ev('ask').length > 0,
    hard: ev('hard').length > 0,
    gpu: small ? small.detail : null,
    camera: camera ? camera.detail : null,
  };
}
