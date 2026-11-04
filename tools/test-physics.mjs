// Tests de la physique à l'envers : node tools/test-physics.mjs   (npm test)
//  1. le volant tourne autour du « haut » local : même virage au sol et au plafond ;
//  2. les revêtements donnent les mêmes résultats à l'endroit et à l'envers ;
//  3. volant inversé : seulement au contact d'une pièce qui l'a (plaque, saut, réception) ;
//  4. aimant : l'attraction suit la normale de la route, endroit ou envers.
import assert from 'node:assert/strict';
import { Track, scriptTrack } from '../js/track.js';
import { CarPhysics, surfaceCoeffs } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); }
}

// Ligne droite orientée vers -z : départ en z = 12, pièces de z = 11 à z = 2 (celles de `gaps` sont omises), arrivée en z = 1.
// v : pièces posées à l'envers (niveau 3, gravité inversée au départ).
function line({ v = 0, surf = {}, gaps = [], v0 = 0 } = {}) {
  const tr = new Track('test');
  const l = 3;                       // niveau 3 aussi à l'endroit : un trou laisse vraiment tomber la voiture
  tr.add({ t: 'start', x: 5, z: 12, l, r: 0, v });
  for (let z = 11; z >= 2; z--) if (!gaps.includes(z)) tr.add({ t: 'straight', x: 5, z, l, r: 0, v, s: surf[z] || '' });
  tr.add({ t: 'finish', x: 5, z: 1, l, r: 0, v });
  tr.setParams({ v0 });
  const ph = new CarPhysics(tr);
  placeAtStart(ph, new RaceLogic(tr));
  return ph;
}
const surfAll = (s) => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 2, s]));
const drive = (ph, n, inp, k0 = 0) => { for (let k = 0; k < n; k++) { ph.clock = k0 + k; ph.step(inp); } };
// Déplacement latéral dans le repère de la voiture (droite = avant × haut local), avant = -z.
const lateral = (ph, x0, gs) => (ph.pos.x - x0) * gs;

console.log('Volant et revêtements à l’endroit / à l’envers');
test('le même coup de volant fait le même virage au sol et au plafond', () => {
  for (const steer of [-1, 1]) {
    const a = line(), b = line({ v: 1 });
    const xa = a.pos.x, xb = b.pos.x;
    assert.equal(b.gSign, -1);
    drive(a, 240, { steer, throttle: true, brake: false });
    drive(b, 240, { steer, throttle: true, brake: false });
    assert.ok(Math.abs(lateral(a, xa, 1)) > 3, 'la voiture tourne');
    assert.ok(Math.abs(lateral(a, xa, 1) - lateral(b, xb, -1)) < 1e-6, `virage identique (steer ${steer}) : ${lateral(a, xa, 1)} / ${lateral(b, xb, -1)}`);
    assert.ok(Math.sign(a.yawRate) === -Math.sign(b.yawRate), 'le lacet du monde est opposé, le virage du pilote identique');
  }
});

for (const mod of ['ice', 'sand', 'mud', 'magnet', 'drift', 'slow', 'powder', 'boost']) {
  test(`revêtement « ${mod} » : mêmes résultats à l'endroit et à l'envers`, () => {
    const a = line({ surf: surfAll(mod), v0: 120 }), b = line({ surf: surfAll(mod), v: 1, v0: 120 });
    const xa = a.pos.x, xb = b.pos.x;
    for (let k = 0; k < 360; k++) {
      const inp = { steer: k < 200 ? 0.6 : -0.4, throttle: true, brake: k > 280 };
      a.clock = b.clock = k; a.step(inp); b.step(inp);
    }
    assert.ok(Math.abs(a.fwdSpeed - b.fwdSpeed) < 1e-6, `vitesse ${a.fwdSpeed} / ${b.fwdSpeed}`);
    assert.ok(Math.abs(lateral(a, xa, 1) - lateral(b, xb, -1)) < 1e-6, `trajectoire ${lateral(a, xa, 1)} / ${lateral(b, xb, -1)}`);
  });
}
test('surfaceCoeffs : une seule table de coefficients', () => {
  const c = surfaceCoeffs('ice', 1, {});
  assert.deepEqual([c.grip, c.traction, c.vmaxK, c.extraDrag, c.rearK], [0.2, 0.45, 1, 0, 1]);
  assert.equal(surfaceCoeffs('magnet', 1, {}).grip, 1.6);
  assert.equal(surfaceCoeffs('', 1, {}).grip, 1);
});

