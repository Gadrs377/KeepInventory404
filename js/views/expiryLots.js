// Marcar validade em duas etapas: primeiro a data (câmera abre sozinha; dá
// para digitar), depois "Quantas vencem nessa data?". Assim ninguém marca sem
// querer todas as unidades com a mesma data. Se sobrar unidade, "Outra data
// para as outras N" guarda esta e lê a próxima.
//
// Usado na folha de guardar (total = quantas estão entrando) e em "Marcar
// validade" da página do produto (total = unidades ainda sem data).

import { parseExpiry, expiryInputValue, formatDate, daysUntil } from '../dates.js';
import { wireExpiryField, expiryCamButton } from './expiryCam.js';
import { $, esc, icon, stepper, plural } from '../ui.js';

const HELP = 'Só mês e ano vale até o fim do mês.';

/** `open`: campo já aberto (remédio, ou a folha que só serve para isso). */
export function expiryLotsHtml({ open = false, optional = false } = {}) {
  return `
    <div class="expiry exp-lots">
      <ul class="exp-lot-list" hidden></ul>
      <button type="button" class="btn btn-link btn-expiry" data-expiry-open aria-expanded="${open}" aria-controls="exp-field" ${open ? 'hidden' : ''}>${icon('calendar')}<span>Marcar validade</span></button>
      <div class="field" id="exp-field" ${open ? '' : 'hidden'}>
        <label class="field-label" for="exp-input">Validade${optional ? ' (opcional)' : ''}</label>
        <div class="input-row">
          <input class="input input-date" id="exp-input" inputmode="numeric" autocomplete="off" placeholder="DD/MM/AA ou MM/AA" aria-describedby="exp-note">
          ${expiryCamButton()}
        </div>
        <div class="exp-cam" hidden></div>
        <p class="field-note" id="exp-note" aria-live="polite">${HELP}</p>
        <div class="exp-howmany" hidden>
          <p class="field-label" id="exp-howmany-label"></p>
          <div class="stepper-host stepper-sm"></div>
          <button type="button" class="btn btn-quiet btn-sm" data-exp-more hidden>${icon('calendar')}<span></span></button>
        </div>
      </div>
    </div>`;
}

/**
 * `total()` diz quantas unidades podem receber data. `autoCamera`: ao abrir o
 * campo, a câmera já liga. get() devolve [{ expiresAt, qty }] (vazio se não
 * marcou) ou null quando a data digitada é inválida (o aviso já aparece).
 */
export function bindExpiryLots(root, { total, autoCamera = true } = {}) {
  const wrap = $('.exp-lots', root);
  if (!wrap) return { get: () => [], refresh() {} };
  const open = $('[data-expiry-open]', wrap);
  const field = $('#exp-field', wrap);
  const input = $('#exp-input', wrap);
  const note = $('#exp-note', wrap);
  const list = $('.exp-lot-list', wrap);
  const howmany = $('.exp-howmany', wrap);
  const howLabel = $('#exp-howmany-label', wrap);
  const more = $('[data-exp-more]', wrap);
  const camBtn = $('[data-exp-cam]', wrap);
  const kept = []; // datas já confirmadas: { expiresAt, qty }
  let current = ''; // data do campo, AAAA-MM-DD
  let touched = false; // a pessoa mexeu em "quantas vencem"? Se não, acompanha o total.

  const left = () => Math.max(0, total() - kept.reduce((a, l) => a + l.qty, 0));
  const step = stepper($('.stepper-host', howmany), {
    value: 1, min: 1, max: 1, label: 'Unidades com essa data',
    onChange: () => refreshMore(),
  });

  $('.stepper-host', howmany).addEventListener('click', () => { touched = true; });
  $('.stepper-host', howmany).addEventListener('input', () => { touched = true; });

  function startCamera() {
    if (autoCamera && camBtn && !camBtn.hidden) camBtn.click();
  }
  function openField() {
    open.hidden = true;
    open.setAttribute('aria-expanded', 'true');
    field.hidden = false;
    if (autoCamera) startCamera();
    else input.focus();
  }
  open.addEventListener('click', openField);
  wireExpiryField(field, input);

  function refreshMore() {
    const rest = left() - (current ? step.value : 0);
    more.hidden = !current || rest <= 0;
    $('span', more).textContent = `Outra data para ${rest === 1 ? 'a outra' : `as outras ${rest}`}`;
  }

  // Depois da data: quantas vencem nela (só pergunta se há mais de uma unidade).
  function showHowMany() {
    const max = left();
    if (!current || max <= 1) { howmany.hidden = true; refreshMore(); return; }
    howLabel.innerHTML = `Quantas vencem em <strong>${esc(formatDate(current))}</strong>?`;
    const wasHidden = howmany.hidden;
    step.setMax(max);
    if (wasHidden || !touched) step.set(max);
    howmany.hidden = false;
    refreshMore();
  }

  input.addEventListener('input', () => {
    input.value = expiryInputValue(input.value);
    input.removeAttribute('aria-invalid');
    note.classList.remove('is-error');
    current = parseExpiry(input.value) || '';
    if (!current) { note.textContent = HELP; howmany.hidden = true; refreshMore(); return; }
    const n = daysUntil(current);
    note.textContent = n < 0
      ? `Essa data já passou (${formatDate(current)}). Confira na embalagem.`
      : `Vence em ${formatDate(current)}, ${n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `daqui a ${n} dias`}.`;
    showHowMany();
  });

  function renderList() {
    list.hidden = !kept.length;
    list.innerHTML = kept.map((l, i) => `
      <li class="exp-lot">
        <span class="exp-lot-date">${esc(formatDate(l.expiresAt))}</span>
        <span class="exp-lot-qty">${plural(l.qty, 'unidade', 'unidades')}</span>
        <button type="button" class="icon-btn" data-exp-drop="${i}" aria-label="Tirar a data ${esc(formatDate(l.expiresAt))}">${icon('close')}</button>
      </li>`).join('');
  }
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-exp-drop]');
    if (!btn) return;
    kept.splice(Number(btn.dataset.expDrop), 1);
    renderList();
    showHowMany();
  });

  // Guarda a data do campo e prepara a próxima leitura.
  more.addEventListener('click', () => {
    if (!current) return;
    kept.push({ expiresAt: current, qty: left() <= 1 ? 1 : step.value });
    renderList();
    touched = false;
    current = '';
    input.value = '';
    note.textContent = HELP;
    howmany.hidden = true;
    refreshMore();
    startCamera();
  });

  return {
    get() {
      const lots = kept.slice();
      if (!field.hidden && input.value.trim()) {
        const iso = parseExpiry(input.value);
        if (!iso) {
          input.setAttribute('aria-invalid', 'true');
          note.classList.add('is-error');
          note.textContent = 'Use dia/mês/ano (15/10/26) ou mês/ano (10/26).';
          input.focus();
          return null;
        }
        lots.push({ expiresAt: iso, qty: howmany.hidden ? Math.max(1, left()) : step.value });
      }
      return lots;
    },
    // O total mudou (ex.: a pessoa mudou quantas está guardando).
    refresh() {
      let over = kept.reduce((a, l) => a + l.qty, 0) - total();
      while (over > 0 && kept.length) {
        const last = kept[kept.length - 1];
        const cut = Math.min(over, last.qty);
        last.qty -= cut; over -= cut;
        if (!last.qty) kept.pop();
      }
      renderList();
      showHowMany();
    },
    openField,
  };
}
