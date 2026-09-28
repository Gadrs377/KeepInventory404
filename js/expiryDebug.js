// Modo de diagnóstico da leitura de validade: mostra, a cada tentativa, o que
// o motor leu e por que a votação não confirmou, e copia tudo em JSON para
// mandar a quem cuida do app. Liga em Mais ("Diagnóstico da validade") ou com
// ?debug na URL. Guardado só neste aparelho.
const KEY = 'ki-debug-validade';

export function debugEnabled() {
  try { return new URLSearchParams(location.search).has('debug') || localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setDebugEnabled(on) {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* sem armazenamento: fica desligado */ }
}
