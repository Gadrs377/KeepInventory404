// "A validade está aqui?" — quando a câmera não resolve sozinha, a pessoa
// mostra onde está a validade numa foto e o leitor detalhado (medium) lê só
// aquele pedaço (2–3 s em vez de ~19 s na foto inteira).
//
// Guarda até 4 fotos DIFERENTES (as automáticas, tiradas em ângulos
// diferentes enquanto a câmera pede para inclinar, e a do celular), a mais
// útil em destaque. Cada uma pode trazer um palpite de onde está a validade
// (js/dateRegion.js, a partir do leitor rápido): aí basta "Sim". Se o palpite
// estiver errado, ou não houver, a pessoa toca onde a validade está. Nada é
// salvo sozinho: a data lida vai para a confirmação de sempre, com o recorte.
//
// photo: { id, url (object URL), blob, w, h, rows, rowsW, rowsH, guess,
//          score, print, source: 'auto' | 'celular' }

import { regionAtTap, similar } from '../dateRegion.js';
import { $, esc, vibrate } from '../ui.js';

const MAX_PHOTOS = 4;

/**
 * `onRead(region, photo)` lê o recorte e resolve { status: 'ok' | 'several' |
 * 'none', crop? } ('ok': a câmera já seguiu para a confirmação). `onType(crop)`
 * abre a digitação. `note(what, detail)` vai para o diagnóstico.
 */
