// Ações sobre um produto usadas em várias telas (Armário, página do produto,
// cartão do toque longo): editar, corrigir a quantidade, marcar validade e
// jogar fora o que venceu.

import { getProduct, updateProduct, setStock, deleteProduct, addLot, removeLot, discardStock, undoMovement } from './store.js';
import { addToShopList } from './shop.js';
import { AREAS } from './areas.js';
import { formatDate, relativeDays } from './dates.js';
import { expirySheet } from './views/expiryLots.js';
import { $, esc, icon, stepper, toast, openSheet, confirmSheet, plural } from './ui.js';

const isMedProduct = (p) => !!(p && (p.med || p.area === 'remedios'));

// Unidade de contagem: remédio conta por caixa.
export function unitWord(p, n) {
  return isMedProduct(p) ? plural(n, 'caixa', 'caixas') : plural(n, 'unidade', 'unidades');
}

// Jogar fora um lote (vencido ou que vai vencer). Sai do armário sem contar
// como consumo. Remédio: "Separar para descartar", porque vai para a farmácia.
export async function discardLot(p, lot) {
  const med = isMedProduct(p);
  await removeLot(lot.id);
  await discardStock(p.code, lot.qty);
  toast(`${p.name}: ${plural(lot.qty, 'saiu', 'saíram')} do armário.${med ? ' Leve a caixa a uma farmácia: elas recebem remédio vencido.' : ''}`, {
    mode: 'saida',
    duration: 6000,
    action: 'Adicionar às Compras',
    onAction: () => { addToShopList(p.name); toast('Adicionado às Compras.', { duration: 2000 }); },
  });
}

// Pergunta antes: jogar fora não se desfaz.
export async function confirmDiscard(p, lot) {
  const med = isMedProduct(p);
  const ok = await confirmSheet({
    title: med ? `Separar ${p.name} para descartar?` : `Jogar fora ${p.name}?`,
    text: `${formatDate(lot.expiresAt)}, ${unitWord(p, lot.qty)}. ${relativeDays(lot.expiresAt)}.${med ? ' Remédio vencido não vai no lixo comum: as farmácias recebem.' : ''}`,
    confirm: med ? 'Separar para descartar' : 'Jogar fora',
    mode: 'saida',
  });
  if (ok) await discardLot(p, lot);
  return ok;
}

// Marcar validade nas unidades sem data.
export async function markExpiry(code, free) {
  const picked = await expirySheet({ free });
  if (!picked || !picked.length) return false;
  for (const l of picked) await addLot(code, l.qty, l.expiresAt);
  const units = picked.reduce((a, l) => a + l.qty, 0);
  toast(picked.length === 1
    ? `Validade ${formatDate(picked[0].expiresAt)} marcada em ${plural(units, 'unidade', 'unidades')}.`
    : `${picked.length} validades marcadas em ${plural(units, 'unidade', 'unidades')}.`, { duration: 3000 });
  return true;
}

// Corrigir a quantidade: tocar no número grande abre esta folha, com o
// teclado de números (como "Quantas unidades entraram?" no leitor).
export async function fixQuantity(code) {
  const p = await getProduct(code);
  if (!p) return null;
  const n = await openSheet({
    label: 'Corrigir a quantidade',
    title: 'Quantos tem?',
    render(body, close) {
      body.innerHTML = `
        <form class="stack qty-fix" novalidate>
          <p class="sheet-text">${esc(p.name)}</p>
          <div class="stepper-host stepper-lg" data-qty></div>
          <p class="field-note" data-left>Agora ${unitWord(p, p.qty)} no armário.</p>
          <div class="sheet-sticky"><button type="submit" class="btn btn-primary btn-lg">${icon('check')}Salvar</button></div>
        </form>`;
      const step = stepper($('[data-qty]', body), { value: p.qty, min: 0, max: 9999, label: 'Quantidade no armário' });
      setTimeout(() => $('.stepper-value', body)?.focus({ preventScroll: true }), 380);
      $('form', body).addEventListener('submit', (e) => { e.preventDefault(); close(step.value); });
    },
  });
  if (n === null || n === undefined || n === p.qty) return null;
  const { product, movement } = await setStock(code, n, 'ajuste');
  toast(`Quantidade corrigida para ${product.qty}.`, {
    action: movement ? 'Desfazer' : undefined,
    onAction: async () => {
      try { await undoMovement(movement.id); toast('Correção desfeita.', { duration: 2500 }); } catch (err) { toast(err.message, { duration: 4000 }); }
    },
  });
  return product;
}

