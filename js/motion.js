// Movimento: molas físicas (como as do iOS), o produto que voa até o cupom, o
// selo de "pronto" que se desenha, a caixa do remédio que inclina com o dedo e
// números que contam. Tudo respeita "Reduzir movimento": sem deslocamento, no
// máximo um esmaecimento curto.

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Mola ----------
// Simula uma mola (massa, rigidez, amortecimento) e devolve a curva como
// linear(...) do CSS e a duração até assentar. Cache por parâmetros.
const springCache = new Map();
export function spring({ stiffness = 260, damping = 24, mass = 1, velocity = 0 } = {}) {
  const key = `${stiffness}|${damping}|${mass}|${velocity}`;
  if (springCache.has(key)) return springCache.get(key);
  const dt = 1 / 120;
  let x = 0; let v = velocity;
  const pts = [];
  let t = 0;
  let settled = 0;
  while (t < 3) {
    const f = -stiffness * (x - 1) - damping * v;
    v += (f / mass) * dt;
    x += v * dt;
    t += dt;
    pts.push([t, x]);
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) { if ((settled += dt) > 0.05) break; } else settled = 0;
  }
  const duration = Math.round(t * 1000);
  // Amostra ~40 pontos: o bastante para a curva, sem string gigante.
  const step = Math.max(1, Math.floor(pts.length / 40));
  const stops = pts.filter((_, i) => i % step === 0 || i === pts.length - 1)
    .map(([pt, px]) => `${px.toFixed(4)} ${((pt / t) * 100).toFixed(1)}%`);
  const out = { easing: `linear(0, ${stops.join(', ')})`, duration };
  springCache.set(key, out);
  return out;
}
const HAS_LINEAR = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');

// Anima `el` com uma mola. Sem linear(): cai numa curva parecida.
export function springTo(el, keyframes, opts = {}) {
  if (!el || !el.animate) return null;
  if (reduced()) return el.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 150 });
  const s = spring(opts);
  return el.animate(keyframes, {
    duration: opts.duration || s.duration,
    easing: HAS_LINEAR ? s.easing : 'cubic-bezier(0.2, 0.9, 0.3, 1.1)',
    delay: opts.delay || 0,
    fill: opts.fill || 'none',
    composite: opts.composite,
  });
}

