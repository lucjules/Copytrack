// Vérifie que sw.js (cache hors ligne) est à jour : node tools/check-generated.mjs   (npm test)
// Si ce test échoue : npm run sw. (submit-score/index.ts se vérifie en CI : npm run build:function puis git diff.)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const before = readFileSync(join(root, 'sw.js'), 'utf8');
execFileSync('node', [join(root, 'tools/gen-sw.mjs')], { stdio: 'ignore' });
const after = readFileSync(join(root, 'sw.js'), 'utf8');
writeFileSync(join(root, 'sw.js'), before);
if (before !== after) { console.log('FAIL sw.js n\'est pas à jour : lancer « npm run sw »'); process.exit(1); }
console.log('  ok   sw.js est à jour');
