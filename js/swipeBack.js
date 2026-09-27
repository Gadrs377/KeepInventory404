// Voltar arrastando da borda esquerda, como em qualquer app do iPhone. No
// Safari o navegador já faz isso; instalado na tela de início, não: aqui o app
// faz o gesto. A tela acompanha o dedo; soltando depois de um terço da largura
// (ou num puxão rápido), segue para a tela de trás; antes disso, volta ao lugar.

const EDGE = 24; // px da borda onde o gesto começa
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

/**
 * `backLink()` devolve o link "Voltar" da tela atual, ou null onde não se
 * volta (abas, leitor). `onCommit(href)` navega sem a animação de sempre, porque
 * o dedo já fez o movimento.
 */
export function enableSwipeBack({ root, backLink, onCommit }) {
  let start = null;
  let dx = 0;
  let dragging = false;
  let last = null;

  function reset(animate) {
    const html = document.documentElement;
    if (animate) {
      root.style.transition = 'translate 280ms var(--spring)';
      root.addEventListener('transitionend', () => { root.style.transition = ''; html.classList.remove('swiping'); }, { once: true });
      root.style.translate = '';
    } else {
      root.style.transition = '';
      root.style.translate = '';
      html.classList.remove('swiping');
    }
  }

  document.addEventListener('touchstart', (e) => {
    start = null;
    if (e.touches.length !== 1 || !standalone()) return;
    const t = e.touches[0];
    if (t.clientX > EDGE) return;
    if (document.querySelector('.sheet.is-open, .menu-root')) return;
    const link = backLink();
    if (!link) return;
    start = { x: t.clientX, y: t.clientY, link, at: e.timeStamp };
    last = { x: t.clientX, at: e.timeStamp };
    dx = 0;
    dragging = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!start) return;
    const t = e.touches[0];
    const mx = t.clientX - start.x;
    const my = t.clientY - start.y;
    if (!dragging) {
      // Mais vertical que horizontal: é rolagem, não gesto de voltar.
      if (Math.abs(my) > Math.abs(mx)) { start = null; return; }
      if (mx < 6) return;
      dragging = true;
      document.documentElement.classList.add('swiping');
      root.style.transition = 'none';
    }
    e.preventDefault();
    dx = Math.max(0, mx);
    root.style.translate = `${dx}px 0`;
    last = { x: t.clientX, at: e.timeStamp, v: (t.clientX - last.x) / Math.max(1, e.timeStamp - last.at) };
  }, { passive: false });

  function end() {
    if (!start) return;
    const { link } = start;
    start = null;
    if (!dragging) return;
    dragging = false;
    const width = root.clientWidth || innerWidth;
    const fast = (last && last.v > 0.5) && dx > 30;
    if (dx > width / 3 || fast) {
      root.style.transition = 'translate 220ms var(--ease)';
      root.style.translate = `${width}px 0`;
      const go = () => onCommit(link.getAttribute('href'));
      let done = false;
      const once = () => { if (!done) { done = true; go(); } };
      root.addEventListener('transitionend', once, { once: true });
      setTimeout(once, 260);
    } else {
      reset(true);
    }
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { if (start && dragging) reset(true); start = null; dragging = false; }, { passive: true });

  // Chamado pelo roteador quando a nova tela entra.
  return () => reset(false);
}
