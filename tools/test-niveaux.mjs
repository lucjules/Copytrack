// Tests de la refonte du level design (0.9.6 → 0.9.9 : les 66 circuits d'origine ; 0.9.15 : un 12e chapitre bonus de 6 circuits « Mécanismes ») : node tools/test-niveaux.mjs   (npm test)
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
import { test, finish } from './harness.mjs';

const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { CAREER_ORDER: THEME_ORDER } = await import('../js/themes.js');
const { PROFILS, CHAPTERS, CHAPTER_SIZE, GOALS } = await import('../js/career.js');
const { VERSION } = await import('../js/version.js');
const { OBST } = await import('../js/obstacles.js');
const { RaceLogic } = await import('../js/raceLogic.js');
const { checkDef, openingOf, vocabulary } = await import('./contract.mjs');
const { runTrack } = await import('./lab.mjs');
const { proposeFromHumans } = await import('./medals.mjs');
const { measure, load: loadGolden } = await import('./golden.mjs');
const { chapterState, careerSummary } = await import('./../js/career.js');
const { Track } = await import('../js/track.js');
const { checkTrack } = await import('../js/editorTools.js');
const { CarPhysics } = await import('../js/physics.js');
const { placeAtStart } = await import('../js/raceLogic.js');
const { Autopilot } = await import('../js/autopilot.js');

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
// Le code de l'application est réparti entre js/main.js et js/app/*.js (familles de méthodes) : ces contrôles de texte lisent l'ensemble.
const readApp = () => ['js/main.js', ...readdirSync(new URL('../js/app', import.meta.url)).map((f) => 'js/app/' + f)].map(read).join('\n');
const by = Object.fromEntries(BUILTIN_TRACKS.map((d) => [d.id, d]));
const chapters = [];
for (let c = 0; c * CHAPTER_SIZE < BUILTIN_TRACKS.length; c++) chapters.push(BUILTIN_TRACKS.slice(c * CHAPTER_SIZE, (c + 1) * CHAPTER_SIZE));

// L'ordre de la carrière : 11 chapitres de 6, plus le chapitre bonus de l'Atelier. Ajouter ou déplacer un circuit, c'est changer ce tableau, donc le décider.
const CAREER = [
  ['eclats', 'canyon', 'tremplins', 'spirale', 'verglas', 'grandtour'],
  ['lianes', 'canopee', 'spores', 'serpent', 'racines', 'temple'],
  ['lagon', 'recif', 'phare', 'vrille', 'lunaire', 'archipel'],
  ['neons', 'boulevard', 'hyper', 'metro', 'tours', 'viaduc'],
  ['aurore', 'banquise', 'glacier', 'helice', 'couronne', 'blizzard'],
  ['braises', 'coulee', 'basalte', 'cheminee', 'caldeira', 'eruption'],
  ['quai', 'navette', 'ceinture', 'grandanneau', 'apesanteur', 'zenith'],
  ['courant', 'corail', 'epave', 'meduses', 'abysses', 'barriere'],
  ['chaine', 'laminoir', 'engrenages', 'fonderie', 'presse', 'usinefolle'],
  ['envol', 'suspendues', 'rafales', 'montgolfieres', 'pontvents', 'cite'],
  ['galerie', 'plafond', 'cristalfele', 'miroir', 'vrilles', 'coeur'],
  ['garde', 'cadence', 'pendule', 'rotors', 'montecharge', 'grandatelier'],       // chapitre bonus : les mécanismes, un à un
];

