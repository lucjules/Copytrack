// Défi du jour (v1.5) : un circuit généré à partir de la date. Tout le monde a le même
// circuit le même jour, sans serveur. Le pilote automatique vérifie qu'il est faisable
// et fixe les médailles, comme pour les circuits intégrés.
import { scriptTrack, DECORS } from './track.js';
import { CarPhysics, CAR } from './physics.js';
import { RaceLogic } from './raceLogic.js';
import { Autopilot } from './autopilot.js';

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function rng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

// Blocs possibles : [jetons, poids, variation de niveau, niveau mini requis]
const BLOCKS = [
  ['S', 5, 0], ['S2', 5, 0], ['S3', 2, 0],
  ['R', 5, 0], ['L', 5, 0], ['RR', 3, 0], ['LL', 3, 0], ['BR', 1.2, 0], ['BL', 1.2, 0],
  ['S.b', 2.5, 0], ['S2.i', 0.8, 0], ['S.d', 0.6, 0], ['S.s', 0.5, 0],
  ['U S', 1.6, 1], ['D S', 1.6, -1, 1], ['GU2 S', 0.8, 1], ['GD2 S', 0.8, -1, 1],
  ['S2 UU G2 DD S', 1.2, 0], ['S UU GR2 DD S', 0.6, 0],
  ['O S', 0.9, 0], ['OL S', 0.9, 0], ['CK S', 0.5, 0], ['CKL S', 0.5, 0],
  ['TB S', 0.4, 0], ['TI TM2 TO S', 0.5, 0], ['Y2.b S', 0.7, 0],
  ['S.o S2 R S2 S.o', 0.4, 0],
];

function pick(r, list) {
  const tot = list.reduce((a, b) => a + b[1], 0);
  let x = r() * tot;
  for (const b of list) { x -= b[1]; if (x <= 0) return b; }
  return list[list.length - 1];
}

function tryBuild(tokens, decor) {
  try { return scriptTrack('Défi du jour', tokens.join(' '), { decor }); } catch { return null; }
}

// Course du pilote automatique ; renvoie le temps ou null.
export function botTime(track, latK = 0.8) {
  const phys = new CarPhysics(track), logic = new RaceLogic(track);
  const sp = logic.spawnPoint(); phys.place(sp.x, sp.y, sp.z, sp.yaw);
  const bot = new Autopilot(track.path, { latLimit: CAR.latGrip * latK, brakeDecel: 36 });
  bot.reset(phys);
  let groundT = 0, respawns = 0;
  for (let i = 0; i < 120 * 120; i++) {
    phys.step(bot.control(phys));
    const ev = logic.update(phys);
    if (ev && ev.type === 'finish') return respawns ? null : logic.time;
    if ((phys.grounded && phys.surfType === 'ground') || phys.ev.sink) {
      groundT += 1 / 120;
      if (groundT > 0.3 || phys.ev.sink) return null;
    } else groundT = 0;
  }
  return null;
}

const cache = new Map();
export function dailyChallenge(day = dayKey()) {
  if (cache.has(day)) return cache.get(day);
  const decors = Object.keys(DECORS);
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = rng(day + '#' + attempt);
    const decor = decors[Math.floor(r() * decors.length)];
    const tokens = ['start', 'S2'];
    let level = 0, sinceCp = 0, cps = 0;
    const target = 22 + Math.floor(r() * 8);
    let fails = 0;
    while (tokens.length < target && fails < 60) {
      const ok = BLOCKS.filter((b) => (b[3] || 0) <= level);
      const b = pick(r, ok);
      let tok = b[0];
      if (sinceCp >= 6 && cps < 3) tok = (r() < 0.3 ? (r() < 0.5 ? 'KR' : 'KL') : 'C') + ' ' + tok;
      const next = [...tokens, tok];
      if (tryBuild([...next, 'S', 'finish'], decor)) {
        tokens.push(tok);
        level += b[2];
        if (tok.startsWith('C ') || tok.startsWith('KR') || tok.startsWith('KL')) { sinceCp = 0; cps++; } else sinceCp++;
      } else fails++;
    }
    while (level > 0) { const t2 = [...tokens, 'D S']; if (!tryBuild([...t2, 'finish'], decor)) break; tokens.push('D S'); level--; }
    const track = tryBuild([...tokens, 'S', 'finish'], decor);
    if (!track || track.tiles.length < 32) continue;
    const t80 = botTime(track, 0.8);
    if (t80 == null) continue;
    const t100 = botTime(track, 1.0) || t80 * 0.97;
    const r1 = (x) => Math.round(x * 10) / 10;
    const medals = { cristal: Math.floor(Math.min(t100, t80) * 0.97 * 10) / 10, or: r1(t80), argent: r1(t80 * 1.15), bronze: r1(t80 * 1.35) };
    track.name = `Défi du ${day.split('-').reverse().join('/')}`;
    const out = { day, track, medals, key: 'daily-' + day, script: tokens.join(' ') };
    cache.set(day, out);
    return out;
  }
  return null;
}
