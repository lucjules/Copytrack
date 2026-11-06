// Tests de la bêta 0.9.5 (audit : problèmes visibles en jeu, texte, CSS, vérificateur) : node tools/test-v095.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
function test(name, fn) { try { fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); } }

const { VERSION } = await import('../js/constants.js');
const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { checkTrack } = await import('../js/editorTools.js');
const { paramText } = await import('../js/pieces.js');
const { scriptTrack } = await import('../js/track.js');

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'vendor') walk(p, out); } else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

console.log('Version et textes');
test('version 0.9.5 (constants.js et package.json)', () => {
  assert.equal(VERSION, 'bêta 0.9.5');
  assert.equal(JSON.parse(read('package.json')).version, '0.9.5');
});
test('le texte du turbo dit « jusqu’à » (vitesse visée, jamais garantie)', () => {
  assert.match(paramText('boost', 100), /^jusqu'à \d+ km\/h$/);
});
test('le réglage « effet de vitesse » annonce un seuil réaliste (220 km/h) et race.js l’utilise', () => {
  assert.match(read('index.html'), /au-delà de 220 km\/h/);
  assert.match(read('js/race.js'), /fwdSpeed\) - 62\) \/ 38/);
});
test('le tutoriel parle des murs et de la vitesse', () => {
  const m = read('js/main.js');
  assert.match(m, /<b>Murs<\/b>/);
  assert.match(m, /<b>Vitesse<\/b>/);
});

console.log('Vérificateur de l’éditeur (checkTrack)');
test('aucun circuit intégré ne déclenche d’erreur (plaques de gravité inversée comprises)', () => {
  const bad = [];
  for (const b of BUILTIN_TRACKS) {
    const errs = checkTrack(buildBuiltin(b)).filter((i) => i.level === 'error');
    if (errs.length) bad.push(b.id + ' : ' + errs[0].msg);
  }
  assert.deepEqual(bad, []);
});
test('une extrémité libre est signalée, avec sa pièce', () => {
  const tr = scriptTrack('t', 'start S2 finish', { l: 2 });
  tr.tiles.pop();        // plus d'arrivée : le bout de la route ne mène nulle part
  const issues = checkTrack(tr);
  assert.ok(issues.some((i) => i.tile && /extrémité/.test(i.msg)), JSON.stringify(issues.map((i) => i.msg)));
});
test('l’éditeur branche checkTrack et _markIssues (plus de code mort)', () => {
  const e = read('js/editor.js');
  assert.match(e, /checkTrack\(this\.track\)/);
  assert.match(e, /this\._markIssues\(this\._tileIssues\(\)\)/);
});

console.log('Feuille de style');
const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const sources = [read('index.html'), ...walk(new URL('../js', import.meta.url).pathname).map((f) => readFileSync(f, 'utf8'))].join('\n');
test('aucune classe ni identifiant CSS sans élément correspondant', () => {
  const heads = css.replace(/\{[^{}]*\}/g, '{}');
  const classes = new Set([...heads.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
  const ids = new Set([...heads.matchAll(/#([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
  const dead = [...classes].filter((c) => !sources.includes(c)).concat([...ids].filter((c) => !sources.includes(c)).map((c) => '#' + c));
  assert.deepEqual(dead, []);
});
test('« .chip » n’a plus de règle globale : HUD (#hud) et éditeur (#editor) ont chacun la leur', () => {
  const rules = [...css.matchAll(/(^|\})\s*([^{}]*\.chip[^{}]*)\{/g)].map((m) => m[2].trim());
  const bare = rules.filter((r) => r.split(',').some((s) => /^\.chip\b/.test(s.trim()) && !/\.chip(\.dim|\[hidden\]|\.chk|\s+\.th-sw)/.test(s.trim()) && s.trim() === '.chip'));
  assert.deepEqual(bare, []);
  assert.ok(css.includes('#hud .chip'));
});
test('le bouton « + Nouveau » ne passe plus sous le compteur de pièces', () => {
  assert.match(css, /#mytracks \.screen-head[^{]*\{[^}]*padding-right/);
});
test('listes déroulantes d’options : jamais plus larges que l’écran', () => {
  assert.match(css, /\.form select \{[^}]*max-width: 100%/);
});
test('palette de l’éditeur repliable, choix mémorisé', () => {
  const e = read('js/editor.js');
  assert.match(e, /pal-fold/);
  assert.match(e, /copytrack\.edFold/);
  assert.match(css, /\.ed-palette\.folded/);
});

console.log(failures ? `\n${failures} test(s) en échec.` : '\nTous les tests de la bêta 0.9.5 passent.');
process.exit(failures ? 1 : 0);