console.log('Volant inversé : seulement au contact');
// phys.steer est remis à 0 avant chaque pas : son signe dit si le volant est normal (+) ou inversé (-).
function reverseProbe(v) {
  const ph = line({ v, v0: 150, surf: { 11: 'reverse', 10: 'reverse', 9: 'reverse' }, gaps: [8, 7] });
  const seen = { plate: [], air: [], after: [] };
  for (let k = 0; k < 420; k++) {
    ph.steer = 0; ph.clock = k;
    const wasGrounded = ph.grounded, mod = ph.surfMod;     // l'état AVANT le pas décide du volant de ce pas
    ph.step({ steer: 1, throttle: true, brake: false });
    const s = Math.sign(ph.steer);
    if (!wasGrounded && !ph.grounded && ph.pos.z < 24 * 9 && ph.pos.z > 24 * 5) seen.air.push(s);
    else if (wasGrounded && mod === 'reverse') seen.plate.push(s);
    else if (wasGrounded && mod === '' && ph.grounded) seen.after.push(s);
  }
  return seen;
}
for (const v of [0, 1]) {
  test(`plaque → saut → réception (${v ? 'au plafond' : 'au sol'})`, () => {
    const s = reverseProbe(v);
    assert.ok(s.plate.length > 5 && s.air.length > 5 && s.after.length > 5, `les 3 phases ont lieu (${s.plate.length}/${s.air.length}/${s.after.length})`);
    assert.ok(s.plate.every((x) => x < 0), 'sur la plaque : volant inversé');
    assert.ok(s.air.every((x) => x > 0), 'en l’air : volant normal');
    assert.ok(s.after.every((x) => x > 0), 'après la réception : volant normal');
  });
}

console.log('Aimant');
function magnetHop(v, magnet) {
  const ph = line({ v, surf: magnet ? surfAll('magnet') : {} });
  drive(ph, 120, { steer: 0, throttle: true, brake: false });
  assert.ok(ph.grounded, 'posée avant le saut');
  const y0 = ph.pos.y;
  ph.vel.y += v ? -9 : 9; ph.grounded = false;     // coup de pied « loin de la route »
  let max = 0;
  for (let k = 0; k < 90; k++) { ph.clock = 120 + k; ph.step({ steer: 0, throttle: true, brake: false }); max = Math.max(max, Math.abs(ph.pos.y - y0)); }
  return max;
}
test('l’aimant rappelle la voiture vers la route, au sol comme au plafond', () => {
  const plainUp = magnetHop(0, false), magUp = magnetHop(0, true);
  const plainDown = magnetHop(1, false), magDown = magnetHop(1, true);
  assert.ok(magUp < plainUp - 0.3, `au sol : ${magUp.toFixed(2)} < ${plainUp.toFixed(2)}`);
  assert.ok(magDown < plainDown - 0.3, `au plafond : ${magDown.toFixed(2)} < ${plainDown.toFixed(2)}`);
  assert.ok(Math.abs(magUp - magDown) < 0.05, `symétrique : ${magUp.toFixed(3)} / ${magDown.toFixed(3)}`);
});

console.log('Vrille (2 cases) : la voiture ne traverse plus la route');
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Conduite aléatoire (vitesse d'entrée, volant, gaz, frein) : renvoie combien de fois la voiture quitte la vrille EN ROUTE.
function twistDrops(script, runs) {
  let drops = 0, crossed = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const tr = scriptTrack('t', script, { l: 2 });
    const ph = new CarPhysics(tr), lg = new RaceLogic(tr, { partial: true }); placeAtStart(ph, lg);
    const r = mulberry(seed), v0 = 5 + r() * 55; ph.vel.z = -v0; ph.fwdSpeed = v0;
    let steer = 0, thr = true, brk = false, prev = null, inTwist = false;
    for (let k = 0; k < 2500; k++) {
      if (k % 20 === 0) { steer = (r() - 0.5) * (r() > 0.5 ? 1.6 : 0.2); thr = r() > 0.2; brk = r() > 0.85; }
      ph.clock = k; lg.update(ph); if (lg.finished) break;
      ph.step({ steer, throttle: thr, brake: brk });
      const rib = ph.rib && ph.rib.tile.t === 'twist' ? ph.rib : null;
      if (rib) inTwist = true;
      if (prev && !rib && prev.u > 0.04 && prev.u < 0.96) { drops++; break; }
      prev = rib ? { u: rib.u } : null;
    }
    if (inTwist) crossed++;
  }
  return { drops, crossed };
}
test('vrille avec plaque d\'inversion : jamais lâchée en route (80 conduites aléatoires)', () => {
  const r = twistDrops('start S3 TW.f S3^ finish^', 80);
  assert.ok(r.crossed > 40, 'la vrille est bien traversée : ' + r.crossed);
  assert.equal(r.drops, 0, 'décrochages en route : ' + r.drops);
});
test('vrille SANS plaque (avant : la voiture se détachait à mi-parcours et traversait la route) : toujours guidée', () => {
  const r = twistDrops('start S3 TW S3^ finish^', 80);
  assert.ok(r.crossed > 40); assert.equal(r.drops, 0, 'décrochages en route : ' + r.drops);
});
test('vrille et vrille retour enchaînées : jamais lâchée non plus', () => {
  assert.equal(twistDrops('start S3 TW.f S3^ TWB.f S3 finish', 60).drops, 0);
});

if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests de physique passent.');
