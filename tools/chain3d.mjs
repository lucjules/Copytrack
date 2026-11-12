// Assemblages 3D pour les tests de la phase 3 : construit un circuit pièce après pièce avec l'outil Prolonger (raccordement automatique compris), le fait rouler au pilote
// automatique sur le VRAI moteur, et renvoie ce qui s'est passé. Aucun hasard : mêmes nombres à chaque exécution.
import { Track } from '../js/track.js';
import { PIECES } from '../js/pieces.js';
import { extendPlan } from '../js/extend.js';
import { centerlineWorld } from '../js/ribbons.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { Autopilot } from '../js/autopilot.js';
import { continuityIssues } from '../js/continuity.js';
import { DT } from '../js/constants.js';

// seq : [[type, opts?], …] ; un niveau de départ confortable (12 : de la place au-dessous des murs et des loopings roulés).
export function buildSeq(seq, { level = 12, setup = null } = {}) {
  const tr = new Track('p3');
  tr.add(Track.normalize({ t: 'start', x: 0, z: 0, l: level, r: 0 }));
  if (setup) setup(tr);
  let last = tr.tiles[0];
  const pieces = [{ tile: last, reverse: false }], steps = [];
  for (const [type, opts = {}] of seq) {
    const r = extendPlan(tr, last, type, opts);
    steps.push({ type, ok: !!r.tile, why: r.why || '', bridged: !!r.bridged, inferred: !!r.inferred, reverse: !!r.reverse });
    if (!r.tile) return { tr, pieces, steps, failed: `${type} : ${r.why}` };
    for (const t of r.chain || [r.tile]) {
      const added = tr.add(t);
      pieces.push({ tile: added, reverse: !!r.reverse && !r.chain });
      last = added;
    }
  }
  return { tr, pieces, steps, failed: '' };
}

export function pathOf(pieces) {
  const path = [];
  for (const { tile, reverse } of pieces) {
    const pts = centerlineWorld(tile, PIECES[tile.t].size >= 2 ? 12 : 6, reverse);
    if (path.length) pts.shift();
    path.push(...pts);
  }
  return path;
}

// Roule la construction à `kmh` de croisière ; `vehicle` / `pm` : véhicule et profil physique. Renvoie { finished (s), fell, airMax, shocks, sinks }.
export function rideSeq(built, kmh = 150, { vehicle = 'car', pm = '', seconds = 60, onStep = null } = {}) {
  const { tr, pieces } = built;
  tr.path = pathOf(pieces);
  if (pm) tr.setParams({ pm });
  const ph = new CarPhysics(tr), lg = new RaceLogic(tr);
  placeAtStart(ph, lg); ph.graceT = 0; ph.vehicle = vehicle;
  const bot = new Autopilot(tr.path); bot.reset(ph);
  const v = kmh / 3.6;
  let finished = null, fell = '', air = 0, airMax = 0, shocks = 0, sinks = 0;
  for (let i = 0; i < 120 * seconds && finished === null; i++) {
    const b = bot.control(ph);
    ph.clock = i;
    ph.step({ steer: b.steer, throttle: ph.speed < v, brake: ph.speed > v * 1.15 });
    if (onStep) onStep(ph, i);
    if (ph.ev.shock > 0) shocks++;
    if (ph.ev.sink) sinks++;
    if (ph.ev.loopFall && ph.fallWhy !== 'crest' && !fell) fell = ph.fallWhy || 'chute';
    if (ph.lost) { fell = fell || 'perdue'; break; }
    if (ph.pos.y < tr.bounds().minY - 3) { fell = fell || 'terrain'; break; }
    if (!ph.grounded) { air += DT; airMax = Math.max(airMax, air); } else air = 0;
    const e = lg.update(ph);
    if (e && e.type === 'finish') {
      finished = lg.time;
      if (ph.gSign !== 1) fell = fell || 'gravité';
      else if (!ph.grounded) fell = fell || 'en vol à l\'arrivée';
    }
  }
  return { finished, fell, airMax: Math.round(airMax * 100) / 100, shocks, sinks, ph };
}

export const errorsOf = (tr) => continuityIssues(tr).filter((i) => i.level === 'error');
