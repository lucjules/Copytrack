// Physique de la version 1.0 (PHYS_VER 36) : rubans solides, décollage balistique, chocs dans le plan de la route, moteur. node tools/test-physique-v1.mjs
// Chaque test échoue sur la physique 35 (mesuré avant la correction : voir CHANGELOG, 1.0.0-rc.1).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack } from '../js/track.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { frameWorld } from '../js/physics/ribbon.js';
import { ribbonOf } from '../js/ribbons.js';
import { isRibbon } from '../js/pieces.js';
import { CAR } from '../js/physics/specs.js';
import { DT, CAR_SCALE } from '../js/constants.js';

const KMH = 3.6;
function mk(script, { l = 4, v0 = 0 } = {}) {
  const tr = scriptTrack('m', script, { l }), ph = new CarPhysics(tr), lg = new RaceLogic(tr); placeAtStart(ph, lg); ph.graceT = 0; ph.hazardGrace = 0;
  if (v0) { ph.vel.x = -Math.sin(ph.yaw) * v0 / KMH; ph.vel.z = -Math.cos(ph.yaw) * v0 / KMH; ph.fwdSpeed = v0 / KMH; }
  return { tr, ph };
}
// Position de la voiture par rapport au ruban : { u, lt (écart le long), dn (> 0 côté route), dl, hw }.
const F = {};
function side(ph, tile) {
  const rib = ribbonOf(tile), p = ph.pos; let bu = 0, bd = Infinity;
  for (let i = 0; i <= 64; i++) { frameWorld(tile, rib, i / 64, F); const d = (p.x - F.px) ** 2 + (p.y - F.py) ** 2 + (p.z - F.pz) ** 2; if (d < bd) { bd = d; bu = i / 64; } }
  let u = bu; for (let k = 0; k < 4; k++) { frameWorld(tile, rib, u, F); u = Math.min(1, Math.max(0, u + ((p.x - F.px) * F.tx + (p.y - F.py) * F.ty + (p.z - F.pz) * F.tz) / F.ds)); }
  frameWorld(tile, rib, u, F);
  const lx = (p.x - F.px) * F.rx + (p.y - F.py) * F.ry + (p.z - F.pz) * F.rz, ln = (p.x - F.px) * F.nx + (p.y - F.py) * F.ny + (p.z - F.pz) * F.nz, lt = (p.x - F.px) * F.tx + (p.y - F.py) * F.ty + (p.z - F.pz) * F.tz;
  if (F.kc > 1e-4) { const Rc = 1 / F.kc; return { u, lt, dn: Rc - Math.hypot(lx, ln - Rc), dl: Math.atan2(lx, Rc - ln) * Rc, hw: F.wrap ? 1e9 : F.hw || 12 }; }
  return { u, lt, dn: ln, dl: lx, hw: F.hw || 12 };
}

