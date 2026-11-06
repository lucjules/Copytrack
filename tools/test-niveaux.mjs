// Tests de la refonte du level design (0.9.6 → 0.9.9 : les 66 circuits intégrés) : node tools/test-niveaux.mjs   (npm test)
//
// Chaque circuit porte un champ `profil` (sprint, speedway, technique, rollercoaster, acrobatique). Le CONTRAT de ces profils, et de tout circuit
// « bien fait », est écrit une seule fois, dans tools/contract.mjs (checkDef) : chaque profil est défini par des mesures (virages serrés, vitesse,
// freinages, hauteur, temps en l'air) prises sur la course du pilote automatique ; chaque circuit doit les respecter, rester finissable à ±10 % de
// vitesse sans choc, pouvoir repartir À L'ARRÊT de chaque checkpoint, avoir ses médailles à jour et un objectif bonus réalisable.
// Ce fichier applique ce contrat à CHAQUE circuit, puis vérifie ce qui se joue entre les circuits : les profils de chaque chapitre, les ouvertures
// (jamais deux fois la même), l'ordre de la carrière.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
function test(name, fn) { try { const r = fn(); if (r && typeof r.then === 'function') throw new Error('test asynchrone : ses assertions ne seraient jamais vérifiées'); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e.message).split('\n').slice(0, 8).join('\n       ')); } }

const { BUILTIN_TRACKS, THEME_ORDER, buildBuiltin } = await import('../js/tracks.js');
const { PROFILS, CHAPTERS, CHAPTER_SIZE, GOALS } = await import('../js/career.js');
const { VERSION } = await import('../js/constants.js');
const { OBST } = await import('../js/obstacles.js');
const { RaceLogic } = await import('../js/raceLogic.js');
const { checkDef, openingOf, vocabulary } = await import('./contract.mjs');
const { runTrack } = await import('./lab.mjs');

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const by = Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, d]));
const chapters = [];
for (let c = 0; c * CHAPTER_SIZE < BUILTIN_TRACKS.length; c++) chapters.push(BUILTIN_TRACKS.slice(c * CHAPTER_SIZE, (c + 1) * CHAPTER_SIZE));

// L'ordre de la carrière : 11 chapitres de 6. Ajouter ou déplacer un circuit, c'est changer ce tableau, donc le décider.
const CAREER = [
  ['eclats', 'canyon', 'tremplins', 'spirale', 'verglas', 'grandtour'],
  ['lianes', 'canopee', 'spores', 'serpent', 'racines', 'temple'],
  ['lagon', 'recif', 'phare', 'vrille', 'lunaire', 'archipel'],
  ['neons', 'hyper', 'boulevard', 'metro', 'tours', 'viaduc'],
  ['aurore', 'banquise', 'glacier', 'helice', 'couronne', 'blizzard'],
  ['braises', 'coulee', 'basalte', 'cheminee', 'caldeira', 'eruption'],
  ['quai', 'navette', 'ceinture', 'grandanneau', 'apesanteur', 'zenith'],
  ['courant', 'corail', 'epave', 'meduses', 'abysses', 'barriere'],
  ['chaine', 'laminoir', 'engrenages', 'fonderie', 'presse', 'usinefolle'],
  ['envol', 'suspendues', 'rafales', 'montgolfieres', 'pontvents', 'cite'],
  ['galerie', 'plafond', 'cristalfele', 'miroir', 'vrilles', 'coeur'],
];

