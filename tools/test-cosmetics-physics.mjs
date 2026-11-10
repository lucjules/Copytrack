// GARANTIE : aucune personnalisation de véhicule (carrosserie, peinture, dessins, ornements, thèmes, roues, finitions, LED, traînées, pièces libres…) ne modifie la physique :
// motricité, puissance, direction, adhérence, masse, freinage, collisions. node tools/test-cosmetics-physics.mjs   (npm test)
// Trois preuves : (1) STRUCTURELLE : le code de la physique, de la course simulée et de la vérification serveur n'importe, même indirectement, AUCUN module de personnalisation ;
// (2) TEXTUELLE : ces fichiers ne parlent ni d'équipement, ni de carrosserie, ni de cosmétique ; (3) DYNAMIQUE : on construit TOUTES les variantes de véhicule (chaque élément du
// catalogue, tous les préréglages et thèmes), puis une course simulée donne EXACTEMENT les mêmes nombres qu'avant (aucun état global touché).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { test, finish } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const js = (p) => join(root, 'js', p);

// ---- 1. graphe des imports ---------------------------------------------------------------------------------------------------------------------------------------
const importsOf = (file) => {
  const src = readFileSync(file, 'utf8');
  const out = [];
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]/g)) out.push(resolve(dirname(file), m[1]));
  for (const m of src.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) out.push(resolve(dirname(file), m[1]));
  return out;
};
const closure = (entries) => {
  const seen = new Set(), todo = [...entries];
  while (todo.length) { const f = todo.pop(); if (seen.has(f)) continue; seen.add(f); for (const d of importsOf(f)) if (d.endsWith('.js') && !d.includes('/vendor/')) todo.push(d); }
  return seen;
};
const CORE = ['physics.js', 'simulation.js', 'raceLogic.js', 'verify.js', 'replay.js', 'dmath.js'].map(js);
const FORBIDDEN = ['cosmetics.js', 'custom.js', 'customCar.js', 'carModel.js', 'garage.js', 'garage/studio.js', 'rewards.js', 'profile.js', 'storage.js', 'cloudsave.js'].map(js);

console.log('Preuve structurelle');
test('le code de la physique, de la course simulée et de la vérification serveur n\'importe AUCUN module de personnalisation (ni profil, ni stockage), même indirectement', () => {
  const dep = closure(CORE);
  assert.ok(dep.size > 15, 'le graphe est bien exploré (' + dep.size + ' fichiers)');
  const bad = FORBIDDEN.filter((f) => dep.has(f)).map((f) => f.replace(root + '/', ''));
  assert.deepEqual(bad, [], 'modules de personnalisation atteints par la physique : ' + bad.join(', '));
});
test('même chose pour tout le dossier js/physics/ et js/sim/ (aucun fichier de physique ne touche à l\'équipement)', () => {
  const files = ['physics', 'sim'].flatMap((d) => { try { return readdirSync(js(d)).filter((f) => f.endsWith('.js')).map((f) => js(d + '/' + f)); } catch { return []; } });
  assert.ok(files.length >= 5);
  const dep = closure(files);
  const bad = FORBIDDEN.filter((f) => dep.has(f)).map((f) => f.replace(root + '/', ''));
  assert.deepEqual(bad, [], bad.join(', '));
});
console.log('Preuve textuelle');
test('aucun fichier de la physique ne lit d\'équipement : ni « loadout », ni « cosmetic », ni carrosserie', () => {
  const files = [...closure(CORE)].filter((f) => /\/(physics|sim)\//.test(f) || /\/(physics|simulation|raceLogic|verify|replay)\.js$/.test(f));
  const bad = [];
  for (const f of files) { const t = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); if (/loadout|cosmetic|carModel|BODIES|\.body\s*===|sanitizeLoadout/i.test(t)) bad.push(f.replace(root + '/', '')); }
  assert.deepEqual(bad, [], 'à examiner : ' + bad.join(', '));
});

// ---- 2. dynamique : tout construire, puis rejouer ---------------------------------------------------------------------------------------------------------------
// Décor minimal pour construire les modèles 3D sous Node (une seule texture de lueur utilise un canvas).
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
const { Simulation } = await import('../js/simulation.js');
const { scriptTrack } = await import('../js/track.js');
const { CAR } = await import('../js/physics/specs.js').catch(() => ({ CAR: null }));
const { CATALOG, PRESETS, sanitizeLoadout, DEFAULT_LOADOUT, THEMES, PALETTES } = await import('../js/cosmetics.js');
const { createCar } = await import('../js/carModel.js');

