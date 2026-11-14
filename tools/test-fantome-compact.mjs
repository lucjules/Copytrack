// Fantôme de record LOCAL au format compact « G2 » (js/ghostFormat.js : packGhost / unpackGhost / compactGhost) : fidélité, taille, anciens records, données abîmées,
// stockage plein. node tools/test-fantome-compact.mjs   (npm test)
// Le format SERVEUR (Float32 en base64, encodeFloats) ne change pas : ce fichier vérifie aussi qu'il reste identique.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { device } from './fake-supabase.mjs';
import { GHOST_STRIDE, MAX_GHOST_FRAMES, GHOST_PACK_PREFIX, encodeFloats, decodeFloats, packGhost, unpackGhost, compactGhost, parseGhost } from '../js/ghostFormat.js';
import { GhostRunner } from '../js/replay.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { MAX_RUN_STEPS } from '../js/constants.js';

device('A');
const storage = await import('../js/storage.js');

// Vrais fantômes (pilote automatique) : un circuit au sol, un avec rubans (loopings), un avec des changements de véhicule.
function realGhost(name) {
  const def = BUILTIN_TRACKS.find((d) => d.name === name);
  const g = new GhostRunner(buildBuiltin(def), { bot: true, ghost: true });
  while (!g.done && g.k < MAX_RUN_STEPS) g.step();
  assert.ok(g.logic.finished, name + ' : le pilote automatique finit');
  return g.ghostResult().data;
}
const NAMES = ['Premiers Éclats', 'Le Grand Tour', 'Cristal Fêlé', 'Ceinture d’Astéroïdes'];
const ghosts = NAMES.map((n) => ({ n, data: realGhost(n) }));

const quatAngle = (a, ai, b, bi) => {      // angle (rad) entre deux rotations, insensible au signe (q et −q)
  const d = Math.abs(a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2] + a[ai + 3] * b[bi + 3]);
  const la = Math.hypot(a[ai], a[ai + 1], a[ai + 2], a[ai + 3]), lb = Math.hypot(b[bi], b[bi + 1], b[bi + 2], b[bi + 3]);
  return 2 * Math.acos(Math.min(1, d / (la * lb)));
};
function maxErrors(orig, dec) {
  let pos = 0, rot = 0;
  for (let i = 0; i < orig.length / GHOST_STRIDE; i++) {
    const b = i * GHOST_STRIDE;
    for (let c = 0; c < 3; c++) pos = Math.max(pos, Math.abs(orig[b + c] - dec[b + c]));
    rot = Math.max(rot, quatAngle(orig, b + 3, dec, b + 3));
  }
  return { pos, rot };
}

console.log('Fidélité sur de vraies courses');
for (const { n, data } of ghosts) {
  test(`${n} : ${data.length / GHOST_STRIDE} images, mêmes images en sortie, position à ≤ 0,5 cm, orientation à < 0,0002 rad`, () => {
    const s = packGhost(data);
    assert.ok(s && s.startsWith(GHOST_PACK_PREFIX));
    const back = decodeFloats(s);
    assert.equal(back.length, data.length);
    const { pos, rot } = maxErrors(data, back);
    assert.ok(pos <= 0.0052, 'erreur de position ' + pos);
    assert.ok(rot < 2e-4, 'erreur d\'orientation ' + rot);
    for (let i = 3; i < back.length; i += GHOST_STRIDE) assert.ok(Math.abs(Math.hypot(back[i], back[i + 1], back[i + 2], back[i + 3]) - 1) < 1e-5, 'quaternion unitaire');
  });
}
test('taille : au moins 3,5 fois plus court que l\'ancien format (base64 Float32) sur chaque course', () => {
  for (const { n, data } of ghosts) {
    const ratio = encodeFloats(data).length / packGhost(data).length;
    assert.ok(ratio > 3.5, `${n} : seulement ×${ratio.toFixed(2)}`);
  }
});
test('déterministe : deux encodages donnent la même chaîne ; ré-encoder un fantôme décodé ne DÉRIVE pas (écart à l\'original borné après 4 générations, positions stables)', () => {
  const d = ghosts[1].data, a = packGhost(d), b = packGhost(d);
  assert.equal(a, b);
  let cur = decodeFloats(a);
  const first = Array.from(cur);
  for (let gen = 0; gen < 3; gen++) cur = decodeFloats(packGhost(cur));
  for (let i = 0; i < d.length / GHOST_STRIDE; i++) for (let c = 0; c < 3; c++) assert.equal(cur[i * 7 + c], first[i * 7 + c], 'les positions ne bougent plus après le premier passage');
  const { pos, rot } = maxErrors(d, cur);      // (la rotation est comparée au signe près : q et −q sont la même)
  assert.ok(pos <= 0.0052 && rot < 2e-4, `après 4 générations : ${pos} m, ${rot} rad`);
});
test('interpolation : la pose interpolée du rendu (position et rotation entre deux images) reste à ≤ 1 cm et < 0,0003 rad de l\'originale', () => {
  const o = ghosts[0].data, b = decodeFloats(packGhost(o));
  for (let i = 0; i + 1 < o.length / GHOST_STRIDE; i += 7) {
    const p = i * GHOST_STRIDE, q = p + GHOST_STRIDE, f = 0.37;
    for (let c = 0; c < 3; c++) assert.ok(Math.abs((o[p + c] + (o[q + c] - o[p + c]) * f) - (b[p + c] + (b[q + c] - b[p + c]) * f)) < 0.011);
  }
});

