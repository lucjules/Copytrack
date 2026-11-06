// Atelier de level design : construit un circuit à partir d'un script (ou d'un circuit intégré), le fait rouler au pilote automatique et
// en tire un profil (temps, vitesses, freinages, murs, hauteur) pour juger sa typologie (sprint, speedway, technique, rollercoaster).
//
//   node tools/lab.mjs "start B3 [tr01s] S3< [tr10s] RR S finish" --l 2 --v0 100 --vcap 70 --map
//   node tools/lab.mjs --id eclats --map --profile
//   node tools/lab.mjs --all                      -> une ligne de profil par circuit intégré
//
// Options : --l niveau de départ · --v0 km/h au départ · --vcap m/s (vitesse visée du pilote) · --decor · --veh moto|boat|glider
//           --map carte vue de dessus · --profile courbe de vitesse (ASCII) · --json sortie machine
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { scriptTrack, Track } from '../js/track.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { Autopilot } from '../js/autopilot.js';
import { PIECES } from '../js/pieces.js';
import { DT, CELL, LEVEL_H } from '../js/constants.js';

// ---- Carte -------------------------------------------------------------------------------------------------------------------------
const GLYPH = (t) => {
  const P = PIECES[t.t], r = t.r % 2;
  if (t.t === 'start') return 'S';
  if (t.t === 'finish') return 'F';
  if (P.checkpoint) return 'C';
  if (P.kind === 'loop') return 'O';
  if (P.kind === 'ring') return 'o';
  if (P.kind === 'fork') return 'Y';
  if (P.kind === 'area') return '#';
  if (t.t === 'twist') return '~';
  if (t.t === 'tube' || t.t === 'tubeIn' || t.t === 'tubeMid') return 'T';
  if (t.t === 'cork' || t.t === 'corkL') return '@';
  if (P.roll) return 'w';                               // transition d'orientation
  if (t.o) return t.o === 1 ? '<' : '>';                // route sur un mur
  if (t.t === 'bank' || t.t === 'bankBig') return 'b';
  if (t.t === 'wall') return 'W';
  if (t.t === 'ramp90' || t.t === 'crest90') return 'Q';
  if (P.kind === 'arc') return P.size === 3 ? 'H' : P.size === 2 ? 'g' : 'c';
  if ((P.rise || 0) > 0) return '/';
  if ((P.rise || 0) < 0) return '\\';
  return r ? '═' : '║';
};
const SURF = { ice: '~', boost: '»', bounce: 'j', magnet: 'm', drift: 'd', slow: 'x', wind: 'w', gravity: 'g', moto: 'M', water: 'a', boat: 'n', glider: 'e', flip: 'f', conveyor: 't', spring: 'r', glass: 'v', powder: 'p', reverse: 'y', cut: 'c' };

export function asciiMap(track) {
  const b = track.bounds();
  const x0 = b.minX / CELL, x1 = b.maxX / CELL, z0 = b.minZ / CELL, z1 = b.maxZ / CELL;
  const lines = [];
  for (let z = z0; z < z1; z++) {
    let row = '';
    for (let x = x0; x < x1; x++) {
      const ts = track.tilesAt(x, z);
      if (!ts.length) { row += ' . '; continue; }
      const t = ts[ts.length - 1];
      const g = t.s ? SURF[t.s] || '?' : GLYPH(t);
      row += (ts.length > 1 ? '*' : ' ') + (t.v ? '^' : g) + (t.l ? String(Math.round(t.l) % 10) : ' ');
    }
    lines.push(row);
  }
  return lines.join('\n');
}

