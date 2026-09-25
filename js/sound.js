// Bip de leitura no estilo do leitor do caixa do mercado, feito com Web Audio
// (sem arquivo de som). O iPhone só libera áudio depois de um toque na tela,
// então o contexto é criado/retomado no primeiro toque.

const PREF_KEY = 'keepinventory.sound';
let ctx = null;

function audioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  const unlock = () => {
    const c = audioContext();
    if (!c) return;
    // Um buffer silencioso destrava a saída de áudio no Safari.
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

export function soundEnabled() {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; }
}

export function setSoundEnabled(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* sem armazenamento */ }
}

// Um tom com ataque e saída rápidos, para não estalar.
function tone(c, { freq, start, duration, volume = 0.18, type = 'square' }) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  // Filtro passa-baixa tira a aspereza da onda quadrada sem perder o "bip" de caixa.
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq * 2.2;
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.004);
  gain.gain.setValueAtTime(volume, start + duration - 0.012);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(filter).connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.01);
}

// 'ok': bip único de leitura. 'error': dois tons graves.
export function beep(kind = 'ok') {
  if (!soundEnabled()) return;
  const c = audioContext();
  if (!c) return;
  const t = c.currentTime + 0.005;
  if (kind === 'error') {
    tone(c, { freq: 420, start: t, duration: 0.12, volume: 0.2 });
    tone(c, { freq: 320, start: t + 0.16, duration: 0.16, volume: 0.2 });
  } else {
    tone(c, { freq: 2700, start: t, duration: 0.11 });
  }
}
