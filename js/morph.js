// Atualiza a tela sem redesenhar: compara o HTML novo com o que já está lá e
// muda só o que mudou. Nada pisca (fotos, foco e rolagem ficam), e cada
// mudança se mexe com mola:
//   - o que sai some no lugar e o espaço fecha devagar (o de baixo desliza
//     para cima, nunca pula);
//   - o que entra abre espaço e aparece;
//   - o que mudou de lugar (inclusive de uma lista para outra) desliza até lá;
//   - o que mudou de tamanho cresce ou encolhe;
//   - números rolam para cima ou para baixo; textos curtos trocam suave.
// Elementos com data-key (ou data-code, ou id) são reconhecidos pelo nome;
// os outros, pela ordem e pela tag.

import { spring, reduced } from './motion.js';

const HAS_LINEAR = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');
const ease = (s) => (HAS_LINEAR ? s.easing : 'cubic-bezier(0.2, 0.9, 0.3, 1)');
const SLIDE = () => spring({ stiffness: 260, damping: 28 });
const POP = () => spring({ stiffness: 420, damping: 22 });
const OUT = 'cubic-bezier(0.4, 0, 0.6, 1)';

// Números que rolam quando mudam (o maior vem de baixo, o menor de cima).
const ROLL = '.att-n, .title-count, .filter-count, .ring-n, .review-sum b, .hero-qty-n, [data-roll]';
// Textos curtos que trocam com um esmaecimento rápido.
const FADE = '.pill, .row-sub, .att-l, .filter-head h2, .rx-need, .cont-big, .cont-sub, [data-fade]';

export function keyOf(n) {
  if (n.nodeType !== 1) return null;
  return n.getAttribute('data-key') ?? n.getAttribute('data-code') ?? (n.id || null);
}
const leaving = (n) => n.nodeType === 1 && n.hasAttribute('data-leaving');
// Peças que o próprio app põe na tela (o indicador das abas) ficam onde estão.
const ignored = (n) => n.nodeType === 1 && n.hasAttribute('data-morph-ignore');
const skip = (n) => leaving(n) || ignored(n);

function sameKind(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  return a.tagName === b.tagName && keyOf(a) === keyOf(b);
}

// ---------- Comparar e aplicar ----------

function syncAttrs(o, n) {
  for (const { name, value } of [...n.attributes]) {
    if (o.getAttribute(name) !== value) o.setAttribute(name, value);
  }
  for (const { name } of [...o.attributes]) {
    if (!n.hasAttribute(name)) o.removeAttribute(name);
  }
  // Estado dos campos: não mexe no que a pessoa está digitando.
  if (o === document.activeElement) return;
  if (o.tagName === 'INPUT' || o.tagName === 'TEXTAREA' || o.tagName === 'SELECT') {
    const v = n.getAttribute('value');
    if (o.tagName === 'INPUT' && (o.type === 'checkbox' || o.type === 'radio')) o.checked = n.hasAttribute('checked');
    else if (v !== null && o.value !== v) o.value = v;
  }
}

function patchChildren(oldP, newP, ctx) {
  const olds = [...oldP.childNodes].filter((x) => !skip(x));
  const unkeyed = olds.filter((x) => keyOf(x) === null);
  let cursor = 0;
  let prev = null;
  for (const n of [...newP.childNodes]) {
    const k = keyOf(n);
    let match = null;
    if (k !== null) {
      const o = ctx.pool.get(k);
      if (o && !ctx.used.has(o) && o.tagName === n.tagName) match = o;
    } else {
      for (let i = cursor; i < unkeyed.length; i++) {
        const o = unkeyed[i];
        if (!ctx.used.has(o) && sameKind(o, n)) { match = o; cursor = i + 1; break; }
      }
    }
    let node;
    if (match) {
      ctx.used.add(match);
      morphNode(match, n, ctx);
      node = match;
    } else if (n.nodeType === 1 && n.querySelector && hasPooled(n, ctx)) {
      // Peça nova que traz dentro peças que já existiam (a lista mudou de
      // forma): monta a nova reaproveitando as antigas, que deslizam até lá.
      node = n.cloneNode(false);
      patchChildren(node, n, ctx);
      ctx.added.push(node);
    } else {
      node = n;
      if (n.nodeType === 1) ctx.added.push(n);
    }
    // Põe no lugar, pulando o que está saindo.
    let next = prev ? prev.nextSibling : oldP.firstChild;
    while (next && skip(next) && next !== node) next = next.nextSibling;
    if (node !== next) oldP.insertBefore(node, next);
    prev = node;
  }
  for (const o of olds) if (!ctx.used.has(o)) ctx.maybeGone.push(o);
}

function hasPooled(n, ctx) {
  for (const el of n.querySelectorAll('[data-key], [data-code], [id]')) {
    const o = ctx.pool.get(keyOf(el));
    if (o && !ctx.used.has(o)) return true;
  }
  return false;
}

