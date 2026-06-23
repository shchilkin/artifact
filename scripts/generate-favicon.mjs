import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const faviconPath = resolve(__dirname, '../apps/web/public/favicon.svg');
const svg = readFileSync(faviconPath, 'utf8');

if (!svg.includes('<svg') || !svg.includes('</svg>')) {
  throw new Error('apps/web/public/favicon.svg is not a readable SVG favicon.');
}

console.log('favicon: using static Artifact mark at apps/web/public/favicon.svg');
