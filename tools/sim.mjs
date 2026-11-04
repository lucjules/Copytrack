// Valide les circuits intégrés : construit chaque circuit, affiche une carte
// ASCII et fait rouler le pilote automatique jusqu'à l'arrivée.
//   node tools/sim.mjs            -> tous les circuits
//   node tools/sim.mjs 2 --map    -> circuit n°2 avec la carte
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { Autopilot } from '../js/autopilot.js';
import { Track } from '../js/track.js';
import { PIECES } from '../js/pieces.js';
import { DT, CELL } from '../js/constants.js';

const args = process.argv.slice(2);
const showMap = args.includes('--map');
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);

const GLYPH = {
  straight: ['║', '═'], curve: ['╗', '╝'], bigcurve: ['◜', '◝'], slope: ['^', '>'], steep: ['⇑', '⇒'],
  checkpoint: ['C', 'C'], start: ['S', 'S'], finish: ['F', 'F'], platform: ['#', '#'], loop: ['O', 'O'], loopL: ['Ø', 'Ø'],
  loopBig: ['B', 'B'], loopBigL: ['B', 'B'], loopDouble: ['D', 'D'], loopDoubleL: ['D', 'D'], twist: ['~', '~'], ramp90: ['Q', 'Q'], wall: ['W', 'W'], crest90: ['Y', 'Y'],
};
const SURF = { ice: '~', boost: '»', bounce: 'j', magnet: 'm', drift: 'd', slow: 'x', wind: 'w', gravity: 'g', moto: 'o', water: 'a', boat: 'n', glider: 'e', flip: 'f', conveyor: 't', spring: 'r', glass: 'v', powder: 'p', reverse: 'y', cut: 'c' };

function map(track) {
  const b = track.bounds();
  const x0 = b.minX / CELL, x1 = b.maxX / CELL, z0 = b.minZ / CELL, z1 = b.maxZ / CELL;
  const lines = [];
  for (let z = z0; z < z1; z++) {
    let row = '';
    for (let x = x0; x < x1; x++) {
      const ts = track.tilesAt(x, z);
      if (!ts.length) { row += ' . '; continue; }
      const t = ts[ts.length - 1];
      const g = t.s ? SURF[t.s] : GLYPH[t.t][t.r % 2];
      row += (ts.length > 1 ? '*' : ' ') + (t.v ? '^' : g) + (t.l ? String(t.l % 10) : ' ');
    }
    lines.push(row);
  }
  return lines.join('\n');
}

function run(track, maxTime = 240) {
  const phys = new CarPhysics(track);
  const logic = new RaceLogic(track);
  placeAtStart(phys, logic);
  const bot = new Autopilot(track.path);
  bot.reset(phys);
  let respawns = 0, stuck = 0, maxSpeed = 0, airMax = 0, lastIdx = 0, loops = 0, falls = 0;
  const steps = Math.round(maxTime / DT);
  for (let i = 0; i < steps; i++) {
    const inp = bot.control(phys);
    phys.clock = logic.steps;
    phys.step(inp);
    maxSpeed = Math.max(maxSpeed, phys.speed);
    airMax = Math.max(airMax, phys.airTime);
    if (phys.ev.loopOut) loops++;
    if (phys.ev.loopFall) falls++;
    const ev = logic.update(phys);
    if (ev && ev.type === 'finish') {
      return { ok: true, time: logic.time, respawns, maxSpeed, airMax, loops, falls };
    }
    // Chute au sol : réapparition au dernier checkpoint.
    const fell = phys.offTrack || phys.ev.sink;
    if (i % 120 === 0) {
      if (bot.idx === lastIdx) stuck++; else stuck = 0;
      lastIdx = bot.idx;
    }
    if (fell || stuck > 4) {
      respawns++;
      if (respawns > 8) return { ok: false, reason: `trop de réapparitions (idx ${bot.idx}/${track.path.length}, pos ${phys.pos.x.toFixed(1)},${phys.pos.y.toFixed(1)},${phys.pos.z.toFixed(1)})`, time: logic.time };
      const r = logic.respawn;
      phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
      bot.reset(phys);
      stuck = 0;
    }
  }
  return { ok: false, reason: `pas d'arrivée (idx ${bot.idx}/${track.path.length})`, time: logic.time };
}

BUILTIN_TRACKS.forEach((def, i) => {
  if (only.length && !only.includes(i + 1)) return;
  let track;
  try {
    track = buildBuiltin(def);
  } catch (e) {
    console.log(`#${i + 1} ${def.name} : ERREUR ${e.message}`);
    return;
  }
  const code = track.encode();
  const back = Track.decode(code);
  if (back.tiles.length !== track.tiles.length) console.log('  ! encodage incomplet');
  const errs = track.validate();
  const res = run(track);
  if (!res.ok) process.exitCode = 1;   // npm test échoue si un circuit n'est plus finissable
  const tiles = track.tiles.length;
  const cps = new RaceLogic(track).cps.length;
  console.log(`#${i + 1} ${def.name.padEnd(22)} ${String(tiles).padStart(3)} pièces, ${cps} CP  ` +
    (res.ok ? `OK ${res.time.toFixed(3)} s` : `ÉCHEC ${res.reason}`) +
    (res.respawns ? `  (${res.respawns} réapparitions)` : '') +
    (res.loops || res.falls ? `  loopings ${res.loops}${res.falls ? ` (chutes ${res.falls})` : ''}` : '') +
    (res.maxSpeed ? `  vmax ${(res.maxSpeed * 3.6).toFixed(0)} km/h  air ${res.airMax.toFixed(2)} s` : '') +
    (errs.length ? '  ' + errs.join(' ') : '') + `  code ${code.length} car.`);
  if (showMap) console.log(map(track) + '\n');
});
