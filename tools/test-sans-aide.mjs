// Pilotage sans aide (0.11.1, PHYS_VER 37) : node tools/test-sans-aide.mjs   (npm test)
//  - loopings, tire-bouchons, transitions vers un mur : la route ne guide plus le cap ; mains lâchées on finit dans la bordure ou dans le vide, au volant on passe ;
//  - murs : la gravité tire pleinement vers le bas et le nez pique ; mains lâchées on tombe, volant tenu on garde sa ligne ;
//  - en l'air : la voiture bascule nez en bas en quittant un bord (mesuré), rien ne la redresse, ni les gaz ni le volant n'agissent ; l'aérofrein
//    amortit la rotation, et c'est lui qui fait les réceptions parfaites (le petit contrôle en l'air, qui fait gagner des dixièmes).
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { scriptTrack } from '../js/track.js';
import { rolledRibbon } from '../js/pieces.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { CAR } from '../js/physics/specs.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { DT } from '../js/constants.js';
import { runTrack } from './lab.mjs';

// Mains lâchées : le pilote automatique, mais volant à zéro sur les routes roulées et les loopings.
const HANDS_OFF = { control: (phys, bot) => { const c = bot.control(phys); if (phys.rib && rolledRibbon(phys.rib.tile)) c.steer = 0; return c; } };
const clean = (S) => S.ok && S.respawns === 0 && S.wallHits === 0;

test('loopings, looping modulaire décalé, tire-bouchon : au volant on passe sans toucher ; mains lâchées, la voiture finit dans la bordure ou dans le vide', () => {
  for (const sc of ['start B2 S4 O S4 finish', 'start B2 S4 LPR2 S4 finish', 'start B2 S4 LPL4 S4 finish', 'start B2 S4 OT S4 finish']) {
    const A = runTrack(scriptTrack('t', sc, { l: 1 }), { maxTime: 40 }), H = runTrack(scriptTrack('t', sc, { l: 1 }), { maxTime: 40, driver: HANDS_OFF });
    assert.ok(A.ok && A.respawns === 0, `${sc} : au volant ${A.reason}`);
    assert.ok(!clean(H), `${sc} : mains lâchées, la voiture passe encore (${H.time.toFixed(1)} s)`);
  }
});
test('murs (wall-rides de 2 à 6 cases, mur gauche ou droit, virage sur le mur) : au volant on tient, mains lâchées on tombe', () => {
  for (const sc of ['start B2 S3 [tr01s] S2< [tr10s] S4 finish', 'start B2 S3 [tr02s] S4> [tr20s] S4 finish', 'start B2 S3 [tr02l] S6> [tr20l] S4 finish', 'start B2 S3 [tr01s] R< [tr10s] S4 finish']) {
    const A = runTrack(scriptTrack('t', sc, { l: 8 }), { maxTime: 40 }), H = runTrack(scriptTrack('t', sc, { l: 8 }), { maxTime: 40, driver: HANDS_OFF });
    assert.ok(clean(A), `${sc} : au volant ${A.reason || A.wallHits + ' chocs'}`);
    assert.ok(H.respawns > 0 || !H.ok, `${sc} : mains lâchées, la voiture tient encore le mur`);
  }
});
test('circuits officiels : le pilote automatique les finit tous ; mains lâchées sur les rubans, moins de la moitié se finissent (avant : les trois quarts)', () => {
  let hands = 0;
  for (const d of BUILTIN_TRACKS) if (clean(runTrack(buildBuiltin(d), { driver: HANDS_OFF }))) hands++;
  assert.ok(hands < BUILTIN_TRACKS.length / 2, `${hands} circuits finis mains lâchées`);
});

