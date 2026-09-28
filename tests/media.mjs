// Fotos e vídeos reais: tests/real (no repositório, recortados e sem
// metadados — ver tests/real/README.md) ou tests/private (só no computador,
// fora do Git). O primeiro que tiver o arquivo vale.
import { existsSync, readdirSync } from 'node:fs';
export const mediaUrl = (file) => `/tests/${existsSync(`tests/real/${file}`) ? 'real' : 'private'}/${file}`;
export const mediaFiles = () => ['real', 'private'].flatMap((d) => (existsSync(`tests/${d}`) ? readdirSync(`tests/${d}`) : []));