// Les trois premiers jetons après « start » : l'ouverture de chaque circuit, écrite ici pour que personne ne la change sans le vouloir.
const OPENINGS = {
  // chapitre 1 : booster → wall-ride · booster → virage relevé · chute libre · booster → looping · épingle descendante · montée verticale
  eclats: 'B2 [tr01l] S4<', canyon: 'B BRR B3', tremplins: 'G1 V-5 [dn4]', spirale: 'B3 OB S', verglas: '[cvd1] [cvd1] B', grandtour: 'B3 QU WA3',
  // chapitre 2 : rampe + anneau · tube · rebond géant · bifurcation + moto · plafond · tunnel
  lianes: 'B3 UU GR2', canopee: 'TI TM3.b TO', spores: 'B2 S.j200 G2', serpent: 'Y2.o B S', racines: 'B3^ [tr31s] S<', temple: 'S# R# R#',
  // chapitre 3 : descente en moto · eau · deltaplane · triple looping · basse gravité · pente douce
  lagon: '[cdi1] [dn2] [dn2]', recif: 'S.n S2.a R.a', phare: 'B3 S.e UU', vrille: 'B4 OBT S2', lunaire: 'S.g50 G2 V-6', archipel: 'GD6 BRR S',
  // chapitre 4 : tapis roulant · deux loopings · sans bordures · montée en lacets · rampe de toit · lift hill
  neons: 'S3.t201 S BRR', hyper: 'B3 O OL', boulevard: 'B2_ S3_ B_', metro: 'B CVR2 CVR2', tours: 'B2 [crv2] UX', viaduc: 'B3 [crv4] UX',
  // chapitre 5 : glace · rebonds · toboggan · tire-bouchon · virage relevé sans booster · poudreuse
  aurore: 'I2 B3 I2', banquise: 'I B2 S.j100', glacier: '[cdi2] DX [cdo2]', helice: 'S2 CK S', couronne: 'BRR B3 S', blizzard: 'S2.p B S2',
  // chapitre 6 : collines · S relevé · dérive · tube + cheminée · montée douce · rampe sans virage d'entrée
  braises: 'B2 GU3 GD3', coulee: 'B BR S', basalte: 'S2.d B S2', cheminee: 'B3 TI TM2', caldeira: 'B2 GU4 S', eruption: 'B3 UX G3',
  // chapitre 7 : tube + basse gravité · moto · tire-bouchon · tube court · apesanteur · plateforme
  quai: 'B TI TM', navette: 'S.o B R', ceinture: 'S CKL S', grandanneau: 'B2 TB S2', apesanteur: 'B2 S.g20 [crv1]', zenith: 'P2 B S',
  // chapitre 8 : contre-courant · courant · wall-ride · gravité lourde · plongeon · pont de verre
  courant: 'B2 S2.t40 S2.t170', corail: 'B S2.t137 S2', epave: 'B3 [tr02s] S3>', meduses: 'B3 S.g200 [crv2]', abysses: 'B [cdi2] DX', barriere: 'B2 S3.v BRR',
  // chapitre 9 : moteur coupé · bifurcation · hélice · tunnel · pistons · ralentisseurs
  chaine: 'B3 S3.c B', laminoir: 'Y2.b B S', engrenages: 'B2 CBR2 CBR2', fonderie: 'B3 S4# BRR', presse: 'B2 S4.j150 S3', usinefolle: 'B2 S2.x R',
  // chapitre 10 : vent · rampe sans bordures · vent fort · gravité réduite · pont sans bordures · deltaplane
  envol: 'B3 S3.w150 S', suspendues: 'B3_ [crv1]_ UU_', rafales: 'B2 S2.w180 S', montgolfieres: 'B3 S.g40 OB', pontvents: 'B2_ S2.w150_ BRR_', cite: 'S.e G2 V-6',
  // chapitre 11 : volant inversé · vrille · inversion de gravité · S en miroir · double looping · verre
  galerie: 'B2 S3.y S2', plafond: 'B TW.f S2^', cristalfele: 'B2 S.f V8', miroir: 'B3 BLL S', vrilles: 'B3 ODL S2', coeur: 'B S2.v500 S',
};

