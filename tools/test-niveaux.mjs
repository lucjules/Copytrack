// Tests de la refonte du level design (0.9.6 : lot 1, 0.9.7 : lot 2…) : node tools/test-niveaux.mjs   (npm test)
//
// Un circuit refait porte un champ `profil` (sprint, speedway, technique, rollercoaster, acrobatique). Ce fichier est le CONTRAT de ces
// profils : chaque profil est défini par des mesures (virages serrés, vitesse, freinages, hauteur, temps en l'air), prises sur la course du
// pilote automatique, et chaque circuit refait doit les respecter, rester finissable à ±10 % de vitesse, sans choc, avec ses médailles à jour.
// Les lots suivants n'ont qu'à ajouter `profil` à leurs circuits : ils tombent sous les mêmes vérifications.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let failures = 0;
function test(name, fn) { try { const r = fn(); if (r && typeof r.then === 'function') throw new Error('test asynchrone : ses assertions ne seraient jamais vérifiées'); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); } }

const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { PROFILS } = await import('../js/career.js');
const { GEN_IDS, PIECES } = await import('../js/pieces.js');
const { VERSION } = await import('../js/constants.js');
const { runTrack, profile } = await import('./lab.mjs');
const { proposeMedals } = await import('./medals.mjs');
const { checkTrack } = await import('../js/editorTools.js');
const { orientationIssues } = await import('../js/joins.js');
const { CarPhysics, SIDE_MIN_SPEED } = await import('../js/physics.js');
const { RaceLogic, placeAtStart } = await import('../js/raceLogic.js');
const { Autopilot } = await import('../js/autopilot.js');
const { Track } = await import('../js/track.js');

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const REDONE = BUILTIN_TRACKS.filter((d) => d.profil);
const baseCap = (def) => (def.pilot && def.pilot.vCap) || 52;
const built = new Map(REDONE.map((d) => [d.id, buildBuiltin(d)]));
// Une course par circuit (le pilote du circuit), réutilisée par les mesures.
const runs = new Map(REDONE.map((d) => { const S = runTrack(built.get(d.id)); return [d.id, { S, P: profile(built.get(d.id), S) }]; }));

console.log('Version et profils');
test('version 0.9.6 ou plus (bêta 0.9.x suit package.json)', () => {
  const v = JSON.parse(read('package.json')).version;
  assert.equal(VERSION, 'bêta ' + v);
  assert.ok(+v.split('.')[2] >= 6, v);
});
test('chaque profil écrit existe ; les dix premiers circuits ont un profil', () => {
  for (const d of REDONE) assert.ok(PROFILS[d.profil], d.id + ' : profil inconnu ' + d.profil);
  const first = BUILTIN_TRACKS.slice(0, 10);
  assert.ok(first.every((d) => d.profil), 'les dix premiers circuits doivent avoir un profil : ' + first.filter((d) => !d.profil).map((d) => d.id));
});
test('le chapitre 1 propose les cinq profils, et deux circuits consécutifs d’un chapitre n’ont jamais le même profil', () => {
  assert.equal(new Set(BUILTIN_TRACKS.slice(0, 6).map((d) => d.profil)).size, 5);
  for (let i = 0; i + 1 < BUILTIN_TRACKS.length; i++) {
    const a = BUILTIN_TRACKS[i], b = BUILTIN_TRACKS[i + 1];
    if (a.profil && b.profil && Math.floor(i / 6) === Math.floor((i + 1) / 6)) assert.notEqual(a.profil, b.profil, `${a.id} puis ${b.id} : ${a.profil} deux fois de suite`);
  }
});
test('chaque profil a un libellé et une infobulle', () => {
  for (const [k, p] of Object.entries(PROFILS)) assert.ok(p.label && p.tip, k);
});
test('la carte de carrière affiche la pastille du profil', () => {
  assert.match(read('js/main.js'), /tag profil \$\{pf\.cls\}/);
  for (const p of Object.values(PROFILS)) assert.match(read('css/style.css'), new RegExp('\\.card \\.tag\\.' + p.cls));
  assert.match(read('css/style.css'), /\.card \.tag\.p-speedway/);
});

