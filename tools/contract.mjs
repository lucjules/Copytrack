// Contrat complet d'un circuit refait : node tools/contract.mjs <fichier.mjs|json> [--map]   (un fichier qui exporte un tableau de définitions)
//   node tools/contract.mjs --builtin            -> tous les circuits intégrés qui ont un `profil`
//   node tools/contract.mjs --builtin eclats     -> un circuit intégré
//
// `checkDef(def)` est LA définition de « circuit bien fait » : tools/test-niveaux.mjs l'applique à tous les circuits à profil, et l'atelier
// l'applique aux candidats avant qu'ils entrent dans js/tracks.js. Chaque défaut renvoyé est une phrase lisible.
import { buildBuiltin, BUILTIN_TRACKS } from '../js/tracks.js';
import { PROFILS } from '../js/career.js';
import { GEN_IDS } from '../js/pieces.js';
import { checkTrack } from '../js/editorTools.js';
import { orientationIssues } from '../js/joins.js';
import { RaceLogic } from '../js/raceLogic.js';
import { SIDE_MIN_SPEED } from '../js/physics.js';
import { Track } from '../js/track.js';
import { runTrack, profile, asciiMap } from './lab.mjs';
import { proposeFrom } from './medals.mjs';

const NEW = new Set([...GEN_IDS, 'hugecurve', 'steep4', 'bankBig']);
export const vocabulary = (tr) => {
  const v = new Set();
  for (const t of tr.tiles) { if (NEW.has(t.t)) v.add(t.t); if (t.o) v.add('wall-ride'); }
  return v;
};

// Mesures qui définissent chaque profil (sur la course du pilote automatique). Renvoie la liste des défauts.
export const PROFILE_CONTRACT = {
  sprint: (P, S) => {
    const f = [];
    if (P.tight !== 0) f.push(`sprint : ${P.tight} virage(s) serré(s) (0 attendu)`);
    if (P.wide > 3) f.push(`sprint : ${P.wide} très grands virages (3 au plus)`);
    if (S.time < 10 || S.time > 20) f.push(`sprint : ${S.time.toFixed(1)} s (10 à 20 s)`);
    if (P.over180 < 0.6) f.push(`sprint : ${(P.over180 * 100).toFixed(0)} % du temps au-dessus de 180 km/h (60 % au moins)`);
    if (P.straights / P.pieces < 0.4) f.push(`sprint : ${(100 * P.straights / P.pieces).toFixed(0)} % de lignes droites (40 % au moins)`);
    return f;
  },
  speedway: (P) => {
    const f = [];
    if (P.tight !== 0) f.push(`speedway : ${P.tight} virage(s) serré(s) (0 attendu)`);
    if (P.wide < 4) f.push(`speedway : ${P.wide} très grands virages (4 au moins)`);
    if (P.over250 < 0.4) f.push(`speedway : ${(P.over250 * 100).toFixed(0)} % du temps au-dessus de 250 km/h (40 % au moins)`);
    if (P.brakePct > 8) f.push(`speedway : ${P.brakePct} % de freinage (8 % au plus)`);
    if (P.avgKmh < 200) f.push(`speedway : moyenne ${P.avgKmh} km/h (200 au moins)`);
    return f;
  },
  technique: (P) => {
    const f = [];
    if (P.tight < 8) f.push(`technique : ${P.tight} virages serrés (8 au moins)`);
    if (P.brakePct < 12) f.push(`technique : ${P.brakePct} % de freinage (12 % au moins)`);
    if (P.avgKmh > 150) f.push(`technique : moyenne ${P.avgKmh} km/h (150 au plus)`);
    if (P.boosts < 5) f.push(`technique : ${P.boosts} boosters (5 au moins, un par relance)`);
    return f;
  },
  rollercoaster: (P, S, tr) => {
    const f = [];
    if (P.heightRange < 6) f.push(`rollercoaster : ${P.heightRange} niveaux de hauteur (6 au moins)`);
    if (P.wallCells < 8) f.push(`rollercoaster : ${P.wallCells} cases sur un mur (8 au moins)`);
    if (P.loops < 1) f.push('rollercoaster : aucun looping');
    if (!(tr.tiles.some((t) => t.o === 1) && tr.tiles.some((t) => t.o === 2))) f.push('rollercoaster : wall-rides des deux côtés requis');
    return f;
  },
  acrobatique: (P, S) => {
    const f = [];
    if (S.airTotal < 6) f.push(`acrobatique : ${S.airTotal.toFixed(1)} s en l'air (6 s au moins)`);
    if (S.jumps < 3) f.push(`acrobatique : ${S.jumps} sauts (3 au moins)`);
    if (P.heightRange < 8) f.push(`acrobatique : ${P.heightRange} niveaux de hauteur (8 au moins)`);
    return f;
  },
};

