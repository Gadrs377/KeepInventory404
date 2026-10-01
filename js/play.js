// Bobeirinhas de toque: respostas pequenas quando o dedo encosta em coisas
// que não fazem nada (um ícone de vazio, o ícone de um título) e na busca.
// Curtas, de uma vez só, e nada com "Reduzir movimento".

import { reducedMotion } from './ui.js';

const TAP = [
  ['.empty-icon', 'is-boing'],
  ['.list-title-icon > .icon', 'is-wiggle'],
  ['.product-hero > .thumb', 'is-wobble'],
  ['.receipt-head, .paper-head', 'is-wiggle'],
  ['.hero-qty-label', 'is-wiggle'],
  ['.pocket.is-on', 'is-press'],
];

function replay(el, cls, ms = 900) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  clearTimeout(el._play);
  el._play = setTimeout(() => el.classList.remove(cls), ms);
}

export function initPlay() {
  document.addEventListener('pointerdown', (e) => {
    if (reducedMotion() || !(e.target instanceof Element)) return;
    for (const [sel, cls] of TAP) {
      const el = e.target.closest(sel);
      if (el) { replay(el, cls); return; }
    }
  }, { passive: true });
  // Busca: a lupa dá um pulinho a cada letra e olha em volta ao entrar.
  document.addEventListener('input', (e) => {
    if (reducedMotion() || !(e.target instanceof Element) || !e.target.matches('.search input')) return;
    const ico = e.target.closest('.search').querySelector(':scope > .icon');
    if (ico) replay(ico, 'is-hop', 300);
  });
  document.addEventListener('focusin', (e) => {
    if (reducedMotion() || !(e.target instanceof Element) || !e.target.matches('.search input')) return;
    const ico = e.target.closest('.search').querySelector(':scope > .icon');
    if (ico) replay(ico, 'is-look', 700);
  });
}
