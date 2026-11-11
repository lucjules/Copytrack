// Aides de caméra de poursuite (js/camrig.js) : anticipation, compensation du retard, pente, visée de réception, sortie de ruban : node tools/test-camrig.mjs   (npm test)
// La caméra est purement visuelle : un test vérifie qu'elle ne change pas d'un bit la physique, un autre qu'elle n'est pas dans la fermeture de la vérification serveur.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { CamAssist, RIG, limitedAim, smoothstep } from '../js/camrig.js';
import { scriptTrack } from '../js/track.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { Autopilot } from '../js/autopilot.js';
import { DT } from '../js/constants.js';

const fakeP = (o = {}) => ({ yaw: 0, pos: { x: 0, y: 10, z: 0 }, vel: { x: 0, y: 0, z: -40 }, fwdSpeed: 40, grounded: true, rib: null, n: { x: 0, y: 1, z: 0 }, gSign: 1, g: 19, time: 0, ...o });
const F = 1 / 60;
const spin = (rig, p, frames, turn = 0, scale = 1, track = null) => { let o; for (let i = 0; i < frames; i++) { p.yaw += turn * F; o = rig.update(F, p, track, scale); } return o; };

test('anticipation : même signe que le taux de lacet, plafonnée, nulle sous 8 m/s, nulle en marche arrière', () => {
  const L = spin(new CamAssist(), fakeP(), 60, 1.2), R = spin(new CamAssist(), fakeP(), 60, -1.2);
  assert.ok(L.lead > 0.1 && R.lead < -0.1 && Math.abs(L.lead + R.lead) < 1e-6, `${L.lead} ${R.lead}`);
  assert.ok(Math.abs(spin(new CamAssist(), fakeP(), 120, 6).lead) <= RIG.leadMax + 1e-12, 'plafond');
  assert.equal(spin(new CamAssist(), fakeP({ vel: { x: 0, y: 0, z: -3 }, fwdSpeed: 3 }), 60, 1.2).lead, 0);
  assert.equal(spin(new CamAssist(), fakeP({ fwdSpeed: -10 }), 60, 1.2).lead, 0, 'marche arrière : pas d\'anticipation');
  assert.equal(spin(new CamAssist(), fakeP(), 60, 0).lead, 0, 'ligne droite : aucune anticipation');
});
test('réglage « Sensations » à 0 (animations réduites) : plus aucun effet ajouté ; à 150 % : plus fort qu\'à 100 %', () => {
  const o = spin(new CamAssist(), fakeP({ grounded: false, vel: { x: 0, y: 5, z: -40 } }), 60, 1.2, 0, scriptTrack('t', 'start S10 finish', { l: 4 }));
  assert.deepEqual([o.lead, o.comp, o.slope, o.aimW], [0, 0, 0, 0]);
  assert.equal(o.heightK, 1);
  assert.ok(Math.abs(spin(new CamAssist(), fakeP(), 60, 1.2, 1.5).lead) > Math.abs(spin(new CamAssist(), fakeP(), 60, 1.2, 1).lead));
});
test('entrées invalides : dt nul, négatif, NaN, infini, état NaN : aucune sortie non finie, aucune exception', () => {
  const rig = new CamAssist(), p = fakeP();
  rig.update(F, p, null, 1);
  for (const dt of [0, -1, NaN, Infinity, 1e9]) { const o = rig.update(dt, p, null, 1); for (const k of ['lead', 'comp', 'slope', 'aimW', 'heightK', 'upMix', 'upRate']) assert.ok(Number.isFinite(o[k]), `${k} (dt ${dt})`); }
  p.pos.x = NaN; const o = rig.update(F, p, null, 1); assert.ok(Number.isFinite(o.lead));
  assert.ok(Number.isFinite(rig.update(F, fakeP(), null, NaN).lead), 'réglage NaN = 1');
  rig.update(F, null, null, 1);
});
test('pente : la visée monte sur une montée, descend sur une descente, nulle à plat, au plafond et sur un ruban', () => {
  const up = spin(new CamAssist(), fakeP({ n: { x: 0, y: 0.98, z: 0.2 } }), 5).slope;      // normale penchée vers l'arrière de la marche (cap -z) : route qui monte
  const down = spin(new CamAssist(), fakeP({ n: { x: 0, y: 0.98, z: -0.2 } }), 5).slope;
  assert.ok(up > 0 && down < 0 && Math.abs(up + down) < 1e-9, `${up} ${down}`);
  assert.ok(Math.abs(up) <= RIG.slopeMax);
  assert.equal(spin(new CamAssist(), fakeP(), 5).slope, 0);
  assert.equal(spin(new CamAssist(), fakeP({ n: { x: 0, y: -1, z: 0 } }), 5).slope, 0);
  assert.equal(spin(new CamAssist(), fakeP({ n: { x: 0, y: 0.98, z: 0.2 }, rib: {} }), 5).slope, 0);
});
test('réception : la zone prédite est celle de la trajectoire balistique (à moins de 1 m d\'une solution analytique), le poids croît avec le temps passé en l\'air et retombe au sol', () => {
  const tr = scriptTrack('t', 'start S12 finish', { l: 4 }), y0 = 4 * 6.4 + 0.4 + 12;
  const p = fakeP({ pos: { x: 16, y: y0, z: -40 }, vel: { x: 0, y: 0, z: -30 }, grounded: false });
  const rig = new CamAssist();
  let o, prev = -1;
  for (let i = 0; i < 40; i++) { o = rig.update(F, p, tr, 1); assert.ok(o.aimW >= prev - 1e-12, 'poids croissant'); prev = o.aimW; }
  assert.ok(o.aimW > 0.5 * RIG.aimMax, `${o.aimW}`);
  const t = Math.sqrt((2 * 12) / 19);                              // chute libre de 12 m
  assert.ok(Math.abs(o.aim.z - (-40 - 30 * t)) < 1.5 && Math.abs(o.aim.y - (4 * 6.4 + 0.4)) < 1.0, `${JSON.stringify(o.aim)} attendu z ${(-40 - 30 * t).toFixed(1)}`);
  p.grounded = true;
  for (let i = 0; i < 120; i++) o = rig.update(F, p, tr, 1);
  assert.equal(o.aimW, 0, 'au sol : plus de visée de réception');
});
test('réception en gravité inversée : la prédiction cherche le plafond (au-dessus), sans exception', () => {
  const tr = scriptTrack('t', 'start^ S6^ finish^', { l: 6 });
  const p = fakeP({ gSign: -1, pos: { x: 16, y: 6 * 6.4 - 6, z: -40 }, vel: { x: 0, y: 0, z: -20 }, grounded: false, n: { x: 0, y: -1, z: 0 } });
  const rig = new CamAssist(); let o; for (let i = 0; i < 40; i++) o = rig.update(F, p, tr, 1);
  assert.ok(Number.isFinite(o.aim.x + o.aim.y + o.aim.z) && o.aim.y >= p.pos.y - 1, JSON.stringify(o.aim));
});
test('limitedAim : l\'écart avec la visée normale ne dépasse jamais le plafond, quelle que soit la zone visée (la voiture reste dans le champ) ; w = 0 : visée normale', () => {
  const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
  for (const b of [unit(0, -1, -0.1), unit(1, 0, 0), unit(0, 0, 1), unit(0, 1, -1), unit(0, -0.2, -1)]) {
    const a = unit(0, -0.05, -1), out = {};
    limitedAim(a, b, 1, RIG.aimShiftMax, out);
    const ang = Math.acos(Math.max(-1, Math.min(1, a.x * out.x + a.y * out.y + a.z * out.z)));
    assert.ok(ang <= RIG.aimShiftMax + 1e-9 && Math.abs(Math.hypot(out.x, out.y, out.z) - 1) < 1e-9);
    limitedAim(a, b, 0, RIG.aimShiftMax, out); assert.deepEqual(out, a);
  }
});
test('sortie de ruban : la caméra accompagne d\'abord la voiture (upMix 0) puis rejoint le haut du monde (1) en moins d\'une seconde ; sans ruban récent, aucun effet', () => {
  const rig = new CamAssist(), p = fakeP({ rib: {} });
  rig.update(F, p, null, 1); assert.equal(rig.out.upRate, 4);
  p.rib = null; p.grounded = false;
  let o = rig.update(F, p, null, 1);
  assert.ok(o.exiting && o.upMix < 0.05, 'au tout début : la caméra suit la voiture');
  let t = F; while (o.upMix < 1 && t < 2) { o = rig.update(F, p, null, 1); t += F; }
  assert.ok(t < 1, `rejoint le monde après ${t.toFixed(2)} s`);
  for (let i = 0; i < 90; i++) o = rig.update(F, p, null, 1);
  assert.ok(!o.exiting && o.upRate === 4, 'ensuite : comportement habituel');
  assert.equal(new CamAssist().out.exiting, false);
});
test('reset : coupure (départ, réapparition) = état neuf, sans anticipation héritée ni visée de réception', () => {
  const rig = new CamAssist();
  spin(rig, fakeP({ grounded: false }), 60, 2, 1, scriptTrack('t', 'start S10 finish', { l: 4 }));
  rig.reset(fakeP());
  const o = rig.update(F, fakeP(), null, 1);
  assert.deepEqual([o.lead, o.aimW, o.upMix], [0, 0, 1]);
});
test('déterminisme : mêmes entrées → mêmes sorties, d\'une instance à l\'autre', () => {
  const a = spin(new CamAssist(), fakeP(), 90, 0.7), b = spin(new CamAssist(), fakeP(), 90, 0.7);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});
