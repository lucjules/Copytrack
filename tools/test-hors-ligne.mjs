// Jeu hors ligne (phase 3 de la 1.0) : tout fichier dont le démarrage a besoin est dans la copie du service worker (sw.js), et la garde de démarrage
// n'efface jamais cette copie hors ligne. Le parcours réel (première visite, puis redémarrage sans réseau) est dans tools/test-browser-boot.mjs.
//   node tools/test-hors-ligne.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, finish } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const FILES = new Set(JSON.parse(/const FILES = (\[[\s\S]*?\]);/.exec(read('sw.js'))[1]));

// Modules atteints depuis js/main.js, par import statique ET dynamique (import('…') à chemin fixe) : tous peuvent être demandés hors ligne.
function closure(entry) {
  const seen = new Set([entry]), q = [entry];
  for (let i = 0; i < q.length; i++) {
    const text = read(q[i]);
    const specs = [...text.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]|\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/gm)].map((m) => m[1] || m[2] || m[3]);
    for (const s of specs) {
      const f = relative(root, join(root, dirname(q[i]), s)).split('\\').join('/');
      if (!seen.has(f)) { seen.add(f); q.push(f); }
    }
  }
  return [...seen];
}

test('chaque module du jeu (imports statiques et dynamiques depuis js/main.js) est dans la copie hors ligne du service worker', () => {
  const missing = closure('js/main.js').filter((f) => !FILES.has(f));
  assert.deepEqual(missing, []);
  for (const f of ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'js/boot-guard.js', 'js/verify.js']) assert.ok(FILES.has(f), f);
  for (const f of FILES) if (/\.woff2$/.test(f)) assert.match(f, /^assets\/fonts\//);
});

test('la garde de démarrage n’efface jamais la copie hors ligne quand le réseau est coupé', () => {
  const g = read('js/boot-guard.js');
  const i = g.indexOf('function repair()'), j = g.indexOf('caches.delete', i);
  assert.ok(i > 0 && j > i);
  assert.match(g.slice(i, j), /if \(navigator\.onLine === false\) \{ say\(T\.offline, true\); return; \}/);
});

await finish('Le jeu redémarre hors ligne : tout son code est dans la copie du service worker.');
