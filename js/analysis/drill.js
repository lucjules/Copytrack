// Mesure d'un exercice de l'Académie (Copytrack Evolution, E12) : la course est REJOUÉE à partir de ses commandes (traceFromInputs, le même pas que
// la course et le serveur), puis mesurée par l'analyse : temps et vitesse moyenne dans des zones du circuit, chocs, réceptions, mini-turbos.
// Le jeu et les tests mesurent donc exactement la même chose. Module pur, sans DOM (tools/test-skills.mjs).
//
//   measureRun(track, inputs, { zones }) -> { finished, time, walls, respawns, perfect, bad, turbos, turboLv, zoneTime, zoneSpeed, trace }
//     zones : [[a, b], …] indices de pièces du circuit (la zone va du centre de la pièce a au centre de la pièce b, mesurés sur la ligne du circuit)
//   drillAdvice(drill, mesure, track, grade)   le conseil du bilan (coach face à la référence dans les zones, ou d'après le geste)
import { traceFromInputs, traceFromBot } from './trace.js';
import { coach } from './coach.js';
import { makeReference, alignTrace, projectGlobal, timeAtS } from './reference.js';
import { summarize } from './events.js';
import { PIECES } from '../pieces.js';
import { CELL, LEVEL_H } from '../constants.js';

const centerOf = (t) => { const s = PIECES[t.t].size || 1; return [(t.x + s / 2) * CELL, t.l * LEVEL_H, (t.z + s / 2) * CELL]; };

// Zones en mètres sur la ligne du circuit : [[s0, s1], …] (la référence doit venir de track.path : circuits scriptés).
export function zoneBounds(track, ref, zones = []) {
  const o = { s: 0, j: 0, d: 0 };
  return zones.map(([a, b]) => {
    const s0 = projectGlobal(ref, ...centerOf(track.tiles[a]), o).s;
    const s1 = projectGlobal(ref, ...centerOf(track.tiles[b]), o).s;
    return [Math.min(s0, s1), Math.max(s0, s1)];
  });
}

export function measureRun(track, inputs, { zones = [] } = {}) {
  const trace = traceFromInputs(track, inputs);
  const ref = makeReference(track, trace);
  if (ref) alignTrace(trace, ref);
  const S = summarize(trace);
  let turboLv = 0;
  for (const e of trace.events) if (e.k === 'turbo') turboLv = Math.max(turboLv, e.q);
  let zoneTime = null, zoneSpeed = null;
  if (zones.length && ref && ref.source === 'path') {
    let tt = 0, dd = 0, ok = true;
    for (const [s0, s1] of zoneBounds(track, ref, zones)) {
      const t0 = timeAtS(trace, s0), t1 = timeAtS(trace, s1);
      if (t0 == null || t1 == null || !(t1 > t0)) { ok = false; break; }
      tt += t1 - t0; dd += s1 - s0;
    }
    if (ok) { zoneTime = tt; zoneSpeed = (dd / tt) * 3.6; }
  }
  return {
    finished: trace.finished, time: trace.time, walls: S.walls, respawns: S.respawns, perfect: S.perfect, bad: S.badLandings,
    turbos: S.turbos, turboLv, zoneTime, zoneSpeed, trace,
  };
}

// Conseil adapté à un exercice (le bilan) : pour les zones mesurées, le conseil du coach (analysis/coach.js) face au pilote automatique au niveau
// de l'or, limité aux zones de l'exercice ; pour les gestes, ce que la mesure dit du geste. Texte français (la clé de la traduction).
export const DRILL_HINT = {
  none: 'Finis la course pour obtenir une note.',
  'turbo-0': 'Pas de mini-turbo : avant le virage, volant à fond PUIS frein une demi-seconde (pas l’inverse), sans accélérer.',
  'turbo-1': 'Mini-turbo simple : la glisse s’est arrêtée trop tôt. Après le coup de frein, accélère en gardant le volant tourné une seconde et demie.',
  'turbo-wall': 'Le renforcé y est, mais un choc a coûté la note : déclenche la glisse un peu plus tôt, avant l’entrée du virage.',
  'turbo-slow': 'Le renforcé y est, mais l’arrivée est trop lente : redresse dès que les étincelles changent de couleur et remets les gaz.',
  'land-bad': '{n} réception(s) ratée(s) : en l’air, lâche les commandes si l’assiette est bonne ; le frein relève le nez, l’accélérateur le baisse.',
  'land-ok': 'Réceptions correctes mais pas parfaites : retombe exactement à plat sur la pente, ni nez en haut ni nez en bas.',
  zone: 'Dans la zone mesurée, le pilote de référence va plus vite : {tip}',
  best: 'Note maximale : tu vas aussi vite que la référence. Essaie de battre ta meilleure mesure.',
};
export function drillAdvice(d, m, track, grade = 0) {
  const fill = (k, v = {}) => DRILL_HINT[k].replace(/\{(\w+)\}/g, (_, x) => (v[x] == null ? '' : String(v[x])));
  if (!m || !m.finished) return fill('none');
  if (d.measure === 'turbo') {
    if (m.turboLv < 1) return fill('turbo-0');
    if (m.turboLv < 2) return fill('turbo-1');
    if (m.walls > 0) return fill('turbo-wall');
    if (m.time > d.limit) return fill('turbo-slow');
    return fill('best');
  }
  if (d.measure === 'landings') return m.perfect >= 3 ? fill('best') : m.bad > 0 ? fill('land-bad', { n: m.bad }) : fill('land-ok');
  // Zones : le conseil du coach face à la référence (le pilote automatique au niveau de l'or), s'il tombe dans une zone de l'exercice ; sinon la consigne.
  if (m.trace && m.trace.ref && m.trace.ref.source === 'path') {
    const refTrace = traceFromBot(track, { latK: 1 });
    if (refTrace) {
      alignTrace(refTrace, m.trace.ref);
      const zs = zoneBounds(track, m.trace.ref, d.zones);
      const tips = coach(m.trace, refTrace).filter((tp) => zs.some(([s0, s1]) => tp.s >= s0 - 40 && tp.s <= s1 + 10));
      if (tips.length) return fill('zone', { tip: tips[0].text });
    }
  }
  return grade >= 3 ? fill('best') : d.tip;
}