// ---- Course ------------------------------------------------------------------------------------------------------------------------
// Fait rouler le pilote automatique ; renvoie le profil. samples : un point toutes les 0,1 s.
// rewindAtCp : numéro (à partir de 1) d'un checkpoint où l'on force une réapparition dès qu'il est pris, comme la touche « dernier checkpoint » :
// la voiture repart À L'ARRÊT du point de réapparition. Sert à vérifier qu'on peut toujours repartir de chaque checkpoint.
export function runTrack(track, { maxTime = 240, vCap, brakeDecel, rewindAtCp = 0 } = {}) {
  const phys = new CarPhysics(track);
  const logic = new RaceLogic(track);
  placeAtStart(phys, logic);
  const bot = new Autopilot(track.path, { ...(vCap ? { vCap } : {}), ...(brakeDecel ? { brakeDecel } : {}) });
  bot.reset(phys);
  const S = { ok: false, vehicle: 'car', jumps: 0, time: 0, respawns: 0, wallHits: 0, vmax: 0, airMax: 0, airTotal: 0, loops: 0, perfects: 0, turbos: 0, rings: 0, brakeT: 0, wallT: 0, ribT: 0, samples: [], cps: [], yMin: Infinity, yMax: -Infinity, dist: 0, reason: '' };
  let stuck = 0, lastIdx = 0, last = null, airRun = 0;
  const steps = Math.round(maxTime / DT);
  for (let i = 0; i < steps; i++) {
    const inp = bot.control(phys);
    phys.clock = logic.steps;
    phys.step(inp);
    const sp = phys.speed;
    S.vmax = Math.max(S.vmax, sp);
    S.airMax = Math.max(S.airMax, phys.airTime);
    if (!phys.grounded && !phys.rib) { S.airTotal += DT; airRun += DT; }
    else { if (airRun >= 1) S.jumps++; airRun = 0; }
    if (inp.brake && phys.grounded) S.brakeT += DT;
    if (phys.rib) { S.ribT += DT; if (phys.rib.tile && phys.rib.tile.o) S.wallT += DT; }
    S.yMin = Math.min(S.yMin, phys.pos.y); S.yMax = Math.max(S.yMax, phys.pos.y);
    if (last) S.dist += Math.hypot(phys.pos.x - last.x, phys.pos.y - last.y, phys.pos.z - last.z);
    last = { x: phys.pos.x, y: phys.pos.y, z: phys.pos.z };
    if (phys.ev.loopOut) S.loops++;
    if (phys.ev.wall > 4) S.wallHits++;
    if (phys.ev.landQ === 'perfect') S.perfects++;
    if (phys.ev.ring) S.rings++;
    if (i % 12 === 0) S.samples.push([i * DT, sp, phys.pos.y, phys.grounded || phys.rib ? 1 : 0]);
    const ev = logic.update(phys);
    if (ev && ev.type === 'checkpoint') {
      S.cps.push(+logic.time.toFixed(2));
      if (rewindAtCp && ev.index === rewindAtCp && !S.rewound) {
        S.rewound = true;
        const r = logic.rewind();
        phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
        phys.vehicle = r.vehicle || 'car'; phys.gravMul = r.grav || 1;
        bot.reset(phys); stuck = 0;
        continue;
      }
    }
    if (ev && ev.type === 'finish') { S.ok = true; S.time = logic.time; S.vehicle = phys.vehicle; break; }
    const fell = phys.offTrack || phys.ev.sink;
    if (i % 120 === 0) { if (bot.idx === lastIdx) stuck++; else stuck = 0; lastIdx = bot.idx; }
    if (fell || stuck > 4) {
      S.respawns++;
      if (S.respawns > 8) { S.reason = `trop de réapparitions (idx ${bot.idx}/${track.path.length}, pos ${phys.pos.x.toFixed(1)},${phys.pos.y.toFixed(1)},${phys.pos.z.toFixed(1)})`; S.time = logic.time; return S; }
      const r = logic.respawn;
      phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
      bot.reset(phys);
      stuck = 0;
    }
  }
  if (!S.ok && !S.reason) S.reason = `pas d'arrivée (idx ${bot.idx}/${track.path.length})`;
  return S;
}

// Typologie : caractéristiques de la géométrie et de la course, pour vérifier qu'un circuit est bien ce qu'on a voulu.
export function profile(track, S) {
  const tiles = track.tiles;
  const P = (t) => PIECES[t.t];
  const tight = tiles.filter((t) => P(t).kind === 'arc' && P(t).size === 1 && !P(t).checkpoint).length;
  const wide = tiles.filter((t) => (P(t).kind === 'arc' && P(t).size >= 2) || t.t === 'bank' || t.t === 'bankBig').length;
  const wallCells = tiles.filter((t) => t.o).length + tiles.filter((t) => P(t).roll).length;
  const loops = tiles.filter((t) => P(t).kind === 'loop').length;
  const boosts = tiles.filter((t) => t.s === 'boost').length;
  const straights = tiles.filter((t) => P(t).kind === 'line' && !P(t).special && !(P(t).rise)).length;
  const rises = tiles.filter((t) => P(t).rise).length;
  const hs = (S.samples || []).filter((s) => s[3]);
  const share = (v) => (S.samples.length ? S.samples.filter((s) => s[1] >= v).length / S.samples.length : 0);
  return {
    pieces: tiles.length, tight, wide, wallCells, loops, boosts, straights, rises,
    heightRange: +((S.yMax - S.yMin) / LEVEL_H).toFixed(1),
    over180: +share(50).toFixed(2), over250: +share(69.4).toFixed(2), over300: +share(83.3).toFixed(2),
    avgKmh: S.time ? +((S.dist / S.time) * 3.6).toFixed(0) : 0,
    brakePct: S.time ? +((S.brakeT / S.time) * 100).toFixed(0) : 0,
  };
}

// Courbe de vitesse ASCII : une colonne par 0,5 s, hauteur = vitesse (km/h / 20).
export function speedPlot(S, rows = 10) {
  const cols = [];
  for (let t = 0; t < S.time; t += 0.5) {
    const seg = S.samples.filter((s) => s[0] >= t && s[0] < t + 0.5);
    if (seg.length) cols.push(Math.max(...seg.map((s) => s[1])) * 3.6);
  }
  const top = Math.ceil(Math.max(...cols, 100) / 40) * 40, out = [];
  for (let r = rows; r >= 1; r--) {
    const lim = (top * r) / rows;
    out.push(String(Math.round(lim)).padStart(4) + ' |' + cols.map((c) => (c >= lim - top / rows / 2 ? '█' : ' ')).join(''));
  }
  out.push('     +' + '-'.repeat(cols.length) + `  ${S.time.toFixed(1)} s`);
  return out.join('\n');
}