function morphNode(o, n, ctx) {
  if (o.nodeType !== 1) {
    if (o.nodeValue !== n.nodeValue) {
      const from = o.nodeValue;
      o.nodeValue = n.nodeValue;
      if (o.parentElement && from.trim() !== n.nodeValue.trim()) ctx.texts.push([o.parentElement, from]);
    }
    return;
  }
  // data-morph-keep: peça montada pelo próprio app (um seletor): fica como está.
  if (o.hasAttribute('data-morph-keep') && n.hasAttribute('data-morph-keep')) return;
  syncAttrs(o, n);
  patchChildren(o, n, ctx);
}

// ---------- A função ----------

// `animate: false` muda na hora (dentro de uma troca de tela, por exemplo).
export function morph(container, html, { animate = true } = {}) {
  if (!container) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const anim = animate && !reduced() && container.isConnected && container.getClientRects().length > 0;
  const pool = new Map();
  for (const el of container.querySelectorAll('[data-key], [data-code], [id]')) {
    if (el.closest('[data-leaving]')) continue;
    const k = keyOf(el);
    if (k !== null && !pool.has(k)) pool.set(k, el);
  }
  const wasEmpty = !container.firstElementChild;
  // Primeiro: onde cada peça estava (as primeiras 600; ícones por dentro não).
  const first = new Map();
  if (anim && !wasEmpty) {
    let n = 0;
    for (const el of [container, ...container.querySelectorAll('*')]) {
      if (el.ownerSVGElement || el.closest('[data-leaving]')) continue;
      first.set(el, el.getBoundingClientRect());
      if (++n > 600) break;
    }
  }

  const ctx = { pool, used: new Set(), added: [], maybeGone: [], texts: [] };
  patchChildren(container, tpl.content, ctx);
  // O que não foi reaproveitado em lugar nenhum sai.
  const gone = ctx.maybeGone.filter((o) => !ctx.used.has(o) && o.isConnected && !(o.nodeType === 1 ? o : o.parentElement)?.closest('[data-leaving]'));
  const goneTop = gone.filter((o) => !gone.some((p) => p !== o && p.contains(o)));

  if (!anim || wasEmpty) {
    goneTop.forEach((o) => o.remove());
    return;
  }

  // Só os de cima: o que está dentro de algo que entra ou sai vai junto.
  const addedTop = ctx.added.filter((el) => el.isConnected && !ctx.added.some((p) => p !== el && p.contains(el)));
  const many = addedTop.length + goneTop.length > 40;
  // Saídas: em lista, o espaço fecha devagar; ao lado ou no meio do texto, a
  // peça vira um fantasma fora do lugar e os vizinhos deslizam já.
  goneTop.forEach((el) => (el.nodeType === 1 ? exit(el, many) : el.remove()));
  // Entradas: em lista, abrem espaço a partir de zero.
  // (Peça nova que recebeu peças antigas só aparece: quem anda são elas.)
  const used = [...ctx.used];
  if (!many) addedTop.forEach((el) => { if (!used.some((u) => el.contains(u))) enter(el); });

  // Tamanho: linhas, cartões (com nome) e o próprio contêiner crescem ou
  // encolhem até a altura nova, e o que vem embaixo acompanha.
  for (const [el, a] of first) {
    if (!el.isConnected || el.hasAttribute('data-leaving')) continue;
    if (el !== container && keyOf(el) === null) continue;
    const b = el.getBoundingClientRect();
    if (Math.abs(a.height - b.height) > 1 && isBlockFlow(el)) resize(el, a.height, b.height);
  }
  // Lugar: cada peça que andou desliza de onde estava (FLIP). Dentro de algo
  // que já desliza, só a diferença.
  const moved = new Map();
  for (const [el, a] of first) {
    if (el === container || !el.isConnected || el.closest('[data-leaving]')) continue;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    let ox = 0; let oy = 0;
    for (let p = el.parentElement; p && p !== container; p = p.parentElement) {
      const o = moved.get(p);
      if (o) { [ox, oy] = o; break; }
    }
    if (Math.abs(dx - ox) > 0.5 || Math.abs(dy - oy) > 0.5) {
      slide(el, dx - ox, dy - oy);
      moved.set(el, [dx, dy]);
    }
  }
  // Números e textos.
  const seen = new Set();
  for (const [el, from] of ctx.texts) {
    if (seen.has(el) || !el.isConnected) continue;
    seen.add(el);
    if (el.matches(ROLL)) roll(el, from);
    else if (el.closest('.tag')) restartCss(el.closest('.tag'));
    else if (el.matches(FADE)) fade(el);
  }
}

// ---------- Movimentos ----------

function isBlockFlow(el) {
  const d = getComputedStyle(el).display;
  if (d.startsWith('inline')) return false;
  const p = el.parentElement && getComputedStyle(el.parentElement);
  if (!p) return true;
  // Em fila para o lado (faixa de blocos, chips), a altura não empurra ninguém.
  if ((p.display.includes('flex') && !p.flexDirection.startsWith('column')) || (p.display.includes('grid') && p.gridAutoFlow.startsWith('column'))) return false;
  return true;
}