// "Pulo" de confirmação: o elemento cresce um pouco e volta com mola.
export function pop(el, { scale = 1.08, stiffness = 420, damping = 16 } = {}) {
  return springTo(el, [{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], { stiffness, damping });
}

// Entrada em cascata (listas, cartões): cada um sobe um pouco e aparece.
export function stagger(els, { y = 12, step = 32, max = 12, stiffness = 300, damping = 28 } = {}) {
  if (reduced()) return;
  [...els].slice(0, max).forEach((el, i) => springTo(el, [
    { transform: `translateY(${y}px)`, opacity: 0 },
    { transform: 'none', opacity: 1 },
  ], { stiffness, damping, delay: i * step, fill: 'backwards' }));
}

// ---------- Voo até o cupom ----------
// Uma cópia do elemento `from` voa num arco até `to` e encolhe dentro dele,
// como o item que "cai" na sacola. Resolve quando chega.
export function flyTo(from, to, { html = null, size = 52 } = {}) {
  if (reduced() || !from || !to) return Promise.resolve();
  const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
  const b = to.getBoundingClientRect();
  if (!a.width || !b.width) return Promise.resolve();
  const ghost = document.createElement('div');
  ghost.className = 'fly-ghost';
  ghost.innerHTML = html || (from.outerHTML || '');
  const sx = a.left + a.width / 2 - size / 2;
  const sy = a.top + a.height / 2 - size / 2;
  Object.assign(ghost.style, { left: `${sx}px`, top: `${sy}px`, width: `${size}px`, height: `${size}px` });
  document.body.append(ghost);
  const tx = b.left + Math.min(40, b.width / 2) - size / 2 - sx;
  const ty = b.top + b.height / 2 - size / 2 - sy;
  // Arco: sobe um pouco antes de descer até a linha.
  const lift = Math.min(-24, ty * -0.25);
  const anim = ghost.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
    { transform: `translate(${tx * 0.45}px, ${lift}px) scale(0.86)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${tx}px, ${ty}px) scale(0.32)`, opacity: 0.2, offset: 1 },
  ], { duration: 560, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' });
  return anim.finished.catch(() => {}).then(() => ghost.remove());
}

// ---------- Selo de pronto ----------
// O círculo enche e o visto se desenha, como a confirmação de um pagamento.
// Vai em `host`; resolve quando termina.
export function successMark(host, { label = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'done-mark';
  wrap.setAttribute('role', 'status');
  wrap.innerHTML = `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle class="done-ring" cx="32" cy="32" r="28" pathLength="100"/>
      <circle class="done-fill" cx="32" cy="32" r="28"/>
      <path class="done-check" d="M20 33.5 L28.5 42 L45 24" pathLength="100"/>
    </svg>
    ${label ? `<span class="done-label">${label}</span>` : ''}`;
  host.prepend(wrap);
  if (reduced()) return Promise.resolve(wrap);
  return new Promise((resolve) => {
    requestAnimationFrame(() => wrap.classList.add('is-on'));
    setTimeout(() => resolve(wrap), 760);
  });
}

// ---------- Números que contam ----------
export function countUp(el, to, { from = 0, duration = 700 } = {}) {
  if (!el) return;
  if (reduced() || to === from) { el.textContent = String(to); return; }
  const t0 = performance.now();
  const ease = (x) => 1 - (1 - x) ** 4;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / duration);
    el.textContent = String(Math.round(from + (to - from) * ease(k)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- Caixa que inclina ----------
// Arrastar o dedo sobre a caixa do remédio gira em 3D; soltando, volta com mola.
// `base`: a inclinação de repouso (rotateX e rotateY em graus).
export function tiltable(el, { base = [8, -16], max = 18, onTap = null } = {}) {
  if (!el || reduced()) return () => {};
  let active = null;
  let releasing = 0;
  let phone = [0, 0];
  const set = (rx, ry) => {
    el.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    // O brilho da embalagem corre junto com a inclinação.
    el.style.setProperty('--sheen', `${((ry - base[1]) * 2.2).toFixed(1)}%`);
  };
  const down = (e) => {
    active = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    el.style.transition = 'none';
    try { el.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
  };
  const move = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const dx = Math.max(-1, Math.min(1, (e.clientX - active.x) / 120));
    const dy = Math.max(-1, Math.min(1, (e.clientY - active.y) / 120));
    active.moved = Math.max(active.moved, Math.hypot(e.clientX - active.x, e.clientY - active.y));
    set(base[0] - dy * max, base[1] + dx * max * 1.6);
  };
  const up = () => {
    if (!active) return;
    const tap = active.moved < 6;
    active = null;
    // No iPhone, a licença do movimento só pode ser pedida no fim do toque.
    askTilt();
    const s = spring({ stiffness: 180, damping: 12 });
    el.style.transition = `transform ${s.duration}ms ${HAS_LINEAR ? s.easing : 'cubic-bezier(0.2, 1.4, 0.3, 1)'}`;
    releasing = performance.now() + s.duration;
    set(base[0] - phone[1], base[1] + phone[0]);
    if (tap && onTap) onTap();
  };
  // Celular inclinado: a caixa acompanha um pouco (até 5 graus).
  const offTilt = onTilt((x, y) => {
    phone = [clampTo(x * 0.25, 5), clampTo(y * 0.2, 4)];
    if (active || performance.now() < releasing) return;
    el.style.transition = 'transform 120ms linear';
    set(base[0] - phone[1], base[1] + phone[0]);
  });
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.style.touchAction = 'pan-y';
  return () => {
    offTilt();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}

// Entrada da caixa: cai girando um pouco e assenta; o selo "cola" depois.
export function boxEnter(box) {
  if (!box || reduced()) return;
  const b3 = box.querySelector('.mbox-3d');
  if (b3) springTo(b3, [
    { transform: 'rotateX(28deg) rotateY(-38deg) translateY(-18px) scale(0.9)', opacity: 0 },
    { transform: 'rotateX(8deg) rotateY(-16deg)', opacity: 1 },
  ], { stiffness: 140, damping: 14, fill: 'backwards' });
  const st = box.querySelector('.mbox-sticker:not([hidden])');
  if (st) springTo(st, [
    { transform: 'scale(1.6) rotate(-14deg)', opacity: 0 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1 },
  ], { stiffness: 520, damping: 18, delay: 380, fill: 'backwards' });
}

// Cartela: os comprimidos que sobram aparecem um a um.
export function blisterEnter(blister) {
  if (!blister || reduced()) return;
  const on = [...blister.querySelectorAll('i.is-on')];
  on.forEach((p, i) => springTo(p, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { stiffness: 600, damping: 18, delay: 120 + i * 35, fill: 'backwards' }));
}

// ---------- Balanço (inércia) ----------
// Como gente em pé no ônibus: quando a faixa arranca, os blocos ficam um pouco
// para trás; quando ela para, vão para a frente e voltam, num "blup". Cada
// bloco tem a sua mola (uns mais duros, outros mais soltos), para não
// balançarem todos juntos.
//   items:  o que balança (seletor, dentro de `host`)
//   inner:  o que vai pendurado dentro do bloco e balança com atraso
//   lean:   graus de inclinação por px/s da rolagem para o lado (0 = nada)
//   skew:   inclina como texto em itálico, em vez de girar (bom para texto)
//   drop:   px de atraso por px/s da rolagem da página (0 = nada)
//   pitch:  graus de rotateX por px de atraso vertical (caixa em 3D)
const swayHosts = new Set();
let swayRaf = 0;
let swayT = 0;
let pageY = null;
let pageV = 0;
let swayPoke = 0; // última rolagem: o laço segue vivo um pouco depois dela
const clampTo = (v, m) => Math.max(-m, Math.min(m, v));

export function sway(host, { items, inner = '', lean = 0.004, max = 5, skew = false, drop = 0, maxDrop = 5, pitch = 0 } = {}) {
  if (!host || reduced()) return () => {};
  const h = { host, items, inner, lean, max, skew, drop, maxDrop, pitch, sc: null, lastX: null, v: 0, state: new WeakMap(), gx: 0, woke: 0 };
  const onScroll = (e) => {
    const t = e.target;
    if (t instanceof Element && host.contains(t)) h.sc = t;
    wakeSway();
  };
  host.addEventListener('scroll', onScroll, { capture: true, passive: true });
  swayHosts.add(h);
  // O que vai pendurado (o ícone) cai um tiquinho para o lado do chão.
  const offTilt = inner ? onTilt((x) => {
    h.gx = clampTo(-x * 0.15, 3);
    if (Math.abs(h.gx - h.woke) > 0.15) { h.woke = h.gx; wakeSway(); }
  }) : () => {};
  if (drop) window.addEventListener('scroll', wakeSway, { passive: true });
  return () => {
    host.removeEventListener('scroll', onScroll, true);
    swayHosts.delete(h);
    offTilt();
  };
}

function wakeSway() {
  swayPoke = performance.now();
  if (swayRaf || reduced()) return;
  swayT = performance.now();
  swayRaf = requestAnimationFrame(swayFrame);
}

function swayFrame(now) {
  const dt = Math.min(0.034, Math.max(0.004, (now - swayT) / 1000));
  swayT = now;
  const y = window.scrollY;
  const rawY = pageY === null ? 0 : (y - pageY) / dt;
  pageY = y;
  pageV += (rawY - pageV) * 0.35;
  let busy = Math.abs(rawY) > 1 || now - swayPoke < 150;
  for (const h of swayHosts) {
    if (!h.host.isConnected) { swayHosts.delete(h); continue; }
    const sc = h.sc && h.sc.isConnected ? h.sc : null;
    const x = sc ? sc.scrollLeft : 0;
    const rawX = sc && h.lastX !== null && h.lastSc === sc ? (x - h.lastX) / dt : 0;
    h.lastX = x;
    h.lastSc = sc;
    h.v += (rawX - h.v) * 0.35;
    if (Math.abs(rawX) > 1 || Math.abs(h.v) > 2) busy = true;
    const ta = h.lean ? clampTo(h.v * h.lean, h.max) : 0;
    const ty = h.drop ? clampTo(pageV * h.drop, h.maxDrop) : 0;
    h.host.querySelectorAll(h.items).forEach((el, i) => {
      let s = h.state.get(el);
      if (!s) h.state.set(el, (s = { a: 0, va: 0, y: 0, vy: 0, b: 0, vb: 0, k: 150 + (i % 3) * 45 }));
      // Molas pouco amortecidas: passam do ponto e voltam (o "blup").
      s.va += (s.k * (ta - s.a) - 6.5 * s.va) * dt; s.a += s.va * dt;
      s.vy += (210 * (ty - s.y) - 11 * s.vy) * dt; s.y += s.vy * dt;
      s.vb += (90 * (s.a - s.b) - 6 * s.vb) * dt; s.b += s.vb * dt;
      const live = Math.abs(s.a) > 0.03 || Math.abs(s.va) > 0.2 || Math.abs(s.y) > 0.05 || Math.abs(s.vy) > 0.3
        || Math.abs(s.b - s.a) > 0.03 || Math.abs(s.vb) > 0.2;
      if (live) busy = true;
      if (!live) { s.a = s.va = s.y = s.vy = s.b = s.vb = 0; }
      const parts = [];
      if (h.pitch && s.y) parts.push('perspective(700px)');
      if (s.y) parts.push(`translateY(${s.y.toFixed(2)}px)`);
      if (h.pitch && s.y) parts.push(`rotateX(${(-s.y * h.pitch).toFixed(2)}deg)`);
      if (s.a) parts.push(h.skew ? `skewX(${(-s.a).toFixed(2)}deg)` : `rotate(${s.a.toFixed(2)}deg)`);
      el.style.transform = parts.join(' ');
      if (h.inner) {
        const inn = el.querySelector(h.inner);
        const r = (live ? (s.b - s.a) * 2.2 : 0) + h.gx;
        if (inn) inn.style.transform = Math.abs(r) > 0.03 ? `rotate(${r.toFixed(2)}deg)` : '';
      }
    });
  }
  if (busy) swayRaf = requestAnimationFrame(swayFrame);
  else { swayRaf = 0; pageY = null; pageV = 0; }
}

// ---------- "−1" que sobe ----------
// Um número pequeno sai de `anchor` e sobe sumindo, como um recibo do toque:
// mostra o que aconteceu bem onde a pessoa está olhando.
export function floatLabel(anchor, text, { mode = '' } = {}) {
  if (!anchor || reduced() || !anchor.getBoundingClientRect) return;
  const r = anchor.getBoundingClientRect();
  if (!r.width) return;
  const el = document.createElement('span');
  el.className = `float-n${mode ? ` mode-${mode}` : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.textContent = text;
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top}px`;
  document.body.append(el);
  const drift = (Math.random() - 0.5) * 16;
  el.animate([
    { transform: 'translate(-50%, 0) scale(0.6)', opacity: 0 },
    { transform: `translate(calc(-50% + ${drift * 0.3}px), -18px) scale(1.12)`, opacity: 1, offset: 0.25 },
    { transform: `translate(calc(-50% + ${drift}px), -46px) scale(0.95)`, opacity: 0 },
  ], { duration: 820, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }).finished.catch(() => {}).then(() => el.remove());
}

// ---------- Movimento do celular ----------
// Bem de leve, porque a pessoa está com o celular na mão: só a mudança conta
// (segurar inclinado volta a ser o "neutro" em um segundo), tudo suavizado e
// com limite. No iPhone, o sistema pede licença: askTilt() num toque.
const tiltSubs = new Set();
const T = { on: false, ok: null, x: 0, y: 0, bx: null, by: null, raf: 0 };
const tiltOff = () => { try { return localStorage.getItem('ki.tilt') === '0'; } catch { return false; } };
function onOrient(e) {
  if (e.gamma == null || e.beta == null) return;
  if (T.bx === null) { T.bx = e.gamma; T.by = e.beta; }
  T.bx += (e.gamma - T.bx) * 0.025;
  T.by += (e.beta - T.by) * 0.025;
  T.x += (clampTo(e.gamma - T.bx, 20) - T.x) * 0.2;
  T.y += (clampTo(e.beta - T.by, 20) - T.y) * 0.2;
  if (!T.raf) T.raf = requestAnimationFrame(() => { T.raf = 0; for (const f of tiltSubs) f(T.x, T.y); });
}
function startTilt() {
  if (T.on || typeof DeviceOrientationEvent === 'undefined') return;
  const needs = typeof DeviceOrientationEvent.requestPermission === 'function';
  if (needs && T.ok !== true) return;
  window.addEventListener('deviceorientation', onOrient);
  T.on = true;
}
function stopTilt() {
  if (!T.on) return;
  window.removeEventListener('deviceorientation', onOrient);
  T.on = false; T.bx = T.by = null; T.x = T.y = 0;
}
// cb(x, y): graus de inclinação recente para o lado (x) e para a frente (y).
export function onTilt(cb) {
  if (reduced() || tiltOff()) return () => {};
  tiltSubs.add(cb);
  startTilt();
  return () => { tiltSubs.delete(cb); if (!tiltSubs.size) stopTilt(); };
}
// iPhone: pede a licença do movimento. O Safari só aceita o pedido dentro de
// um toque que terminou (pointerup, touchend, click); no começo do toque
// (pointerdown) ele recusa sem mostrar nada. Resolve com 'granted', 'denied',
// 'unsupported' ou 'error' (este último pode tentar de novo no próximo toque).
const PERM_KEY = 'ki.tilt.ok';
export function askTilt() {
  if (reduced() || tiltOff()) return Promise.resolve('off');
  const D = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
  if (!D) return Promise.resolve('unsupported');
  if (typeof D.requestPermission !== 'function') { T.ok = true; startIfWanted(); return Promise.resolve('granted'); }
  if (T.ok === true) return Promise.resolve('granted');
  if (T.asking) return T.asking;
  T.asking = D.requestPermission().then((r) => {
    T.ok = r === 'granted' ? true : null;
    try { localStorage.setItem(PERM_KEY, r === 'granted' ? '1' : '0'); } catch { /* sem armazenamento */ }
    startIfWanted();
    return r === 'granted' ? 'granted' : 'denied';
  }, () => 'error').finally(() => { T.asking = null; });
  return T.asking;
}
function startIfWanted() { if (T.ok && tiltSubs.size) startTilt(); }

// Já deu licença antes: o iPhone esquece quando o app fecha, mas pedir de
// novo num toque não mostra pergunta. Basta o primeiro toque em qualquer lugar.
(function rearm() {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return;
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') return;
  let had = false;
  try { had = localStorage.getItem(PERM_KEY) === '1'; } catch { /* sem armazenamento */ }
  if (!had) return;
  const once = () => {
    askTilt().then((r) => { if (r === 'granted' || r === 'denied') { document.removeEventListener('touchend', once, true); document.removeEventListener('click', once, true); } });
  };
  document.addEventListener('touchend', once, true);
  document.addEventListener('click', once, true);
})();
