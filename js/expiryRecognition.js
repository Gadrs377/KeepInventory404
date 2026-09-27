// Policy shared by the camera and its tests. The two engines vote in the same
// rolling window, but ambiguous/low-confidence output only becomes a button.
export const TESSERACT_VARIANTS = [
  { mode: 'raw', blur: 0, width: 1000, psm: 6 },
  { mode: 'gray', blur: 0, width: 1000, psm: 6 },
  { mode: 'otsu', blur: 1, width: 1000, psm: 6 },
  { mode: 'sauvola', blur: 0, width: 1000, psm: 6 },
  { mode: 'adaptive', blur: 1, width: 1000, psm: 6 },
  { mode: 'otsu', blur: 2, width: 700, psm: 6 },
  { mode: 'raw', blur: 0, width: 1000, psm: 11 },
  { mode: 'gray', blur: 0, width: 1000, psm: 7 },
  { mode: 'sauvola', blur: 0, width: 1000, psm: 7, angle: -4 },
  { mode: 'sauvola', blur: 0, width: 1000, psm: 7, angle: 4 },
];

export function needsPaddle(attempts, elapsedMs) {
  return attempts >= 6 || (attempts >= 3 && elapsedMs >= 7000);
}

export const PADDLE_VARIANTS = ['raw', 'gray', 'otsu', 'red', 'blue'].map(mode => ({mode, blur:0, width:900}));

export function createExpiryConsensus({ skip = [], windowMs = 9000 } = {}) {
  let samples = [];
  return {
    reset() { samples = []; },
    add({ candidates, engine, confidence = 0, frame, at }) {
      samples = samples.filter(s => at - s.at <= windowMs).slice(-11);
      // A frame can contribute at most once per engine.
      if (samples.some(s => s.engine === engine && s.frame === frame)) return null;
      const single = candidates.length === 1 && !candidates[0].ambiguous;
      const candidate = single ? candidates[0] : null;
      // A missing F on embossed packaging can turn manufacture into an
      // apparently unambiguous date. Unlabeled dates remain manual choices.
      if (!candidate || !candidate.labeled || confidence < 40) return null;
      samples.push({ ...candidate, engine, frame, at });
      const counts = new Map();
      for (const s of samples) {
        const v = counts.get(s.iso) || { iso: s.iso, n: 0, frames: new Set(), labeled: false };
        v.n++; v.frames.add(s.frame); v.labeled ||= s.labeled; counts.set(s.iso, v);
      }
      const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
      const first = ranked[0]; const second = ranked[1]?.n || 0;
      const minimum = first?.labeled ? 2 : 3;
      if (first && first.frames.size >= 2 && first.n >= minimum && first.n - second >= 2 && !skip.includes(first.iso)) return first.iso;
      return null;
    },
  };
}
