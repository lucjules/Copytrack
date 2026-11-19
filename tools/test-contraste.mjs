// Contraste des couleurs de l'interface (phase 3 de la 1.0, WCAG 2.1) : pour chaque thème (js/uitheme.js) et sur chaque fond (page, panneau, panneau
// secondaire), le texte, le texte secondaire, les liens, les messages d'erreur et de réussite atteignent 4,5:1 (texte courant), l'accent 3:1 (éléments
// d'interface). Les couleurs de base sont celles de :root dans css/style.css.   node tools/test-contraste.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { THEMES } from '../js/uitheme.js';

const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
const BASE = Object.fromEntries([...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
export function parse(c) {
  let m;
  if ((m = /^#([0-9a-f]{6})$/i.exec(c))) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  if ((m = /^#([0-9a-f]{3})$/i.exec(c))) return [...m[1]].map((h) => parseInt(h + h, 16)).concat(1);
  if ((m = /rgba?\(([^)]+)\)/.exec(c))) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
}
const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
const lum = (c) => { const l = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
export const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const NEEDS = { '--text': 4.5, '--muted': 4.5, '--cyan': 4.5, '--bad': 4.5, '--good': 4.5, '--amber': 4.5, '--pink': 3 };
for (const [name, th] of Object.entries(THEMES)) {
  test(`thème « ${th.label} » : texte, secondaire, liens, erreurs et réussites ≥ 4,5:1, accent ≥ 3:1, sur la page et les panneaux`, () => {
    const v = { ...BASE, ...th.vars }, bg = parse(v['--bg']);
    const fonds = [bg, over(parse(v['--panel']), bg), over(parse(v['--panel-2']), bg)];
    const bad = [];
    for (const [k, min] of Object.entries(NEEDS)) {
      const f = parse(v[k]);
      assert.ok(f, `${name} ${k} illisible`);
      const r = Math.min(...fonds.map((b) => ratio(f, b)));
      if (r < min) bad.push(`${k} ${r.toFixed(2)}:1 (< ${min})`);
    }
    assert.deepEqual(bad, []);
  });
}
test('la taille de l’interface (texte compris) se règle de 85 à 130 % (Paramètres › Accessibilité)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="opt-ui" min="0\.85" max="1\.3"/);
  assert.match(css, /zoom: var\(--ui-scale\)/);
});

await finish('Les couleurs de chaque thème sont lisibles (contraste WCAG).');