// Les trois premiers jetons après « start » : l'ouverture de chaque circuit, écrite ici pour que personne ne la change sans le vouloir.
const OPENINGS = {
  // chapitre 1 : booster → wall-ride · booster → virage relevé · chute libre · booster → looping · épingle descendante · montée verticale
  eclats: 'B2 [tr01l] S4<', canyon: 'B BRR B3', tremplins: 'V-5 [dn4] [cdo2]', spirale: 'B3 OB S', verglas: '[cvd1] [cvd1] B', grandtour: 'B3 QU WA3',
  // chapitre 2 : rampe + anneau · tube · rebond géant · bifurcation + moto · plafond · tunnel
  lianes: 'B3 UU GR2', canopee: 'TI TM3.b TO', spores: 'B2 S.j200 G1', serpent: 'Y2.o B S', racines: 'B3^ [tr31s] S<', temple: 'S# R# R#',
  // chapitre 3 : descente en moto · eau · deltaplane · triple looping · basse gravité · pente douce
  lagon: '[cdi1] [dn2] [dn2]', recif: 'S.n S2.a R.a', phare: 'B3 S.e UU', vrille: 'B4 OBT S2', lunaire: 'S.g50 G2 V-6', archipel: 'GD6 BRR S',
  // chapitre 4 : tapis roulant · deux loopings · sans bordures · montée en lacets · looping + rampe de toit · lift hill
  neons: 'S3.t201 S BRR', hyper: 'B3 O OL', boulevard: 'B2_ S3_ B_', metro: 'B CVR2 CVR2', tours: 'B3 O S2', viaduc: 'B3 [crv4] UX.b',
  // chapitre 5 : glace · rebonds · toboggan · tire-bouchon · virage relevé sans booster · poudreuse
  aurore: 'I2 B3 I2', banquise: 'I B2 S.j100', glacier: '[cdi2] DX [cdo2]', helice: 'S2 CK S', couronne: 'BRR B3 S', blizzard: 'S2.p B S2',
  // chapitre 6 : collines · S relevé · dérive · tube + cheminée · montée douce · rampe sans virage d'entrée
  braises: 'B2 GU3 GD3', coulee: 'B BR S', basalte: 'S2.d B S2', cheminee: 'B3 TI TM2', caldeira: 'B2 GU4 S', eruption: 'B3 UX G2',
  // chapitre 7 : tube + basse gravité · moto · tire-bouchon · tube court · apesanteur · plateforme
  quai: 'B TI TM', navette: 'S.o B R', ceinture: 'S CKL S', grandanneau: 'B2 TB S2', apesanteur: 'B2 S.g20 [crv1]', zenith: 'P2 B S',
  // chapitre 8 : contre-courant · courant · wall-ride · gravité lourde · plongeon · pont de verre
  courant: 'B2 S2.t40 S2.t170', corail: 'B S2.t137 S2', epave: 'B3 [tr02s] S3>', meduses: 'B5 S.g130 S2', abysses: 'B [cdi2] DX', barriere: 'B2 S3.v BRR',
  // chapitre 9 : moteur coupé · bifurcation · hélice · tunnel · pistons · ralentisseurs
  chaine: 'B3 S3.c B', laminoir: 'Y2.b B S', engrenages: 'B2 CBR2 CBR2', fonderie: 'B3 S4# BRR', presse: 'B2 S4.j150 S3', usinefolle: 'B2 S2.x R',
  // chapitre 10 : vent · rampe sans bordures · vent fort · gravité réduite · pont sans bordures · deltaplane
  envol: 'B3 S3.w150 S', suspendues: 'B3_ [crv1]_ UU_', rafales: 'B2 S2.w180 S', montgolfieres: 'B3 S.g40 OB', pontvents: 'B2_ S2.w150_ BRR_', cite: 'S.e G2 V-6',
  // chapitre 11 : volant inversé · vrille · inversion de gravité · S en miroir · double looping · verre
  galerie: 'B2 S3.y S2', plafond: 'B TW.f S2^', cristalfele: 'B2 S.f V8', miroir: 'B3 BLL S', vrilles: 'B [cdi1] [dn2]', coeur: 'B S2.v500 S',
  // chapitre 12 (Atelier, bonus) : bumpers et piques · piques escamotables · balancier · marteau + balayeur · ascenseur + glissière · tout ensemble
  garde: 'B4 [cds1] S', cadence: 'B3 S3 [crs1]', pendule: 'B2 [crs1] S2', rotors: 'S3 B3 [cds1]', montecharge: 'B5 S [crs1]', grandatelier: 'B2 S2 [cds1]',
};