// ---- En l'air ---------------------------------------------------------------------------------------------------------------------------
// Bord de falaise plat (comme la mesure de référence) : la voiture roule à v puis quitte la route ; on relève la vitesse de tangage juste après.
function edge(kmh, inAir = {}) {
  const tr = scriptTrack('e', 'start S G6 S finish', { l: 20 });
  const ph = new CarPhysics(tr), lg = new RaceLogic(tr); placeAtStart(ph, lg); ph.graceT = 0;
  ph.vel.z = -kmh / 3.6; ph.fwdSpeed = kmh / 3.6;
  let took = -1; const rows = [];
  for (let i = 0; i < 120 * 20; i++) {
    const air = !ph.grounded && !ph.rib;
    ph.clock = i; ph.step(air ? inAir : { throttle: ph.speed * 3.6 < kmh });
    if (!ph.grounded && !ph.rib) { if (took < 0) took = i; rows.push({ t: (i - took) * DT, pitch: ph.pitch, rate: ph.pitchRate, yaw: ph.yaw }); }
    else if (took >= 0) break;
  }
  return rows;
}
test('décollage d\'un bord plat : la voiture bascule nez en bas, d\'autant plus qu\'elle est lente (mesuré : 65 °/s à 39 km/h, 38 à 78, 26 à 140, 16 à 225)', () => {
  const deg = (kmh) => -edge(kmh)[2].rate * 57.3;
  for (const [kmh, want] of [[39, 65], [78, 38], [140, 26], [225, 16]]) assert.ok(Math.abs(deg(kmh) - want) / want < 0.25, `${kmh} km/h : ${deg(kmh).toFixed(1)} °/s (référence ${want})`);
  assert.ok(deg(60) > deg(120) && deg(120) > deg(240));
});
test('en vol, la rotation est GARDÉE (aucun redressement) ; l\'aérofrein l\'amortit (≈ 1 /s, mesuré 28 → 7 °/s en 1,6 s) ; 0.12.3 : les pédales penchent la voiture d\'un angle borné, le volant la tourne en douceur', () => {
  const none = edge(150), gas = edge(150, { throttle: true }), steer = edge(150, { steer: 1 }), brake = edge(150, { brake: true }), both = edge(150, { brake: true, throttle: true });
  const at = (rows, t) => rows.find((r) => r.t >= t);
  const r0 = at(none, 0.05).rate, r1 = at(none, 1.05).rate;
  assert.ok(r1 / r0 > 0.85 && r1 / r0 <= 1, `sans commande : ${(r0 * 57.3).toFixed(1)} → ${(r1 * 57.3).toFixed(1)} °/s en 1 s`);
  assert.ok(at(none, 1).pitch < -0.3, 'le nez a piqué de plus de 17° en une seconde');
  // Gaz : le nez descend vers CAR.airLean de plus (≈ 22°), pas au-delà : aucun tour complet aux pédales ; le cap ne bouge pas.
  const dGas = at(none, 1.5).pitch - at(gas, 1.5).pitch;
  assert.ok(dGas > 0.8 * CAR.airLean && dGas <= CAR.airLean + 1e-9, `gaz : ${(dGas * 57.3).toFixed(1)}° de plus vers le bas après 1,5 s (borne ${(CAR.airLean * 57.3).toFixed(0)}°)`);
  const dGasMax = Math.max(...gas.slice(0, Math.min(gas.length, none.length)).map((r, i) => none[i].pitch - r.pitch));
  assert.ok(dGasMax <= CAR.airLean + 1e-9, 'jamais plus que la bascule maximale, même en tenant les gaz tout le vol');
  assert.deepEqual(gas.slice(0, 100).map((r) => r.yaw), none.slice(0, 100).map((r) => r.yaw), 'gaz : le cap ne bouge pas');
  // Volant : le cap tourne en douceur (≤ CAR.airYaw), du côté du volant (à droite : le cap diminue) ; l'assiette ne change pas.
  assert.deepEqual(steer.slice(0, 100).map((r) => r.pitch), none.slice(0, 100).map((r) => r.pitch), 'volant : l\'assiette ne change pas');
  const dYaw = at(none, 1).yaw - at(steer, 1).yaw;
  assert.ok(dYaw > 0.2 && dYaw < CAR.airYaw, `volant à droite : ${(dYaw * 57.3).toFixed(1)}° de rotation en 1 s`);
  for (let i = 1; i < Math.min(80, steer.length); i++) assert.ok(Math.abs((steer[i].yaw - steer[i - 1].yaw) - (none[i].yaw - none[i - 1].yaw)) / DT <= CAR.airYaw + 1e-9, 'jamais plus vite que CAR.airYaw');
  // Frein : l'aérofrein amortit la rotation (≈ 1 /s) et le nez remonte (bascule) ; les deux pédales ensemble : l'aérofrein seul, sans bascule.
  const b0 = at(brake, 0.05).rate, b1 = at(brake, 1.05).rate, k = Math.log(b0 / b1);
  assert.ok(Math.abs(k - CAR.airBrake) < 0.15, `aérofrein : ${k.toFixed(2)} /s`);
  assert.ok(Math.abs(at(brake, 2).pitch) < 0.55 * Math.abs(at(none, 2).pitch), `freiner en l'air garde la voiture bien plus à plat (${(at(brake, 2).pitch * 57.3).toFixed(0)}° contre ${(at(none, 2).pitch * 57.3).toFixed(0)}° après 2 s)`);
  const lean = at(brake, 1.5).pitch - at(both, 1.5).pitch;
  assert.ok(lean > 0.8 * CAR.airLean && lean <= CAR.airLean + 1e-9, `frein seul : le nez remonte de ${(lean * 57.3).toFixed(1)}° de plus qu'avec les deux pédales`);
  assert.ok(Math.abs(at(both, 1.05).rate - b1) < 1e-9, 'les deux pédales : même amortissement que le frein');
});

await finish('Tous les tests du pilotage sans aide passent.');
