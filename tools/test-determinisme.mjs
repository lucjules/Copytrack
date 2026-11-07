// Déterminisme : tout le code que la vérification serveur exécute (la fermeture des imports de js/verify.js) n'utilise que des opérations dont le
// résultat est imposé par IEEE 754 (+ − × ÷ sqrt, abs, min, max, floor, round...) ou js/dmath.js. Pas de Math.sin / cos / atan2 / exp / pow / hypot,
// pas d'opérateur **, pas d'aléa ni d'horloge : node tools/test-determinisme.mjs   (npm test)
// Raisons et mesures : js/dmath.js. Si ce test échoue, remplacer l'appel par son équivalent de dmath.js (dsin, dcos, datan2, hypot2...).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, finish } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = /Math\.(sin|cos|tan|atan2|atan|asin|acos|exp|log|pow|hypot|sinh|cosh|tanh|cbrt|expm1|log1p|log2|log10|random)\b|\*\*|\bperformance\.now\b|\bcrypto\.getRandomValues\b/;
// Horloge : le jour du défi du jour (UTC) est une donnée d'entrée, pas un calcul de physique.
const CLOCK_OK = new Set(['js/verify.js', 'js/daily.js']);
const CLOCK = /\bDate\.now\b|\bnew Date\b/;

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

function closure(entry) {
  const seen = new Set(), todo = [resolve(root, entry)];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(?:import|export)\s[^;]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) todo.push(resolve(dirname(f), m[1] || m[2]));
  }
  return [...seen].map((f) => relative(root, f)).sort();
}

console.log('Code exécuté par la vérification serveur (fermeture des imports de js/verify.js)');
const files = closure('js/verify.js');
test('la fermeture contient bien la physique, les pièces, le pilote et le défi du jour', () => {
  for (const f of ['js/physics.js', 'js/physics/ribbon.js', 'js/ribbons.js', 'js/pieces.js', 'js/track.js', 'js/autopilot.js', 'js/daily.js', 'js/dmath.js', 'js/simulation.js'])
    assert.ok(files.includes(f), f + ' absent de la fermeture');
  assert.ok(!files.some((f) => /three|vendor|document|ui\.js|race\.js|main\.js/.test(f)), 'le noyau ne doit pas dépendre du rendu ni du DOM : ' + files.filter((f) => /three|vendor|ui\.js|race\.js|main\.js/.test(f)));
});
test('aucune fonction mathématique approximée par le moteur, aucun **, aucun aléa', () => {
  const bad = [];
  for (const f of files) {
    if (f === 'js/dmath.js') continue;
    strip(readFileSync(join(root, f), 'utf8')).split('\n').forEach((l, i) => { if (BANNED.test(l)) bad.push(`${f}:${i + 1}  ${l.trim().slice(0, 90)}`); });
  }
  assert.deepEqual(bad, [], 'à remplacer par js/dmath.js :\n  ' + bad.join('\n  '));
});
test('aucune horloge hors de verify.js et du défi du jour', () => {
  const bad = files.filter((f) => !CLOCK_OK.has(f) && CLOCK.test(strip(readFileSync(join(root, f), 'utf8'))));
  assert.deepEqual(bad, []);
});
test('dmath.js lui-même n\'utilise que des opérations exactes', () => {
  const s = strip(readFileSync(join(root, 'js/dmath.js'), 'utf8'));
  assert.ok(!/Math\.(sin|cos|tan|atan|asin|acos|exp|log|pow|hypot)\b/.test(s));
});

finish('Tous les tests de déterminisme passent.');
