// Toque longo numa linha do Armário: a linha "sobe" e vira o mesmo cartão do
// leitor (foto, nome, − número +, validades), com um menu curto embaixo. O
// resto da tela desfoca e escurece, como o menu de contexto do iPhone.

import { formatDate } from '../dates.js';
import { unitWord } from '../actions.js';
import { $, $$, esc, icon, thumb, subtitle, tag, tagState, vibrate, reducedMotion, setTabBarInert } from '../ui.js';

let current = null;

export function closePeek() {
  if (current) current(null);
}

export function peekCard(li, p, lots, { onStep, items }) {
  closePeek();
  const row = li.querySelector('.row') || li;
  const from = row.getBoundingClientRect();
  const free = p.qty - lots.reduce((a, l) => a + l.qty, 0);
  const host = document.createElement('div');
  host.className = 'peek-root';
  host.innerHTML = `
    <div class="peek-scrim" data-close></div>
    <div class="peek" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
      <div class="peek-card">
        <div class="peek-head">
          ${thumb(p, 'md')}
          <div class="peek-text">
            <p class="peek-name">${esc(p.name)}</p>
            ${subtitle(p) ? `<p class="peek-sub">${subtitle(p)}</p>` : ''}
          </div>
        </div>
        <div class="peek-qty">
          <button type="button" class="peek-step" data-step="-1" aria-label="Tirar 1" ${p.qty ? '' : 'disabled'}>${icon('minus')}</button>
          <span class="peek-tag">${tag(p.qty, `${tagState(p)} tag-lg`)}</span>
          <button type="button" class="peek-step" data-step="1" aria-label="Guardar 1">${icon('plus')}</button>
        </div>
        ${lots.length || free > 0 ? `
        <ul class="peek-dates">
          ${lots.map((l) => `<li>${icon('calendar')}<b>${formatDate(l.expiresAt)}</b><span>${unitWord(p, l.qty)}</span></li>`).join('')}
          ${free > 0 && lots.length ? `<li class="is-free"><b>Sem data</b><span>${unitWord(p, free)}</span></li>` : ''}
        </ul>` : ''}
      </div>
      <div class="peek-menu" role="menu">
        ${items.map((it, i) => `
          <button type="button" class="menu-item" role="menuitem" data-i="${i}" style="--i:${i}"><span class="menu-text"><span>${esc(it.label)}</span></span>${icon(it.icon)}</button>`).join('')}
      </div>
    </div>`;
  document.body.append(host);
  const peek = $('.peek', host);
  const card = $('.peek-card', host);

  // Posição: o cartão nasce em cima da linha e fica dentro da tela.
  const W = Math.min(window.innerWidth - 32, 380);
  peek.style.width = `${W}px`;
  const h = peek.offsetHeight;
  const left = (window.innerWidth - W) / 2;
  const top = Math.max(12 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0),
    Math.min(window.innerHeight - h - 24, from.top - 12));
  peek.style.left = `${left}px`;
  peek.style.top = `${top}px`;
  // Mola a partir do retângulo da linha (FLIP): a linha cresce até o cartão.
  if (!reducedMotion()) {
    const cr = card.getBoundingClientRect();
    const sx = from.width / cr.width;
    const sy = from.height / cr.height;
    card.animate([
      { transform: `translate(${from.left - cr.left}px, ${from.top - cr.top}px) scale(${sx}, ${sy})`, borderRadius: '0px', opacity: 0.6 },
      { transform: 'none', opacity: 1 },
    ], { duration: 520, easing: getComputedStyle(document.documentElement).getPropertyValue('--spring-bouncy').trim() || 'ease-out' });
  }
  li.classList.add('is-peeked');
  document.body.classList.add('has-peek');
  setTabBarInert(true);
  requestAnimationFrame(() => host.classList.add('is-open'));
  vibrate(10);

  return new Promise((resolve) => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
    function done(i) {
      if (!host.isConnected) return;
      current = null;
      document.removeEventListener('keydown', onKey, true);
      host.classList.remove('is-open');
      host.classList.add('is-leaving');
      host.inert = true;
      li.classList.remove('is-peeked');
      document.body.classList.remove('has-peek');
      setTabBarInert(false);
      setTimeout(() => host.remove(), reducedMotion() ? 0 : 240);
      if (i !== null && items[i]) items[i].onSelect();
      resolve(i);
    }
    current = done;
    host.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) { done(null); return; }
      const step = e.target.closest('[data-step]');
      if (step && !step.disabled) {
        const product = await onStep(Number(step.dataset.step));
        if (!product || !host.isConnected) return;
        const box = $('.peek-tag', host);
        box.innerHTML = tag(product.qty, `${tagState(product)} tag-lg ${Number(step.dataset.step) < 0 ? 'is-down' : 'is-up'}`);
        $('[data-step="-1"]', host).disabled = product.qty === 0;
        return;
      }
      const it = e.target.closest('[data-i]');
      if (it) { vibrate(8); done(Number(it.dataset.i)); }
    });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => ($$('.menu-item', host)[0] || card).focus({ preventScroll: true }), 50);
  });
}
