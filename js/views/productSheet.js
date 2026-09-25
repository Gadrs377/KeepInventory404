// A folha de produto: a mesma para entrada, saída e contagem.
// Muda só o título, os limites do seletor e o botão principal.

import { lookup } from '../lookup.js';
import { addStock, removeStock, ensureProduct, setCounted, getCountDraft } from '../store.js';
import { $, esc, openSheet, stepper, subtitle, thumb, tag, tagState } from '../ui.js';

const ACTION = {
  entrada: (n) => `Adicionar ${n}`,
  saida: (n) => `Dar baixa em ${n}`,
  contagem: () => 'Salvar contagem',
};

const NEW_MSG = {
  found: 'Novo no armário. Confira o nome antes de salvar.',
  notfound: 'Não encontramos esse código. Digite o nome do produto para cadastrar.',
  offline: 'Sem internet para buscar esse código. Digite o nome do produto para cadastrar.',
};

/**
 * Abre a folha para `code` no modo dado.
 * Resolve com:
 *   { kind: 'entrada' | 'saida', product, movement, n }
 *   { kind: 'contagem', product, n }
 *   { kind: 'switch', code }   (saída de produto não cadastrado → cadastrar como entrada)
 *   null                       (fechou sem registrar)
 */
export function showProductSheet({ mode, code }) {
  return openSheet({
    mode,
    label: 'Produto lido',
    render(body, close) {
      body.innerHTML = `
        <div class="product-head is-loading">
          <span class="thumb thumb-md thumb-empty"></span>
          <div class="product-meta">
            <p class="product-name">Buscando produto…</p>
            <p class="product-sub">${esc(code.startsWith('SEM-') ? 'Produto sem código' : code)}</p>
          </div>
        </div>`;
      render(body, close, mode, code).catch((err) => {
        body.insertAdjacentHTML('beforeend', `<p class="field-error">${esc(err.message)}</p>`);
      });
    },
  });
}

async function render(body, close, mode, code) {
  const result = await lookup(code);
  if (!body.isConnected) return;
  const local = result.status === 'local' ? result.product : null;

  if (mode === 'saida' && !local) {
    body.innerHTML = `
      ${head({ name: 'Produto desconhecido', code }, null)}
      <p class="sheet-text">Esse produto não está no armário. Se ele acabou de chegar, cadastre como entrada.</p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-entrada" data-switch>Cadastrar como entrada</button>
        <button type="button" class="btn btn-ghost" data-cancel>Fechar</button>
      </div>`;
    $('[data-switch]', body).addEventListener('click', () => close({ kind: 'switch', code }));
    $('[data-cancel]', body).addEventListener('click', () => close(null));
    return;
  }

  if (mode === 'saida' && local.qty === 0) {
    body.innerHTML = `
      ${head(local, local)}
      <p class="sheet-text">Não tem nenhum no armário. Se ainda tem, corrija a quantidade pela contagem ou na página do produto.</p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-primary" data-cancel>Fechar</button>
      </div>`;
    $('[data-cancel]', body).addEventListener('click', () => close(null));
    return;
  }

  const info = result.info || {};
  const draft = mode === 'contagem' ? await getCountDraft() : null;
  const counted = draft && Object.hasOwn(draft.counts, code) ? draft.counts[code] : null;

  const limits = {
    entrada: { min: 1, max: 999, value: 1 },
    saida: { min: 1, max: local ? local.qty : 1, value: 1 },
    contagem: { min: 0, max: 999, value: counted ?? (local ? local.qty : 1) },
  }[mode];

  const question = mode === 'contagem' ? '<p class="stepper-label">Quantos tem?</p>' : '';
  const nameForm = local ? '' : `
    <p class="sheet-text">${esc(NEW_MSG[result.status] || NEW_MSG.notfound)}</p>
    ${result.status === 'offline' ? '<button type="button" class="btn btn-ghost btn-sm" data-retry>Buscar de novo</button>' : ''}
    <label class="field">
      <span class="field-label">Nome do produto</span>
      <input class="input" name="name" autocomplete="off" maxlength="80" value="${esc(info.name || '')}" placeholder="Ex.: Feijão preto">
    </label>`;

  body.innerHTML = `
    <form class="stack" novalidate>
      ${head(local || { ...info, code }, local)}
      ${nameForm}
      ${question}
      <div class="stepper-host"></div>
      <button type="submit" class="btn btn-mode btn-lg"></button>
    </form>`;

  const form = $('form', body);
  const submit = $('[type=submit]', body);
  const nameInput = $('input[name=name]', body);
  const step = stepper($('.stepper-host', body), {
    ...limits,
    label: mode === 'contagem' ? 'Quantos tem' : 'Quantidade',
    onChange: (n) => { submit.textContent = ACTION[mode](n); },
  });

  const retry = $('[data-retry]', body);
  if (retry) {
    retry.addEventListener('click', () => {
      retry.disabled = true;
      retry.textContent = 'Buscando…';
      render(body, close, mode, code);
    });
  }

  const syncEnabled = () => { submit.disabled = !!nameInput && !nameInput.value.trim(); };
  if (nameInput) {
    nameInput.addEventListener('input', syncEnabled);
    syncEnabled();
    if (!nameInput.value) setTimeout(() => nameInput.focus(), 250);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    const n = step.value;
    const newInfo = local ? null : { ...info, name: nameInput.value.trim(), source: result.status === 'found' ? 'off' : 'manual' };
    try {
      if (mode === 'entrada') {
        const r = await addStock(code, n, newInfo);
        close({ kind: 'entrada', ...r, n });
      } else if (mode === 'saida') {
        const r = await removeStock(code, n);
        close({ kind: 'saida', ...r, n });
      } else {
        const product = local || (await ensureProduct(code, newInfo));
        await setCounted(code, n);
        close({ kind: 'contagem', product, n });
      }
    } catch (err) {
      submit.disabled = false;
      form.insertAdjacentHTML('beforeend', `<p class="field-error">${esc(err.message)}</p>`);
    }
  });
}

function head(p, local) {
  const sub = subtitle(p);
  const code = p.code && !p.code.startsWith('SEM-') ? p.code : 'Produto sem código';
  return `
    <div class="product-head">
      ${thumb(p, 'md')}
      <div class="product-meta">
        ${local ? `<p class="product-name">${esc(p.name)}</p>` : `<p class="product-name">${esc(p.name || 'Produto novo')}</p>`}
        <p class="product-sub">${sub || esc(code)}</p>
        ${local ? `<p class="product-stock">No armário ${tag(local.qty, tagState(local) + ' tag-sm')}</p>` : ''}
      </div>
    </div>`;
}
