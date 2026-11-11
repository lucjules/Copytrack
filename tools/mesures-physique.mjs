// Mesures du comportement physique (phase 2) : contacts de bordure, dérapage, mini-turbo, sauts et réceptions, sur le VRAI moteur.
//
//   node tools/mesures-physique.mjs                    affiche les tableaux (racine = ce dépôt)
//   COPYTRACK_ROOT=/autre/copie node tools/mesures-physique.mjs   mêmes mesures sur une autre copie du dépôt (avant / après un changement de physique)
//   node tools/mesures-physique.mjs --json             sortie JSON (utilisée par tools/test-physique-corrections.mjs)
//
// Chaque mesure est une fonction pure (circuit scripté, commandes imposées, pas de hasard) : mêmes nombres à chaque exécution.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.COPYTRACK_ROOT || join(here, '..'));
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { Track, scriptTrack } = await imp('js/track.js');
const { CarPhysics } = await imp('js/physics.js');
const { RaceLogic, placeAtStart } = await imp('js/raceLogic.js');
const { Autopilot } = await imp('js/autopilot.js');
const { DT, CELL, LEVEL_H } = await imp('js/constants.js');
const KMH = 3.6;
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;

// ---- Outils ------------------------------------------------------------------------------------------------------------------------------
export function flat(script, { l = 4, v0 = 0 } = {}) {
  const tr = scriptTrack('m', script, { l });
  const ph = new CarPhysics(tr), lg = new RaceLogic(tr); placeAtStart(ph, lg); ph.graceT = 0;
  if (v0) { ph.vel.z = -v0 / KMH; ph.fwdSpeed = v0 / KMH; }
  return { tr, ph, lg };
}
// Grande plateforme sans bordure, à la hauteur de la route : le comportement pur de la voiture.
export function arena(n = 30, surf = {}, { l = 4, vehicle = 'car', pm = '' } = {}) {
  const tr = new Track('arene');
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) tr.add(Track.normalize({ t: 'platform', x, z, l, r: 0, ...surf }));
  if (pm) tr.setParams({ pm });
  const ph = new CarPhysics(tr);
  ph.place((n * CELL) / 2, l * LEVEL_H + 0.4, (n * CELL) * 0.8, 0);
  ph.graceT = 0; ph.hazardGrace = 0; ph.vehicle = vehicle;
  if (ph.surfType !== 'road') throw new Error('arène : la voiture n\'est pas sur la plateforme');
  return { tr, ph };
}
export const setSpeed = (ph, ms) => { ph.vel.x = -Math.sin(ph.yaw) * ms; ph.vel.z = -Math.cos(ph.yaw) * ms; ph.fwdSpeed = ms; };
const slipDeg = (ph) => { const fx = -Math.sin(ph.yaw), fz = -Math.cos(ph.yaw), vf = ph.vel.x * fx + ph.vel.z * fz, vl = ph.vel.x * -fz + ph.vel.z * fx; return (Math.atan2(vl, Math.max(2, Math.abs(vf))) * 180) / Math.PI; };

// ---- 1. Contacts de bordure ------------------------------------------------------------------------------------------------------------
// Voiture proche de la bordure droite d'une route droite, gaz tenus, volant neutre, incidence `ang` (°) et vitesse `v0` (km/h).
export function wallContact(v0, ang, { secs = 9, ceiling = false, steerAway = false } = {}) {
  const { ph } = ceiling ? flat('start^ S30^ finish^') : flat('start S30 finish');
  const a = (ang * Math.PI) / 180;
  ph.yaw = -a; ph.vel.x = Math.sin(a) * (v0 / KMH); ph.vel.z = -Math.cos(a) * (v0 / KMH); ph.pos.x = ceiling ? 8 : 24;
  if (ceiling) { ph.vel.x = -ph.vel.x; ph.yaw = a; ph.pos.x = 24; }
  let tHit = null, vHit = 0, contact = 0, impact = 0, omegaMax = 0, bad = false;
  const out = [];
  for (let i = 0; i < secs * 120; i++) {
    const t = i * DT;
    ph.clock = i; ph.step({ steer: steerAway && tHit !== null && t > tHit + 0.3 ? -1 : 0, throttle: true, brake: false });
    if (![ph.pos.x, ph.pos.y, ph.pos.z, ph.vel.x, ph.vel.y, ph.vel.z, ph.yaw, ph.omega].every(Number.isFinite)) { bad = true; break; }
    if (ph.ev.wall > 0.01) { if (tHit === null) { tHit = t; vHit = ph.speed * KMH; impact = ph.ev.wall; } contact++; }
    if (tHit !== null) omegaMax = Math.max(omegaMax, Math.abs(ph.omega));
    out.push([t, ph.speed * KMH]);
  }
  if (tHit === null) return { hit: false };
  const at = (dt) => (out.find((o) => o[0] >= tHit + dt) || out[out.length - 1])[1];
  return { hit: true, normal: r1(impact), vHit: Math.round(vHit), v05: Math.round(at(0.5)), v2: Math.round(at(2)), v5: Math.round(at(5)), contactS: r2(contact / 120), spin: r2(omegaMax), bad };
}

