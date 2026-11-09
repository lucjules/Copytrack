// Modifie des champs d'un circuit de js/tracks.js SANS toucher à son commentaire ni aux autres champs :
//   import { patchTracks } from './patch-circuit.mjs';  patchTracks({ eclats: { script: '...', medals: {...}, goal: {...}, opts: {...}, pilot: {...} } });
// (l'injecteur tools/inject.mjs réécrit toute l'entrée ; celui-ci ne change que les lignes concernées).
import { readFileSync, writeFileSync } from 'node:fs';

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const obj = (o) => '{ ' + Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'object' && v ? obj(v) : typeof v === 'string' ? q(v) : v}`).join(', ') + ' }';

export function patchTracks(patches, file = new URL('../js/tracks.js', import.meta.url)) {
  let s = readFileSync(file, 'utf8');
  for (const [id, f] of Object.entries(patches)) {
    const re = new RegExp("(  \\{\\n(?:    //[^\\n]*\\n)*    id: '" + id + "',[\\s\\S]*?\\n  \\},\\n)");
    const m = re.exec(s);
    if (!m) throw new Error('entrée introuvable : ' + id);
    let e = m[1];
    if (f.script != null) e = e.replace(/(\n    script: )'(?:[^'\\]|\\.)*',/, (_, a) => a + q(f.script) + ',');
    if (f.medals) e = e.replace(/(\n    medals: )\{[^}]*\},/, (_, a) => a + obj(f.medals) + ',');
    if (f.goal) e = e.replace(/(\n    goal: )\{[^}]*\},/, (_, a) => a + obj(f.goal) + ',');
    if (f.obst) e = e.replace(/(\n    obst: )\[[^\n]*\],/, (_, a) => a + '[' + f.obst.map(obj).join(', ') + '],');
    for (const k of ['opts', 'pilot', 'params']) {
      if (f[k] === undefined) continue;
      // champs sur la ligne « opts: {...}, pilot: {...}, » (ou isolés)
      const has = new RegExp('\\n    (?:[a-z]+: \\{[^}]*\\}, )*' + k + ': \\{[^}]*\\}');
      if (has.test(e)) e = e.replace(new RegExp(k + ': \\{[^}]*\\}'), k + ': ' + obj(f[k]));
      else if (k === 'pilot' || k === 'params') e = e.replace(/\n    script: /, (m) => '\n    ' + k + ': ' + obj(f[k]) + ',' + m);      // champ absent : ajouté avant le script
      else throw new Error(`${id} : champ ${k} absent, à ajouter à la main`);
    }
    s = s.replace(m[1], () => e);
  }
  writeFileSync(file, s);
}
