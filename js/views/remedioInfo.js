// Dados de um remédio da base da Anvisa: a lista de fatos (usada na página do
// produto e na folha da busca) e a folha que abre ao tocar num resultado.

import { medByEan, medInfo, bulaUrl, registroText, money, TARJA, TIPO } from '../remedios.js';
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

// Lista de fatos: o que está na caixa e na bula, na ordem em que se procura.
export function medFacts(med) {
  const t = TARJA[med.tarja];
  const rows = [
    ['Princípio ativo', esc(med.substancia)],
    ['Apresentação', `${esc(med.tamanho || med.apresentacao)}${med.forma && !String(med.tamanho).includes(med.forma) ? `<span class="fact-sub">${esc(med.forma)}</span>` : ''}`],
    t && ['Venda', `<span class="tarja tarja-${esc(med.tarja)}" aria-hidden="true"></span>${esc(t.label)}<span class="fact-sub">${esc(t.note)}</span>`],
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
    render(body, close) {
      body.innerHTML = '<p class="loading-note"><span class="spinner" aria-hidden="true"></span><span>Abrindo os dados da Anvisa</span></p>';
      Promise.all([medByEan(ean), productsByBarcode(ean)]).then(([med, home]) => {
        if (!body.isConnected) return;
        if (!med) { body.innerHTML = '<p class="sheet-text">Esse remédio não está mais na lista da Anvisa.</p>'; return; }
        const p = { ...medInfo(med), code: ean };
        const have = home[0];
        body.innerHTML = `
          <div class="product-head">
            ${thumb(p, 'md')}
            <div class="product-meta">
              <h2 class="product-name">${esc(med.nome)}</h2>
              <p class="product-sub">${subtitle(p)}</p>
              <p class="product-code">${esc(ean)}</p>
            </div>
            ${have ? `<div class="product-stock"><span class="product-stock-label">Em casa</span>${tag(have.qty, tagState(have), '')}</div>` : ''}
          </div>
          ${medFacts(med)}
          <div class="sheet-actions">
            <button type="button" class="btn btn-mode btn-lg mode-entrada" data-keep>${icon('in')}Guardar em casa</button>
            ${have ? `<a class="btn btn-quiet" href="#/produto/${encodeURIComponent(have.code)}">Ver o que tem em casa</a>` : ''}
          </div>`;
        $('[data-keep]', body).addEventListener('click', () => close(ean));
      }).catch(() => {
        if (body.isConnected) body.innerHTML = '<p class="sheet-text">Sem internet para abrir a lista da Anvisa. Tente de novo quando voltar a conexão.</p>';
        toast('Sem internet para abrir a lista da Anvisa.', { duration: 3000 });
      });
    },
  });
}
