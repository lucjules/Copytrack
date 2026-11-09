// Vérifie que les fichiers générés sont à jour : sw.js (cache hors ligne) et le bloc modulepreload de index.html : node tools/check-generated.mjs   (npm test)
// Si ce test échoue : npm run sw. (submit-score/index.ts se vérifie en CI : npm run build:function puis git diff.)
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['sw.js', 'index.html'];
const before = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(root, f), 'utf8')]));
let after;
try {
  execFileSync('node', [join(root, 'tools/gen-sw.mjs')], { stdio: 'ignore' });
  after = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(root, f), 'utf8')]));
} finally {
  for (const f of FILES) writeFileSync(join(root, f), before[f]);       // on ne modifie rien : on compare seulement
}
const stale = FILES.filter((f) => before[f] !== after[f]);
if (stale.length) { console.log(`FAIL ${stale.join(', ')} n'est pas à jour : lancer « npm run sw »`); process.exit(1); }
console.log('  ok   sw.js et le préchargement des modules (index.html) sont à jour');