console.log('Départs');
const opening = (d) => d.script.trim().split(/\s+/).slice(1, 4).join(' ');
test('aucun départ « classique » (booster, deux droites, virage) sur les circuits refaits', () => {
  for (const d of REDONE) assert.ok(!/^(B S2? R|S2 B|S B|B S2 B|B S2 R)/.test(d.script.replace(/^start /, '')), d.id + ' : ' + opening(d));
});
test('les ouvertures des circuits refaits sont toutes différentes', () => {
  const o = REDONE.map(opening);
  assert.equal(new Set(o).size, o.length, o.join(' | '));
});
test('ouvertures du chapitre 1 : booster → wall-ride, booster → virage relevé, chute libre, épingle descendante, montée verticale, booster → looping', () => {
  const by = Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, d]));
  assert.match(by.eclats.script, /^start B2 \[tr01l\]/);
  assert.match(by.canyon.script, /^start B BRR/);
  assert.match(by.tremplins.script, /^start G\d V-\d/);
  assert.match(by.verglas.script, /^start \[cvd1\] \[cvd1\]/);
  assert.match(by.grandtour.script, /^start B3 QU WA\d CR/);
  assert.match(by.spirale.script, /^start B3 OB /);
});
test('ouvertures du chapitre 2 : boosters → rampe de lancement avec anneau, départ en tube, boosters → rebond géant, bifurcation avec plaque moto', () => {
  const by = Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, d]));
  assert.match(by.lianes.script, /^start B3 UU GR\d DD /);
  assert.match(by.canopee.script, /^start TI TM\d\.b TO BRR/);
  assert.match(by.spores.script, /^start B2 S\.j200 G2 V2 /);
  assert.match(by.serpent.script, /^start Y2\.o /);
});
test('aucun circuit refait n’a de vitesse de départ (v0) : on doit pouvoir repartir du départ À L’ARRÊT (réapparition avant le premier checkpoint)', () => {
  for (const d of REDONE) assert.ok(!(d.params && d.params.v0), d.id + ' : départ lancé');
});
test('chute libre : départ à plus de 8 niveaux de haut, depuis l’arrêt, réception sur une descente', () => {
  const d = BUILTIN_TRACKS.find((x) => x.id === 'tremplins');
  assert.ok(d.opts.l >= 10, JSON.stringify(d.opts));
  assert.ok(runs.get('tremplins').S.airMax > 1, 'la chute doit durer');
});

console.log('Nouvelles pièces dès le début');
const NEW = new Set([...GEN_IDS, 'hugecurve', 'steep4', 'bankBig']);
const vocabulary = (tr) => {
  const v = new Set();
  for (const t of tr.tiles) { if (NEW.has(t.t)) v.add(t.t); if (t.o) v.add('wall-ride'); }
  return v;
};
test('chaque circuit refait emploie au moins quatre pièces de la 0.9.3 (wall-rides, courbes progressives, inclinaisons, très grands virages)', () => {
  for (const d of REDONE) assert.ok(vocabulary(built.get(d.id)).size >= 4, d.id + ' : ' + [...vocabulary(built.get(d.id))].join(' '));
});
test('wall-ride dès le premier circuit, et dans les six circuits du chapitre 1', () => {
  for (const d of BUILTIN_TRACKS.slice(0, 6)) assert.ok(built.get(d.id).tiles.some((t) => t.o), d.id + ' sans wall-ride');
});
test('les wall-rides se prennent au-dessus de la vitesse de décrochage avec une marge (≥ 130 km/h)', () => {
  for (const d of REDONE) {
    const tr = buildBuiltin(d);
    const phys = new CarPhysics(tr), logic = new RaceLogic(tr); placeAtStart(phys, logic);
    const bot = new Autopilot(tr.path); bot.reset(phys);
    let vmin = Infinity;
    for (let i = 0; i < 120 * 60; i++) {
      phys.clock = logic.steps; phys.step(bot.control(phys));
      if (phys.rib && phys.rib.tile && phys.rib.tile.o) vmin = Math.min(vmin, phys.speed);
      const ev = logic.update(phys); if (ev && ev.type === 'finish') break;
    }
    if (vmin < Infinity) assert.ok(vmin * 3.6 >= 130 && vmin > SIDE_MIN_SPEED, `${d.id} : ${(vmin * 3.6).toFixed(0)} km/h sur le mur`);
  }
});