function enter(el) {
  if (isBlockFlow(el)) {
    const h = el.getBoundingClientRect().height;
    const cs = getComputedStyle(el);
    const s = SLIDE();
    el.style.overflow = 'clip';
    const a = el.animate([
      { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0, transform: 'translateY(-6px) scale(0.98)' },
      { height: `${h}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom, opacity: 1, transform: 'none' },
    ], { duration: s.duration, easing: ease(s) });
    a.onfinish = a.oncancel = () => { el.style.overflow = ''; };
  } else {
    const s = POP();
    el.animate([
      { opacity: 0, transform: 'scale(0.6)', filter: 'blur(4px)' },
      { opacity: 1, transform: 'none', filter: 'blur(0)' },
    ], { duration: s.duration, easing: ease(s) });
  }
}

function exit(el, quick) {
  el.setAttribute('data-leaving', '');
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  el.style.pointerEvents = 'none';
  if (quick) { el.remove(); return; }
  if (isBlockFlow(el)) {
    // Some no lugar enquanto o espaço fecha: o de baixo sobe junto.
    const h = el.getBoundingClientRect().height;
    const cs = getComputedStyle(el);
    el.style.overflow = 'clip';
    const s = SLIDE();
    const a = el.animate([
      { height: `${h}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom, opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'scale(0.97)', offset: 0.35 },
      { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0, transform: 'scale(0.97)' },
    ], { duration: Math.max(380, s.duration), easing: OUT, fill: 'forwards' });
    a.onfinish = a.oncancel = () => el.remove();
    return;
  }
  // Fantasma: sai do lugar (os vizinhos já deslizam), encolhe e some.
  const r = el.getBoundingClientRect();
  Object.assign(el.style, { position: 'absolute', margin: '0', left: '0px', top: '0px', width: `${r.width}px`, height: `${r.height}px`, boxSizing: 'border-box' });
  const r0 = el.getBoundingClientRect();
  el.style.left = `${r.left - r0.left}px`;
  el.style.top = `${r.top - r0.top}px`;
  const a = el.animate([
    { opacity: 1, transform: 'none', filter: 'blur(0)' },
    { opacity: 0, transform: 'scale(0.6)', filter: 'blur(4px)' },
  ], { duration: 240, easing: OUT, fill: 'forwards' });
  a.onfinish = a.oncancel = () => el.remove();
}

function slide(el, dx, dy) {
  const s = SLIDE();
  // Soma com o que já estiver mexendo a peça (outra troca no meio do caminho).
  el.animate([
    { transform: `translate(${dx}px, ${dy}px)` },
    { transform: 'translate(0, 0)' },
  ], { duration: s.duration, easing: ease(s), composite: 'add' });
}

function resize(el, from, to) {
  const s = SLIDE();
  el.style.overflow = 'clip';
  const a = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: s.duration, easing: ease(s) });
  a.onfinish = a.oncancel = () => { el.style.overflow = ''; };
}

// Número que muda: o novo entra rolando, do lado certo.
export function roll(el, from) {
  const a = parseFloat(String(from).replace(',', '.'));
  const b = parseFloat(String(el.textContent).replace(',', '.'));
  const up = !(Number.isFinite(a) && Number.isFinite(b)) || b >= a;
  const s = POP();
  el.animate([
    { transform: `translateY(${up ? '55%' : '-55%'})`, opacity: 0, filter: 'blur(2px)' },
    { transform: 'none', opacity: 1, filter: 'blur(0)' },
  ], { duration: s.duration, easing: ease(s) });
}

function fade(el) {
  el.animate([{ opacity: 0.15, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 260, easing: 'ease-out' });
}

// A etiqueta de quantidade tem a rolagem no CSS (is-up / is-down): recomeça.
function restartCss(el) {
  for (const a of el.getAnimations({ subtree: true })) {
    if (a instanceof CSSAnimation) { a.cancel(); a.play(); }
  }
}

// Mostra ou esconde um bloco sem pular: a altura (e a margem) vão até zero, ou
// saem de zero, e o que vem embaixo acompanha. `fill(el)` põe o conteúdo novo
// antes de aparecer; ao esconder, o conteúdo fica até o fim e depois sai.
export function reveal(el, show, fill = null) {
  if (!el) return;
  const shown = !el.hidden;
  if (show && fill) fill(el);
  if (show === shown) return;
  if (reduced() || !el.isConnected) {
    el.hidden = !show;
    if (!show && fill === null) el.replaceChildren();
    return;
  }
  for (const a of el.getAnimations()) a.cancel();
  el.hidden = false;
  const cs = getComputedStyle(el);
  const h = el.getBoundingClientRect().height;
  const full = { height: `${h}px`, marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1, transform: 'none' };
  const zero = { height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0, transform: 'scale(0.9)' };
  el.style.overflow = 'clip';
  const s = SLIDE();
  const a = el.animate(show ? [zero, full] : [full, zero], { duration: s.duration, easing: ease(s), fill: show ? 'none' : 'forwards' });
  a.onfinish = () => {
    el.style.overflow = '';
    if (!show) { el.hidden = true; el.replaceChildren(); a.cancel(); }
  };
}
