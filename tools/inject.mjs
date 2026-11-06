// Écrit des définitions de circuits dans js/tracks.js, à la place des entrées de même id (l'ordre du fichier, donc de la carrière, ne change pas).
//   node tools/inject.mjs defs.json
// Chaque définition : { id, name, decor, difficulty, profil, goal, opts?, params?, pilot?, laps?, comment?, script, medals }.
import { readFileSync, writeFileSync } from 'node:fs';

const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const obj = (o) => '{ ' + Object.entries(o).map(([k, v]) => `${/^[a-z_][\w]*$/i.test(k) ? k : q(k)}: ${typeof v === 'object' && v ? (Array.isArray(v) ? '[' + v.map((x) => (typeof x === 'object' ? obj(x) : JSON.stringify(x))).join(', ') + ']' : obj(v)) : typeof v === 'string' ? q(v) : v}`).join(', ') + ' }';

export function format(d) {
  const L = ['  {'];
  for (const line of String(d.comment || '').split('\n').filter(Boolean)) L.push('    // ' + line);
  L.push(`    id: ${q(d.id)}, name: ${q(d.name)}, decor: ${q(d.decor)}, difficulty: ${d.difficulty}, profil: ${q(d.profil)},`);
  if (d.appris) L.push(`    appris: ${q(d.appris)},`);
  L.push(`    goal: ${obj(d.goal)},`);
  const extra = [];
  if (d.opts) extra.push(`opts: ${obj(d.opts)}`);
  if (d.params) extra.push(`params: ${obj(d.params)}`);
  if (d.pilot) extra.push(`pilot: ${obj(d.pilot)}`);
  if (d.laps) extra.push(`laps: ${d.laps}`);
  if (extra.length) L.push('    ' + extra.join(', ') + ',');
  if (d.obst) L.push(`    obst: [${d.obst.map(obj).join(', ')}],`);
  L.push(`    script: ${q(d.script)},`);
  L.push(`    medals: ${obj(d.medals)},`);
  if (d.medalsBy) L.push(`    medalsBy: ${q(d.medalsBy)},`);
  L.push('  },');
  return L.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('inject.mjs')) {
  const defs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const p = new URL('../js/tracks.js', import.meta.url);
  let s = readFileSync(p, 'utf8');
  for (const d of defs) {
    const re = new RegExp("  \\{\\n(?:    //[^\\n]*\\n)*    id: '" + d.id + "',[\\s\\S]*?\\n  \\},\\n");
    if (!re.test(s)) throw new Error('entrée introuvable : ' + d.id);
    s = s.replace(re, () => format(d));
  }
  writeFileSync(p, s);
  console.log(defs.length + ' circuits écrits dans js/tracks.js');
}
