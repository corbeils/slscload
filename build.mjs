// Construit dist/planificateur.html : moteurs TypeScript (esbuild) + gabarit de la page.
// Usage : npm install && npm run build
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const r = await build({ entryPoints: ['engine/entry.ts'], bundle: true, format: 'iife', globalName: 'Engine', write: false });
const engine = r.outputFiles[0].text;
const tpl = readFileSync('app/demo-template.html', 'utf8');
if (!tpl.includes('/*ENGINE*/')) throw new Error('Marqueur /*ENGINE*/ absent du gabarit');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/planificateur.html', tpl.replace('/*ENGINE*/', () => engine));
console.log('dist/planificateur.html écrit');
