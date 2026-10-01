// Dados de um remédio da base da Anvisa: a lista de fatos (usada na página do
// produto e na folha da busca) e a folha que abre ao tocar num resultado.

import { medByEan, medInfo, bulaUrl, registroText, money, TIPO } from '../remedios.js';
import { productsByBarcode } from '../store.js';
import { $, esc, icon, openSheet, thumb, subtitle, toast, tag, tagState, pill } from '../ui.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Resultados da busca na lista da Anvisa, agrupados pelo remédio: o título diz
// o nome e o princípio ativo, e cada linha é uma caixa (dose e quantidade),
// que é o que distingue uma da outra.
export function anvisaResultsHtml(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = fold(`${r.nome}|${r.substancia}`);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return [...groups.values()].map((g) => {
    const r0 = g[0];
    const generic = fold(r0.substancia) === fold(r0.nome);
    return `
    <h3 class="found-title"><span class="found-name">${esc(r0.nome)}</span>${generic ? '' : `<span class="found-sub">${esc(r0.substancia)}</span>`}</h3>
    <ul class="rows meds-found">${g.map((r) => `
      <li>
        <button type="button" class="row" data-ean="${esc(r.ean)}">
          <span class="row-main">
            <span class="row-name">${esc(r.tamanho || 'Apresentação sem descrição')}</span>
            <span class="row-meta">${r.vendido ? '' : pill('watch', 'Sem venda recente')}<span class="row-sub">${esc(r.laboratorio)}</span></span>
          </span>
          ${icon('chevron', 'row-chevron')}
        </button>
      </li>`).join('')}
    </ul>`;
  }).join('');
}

// ---------- A caixa ----------
// O remédio não tem foto: o app desenha a caixa com os dados da Anvisa. Nome
// grande, princípio ativo, dose e quantidade, o laboratório no canto, a tarja
// de verdade (a faixa e o texto que vêm na embalagem) e o G do genérico.

const BOX_TEXT = {
  vermelha: ['VENDA SOB PRESCRIÇÃO MÉDICA'],
  'vermelha-retencao': ['VENDA SOB PRESCRIÇÃO MÉDICA', 'SÓ PODE SER VENDIDO COM RETENÇÃO DA RECEITA'],
  preta: ['VENDA SOB PRESCRIÇÃO MÉDICA', 'O ABUSO DESTE MEDICAMENTO PODE CAUSAR DEPENDÊNCIA'],
};

export function medBoxHtml(med, { sticker = '', size = '' } = {}) {
  // "0,5 mg, 30 comprimidos": a vírgula decimal fica na dose.
  const [dose, ...rest] = String(med.tamanho || '').split(/,\s+(?=\d)/);
  const qty = rest.join(', ').trim();
  const band = BOX_TEXT[med.tarja];
  // Primeiro palpite pelo tamanho; fitMedBox() ajusta de verdade depois de desenhar.
  const long = String(med.nome).length > 16 ? (String(med.nome).length > 24 ? ' is-longer' : ' is-long') : '';
  return `
    <div class="mbox ${size}" aria-hidden="true">
      <div class="mbox-3d">
        <div class="mbox-face">
          <div class="mbox-head">
            <b class="mbox-name${long}">${esc(med.nome)}</b>
            ${med.laboratorio || med.tipo === 'Genérico' ? `<span class="mbox-brand">
              ${med.laboratorio ? `<span class="mbox-lab">${esc(med.laboratorio)}</span>` : ''}
              ${med.tipo === 'Genérico' ? '<span class="mbox-gen"><i>G</i><em>Genérico</em></span>' : ''}
            </span>` : ''}
          </div>
          <span class="mbox-act">${esc(med.substancia || '')}</span>
          <span class="mbox-dose"><b>${esc(dose.trim())}</b>${qty ? `<em>${esc(qty)}</em>` : ''}</span>
          ${band ? `<span class="mbox-tarja is-${med.tarja === 'preta' ? 'black' : 'red'}">${band.map(esc).join('<br>')}</span>` : ''}
        </div>
        <i class="mbox-side"></i><i class="mbox-top"></i>
      </div>
      ${sticker}
    </div>`;
}

// Remédio cadastrado sem os dados da Anvisa (à mão, por loja, por foto): a caixa
// sai do nome, da marca e do tamanho, sem tarja (não dá para saber qual é).
export function boxDataOf(p) {
  if (p.med) return p.med;
  return { nome: p.name, substancia: '', tamanho: p.size || '', laboratorio: p.brand || '', tarja: '', tipo: '' };
}

