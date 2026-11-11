// Véhicules v2 et profils physiques (E20 : moto, bateau, deltaplane v2 ; Arcade, Classique, Simulation) : node tools/test-vehicles2.mjs   (npm test)
// Le modèle v1 reste identique au bit près (empreinte) ; le v2 n'entre en service que par la règle vm ou le profil Simulation ; aucun profil
// ne rend un véhicule plus rapide en ligne droite (vitesse de pointe, accélération, boost inchangés).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, b64decode, hashString } from '../js/track.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { InputRecorder, quantSteer } from '../js/replay.js';
import { verifyRun } from '../js/verify.js';
import { PHYS_VER } from '../js/version.js';
import { SPECS } from '../js/physics/specs.js';
import { specsOf, v2Of } from '../js/physics/profiles.js';
import { MAX_LEAN } from '../js/physics/vehicles/moto2.js';
import { waveAt, boat2Water } from '../js/physics/vehicles/boat2.js';
import { thermalOf, thermalLift, altitudeK, THERMAL_ACC } from '../js/physics/vehicles/glider2.js';
import { applyVariant, variantFits } from '../js/variants.js';
import { labCompare, labTrack, LAB_SETUPS } from '../js/analysis/lab.js';

const def = (id) => BUILTIN_TRACKS.find((d) => d.id === id);
const track = (id, p) => { const t = buildBuiltin(def(id)); if (p) t.setParams(p); return t; };
const keyOf = (id) => `b-${id}-${hashString(buildBuiltin(def(id)).encode())}`;
function botRun(t, veh) {
  const sim = new Simulation(t), rec = new InputRecorder();
  sim.start();
  if (veh) sim.phys.vehicle = veh;
  const bot = new Autopilot(t.path, { latLimit: 56 * 0.8 });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 240; i++) {
    const inp = bot.control(sim.phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) { sim.rewind(); bot.reset(sim.phys); }
    if (ev && ev.type === 'finish') return { inputs: rec.encode(), time: sim.logic.time };
  }
  return null;
}
// n pas avec une commande fixe ; renvoie la simulation.
function drive(t, steps, inp, veh) {
  const sim = new Simulation(t);
  sim.start();
  if (veh) sim.phys.vehicle = veh;
  for (let i = 0; i < steps; i++) sim.step(typeof inp === 'function' ? inp(i) : inp);
  return sim;
}

