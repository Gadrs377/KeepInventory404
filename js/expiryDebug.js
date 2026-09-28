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

// Bancada: página privada no claude.ai que guarda os resultados para o Claude
// ler direto (não recebe dados pelo link). O botão copia o JSON e abre a
// página; lá, tocar e segurar no campo e Colar guarda.
export const BANCADA_URL = 'https://claude.ai/artifact/FGF7aeQtMgYWgdrLw5PzEw';

// Para usar num <a href=BANCADA_URL target=_blank> dentro do toque: a cópia
// precisa começar no próprio toque (o Safari não deixa copiar depois).
export function copyForBancada(text, onFail = () => {}) {
  try {
    const p = navigator.clipboard && navigator.clipboard.writeText(text);
    if (p) p.catch(onFail); else onFail();
  } catch { onFail(); }
}