export function createFindPanel(host, { onRead, onType, note = () => {} }) {
  host.innerHTML = `
    <p class="exp-find-title" data-find-title></p>
    <div class="exp-find-frame" data-find-frame>
      <img class="exp-find-img" alt="Foto da embalagem. Toque onde está a validade." data-find-img>
      <div class="exp-find-box" data-find-box hidden></div>
      <div class="exp-find-busy" data-find-busy hidden><span class="spinner" aria-hidden="true"></span><span data-find-busy-text>Lendo esse pedaço</span></div>
    </div>
    <p class="exp-find-note" data-find-note aria-live="polite"></p>
    <div class="exp-find-fail" data-find-fail hidden>
      <img class="exp-find-crop" alt="Pedaço que não deu para ler" data-find-crop>
      <button type="button" class="btn btn-quiet btn-sm" data-find-type>Digitar a data</button>
    </div>
    <div class="exp-find-actions">
      <button type="button" class="btn btn-primary btn-sm" data-find-yes hidden>Sim</button>
      <button type="button" class="btn btn-quiet btn-sm" data-find-none>Não está em nenhuma</button>
    </div>
    <div class="exp-find-others" data-find-others hidden>
      <p class="exp-find-note">Ou em outra foto:</p>
      <div class="exp-find-strip" role="group" aria-label="Outras fotos" data-find-strip></div>
    </div>`;
  const title = $('[data-find-title]', host);
  const img = $('[data-find-img]', host);
  const box = $('[data-find-box]', host);
  const busyEl = $('[data-find-busy]', host);
  const busyText = $('[data-find-busy-text]', host);
  const noteEl = $('[data-find-note]', host);
  const failEl = $('[data-find-fail]', host);
  const cropImg = $('[data-find-crop]', host);
  const yesBtn = $('[data-find-yes]', host);
  const noneBtn = $('[data-find-none]', host);
  const others = $('[data-find-others]', host);
  const strip = $('[data-find-strip]', host);

  let photos = [];
  let selected = null;
  let region = null; // o que está marcado agora (palpite ou toque)
  let busy = false;
  let dismissed = false;
  let opened = false; // a câmera decide quando vale mostrar (ver expiryCam.js)
  let lastCrop = null;
  let seq = 0;

  function showBox(r) {
    region = r;
    box.hidden = !r;
    if (!r) return;
    Object.assign(box.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
  }

  function render() {
    host.hidden = !opened || dismissed || !photos.length;
    if (host.hidden) return;
    if (!selected || !photos.includes(selected)) selected = photos[0];
    if (img.dataset.id !== String(selected.id)) {
      img.src = selected.url;
      img.dataset.id = String(selected.id);
      failEl.hidden = true;
      showBox(selected.guess);
    }
    const guessing = !!region && region === selected.guess && !selected.guessFailed;
    title.textContent = guessing ? 'A validade está aqui?' : 'Toque onde está a validade';
    yesBtn.hidden = !guessing || busy;
    noneBtn.textContent = photos.length > 1 ? 'Não está em nenhuma' : 'Não está aqui';
    if (!busy && failEl.hidden) noteEl.textContent = guessing ? 'Não? Toque onde ela está.' : '';
    const rest = photos.filter((p) => p !== selected);
    others.hidden = !rest.length;
    strip.innerHTML = rest.map((p) => `<button type="button" class="exp-find-thumb" data-id="${p.id}" aria-label="Usar esta foto${p.guess ? ', com palpite de onde está a validade' : ''}"><img src="${esc(p.url)}" alt=""></button>`).join('');
  }

  async function read(r, how) {
    if (busy || !selected) return;
    busy = true;
    showBox(r);
    failEl.hidden = true;
    busyEl.hidden = false;
    busyText.textContent = 'Lendo esse pedaço';
    yesBtn.hidden = true;
    noteEl.textContent = '';
    note(how === 'sim' ? 'find-yes' : 'find-tap', { foto: selected.id, origem: selected.source, regiao: roundRegion(r) });
    const photo = selected;
    let result;
    try { result = await onRead(r, photo, (text) => { busyText.textContent = text; }); }
    catch (e) { result = { status: 'none', error: e && e.message }; }
    busy = false;
    busyEl.hidden = true;
    if (!host.isConnected) return;
    if (result.status === 'ok') return;
    if (result.status === 'several') {
      noteEl.textContent = 'Achei mais de uma data aí. Toque na certa, logo abaixo da câmera.';
      render();
      return;
    }
    // Nada legível ali: mostra o pedaço ampliado e as saídas.
    lastCrop = result.crop || null;
    if (lastCrop) cropImg.src = lastCrop;
    cropImg.hidden = !lastCrop;
    failEl.hidden = false;
    noteEl.textContent = 'Não consegui ler aí. Toque em outro lugar da foto, ou digite a data olhando este pedaço.';
    note('find-fail', { foto: photo.id, erro: result.error || null });
    if (r === photo.guess) photo.guessFailed = true; // o palpite não serviu: agora é tocar
    vibrate([20, 60, 20]);
    render();
  }

  img.addEventListener('click', (e) => {
    if (busy || !selected) return;
    const rect = img.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return;
    vibrate(10);
    const r = regionAtTap(selected.rows, selected.rowsW, selected.rowsH, u, v);
    read(r, 'toque');
  });
  yesBtn.addEventListener('click', () => { if (region) { vibrate(10); read(region, 'sim'); } });
  strip.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b || busy) return;
    selected = photos.find((p) => String(p.id) === b.dataset.id) || selected;
    note('find-switch', { foto: selected.id });
    render();
  });
  noneBtn.addEventListener('click', () => {
    if (busy) return;
    dismissed = true;
    note('find-none', { fotos: photos.length });
    render();
  });
  $('[data-find-type]', host).addEventListener('click', () => onType(lastCrop));

  return {
    /** Nova foto. Uma quase igual a outra fica só a de maior nota. */
    add(photo, { select = false } = {}) {
      photo.id = ++seq;
      const twin = photos.find((p) => similar(p.print, photo.print));
      if (twin) {
        if (twin.score >= photo.score && !select) { URL.revokeObjectURL(photo.url); return false; }
        photos = photos.filter((p) => p !== twin);
        if (selected === twin) selected = photo;
        URL.revokeObjectURL(twin.url);
      } else if (dismissed) {
        dismissed = false; // foto nova de verdade: vale perguntar de novo
      }
      photos.push(photo);
      photos.sort((a, b) => b.score - a.score);
      while (photos.length > MAX_PHOTOS) {
        const drop = photos.filter((p) => p !== selected && p !== photo).pop() || photos[photos.length - 1];
        photos = photos.filter((p) => p !== drop);
        URL.revokeObjectURL(drop.url);
      }
      if (select || !selected) { selected = photo; dismissed = false; }
      note('find-photo', { foto: photo.id, origem: photo.source, palpite: !!photo.guess, fotos: photos.length, tamanho: `${photo.w}×${photo.h}` });
      render();
      return true;
    },
    get count() { return photos.length; },
    /** Mostra o painel (se houver foto). */
    open() { if (!opened) { opened = true; note('find-show', { fotos: photos.length }); render(); } },
    dispose() { for (const p of photos) URL.revokeObjectURL(p.url); photos = []; },
  };
}

const roundRegion = (r) => r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