console.log('Rubans solides');
test('décrochée d\'un looping, d\'un tube ou d\'un tire-bouchon, la voiture ne traverse JAMAIS la paroi (1 530 essais ; avant : 39 traversées sur 612 pour le looping, 30 pour le double)', () => {
  const scripts = { loop: 'start S1 O S4 finish', loopBig: 'start S1 OB S4 finish', dbl: 'start S1 OD S4 finish', tube: 'start S1 [tube] S4 finish', cork: 'start S1 [cork] S4 finish' };
  let runs = 0, fell = 0;
  for (const [name, script] of Object.entries(scripts)) for (let v0 = 60; v0 <= 260; v0 += 8) for (const steer of [0, 0.15, -0.15, 0.5]) for (const gas of [0, 0.5, 9]) {
    const { ph, tr } = mk(script, { v0 }), tile = tr.tiles.find(isRibbon); runs++;
    let f = false, was = null;
    for (let i = 0; i < 120 * 10; i++) {
      ph.clock = i; ph.step({ steer: ph.rib ? steer : 0, throttle: i < 120 * gas, brake: false });
      if (ph.ev.loopFall) f = true;
      if (f && !ph.rib) {
        const s = side(ph, tile);
        if (s.u > 0.01 && s.u < 0.99 && Math.abs(s.dl) < s.hw - 1 && Math.abs(s.lt) < 1 && Math.abs(s.dn) < 2.5) {
          assert.ok(!(was !== null && was > 0.2 && s.dn < -0.2), `${name} v0=${v0} volant=${steer} gaz=${gas} : paroi traversée (pas ${i})`);
          if (Math.abs(s.dn) > 0.2) was = s.dn;
        } else was = null;
      } else was = null;
    }
    if (f) fell++;
  }
  assert.ok(runs > 1500 && fell > 300, `${runs} essais, ${fell} décrochages (le cas visé est bien exercé)`);
});
test('trop lente dans un looping : passée la verticale elle décroche, retombe contre la paroi, s\'y repose et redescend ; elle finit sur la route, pas sous le circuit', () => {
  const { ph } = mk('start S1 O S4 finish', { v0: 135 });
  const y0 = ph.pos.y; let fell = false, relanded = false, minY = y0;
  for (let i = 0; i < 120 * 9; i++) { ph.clock = i; ph.step({ steer: 0, throttle: false, brake: false }); if (ph.ev.loopFall) fell = true; if (fell && ph.rib && ph.ev.land > 0) relanded = true; minY = Math.min(minY, ph.pos.y); }
  assert.ok(fell && relanded, 'décrochage puis reprise sur le looping');
  assert.ok(minY > y0 - 0.5, 'jamais sous la route : ' + minY.toFixed(1));
});
test('dos d\'un looping : une voiture lancée de l\'extérieur contre la boucle rebondit dessus (avant : elle passait au travers)', () => {
  for (const v of [20, 60]) {
    const { ph } = mk('start S1 O S4 finish');
    ph.pos.x = 17; ph.pos.y = 42; ph.pos.z = -86; ph.prev.x = 17; ph.prev.y = 42; ph.prev.z = -86; ph.grounded = false; ph.vel.x = 0; ph.vel.y = 6; ph.vel.z = v; ph.yaw = Math.PI;
    let maxZ = -999, wall = 0;
    for (let i = 0; i < 120 * 2; i++) { ph.clock = i; ph.step({ steer: 0, throttle: false, brake: false }); maxZ = Math.max(maxZ, ph.pos.z); wall = Math.max(wall, ph.ev.wall); }
    assert.ok(maxZ < -80.5 && wall > 5, `${v} m/s : arrêtée à z=${maxZ.toFixed(1)} (paroi à −80), choc ${wall.toFixed(0)}`);
  }
});
test('sur un looping l\'adhérence suit l\'appui : nulle sans appui, entière à partir d\'un demi-poids (CAR.loadFull)', () => {
  assert.ok(CAR.loadFull > 0.2 && CAR.loadFull <= 1);
});

console.log('Décollage');
const hopAt = (script, v0) => {
  const { ph } = mk(script, { v0, l: 6 }); const z0 = ph.pos.z; let air = 0, maxH = 0; const S = {};
  for (let i = 0; i < 120 * 30 && z0 - ph.pos.z < 32 * 12; i++) {
    ph.clock = i; ph.step({ steer: 0, throttle: ph.speed * KMH < v0, brake: false });
    const s = ph.track.surfaceAt(ph.pos.x, ph.pos.y, ph.pos.z, S, 0.5, null, 0);
    if (!ph.grounded) air += DT; if (s.type === 'road') maxH = Math.max(maxH, ph.pos.y - s.h);
  }
  return { air, maxH };
};
test('une cassure prise lentement est absorbée par la suspension (aucun vol à 40 km/h ; avant : 0,23 s) ; prise vite elle fait le même saut qu\'avant', () => {
  for (const sc of ['start S3 U S9 finish', 'start S3 D S9 finish', 'start S3 [gentle] S9 finish']) {
    const slow = hopAt(sc, 40); assert.equal(slow.air, 0, sc); assert.ok(slow.maxH <= CAR.susTravel + 0.01, `${sc} : ${slow.maxH}`);
  }
  const fast = hopAt('start S3 U S9 finish', 200); assert.ok(fast.air > 1 && fast.air < 1.3 && fast.maxH > 2.8 && fast.maxH < 3.5, JSON.stringify(fast));
});
test('un sommet arrondi ne colle plus la voiture : rien à 120 km/h, un vol franc à 200 et 260 (avant : 0 s à toute vitesse)', () => {
  for (const sc of ['start S3 [crv1] [cro1] S9 finish', 'start S3 [cdi1] [cdo1] S9 finish']) {
    assert.equal(hopAt(sc, 120).air, 0, sc);
    const a = hopAt(sc, 200), b = hopAt(sc, 260);
    assert.ok(a.air > 0.6 && b.air > a.air, `${sc} : ${a.air.toFixed(2)} s puis ${b.air.toFixed(2)} s`);
  }
});
test('le S d\'un niveau décolle progressivement (avant : collé jusqu\'à 160 km/h, puis 1,9 m à 200 et 6,6 m à 260)', () => {
  const h = [120, 160, 200, 260].map((v) => hopAt('start S3 [crs1] S9 finish', v).maxH);
  for (let i = 1; i < h.length; i++) assert.ok(h[i] > h[i - 1], h.map((x) => x.toFixed(2)).join(' < '));
  assert.ok(h[0] > 0.2 && h[0] < 1 && h[1] > 1 && h[1] < 3, h.map((x) => x.toFixed(2)).join(', '));
});
test('à l\'arrêt et au ralenti sur du plat, la voiture ne bouge pas et ne gagne aucune vitesse (pas d\'énergie créée par le contact)', () => {
  const { ph } = mk('start S6 finish');
  for (let i = 0; i < 600; i++) { ph.clock = i; ph.step({ steer: 0, throttle: false, brake: false }); }
  assert.ok(ph.speed < 1e-6 && ph.grounded, 'immobile : ' + ph.speed);
  const { ph: q } = mk('start S6 finish', { v0: 4 });
  for (let i = 0; i < 120; i++) { q.clock = i; q.step({ steer: 0, throttle: false, brake: false }); }
  assert.ok(q.speed < 4 / KMH, 'elle ralentit en roue libre : ' + q.speed);
});