console.log('Véhicules v2 et profils');
test('par défaut : Classique et modèles v1, la voiture lit SPECS tel quel ; signature et code inchangés', () => {
  assert.equal(specsOf(''), null);
  for (const d of BUILTIN_TRACKS.slice(0, 10)) {
    const t = buildBuiltin(d), sim = new Simulation(t);
    assert.equal(v2Of(t), false);
    assert.equal(sim.phys._specs, null); assert.equal(sim.phys.v2, false);
    for (const v of ['car', 'moto', 'boat', 'glider']) { sim.phys.vehicle = v; assert.equal(sim.phys.k, SPECS[v]); }
  }
  const t = track('lagon'), sig = t.signature(), code = t.encode();
  t.setParams({ vm: 1, pm: '' });
  assert.equal(t.signature(), sig); assert.equal(t.encode(), code);
});
test('règles vm et pm : bornées, dans la signature, code au format 4, relecture fidèle', () => {
  const t = Track.decode(track('lagon').encode()), sig = t.signature();
  t.setParams({ vm: 7, pm: 'turbo' });
  assert.deepEqual([t.vm, t.pm], [1, '']);
  t.setParams({ vm: 2, pm: 'sim' });
  assert.notEqual(t.signature(), sig);
  const code = t.encode();
  assert.equal(JSON.parse(b64decode(code.slice(5))).v, 4);
  const back = Track.decode(code);
  assert.deepEqual([back.vm, back.pm], [2, 'sim']);
  assert.equal(back.signature(), t.signature());
  assert.equal(v2Of(back), true);
  assert.equal(v2Of(track('lagon', { pm: 'sim' })), true, 'le profil Simulation met les modèles v2 en service');
  assert.equal(v2Of(track('lagon', { pm: 'arcade' })), false);
});
test('profils : aucun véhicule plus rapide en ligne droite (pointe, accélération, boost) ; Arcade accroche plus, Simulation moins', () => {
  for (const p of ['arcade', 'sim']) {
    const S = specsOf(p);
    assert.equal(specsOf(p), S, 'calculé une fois');
    for (const v of Object.keys(SPECS)) {
      for (const f of ['maxSpeed', 'accel', 'boostSpeed', 'boostAccel', 'boostTime', 'drag']) assert.equal(S[v][f], SPECS[v][f], `${p} ${v} ${f}`);
      assert.ok(Object.isFrozen(S[v]));
    }
  }
  assert.ok(specsOf('arcade').car.latGrip > SPECS.car.latGrip && specsOf('sim').car.latGrip < SPECS.car.latGrip);
  const line = (p) => drive(track('eclats', p), 600, { throttle: true, steer: 0 }).phys.fwdSpeed;
  const base = line(null);
  for (const p of ['arcade', 'sim']) assert.ok(Math.abs(line({ pm: p }) - base) < 0.5, `ligne droite ${p} : ${line({ pm: p })} contre ${base}`);
});
test('le circuit change avec le profil ou les modèles v2 (l’autopilote ne fait pas le même temps), et pas sans eux', () => {
  const b = botRun(track('serpent'));
  // (phase 2 : les modèles v2 concernent la moto, le bateau et le deltaplane ; la voiture n'en utilise aucun. Avant, « la voiture change avec vm = 2 » ne tenait qu'à une image d'écart
  // (31,217 contre 31,225 s) due à l'ancien modèle de dérapage ; on mesure donc l'effet des modèles v2 sur la moto, qui les utilise.)
  const mb = botRun(track('serpent'), 'moto'), mv2 = botRun(track('serpent', { vm: 2 }), 'moto');
  const sim = botRun(track('serpent', { pm: 'sim' })), arc = botRun(track('serpent', { pm: 'arcade' }));
  assert.ok(b && mb && mv2 && sim && arc, 'le pilote automatique finit');
  assert.notEqual(mv2.time, mb.time); assert.notEqual(sim.time, b.time); assert.notEqual(arc.time, b.time);
  assert.deepEqual(botRun(track('serpent')), b, 'v1 : toujours la même course');
});
test('moto v2 : elle penche dans un virage (bornée), se redresse en ligne droite ; au freinage la charge passe sur l’avant', () => {
  const t = track('eclats', { vm: 2 });
  const turn = drive(t, 200, (i) => ({ throttle: true, steer: i > 60 ? 1 : 0 }), 'moto');   // 0.9.12 : moteur plus vif, on tourne plus tôt (sinon la moto est déjà sortie de la route)
  assert.ok(Math.abs(turn.phys.lean) > 0.15 && Math.abs(turn.phys.lean) <= MAX_LEAN, `inclinaison ${turn.phys.lean}`);
  // (phase 2 : volant tenu 0,4 s au lieu de 0,83 s. Tenu 100 pas, la moto finissait de plein fouet dans la bordure (cap −82°, vitesse 15 → 0), restait nez au mur le temps du
  // dégagement automatique (~1 s, la bordure ne rebondit plus qu'en proportion du choc) puis pivotait : son inclinaison, qui suit le taux de lacet, n'était plus nulle à 400 pas.
  // Le test mesure le redressement en ligne droite, pas un choc de plein fouet.)
  const straight = drive(t, 400, (i) => ({ throttle: true, steer: i > 100 && i < 150 ? 1 : 0 }), 'moto');
  assert.ok(Math.abs(straight.phys.lean) < 0.05, `redressée ${straight.phys.lean}`);
  const brake = drive(t, 200, (i) => (i < 170 ? { throttle: true, steer: 0 } : { brake: true, steer: 0 }), 'moto');   // 0.9.12 : moteur plus vif, on freine plus tôt
  assert.ok(brake.phys.v2F > 1 && brake.phys.v2R < 1, `avant ${brake.phys.v2F}, arrière ${brake.phys.v2R}`);
  const v1 = drive(track('eclats'), 360, (i) => ({ throttle: true, steer: i > 120 ? 1 : 0 }), 'moto');
  assert.equal(v1.phys.lean, 0, 'v1 : pas d’inclinaison physique');
});
test('bateau v2 : houle déterministe, la coque la suit ; courant le long de la pièce', () => {
  assert.equal(waveAt(10, 20, 3.5), waveAt(10, 20, 3.5));
  assert.notEqual(waveAt(10, 20, 3.5), waveAt(10, 20, 4.5));
  const ph = { pos: { x: 5, y: 0, z: 7 }, time: 2, heave: 0 };
  const r0 = { ...boat2Water(ph, { r: 0 }, 0, -1, 1, 0, 9.8, 1 / 120) };
  assert.equal(ph.heave, waveAt(5, 7, 2));
  const still = { pos: { x: 5, y: 0, z: 7 }, time: 2, heave: 0 }, r1 = { ...boat2Water(still, null, 0, -1, 1, 0, 9.8, 1 / 120) };
  assert.ok(r0.dvf - r1.dvf > 0.01, 'le courant (vers le haut de la pièce) pousse vers l’avant de la coque tournée vers -z');
});
test('deltaplane v2 : ascendances déterministes, plus fortes sur l’axe, portance qui baisse en altitude', () => {
  let found = null;
  for (let i = 0; i < 40 && !found; i++) for (let j = 0; j < 40 && !found; j++) { const th = thermalOf(5, i, j); if (th) found = th; }
  assert.ok(found);
  assert.deepEqual(thermalOf(5, Math.floor(found.x / 64), Math.floor(found.z / 64)), found);
  assert.ok(thermalLift(5, found.x, 10, found.z) > THERMAL_ACC * 0.8);
  assert.ok(thermalLift(5, found.x + 9, 10, found.z) < thermalLift(5, found.x, 10, found.z));
  assert.equal(thermalLift(5, found.x, 9999, found.z), 0, 'pas au-dessus du plafond');
  assert.equal(altitudeK(0), 1); assert.ok(altitudeK(300) < altitudeK(200)); assert.ok(altitudeK(99999) >= 0.45);
});
test('catégories : véhicules v2 refusée sur un circuit tout en voiture, acceptée avec une moto ; profils partout', () => {
  assert.equal(variantFits(track('eclats'), { vm: '2' }), false);
  assert.equal(variantFits(track('lagon'), { vm: '2' }), true);
  assert.equal(variantFits(track('eclats'), { pm: 'arcade' }), true);
  assert.equal(variantFits(track('eclats'), { pm: 'sim' }), true);
  assert.equal(variantFits(track('eclats', { pm: 'sim' }), { pm: 'sim' }), false, 'déjà en Simulation : rien ne change');
});
test('le serveur vérifie une course sous le profil Simulation dans SA catégorie, et la refuse au classement officiel', () => {
  const k = keyOf('lagon'), vk = k + '~v1.pm-sim';
  const r = botRun(applyVariant(track('lagon'), { pm: 'sim' }));
  assert.ok(r);
  const ok = verifyRun({ trackKey: vk, inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(ok.ok, true, ok.error);
  const off = verifyRun({ trackKey: k, inputs: r.inputs, time: r.time, physVer: PHYS_VER });
  assert.equal(off.ok, false);
});

test('laboratoire : mêmes commandes, deux réglages ; écart par secteur, le circuit n’est pas modifié', () => {
  const t = track('serpent'), sig = t.signature(), code = t.encode();
  const r = botRun(t);
  const same = labCompare(t, r.inputs, 'track', 'classic');
  assert.ok(same.same, 'tel quel = Classique v1 sur ce circuit');
  assert.equal(same.firstDiff, 0); assert.ok(same.A.finished && Math.abs(same.A.time - r.time) < 1e-9, 'la course rejouée est celle du record');
  assert.deepEqual(same.cmp.map((c) => c.diff), same.cmp.map(() => 0));
  const cmp = labCompare(t, r.inputs, 'track', 'sim');
  assert.equal(cmp.same, false);
  assert.ok(cmp.firstDiff > 0, 'les courses se séparent');
  assert.ok(cmp.cmp.length > 0 && cmp.delta.dt.length > 2);
  assert.ok(cmp.B.reached > 0 && cmp.B.reached <= 1);
  assert.equal(t.signature(), sig); assert.equal(t.encode(), code, 'circuit intact');
  for (const s of LAB_SETUPS) { const c = labTrack(t, s); if (s.p) assert.notEqual(c, t); }
});

await finish('Tous les tests des véhicules v2 et des profils passent.');
