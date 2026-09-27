// Deterministic synthetic controls. These are NOT photos of real packaging.
export function fixtures() {
  const cases = [];
  const add = (id, lines, expected, style = {}) => cases.push({ id, lines, expected, style });
  const label = ['FAB 01/09/2026', 'VAL 15/10/2026', 'LOTE 123456'];
  for (const [name, style] of Object.entries({ plain: {}, small: { size: 20 }, large: { size: 42 }, lowContrast: { fg:'#999', bg:'#ddd' }, dark: {fg:'#fff',bg:'#25362f'}, shadow: {shadow:true}, tilted: {angle:6}, blurred: {blur:1.3}, dotted: {dotted:true}, glare: {glare:true} })) add(name, label, '2026-10-15', style);
  add('month-year', ['VAL 10/2026'], '2026-10-31');
  add('named-month', ['VAL 15 OUT 2026'], '2026-10-15');
  add('short-year', ['VAL 15/10/26'], '2026-10-15');
  add('compact', ['VAL 15102026'], '2026-10-15');
  add('iso-date', ['VAL 2026-10-15'], '2026-10-15');
  add('lost-separators', ['VAL 15 10 2026'], '2026-10-15');
  add('manufacture-only', ['FAB 15/09/2026'], null);
  add('lot-only', ['LOTE 10/26'], null);
  add('no-date', ['ARROZ TIPO 1', 'PESO 500 G'], null);
  add('invalid-date', ['VAL 31/02/2027'], null);
  return cases;
}
export function renderFixture({ lines, style: s }) {
  const c = document.createElement('canvas'); c.width = 850; c.height = 240;
  const x = c.getContext('2d');
  x.fillStyle = s.bg || '#eee9dc'; x.fillRect(0, 0, c.width, c.height);
  x.save(); x.translate(45, 45); x.rotate((s.angle || 0) * Math.PI / 180);
  x.fillStyle = s.fg || '#202020'; x.font = `${s.size || 32}px monospace`; x.textBaseline = 'top';
  lines.forEach((l,i) => x.fillText(l, 0, i * 50)); x.restore();
  if (s.dotted) { x.fillStyle = s.bg || '#eee9dc'; for(let y=0;y<c.height;y+=4) x.fillRect(0,y,c.width,1); for(let a=0;a<c.width;a+=4) x.fillRect(a,0,1,c.height); }
  if(s.shadow) { const g=x.createLinearGradient(0,0,c.width,0);g.addColorStop(0,'rgba(0,0,0,.65)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,c.width,c.height); }
  if(s.glare) { const g=x.createRadialGradient(300,105,0,300,105,160);g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,c.width,c.height); }
  if(s.blur) { const b=document.createElement('canvas');b.width=c.width;b.height=c.height;const bx=b.getContext('2d');bx.filter=`blur(${s.blur}px)`;bx.drawImage(c,0,0);return b; }
  return c;
}