console.log('Version et profils');
test('version 0.9.9 ou plus (bêta 0.9.x suit package.json)', () => {
  const v = JSON.parse(read('package.json')).version;
  assert.equal(VERSION, 'bêta ' + v);
  assert.ok(+v.split('.')[2] >= 9, v);
});
test('les 66 circuits sont refaits : chacun a un profil connu', () => {
  assert.equal(BUILTIN_TRACKS.length, 66);
  assert.deepEqual(BUILTIN_TRACKS.filter((d) => !d.profil).map((d) => d.id), []);
  for (const d of BUILTIN_TRACKS) assert.ok(PROFILS[d.profil], d.id + ' : profil inconnu ' + d.profil);
});
test('onze chapitres de six circuits, un thème par chapitre, dans l’ordre de THEME_ORDER et des CHAPTERS de la carrière', () => {
  assert.equal(chapters.length, 11);
  chapters.forEach((ch, i) => {
    assert.equal(ch.length, CHAPTER_SIZE, 'chapitre ' + (i + 1));
    assert.ok(ch.every((d) => d.decor === THEME_ORDER[i]), 'thème du chapitre ' + (i + 1));
    assert.equal(CHAPTERS[i].decor, THEME_ORDER[i]);
  });
});
test('chaque chapitre propose les cinq profils', () => {
  chapters.forEach((ch, i) => assert.deepEqual([...new Set(ch.map((d) => d.profil))].sort(), Object.keys(PROFILS).sort(), 'chapitre ' + (i + 1) + ' : ' + ch.map((d) => d.profil).join(' ')));
});
test('deux circuits consécutifs d’un chapitre n’ont jamais le même profil', () => {
  for (const ch of chapters) for (let i = 0; i + 1 < ch.length; i++) assert.notEqual(ch[i].profil, ch[i + 1].profil, `${ch[i].id} puis ${ch[i + 1].id} : ${ch[i].profil} deux fois de suite`);
});
test('l’ordre de la carrière est celui du tableau CAREER (chapitre par chapitre)', () => {
  assert.deepEqual(chapters.map((ch) => ch.map((d) => d.id)), CAREER);
});
test('dans un chapitre, la difficulté ne diminue jamais ; elle va de 1 à 5', () => {
  for (const ch of chapters) for (let i = 0; i + 1 < ch.length; i++) assert.ok(ch[i].difficulty <= ch[i + 1].difficulty, `${ch[i].id} (${ch[i].difficulty}) avant ${ch[i + 1].id} (${ch[i + 1].difficulty})`);
  for (const d of BUILTIN_TRACKS) assert.ok(d.difficulty >= 1 && d.difficulty <= 5, d.id);
});
test('chaque profil a un libellé et une infobulle', () => {
  for (const [k, p] of Object.entries(PROFILS)) assert.ok(p.label && p.tip, k);
});
test('la carte de carrière affiche la pastille du profil', () => {
  assert.match(read('js/main.js'), /tag profil \$\{pf\.cls\}/);
  for (const p of Object.values(PROFILS)) assert.match(read('css/style.css'), new RegExp('\\.card \\.tag\\.' + p.cls));
});
test('chaque chapitre a une description propre', () => {
  assert.equal(new Set(CHAPTERS.map((c) => c.desc)).size, CHAPTERS.length);
  for (const c of CHAPTERS) assert.ok(c.desc.length > 30 && c.desc.length < 140, c.name + ' : ' + c.desc.length + ' caractères');
});

console.log('Départs');
test('aucun départ « classique » (booster, deux droites, virage) : le contrat le vérifie, ici sur la liste écrite', () => {
  for (const d of BUILTIN_TRACKS) assert.ok(!/^(B S2? R|S2 B|S B|B S2 B|B S2 R)/.test(d.script.replace(/^start /, '')), d.id + ' : ' + openingOf(d));
});
test('les 66 ouvertures sont toutes différentes', () => {
  const o = BUILTIN_TRACKS.map(openingOf);
  const dup = o.filter((x, i) => o.indexOf(x) !== i);
  assert.deepEqual(dup, [], 'ouvertures en double');
});
test('chaque ouverture est celle qui est écrite dans ce fichier (on ne change pas un départ par accident)', () => {
  assert.deepEqual(Object.keys(OPENINGS).sort(), BUILTIN_TRACKS.map((d) => d.id).sort());
  for (const d of BUILTIN_TRACKS) assert.equal(openingOf(d), OPENINGS[d.id], d.id);
});
test('aucun circuit n’a de vitesse de départ (v0) : on doit pouvoir repartir du départ À L’ARRÊT (réapparition avant le premier checkpoint)', () => {
  for (const d of BUILTIN_TRACKS) assert.ok(!(d.params && d.params.v0), d.id + ' : départ lancé');
});
test('départ au plafond (Racines) en gravité inversée, départ en moto (Lagon), départ en bateau (Récif), départ en deltaplane (Cité), plateforme (Station Zénith)', () => {
  assert.equal(new RaceLogic(buildBuiltin(by.racines)).spawnPoint().gs, -1);
  assert.equal(new RaceLogic(buildBuiltin(by.lagon)).respawn.vehicle, 'moto');
  assert.equal(by.lagon.params.veh0, 'moto');
  assert.match(by.recif.script, /^start S\.n S2\.a /);
  assert.match(by.cite.script, /^start S\.e /);
  assert.ok(buildBuiltin(by.zenith).tiles.some((t) => t.t === 'platform'));
});
test('chute libre (Tremplins) : départ à plus de 8 niveaux de haut, depuis l’arrêt, réception sur une descente', () => {
  assert.ok(by.tremplins.opts.l >= 10, JSON.stringify(by.tremplins.opts));
  assert.ok(runTrack(buildBuiltin(by.tremplins)).airMax > 1, 'la chute doit durer');
});
test('départ sur un tapis roulant (Néons Express) : la voiture est lancée par le tapis, sans booster dans les premières cases', () => {
  assert.match(by.neons.script, /^start S3\.t201 /);
  const S = runTrack(buildBuiltin(by.neons));
  assert.ok(S.ok);
  assert.ok(S.samples.some((s) => s[0] < 5 && s[1] * 3.6 > 250), 'plus de 250 km/h avant 5 s');
});

