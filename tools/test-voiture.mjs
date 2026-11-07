// Voiture personnalisée (lot 10) : validation de tout ce qui vient d'ailleurs, code partageable SHC1, dessin 16×16, intégration à l'équipement.
// node tools/test-voiture.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import {
  sanitizeCustom, sanitizePart, DEFAULT_CUSTOM, MAX_PARTS, EMPTY_DRAW, DRAW, encodeCar, decodeCar, setPixel, floodFill, drawFromRgba, nearestIndex, hasLivery, newPart, CAR_CODE_MAX,
} from '../js/custom.js';
import { sanitizeLoadout, DEFAULT_LOADOUT, itemsOf, PRESETS } from '../js/cosmetics.js';

console.log('Validation');
test('une pièce hors bornes est ramenée dans les bornes, une forme inconnue est refusée', () => {
  const p = sanitizePart({ s: 'box', x: 99, y: -5, z: 'abc', sx: 0, sy: 50, sz: NaN, ry: 100, c: 'rouge', m: 1 });
  assert.deepEqual([p.x, p.y, p.z, p.sx, p.sy, p.sz, p.ry, p.c, p.m], [1.6, 0, 0, 0.05, 2, 0.4, 105, '#ffffff', 1]);
  assert.equal(sanitizePart({ s: 'tnt' }), null); assert.equal(sanitizePart(null), null); assert.equal(sanitizePart('x'), null);
});
test('au plus 24 pièces ; les entrées invalides sont écartées ; les nombres sont propres (pas de 0.35000000000000003)', () => {
  const c = sanitizeCustom({ parts: Array.from({ length: 40 }, (_, i) => (i % 2 ? { s: 'sphere' } : { s: 'zzz' })), paint: { patA: 0.35 } });
  assert.ok(c.parts.length <= MAX_PARTS && c.parts.every((p) => p.s === 'sphere'));
  assert.equal(c.paint.patA, 0.35);
});
test('textes : majuscules, jeu de caractères et longueur bornés (aucun HTML ne passe)', () => {
  const c = sanitizeCustom({ paint: { text: 'salut<img onerror=1>', num: '12ab345', plate: 'ab-12 <b>' } });
  assert.ok(c.paint.text.startsWith('SALUTIMG'));
  assert.ok(/^[A-Z0-9 .!?-]{0,8}$/.test(c.paint.text) && !/[<>=]/.test(c.paint.text));
  assert.equal(c.paint.num, '123');
  assert.ok(/^[A-Z0-9 -]{0,8}$/.test(c.paint.plate));
});
test('couleurs, motifs, timbres : seules les valeurs connues passent ; effets bornés', () => {
  const c = sanitizeCustom({ paint: { gradC: 'red', pat: 'evil', gradDir: 'x' }, fx: { trailC: '#ABCDEF', trailLen: 99, pitch: 0, engine: 'laser', hornPitch: 9, spark: 'nope' } });
  assert.equal(c.paint.gradC, DEFAULT_CUSTOM.paint.gradC); assert.equal(c.paint.pat, 'none'); assert.equal(c.paint.gradDir, 'v');
  assert.deepEqual([c.fx.trailC, c.fx.trailLen, c.fx.pitch, c.fx.engine, c.fx.hornPitch, c.fx.spark], ['#abcdef', 2, 0.7, 'default', 1.6, '']);
});
test('le dessin doit faire exactement 256 chiffres hexadécimaux, sinon il est vide', () => {
  assert.equal(sanitizeCustom({ draw: 'zz' }).draw, EMPTY_DRAW);
  assert.equal(sanitizeCustom({ draw: 'g'.repeat(256) }).draw, EMPTY_DRAW);
  assert.equal(sanitizeCustom({ draw: 'f'.repeat(256) }).draw, 'f'.repeat(256));
});
test('équipement : sanitizeLoadout ajoute une personnalisation vide ; elle est gratuite (aucun élément payant)', () => {
  const l = sanitizeLoadout({ body: 'sport' });
  assert.deepEqual(l.custom, DEFAULT_CUSTOM);
  const l2 = sanitizeLoadout({ custom: { parts: [newPart('cone')], paint: { grad: true } } });
  assert.equal(l2.custom.parts.length, 1);
  assert.deepEqual(itemsOf(DEFAULT_LOADOUT), []);
  assert.deepEqual(itemsOf(l2), [], 'la personnalisation ne coûte rien');
  for (const p of PRESETS) assert.ok(sanitizeLoadout(p.loadout).custom, p.id);
  l.custom.parts.push(1);
  assert.equal(DEFAULT_CUSTOM.parts.length, 0, 'les valeurs par défaut ne sont jamais partagées entre équipements');
  assert.equal(sanitizeLoadout(undefined).custom.parts.length, 0);
});