console.log('Profils : mesures sur la course du pilote');
const C = {
  sprint: (P, S, tr) => {
    assert.equal(P.tight, 0, 'virages serrés');
    assert.ok(P.wide <= 3, 'très grands virages : ' + P.wide);
    assert.ok(S.time >= 10 && S.time <= 20, 'temps ' + S.time.toFixed(1));
    assert.ok(P.over180 >= 0.6, '>180 km/h : ' + P.over180);
    assert.ok(P.straights / P.pieces >= 0.4, 'part de droites ' + (P.straights / P.pieces).toFixed(2));
  },
  speedway: (P) => {
    assert.equal(P.tight, 0, 'aucun virage serré');
    assert.ok(P.wide >= 4, 'très grands virages : ' + P.wide);
    assert.ok(P.over250 >= 0.4, 'plus de 250 km/h pendant ' + P.over250);
    assert.ok(P.brakePct <= 8, 'freinage ' + P.brakePct + ' %');
    assert.ok(P.avgKmh >= 200, 'moyenne ' + P.avgKmh);
  },
  technique: (P) => {
    assert.ok(P.tight >= 8, 'virages serrés : ' + P.tight);
    assert.ok(P.brakePct >= 12, 'freinage ' + P.brakePct + ' %');
    assert.ok(P.avgKmh <= 150, 'moyenne ' + P.avgKmh);
    assert.ok(P.boosts >= 5, 'un booster par relance : ' + P.boosts);
  },
  rollercoaster: (P, S, tr) => {
    assert.ok(P.heightRange >= 6, 'hauteur ' + P.heightRange + ' niveaux');
    assert.ok(P.wallCells >= 8, 'cases sur un mur : ' + P.wallCells);
    assert.ok(P.loops >= 1, 'loopings');
    assert.ok(tr.tiles.some((t) => t.o === 1) && tr.tiles.some((t) => t.o === 2), 'wall-rides des deux côtés');
  },
  acrobatique: (P, S) => {
    assert.ok(S.airTotal >= 6, 'temps en l\'air ' + S.airTotal.toFixed(1));
    assert.ok(S.perfects >= 3, 'réceptions parfaites ' + S.perfects);
    assert.ok(P.heightRange >= 8, 'hauteur ' + P.heightRange);
  },
};
for (const d of REDONE) {
  test(`${d.id} (${d.profil}) respecte son profil`, () => { const { S, P } = runs.get(d.id); assert.ok(S.ok, S.reason); C[d.profil](P, S, built.get(d.id)); });
}

