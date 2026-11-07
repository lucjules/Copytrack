// Indice de difficulté d'un circuit, estimé d'après sa GÉOMÉTRIE seulement (aucune simulation) : on le calcule pour chaque carte de la communauté et à la publication, instantanément, sur n'importe quel
// circuit (un circuit d'éditeur n'a pas de ligne centrale pour le pilote automatique). Mêmes ingrédients que tools/difficulte.mjs (qui, lui, mesure la course du pilote) : virages serrés, très grands
// virages, murs, loopings, dénivelé, obstacles, pièces mobiles, revêtements piégeux, longueur. Les seuils des étoiles sont calés sur les circuits intégrés (tools/test-difficulte.mjs).
import { PIECES } from './pieces.js';
import { isObstacle, OBST } from './obstacles.js';

// Poids par obstacle : ce qui bloque la route compte plus que ce qui borde.
const OBST_W = { spikes: 0.5, spikesPop: 1.2, pendulum: 1.2, hammer: 1.4, slider: 1.0, sweeper: 1.2, bumper: 0.4 };
// Revêtements qui punissent une erreur (glace, verre, vide, ralentisseur, moteur coupé, vent, contre-courant) : poids léger.
const TRICKY = new Set(['ice', 'glass', 'cut', 'slow', 'wind', 'current']);

export function difficultyMetrics(track) {
  const tiles = track.tiles || [], P = (t) => PIECES[t.t] || {};
  let minL = Infinity, maxL = -Infinity;
  for (const t of tiles) { const l = t.l * 1; minL = Math.min(minL, l); maxL = Math.max(maxL, l + (P(t).rise > 0 ? P(t).rise : 0)); }
  const obst = (track.decos || []).filter((d) => isObstacle(d.k));
  return {
    pieces: tiles.length,
    tight: tiles.filter((t) => P(t).kind === 'arc' && P(t).size === 1 && !P(t).checkpoint).length,
    wide: tiles.filter((t) => (P(t).kind === 'arc' && P(t).size >= 2) || t.t === 'bank' || t.t === 'bankBig').length,
    wallCells: tiles.filter((t) => t.o).length + tiles.filter((t) => P(t).roll).length,
    loops: tiles.filter((t) => P(t).kind === 'loop').length,
    ribbons: tiles.filter((t) => P(t).kind === 'ribbon').length,          // tubes, tire-bouchons, vrilles : routes en ruban
    specials: tiles.filter((t) => P(t).special || ['fork', 'ring', 'area'].includes(P(t).kind)).length,      // plaques, anneaux, bifurcations, plateformes
    movers: tiles.filter((t) => t.mv).length,
    tricky: tiles.filter((t) => TRICKY.has(t.s) || (t.s2 && TRICKY.has(t.s2))).length,
    obstacles: obst.length,
    obstacleWeight: obst.reduce((a, d) => a + (OBST_W[d.k] ?? (OBST[d.k] ? 1 : 0)), 0),
    noRails: tiles.filter((t) => t.nb).length,
    ceiling: tiles.filter((t) => t.v).length,
    heightRange: Number.isFinite(minL) ? Math.max(0, maxL - minL) : 0,
    laps: Math.max(1, track.laps || 1),
  };
}

// Score continu (plus c'est haut, plus c'est dur). Les très grands virages comptent peu (ils sont doux) ; les murs, les loopings, les rubans, les obstacles, les pièces mobiles et les pièges comptent plus.
export function difficultyScore(m) {
  const lap = m.laps > 1 ? 1 + (m.laps - 1) * 0.25 : 1;
  const v = m.tight * 0.8 + m.wide * 0.1 + m.wallCells * 0.3 + m.loops * 0.8 + m.ribbons * 0.12 + m.specials * 0.5
    + m.movers * 0.9 + m.obstacleWeight * 0.7 + m.tricky * 0.3 + m.noRails * 0.2 + m.ceiling * 0.2 + Math.max(0, m.heightRange - 6) * 0.12 + m.pieces * 0.05;
  return +(v * lap).toFixed(2);
}

// Seuils du score pour 2, 3, 4 et 5 étoiles : environ les 15 %, 40 %, 65 % et 88 % des 72 circuits intégrés (voir tools/test-difficulte.mjs, qui garde cette répartition).
export const STAR_STEPS = [4.6, 8, 10, 14];

export function starsOf(score) {
  let s = 1;
  for (const t of STAR_STEPS) if (score >= t) s++;
  return s;
}

// Estimation complète : { stars: 1 à 5, score, metrics }.
export function estimateDifficulty(track) {
  const metrics = difficultyMetrics(track), score = difficultyScore(metrics);
  return { stars: starsOf(score), score, metrics };
}

export const starsText = (n) => '◆'.repeat(n) + '◇'.repeat(5 - n);
export const STAR_LABELS = ['', 'Très facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile'];
