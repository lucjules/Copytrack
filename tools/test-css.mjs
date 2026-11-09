// Intégrité des feuilles de style : node tools/test-css.mjs   (npm test)
// Une fusion de branches avait laissé dans css/style.css un marqueur de conflit (« ======= ») et un commentaire jamais fermé : la règle qui suivait
// le marqueur et la fin du fichier étaient ignorées par les navigateurs, sans aucune erreur visible. Ce test attrape ce genre de reste.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test, finish } from './harness.mjs';

const dir = new URL('../css/', import.meta.url);
console.log('Feuilles de style');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
  const s = readFileSync(new URL(f, dir), 'utf8');
  test(`${f} : aucun marqueur de conflit de fusion`, () => {
    const bad = s.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /^(<{7}|={7}|>{7})(\s|$)/.test(l));
    assert.deepEqual(bad, [], 'lignes : ' + bad.map(([i]) => i).join(', '));
  });
  test(`${f} : commentaires fermés, accolades équilibrées`, () => {
    let open = 0, last = 0;
    for (const m of s.matchAll(/\/\*|\*\//g)) { if (m[0] === '/*') { assert.equal(open, 0, 'commentaire imbriqué, ligne ' + (s.slice(0, m.index).split('\n').length)); open = 1; last = m.index; } else open = 0; }
    assert.equal(open, 0, 'commentaire jamais fermé depuis la ligne ' + (s.slice(0, last).split('\n').length));
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
    assert.equal((code.match(/\{/g) || []).length, (code.match(/\}/g) || []).length, 'accolades');
  });
}
await finish('Toutes les feuilles de style sont saines.');
