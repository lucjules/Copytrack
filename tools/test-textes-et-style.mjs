// Textes affichés (version, turbo, effet de vitesse, tutoriel), vérificateur de l'éditeur (checkTrack) et feuille de style (classes et identifiants vivants) : node tools/test-textes-et-style.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, finish } from './harness.mjs';

const { VERSION } = await import('../js/version.js');
const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { checkTrack } = await import('../js/editorTools.js');
const { paramText } = await import('../js/pieces.js');
const { scriptTrack } = await import('../js/track.js');

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
// Le code de l'application est réparti entre js/main.js et js/app/*.js (familles de méthodes) : ces contrôles de texte lisent l'ensemble.
const readApp = () => ['js/main.js', ...readdirSync(new URL('../js/app', import.meta.url)).map((f) => 'js/app/' + f)].map(read).join('\n');
// Le code de l'éditeur est réparti entre js/editor.js et js/editor/*.js (familles de méthodes) : ces contrôles de texte lisent l'ensemble.
const readEditor = () => ['js/editor.js', ...readdirSync(new URL('../js/editor', import.meta.url)).map((f) => 'js/editor/' + f)].map(read).join('\n');
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'vendor') walk(p, out); } else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

console.log('Version et textes');
test('la version affichée suit package.json (bêta 0.9.x)', () => {
  const v = JSON.parse(read('package.json')).version;
  assert.match(v, /^0\.9\.\d+$/);
  assert.equal(VERSION, 'bêta ' + v);
});
test('le texte du turbo annonce un gain (≈ +N km/h), pas une vitesse visée : le moteur n’a plus de plafond', () => {
  assert.match(paramText('boost', 100), /^≈ \+\d+ km\/h$/);
});
test('le réglage « effet de vitesse » annonce un seuil réaliste (220 km/h) et race.js l’utilise', () => {
  assert.match(read('index.html'), /au-delà de 220 km\/h/);
  assert.match(read('js/race.js'), /fwdSpeed\) - 62\) \/ 38/);
});
test('le tutoriel parle des murs et de la vitesse', () => {
  const m = readApp();
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
  const e = readEditor();
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
  const e = readEditor();
  assert.match(e, /pal-fold/);
  assert.match(e, /copytrack\.edFold/);
  assert.match(css, /\.ed-palette\.folded/);
});

await finish('Tous les tests des textes et du style passent.');