// Editar (pela home ou pelo produto), a mesma folha: Nome; Marca e Tamanho
// lado a lado; Onde fica; Avisar quando tiver; Salvar; Remover em texto
// vermelho no fim; o código em nota de rodapé. Resolve com 'deleted',
// 'saved' ou null.
export async function editProduct(code) {
  const p = await getProduct(code);
  if (!p) return null;
  const r = await openSheet({
    label: 'Editar',
    title: 'Editar',
    render(body, close) {
      const codes = Array.isArray(p.barcodes) && p.barcodes.length ? p.barcodes.join(', ') : '';
      body.innerHTML = `
        <form class="stack edit-form" novalidate>
          <label class="field"><span class="field-label">Nome</span>
            <input class="input" name="name" maxlength="80" value="${esc(p.name)}" autocomplete="off"></label>
          <div class="field-row">
            <label class="field"><span class="field-label">Marca</span>
              <input class="input" name="brand" maxlength="40" value="${esc(p.brand)}" autocomplete="off"></label>
            <label class="field"><span class="field-label">Tamanho</span>
              <input class="input" name="size" maxlength="20" value="${esc(p.size)}" autocomplete="off" placeholder="Ex.: 1 kg"></label>
          </div>
          <fieldset class="segmented">
            <legend class="field-label">Onde fica</legend>
            <div class="segmented-track">
              ${AREAS.map((a) => `
                <label class="segment"><input type="radio" name="area" value="${a.id}" ${a.id === (p.area || 'cozinha') ? 'checked' : ''}><span>${a.short}</span></label>`).join('')}
            </div>
          </fieldset>
          <div class="field field-inline">
            <span class="field-label">Avisar quando tiver</span>
            <div class="stepper-host stepper-sm" data-min></div>
          </div>
          <p class="field-error" role="alert" hidden></p>
          <div class="sheet-sticky"><button type="submit" class="btn btn-primary btn-lg">${icon('check')}Salvar</button></div>
          <button type="button" class="btn-text-danger" data-delete>Remover do armário</button>
          ${codes ? `<p class="edit-code">Código ${esc(codes)}</p>` : ''}
        </form>`;
      const minStep = stepper($('[data-min]', body), { value: p.minQty, min: 0, max: 999, label: 'Avisar quando tiver' });
      const err = $('.field-error', body);
      $('[data-delete]', body).addEventListener('click', () => close('delete'));
      $('form', body).addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = (n) => $(`[name=${n}]`, body).value;
        const fields = {
          name: val('name'),
          brand: val('brand'),
          size: val('size'),
          minQty: minStep.value,
          area: $('input[name=area]:checked', body)?.value,
        };
        const changed = fields.name.trim() !== p.name || fields.brand !== (p.brand || '') || fields.size !== (p.size || '')
          || fields.minQty !== p.minQty || fields.area !== (p.area || 'cozinha');
        try {
          if (changed) await updateProduct(p.code, fields);
          close(changed ? 'saved' : null);
        } catch (e2) {
          err.hidden = false;
          err.textContent = e2.message;
        }
      });
    },
  });
  if (r === 'delete') {
    const ok = await confirmSheet({
      title: `Remover ${p.name}?`,
      text: 'O produto e o histórico dele saem do armário. Não dá para desfazer.',
      confirm: 'Remover produto',
      danger: true,
    });
    if (!ok) return null;
    await deleteProduct(code);
    toast(`${p.name} removido.`, { duration: 3000 });
    return 'deleted';
  }
  if (r === 'saved') toast('Salvo.', { duration: 2000 });
  return r;
}