// ---- 2. Dérapage -------------------------------------------------------------------------------------------------------------------------
// Scénarios de commandes (volant à droite) : brake = frein seul, both = gaz + frein, tap = frein bref pour décrocher puis gaz tenu, volant tenu, contre-braquage final.
const DRIFT = {
  brake: (t) => ({ steer: t < 1.6 ? 1 : 0, brake: t > 0.3 && t < 1.3 }),
  both: (t) => ({ steer: t < 1.6 ? 1 : 0, brake: t > 0.3 && t < 1.3, throttle: true }),
  gas: (t) => ({ steer: t < 1.6 ? 1 : 0, throttle: true }),
  tap: (t) => ({ steer: t < 1.7 ? 1 : t < 2.0 ? -0.5 : 0, brake: t > 0.3 && t < 0.55, throttle: t > 0.55 }),
  tapBoth: (t) => ({ steer: t < 1.7 ? 1 : t < 2.0 ? -0.5 : 0, brake: t > 0.3 && t < 0.55, throttle: true }),
};
export function driftRun(v0, scenario, { vehicle = 'car', surf = {}, pm = '', secs = 4.5, noTurbo = false } = {}) {
  const { ph } = arena(30, surf, { vehicle, pm });
  setSpeed(ph, v0 / KMH);
  const f = DRIFT[scenario];
  let slipMax = 0, turbo = 0, tTurbo = 0, tDrift = 0, bad = false, v17 = 0, yaw17 = 0, vEnd = 0;
  const yaw0 = ph.yaw;
  const trace = [];
  for (let i = 0; i < secs * 120; i++) {
    const t = i * DT;
    ph.clock = i; ph.step({ steer: 0, throttle: false, brake: false, ...f(t) });
    if (![ph.pos.x, ph.vel.x, ph.vel.z, ph.yaw].every(Number.isFinite)) { bad = true; break; }
    slipMax = Math.max(slipMax, Math.abs(slipDeg(ph)));
    if (ph.driftT > 0.3) tDrift += DT;
    if (ph.ev.miniTurbo && !turbo) { turbo = ph.ev.miniTurbo; tTurbo = t; if (noTurbo) { ph.boost = 0; } }
    else if (ph.ev.miniTurbo && noTurbo) ph.boost = 0;
    if (noTurbo && turbo) ph.boost = 0;
    if (Math.abs(t - 1.7) < DT / 2) { v17 = ph.speed * KMH; yaw17 = Math.abs(ph.yaw - yaw0) * 180 / Math.PI; }
    trace.push(ph.speed * KMH);
  }
  vEnd = trace[trace.length - 1] || 0;
  const vmin = Math.min(...trace);
  const out = { v0, scenario, v17: Math.round(v17), keep: r2(v17 / v0), vmin: Math.round(vmin), vEnd: Math.round(vEnd), slipMax: Math.round(slipMax), driftS: r2(tDrift), turbo, tTurbo: r2(tTurbo), yaw17: Math.round(yaw17), slipEnd: Math.round(Math.abs(slipDeg(ph))), bad };
  out.trace = trace;
  if (!noTurbo && turbo) { const w = driftRun(v0, scenario, { vehicle, surf, pm, secs, noTurbo: true }); const k = Math.min(trace.length - 1, Math.round((tTurbo + 1.2) * 120)); out.turboGain = Math.round(trace[k] - w.trace[k]); } else out.turboGain = 0;
  if (!noTurbo) delete out.trace;
  return out;
}

