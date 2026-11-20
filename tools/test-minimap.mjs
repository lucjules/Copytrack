// Mini-carte et « mauvais sens » (0.15.0) : position du monde → pixel de la mini-carte (le circuit tient dans le cadre), sens de la marche le long de
// la ligne centrale (dans le sens, à contre-sens, indéterminé loin de la ligne), message, branchements.
//   node tools/test-minimap.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { MiniMap, toMap, MINIMAP_W, MINIMAP_H } from '../js/ui/miniMap.js';
import { ProgressTracker } from '../js/net/progress.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { MSG } from '../js/hudMessages.js';
import { HUD_HIDE } from '../js/uitheme.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('mini-carte : chaque point de la ligne de course de 10 circuits tombe dans le cadre (sans document : pas de dessin, pas d\'erreur)', () => {
  for (const def of BUILTIN_TRACKS.slice(0, 60).filter((_, i) => i % 6 === 0)) {
    const tr = buildBuiltin(def), mm = new MiniMap(tr);
    assert.equal(mm.draw([{ x: 0, z: 0 }], 1000), false, 'rien à dessiner sous Node');
    for (const p of (tr.path || []).filter((_, i) => i % 7 === 0)) {
      const q = toMap(mm.view, p[0], p[2]);
      assert.ok(q.x >= 0 && q.x <= MINIMAP_W && q.y >= 0 && q.y <= MINIMAP_H, `${def.id} : (${q.x.toFixed(0)}, ${q.y.toFixed(0)})`);
    }
  }
});

test('mauvais sens : cap dans le sens de la ligne = 1, à contre-sens = -1, loin de la ligne ou sans ligne = 0', () => {
  const path = []; for (let i = 0; i < 100; i++) path.push([0, 0, -i * 2, 0]);        // ligne droite vers -z
  const T = new ProgressTracker(path);
  T.update({ x: 1, y: 0, z: -50 });
  assert.equal(T.headingSense(0, -1), 1, 'vers -z : dans le sens');
  assert.equal(T.headingSense(0, 1), -1, 'vers +z : à contre-sens');
  assert.equal(T.headingSense(1, 0), 0, 'en travers : indéterminé');
  T.update({ x: 60, y: 0, z: -50 });
  assert.equal(T.headingSense(0, 1), 0, 'à 60 m de la ligne (autre branche, hors piste) : on ne dit rien');
  assert.equal(new ProgressTracker(null).headingSense(0, 1), 0);
});

test('aucune fausse alerte : le pilote automatique roule 18 circuits (un sur quatre) dans le bon sens jusqu\'à l\'arrivée, sans un seul « mauvais sens »', () => {
  const bad = [];
  for (const def of BUILTIN_TRACKS.filter((_, i) => i % 4 === 0)) {
    const tr = buildBuiltin(def); if (!tr.path) continue;
    const sim = new Simulation(tr), { phys, logic } = sim; sim.start();
    const bot = new Autopilot(tr.path); bot.reset(phys);
    const T = new ProgressTracker(tr.path);
    let n = 0, jump = true;
    for (let i = 0; i < 120 * 200 && !logic.finished; i++) {
      sim.drive(bot.control(phys)); sim.score();
      if (i % 12) continue;
      T.update(phys.pos, T.lapRange(logic.lap, logic.laps), jump); jump = false;
      const sense = phys.grounded && !phys.rib && phys.fwdSpeed > 8 ? T.headingSense(-Math.sin(phys.yaw), -Math.cos(phys.yaw)) : 0;
      n = sense === -1 ? n + 1 : 0;
      if (n >= 6) { bad.push(`${def.id} à ${logic.time.toFixed(1)} s`); n = -6; }
    }
    assert.ok(logic.finished, def.id + ' : arrivée');
  }
  assert.deepEqual(bad, []);
});

test('branchements : message « Mauvais sens », contrôle 10 fois par seconde en course solo et en multijoueur, mini-carte créée, dessinée, libérée, cachable', () => {
  assert.equal(MSG.wrongWay[0], '⛔ Mauvais sens');
  const race = read('js/race.js');
  assert.match(race, /this\.tick % 12 === 0\) this\._checkWay\(\)/);
  assert.match(race, /this\.miniMap = new MiniMap\(track\)/);
  assert.match(race, /this\.miniMap\.draw\(this\._miniPoints\(\), performance\.now\(\)\)/);
  assert.match(race, /this\.miniMap\.dispose\(\)/);
  assert.equal(HUD_HIDE.minimap, 'mini-carte');
  assert.match(read('css/style.css'), /body\.hud-no-minimap \.minimap \{ display: none; \}/);
});

await finish('La mini-carte place le circuit dans son cadre et le « mauvais sens » ne parle qu\'à contre-sens, près de la ligne.');
