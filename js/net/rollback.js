// PROTOTYPE de multijoueur à rollback (Copytrack Evolution, E18) : de vraies collisions déterministes entre 2 à 4 voitures. Hors interface : il n'est
// branché sur aucun écran, seulement mesuré (tools/bench-rollback.mjs) et testé (tools/test-rollback.mjs). Décision et mesures : docs/ROLLBACK.md.
//
// Principe : chaque joueur fait tourner le MÊME monde (toutes les voitures, dans une seule simulation par voiture, plus les chocs entre elles), pas
// à pas, avec les commandes de tous. Il ne connaît les commandes des autres qu'avec du retard : il les PRÉDIT (la dernière connue se répète) ;
// quand la vraie arrive et diffère, il revient à l'état sauvegardé de ce pas-là et rejoue jusqu'au présent (au plus maxRollback pas). Si une
// commande manque depuis plus longtemps, il attend (le monde ne peut pas avancer sans elle). Deux joueurs qui ont reçu les mêmes commandes ont
// exactement le même monde : les chocs entre voitures n'utilisent que + − × ÷ et √ (exacts partout, comme js/dmath.js).
import { Simulation } from '../simulation.js';
import { placeAtStart } from '../raceLogic.js';
import { gridSpawn } from './progress.js';

// ---- Sauvegarde de l'état --------------------------------------------------------------------------------------------------------------
// Copie profonde de l'état d'une simulation : tout ce qui appartient au circuit (pièces, décors, ligne, paramètres gelés) est gardé par référence,
// le reste est copié ; les alias (deux champs qui désignent le même objet) restent des alias.
function trackRefs(track, sim) {
  const refs = new Set([track, track.tiles, track.decos, sim.phys.params]);
  for (const t of track.tiles) refs.add(t);
  for (const d of track.decos) refs.add(d);
  if (track.path) refs.add(track.path);
  return refs;
}
function clone(v, refs, memo) {
  if (v === null || typeof v !== 'object') return v;
  if (refs.has(v)) return v;
  if (memo.has(v)) return memo.get(v);
  let out;
  if (Array.isArray(v)) { out = new Array(v.length); memo.set(v, out); for (let i = 0; i < v.length; i++) out[i] = clone(v[i], refs, memo); return out; }
  if (ArrayBuffer.isView(v)) { out = v.slice(); memo.set(v, out); return out; }
  if (v instanceof Set) { out = new Set(); memo.set(v, out); for (const x of v) out.add(clone(x, refs, memo)); return out; }
  if (v instanceof Map) { out = new Map(); memo.set(v, out); for (const [k, x] of v) out.set(clone(k, refs, memo), clone(x, refs, memo)); return out; }
  out = Object.create(Object.getPrototypeOf(v));
  memo.set(v, out);
  for (const k of Object.keys(v)) out[k] = clone(v[k], refs, memo);
  return out;
}
// État d'une simulation (voiture, règles de course, compteurs) ; restoreSim le remet EN PLACE (les objets phys et logic gardent leur identité).
const SIM_FIELDS = ['groundT', 'idle', 'sank', 'lost'];
export function snapshotSim(sim, refs) {
  const memo = new Map();
  return { phys: clone(Object.assign({}, sim.phys), refs, memo), logic: clone(Object.assign({}, sim.logic), refs, memo), sim: SIM_FIELDS.map((k) => sim[k]) };
}
export function restoreSim(sim, snap, refs) {
  const memo = new Map();
  Object.assign(sim.phys, clone(snap.phys, refs, memo));
  Object.assign(sim.logic, clone(snap.logic, refs, memo));
  SIM_FIELDS.forEach((k, i) => { sim[k] = snap.sim[i]; });
}

// ---- Chocs entre voitures (déterministes) ----------------------------------------------------------------------------------------------
export const CAR_R = 1.15, REACH_Y = 1.8, RESTITUTION = 0.35;
// Toutes les paires, dans l'ordre des joueurs : chacune est séparée à parts égales et échange sa vitesse le long de la normale.
export function collideCars(sims) {
  const min = CAR_R * 2;
  let hits = 0;
  for (let i = 0; i < sims.length; i++) {
    for (let j = i + 1; j < sims.length; j++) {
      const a = sims[i].phys, b = sims[j].phys;
      if (a.rib || b.rib || sims[i].logic.finished || sims[j].logic.finished) continue;
      const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, dy = a.pos.y - b.pos.y;
      if (dy > REACH_Y || dy < -REACH_Y || dx >= min || dx <= -min || dz >= min || dz <= -min) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      let nx = 1, nz = 0, d = 0;
      if (d2 > 1e-8) { d = Math.sqrt(d2); nx = dx / d; nz = dz / d; }
      hits++;
      const half = (min - d) * 0.5;
      a.pos.x += nx * half; a.pos.z += nz * half; b.pos.x -= nx * half; b.pos.z -= nz * half;
      const rv = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
      if (rv < 0) {
        const jn = -rv * (1 + RESTITUTION) * 0.5;
        a.vel.x += nx * jn; a.vel.z += nz * jn; b.vel.x -= nx * jn; b.vel.z -= nz * jn;
      }
    }
  }
  return hits;
}

