// Ressenti de course (0.9.20) : lignes de vitesse graduées, coup de FOV, tassement à la réception, aspiration, vibrations, croisements. Pur : rien ici ne touche à la physique. node tools/test-ressenti.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { speedLines, fovPunch, FOV_PUNCH, landingDip, DIP, slipstream, rumbleLevels, PassTracker, feelScale } from '../js/feel.js';

console.log('Lignes de vitesse');
test('graduées : rien sous 126 km/h, plein effet vers 360 km/h, croissantes et lisses (avant : rien avant 223 km/h)', () => {
  assert.equal(speedLines(0), 0); assert.equal(speedLines(34), 0); assert.equal(speedLines(100), 1); assert.equal(speedLines(200), 1);
  let prev = -1;
  for (let v = 0; v <= 110; v += 2) { const s = speedLines(v); assert.ok(s >= prev - 1e-12 && s >= 0 && s <= 1, 'v ' + v); prev = s; }
  assert.ok(speedLines(50) > 0 && speedLines(50) < 0.5, 'à 180 km/h : déjà visible, loin du plein effet : ' + speedLines(50));
  assert.equal(speedLines(-60), speedLines(60), 'marche arrière : même effet');
});
console.log('Caméra');
test('coup de FOV : +5° au départ, retombe en 0,42 s sans jamais devenir négatif ; proportionnel au réglage', () => {
  assert.equal(fovPunch(0), FOV_PUNCH.amp); assert.equal(fovPunch(FOV_PUNCH.dur), 0); assert.equal(fovPunch(5), 0); assert.equal(fovPunch(-1), 0); assert.equal(fovPunch(NaN), 0);
  let prev = Infinity;
  for (let t = 0; t < FOV_PUNCH.dur; t += 0.02) { const v = fovPunch(t); assert.ok(v <= prev + 1e-9 && v >= 0); prev = v; }
  assert.equal(fovPunch(0, 0), 0); assert.equal(fovPunch(0, 1.5), FOV_PUNCH.amp * 1.5);
});
test('tassement à la réception : nul pour un petit choc, plus profond pour un gros, borné, revient à zéro, jamais vers le haut', () => {
  assert.equal(landingDip(3, 0.1), 0); assert.equal(landingDip(0, 0.1), 0);
  const small = Math.max(...Array.from({ length: 40 }, (_, i) => landingDip(6, i * 0.01))), big = Math.max(...Array.from({ length: 40 }, (_, i) => landingDip(20, i * 0.01)));
  assert.ok(small > 0 && big > small, `${small} < ${big}`); assert.ok(big <= DIP.max + 1e-9, 'borné : ' + big);
  assert.equal(landingDip(20, DIP.dur), 0); assert.equal(landingDip(20, 3), 0); assert.equal(landingDip(20, -1), 0);
  for (let i = 0; i < 40; i++) assert.ok(landingDip(15, i * 0.01) >= 0, 'jamais vers le haut');
  assert.equal(landingDip(20, 0), 0, 'part de zéro (pas de saut brusque)');
  assert.equal(Math.max(...Array.from({ length: 40 }, (_, i) => landingDip(20, i * 0.01, 0))), 0, 'réglage à 0 : plus rien');
});
console.log('Aspiration');
test('derrière une voiture, dans l\'axe : forte quand on est près ; nulle devant, trop loin, de côté ou collé', () => {
  const self = { x: 0, z: 0, fx: 0, fz: -1 };               // on roule vers -z
  const car = (x, z) => [{ x, z }];
  assert.equal(slipstream(self, []), 0);
  const near = slipstream(self, car(0, -8)), far = slipstream(self, car(0, -25));
  assert.ok(near > far && far > 0 && near <= 1, `${near} > ${far}`);
  assert.equal(slipstream(self, car(0, -40)), 0, 'trop loin'); assert.equal(slipstream(self, car(0, 10)), 0, 'derrière nous');
  assert.equal(slipstream(self, car(6, -10)), 0, 'de côté'); assert.equal(slipstream(self, car(0, -1)), 0, 'collé');
  assert.ok(slipstream(self, car(0, -10)) > slipstream(self, car(2.5, -10)), 'meilleure dans l\'axe');
  assert.equal(slipstream(self, [...car(0, 10), ...car(0, -10)]), slipstream(self, car(0, -10)), 'le meilleur compte, les autres ne gênent pas');
  const east = { x: 0, z: 0, fx: 1, fz: 0 };
  assert.ok(slipstream(east, car(12, 0.5)) > 0, 'orientation quelconque');
});
console.log('Vibrations');
test('graduées : un grondement léger qui monte avec la vitesse, plus fort hors piste, en dérapage et en turbo ; rien en l\'air ; réglage et bornes', () => {
  const idle = rumbleLevels({ speed: 0 }), fast = rumbleLevels({ speed: 80 });
  assert.ok(fast.weak > idle.weak && idle.weak > 0 && fast.strong === 0);
  const off = rumbleLevels({ speed: 60, offTrack: true }), drift = rumbleLevels({ speed: 60, slip: 8 }), boost = rumbleLevels({ speed: 60, boosting: true });
  assert.ok(off.strong > 0.2 && drift.strong > 0.15 && boost.strong >= 0.25 && boost.weak > fast.weak);
  assert.ok(drift.strong > rumbleLevels({ speed: 60, slip: 3 }).strong, 'plus on dérape, plus ça vibre');
  assert.deepEqual(rumbleLevels({ speed: 90, grounded: false, boosting: true }), { strong: 0, weak: 0 });
  assert.deepEqual(rumbleLevels({ speed: 90, offTrack: true, boosting: true, slip: 20, scale: 0 }), { strong: 0, weak: 0 });
  const max = rumbleLevels({ speed: 500, offTrack: true, boosting: true, slip: 99, scale: 1.5 }); assert.ok(max.strong <= 1 && max.weak <= 1);
});
console.log('Croisements');
test('un dépassement à moins de 6 m en travers compte UNE fois ; à l\'arrêt, de loin, ou sans vitesse relative : jamais', () => {
  const self = (z, speed = 60) => ({ x: 0, z, fx: 0, fz: -1, speed });
  const t = new PassTracker();
  const other = (z, x = 2, speed = 40) => [{ id: 'a', x, z, speed }];
  // On roule vers -z ; l'autre est devant (z < moi), on le dépasse : « along » passe de + à -.
  assert.equal(t.update(self(0), other(-20), 0.016), 0);
  assert.equal(t.update(self(-18), other(-20), 0.016), 0);
  assert.equal(t.update(self(-22), other(-20), 0.016), 1, 'on vient de le doubler');
  assert.equal(t.update(self(-24), other(-20), 0.016), 0, 'une seule fois');
  // croisement en sens inverse (l'autre vient vers nous)
  const t2 = new PassTracker();
  assert.equal(t2.update(self(0), other(-30, 3, -50), 0.016), 0);
  assert.equal(t2.update(self(-28), other(-30, 3, -50), 0.016), 0);
  assert.equal(t2.update(self(-32), other(-30, 3, -50), 0.016), 1, 'croisé en sens inverse');
  // trop loin en travers
  const t3 = new PassTracker(); t3.update(self(0), other(-20, 12), 0.016); t3.update(self(-18), other(-20, 12), 0.016);
  assert.equal(t3.update(self(-22), other(-20, 12), 0.016), 0, 'à 12 m de côté : pas un croisement');
  // même vitesse : on ne se double pas
  const t4 = new PassTracker(); t4.update(self(0, 40), other(-20, 2, 40), 0.016); t4.update(self(-18, 40), other(-20, 2, 40), 0.016);
  assert.equal(t4.update(self(-22, 40), other(-20, 2, 40), 0.016), 0, 'vitesses égales');
  // une voiture qui disparaît est oubliée (pas de fuite)
  t.update(self(-30), [], 0.016); assert.equal(t.side.size, 0);
  t.reset(); assert.equal(t.cool, 0);
});
test('réglage « Sensations » : 0 à 150 %, 100 % par défaut, valeurs absurdes ramenées', () => {
  assert.equal(feelScale(undefined), 1); assert.equal(feelScale(null), 1); assert.equal(feelScale(''), 1); assert.equal(feelScale('x'), 1);
  assert.equal(feelScale(0), 0); assert.equal(feelScale(0.5), 0.5); assert.equal(feelScale(9), 1.5); assert.equal(feelScale(-2), 0);
});

await finish('Tous les tests du ressenti de course passent.');