console.log('Code partageable');
test('aller-retour SHC1 : tout est retrouvé, y compris les accents et les pièces', () => {
  const l = sanitizeLoadout({ body: 'muscle', color: '#112233', custom: { parts: [{ s: 'wedge', x: 0.5, y: 1.4, m: 1, c: '#ff0000' }], paint: { text: 'ZOÉ 7', grad: true }, draw: setPixel(EMPTY_DRAW, 3, 4, 5), fx: { engine: 'square' } } });
  const code = encodeCar(l);
  assert.ok(code.startsWith('SHC1:') && code.length < CAR_CODE_MAX);
  assert.deepEqual(sanitizeLoadout(decodeCar(code)), l);
});
test('codes invalides : message lisible, jamais de plantage ; un code hostile est borné par la validation', () => {
  assert.throws(() => decodeCar('SHW1:abc'), /pas un code de voiture/);
  assert.throws(() => decodeCar('SHC1:%%%'), /invalide/);
  assert.throws(() => decodeCar('SHC1:' + 'A'.repeat(CAR_CODE_MAX)), /trop long/);
  assert.throws(() => decodeCar(null), /pas un code/);
  const evil = 'SHC1:' + Buffer.from(JSON.stringify({ body: '__proto__', custom: { parts: [{ s: 'box', x: 1e9, c: '<script>' }], __proto__: { x: 1 } }, color: 'url(x)' })).toString('base64');
  const l = sanitizeLoadout(decodeCar(evil));
  assert.equal(l.body, 'buggy'); assert.equal(l.color, DEFAULT_LOADOUT.color); assert.equal(l.custom.parts[0].x, 1.6); assert.equal(l.custom.parts[0].c, '#ffffff');
  assert.equal({}.x, undefined, 'pas de pollution de prototype');
});

console.log('Dessin');
test('crayon, pot de peinture, bords, couleur la plus proche', () => {
  const d = setPixel(EMPTY_DRAW, 0, 0, 3);
  assert.equal(d[0], '3'); assert.equal(setPixel(d, 99, 0, 1), d, 'hors grille : rien');
  const filled = floodFill(EMPTY_DRAW, 5, 5, 2);
  assert.equal(filled, '2'.repeat(256));
  const wall = floodFill(setPixel(setPixel(EMPTY_DRAW, 1, 0, 9), 0, 1, 9), 0, 0, 4);
  assert.equal(wall[0], '4'); assert.equal(wall[1], '9'); assert.equal(wall[2], '0', 'le remplissage s\'arrête aux murs');
  assert.equal(nearestIndex(250, 250, 250, 255), 1); assert.equal(nearestIndex(10, 10, 20, 255), 2); assert.equal(nearestIndex(255, 0, 0, 10), 0, 'presque transparent');
  const rgba = new Uint8ClampedArray(DRAW * DRAW * 4); rgba.fill(255);
  assert.equal(drawFromRgba(rgba), '1'.repeat(256));
});
test('hasLivery : faux tant que rien n\'est dessiné ni écrit', () => {
  assert.equal(hasLivery(DEFAULT_CUSTOM), false);
  assert.equal(hasLivery(sanitizeCustom({ paint: { num: '7' } })), true);
});

finish('Tous les tests de la voiture personnalisée passent.');