// Depois de desenhar: o nome e o princípio ativo diminuem até caber (no máximo
// duas linhas cada), e a caixa cresce em altura se ainda faltar espaço.
export function fitMedBox(root) {
  for (const box of root.querySelectorAll('.mbox')) {
    const shrink = (el, from, min) => {
      if (!el) return;
      let size = from;
      el.style.fontSize = `${size}px`;
      while (size > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    shrink(box.querySelector('.mbox-name'), 26, 14);
    shrink(box.querySelector('.mbox-act'), 12, 9.5);
    shrink(box.querySelector('.mbox-dose'), 20, 11);
  }
}

// Aviso de receita só quando a farmácia fica com ela (tarja preta e vermelha
// com retenção): sem a receita na mão, não compra. A tarja vermelha comum e a
// venda livre não ganham aviso, que na prática ninguém leva receita para elas;
// a tarja continua na caixa desenhada. O prazo da receita só aparece quando há
// certeza: "com retenção" vale para antibiótico e para controlado da lista C1,
// e a classe terapêutica da Anvisa é que separa os dois.
const ANTIBIOTICO = /penicilin|cefalospor|macrol[ií]d|quinolon|tetraciclin|sulfonamid|antibi[óo]tic|aminoglicos|carbapen|monobact|glicopept|nitrofuran|lincosam|anfenic/i;
export function rxCardHtml(med) {
  const c = {
    'vermelha-retencao': { band: 'red', title: 'A farmácia fica com a receita', text: 'Para comprar de novo, peça outra ao médico.', note: ANTIBIOTICO.test(med.classe || '') ? 'Receita de antibiótico vale 10 dias.' : '' },
    preta: { band: 'black', title: 'Receita especial', text: 'A farmácia fica com a receita. Para comprar de novo, peça outra ao médico.' },
  }[med.tarja];
  if (!c) return '';
  return `
    <div class="rx-card is-${c.band}">
      <span class="rx-band" aria-hidden="true"></span>
      <div class="rx-body">
        <p class="rx-title">${icon('fileText')}<b>${c.title}</b></p>
        <p class="rx-text">${c.text}</p>
        ${c.note ? `<p class="rx-note">${c.note}</p>` : ''}
      </div>
    </div>`;
}

// O que pede cada remédio nas Compras, só quando a receita fica na farmácia.
export function rxNeed(med) {
  const t = med && med.tarja;
  if (t === 'preta') return { cls: 'is-black', text: 'Receita especial' };
  if (t === 'vermelha-retencao') return { cls: 'is-red', text: 'Leve a receita' };
  return null;
}

// Lista de fatos: o que está na caixa e na bula, na ordem em que se procura.
// A tarja não entra aqui: ela está na caixa, e o aviso, no cartão da receita.
export function medFacts(med) {
  const rows = [
    ['Princípio ativo', esc(med.substancia)],
    ['Apresentação', `${esc(med.tamanho || med.apresentacao)}${med.forma && !String(med.tamanho).includes(med.forma) ? `<span class="fact-sub">${esc(med.forma)}</span>` : ''}`],
    med.tipo && ['Tipo', esc(TIPO[med.tipo] || med.tipo)],
    med.laboratorio && ['Laboratório', esc(med.laboratorio)],
    med.classe && ['Classe terapêutica', esc(med.classe)],
    med.pmc && ['Preço máximo', `${esc(money(med.pmc))}<span class="fact-sub">Teto para a farmácia cobrar no RS</span>`],
    med.hospitalar && ['Uso', 'Só em hospital'],
    med.registro && ['Registro na Anvisa', `<span class="fact-num">${esc(registroText(med.registro))}</span>`],
  ].filter(Boolean);
  return `
    <dl class="facts">${rows.map(([k, v]) => `
      <div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
    </dl>
    <a class="btn btn-quiet btn-sm" href="${esc(bulaUrl(med))}" target="_blank" rel="noopener">${icon('fileText')}Ver a bula na Anvisa</a>`;
}

// Folha de um resultado da busca. Resolve com o código de barras quando a
// pessoa quer guardar o remédio em casa, ou null.
export function medSheet(ean) {
  return openSheet({
    label: 'Remédio',
    title: 'Da lista da Anvisa',
    render(body, close) {
      body.innerHTML = '<p class="loading-note"><span class="spinner" aria-hidden="true"></span><span>Abrindo os dados da Anvisa</span></p>';
      Promise.all([medByEan(ean), productsByBarcode(ean)]).then(([med, home]) => {
        if (!body.isConnected) return;
        if (!med) { body.innerHTML = '<p class="sheet-text">Esse remédio não está mais na lista da Anvisa.</p>'; return; }
        const p = { ...medInfo(med), code: ean };
        const have = home[0];
        body.innerHTML = `
          ${medBoxHtml(med, { size: 'sm' })}
          ${have ? `<p class="med-have">${icon('package')}No armário: ${have.qty === 1 ? '1 caixa' : `${have.qty} caixas`}. <a href="#/produto/${encodeURIComponent(have.code)}">Ver</a></p>` : ''}
          ${rxCardHtml(med)}
          <div class="group-card med-facts-card">${medFacts(med).replace(/<a class="btn[^>]*>.*?<\/a>/s, '')}</div>
          <div class="sheet-sticky med-bar">
            <a class="btn btn-quiet btn-lg" href="${esc(bulaUrl(med))}" target="_blank" rel="noopener">${icon('fileText')}Bula</a>
            <button type="button" class="btn btn-mode btn-lg mode-entrada" data-keep>${icon('in')}Guardar no armário</button>
          </div>`;
        fitMedBox(body);
        $('[data-keep]', body).addEventListener('click', () => close(ean));
      }).catch(() => {
        if (body.isConnected) body.innerHTML = '<p class="sheet-text">Sem internet para abrir a lista da Anvisa. Tente de novo quando a conexão voltar.</p>';
        toast('Sem internet para abrir a lista da Anvisa.', { duration: 3000 });
      });
    },
  });
}
