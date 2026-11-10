// Lance toute la suite de tests : node tools/run-tests.mjs [filtre]   (npm test)
//
// Chaque fichier tools/test-*.mjs tourne dans son propre processus, en parallèle ; leurs sorties sont affichées dans l'ordre alphabétique, puis un
// bilan. Contrairement à l'ancienne chaîne de `&&`, un échec n'arrête pas les autres : on voit tout ce qui casse d'un seul coup.
//   node tools/run-tests.mjs physique     ne lance que les fichiers dont le nom contient « physique »
//   node tools/run-tests.mjs --list       liste les fichiers
// Le test navigateur (test-browser.mjs, qui demande Playwright et Chromium) se lance à part : npm run test:browser.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith('--'));
const files = readdirSync(dir).filter((f) => /^test-.*\.mjs$/.test(f) && !f.startsWith('test-browser')).sort();
if (args.includes('--list')) { console.log(files.join('\n')); process.exit(0); }

// Contrôles qui ne sont pas des suites de tests : [fichier, muet ?]. « check-generated » réécrit sw.js un instant : il passe seul, avant le reste.
const SERIAL = [['check-generated.mjs', false]];
const PARALLEL_CHECKS = [['audit-pieces.mjs', true], ['phys-fingerprint.mjs', false], ['check-docs.mjs', false], ['sim.mjs', 'summary']];

function run(file, quiet) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [join(dir, file)], { cwd: join(dir, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ file, code, out, quiet, ms: Date.now() - t0 }));
  });
}

async function pool(jobs, limit) {
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; results[i] = await jobs[i](); }
  }));
  return results;
}

const wanted = (f) => (!filter || f.includes(filter)) && existsSync(join(dir, f));
const t0 = Date.now();
const all = [];
for (const [f, q] of SERIAL) if (wanted(f)) all.push(await run(f, q));
const jobs = [
  ...files.filter(wanted).map((f) => () => run(f, false)),
  ...PARALLEL_CHECKS.filter(([f]) => wanted(f)).map(([f, q]) => () => run(f, q)),
];
all.push(...await pool(jobs, Math.max(2, availableParallelism())));

let ok = 0, bad = 0;
const failedFiles = [];
for (const r of all.sort((a, b) => a.file.localeCompare(b.file))) {
  const lines = r.out.split('\n');
  const nOk = lines.filter((l) => /^ {2}ok {3}/.test(l)).length;
  const nFail = lines.filter((l) => /^ {2}FAIL /.test(l)).length + (r.code !== 0 && !lines.some((l) => /^ {2}FAIL /.test(l)) ? 1 : 0);
  // Un fichier qui sort en code 0 sans AUCUNE vérification (ni ligne « ok », ni « OK » final) n'a rien testé : c'est un échec, pas un succès silencieux.
  const nothing = r.code === 0 && nOk === 0 && r.quiet !== true && !/\bOK\b/.test(r.out);      // (les contrôles muets par contrat, comme audit-pieces, n'affichent rien quand tout va bien : leur code de sortie fait foi)
  ok += nOk; bad += nFail + (nothing ? 1 : 0);
  if (nothing) { r.out += '\n  FAIL ' + r.file + ' : aucune vérification exécutée (code 0 mais ni « ok » ni « OK »)'; failedFiles.push(r.file); }
  console.log(`\n▶ ${r.file}  (${(r.ms / 1000).toFixed(1)} s, ${nOk} ok${nFail ? `, ${nFail} échec(s)` : ''})`);
  if (r.quiet === true && r.code === 0) continue;
  if (r.quiet === 'summary' && r.code === 0) { const n = lines.filter((l) => /\bOK\b/.test(l)).length; console.log(`  ${n} circuits terminés par le pilote automatique`); continue; }
  console.log(r.out.trimEnd());
  if (r.code !== 0) failedFiles.push(r.file);
}
console.log(`\n${'='.repeat(60)}\n${all.length} fichiers, ${ok} vérifications réussies, ${bad} échec(s) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (failedFiles.length || bad) { console.log('À regarder : ' + [...new Set(failedFiles)].join(', ')); process.exit(1); }
