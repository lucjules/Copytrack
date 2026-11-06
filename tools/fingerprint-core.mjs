// Empreinte de la physique : garde-fou de PHYS_VER et du déterminisme (node tools/phys-fingerprint.mjs).
//
// Rejoue des centaines de courses (pilote automatique et commandes pseudo-aléatoires sur les 66 circuits, défis du jour, circuits
// spéciaux : obstacles, pièces mobiles, bifurcation, revêtements) et condense l'état exact de la voiture (bits des flottants) en un
// hachage par scénario. Le fichier tools/phys-fingerprint.json mémorise ces hachages POUR LA VERSION PHYS_VER en cours :
//   - la physique change sans que PHYS_VER bouge  -> échec (les replays et les records seraient silencieusement faussés) ;
//   - PHYS_VER change sans que l'empreinte soit remise à jour -> échec (rien n'a été vérifié).
// Ce fichier est le calcul (sans entrées-sorties : il tourne aussi dans le navigateur, voir tools/test-browser.mjs) ; phys-fingerprint.mjs en est
// le programme en ligne de commande.
// Après un changement voulu : incrémenter PHYS_VER (js/version.js), puis  node tools/phys-fingerprint.mjs --update
//
//   node tools/phys-fingerprint.mjs            vérifie (npm test)
//   node tools/phys-fingerprint.mjs --update   réécrit tools/phys-fingerprint.json
//   node tools/phys-fingerprint.mjs --print    affiche l'empreinte (sert à comparer deux moteurs : node, deno, navigateur)
//   deno run -A tools/phys-fingerprint.mjs     même programme sous Deno, le moteur de la fonction serveur
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, scriptTrack } from '../js/track.js';
import { CarPhysics } from '../js/physics.js';
import { InputRecorder, GhostRunner } from '../js/replay.js';
import { dailyChallenge } from '../js/daily.js';
import { PHYS_VER } from '../js/version.js';
import { dsin, datan2, hypot2 } from '../js/dmath.js';


// ---- Hachage des bits des flottants (deux voies FNV-1a de 32 bits) -----------------------------------------------------------------------
class Hash {
  constructor() {
    this.a = 0x811c9dc5; this.b = 0x9e3779b9;
    this.view = new DataView(new ArrayBuffer(8));
  }
  word(x) {
    this.a = Math.imul(this.a ^ x, 16777619) >>> 0;
    this.b = Math.imul(((this.b ^ x) + 0x7f4a7c15) | 0, 0x85ebca6b) >>> 0;
  }
  f(x) {
    this.view.setFloat64(0, Number.isNaN(x) ? NaN : x, true);
    this.word(this.view.getUint32(0, true)); this.word(this.view.getUint32(4, true));
  }
  i(x) { this.word(x >>> 0); }
  hex() { return this.a.toString(16).padStart(8, '0') + this.b.toString(16).padStart(8, '0'); }
}

const VEH = ['car', 'moto', 'boat', 'glider'];
function sampleState(h, phys, steps) {
  const p = phys;
  h.f(p.pos.x); h.f(p.pos.y); h.f(p.pos.z);
  h.f(p.vel.x); h.f(p.vel.y); h.f(p.vel.z);
  h.f(p.yaw); h.f(p.omega); h.f(p.steer); h.f(p.boost); h.f(p.driftCharge); h.f(p.gravMul); h.f(p.pitch);
  h.i(p.gSign < 0 ? 1 : 0); h.i(p.grounded ? 1 : 0); h.i(p.rib ? 1 + Math.round(p.rib.u * 1e6) : 0);
  h.i(VEH.indexOf(p.vehicle)); h.i(p.broken.size); h.i(steps);
}

// Générateur pseudo-aléatoire déterministe (sans Math.random).
function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Commandes aléatoires par blocs de 20 à 60 pas : volant, gaz, frein, de temps en temps un retour au checkpoint.
function randomInputs(seed, steps) {
  const r = lcg(seed), rec = new InputRecorder();
  let left = 0, steer = 0, throttle = true, brake = false;
  for (let i = 0; i < steps; i++) {
    if (left-- <= 0) {
      left = 20 + Math.floor(r() * 40);
      steer = [-1, -0.5, -0.2, 0, 0, 0.2, 0.5, 1][Math.floor(r() * 8)];
      throttle = r() < 0.85; brake = !throttle && r() < 0.6;
    }
    rec.push({ steer, throttle, brake }, i > 0 && i % 700 === 0);
  }
  return rec.encode();
}