console.log('Solidité des circuits refaits');
test('le vérificateur de l’éditeur ne signale rien sur les circuits refaits (ni extrémité libre, ni saut risqué, ni raccord d’orientation)', () => {
  for (const d of REDONE) {
    const tr = built.get(d.id);
    assert.deepEqual(checkTrack(tr).map((i) => i.msg), [], d.id);
    assert.deepEqual(orientationIssues(tr).map((i) => i.msg), [], d.id);
  }
});
test('finissables par le pilote, sans réapparition ni choc contre une bordure', () => {
  for (const d of REDONE) { const { S } = runs.get(d.id); assert.ok(S.ok, d.id + ' : ' + S.reason); assert.equal(S.respawns, 0, d.id + ' réapparitions'); assert.equal(S.wallHits, 0, d.id + ' chocs'); }
});
test('tolérance à la vitesse : finissables avec un pilote 10 % plus lent et 10 % plus rapide (un joueur n’a jamais la vitesse exacte du pilote)', () => {
  for (const d of REDONE) for (const k of [0.9, 1.1]) {
    const S = runTrack(buildBuiltin(d), { vCap: +(baseCap(d) * k).toFixed(1) });
    assert.ok(S.ok && S.respawns === 0, `${d.id} à ${(k * 100).toFixed(0)} % : ${S.ok ? S.respawns + ' réapparitions' : S.reason}`);
  }
});
test('profils sans saut calé : finissables même avec un pilote 25 % plus rapide', () => {
  // Les circuits ont été vérifiés à 0,9× et 1,1× ; un pilote à 1,25× ne doit pas non plus les faire échouer (hors circuit de sauts).
  for (const d of REDONE.filter((x) => x.profil !== 'acrobatique')) {
    const S = runTrack(buildBuiltin(d), { vCap: +(baseCap(d) * 1.25).toFixed(1) });
    assert.ok(S.ok, `${d.id} à 125 % : ${S.reason}`);
  }
});
test('chaque checkpoint est repartable À L’ARRÊT : le pilote qui réapparaît à l’arrêt au point de réapparition finit sans nouvelle chute', () => {
  for (const d of REDONE) {
    const n = new RaceLogic(built.get(d.id)).cps.length;
    for (let k = 1; k <= n; k++) {
      const S = runTrack(buildBuiltin(d), { rewindAtCp: k });
      assert.ok(S.ok && S.respawns === 0, `${d.id} : repartir du checkpoint ${k} à l'arrêt ${S.ok ? 'coûte ' + S.respawns + ' réapparitions' : 'échoue (' + S.reason + ')'}`);
    }
  }
});
test('chaque circuit refait a au moins un checkpoint', () => {
  for (const d of REDONE) assert.ok(new RaceLogic(built.get(d.id)).cps.length >= 1, d.id + ' sans checkpoint');
});
test('médailles à jour : or = temps du pilote, cristal 0,95 ×, argent 1,15 ×, bronze 1,35 × (écart < 2 %)', () => {
  for (const d of REDONE) {
    const P = proposeMedals(d);
    for (const k of Object.keys(P.medals)) assert.ok(Math.abs(d.medals[k] - P.medals[k]) / P.medals[k] < 0.02, `${d.id} ${k} : écrit ${d.medals[k]}, proposé ${P.medals[k]}`);
  }
});
test('circuit de sauts : finissable de 48 à 72 m/s (172 à 260 km/h) à l’abord des rampes, sans checkpoint survolable', () => {
  const d = BUILTIN_TRACKS.find((x) => x.id === 'tremplins');
  for (const c of [48, 54, 60, 66, 72]) { const S = runTrack(buildBuiltin(d), { vCap: c }); assert.ok(S.ok && S.respawns === 0, `vCap ${c} : ${S.ok ? S.respawns + ' réapparitions' : S.reason}`); }
});
test('objectifs bonus réalisables : chrono ≥ médaille d’or, réceptions parfaites, anneaux et véhicule d’arrivée du pilote', () => {
  for (const d of REDONE) {
    const { S } = runs.get(d.id);
    if (d.goal.id === 'under') assert.ok(d.goal.t >= d.medals.or - 1e-9 && d.goal.t <= d.medals.argent, `${d.id} : ${d.goal.t} s`);
    if (d.goal.id === 'perfect') assert.ok(S.perfects >= d.goal.n, `${d.id} : ${S.perfects} réceptions parfaites`);
    if (d.goal.id === 'rings') assert.ok(S.rings >= d.goal.n, `${d.id} : ${S.rings} anneaux`);
    if (d.goal.id === 'vehicle') assert.equal(S.vehicle, d.goal.v, `${d.id} : arrivée en ${S.vehicle}`);
  }
});
test('ordre de carrière du chapitre 1 et difficulté croissante (1, 2, 2, 3, 3, 4), chapitre 2 refait dans l’ordre (lianes, canopée, spores, serpent)', () => {
  assert.deepEqual(BUILTIN_TRACKS.slice(0, 6).map((d) => d.difficulty), [1, 2, 2, 3, 3, 4]);
  assert.deepEqual(BUILTIN_TRACKS.slice(0, 6).map((d) => d.id), ['eclats', 'canyon', 'tremplins', 'spirale', 'verglas', 'grandtour']);
  assert.deepEqual(BUILTIN_TRACKS.slice(6, 10).map((d) => d.id), ['lianes', 'canopee', 'spores', 'serpent']);
});
test('les nouveaux circuits se partagent et se rechargent (code SHW) sans perte', () => {
  for (const d of REDONE) {
    const tr = built.get(d.id), back = Track.decode(tr.encode());
    assert.equal(back.tiles.length, tr.tiles.length, d.id);
    assert.equal(back.signature(), tr.signature(), d.id + ' : signature');
  }
});

console.log(failures ? `\n${failures} test(s) en échec.` : '\nTous les tests des niveaux passent.');
process.exit(failures ? 1 : 0);