export const openingOf = (d) => d.script.trim().split(/\s+/).slice(1, 4).join(' ');

export function checkDef(def) {
  const f = [], info = {};
  const baseCap = (def.pilot && def.pilot.vCap) || 52;
  let tr;
  try { tr = buildBuiltin(def); } catch (e) { return { fails: ['construction : ' + e.message], info }; }
  if (!PROFILS[def.profil]) f.push('profil inconnu : ' + def.profil);
  if (def.params && def.params.v0) f.push('départ lancé (v0) interdit : on doit pouvoir repartir à l\'arrêt');
  if (/^(B S2? R|S2 B|S B|B S2 B|B S2 R)/.test(def.script.replace(/^start /, ''))) f.push('départ « classique » interdit : ' + openingOf(def));
  const voc = vocabulary(tr);
  if (voc.size < 4) f.push(`seulement ${voc.size} pièces nouvelles (${[...voc].join(' ')}) : 4 au moins`);
  const S = runTrack(tr);
  const P = profile(tr, S);
  Object.assign(info, { time: S.time, vmax: S.vmax, P, S: { airTotal: S.airTotal, jumps: S.jumps, perfects: S.perfects, rings: S.rings, vehicle: S.vehicle, wallVmin: S.wallVmin } });
  if (!S.ok) { f.push('pilote : ' + S.reason); return { fails: f, info }; }
  if (S.respawns) f.push(`pilote : ${S.respawns} réapparitions`);
  if (S.wallHits) f.push(`pilote : ${S.wallHits} chocs contre une bordure`);
  if (S.spikes) f.push(`pilote : ${S.spikes} piques touchées`);
  if (S.shocks) f.push(`pilote : ${S.shocks} chocs contre un obstacle`);
  if (PROFILE_CONTRACT[def.profil]) f.push(...PROFILE_CONTRACT[def.profil](P, S, tr)); else f.push('pas de contrat pour le profil ' + def.profil);
  if (S.wallVmin < Infinity && !(S.wallVmin * 3.6 >= 130 && S.wallVmin > SIDE_MIN_SPEED)) f.push(`wall-ride pris à ${(S.wallVmin * 3.6).toFixed(0)} km/h (130 au moins)`);
  const chk = checkTrack(tr).map((i) => i.msg).concat(orientationIssues(tr).map((i) => i.msg));
  if (chk.length) f.push('vérificateur de l\'éditeur : ' + [...new Set(chk)].join(' / '));
  // tolérance à la vitesse
  for (const k of [0.9, 1.1]) {
    const R = runTrack(buildBuiltin(def), { vCap: +(baseCap * k).toFixed(1) });
    if (!R.ok || R.respawns) f.push(`pilote à ${(k * 100).toFixed(0)} % : ${R.ok ? R.respawns + ' réapparitions' : R.reason}`);
  }
  if (def.profil !== 'acrobatique') {
    const R = runTrack(buildBuiltin(def), { vCap: +(baseCap * 1.25).toFixed(1) });
    if (!R.ok) f.push(`pilote à 125 % : ${R.reason}`);
  }
  // repartir de chaque checkpoint, à l'arrêt
  const n = new RaceLogic(tr).cps.length;
  if (n < 1) f.push('aucun checkpoint');
  for (let k = 1; k <= n; k++) {
    const R = runTrack(buildBuiltin(def), { rewindAtCp: k });
    if (!R.ok || R.respawns) f.push(`repartir du checkpoint ${k} à l'arrêt ${R.ok ? 'coûte ' + R.respawns + ' réapparitions' : 'échoue (' + R.reason + ')'}`);
  }
  // médailles (un candidat sans médailles reçoit celles du pilote : or = son temps)
  const M = proposeFrom(S.time);
  if (!def.medals) def.medals = M;
  else for (const k of Object.keys(M)) if (Math.abs(def.medals[k] - M[k]) / M[k] >= 0.02) { f.push(`médailles à recalculer (proposé ${JSON.stringify(M).replace(/"/g, '')})`); break; }
  // objectif bonus
  const g = def.goal || {};
  if (g.id === 'under' && !(g.t >= (def.medals?.or ?? 0) - 1e-9 && g.t <= (def.medals?.argent ?? 1e9))) f.push(`objectif « moins de ${g.t} s » hors de [or, argent]`);
  if (g.id === 'perfect' && S.perfects < g.n) f.push(`objectif ${g.n} réceptions parfaites : le pilote en fait ${S.perfects}`);
  if (g.id === 'rings' && S.rings < g.n) f.push(`objectif ${g.n} anneaux : le pilote en passe ${S.rings}`);
  if (g.id === 'vehicle' && S.vehicle !== g.v) f.push(`objectif véhicule ${g.v} : le pilote arrive en ${S.vehicle}`);
  // partage
  const back = Track.decode(tr.encode());
  if (back.tiles.length !== tr.tiles.length || back.signature() !== tr.signature()) f.push('le code SHW ne se recharge pas à l\'identique');
  return { fails: f, info };
}

