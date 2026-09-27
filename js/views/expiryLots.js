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
    titleSlot.innerHTML = top.title ? `<h2 class="sheet-title">${esc(top.title)}</h2>` : top.bar || '';
    const deep = stack.length > 1;
    back.hidden = !deep;
    close.hidden = deep;
    if (dir && !reducedMotion()) {
      top.el.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    }
    if (top.onShow) top.onShow();
  }
  back.addEventListener('click', () => pop());

  function push(el, { title, onShow, onHide } = {}) {
    const cur = stack[stack.length - 1];
    if (cur.onHide) cur.onHide();
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

  // Página 1: ler com a câmera (ou ir para digitar).
  function scanPage({ asRoot = false } = {}) {
    const el = page(`
      <div class="exp-cam"></div>
      <button type="button" class="btn btn-link exp-type-btn" data-type>${icon('keyboard')}Digitar a data</button>`, 'exp-scan');
    let reading = null;
    const onShow = () => {
      if (reading) return;
      reading = readExpiryWithCamera($('.exp-cam', el), { skip: [...confirmed, ...lots.map((l) => l.expiresAt)] });
      reading.then((iso) => {
        reading = null;
        if (iso && el.isConnected && !el.hidden) confirmPage(iso);
      });
    };
    const onHide = () => { if (reading) reading.stop(); reading = null; };
    $('[data-type]', el).addEventListener('click', () => typePage());
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
  function typePage() {
    const el = page(`
      <label class="field">
        <span class="field-label">Data da embalagem</span>
        <input class="input input-date exp-type-input" inputmode="numeric" autocomplete="off" placeholder="DD/MM/AA" aria-describedby="exp-type-note">
      </label>
      <p class="field-note" id="exp-type-note" aria-live="polite">Só mês e ano (10/26) vale até o fim do mês.</p>
      <button type="button" class="btn ${doneClass} btn-lg" data-next disabled>Continuar</button>`, 'exp-type');
    const input = $('input', el);
    const note = $('.field-note', el);
    const next = $('[data-next]', el);
    const HELP = note.textContent;
    input.addEventListener('input', () => {
      input.value = expiryInputValue(input.value);
      const iso = parseExpiry(input.value);
      next.disabled = !iso;
      note.textContent = iso ? `${formatDateLong(iso)}.` : HELP;
    });
    const go = () => { const iso = parseExpiry(input.value); if (iso) confirmPage(iso); };
    next.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    nav.push(el, { title: 'Digitar a data', onShow: () => setTimeout(() => { if (!el.hidden) input.focus(); }, 320) });
  }

  // Página 2: a data por extenso e quantas vencem nela.
  function confirmPage(iso) {
    if (!confirmed.includes(iso)) confirmed.push(iso);
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
        <button type="button" class="btn btn-link" data-more hidden></button>
      </div>`, 'exp-confirm-page');
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
      finish();
    });
    // Guarda esta e volta a ler a próxima.
    more.addEventListener('click', () => {
      lots.push({ expiresAt: iso, qty: qty() });
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
