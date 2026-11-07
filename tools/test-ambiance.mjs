// Ambiance d'un circuit (0.9.18) : moment de la journée, brume, musique ; dans le code de partage, hors signature, appliquée au décor sans le modifier. node tools/test-ambiance.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { SKY_CHOICES, FOG_CHOICES, MUSIC_CHOICES, DEFAULT_AMBIANCE, cleanAmbiance, ambianceToArray, ambianceFromArray, isDefaultAmbiance, resolveAmbiance } from '../js/ambiance.js';
import { Track, scriptTrack, b64decode } from '../js/track.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { DECORS } from '../js/themes.js';
import { readFileSync } from 'node:fs';

const mk = () => scriptTrack('t', 'start S2 R S2 L S2 C S3 finish', { decor: 'desert' });
const dataOf = (code) => JSON.parse(b64decode(code.replace(/^SHW\d:/, '')));

console.log('Données');
test('valeurs : seules les connues passent ; une ambiance par défaut ne s\'écrit pas', () => {
  assert.deepEqual(cleanAmbiance({ sky: 'night', fog: 'thick', music: 'none' }), { sky: 'night', fog: 'thick', music: 'none' });
  assert.deepEqual(cleanAmbiance({ sky: '<script>', fog: 42, music: null }), DEFAULT_AMBIANCE);
  assert.deepEqual(cleanAmbiance(null), DEFAULT_AMBIANCE); assert.deepEqual(cleanAmbiance('x'), DEFAULT_AMBIANCE);
  assert.equal(ambianceToArray(DEFAULT_AMBIANCE), null); assert.equal(ambianceToArray(undefined), null);
  assert.deepEqual(ambianceToArray({ sky: 'dawn', fog: '', music: 'menu' }), ['dawn', '', 'menu']);
  assert.deepEqual(ambianceFromArray(['dawn', '', 'menu']), { sky: 'dawn', fog: '', music: 'menu' });
  assert.deepEqual(ambianceFromArray(['nuit', 'x']), DEFAULT_AMBIANCE); assert.deepEqual(ambianceFromArray('dawn'), DEFAULT_AMBIANCE); assert.deepEqual(ambianceFromArray(undefined), DEFAULT_AMBIANCE);
  assert.ok(isDefaultAmbiance(null) && isDefaultAmbiance({}) && !isDefaultAmbiance({ fog: 'misty' }));
  assert.ok(SKY_CHOICES[0][0] === '' && FOG_CHOICES[0][0] === '' && MUSIC_CHOICES[0][0] === '');
});

console.log('Dans le circuit');
test('aller-retour par le code de partage ; un circuit sans ambiance garde EXACTEMENT son code d\'avant (aucun champ ajouté)', () => {
  const t = mk();
  assert.equal('am' in dataOf(t.encode()), false, 'rien d\'écrit par défaut');
  t.setParams({ ambiance: { sky: 'sunset', fog: 'misty', music: 'none' } });
  assert.deepEqual(dataOf(t.encode()).am, ['sunset', 'misty', 'none']);
  const back = Track.decode(t.encode());
  assert.deepEqual(back.ambiance, { sky: 'sunset', fog: 'misty', music: 'none' });
  assert.deepEqual(Track.decode(mk().encode()).ambiance, DEFAULT_AMBIANCE);
  for (const d of BUILTIN_TRACKS.slice(0, 5)) assert.equal('am' in dataOf(buildBuiltin(d).encode()), false, d.id);
});
test('hors signature : changer l\'ambiance ne change ni la clé de classement ni la vérification', () => {
  const t = mk(); t.setVerified(20.5);
  const sig = t.signature(), key = t.userKey;
  t.setParams({ ambiance: { sky: 'night', fog: 'thick', music: 'menu' } });
  assert.equal(t.signature(), sig); assert.equal(t.userKey, key); assert.equal(t.verified, true);
  assert.equal(Track.decode(t.encode()).signature(), sig);
});
test('un code venu d\'un inconnu : valeurs hostiles ignorées ; clone et remise à zéro', () => {
  const t = mk();
  const d = dataOf(t.encode()); d.am = ['"><img src=x>', 'thick', { x: 1 }];
  const code = 'SHW3:' + btoa(JSON.stringify(d));
  const back = Track.decode(code);
  assert.deepEqual(back.ambiance, { sky: '', fog: 'thick', music: '' });
  const c = back.clone(); assert.deepEqual(c.ambiance, back.ambiance); c.ambiance.fog = 'clear'; assert.equal(back.ambiance.fog, 'thick', 'le clone ne partage pas l\'objet');
  back.clear(); assert.deepEqual(back.ambiance, DEFAULT_AMBIANCE);
});