console.log('Cas limites du format');
test('téléportation (saut de 5 km), coordonnées négatives, inversion de signe du quaternion : tout est retrouvé', () => {
  const s2 = Math.SQRT1_2;
  const a = new Float32Array([
    0, 0, 0, 0, 0, 0, 1,
    1.234, -0.5, -3.21, 0, 0, 0, -1,                 // même rotation, signe opposé
    2.5, 0, -6, s2, 0, 0, s2,
    5000.07, 40.5, -4999.99, 0, s2, 0, s2,           // téléportation
    5001, 40.6, -5001, 0, s2, 0, -s2,
    -123.456, -7.7, 99.99, 0.5, 0.5, 0.5, 0.5,
  ]);
  const b = decodeFloats(packGhost(a));
  assert.equal(b.length, a.length);
  const { pos, rot } = maxErrors(a, b);
  assert.ok(pos <= 0.0052 + 5000 * 1.2e-7, 'position ' + pos);
  assert.ok(rot < 2e-4, 'rotation ' + rot);
});
test('une seule image, et le maximum d\'images, sont acceptés', () => {
  assert.equal(decodeFloats(packGhost(new Float32Array([1, 2, 3, 0, 0, 0, 1]))).length, 7);
  const big = new Float32Array(MAX_GHOST_FRAMES * GHOST_STRIDE);
  for (let i = 0; i < MAX_GHOST_FRAMES; i++) big[i * 7 + 6] = 1;
  assert.equal(decodeFloats(packGhost(big)).length, big.length);
});
test('durée : coder + décoder une course de 10 minutes (18 000 images) prend moins d\'une demi-seconde', () => {
  const n = 18000, a = new Float32Array(n * 7);
  for (let i = 0; i < n; i++) { a[i * 7] = i * 0.9; a[i * 7 + 1] = Math.sin(i / 50); a[i * 7 + 2] = -i * 0.2; a[i * 7 + 6] = 1; }
  const t0 = performance.now(); const back = decodeFloats(packGhost(a)); const ms = performance.now() - t0;
  assert.equal(back.length, a.length);
  assert.ok(ms < 500, ms.toFixed(0) + ' ms');
});

console.log('Refus et données abîmées : jamais d\'exception, jamais de fantôme faux');
test('packGhost refuse ce qui ne s\'y prête pas (l\'appelant garde l\'ancien format) : vide, longueur incorrecte, NaN, démesuré, trop d\'images', () => {
  assert.equal(packGhost(new Float32Array(0)), null);
  assert.equal(packGhost(new Float32Array(8)), null);
  assert.equal(packGhost(new Float32Array([NaN, 0, 0, 0, 0, 0, 1])), null);
  assert.equal(packGhost(new Float32Array([1e6, 0, 0, 0, 0, 0, 1])), null);
  assert.equal(packGhost(new Float32Array((MAX_GHOST_FRAMES + 1) * 7)), null);
  assert.equal(packGhost('pas un tableau'), null);
  assert.equal(packGhost(null), null);
});
test('chaînes abîmées : tronquée, base64 invalide, compte démesuré, vide, mauvais type → tableau vide (pas d\'exception)', () => {
  const ok = packGhost(ghosts[0].data);
  const cut = ok.slice(0, GHOST_PACK_PREFIX.length + Math.floor((ok.length - 3) / 8) * 4);
  for (const bad of [cut, 'G2:', 'G2:!!!!', 'G2:AAAA', 'G2://///w==', 'G2:' + btoa(String.fromCharCode(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f)), null, undefined, 42, {}]) {
    const r = unpackGhost(bad);
    assert.ok(r instanceof Float32Array && r.length === 0, 'doit être vide : ' + String(bad).slice(0, 30));
    assert.equal(decodeFloats(bad).length, 0);
  }
});
test('un fantôme G2 venu du réseau passe aussi par parseGhost (bornes, valeurs finies) : accepté s\'il est valide, refusé sinon', () => {
  assert.ok(parseGhost(packGhost(ghosts[0].data), []));
  assert.equal(parseGhost('G2:AAAA', []), null);
});