function trace(track) {
  const sim = new Simulation(track); sim.start();
  const out = [];
  for (let i = 0; i < 1500; i++) {
    sim.step({ throttle: true, brake: i % 400 > 370, steer: Math.sin(i / 60) * 0.7 });
    const P = sim.phys;
    if (i % 25 === 0) out.push([P.pos.x, P.pos.y, P.pos.z, P.vel.x, P.vel.y, P.vel.z, P.yaw].map((v) => v.toString()).join(','));
  }
  return out.join('|');
}
const tracks = () => [scriptTrack('a', 'start S6 C S6 R S4 finish'), scriptTrack('b', 'start S4 U S3 D S4 TW S3 finish')];

console.log('Preuve dynamique');
test('chaque élément du catalogue, chaque préréglage et thème : la voiture se construit sans erreur (voiture, moto, bateau, deltaplane)', () => {
  const variants = [{}];
  for (const [cat, items] of Object.entries(CATALOG)) for (const it of items) variants.push({ [cat]: it.id });
  for (const pr of PRESETS) variants.push(pr.loadout);
  let n = 0;
  for (const v of variants) {
    const car = createCar(sanitizeLoadout(v));
    let meshes = 0; car.group.traverse((o) => { if (o.isMesh) { meshes++; const p = o.geometry.attributes.position; assert.ok(p && p.count > 0, 'géométrie vide'); } });
    assert.ok(meshes > 20, 'la voiture a des formes (' + JSON.stringify(v) + ')');
    for (const kind of ['car', 'moto', 'boat', 'glider']) car.setVehicle(kind, true);
    car.dispose && car.dispose();
    n++;
  }
  assert.ok(n > 150, n + ' variantes construites');
});
test('le thème, la palette et le préréglage ne désignent que des éléments qui existent ; chaque thème a au moins deux préréglages et une palette', () => {
  const has = (cat, id) => (CATALOG[cat] || []).some((x) => x.id === id);
  for (const pr of PRESETS) for (const [k, id] of Object.entries(pr.loadout)) if (k in CATALOG) assert.ok(has(k, id), `préréglage ${pr.id} : ${k} « ${id} » n'existe pas`);
  for (const th of THEMES) {
    assert.ok(PRESETS.filter((p) => p.theme === th.id).length >= 2, 'préréglages du thème ' + th.id);
    assert.ok(PALETTES.some((p) => p.theme === th.id), 'palette du thème ' + th.id);
    assert.ok(Object.values(CATALOG).some((a) => a.some((x) => x.theme === th.id)), 'éléments du thème ' + th.id);
  }
  for (const pal of PALETTES) assert.ok(pal.colors.length === 3 && pal.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)));
});
test('la physique est INCHANGÉE par toute personnalisation : même course, mêmes nombres, avant et après avoir construit tous les véhicules', () => {
  const before = tracks().map(trace);
  const carSnap = CAR ? JSON.stringify(CAR) : '';
  for (const [cat, items] of Object.entries(CATALOG)) for (const it of items) createCar(sanitizeLoadout({ ...DEFAULT_LOADOUT, [cat]: it.id }));
  for (const pr of PRESETS) createCar(sanitizeLoadout(pr.loadout));
  const after = tracks().map(trace);
  assert.deepEqual(after, before, 'une personnalisation a changé la physique');
  if (CAR) assert.equal(JSON.stringify(CAR), carSnap, 'les constantes de la voiture (CAR) ont bougé');
  assert.ok(before[0].length > 500, 'la course simulée a bien produit une trace');
});
test('un équipement hors catalogue (code partagé trafiqué) est ramené à l\'équipement par défaut : jamais d\'identifiant inconnu jusqu\'au modèle', () => {
  const l = sanitizeLoadout({ body: '__proto__', ornament: 'nope', led: 42, decal: { x: 1 }, wheels: null, finish: 'chrome', color: 'rouge' });
  assert.equal(l.body, DEFAULT_LOADOUT.body); assert.equal(l.ornament, 'none'); assert.equal(l.led, 'none'); assert.equal(l.finish, 'chrome'); assert.equal(l.color, DEFAULT_LOADOUT.color);
  createCar(l);
});

await finish('Aucune personnalisation ne modifie la physique : prouvé.');
