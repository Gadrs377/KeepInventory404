// Endereço do repassador (Cloudflare Worker, pasta worker/). Ele consulta as
// lojas online brasileiras, que não deixam o navegador consultar direto.
export const API_URL = 'https://keepinventory-api.gabriel-gadrs377.workers.dev';

// Versão do app (a mesma de VERSION no sw.js; tests/telemetry.test.mjs confere).
export const APP_VERSION = 'v86';