// Virage de 90° puis ligne droite jusqu'à une porte à 150 m sur le côté (x) : temps pour l'atteindre et vitesse. Stratégies :
//  grip  = plein volant à gaz tenus jusqu'à 90°, puis ligne droite ;
//  drift = frein bref (0,25 s) pour décrocher puis gaz tenus, volant tenu jusqu'à 70° de cap, contre-braquage jusqu'à la fin de la glisse, puis ligne droite ;
//  brake = frein tenu pendant le virage (le « dérapage » d'avant : on freine).
export function cornerBench(v0, strategy, { vehicle = 'car', surf = {}, pm = '' } = {}) {
  const { ph } = arena(40, surf, { vehicle, pm });
  setSpeed(ph, v0 / KMH);
  const x0 = ph.pos.x, yaw0 = ph.yaw;
  let t = 0, done = false, phase = 0, turbo = 0, spin = false;
  for (let i = 0; i < 120 * 14 && !done; i++) {
    t = i * DT;
    const turned = (ph.yaw - yaw0) * -1;            // cap tourné vers la droite (rad, > 0)
    let inp = { steer: 0, throttle: true, brake: false };
    if (strategy === 'grip') inp = { steer: turned < 1.5 ? 1 : 0, throttle: true };
    else if (strategy === 'drift') {
      if (phase === 0) inp = { steer: 1, brake: t < 0.25, throttle: t >= 0.25 };
      if (phase === 0 && turned > 1.15) phase = 1;
      if (phase === 1) { inp = { steer: -0.6, throttle: true }; if (Math.abs(slipDeg(ph)) < 3 || turned > 1.6) phase = 2; }
      if (phase === 2) inp = { steer: turned < 1.57 - 0.0 ? 0.3 : -0.3 * Math.sign(turned - 1.57), throttle: true };
    } else if (strategy === 'brake') inp = { steer: turned < 1.5 ? 1 : 0, brake: turned < 1.5 };
    ph.clock = i; ph.step(inp);
    if (ph.ev.miniTurbo) turbo = ph.ev.miniTurbo;
    if (Math.abs(ph.yaw - yaw0) > 2.6) spin = true;
    if (ph.pos.x - x0 >= 150) done = true;
  }
  return { v0, strategy, t: done ? r2(t) : null, vGate: Math.round(ph.speed * KMH), turbo, spin: spin || Math.abs((ph.yaw - yaw0) + Math.PI / 2) > 0.6 };
}

// ---- 3. Sauts et réceptions ------------------------------------------------------------------------------------------------------------
// Tremplin (UU, 22°) abordé à `v0` km/h ; commande donnée EN L'AIR : none | gas | brake | tapGas (0,25 s) | tapBrake (0,3 s).
const AIR = { none: () => ({}), gas: () => ({ throttle: true }), brake: () => ({ brake: true }), tapGas: (a) => ({ throttle: a < 0.25 }), tapBrake: (a) => ({ brake: a < 0.3 }), gasSteer: () => ({ throttle: true, steer: 1 }) };
export function jumpRun(v0, air, { script = 'start S3 UU G2 S4 finish', l = 2, vehicle = 'car' } = {}) {
  const tr = scriptTrack('j', script, { l });
  const ph = new CarPhysics(tr), lg = new RaceLogic(tr); placeAtStart(ph, lg); ph.graceT = 0; ph.vehicle = vehicle;
  const bot = new Autopilot(tr.path); bot.reset(ph);
  ph.vel.z = -v0 / KMH; ph.fwdSpeed = v0 / KMH;
  const f = AIR[air];
  let took = false, tTake = 0, vTake = 0, res = null, pitchMax = 0;
  for (let i = 0; i < 120 * 14 && !res; i++) {
    const t = i * DT, b = bot.control(ph);
    const inAir = !ph.grounded && ph.pos.y > 14;
    let c;
    if (inAir && ph.vel.y > -60) { if (!took) { took = true; tTake = t; vTake = ph.speed * KMH; } c = f(t - tTake); pitchMax = Math.max(pitchMax, Math.abs(ph.pitch)); } else c = { throttle: ph.speed * KMH < v0 };
    ph.clock = i; ph.step({ steer: c.steer ?? b.steer, throttle: !!c.throttle, brake: !!c.brake });
    if (took && ph.ev.land > 0) res = { vLand: ph.speed * KMH, q: ph.ev.landQ, air: t - tTake, pitchAtLand: ph.pitch };
  }
  if (!res) return { v0, air, ok: false };
  return { v0, air, ok: true, vTake: Math.round(vTake), vLand: Math.round(res.vLand), loss: Math.round((1 - res.vLand / vTake) * 100), q: res.q, airS: r2(res.air), pitchPeak: r2(pitchMax) };
}