test('la caméra ne change PAS la physique : 3 000 pas d\'une course, avec et sans aides de caméra, donnent exactement le même état', () => {
  const run = (withCam) => {
    const tr = scriptTrack('t', 'start S2 U S2 R S3 O S2 finish', { l: 4 });
    const ph = new CarPhysics(tr), lg = new RaceLogic(tr); placeAtStart(ph, lg);
    const bot = new Autopilot(tr.path); bot.reset(ph);
    const rig = withCam ? new CamAssist() : null;
    for (let i = 0; i < 3000; i++) {
      ph.clock = i; ph.step(bot.control(ph));
      if (rig && i % 2 === 0) rig.update(DT * 2, ph, tr, 1);
      lg.update(ph);
    }
    return JSON.stringify([ph.pos, ph.vel, ph.yaw, ph.omega, ph.gSign, ph.steer]);
  };
  assert.equal(run(true), run(false));
});
test('la caméra n\'est pas dans la fermeture de la vérification serveur (js/verify.js) : elle ne peut pas changer un temps vérifié', async () => {
  const { readFileSync } = await import('node:fs');
  const seen = new Set(), todo = ['js/verify.js'];
  while (todo.length) {
    const f = todo.pop(); if (seen.has(f)) continue; seen.add(f);
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'/g)) { const dir = f.split('/').slice(0, -1); for (const part of m[1].split('/')) { if (part === '..') dir.pop(); else if (part !== '.') dir.push(part); } todo.push(dir.join('/')); }
  }
  assert.ok(!seen.has('js/camrig.js') && !seen.has('js/race/camera.js'));
  assert.ok(seen.has('js/physics.js'), 'la fermeture contient bien la physique');
});
test('smoothstep : bornes et monotonie', () => { assert.equal(smoothstep(1, 2, 0), 0); assert.equal(smoothstep(1, 2, 3), 1); assert.ok(smoothstep(1, 2, 1.5) === 0.5); });

finish('Aides de caméra : tout passe.');
