// Marcar validade, do jeito dos apps da Apple (como adicionar um cartão na
// Carteira): uma página só para ler a data, com a câmera grande; depois uma
// página que confirma a data por extenso e pergunta quantas vencem nela.
// As páginas entram na mesma folha, com "‹" para voltar.
//
// Na folha de guardar, a validade é uma linha "Validade › Nenhuma" que abre o
// fluxo. Na página do produto, "Marcar validade" abre uma folha que já começa
// lendo.

import { parseExpiry, expiryInputValue, formatDate, formatDateLong, relativeDays, daysUntil } from '../dates.js';
import { readExpiryWithCamera } from './expiryCam.js';
import { summarizeCamera, usageSave } from '../expiryUsage.js';
import { $, esc, icon, stepper, plural, openSheet, reducedMotion } from '../ui.js';

// ---------- Páginas dentro da folha ----------
// A primeira página é a raiz (o formulário de guardar, ou a leitura). Empilhar
// esconde a de baixo e troca o X da barra por "‹" e o título pelo da página.
function sheetNav(body, root) {
  const sheet = body.closest('.sheet');
  const bar = $('.sheet-bar', sheet);
  const titleSlot = $('.sheet-bar-title', bar);
  const close = $('.sheet-close', bar);
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'icon-btn glass-btn sheet-back';
  back.setAttribute('aria-label', 'Voltar');
  back.innerHTML = icon('chevronLeft');
  back.hidden = true;
  bar.insertBefore(back, close);
  const stack = [{ ...root, bar: titleSlot.innerHTML }];

  function paint(dir) {
    const top = stack[stack.length - 1];
    stack.forEach((p) => { p.el.hidden = p !== top; });
    titleSlot.innerHTML = top.title ? `<h2 class="sheet-title" tabindex="-1">${esc(top.title)}</h2>` : top.bar || '';
    const deep = stack.length > 1;
    back.hidden = !deep;
    close.hidden = deep;
    if (dir && !reducedMotion()) {
      top.el.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    }
    if (top.onShow) top.onShow();
    // O foco acompanha: na página nova, o título (o leitor de tela anuncia
    // "Validade"); ao voltar, o controle que abriu a página.
    if (dir > 0) { const h = titleSlot.querySelector('.sheet-title'); if (h) h.focus({ preventScroll: true }); }
    else if (dir < 0 && top.returnFocus && top.returnFocus.isConnected) top.returnFocus.focus({ preventScroll: true });
  }
  back.addEventListener('click', () => pop());

  function push(el, { title, onShow, onHide } = {}) {
    const cur = stack[stack.length - 1];
    if (cur.onHide) cur.onHide();
    if (cur.el.contains(document.activeElement)) cur.returnFocus = document.activeElement;
    body.append(el);
    stack.push({ el, title, onShow, onHide });
    paint(1);
  }
  // Volta até a página `to` (0 é a raiz).
  function pop(to = stack.length - 2) {
    while (stack.length - 1 > Math.max(0, to)) {
      const p = stack.pop();
      if (p.onHide) p.onHide();
      p.el.remove();
    }
    paint(-1);
  }
  return { push, pop, get depth() { return stack.length; } };
}

function page(html, cls = '') {
  const el = document.createElement('div');
  el.className = `sheet-page ${cls}`;
  el.innerHTML = html;
  return el;
}