// ---- Ligne de commande ----------------------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('contract.mjs')) {
  const a = process.argv.slice(2);
  const showMap = a.includes('--map');
  let defs;
  if (a.includes('--builtin')) {
    const ids = a.filter((x) => !x.startsWith('--'));
    defs = BUILTIN_TRACKS.filter((d) => d.profil && (!ids.length || ids.includes(d.id)));
  } else {
    const file = a.find((x, i) => !x.startsWith('--') && a[i - 1] !== '--out');
    if (!file) { console.error('usage : node tools/contract.mjs <fichier.mjs> | --builtin [id…]'); process.exit(2); }
    const m = await import(new URL(file, 'file://' + process.cwd() + '/').href);
    defs = m.default || m.DEFS;
  }
  let bad = 0;
  for (const d of defs) {
    const t0 = Date.now();
    const { fails, info } = checkDef(d);
    const P = info.P || {};
    console.log(`${fails.length ? 'ÉCHEC' : 'OK   '} ${d.id.padEnd(13)} ${(d.profil || '').padEnd(13)} ${info.time ? info.time.toFixed(1).padStart(5) + ' s' : '     -'}  serrés ${P.tight ?? '-'} larges ${P.wide ?? '-'} moy ${P.avgKmh ?? '-'} >250 ${P.over250 != null ? Math.round(P.over250 * 100) : '-'}% frein ${P.brakePct ?? '-'}% haut ${P.heightRange ?? '-'} air ${info.S ? info.S.airTotal.toFixed(1) : '-'} sauts ${info.S ? info.S.jumps : '-'}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const x of fails) console.log('      - ' + x);
    if (showMap) { try { console.log(asciiMap(buildBuiltin(d)) + '\n'); } catch (e) { /* ignoré */ } }
    if (fails.length) bad++;
  }
  const out = a[a.indexOf('--out') + 1];
  if (a.includes('--out') && out) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(out, JSON.stringify(defs.map((d) => ({ ...d })), null, 1));
    console.log('écrit :', out);
  }
  console.log(bad ? `\n${bad} circuit(s) hors contrat sur ${defs.length}.` : `\nLes ${defs.length} circuits respectent le contrat.`);
  process.exitCode = bad ? 1 : 0;
}