// ---- Tableaux ---------------------------------------------------------------------------------------------------------------------------------
export function allMeasures() {
  const M = { wall: [], drift: [], jump: [], corner: [] };
  for (const v of [100, 200, 280]) for (const a of [2, 5, 10, 20, 45]) M.wall.push({ v, a, ...wallContact(v, a) });
  for (const v of [80, 120, 160, 200]) for (const s of ['brake', 'both', 'gas', 'tap', 'tapBoth']) M.drift.push(driftRun(v, s));
  for (const v of [100, 200]) for (const a of ['none', 'gas', 'brake', 'tapGas', 'tapBrake']) M.jump.push(jumpRun(v, a));
  M.corner = [];
  for (const v of [100, 140, 180]) for (const st of ['grip', 'drift', 'brake']) M.corner.push(cornerBench(v, st));
  return M;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const M = allMeasures();
  if (process.argv.includes('--json')) console.log(JSON.stringify(M));
  else {
    console.log(`Racine : ${root}\n\nBORDURE (gaz tenus, volant neutre) — vitesse au contact → +0,5 s → +2 s → +5 s ; durée du contact ; rotation max`);
    for (const m of M.wall) console.log(`  ${String(m.v).padStart(3)} km/h ${String(m.a).padStart(2)}° : ` + (m.hit ? `normal ${m.normal} m/s | ${m.vHit} → ${m.v05} → ${m.v2} → ${m.v5} | contact ${m.contactS} s | rot ${m.spin}` : 'pas de contact'));
    console.log('\nDÉRAPAGE (volant à droite 1,7 s) — vitesse à 1,7 s et part conservée, vitesse mini, dérive max, durée du dérapage, mini-turbo (niveau ; gain 1,2 s après, mesuré par une 2e course sans turbo), cap tourné');
    for (const m of M.drift) console.log(`  ${String(m.v0).padStart(3)} km/h ${m.scenario.padEnd(8)} : à 1,7 s ${String(m.v17).padStart(3)} km/h (${Math.round(m.keep * 100)} %) mini ${String(m.vmin).padStart(3)} | dérive max ${String(m.slipMax).padStart(2)}° | dérapage ${m.driftS} s | turbo niveau ${m.turbo} (+${m.turboGain} km/h 1,2 s après) | cap à 1,7 s ${m.yaw17}° | dérive finale ${m.slipEnd}°${m.bad ? ' NON FINI' : ''}`);
    console.log('\nVIRAGE DE 90° puis porte à 150 m — temps, vitesse à la porte, mini-turbo');
    for (const m of M.corner) console.log(`  ${String(m.v0).padStart(3)} km/h ${m.strategy.padEnd(6)} : ${m.t === null ? 'porte non atteinte' : m.t + ' s'} | ${m.vGate} km/h | turbo ${m.turbo}${m.spin ? ' | cap hors cible' : ''}`);
    console.log('\nSAUT (tremplin 22°, commande en l\'air) — vitesse au décollage → à la réception, perte, qualité, tangage maxi');
    for (const m of M.jump) console.log(`  ${String(m.v0).padStart(3)} km/h ${m.air.padEnd(8)} : ` + (m.ok ? `${m.vTake} → ${m.vLand} (−${m.loss} %) ${m.q} | vol ${m.airS} s | tangage ${m.pitchPeak} rad` : 'pas de réception'));
  }
}
