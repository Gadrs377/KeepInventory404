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

// Depois de um tempo sem confirmar, a câmera sugere inclinar a embalagem ou
// mudar a luz (ajuda com relevo/reflexo) e oferece tirar uma foto parada, que
// aguenta um recorte maior por não ter o tremor do vídeo contínuo.
export const STRUGGLE_MS = 10000;
export const TILT_HINTS = [
  'Incline a embalagem bem devagar, mantendo a validade na mira',
  'Ou mude a direção da luz, sem tirar a validade da mira',
];
// Os cinco filtros distintos (sem as variações de segmentação/rotação, que
// existem para variar entre quadros de vídeo, menos úteis numa foto só), com
// mais pixels: uma foto parada aguenta um recorte maior sem ficar borrada.
export const BURST_TESSERACT_VARIANTS = [0, 1, 2, 3, 4].map(i => ({ ...TESSERACT_VARIANTS[i], width: 1400, maxH: 900 }));
export const BURST_PADDLE_VARIANTS = PADDLE_VARIANTS.map(v => ({ ...v, width: 1300, maxH: 900 }));
// Foto tirada com a câmera do próprio celular: a foto inteira (a pessoa
// enquadrou), com mais pixels. Texto esparso (psm 11) no Tesseract, porque
// a data não está numa faixa conhecida; o Paddle acha as linhas sozinho.
export const PHOTO_BOX = { x: 0, y: 0, w: 1, h: 1 };
export const PHOTO_TESSERACT_VARIANTS = ['raw', 'gray', 'sauvola'].map(mode => ({ mode, blur: 0, width: 1600, maxH: 1600, psm: 11 }));
export const PHOTO_PADDLE_VARIANTS = ['raw', 'gray', 'red'].map(mode => ({ mode, blur: 0, width: 1600, maxH: 1600 }));
// Depois de tantas fotos automáticas sem confirmar (ou tanto tempo, desde que
// já exista uma foto para mostrar), a câmera admite que a embalagem está
// difícil e sugere digitar olhando a melhor foto. O tempo importa porque cada
// foto com o Paddle medium leva ~20 s no computador, mais num celular.
export const HARD_AFTER_BURSTS = 3;
export const HARD_AFTER_MS = 35000;

// Por que a última leitura não confirmou (para o modo de diagnóstico). O
// texto é curto, para caber numa linha do painel.
export const REJECT_TEXT = {
  repeated: 'mesma imagem já contada',
  'no-date': 'nenhuma data no texto',
  several: 'mais de uma data',
  unlabeled: 'data sem rótulo de validade',
  confidence: 'confiança baixa',
  'one-picture': 'só uma imagem até agora',
  'few-votes': 'poucos votos',
  tie: 'outra data empatada',
  skipped: 'data já escolhida antes',
  confirmed: 'confirmou',
};

export function createExpiryConsensus({ skip = [], windowMs = 9000 } = {}) {
  let samples = [];
  let last = null;
  const reject = (code, detail = null) => { last = { code, detail }; return null; };
  return {
    reset() { samples = []; last = null; },
    // Motivo da última decisão: { code, detail } (ver REJECT_TEXT).
    why() { return last; },
    // `source`: the picture the reading came from. Several filters of one
    // still photo vote separately (`frame` differs) but share one source, so
    // the "two distinct pictures" rule can't be met by a single photo whose
    // blur every filter misreads the same way. Defaults to `frame`.
    add({ candidates, engine, confidence = 0, frame, source = frame, at }) {
      samples = samples.filter(s => at - s.at <= windowMs).slice(-11);
      // A frame can contribute at most once per engine.
      if (samples.some(s => s.engine === engine && s.frame === frame)) return reject('repeated');
      if (!candidates.length) return reject('no-date');
      const single = candidates.length === 1 && !candidates[0].ambiguous;
      if (!single) return reject('several', candidates.length);
      const candidate = candidates[0];
      // A missing F on embossed packaging can turn manufacture into an
      // apparently unambiguous date. Unlabeled dates remain manual choices.
      if (!candidate.labeled) return reject('unlabeled');
      if (confidence < 40) return reject('confidence', Math.round(confidence));
      samples.push({ ...candidate, engine, frame, source, at });
      const counts = new Map();
      for (const s of samples) {
        const v = counts.get(s.iso) || { iso: s.iso, n: 0, frames: new Set(), labeled: false };
        v.n++; v.frames.add(s.source); v.labeled ||= s.labeled; counts.set(s.iso, v);
      }
      const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
      const first = ranked[0]; const second = ranked[1]?.n || 0;
      const minimum = first?.labeled ? 2 : 3;
      if (first.frames.size < 2) return reject('one-picture');
      if (first.n < minimum) return reject('few-votes', `${first.n}/${minimum}`);
      if (first.n - second < 2) return reject('tie', `${first.n}×${second}`);
      if (skip.includes(first.iso)) return reject('skipped');
      last = { code: 'confirmed', detail: null };
      return first.iso;
    },
  };
}