console.log('Rendu');
test('défaut : le décor est rendu tel quel ; une ambiance donne une COPIE, le décor d\'origine n\'est jamais modifié', () => {
  const theme = { sky: { top: '#112233', mid: '#334455', horizon: '#556677', sun: '#778899', stars: 0 }, fog: '#aabbcc', fogNear: 100, fogFar: 800, sunDir: [0.5, 0.5, -0.5], sunColor: '#ffeedd', sunIntensity: 2, hemi: ['#ffffff', '#000000', 1.5], hills: 40 };
  const snap = JSON.stringify(theme);
  assert.deepEqual(resolveAmbiance(theme, DEFAULT_AMBIANCE), theme);
  const night = resolveAmbiance(theme, { sky: 'night', fog: 'thick' });
  assert.equal(JSON.stringify(theme), snap, 'décor intact');
  assert.notEqual(night.sky.top, theme.sky.top); assert.ok(night.sky.stars > 0.8, 'étoiles la nuit'); assert.ok(night.sunIntensity < theme.sunIntensity, 'moins de lumière la nuit');
  assert.equal(night.hills, 40, 'le reste du décor est conservé');
  assert.ok(night.fogFar < theme.fogFar && night.fogNear < night.fogFar && night.fogNear / theme.fogNear === night.fogFar / theme.fogFar);
  assert.ok(resolveAmbiance(theme, { fog: 'clear' }).fogFar > theme.fogFar);
  assert.equal(resolveAmbiance(theme, { fog: 'clear' }).sky.top, theme.sky.top, 'la brume seule ne touche pas au ciel');
});
test('chaque décor × chaque moment de la journée : couleurs valides (#rrggbb), lumière positive, direction du soleil utilisable, brouillard cohérent', async () => {
  const src = readFileSync(new URL('../js/scenery.js', import.meta.url), 'utf8');
  const ids = Object.keys(DECORS);
  assert.equal(ids.length, 12);
  // Les décors sont dans scenery.js (THREE requis pour l'importer) : on lit leurs palettes depuis le texte, assez pour vérifier les couleurs.
  const hex = (v) => /^#[0-9a-f]{6}$/i.test(v);
  for (const [, label] of SKY_CHOICES.slice(1)) assert.ok(label);
  const themeText = src.slice(src.indexOf('const THEMES'), src.indexOf('function mulberry32'));
  const themes = [...themeText.matchAll(/^ {2}(\w+): \{\n\s+sky: \{ top: '(#\w{6})', mid: '(#\w{6})', horizon: '(#\w{6})', sun: '(#\w{6})'[^}]*\},\n\s+fog: '(#\w{6})', fogNear: (\d+), fogFar: (\d+),\n\s+sunDir: \[([^\]]+)\], sunColor: '(#\w{6})', sunIntensity: ([\d.]+),\n\s+hemi: \['(#\w{6})', '(#\w{6})', ([\d.]+)\]/gm)];
  assert.ok(themes.length >= 10, 'palettes lues : ' + themes.length);
  for (const m of themes) {
    const theme = { sky: { top: m[2], mid: m[3], horizon: m[4], sun: m[5], stars: 0 }, fog: m[6], fogNear: +m[7], fogFar: +m[8], sunDir: m[9].split(',').map(Number), sunColor: m[10], sunIntensity: +m[11], hemi: [m[12], m[13], +m[14]] };
    for (const sky of ['dawn', 'day', 'sunset', 'night']) for (const fog of ['', 'clear', 'misty', 'thick']) {
      const r = resolveAmbiance(theme, { sky, fog });
      for (const c of [r.sky.top, r.sky.mid, r.sky.horizon, r.sky.sun, r.fog, r.sunColor, r.hemi[0], r.hemi[1]]) assert.ok(hex(c), `${m[1]} ${sky} ${fog} : ${c}`);
      assert.ok(r.sunIntensity > 0 && r.hemi[2] > 0 && r.fogNear > 0 && r.fogFar > r.fogNear && r.sunDir.every(Number.isFinite) && Math.hypot(...r.sunDir) > 0.3, `${m[1]} ${sky} ${fog}`);
    }
  }
});

await finish('Tous les tests de l\'ambiance passent.');