export function buildFromScript(script, o = {}) {
  const t = scriptTrack('lab', script, { decor: o.decor || 'desert', ...(o.l ? { l: o.l } : {}) });
  if (o.v0 || o.veh || o.g0) t.setParams({ v0: o.v0, veh0: o.veh, g0: o.g0 });
  if (o.params) t.setParams(o.params);               // ex. { inversionGraviteDepart: true }
  return t;
}

// ---- Ligne de commande -------------------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('lab.mjs')) {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  const flag = (k) => a.includes('--' + k);
  const fmt = (name, track, S, prof) => `${name.padEnd(24)} ${S.ok ? `OK ${S.time.toFixed(2).padStart(6)} s` : 'ÉCHEC'}  ${String(prof.pieces).padStart(3)} pcs  serrés ${String(prof.tight).padStart(2)} larges ${String(prof.wide).padStart(2)}  murs ${String(prof.wallCells).padStart(2)}  loops ${prof.loops}  turbo ${String(prof.boosts).padStart(2)}  ` +
    `vmax ${(S.vmax * 3.6).toFixed(0).padStart(3)}  moy ${String(prof.avgKmh).padStart(3)} km/h  >180: ${(prof.over180 * 100).toFixed(0).padStart(3)} %  >250: ${(prof.over250 * 100).toFixed(0).padStart(3)} %  frein ${String(prof.brakePct).padStart(2)} %  haut ${String(prof.heightRange).padStart(4)} niv  air ${S.airTotal.toFixed(1)} s` +
    (S.respawns ? `  (${S.respawns} réapparitions)` : '') + (S.wallHits ? `  (${S.wallHits} chocs)` : '') + (S.ok ? '' : '  ' + S.reason);
  if (flag('all')) {
    BUILTIN_TRACKS.forEach((def, i) => {
      const tr = buildBuiltin(def);
      const S = runTrack(tr);
      console.log(`#${String(i + 1).padStart(2)} ` + fmt(def.id, tr, S, profile(tr, S)));
    });
  } else {
    let tr, name, buildFromScriptLike;
    const id = opt('id');
    if (id) {
      const def = BUILTIN_TRACKS.find((d) => d.id === id);
      if (!def) { console.error('circuit inconnu : ' + id); process.exit(2); }
      tr = buildBuiltin(def); name = def.id; buildFromScriptLike = () => buildBuiltin(def);
    } else {
      const script = a.find((x) => !x.startsWith('--') && /\s|^start/.test(x));
      if (!script) { console.error('usage : node tools/lab.mjs "script" [--l N] [--v0 kmh] [--vcap m/s] [--map] [--profile]'); process.exit(2); }
      const po = opt('params') ? JSON.parse(opt('params')) : undefined, decor = opt('decor');
      tr = buildFromScript(script, { l: +opt('l', 0), v0: +opt('v0', 0), veh: opt('veh'), decor, params: po });
      name = 'script'; buildFromScriptLike = () => buildFromScript(script, { l: +opt('l', 0), v0: +opt('v0', 0), veh: opt('veh'), decor, params: po });
      const errs = tr.validate();
      if (errs.length) console.log('validate :', errs.join(' | '));
    }
    const S = runTrack(tr, { vCap: opt('vcap') ? +opt('vcap') : undefined });
    if (flag('robust')) {
      // Tolérance à la vitesse : le même circuit avec un pilote plus lent ou plus rapide (un joueur n'a jamais la vitesse exacte du pilote).
      const base = opt('vcap') ? +opt('vcap') : (tr.path.pilot && tr.path.pilot.vCap) || 52;
      const cells = [0.8, 0.9, 1, 1.1, 1.2].map((k) => { const r = runTrack(buildFromScriptLike(), { vCap: +(base * k).toFixed(1) }); return `${(base * k).toFixed(0)}:${r.ok ? (r.respawns ? 'r' + r.respawns : 'OK') : 'XX'}${r.wallHits ? '(' + r.wallHits + ' chocs)' : ''}`; });
      console.log('robustesse (vCap) :', cells.join('  '));
    }
    const prof = profile(tr, S);
    if (flag('map')) console.log(asciiMap(tr) + '\n');
    console.log(fmt(name, tr, S, prof));
    if (S.cps.length) console.log('checkpoints :', S.cps.join(' / '), 's');
    if (flag('profile') && S.samples.length) console.log('\n' + speedPlot(S));
    if (flag('json')) console.log(JSON.stringify({ ok: S.ok, time: S.time, ...prof }));
    process.exitCode = S.ok ? 0 : 1;
  }
}