function runGhost(track, opts, maxSteps, every = 30) {
  const h = new Hash();
  const g = new GhostRunner(track, opts);
  let n = 0;
  while (!g.done && n < maxSteps) {
    g.step(); n++;
    if (n % every === 0) sampleState(h, g.phys, g.logic.steps);
  }
  sampleState(h, g.phys, g.logic.steps);
  h.i(n); h.i(g.logic.finished ? 1 : 0); h.f(g.logic.steps);
  return h.hex();
}

// Conduite directe (sans logique de course) sur un circuit : pour les pièces qui ne se croisent pas avec un départ.
function runDirect(track, spawn, steps, inputFn) {
  const h = new Hash();
  const phys = new CarPhysics(track);
  phys.place(spawn.x, spawn.y, spawn.z, spawn.yaw || 0, spawn.gs || 1);
  if (spawn.vel) { phys.vel.x = spawn.vel[0]; phys.vel.y = spawn.vel[1]; phys.vel.z = spawn.vel[2]; }
  const inp = { steer: 0, throttle: true, brake: false, drift: false };
  for (let i = 0; i < steps; i++) {
    inputFn(i, inp);
    phys.clock = i;
    phys.step(inp);
    if (i % 30 === 0) sampleState(h, phys, i);
  }
  sampleState(h, phys, steps);
  return h.hex();
}

// ---- Circuits spéciaux ---------------------------------------------------------------------------------------------------------------
function placeObstacles(track, specs) {
  const P = track.path, n = P.length;
  for (const o of specs) {
    const i = Math.min(n - 2, Math.floor(n * o.at));
    const a = P[i], b = P[i + 1];
    const dx = b[0] - a[0], dz = b[2] - a[2], l = hypot2(dx, dz) || 1;
    const q = (v, st) => Math.round(v / st) * st;
    track.addDeco({ k: o.k, x: q(a[0] + (-dz / l) * (o.side || 0), 0.5), y: q(a[1], 0.1), z: q(a[2] + (dx / l) * (o.side || 0), 0.5), ry: +q(datan2(dx / l, dz / l), Math.PI / 8).toFixed(4), s: o.s || 1, c: 0, ph: o.ph || 0 });
  }
}