// ---------- O fluxo ----------
// `total()`: quantas unidades podem receber data. `lots`: datas já escolhidas
// (a lista é alterada aqui). `finish()`: chamado em "Pronto"/"Salvar".
function flow({ body, nav: navIn, total, lots, doneLabel, doneClass = 'btn-primary', finish }) {
  let nav = navIn;
  let scanIndex = 0; // posição da página de leitura na pilha
  // Datas que já apareceram na confirmação: ao voltar para a leitura, não entram
  // sozinhas de novo (senão a data errada voltaria na hora); ainda dá para tocar.
  const confirmed = [];
  const left = () => Math.max(0, total() - lots.reduce((a, l) => a + l.qty, 0));
  // A foto com mais texto legível da câmera: aparece ao lado do campo de
  // digitar. Vale para a embalagem atual; some quando uma data é confirmada.
  let bestPhoto = null;
  // A data que a câmera viu em mais imagens: já vem escrita ao digitar.
  let likely = null;
  // Registro do uso real (js/expiryUsage.js): uma entrada por abertura da
  // câmera, atualizada quando a pessoa digita e quando salva.
  let visit = null;
  const track = (changes) => { if (!visit) return; Object.assign(visit, changes); usageSave(visit); };

  // Página 1: ler com a câmera (ou ir para digitar).
  function scanPage({ asRoot = false } = {}) {
    const el = page(`
      <div class="exp-cam"></div>
      <button type="button" class="btn exp-alt" data-type>${icon('keyboard')}Digitar a data</button>`, 'exp-scan');
    let reading = null;
    let evidence = null;
    const typeBtn = $('[data-type]', el);
    const onShow = () => {
      if (reading) return;
      evidence = null;
      typeBtn.classList.remove('is-suggested');
      const t0 = performance.now();
      visit = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), saved: false };
      const cam = readExpiryWithCamera($('.exp-cam', el), {
        skip: [...confirmed, ...lots.map((l) => l.expiresAt)],
        onEvidence: (value) => { evidence = value; },
        onBestPhoto: (url) => { bestPhoto = url; },
        onLikely: (value) => { likely = value; },
        // A câmera desistiu com dignidade: "Digitar a data" vira o caminho sugerido.
        onHard: () => typeBtn.classList.add('is-suggested'),
        // "Digitar a data" de dentro do painel de fotos: o mesmo caminho do botão.
        onType: () => typeBtn.click(),
      });
      reading = cam;
      cam.then((iso) => {
        reading = null;
        track({ ms: Math.round(performance.now() - t0), iso: iso || null, ...summarizeCamera(cam.log(), iso) });
        if (iso && el.isConnected && !el.hidden) confirmPage(iso, evidence);
      });
    };
    const onHide = () => { if (reading) reading.stop(); reading = null; };
    typeBtn.addEventListener('click', () => typePage(bestPhoto, likely));
    if (asRoot) {
      body.append(el);
      nav = sheetNav(body, { el, title: 'Validade', onShow, onHide });
      scanIndex = 0;
      onShow();
    } else {
      nav.push(el, { title: 'Validade', onShow, onHide });
      scanIndex = nav.depth - 1;
    }
  }

  // Digitar: campo grande, teclado numérico. Aceita também "VAL 20/12/27 L0425".
  // `photo`: a melhor foto da câmera, para digitar olhando (toque amplia).
  // `guess`: a data que a câmera mais viu; vem escrita e selecionada, então
  // digitar por cima troca tudo (mês/ano quando a câmera só leu mês/ano).
  function typePage(photo = null, guess = null) {
    const el = page(`
      ${photo ? `
      <figure class="exp-type-photo">
        <button type="button" class="exp-type-zoom" aria-label="Ampliar a foto da embalagem" aria-pressed="false">
          <img src="${esc(photo)}" alt="Melhor foto da embalagem tirada pela câmera">
        </button>
        <figcaption>Toque na foto para ampliar onde está a data</figcaption>
      </figure>` : ''}
      <label class="field">
        <span class="field-label">Data da embalagem</span>
        <input class="input input-date exp-type-input" inputmode="numeric" autocomplete="off" placeholder="DD/MM/AA" aria-describedby="exp-type-note">
      </label>
      <p class="field-note" id="exp-type-note" aria-live="polite">Só mês e ano (10/26) vale até o fim do mês.</p>
      <button type="button" class="btn ${doneClass} btn-lg" data-next>Continuar</button>`, 'exp-type');
    const input = $('input', el);
    const note = $('.field-note', el);
    const next = $('[data-next]', el);
    const HELP = note.textContent;
    if (guess) {
      const [y, m, d] = guess.iso.split('-');
      input.value = guess.monthOnly ? `${m}/${y.slice(2)}` : `${d}/${m}/${y.slice(2)}`;
      note.textContent = `A câmera leu ${guess.monthOnly ? `${m}/${y}` : formatDateLong(guess.iso)} em ${guess.n} imagens. Confira${photo ? ' na foto' : ''}; se estiver errada, é só digitar por cima.`;
    }
    input.addEventListener('input', () => {
      input.value = expiryInputValue(input.value);
      input.removeAttribute('aria-invalid');
      note.classList.remove('is-error');
      const iso = parseExpiry(input.value);
      note.textContent = iso ? `${formatDateLong(iso)}.` : HELP;
    });
    const zoom = $('.exp-type-zoom', el);
    if (zoom) {
      // Amplia em volta do ponto tocado; outro toque volta ao tamanho normal.
      zoom.addEventListener('click', (e) => {
        const img = $('img', zoom);
        const on = zoom.getAttribute('aria-pressed') !== 'true';
        const r = zoom.getBoundingClientRect();
        if (on && e.clientX) img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
        zoom.setAttribute('aria-pressed', String(on));
        zoom.classList.toggle('is-zoomed', on);
      });
    }
    // Continuar fica sempre ativo; sem data válida, diz como escrever e volta ao campo.
    const go = () => {
      const iso = parseExpiry(input.value);
      // A foto olhada para digitar vai junto para a confirmação, como prova.
      if (iso) {
        // Digitou: a câmera tinha acertado (a data sugerida ficou) ou não?
        track({ how: 'digitou', iso, cameraGuess: guess ? guess.iso : null, keptGuess: guess ? guess.iso === iso : null });
        confirmPage(iso, photo ? { image: photo, monthOnly: /^\d{1,2}\/\d{2,4}$/.test(input.value.trim()) } : null);
        return;
      }
      input.setAttribute('aria-invalid', 'true');
      note.classList.add('is-error');
      note.textContent = 'Use dia/mês/ano (15/10/26) ou mês/ano (10/26).';
      input.focus();
    };
    next.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    nav.push(el, { title: 'Digitar a data', onShow: () => setTimeout(() => {
      if (el.hidden) return;
      input.focus();
      if (guess) input.setSelectionRange(0, input.value.length);
    }, 320) });
  }

  // Página 2: a data por extenso e quantas vencem nela.
  function confirmPage(iso, evidence = null) {
    if (!confirmed.includes(iso)) confirmed.push(iso);
    bestPhoto = null;
    likely = null;
    const max = left();
    const past = daysUntil(iso) < 0;
    const el = page(`
      <div class="exp-confirm">
        <span class="exp-confirm-icon${past ? ' is-past' : ''}" aria-hidden="true">${icon(past ? 'warning' : 'calendar')}</span>
        <p class="exp-confirm-date">${esc(formatDateLong(iso))}</p>
        <p class="exp-confirm-rel${past ? ' is-past' : ''}">${esc(relativeDays(iso))}${past ? '. Confira na embalagem.' : ''}</p>
      </div>
      ${max > 1 ? `
      <div class="exp-howmany" role="group" aria-labelledby="exp-how-label">
        <p class="exp-howmany-label" id="exp-how-label">Quantas vencem nesse dia?</p>
        <div class="stepper-host stepper-sm"></div>
        <p class="exp-howmany-of">de ${max} ${max === 1 ? 'unidade' : 'unidades'}</p>
      </div>` : ''}
      <div class="exp-actions">
        <button type="button" class="btn ${doneClass} btn-lg" data-done>${esc(doneLabel)}</button>
        <button type="button" class="btn exp-alt" data-more hidden></button>
      </div>`, 'exp-confirm-page');
    if (evidence?.image) {
      const figure=document.createElement('figure'); figure.className='exp-evidence';
      const image=document.createElement('img'); image.src=evidence.image; image.alt='Trecho da embalagem usado na leitura';
      const caption=document.createElement('figcaption');
      caption.textContent=evidence.monthOnly?'Confira na embalagem. Como ela informa só mês e ano, usamos o último dia do mês.':'Confira a data impressa antes de salvar.';
      figure.append(image,caption); $('.exp-confirm',el).append(figure);
    }
    const more = $('[data-more]', el);
    let step = null;
    const qty = () => (step ? step.value : Math.max(1, max));
    const refresh = () => {
      const rest = max - qty();
      more.hidden = rest <= 0;
      more.textContent = `Outra data para ${rest === 1 ? 'a outra unidade' : `as outras ${rest}`}`;
    };
    if (max > 1) step = stepper($('.stepper-host', el), { value: max, min: 1, max, label: 'Quantas vencem nesse dia', onChange: refresh });
    refresh();
    $('[data-done]', el).addEventListener('click', () => {
      lots.push({ expiresAt: iso, qty: qty() });
      track({ saved: true, savedIso: iso });
      finish();
    });
    // Guarda esta e volta a ler a próxima.
    more.addEventListener('click', () => {
      lots.push({ expiresAt: iso, qty: qty() });
      track({ saved: true, savedIso: iso });
      nav.pop(scanIndex);
    });
    nav.push(el, { title: 'Validade' });
  }

  return { scan: scanPage, left, get nav() { return nav; } };
}

