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
import { SIDE_MIN_SPEED } from '../js/physics/specs.js';
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
    if (S.time < 12 || S.time > 26) f.push(`sprint : ${S.time.toFixed(1)} s (12 à 26 s)`);       // 0.9.11 : cases de 32 m au lieu de 24 : 10-20 s -> 12-26 s
    if (P.over180 < 0.6) f.push(`sprint : ${(P.over180 * 100).toFixed(0)} % du temps au-dessus de 180 km/h (60 % au moins)`);
    if (P.straights / P.pieces < 0.4) f.push(`sprint : ${(100 * P.straights / P.pieces).toFixed(0)} % de lignes droites (40 % au moins)`);
    return f;
  },
  speedway: (P) => {
    const f = [];
    if (P.tight !== 0) f.push(`speedway : ${P.tight} virage(s) serré(s) (0 attendu)`);
    if (P.wide < 4) f.push(`speedway : ${P.wide} très grands virages (4 au moins)`);
    if (P.over220 < 0.35) f.push(`speedway : ${(P.over220 * 100).toFixed(0)} % du temps au-dessus de 220 km/h (35 % au moins)`);   // 0.9.11 : boosters moins forts, 250 -> 240 km/h
    if (P.brakePct > 14) f.push(`speedway : ${P.brakePct} % de freinage (14 % au plus)`);      // 0.9.12 : moteur 2× plus vif, on arrive plus vite dans les virages : 8 -> 14 %
    if (P.avgKmh < 200) f.push(`speedway : moyenne ${P.avgKmh} km/h (200 au moins)`);
    return f;
  },
  technique: (P) => {
    const f = [];
    if (P.tight < 8) f.push(`technique : ${P.tight} virages serrés (8 au moins)`);
    if (P.brakePct < 3) f.push(`technique : ${P.brakePct} % de freinage (3 % au moins)`);                       // 0.9.11 : plus d'adhérence, on freine moins longtemps
    if (P.under120 < 0.15) f.push(`technique : ${(P.under120 * 100).toFixed(0)} % du temps sous 120 km/h (15 % au moins)`);
    if (P.avgKmh > 170) f.push(`technique : moyenne ${P.avgKmh} km/h (170 au plus)`);      // 0.9.12 : relances plus vives, 155 -> 170
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
  // Chapitre « Mécanismes » : un circuit court qui montre un ou deux mécanismes (obstacles, pièces mobiles) AU PILOTE, qui les franchit sans choc ni réapparition.
  // def.meca : les mécanismes qu'il enseigne (clés d'obstacles de js/obstacles.js, ou « lift » / « slide » pour l'ascenseur et la glissière) ; chacun doit être présent.
  atelier: (P, S, tr, def) => {
    const f = [];
    if (S.time < 14 || S.time > 32) f.push(`atelier : ${S.time.toFixed(1)} s (14 à 32 s)`);
    const meca = def.meca || [];
    if (!meca.length) f.push('atelier : aucun mécanisme déclaré (champ meca)');
    for (const m of meca) {
      const has = m === 'lift' ? tr.tiles.some((t) => t.mv === 1) : m === 'slide' ? tr.tiles.some((t) => t.mv === 2) : tr.decos.some((d) => d.k === m);
      if (!has) f.push(`atelier : le mécanisme « ${m} » n'est pas dans le circuit`);
    }
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
  if (PROFILE_CONTRACT[def.profil]) f.push(...PROFILE_CONTRACT[def.profil](P, S, tr, def)); else f.push('pas de contrat pour le profil ' + def.profil);
  if (S.wallVmin < Infinity && !(S.wallVmin * 3.6 >= 130 && S.wallVmin > SIDE_MIN_SPEED)) f.push(`wall-ride pris à ${(S.wallVmin * 3.6).toFixed(0)} km/h (130 au moins)`);
  const chk = checkTrack(tr).map((i) => i.msg).concat(orientationIssues(tr).map((i) => i.msg));
  if (chk.length) f.push('vérificateur de l\'éditeur : ' + [...new Set(chk)].join(' / '));
  // tolérance à la vitesse
  // 0.9.60 (phase 2) : une vitesse isolée peut tomber sur une réception chaotique (meduses à 110 % exactement : 1 réapparition, alors que 109 %, 111 %, 112 % et 115 % passent). La
  // tolérance est donc jugée sur trois vitesses voisines (k − 1 %, k, k + 1 %) : au moins DEUX doivent passer, et la médiane est celle qu'on annonce.
  for (const k of [0.9, 1.1]) {
    const runs = [k - 0.01, k, k + 0.01].map((kk) => ({ kk, R: runTrack(buildBuiltin(def), { vCap: +(baseCap * kk).toFixed(1) }) }));
    const bad = runs.filter(({ R }) => !R.ok || R.respawns);
    if (bad.length >= 2) f.push(`pilote à ${(k * 100).toFixed(0)} % : ${bad[0].R.ok ? bad[0].R.respawns + ' réapparitions' : bad[0].R.reason}`);
  }
  // 0.9.12 : plus de contrôle à +15 % (c'était +25 % avant) : la tolérance reste ±10 % de la vitesse du pilote, vérifiée ci-dessus ; au-delà, les sorties de mur et les sommets font décoller la voiture.
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
  else if (def.medalsBy === 'humain') { const m = def.medals; if (!(m.cristal < m.or && m.or < m.argent && m.argent < m.bronze)) f.push('médailles humaines non croissantes'); }
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