console.log('Chocs');
function slopeHit(kind, v0, ang = 0) {
  const { ph, tr } = mk('start S2 U6 S3 finish', { v0, l: 2 }); const S = {};
  let placed = false, hit = -1, maxH = 0, air = 0;
  for (let i = 0; i < 120 * 8; i++) {
    if (ph.grounded && Math.abs(ph.n.y) < 0.99 && !placed && ph.pos.y > 16) {
      placed = true;
      if (kind === 'bordure') { ph.yaw -= ang; const sp = ph.speed; ph.vel.x = -Math.sin(ph.yaw) * sp; ph.vel.z = -Math.cos(ph.yaw) * sp; ph.vel.y = -(ph.n.x * ph.vel.x + ph.n.z * ph.vel.z) / ph.n.y; }
      else { tr.decos.push({ k: kind, x: ph.pos.x, y: ph.pos.y + 4.5, z: ph.pos.z - 22, ry: 0, s: 1 }); tr.version++; }
    }
    ph.clock = i; ph.step({ steer: 0, throttle: true, brake: false });
    if ((ph.ev.wall > 1 || ph.ev.shock > 0) && hit < 0) hit = i;
    if (hit >= 0 && i - hit < 150) { const s = ph.track.surfaceAt(ph.pos.x, ph.pos.y, ph.pos.z, S, 0.5, null, 0); if (s.type === 'road') maxH = Math.max(maxH, ph.pos.y - s.h); if (!ph.grounded) air++; }
  }
  return { hit: hit >= 0, maxH, air };
}
test('en montée, un choc (bumper, balayeur, bordure) ne décolle plus la voiture de la route (avant : bumper 5,4 à 7,4 m en l\'air, balayeur 4 m)', () => {
  let hits = 0;
  for (const v0 of [80, 160]) {
    for (const k of ['bumper', 'sweeper', 'slider']) { const r = slopeHit(k, v0); if (r.hit) { hits++; assert.ok(r.maxH < 0.05 && r.air === 0, `${k} ${v0} km/h : ${r.maxH.toFixed(2)} m, ${r.air} pas en l'air`); } }
    for (const a of [0.2, 0.6, 1.2]) { const r = slopeHit('bordure', v0, a); assert.ok(r.hit && r.maxH < 0.05 && r.air === 0, `bordure ${v0} km/h ${a} rad : ${r.maxH.toFixed(2)} m`); }
  }
  assert.ok(hits >= 4, 'les obstacles ont bien été touchés : ' + hits);
});
test('un obstacle ne renvoie plus la voiture en arrière à la moitié de sa vitesse (rebond 0,25, poussée 2 m/s)', () => {
  assert.ok(CAR.shockE <= 0.3 && CAR.shockKick <= 3);
});
test('retombée contre la tranche d\'une plateforme : sous l\'épaisseur de la dalle (CAR.curb) la voiture heurte la tranche, elle n\'est plus soulevée de 1,6 m', () => {
  assert.ok(CAR.curb <= 1 && CAR.curb < CAR.step);
});

console.log('Moteur et échelle');
test('moteur : 0 → 200 km/h en moins de 4,3 s (avant 5,5 s), 300 km/h de pointe ; la voiture et ses collisions sont à l\'échelle CAR_SCALE', () => {
  const { ph } = mk('start S90 finish'); let t200 = null, top = 0;
  for (let i = 0; i < 120 * 30; i++) { ph.clock = i; ph.step({ steer: 0, throttle: true, brake: false }); top = Math.max(top, ph.speed); if (t200 === null && ph.speed * KMH >= 200) t200 = i * DT; }
  assert.ok(t200 < 4.3 && top * KMH > 290 && top * KMH <= 300.5, `${t200} s, ${(top * KMH).toFixed(0)} km/h`);
  assert.equal(CAR.radius, CAR_SCALE); assert.ok(Math.abs(CAR.a + CAR.b - 2.75 * CAR_SCALE) < 1e-9);
});

await finish('Tous les tests de la physique 1.0 passent.');
