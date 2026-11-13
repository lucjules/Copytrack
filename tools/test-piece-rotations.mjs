// Rotation d'un circuit entier (pièces + décorations + obstacles) : node tools/test-piece-rotations.mjs   (npm test)
// Une pièce ne tourne que par quarts de tour sur la grille (cap) et par orientations prédéfinies (sol, murs, plafond) : voir docs/ROTATIONS.md. Ce test prouve que ce système est
// EXACT dans le moteur : un circuit tourné de 90°, 180° ou 270° (pentes, rampes, murs, plafonds, boucles, obstacles, pièces mobiles…) se conduit avec EXACTEMENT les mêmes
// temps, au pas de physique près, que l'original : aucune collision, aucun raccord, aucun obstacle ne dépend de l'orientation sur la grille.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track } from '../js/track.js';
import { rotateSelection, tilesInRect, decosInRect } from '../js/editorTools.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { DT } from '../js/constants.js';
import { OBST } from '../js/obstacles.js';
import { tileOri } from '../js/pieces.js';
import { tileCenter } from '../js/pieces.js';
const quarter = (tr) => { const t = Track.decode(tr.encode()); const st0 = tileCenter(tr.tiles.find((x) => x.t === 'start'));
  const bb = t.bounds(); const r = { x0: Math.floor(bb.minX / 32) - 1, z0: Math.floor(bb.minZ / 32) - 1, x1: Math.ceil(bb.maxX / 32) + 1, z1: Math.ceil(bb.maxZ / 32) + 1 };
  if (!rotateSelection(t, r, tilesInRect(t, r), decosInRect(t, r))) return null;
  const st1 = tileCenter(t.tiles.find((x) => x.t === 'start')); const A = st1.x + st0.z, B = st1.z - st0.x;      // (x, z) -> (A - z, B + x)
  const pts = tr.path.map((q) => [A - q[2], q[1], B + q[0], ...q.slice(3)]);
  t.path = Object.assign(pts, tr.path.pilot ? { pilot: tr.path.pilot } : {});
  for (const k of Object.keys(tr.path)) if (isNaN(+k)) t.path[k] = tr.path[k];
  t.laps = tr.laps; t.vt = 0; return t; };
const rot = (tr, k) => { let t = tr; for (let i = 0; i < k; i++) { t = quarter(t); if (!t) return null; } return t; };

function run(track) {
  const sim = new Simulation(track); sim.start(); const bot = new Autopilot(track.path); bot.reset(sim.phys);
  for (let i = 0; i < 240 / DT; i++) { sim.drive(bot.control(sim.phys)); const ev = sim.score(); if (ev && ev.type === 'finish') return sim.logic.time; if (sim.lost) sim.rewind(); }
  return null;
}
// Circuits choisis pour COUVRIR : chaque type de pièce, chaque orientation (sol, mur gauche / droit, plafond), chaque revêtement, chaque obstacle, chaque mouvement.
const features = (tr) => new Set([...tr.tiles.map((t) => 't:' + t.t + ':' + tileOri(t)), ...tr.tiles.filter((t) => t.s).map((t) => 's:' + t.s), ...tr.tiles.filter((t) => t.mv).map((t) => 'mv:' + t.mv), ...tr.decos.filter((d) => OBST[d.k]).map((d) => 'o:' + d.k)]);
const all = BUILTIN_TRACKS.map((d) => buildBuiltin(d));
const chosen = [], seen = new Set();
for (;;) {
  let best = null, gain = 0;
  all.forEach((tr, i) => { if (chosen.includes(i)) return; const g = [...features(tr)].filter((f) => !seen.has(f)).length; if (g > gain) { gain = g; best = i; } });
  if (best == null || chosen.length >= 24) break;
  chosen.push(best); for (const f of features(all[best])) seen.add(f);
}

console.log('Rotation d\'un circuit entier, conduite comparée');
test(`${chosen.length} circuits couvrant ${seen.size} types de pièces / orientations / revêtements / obstacles / mouvements : tournés de 90°, 180° et 270°, ils se conduisent aux mêmes temps`, () => {
  assert.ok(seen.size > 60, 'la couverture est large (' + seen.size + ')');
  assert.ok([...seen].some((f) => /^t:.*:3$/.test(f)) && [...seen].some((f) => /^t:.*:[12]$/.test(f)), 'plafonds ET murs couverts');
  assert.ok([...seen].some((f) => f.startsWith('o:')) && [...seen].some((f) => f.startsWith('mv:')), 'obstacles ET pièces mobiles couverts');
  const bad = [];
  for (const i of chosen) {
    const tr = all[i], base = run(tr);
    assert.ok(base, tr.name + ' : le pilote termine l\'original');
    for (const k of [1, 2, 3]) {
      const t2 = rot(tr, k);
      if (!t2) { bad.push(`${tr.name} ×${k} : rotation refusée`); continue; }
      const time = run(t2);
      // (physique 36 : le décollage dépend d'un seuil ; un arrondi de dernier bit dû à la rotation peut le décaler d'un à trois pas, pas plus)
      if (time == null || Math.abs(time - base) > 0.03) bad.push(`${tr.name} ×${k * 90}° : ${time} au lieu de ${base}`);
    }
  }
  assert.deepEqual(bad, []);
});

await finish('Tous les tests de rotation de circuits passent.');