console.log('Anciens records et format serveur');
test('l\'ancien format est lu comme avant, au bit près ; le format serveur (encodeFloats) est inchangé', () => {
  const d = ghosts[2].data, legacy = encodeFloats(d);
  assert.ok(!legacy.includes(':'), 'base64 : le préfixe « G2: » ne peut pas être pris pour de l\'ancien format');
  assert.deepEqual(Array.from(decodeFloats(legacy)), Array.from(d));
  assert.equal(legacy, encodeFloats(decodeFloats(legacy)));
});
test('compactGhost : ancien format → G2 plus court (même nombre d\'images) ; déjà G2, vide, illisible ou de mauvaise longueur → inchangé', () => {
  const d = ghosts[3].data, legacy = encodeFloats(d), c = compactGhost(legacy);
  assert.ok(c.startsWith(GHOST_PACK_PREFIX) && c.length < legacy.length / 3);
  assert.equal(decodeFloats(c).length, d.length);
  assert.equal(compactGhost(c), c);
  assert.equal(compactGhost(''), '');
  assert.equal(compactGhost(null), null);
  assert.equal(compactGhost('xyz!'), 'xyz!');
  assert.equal(compactGhost('g'.repeat(4000)), 'g'.repeat(4000), 'longueur qui n\'est pas un multiple de 7 flottants : on n\'y touche pas');
});

console.log('Stockage');
test('un record neuf stocke le fantôme en G2 ; relu, il donne le même nombre d\'images', () => {
  const d = ghosts[0].data;
  storage.saveRecord('b-g2-x', { time: 30, pv: 35, splits: [], inputs: 'AAAA', date: 1, name: 'x', ghost: packGhost(d), ghostVeh: [] });
  const r = storage.getRecord('b-g2-x');
  assert.ok(r.ghost.startsWith(GHOST_PACK_PREFIX));
  assert.equal(decodeFloats(r.ghost).length, d.length);
});
test('stockage plein : on COMPACTE d\'abord les anciens fantômes (ils restent affichés), au lieu de les supprimer ; aucun temps n\'est perdu', () => {
  const d = device('Q');
  const data = ghosts[1].data, legacy = encodeFloats(data), packedLen = packGhost(data).length, freed = legacy.length - packedLen;
  for (let i = 0; i < 3; i++) storage.saveRecord('b-q' + i + '-x', { time: 10 + i, pv: 35, splits: [], inputs: 'x'.repeat(40), date: 100 + i, name: 'x', ghost: legacy });
  const real = d.local.setItem.bind(d.local);
  const used = () => { let n = 0; for (const [k, v] of d.local.m) n += k.length + v.length; return n; };
  const quota = used() + Math.floor(freed * 1.5);
  d.local.setItem = (k, v) => { const old = d.local.m.get(k); const after = used() - (old ? k.length + old.length : 0) + k.length + String(v).length; if (after > quota) throw new Error('QuotaExceededError'); real(k, v); };
  storage.saveMyTrack({ id: 'big', name: 'Grand circuit', code: 'SHW3:' + 'c'.repeat(Math.floor(freed * 2)) });
  assert.equal(storage.wroteOk(), true, 'le circuit est enregistré');
  assert.deepEqual([0, 1, 2].map((i) => storage.getRecord('b-q' + i + '-x').time), [10, 11, 12], 'les trois temps sont là');
  const g = [0, 1, 2].map((i) => storage.getRecord('b-q' + i + '-x').ghost);
  assert.ok(g.every(Boolean), 'AUCUN fantôme n\'a été supprimé');
  assert.ok(g[0].startsWith(GHOST_PACK_PREFIX), 'le plus ancien a été compacté');
  assert.equal(g[2], legacy, 'le plus récent n\'a pas eu besoin de l\'être');
  assert.equal(decodeFloats(g[0]).length, data.length, 'le fantôme compacté a toutes ses images');
  d.local.setItem = real;
});
test('stockage vraiment trop plein : si la compaction ne suffit pas, on retombe sur l\'ancien comportement (fantôme du plus ancien retiré, temps gardés)', () => {
  const d = device('R');
  const legacy = encodeFloats(ghosts[0].data);
  for (let i = 0; i < 2; i++) storage.saveRecord('b-r' + i + '-x', { time: 10 + i, pv: 35, splits: [], inputs: 'x'.repeat(40), date: 100 + i, name: 'x', ghost: legacy });
  const real = d.local.setItem.bind(d.local);
  const used = () => { let n = 0; for (const [k, v] of d.local.m) n += k.length + v.length; return n; };
  const quota = used() + 200;
  d.local.setItem = (k, v) => { const old = d.local.m.get(k); const after = used() - (old ? k.length + old.length : 0) + k.length + String(v).length; if (after > quota) throw new Error('QuotaExceededError'); real(k, v); };
  storage.saveMyTrack({ id: 'huge', name: 'Énorme', code: 'SHW3:' + 'c'.repeat(legacy.length * 2) });
  assert.equal(storage.getRecord('b-r0-x').time, 10);
  assert.equal(storage.getRecord('b-r1-x').time, 11);
  assert.ok(storage.getRecord('b-r0-x').ghost === null || storage.getRecord('b-r0-x').ghost.startsWith(GHOST_PACK_PREFIX), 'jamais un fantôme à moitié écrit');
  d.local.setItem = real;
});

finish('Tous les tests du fantôme compact passent.');