// ---------- Folha de guardar: a linha "Validade" ----------

export function expiryRowHtml() {
  return `
    <div class="form-rows">
      <button type="button" class="form-row" data-exp-row>
        <span class="form-row-icon" aria-hidden="true">${icon('calendar')}</span>
        <span class="form-row-label">Validade</span>
        <span class="form-row-value" data-exp-value>Nenhuma</span>
        ${icon('chevron', 'form-row-chevron')}
      </button>
    </div>`;
}

/**
 * Liga a linha "Validade" da folha de guardar. `form` é a página raiz (o
 * formulário). get() devolve [{ expiresAt, qty }].
 */
export function bindExpiryRow(body, { total, form }) {
  const row = $('[data-exp-row]', body);
  if (!row) return { get: () => [], refresh() {} };
  const value = $('[data-exp-value]', row);
  const lots = [];
  let nav = null;

  function summary() {
    if (!lots.length) return 'Nenhuma';
    if (lots.length > 1) return `${lots.length} datas`;
    const units = lots[0].qty;
    const d = formatDate(lots[0].expiresAt);
    return units < total() ? `${d} (${units} de ${total()})` : d;
  }
  function paintRow() {
    value.textContent = summary();
    row.classList.toggle('has-value', lots.length > 0);
    row.setAttribute('aria-label', `Validade: ${summary()}`);
  }

  // Já tem data: página com a lista (tirar uma, pôr outra). Sem data: lê direto.
  function listPage(f) {
    const el = page('', 'exp-list-page');
    const draw = () => {
      const rest = f.left();
      el.innerHTML = `
        <ul class="form-rows">
          ${lots.map((l, i) => `
            <li class="form-row is-static">
              <span class="form-row-label">
                <span class="exp-lot-date">${esc(formatDate(l.expiresAt))}</span>
                <span class="exp-lot-sub">${plural(l.qty, 'unidade', 'unidades')} · ${esc(relativeDays(l.expiresAt).toLowerCase())}</span>
              </span>
              <button type="button" class="icon-btn exp-lot-drop" data-drop="${i}" aria-label="Tirar a data ${esc(formatDate(l.expiresAt))}">${icon('close')}</button>
            </li>`).join('')}
          ${rest > 0 ? `<li><button type="button" class="form-row is-action" data-add>${icon('plus')}<span class="form-row-label">${lots.length ? 'Outra data' : 'Ler a data'}</span></button></li>` : ''}
        </ul>
        ${rest > 0 && lots.length ? `<p class="group-note">${plural(rest, 'unidade fica', 'unidades ficam')} sem data.</p>` : ''}
        <button type="button" class="btn btn-mode btn-lg" data-ok>Pronto</button>`;
    };
    el.addEventListener('click', (e) => {
      const drop = e.target.closest('[data-drop]');
      if (drop) { lots.splice(Number(drop.dataset.drop), 1); draw(); paintRow(); return; }
      if (e.target.closest('[data-add]')) { f.scan(); return; }
      if (e.target.closest('[data-ok]')) nav.pop(0);
    });
    nav.push(el, { title: 'Validade', onShow: draw });
  }

  row.addEventListener('click', () => {
    if (!nav) nav = sheetNav(body, { el: form, title: '' });
    // Na folha de guardar o botão principal leva a cor do modo, como o "Guardar".
    const f = flow({ body, nav, total, lots, doneLabel: 'Pronto', doneClass: 'btn-mode', finish: () => { paintRow(); nav.pop(0); } });
    if (lots.length) listPage(f);
    else f.scan();
  });

  return {
    get: () => lots.slice(),
    // Mudou quantas estão entrando: as datas nunca somam mais que isso.
    refresh() {
      let over = lots.reduce((a, l) => a + l.qty, 0) - total();
      while (over > 0 && lots.length) {
        const last = lots[lots.length - 1];
        const cut = Math.min(over, last.qty);
        last.qty -= cut;
        over -= cut;
        if (!last.qty) lots.pop();
      }
      paintRow();
    },
  };
}

// ---------- Página do produto: folha que já começa lendo ----------

/** Resolve com [{ expiresAt, qty }] ou null se fechou sem salvar. */
export function expirySheet({ free }) {
  return openSheet({
    label: 'Marcar validade',
    title: 'Validade',
    render(body, close) {
      const lots = [];
      const f = flow({ body, nav: null, total: () => free, lots, doneLabel: 'Salvar', finish: () => close(lots.slice()) });
      f.scan({ asRoot: true });
    },
  });
}