// ---- Le monde partagé ------------------------------------------------------------------------------------------------------------------
export class RollbackWorld {
  constructor(track, players) {
    this.track = track;
    this.sims = [];
    for (let i = 0; i < players; i++) {
      const sim = new Simulation(track);
      sim.start();
      const sp = gridSpawn(sim.logic.spawnPoint(), i, players);
      placeAtStart(sim.phys, sim.logic, sp);
      sim.logic.respawn = { ...sim.logic.respawn, x: sp.x, z: sp.z };
      this.sims.push(sim);
    }
    // Limite du prototype : l'état de la logique du circuit (sim/logic.js, fermetures) n'est pas encore sauvegardé.
    if (this.sims[0].lgc) throw new Error('Prototype de rollback : circuits sans logique seulement.');
    this.refs = trackRefs(track, this.sims[0]);
    for (const s of this.sims) this.refs.add(s.phys.params);
    this.tick = 0;
    this.contacts = 0;
  }
  // Un pas pour tous : physique de chaque voiture, chocs entre voitures, puis règles de course (et retours au checkpoint demandés).
  step(inputs) {
    for (let i = 0; i < this.sims.length; i++) {
      const s = this.sims[i];
      if (s.lost) s.rewind();
      s.drive(inputs[i]);
    }
    this.contacts = collideCars(this.sims);
    for (const s of this.sims) s.score();
    this.tick++;
  }
  save() { return { tick: this.tick, cars: this.sims.map((s) => snapshotSim(s, this.refs)) }; }
  load(snap) { this.tick = snap.tick; snap.cars.forEach((c, i) => restoreSim(this.sims[i], c, this.refs)); }
  // Empreinte exacte de l'état (bits des positions, vitesses, caps, chronos) : deux mondes identiques ont la même.
  hash() {
    const f = new Float64Array(1), u = new Uint32Array(f.buffer);
    let h = 2166136261 >>> 0;
    const mix = (x) => { f[0] = x; h = Math.imul(h ^ u[0], 16777619) >>> 0; h = Math.imul(h ^ u[1], 16777619) >>> 0; };
    for (const s of this.sims) { const p = s.phys; mix(p.pos.x); mix(p.pos.y); mix(p.pos.z); mix(p.vel.x); mix(p.vel.y); mix(p.vel.z); mix(p.yaw); mix(s.logic.steps); mix(s.logic.splits.length); }
    return (h >>> 0).toString(16);
  }
}

// ---- Un joueur : prédiction et retour en arrière ---------------------------------------------------------------------------------------
const SAME = (a, b) => !!a && !!b && a.throttle === b.throttle && a.brake === b.brake && a.steer === b.steer;
const IDLE = { throttle: false, brake: false, steer: 0, drift: false };

export class RollbackPeer {
  constructor(track, players, me, { maxRollback = 15 } = {}) {
    this.world = new RollbackWorld(track, players);
    this.n = players; this.me = me; this.maxRollback = maxRollback;
    this.known = Array.from({ length: players }, () => new Map());      // joueur -> (pas -> commande reçue)
    this.used = new Map();                                              // pas -> commandes utilisées (prédites ou reçues)
    this.snaps = new Map([[0, this.world.save()]]);                     // pas -> état AVANT ce pas
    this.rollbackFrom = null;
    this.stats = { rollbacks: 0, resimSteps: 0, stalls: 0, maxDepth: 0 };
  }
  // Dernière commande connue d'un joueur avant le pas t (la prédiction : elle se répète).
  _lastKnown(p, t) { for (let k = t; k >= 0 && k > t - 600; k--) { const x = this.known[p].get(k); if (x) return x; } return IDLE; }
  _inputs(t) { return Array.from({ length: this.n }, (_, p) => this.known[p].get(t) || this._lastKnown(p, t - 1)); }
  // Une commande (la mienne ou celle d'un autre) pour le pas t.
  receive(p, t, inp) {
    if (this.known[p].has(t)) return;
    this.known[p].set(t, inp);
    const used = this.used.get(t);
    if (t < this.world.tick && used && !SAME(used[p], inp)) this.rollbackFrom = this.rollbackFrom == null ? t : Math.min(this.rollbackFrom, t);
  }
  // Le pas le plus ancien dont il manque encore une commande (au-delà, tout est confirmé).
  confirmedUpTo() {
    let t = this.world.tick;
    for (let p = 0; p < this.n; p++) { let k = 0; while (k < t && this.known[p].has(k)) k++; t = Math.min(t, k); }
    return t;
  }
  // Avance d'un pas (une image) : corrige le passé si besoin, puis joue le pas présent avec les prédictions. Renvoie false s'il faut attendre.
  advance() {
    const W = this.world;
    if (W.tick - this.confirmedUpTo() >= this.maxRollback) { this.stats.stalls++; this._resim(); return false; }
    this._resim();
    const inp = this._inputs(W.tick);
    this.used.set(W.tick, inp);
    W.step(inp);
    this.snaps.set(W.tick, W.save());
    this._forget();
    return true;
  }
  _resim() {
    const W = this.world;
    if (this.rollbackFrom == null) return;
    const from = this.rollbackFrom, to = W.tick;
    this.rollbackFrom = null;
    W.load(this.snaps.get(from));
    this.stats.rollbacks++;
    this.stats.maxDepth = Math.max(this.stats.maxDepth, to - from);
    for (let t = from; t < to; t++) {
      const inp = this._inputs(t);
      this.used.set(t, inp);
      W.step(inp);
      this.snaps.set(W.tick, W.save());
      this.stats.resimSteps++;
    }
  }
  // On ne garde que ce qui peut encore servir à un retour en arrière.
  _forget() {
    const keep = Math.min(this.confirmedUpTo(), this.world.tick - this.maxRollback) - 1;
    for (const t of this.snaps.keys()) if (t < keep) this.snaps.delete(t);
    for (const t of this.used.keys()) if (t < keep) this.used.delete(t);
  }
}