console.log('Nouvelles pièces dès le début');
test('chaque circuit emploie au moins quatre pièces de la 0.9.3 (wall-rides, courbes progressives, inclinaisons, très grands virages)', () => {
  for (const d of BUILTIN_TRACKS) { const v = vocabulary(buildBuiltin(d)); assert.ok(v.size >= 4, d.id + ' : ' + [...v].join(' ')); }
});
test('wall-ride dès le premier circuit, et dans les six circuits du chapitre 1', () => {
  for (const d of chapters[0]) assert.ok(buildBuiltin(d).tiles.some((t) => t.o), d.id + ' sans wall-ride');
});

console.log('Contrat de chaque circuit (tools/contract.mjs)');
// Le contrat complet : construction, profil mesuré, pilote sans réapparition ni choc, wall-rides ≥ 130 km/h, vérificateur de l'éditeur, ±10 % de vitesse,
// +25 % hors acrobatique, repartir À L'ARRÊT de chaque checkpoint, médailles à ±2 %, objectif bonus réalisable, partage SHW.
for (const d of BUILTIN_TRACKS) {
  test(`${d.id} (${d.profil}) respecte le contrat`, () => { const { fails } = checkDef(d); assert.deepEqual(fails, []); });
}

console.log('Cohérence de la carrière');
test('médailles strictement croissantes (cristal < or < argent < bronze)', () => {
  for (const d of BUILTIN_TRACKS) { const m = d.medals; assert.ok(m.cristal < m.or && m.or < m.argent && m.argent < m.bronze, d.id + ' ' + JSON.stringify(m)); }
});
test('objectifs bonus : un type connu, avec son paramètre', () => {
  for (const d of BUILTIN_TRACKS) {
    assert.ok(GOALS[d.goal.id], d.id + ' : objectif ' + d.goal.id);
    if (['perfect', 'turbo', 'rings'].includes(d.goal.id)) assert.ok(d.goal.n >= 1, d.id);
    if (d.goal.id === 'under') assert.ok(d.goal.t > 0, d.id);
    if (d.goal.id === 'vehicle') assert.ok(['moto', 'boat', 'glider', 'car'].includes(d.goal.v), d.id);
  }
});
test('obstacles : types connus, placés sur le parcours, et le pilote n’en touche aucun (le contrat compte les chocs et les piques)', () => {
  for (const d of BUILTIN_TRACKS) for (const o of d.obst || []) {
    assert.ok(OBST[o.k], d.id + ' : obstacle ' + o.k);
    assert.ok(o.at >= 0 && o.at < 1, d.id + ' : at ' + o.at);
  }
  assert.ok(BUILTIN_TRACKS.filter((d) => d.obst).length >= 5, 'l’usine garde ses obstacles');
});
test('les circuits à plusieurs tours se referment (l’arrivée jouxte le départ) et le pilote les finit', () => {
  const laps = BUILTIN_TRACKS.filter((d) => d.laps > 1);
  assert.deepEqual(laps.map((d) => d.id).sort(), ['caldeira', 'grandanneau']);
  for (const d of laps) { const S = runTrack(buildBuiltin(d)); assert.ok(S.ok && S.respawns === 0, d.id + ' : ' + S.reason); }
});
test('circuit de sauts (Tremplins) : finissable de 48 à 72 m/s (172 à 260 km/h) à l’abord des rampes, sans checkpoint survolable', () => {
  for (const c of [48, 54, 60, 66, 72]) { const S = runTrack(buildBuiltin(by.tremplins), { vCap: c }); assert.ok(S.ok && S.respawns === 0, `vCap ${c} : ${S.ok ? S.respawns + ' réapparitions' : S.reason}`); }
});
test('les anciennes listes d’obstacles figés ont disparu (js/builtinObstacles.js) : un circuit n’a que les obstacles de son champ obst', () => {
  assert.ok(!existsSync(new URL('../js/builtinObstacles.js', import.meta.url)));
  const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (f !== 'vendor') walk(p, out); } else if (p.endsWith('.js')) out.push(p); } return out; };
  for (const f of walk(new URL('../js', import.meta.url).pathname)) assert.ok(!/builtinObstacles/.test(readFileSync(f, 'utf8')), f);
});

console.log(failures ? `\n${failures} test(s) en échec.` : '\nTous les tests des niveaux passent.');
process.exit(failures ? 1 : 0);