console.log('Version et profils');
test('version 0.9.9 ou plus (bêta 0.9.x suit package.json)', () => {
  const v = JSON.parse(read('package.json')).version;
  assert.equal(VERSION, 'bêta ' + v);
  assert.ok(+v.split('.')[2] >= 9, v);
});
test('les 72 circuits (66 + 6 de l’Atelier) ont chacun un profil connu', () => {
  assert.equal(BUILTIN_TRACKS.length, 72);
  assert.deepEqual(BUILTIN_TRACKS.filter((d) => !d.profil).map((d) => d.id), []);
  for (const d of BUILTIN_TRACKS) assert.ok(PROFILS[d.profil], d.id + ' : profil inconnu ' + d.profil);
});
test('douze chapitres de six circuits, un thème par chapitre, dans l’ordre de THEME_ORDER et des CHAPTERS de la carrière', () => {
  assert.equal(chapters.length, 12);
  chapters.forEach((ch, i) => {
    assert.equal(ch.length, CHAPTER_SIZE, 'chapitre ' + (i + 1));
    assert.ok(ch.every((d) => d.decor === THEME_ORDER[i]), 'thème du chapitre ' + (i + 1));
    assert.equal(CHAPTERS[i].decor, THEME_ORDER[i]);
  });
});
test('chaque chapitre (sauf l’Atelier, bonus) propose les cinq profils', () => {
  chapters.slice(0, 11).forEach((ch, i) => assert.deepEqual([...new Set(ch.map((d) => d.profil))].sort(), Object.keys(PROFILS).filter((k) => k !== 'atelier').sort(), 'chapitre ' + (i + 1) + ' : ' + ch.map((d) => d.profil).join(' ')));
});
test('deux circuits consécutifs d’un chapitre n’ont jamais le même profil (sauf l’Atelier : un seul profil, « mécanisme »)', () => {
  for (const ch of chapters.slice(0, 11)) for (let i = 0; i + 1 < ch.length; i++) assert.notEqual(ch[i].profil, ch[i + 1].profil, `${ch[i].id} puis ${ch[i + 1].id} : ${ch[i].profil} deux fois de suite`);
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
  assert.match(readApp(), /tag profil \$\{pf\.cls\}/);
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
test('les 72 ouvertures sont toutes différentes', () => {
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

console.log('Finitions (0.9.10)');
test('chaque circuit a son texte « ce qu’il enseigne » (infobulle de la carte de carrière)', () => {
  for (const d of BUILTIN_TRACKS) assert.ok(d.appris && d.appris.length > 40 && d.appris.length < 260 && d.appris.startsWith('Départ : '), d.id + ' : ' + d.appris);
  assert.match(readApp(), /card\.title = b\.def\.appris/);
});
test('étoiles de difficulté : le premier circuit d’un chapitre a au plus 3 étoiles, l’avant-dernier au moins 3, le dernier au moins 4, et un sprint n’a jamais plus de 2', () => {
  for (const ch of chapters.slice(0, 11)) { assert.ok(ch[0].difficulty <= 3, ch[0].id); assert.ok(ch[4].difficulty >= 3 && ch[5].difficulty >= 4, ch[5].id); }
  assert.ok(chapters[11].every((d) => d.difficulty <= 3), 'l’Atelier est un chapitre d’apprentissage : trois étoiles au plus');
  for (const d of BUILTIN_TRACKS.filter((x) => x.profil === 'sprint')) assert.ok(d.difficulty <= 2, d.id);
});
test('temps de référence : le pilote met le même temps qu’à la dernière validation (tools/golden-temps.json ; node tools/golden.mjs --update après un changement voulu)', () => {
  const ref = loadGolden(), now = measure();
  assert.deepEqual(Object.keys(ref).sort(), Object.keys(now).sort());
  const diff = Object.keys(now).filter((k) => Math.abs(now[k] - ref[k]) > 0.02).map((k) => `${k} ${ref[k]} → ${now[k]}`);
  assert.deepEqual(diff, [], 'circuits dont le temps a changé : leurs médailles sont à revoir (node tools/medals.mjs --check)');
});
test('état d’un chapitre et bilan de carrière (écran de carrière)', () => {
  assert.equal(chapterState([null, 'or', 'or', 'or', 'or', 'or'], 6).id, 'open');
  assert.equal(chapterState(['bronze', 'or', 'or', 'or', 'or', 'or'], 5).id, 'done');
  assert.equal(chapterState(['bronze', 'or', 'or', 'or', 'or', 'or'], 6).id, 'perfect');
  assert.equal(chapterState(Array(6).fill('cristal'), 6).id, 'crystal');
  const none = careerSummary(Array(66).fill(null), 0);
  assert.deepEqual([none.pct, none.finished, none.complete], [0, false, false]);
  const all = careerSummary(Array(66).fill('cristal'), 66);
  assert.deepEqual([all.pct, all.finished, all.complete], [100, true, true]);
  const mid = careerSummary([...Array(33).fill('or'), ...Array(33).fill(null)], 10);
  assert.ok(mid.pct > 0 && mid.pct < 100 && !mid.finished);
  const m = readApp();
  assert.match(m, /careerSummary\(ids, gd\)/); assert.match(m, /chapterState\(/); assert.match(m, /class="ch-badge/);
  assert.match(read('css/style.css'), /\.career-summary/);
});
test('fiche d’essai et calage humain : 72 sections, gabarit de temps vide, médailles proposées à partir du meilleur temps', () => {
  const f = read('docs/FICHE-ESSAI.md'), tpl = JSON.parse(read('docs/temps-humains.json'));
  assert.equal((f.match(/^### \d+\. /gm) || []).length, 72);
  assert.equal((f.match(/^## Chapitre /gm) || []).length, 12);
  assert.deepEqual(Object.keys(tpl), BUILTIN_TRACKS.map((d) => d.id));
  assert.deepEqual(proposeFromHumans([16.2, 15.4, 17.9]), { cristal: 15.4, or: 16.2, argent: 18.5, bronze: 21.6 });
  for (const d of BUILTIN_TRACKS) assert.ok(f.includes('### ' + (BUILTIN_TRACKS.indexOf(d) + 1) + '. ' + d.name), d.id);
});
test('éditeur et partage : chaque circuit décodé garde ses tours, son véhicule et sa gravité de départ, ses obstacles, et reste sans alerte', () => {
  for (const d of BUILTIN_TRACKS) {
    const tr = buildBuiltin(d), back = Track.decode(tr.encode());
    assert.equal(back.laps, tr.laps, d.id + ' tours'); assert.equal(back.veh0, tr.veh0, d.id + ' véhicule'); assert.equal(back.g0, tr.g0, d.id + ' gravité');
    assert.equal(back.decos.length, tr.decos.length, d.id + ' obstacles');
    assert.deepEqual(back.validate(), [], d.id);
    assert.deepEqual(checkTrack(back).filter((i) => i.level === 'error'), [], d.id);
  }
});
test('partage fidèle : les commandes du pilote rejouées sur le circuit décodé donnent la même arrivée, au même instant (plafond, deltaplane, tapis, tours, rebonds, verre…)', () => {
  const play = (tr, inputs) => {
    const phys = new CarPhysics(tr), logic = new RaceLogic(tr); placeAtStart(phys, logic);
    const bot = inputs ? null : new Autopilot(tr.path, { ...(tr.path.pilot || {}) }); if (bot) bot.reset(phys);
    const rec = [];
    for (let i = 0; i < 120 * 120; i++) {
      const inp = inputs ? inputs[i] : { ...bot.control(phys) }; if (!inp) break; rec.push(inp);
      phys.clock = logic.steps; phys.step(inp);
      const ev = logic.update(phys); if (ev && ev.type === 'finish') return { t: logic.steps, x: phys.pos.x, y: phys.pos.y, z: phys.pos.z, rec, ok: true };
      if (!inputs && (phys.offTrack || phys.ev.sink)) { const r = logic.respawn; phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1); bot.reset(phys); }
    }
    return { ok: false, rec };
  };
  for (const id of ['plafond', 'cite', 'neons', 'racines', 'lagon', 'banquise', 'cristalfele', 'presse', 'apesanteur', 'recif', 'zenith']) {
    const d = by[id], tr = buildBuiltin(d), a = play(tr);
    if (!a.ok) continue;                                    // un circuit où le pilote doit réapparaître n'a pas d'enregistrement simple
    const back = Track.decode(tr.encode()); back.path = tr.path;
    const b = play(back, a.rec);
    assert.ok(b.ok, id + ' : le circuit décodé ne se termine plus'); assert.equal(b.t, a.t, id + ' : instant d’arrivée');
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6, id + ' : position d’arrivée');
  }
});

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
test('circuit de sauts (Tremplins) : finissable de 56 à 80 m/s (202 à 288 km/h) à l’abord des rampes, sans checkpoint survolable (sans « collage », une rampe prise trop lentement ne se franchit plus)', () => {
  for (const c of [56, 60, 66, 72, 80]) { const S = runTrack(buildBuiltin(by.tremplins), { vCap: c }); assert.ok(S.ok && S.respawns === 0, `vCap ${c} : ${S.ok ? S.respawns + ' réapparitions' : S.reason}`); }
});
test('les anciennes listes d’obstacles figés ont disparu (js/builtinObstacles.js) : un circuit n’a que les obstacles de son champ obst', () => {
  assert.ok(!existsSync(new URL('../js/builtinObstacles.js', import.meta.url)));
  const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (f !== 'vendor') walk(p, out); } else if (p.endsWith('.js')) out.push(p); } return out; };
  for (const f of walk(new URL('../js', import.meta.url).pathname)) assert.ok(!/builtinObstacles/.test(readFileSync(f, 'utf8')), f);
});

await finish('Tous les tests des niveaux passent.');