function customScenarios() {
  const out = {};
  // 1. Les sept obstacles posés le long d'une ligne droite : piques, boules, marteau, mur coulissant, balayeur, bumper.
  const obst = scriptTrack('obstacles', 'start S3 S3 S3 S3 C S3 S3 finish');
  placeObstacles(obst, [
    { k: 'spikesPop', at: 0.12 }, { k: 'pendulum', at: 0.22 }, { k: 'hammer', at: 0.32 }, { k: 'slider', at: 0.42 },
    { k: 'sweeper', at: 0.52 }, { k: 'bumper', at: 0.6, side: 3 }, { k: 'spikes', at: 0.7, side: -6 }, { k: 'pendulum', at: 0.78, ph: 0.5, s: 1.5 },
  ]);
  out['custom:obstacles:bot'] = runGhost(obst, { bot: true }, 120 * 60);
  out['custom:obstacles:noise'] = runGhost(obst, { inputs: randomInputs(11, 3000) }, 3000);
  // 2. Ascenseur, glissière, rotation : le départ, puis des pièces qui bougent.
  const mv = scriptTrack('mobiles', 'start S2 S2~ S2 S2= S2 S2~ S2 finish');
  out['custom:movers:bot'] = runGhost(mv, { bot: true }, 120 * 60);
  out['custom:movers:noise'] = runGhost(mv, { inputs: randomInputs(23, 3000) }, 3000);
  const spin = new Track('rotation');
  spin.add({ t: 'start', x: 3, z: 3, l: 0, r: 0 });
  spin.add({ t: 'platform', x: 0, z: 0, l: 0, r: 0, mv: 3, ms: 120, ma: 360 });
  spin.add({ t: 'platform', x: 0, z: -4, l: 0, r: 0, mv: 3, ms: -80, ma: 180 });
  out['custom:rotation'] = runDirect(spin, { x: 16 + 7, y: 0.4, z: 16 + 4, yaw: 0.3 }, 2400, (i, inp) => { inp.steer = dsin(i * 0.013) * 0.7; inp.throttle = (i % 400) < 330; inp.brake = !inp.throttle; });
  const slide = new Track('glissiere');
  slide.add({ t: 'start', x: 6, z: 6, l: 0, r: 0 });
  slide.add({ t: 'straight', x: 0, z: 0, l: 0, r: 1, mv: 2, ms: 150, ma: 2 });
  slide.add({ t: 'straight', x: 0, z: 2, l: 0, r: 1, mv: 1, ms: 100, ma: 1.5 });
  out['custom:slider-lift'] = runDirect(slide, { x: 16, y: 0.4, z: 16, yaw: -Math.PI / 2 }, 2400, (i, inp) => { inp.steer = (i % 300) < 150 ? 0.2 : -0.2; inp.throttle = true; inp.brake = false; });
  // 3. Bifurcation : voie directe et voie déportée (zone où les deux chaussées se chevauchent).
  const fork = scriptTrack('bifurcation', 'start S2 Y3.b S2 C S2 finish');
  out['custom:fork:bot'] = runGhost(fork, { bot: true }, 120 * 60);
  out['custom:fork:noise'] = runGhost(fork, { inputs: randomInputs(37, 3000) }, 3000);
  const fk = new Track('fourche');
  fk.add({ t: 'start', x: 0, z: 4, l: 0, r: 0 });
  fk.add({ t: 'fork', x: 0, z: 2, l: 0, r: 0 });
  fk.add({ t: 'forkL', x: 0, z: 0, l: 0, r: 2 });
  out['custom:fork:between'] = runDirect(fk, { x: 16 - 12, y: 0.4, z: 2 * 32 + 60, yaw: 0 }, 1500, (i, inp) => { inp.steer = dsin(i * 0.02) * 0.55; inp.throttle = i < 900; inp.brake = i >= 900; });
  // 4. Revêtements en série (verglas, tapis, ressort, verre, poudreuse, ralentisseur, dérive, vent, rebond, aimant).
  const surf = scriptTrack('revetements', 'start S2 S2.i S.t S.r S2 S.v200 S2.p S.x S.d S.w S2.j S.m S2 C S3 finish');
  out['custom:surfaces:bot'] = runGhost(surf, { bot: true }, 120 * 60);
  out['custom:surfaces:noise'] = runGhost(surf, { inputs: randomInputs(41, 3000) }, 3000);
  // 5. Véhicules et gravité : moto, bateau, deltaplane, inversion de gravité.
  const veh = scriptTrack('vehicules', 'start S2 S.o S2 S.a S2 S.n S2 S.e S2 S.f V4 S2^ S.f^ V-4 S2 finish');
  out['custom:vehicles:bot'] = runGhost(veh, { bot: true }, 120 * 90);
  out['custom:vehicles:noise'] = runGhost(veh, { inputs: randomInputs(53, 4000) }, 4000);
  return out;
}

export function computeFingerprint({ quick = false } = {}) {
  const scenarios = {};
  BUILTIN_TRACKS.forEach((def, i) => {
    const track = buildBuiltin(def);
    scenarios['bot:' + def.id] = runGhost(track, { bot: true }, 120 * 150);
    if (!quick) scenarios['noise:' + def.id] = runGhost(buildBuiltin(def), { inputs: randomInputs(1000 + i, 2400) }, 2400);
  });
  const days = quick ? 4 : 16;
  for (let d = 1; d <= days; d++) {
    const day = `2026-12-${String(d).padStart(2, '0')}`;
    const c = dailyChallenge(day);
    scenarios['daily:' + day] = c ? runGhost(c.track, { bot: true }, 120 * 120) : 'none';
  }
  if (!quick) Object.assign(scenarios, customScenarios());
  const all = new Hash();
  for (const [k, v] of Object.entries(scenarios)) { for (let i = 0; i < k.length; i++) all.i(k.charCodeAt(i)); for (let i = 0; i < v.length; i++) all.i(v.charCodeAt(i)); }
  return { version: PHYS_VER, combined: all.hex(), scenarios };
}
