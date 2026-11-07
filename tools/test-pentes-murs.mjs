// Pentes descendantes, raccords de pente, orientation (sol, murs, plafond), transitions, pièces générées : node tools/test-pentes-murs.mjs   (npm test)
//  pentes descendantes et raccords doux, orientation (sol / mur gauche / mur droit / plafond) comme option des lignes et des virages,
//  transitions d'orientation, conversion des anciennes pièces 90°, audit du graphe des pièces, conduite (pentes, murs, plafond), aléatoire.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

const { Track, scriptTrack, b64encode } = await import('../js/track.js');
const P = await import('../js/pieces.js');
const { PIECES, PIECE_ORDER, GEN_IDS, flagAllowed, surfaceAllowed, sampleLocal, profH, profD, isSideTile, isOriented, hasNoRails, tileOri, ORIENTS, ROLL_PASSAGES } = P;
const { FAMILIES, FAMILY_ORDER, familyOf, resolve, withTrait, validValues } = await import('../js/families.js');
const { CarPhysics } = await import('../js/physics.js');
const { CAR } = await import('../js/physics/specs.js');
const { RaceLogic, placeAtStart } = await import('../js/raceLogic.js');
const { Autopilot } = await import('../js/autopilot.js');
const { InputRecorder, quantSteer } = await import('../js/replay.js');
const { PHYS_VER } = await import('../js/version.js');
const { replayTime } = await import('../js/verify.js');
const { DT, HALF } = await import('../js/constants.js');
const { GeoBuilder, FxBuilder } = await import('../js/geo.js');
const { buildTileInto, stripsFor } = await import('../js/trackGeometry.js');
const { ribbonOf, frameLocal } = await import('../js/ribbons.js');
const { EditorSession } = await import('../js/editor.js');
const { auditPieces } = await import('./audit-pieces.mjs');
const { orientationIssues, endRolls, rollName } = await import('../js/joins.js');
const { MIRROR_TYPES } = await import('../js/inspector.js');

const tile = (o) => Track.normalize({ x: 0, z: 0, l: 4, r: 0, ...o });

// ---- Conduite : circuit décrit par un script, voiture (autopilote ou vitesse initiale) -------------------------------------------------
function drive(script, { secs = 40, v0 = 0, auto = true, throttle = true, l = 4 } = {}) {
  const tr = scriptTrack('t', script, { l });
  const ph = new CarPhysics(tr), lg = new RaceLogic(tr); placeAtStart(ph, lg);
  const bot = auto ? new Autopilot(tr.path) : null; if (bot) bot.reset(ph);
  if (v0) { ph.vel.z = -v0; ph.fwdSpeed = v0; ph.graceT = 0; }
  const r = { finished: null, falls: 0, airMax: 0, air: 0, ribTime: 0, gMin: 1, ceilTime: 0, lost: false, nan: false, vmax: 0, ph, tr };
  for (let i = 0; i < secs / DT; i++) {
    const inp = bot ? bot.control(ph) : { steer: 0, throttle, brake: false };
    ph.clock = i; ph.step(inp);
    if (!Number.isFinite(ph.pos.x + ph.pos.y + ph.pos.z)) { r.nan = true; break; }
    r.vmax = Math.max(r.vmax, ph.speed);
    if (ph.ev.loopFall) r.falls++;
    if (!ph.grounded) { r.air += DT; r.airMax = Math.max(r.airMax, r.air); } else r.air = 0;
    if (ph.rib) r.ribTime += DT;
    r.gMin = Math.min(r.gMin, ph.gSign);
    if (ph.gSign < 0 && ph.grounded) r.ceilTime += DT;
    if (ph.lost || ph.dead) { r.lost = true; break; }
    const e = lg.update(ph);
    if (e && e.type === 'finish') { r.finished = lg.time; break; }
  }
  return r;
}

console.log('Pièces générées (0.9.3)');
const FROZEN_GEN = [
  'dn05', 'dn1', 'dn2', 'dn4', 'cro05', 'cro1', 'cro2', 'cro4', 'cdi05', 'cdi1', 'cdi2', 'cdi4', 'cdo05', 'cdo1', 'cdo2', 'cdo4', 'crs05', 'crs1', 'cds05', 'cds1',
  'cvd05', 'cvd1', 'cvd2', 'cvd4', 'cvdBig05', 'cvdBig1', 'cvdBig2', 'cvdBig4', 'cvdL05', 'cvdL1', 'cvdL2', 'cvdL4', 'cvdBigL05', 'cvdBigL1', 'cvdBigL2', 'cvdBigL4',
  'tr01s', 'tr10s', 'tr02s', 'tr20s', 'tr13s', 'tr31s', 'tr23s', 'tr32s', 'tr01l', 'tr10l', 'tr02l', 'tr20l', 'tr13l', 'tr31l', 'tr23l', 'tr32l',
];
test('l’ordre des 52 nouvelles pièces est figé (c’est l’index des circuits sauvegardés) et suit les 67 anciennes', () => {
  assert.deepEqual(GEN_IDS, FROZEN_GEN);
  assert.equal(PIECE_ORDER.length, 67 + 52);
  assert.deepEqual(PIECE_ORDER.slice(67), FROZEN_GEN);
  assert.equal(PIECE_ORDER[66], 'sideR'); assert.equal(PIECE_ORDER[59], 'crv05');
  assert.equal(new Set(PIECE_ORDER).size, PIECE_ORDER.length);
});
test('libellés uniques ; chaque pièce a un type connu de la physique, du maillage et des familles', () => {
  const labels = GEN_IDS.map((id) => PIECES[id].label);
  assert.equal(new Set(labels).size, labels.length);
  for (const id of GEN_IDS) assert.ok(['line', 'arc', 'ribbon'].includes(PIECES[id].kind), id);
});
test('pentes descendantes : rise négatif, profils (droit / début doux / fin douce / S) et dérivées cohérentes', () => {
  for (const [id, rise, prof] of [['dn1', -1, 'l'], ['cro1', 1, 'o'], ['cdi1', -1, 'i'], ['cdo2', -2, 'o'], ['crs1', 1, 's'], ['cds05', -0.5, 's'], ['crv2', 2, 'i']]) {
    assert.equal(PIECES[id].rise, rise, id); assert.equal(P.profOf(PIECES[id]), prof, id);
    const p = PIECES[id];
    assert.equal(profH(p, 0), 0); assert.ok(Math.abs(profH(p, 1) - 1) < 1e-12, id + ' : h(1) = 1');
    for (const u of [0.1, 0.5, 0.9]) assert.ok(Math.abs((profH(p, u + 1e-6) - profH(p, u - 1e-6)) / 2e-6 - profD(p, u)) < 1e-6, id + ' : dérivée');
  }
});
test('toutes les pentes se raccordent exactement : fin douce et début doux ont les pentes d’une droite voisine', () => {
  const half = HALF, L = 2 * half, slopeOf = (id, u) => { const t = tile({ t: id }), o = {}; sampleLocal(t, 0, half - 2 * half * u, o); return -o.nz / o.ny; };
  // début doux de rise r : pente de sortie = 2 r H / L ; la droite d'inclinaison 2 r a la même pente
  for (const [soft, line] of [['crv05', 'slope'], ['crv1', 'steep'], ['crv2', 'steep4'], ['cdi05', 'dn1'], ['cdi1', 'dn2'], ['cdi2', 'dn4']]) {
    assert.ok(Math.abs(slopeAt(soft, 1) - slopeAt(line, 0.5)) < 1e-9, `${soft} → ${line}`);
  }
  for (const [soft, line] of [['cro05', 'slope'], ['cro1', 'steep'], ['cro2', 'steep4'], ['cdo05', 'dn1'], ['cdo1', 'dn2'], ['cdo2', 'dn4']]) {
    assert.ok(Math.abs(slopeAt(soft, 0) - slopeAt(line, 0.5)) < 1e-9, `${line} → ${soft}`);
  }
  function slopeAt(id, u) { return slopeOf(id, u); }
  void L;
});
test('une descente est exactement la montée parcourue à l’envers : même hauteur à chaque point', () => {
  for (const [dn, up] of [['dn1', 'slope'], ['dn2', 'steep'], ['cdi1', 'cro1'], ['cdo1', 'crv1'], ['cds1', 'crs1']]) {
    const a = tile({ t: dn, l: 4 }), b = tile({ t: up, l: 4 + PIECES[dn].rise }), o = {}, q = {};   // b commence là où a finit
    for (let i = 0; i <= 20; i++) {
      const z = HALF - 2 * HALF * (i / 20);
      sampleLocal(a, 0, z, o); sampleLocal(b, 0, -z, q);              // b est parcourue en sens inverse : z -> -z
      assert.ok(Math.abs(o.h - q.h) < 1e-9, `${dn} / ${up} : hauteur en ${z}`);
    }
  }
});
test('niveaux occupés : une descente occupe les niveaux SOUS son niveau d’entrée (pas de niveau négatif)', () => {
  assert.deepEqual(Track.range(tile({ t: 'dn2', l: 5 })), [3, 5]);
  assert.equal(Track.inBounds(tile({ t: 'dn2', l: 1 })), false, 'descendrait sous le sol');
  assert.equal(Track.inBounds(tile({ t: 'dn2', l: 2 })), true);
  assert.deepEqual(Track.range(tile({ t: 'cro1', l: 3 })), [3, 4]);
  assert.deepEqual(Track.range(tile({ t: 'straight', l: 3, o: 1 })), [1, 5], 'une route sur un mur réserve 2 niveaux dessous et dessus');
});

console.log('Orientation (sol / mur gauche / mur droit / plafond)');
test('ORIENTS, ROLL_PASSAGES et les transitions : de et vers chaque orientation, franche et douce', () => {
  assert.deepEqual(ORIENTS.map((o) => o.label), ['Sol', 'Mur gauche', 'Mur droit', 'Plafond']);
  assert.deepEqual(ROLL_PASSAGES, ['01', '10', '02', '20', '13', '31', '23', '32']);
  for (const pas of ROLL_PASSAGES) for (const f of ['s', 'l']) {
    const T = PIECES[`tr${pas}${f}`]; assert.deepEqual(T.roll, [+pas[0], +pas[1]]); assert.equal(T.size, f === 'l' ? 2 : 1); assert.equal(T.noRails, true);
    assert.equal(!!T.autoFlip, pas.includes('3'), 'la gravité suit la route entre un mur et le plafond');
  }
});
test('flagAllowed(o) : ligne droite et virage oui (pentes comprises) ; pas les pièces spéciales, ni plateformes, loopings, transitions', () => {
  for (const id of ['straight', 'curve', 'bigcurve', 'hugecurve', 'slope', 'dn1', 'cro2', 'cvd1', 'crv1']) assert.equal(flagAllowed(id, 'o', null, 1), true, id);
  for (const id of ['start', 'finish', 'checkpoint', 'platform', 'loop', 'twist', 'tr01s', 'tube', 'fork', 'ring', 'cpCurve']) assert.equal(flagAllowed(id, 'o', null, 1), false, id);
});
test('normalize : o ∈ {1, 2} sur une ligne ; refusé sur le reste ; le plafond (v) et le mur s’excluent ; sans bordures d’office ; tunnel retiré', () => {
  assert.equal(tile({ t: 'straight', o: 1 }).o, 1); assert.equal(tile({ t: 'straight', o: 2 }).o, 2); assert.equal(tile({ t: 'straight', o: 3 }).o, 0);
  assert.equal(tile({ t: 'loop', o: 1 }).o, 0); assert.equal(tile({ t: 'start', o: 1 }).o, 0);
  const both = tile({ t: 'straight', o: 1, v: 1 }); assert.deepEqual([both.o, both.v], [0, 1], 'le plafond l’emporte');
  const w = tile({ t: 'straight', o: 1, tn: 1, mv: 1, cp: 1, tb: 1 }); assert.deepEqual([w.o, w.tn, w.mv, w.cp, w.tb], [1, 0, 0, 0, 0]);
  assert.equal(hasNoRails(w), true); assert.equal(w.nb, 0, 'l’absence de bordure est déduite, pas stockée');
  assert.equal(isOriented(w), true); assert.equal(isSideTile(w), true); assert.equal(isSideTile(tile({ t: 'straight' })), false);
  assert.equal(tileOri(w), 1); assert.equal(tileOri(tile({ t: 'straight', v: 1 })), 3); assert.equal(tileOri(tile({ t: 'straight' })), 0);
});
test('revêtements sur un mur : « seulement sur du plat » (eau, rebond, bateau) refusés ; les autres fonctionnent', () => {
  assert.equal(surfaceAllowed('straight', 'boost', 1), true);
  assert.equal(surfaceAllowed('straight', 'bounce', 1), false);
  assert.equal(surfaceAllowed('straight', 'water', 1), false);
  assert.equal(surfaceAllowed('straight', 'bounce', 0), true);
  assert.equal(tile({ t: 'straight', o: 1, s: 'bounce' }).s, '');
  assert.equal(tile({ t: 'straight', o: 1, s: 'ice', p: 150 }).s, 'ice');
});
test('Track.toggleFlag(o) : mur gauche / droit / sol, plafond ; place vérifiée (2 niveaux dessous) ; le dernier choix l’emporte', () => {
  const tr = new Track('t');
  const a = tr.add({ t: 'straight', x: 0, z: 0, l: 3, r: 0, tn: 1 });
  assert.equal(tr.toggleFlag(a, 'o', 1), true); assert.deepEqual([a.o, a.tn, a.v], [1, 0, 0], 'le tunnel cède la place au mur');
  assert.equal(tr.toggleFlag(a, 'o', 2), true); assert.equal(a.o, 2);
  assert.equal(tr.toggleFlag(a, 'o', 2), true); assert.equal(a.o, 0, 'même valeur : retour au sol');
  assert.equal(tr.toggleFlag(a, 'o', 1), true); assert.equal(tr.toggleFlag(a, 'v'), true); assert.deepEqual([a.o, a.v], [0, 1], 'le plafond remplace le mur');
  assert.equal(tr.toggleFlag(a, 'o', 1), true); assert.deepEqual([a.o, a.v], [1, 0], 'le mur remplace le plafond');
  assert.equal(tr.toggleFlag(a, 'o', 0), true); assert.deepEqual([a.o, a.v], [0, 0]);
  const low = tr.add({ t: 'straight', x: 5, z: 0, l: 1, r: 0 });
  assert.equal(tr.toggleFlag(low, 'o', 1), false, 'niveau 1 : le mur descendrait sous le sol'); assert.equal(low.o, 0);
  const lp = tr.add({ t: 'loop', x: 9, z: 9, l: 4, r: 0 }); assert.equal(tr.toggleFlag(lp, 'o', 1), false);
  // un obstacle au-dessus ou en dessous empêche la bascule
  const b = tr.add({ t: 'straight', x: 0, z: 4, l: 4, r: 0 }); tr.add({ t: 'straight', x: 0, z: 4, l: 6, r: 0 });
  assert.equal(tr.toggleFlag(b, 'o', 1), false, 'un autre pont occupe les 2 niveaux au-dessus');
});
test('sérialisation : l’orientation voyage dans les extras ; un circuit sans mur garde exactement la même signature', () => {
  const tr = new Track('x');
  tr.add({ t: 'start', x: 0, z: 0, l: 4, r: 0 });
  tr.add({ t: 'straight', x: 0, z: -1, l: 4, r: 0 });
  const plain = tr.signature();
  const w = tr.add({ t: 'straight', x: 0, z: -2, l: 4, r: 0, o: 1 });
  tr.add({ t: 'curve', x: 0, z: -3, l: 4, r: 0, o: 2 });
  tr.add({ t: 'tr10s', x: 1, z: -3, l: 4, r: 1 });
  assert.notEqual(tr.signature(), plain);
  const back = Track.decode(tr.encode());
  assert.equal(back.signature(), tr.signature());
  assert.deepEqual(back.tiles.map((t) => [t.t, t.o]), tr.tiles.map((t) => [t.t, t.o]));
  assert.equal(back.clone().signature(), tr.signature());
  tr.remove(w);
  const only = new Track('y'); only.add({ t: 'start', x: 0, z: 0, l: 4, r: 0 }); only.add({ t: 'straight', x: 0, z: -1, l: 4, r: 0 });
  assert.equal(only.signature(), plain, 'pas d’extra o quand il n’y en a pas : même signature qu’avant');
  assert.equal(JSON.parse(Buffer.from(only.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).e, undefined, 'format inchangé sans nouveauté');
});
test('anciens circuits : rollL / rollR / sideL / sideR sont lus comme transition + ligne droite orientée (même géométrie)', () => {
  const idx = (t) => PIECE_ORDER.indexOf(t);
  // v3 : 8 nombres par pièce (type, x, z, niveau, rotation, revêtement, réglage, drapeaux)
  const data = { v: 3, n: 'Ancien', a: '', d: 'desert', t: [idx('start'), 0, 0, 4, 0, 0, 0, 0, idx('rollL'), 0, -1, 4, 0, 0, 0, 0, idx('sideR'), 0, -2, 4, 0, 0, 0, 0] };
  const tr = Track.decode('SHW3:' + b64encode(JSON.stringify(data)));
  assert.deepEqual(tr.tiles.map((t) => [t.t, t.o]), [['start', 0], ['tr02s', 0], ['straight', 1]]);
});

console.log('Familles (éditeur)');
test('familles : Ligne droite (9 inclinaisons), Virage (+16 descendants), Courbe (20 raccords), Transition (16), Looping ; chaque pièce une seule fois', () => {
  assert.deepEqual(FAMILY_ORDER, ['straight', 'turn', 'courbe', 'roll', 'loop']);
  assert.equal(Object.keys(FAMILIES.straight.members).length, 9);
  assert.equal(Object.keys(FAMILIES.turn.members).length, 5 + 16 + 16);
  assert.equal(Object.keys(FAMILIES.courbe.members).length, 20);
  assert.equal(Object.keys(FAMILIES.roll.members).length, 16);
  const seen = new Set();
  for (const fam of FAMILY_ORDER) for (const [type, tr] of Object.entries(FAMILIES[fam].members)) {
    assert.ok(!seen.has(type), 'doublon ' + type); seen.add(type);
    assert.equal(resolve(fam, tr), type); assert.deepEqual(familyOf(type), { fam, traits: tr });
  }
  for (const id of GEN_IDS) assert.ok(seen.has(id), id + ' est proposée dans l’éditeur');
});
test('Transition : « De » et « Vers » sont des orientations ; une combinaison impossible est repoussée sur la plus proche', () => {
  assert.equal(resolve('roll', { de: '0', vers: '1', forme: 's' }), 'tr01s');
  assert.equal(resolve('roll', { de: '1', vers: '0', forme: 'l' }), 'tr10l');
  assert.equal(resolve('roll', { de: '1', vers: '2', forme: 's' }), null, 'mur gauche → mur droit : pas de transition directe');
  assert.deepEqual([...validValues('roll', { de: '1', vers: '0', forme: 's' }, 'vers')].sort(), ['0', '3']);
  assert.ok(withTrait('roll', { de: '0', vers: '1', forme: 's' }, 'de', '1'), 'une pièce proche est proposée');
});
test('Courbe : début doux / fin douce / S, montée ou descente ; Ligne droite : descentes', () => {
  assert.equal(resolve('courbe', { sens: 'd', incl: '1', prof: 'o' }), 'cdo1');
  assert.equal(resolve('courbe', { sens: 'u', incl: '2', prof: 'o' }), 'cro2');
  assert.equal(resolve('courbe', { sens: 'u', incl: '2', prof: 's' }), null, 'le S n’existe qu’en ½ et 1 niveau');
  assert.equal(resolve('straight', { incl: '-2' }), 'dn2');
  assert.equal(resolve('turn', { size: 'm', bank: '0', incl: '-1', dir: 'L' }), 'cvdBigL1');
});

console.log('Éditeur : orientation et pentes à la pose');
function mkEd(tool, opts = {}, level = 0) {
  const track = new Track('t');
  const calls = { commit: 0, changed: 0, flash: [] };
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, {
    track, tool, level, rot: 0, hover: { x: HALF, z: HALF, cx: 0, cz: 0 }, surfParam: {}, opts: { v: 0, o: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0, th: 0, ...opts },
    app: { ui: { flash: (m) => calls.flash.push(m) }, audio: { place() {}, error() {} } },
    _commit: () => calls.commit++, _changed: () => calls.changed++,
  });
  return { self, track, calls };
}
test('_candidate et _act : une ligne droite + Mur gauche se pose avec son orientation ; en dessous du niveau 2 le refus explique pourquoi', () => {
  const { self, track, calls } = mkEd('straight', { o: 1 }, 3);
  assert.equal(self._candidate().o, 1);
  self._act(false);
  assert.deepEqual([track.tiles[0].t, track.tiles[0].o, track.tiles[0].l], ['straight', 1, 3]);
  const low = mkEd('straight', { o: 2 }, 1);
  low.self._act(false); assert.equal(low.track.tiles.length, 0); assert.ok(low.calls.flash.some((m) => /mur/.test(m)), low.calls.flash.join('|'));
  const dn = mkEd('dn1', {}, 0);
  dn.self._act(false); assert.equal(dn.track.tiles.length, 0); assert.ok(dn.calls.flash.some((m) => /pente descend/.test(m)), dn.calls.flash.join('|'));
  void calls;
});
test('une descente posée : le niveau suit vers le bas pour la case suivante (aide à la pose)', () => {
  const { self } = mkEd('dn2', {}, 5);
  self._act(false);
  assert.equal(self.autoLevel.get('0,-1'), 3, 'devant : 2 niveaux plus bas'); assert.equal(self.autoLevel.get('0,1'), 5, 'derrière : même niveau');
});
test('Miroir (touche M) : Mur gauche ↔ Mur droit pour une pièce armée, transition gauche ↔ droite, virage descendant ↔ son miroir', () => {
  const { self } = mkEd('straight', { o: 1 });
  self._refreshUI = () => {};
  self.mirror(); assert.equal(self.opts.o, 2); self.mirror(); assert.equal(self.opts.o, 1);
  assert.equal(MIRROR_TYPES.tr01s, 'tr02s'); assert.equal(MIRROR_TYPES.tr20l, 'tr10l'); assert.equal(MIRROR_TYPES.tr32s, 'tr31s'); assert.equal(MIRROR_TYPES.cvd1, 'cvdL1'); assert.equal(MIRROR_TYPES.cvdBigL4, 'cvdBig4');
  for (const [a, b] of Object.entries(MIRROR_TYPES)) assert.equal(MIRROR_TYPES[b], a, `${a} ↔ ${b}`);
});
test('Mur / Sol appliqués à une pièce posée (outil « appliquer »)', () => {
  const { self, track } = mkEd('mod:o1', {}, 3);
  const t = track.add({ t: 'straight', x: 0, z: 0, l: 3, r: 0 });
  self._targetTile = () => t;
  self._toggleMod(false); assert.equal(t.o, 1);
  self.tool = 'mod:o2'; self._toggleMod(false); assert.equal(t.o, 2);
  self.tool = 'mod:o0'; self._toggleMod(false); assert.equal(t.o, 0);
  self.tool = 'mod:v'; self._toggleMod(false); assert.equal(t.v, 1);
});

console.log('Éditeur : horizon des profils légers');
test('Ultra Potato (portée 450 m, brouillard à 180 m) : en dézoomant l’éditeur éloigne la portée et le brouillard ; les profils riches ne sont jamais rapprochés', () => {
  const mk = (far, near, fogFar, dist) => ({ cam: { far, updateProjectionMatrix() { this.n = (this.n || 0) + 1; } }, fog: { near, far: fogFar }, dist });
  const run = (o) => EditorSession.prototype._editorHorizon.call({ dist: o.dist, app: { scene: { fog: o.fog } } }, o.cam);
  const pi = mk(450, 38, 184, 500); run(pi);
  assert.ok(pi.cam.far >= 500 * 2.2 + 300 && pi.fog.far >= pi.cam.far - 1 && pi.fog.near >= 350, `portée ${pi.cam.far}, brouillard ${pi.fog.near}-${pi.fog.far}`);
  assert.ok(pi.cam.n >= 1, 'matrice de projection remise à jour');
  const ultra = mk(5000, 240, 1150, 130); run(ultra);
  assert.deepEqual([ultra.cam.far, ultra.fog.near, ultra.fog.far], [5000, 240, 1150], 'rien à changer de près');
  const far = mk(1400, 100, 520, 700); run(far);
  assert.ok(far.fog.far >= 700 * 2.2 + 300, 'Potato au zoom maximal : le circuit reste visible');
});

console.log('Maillage : pentes à profil, murs, transitions');
test('toutes les pièces (et chaque orientation possible) se maillent : sommets finis, jamais vide', () => {
  let n = 0;
  for (const id of PIECE_ORDER) {
    if (!PIECES[id]) continue;
    for (const o of [0, 1, 2]) {
      const t = tile({ t: id, o, l: 6 });
      if (o && !t.o) continue;
      const gb = new GeoBuilder(), glow = new GeoBuilder(), fx = new FxBuilder();
      buildTileInto(gb, glow, t, null, fx);
      assert.ok(gb.pos.length > 0 || PIECES[id].kind === 'area', `${id} o=${o} : vide`);
      for (const v of gb.pos) assert.ok(Number.isFinite(v), `${id} o=${o} : NaN`);
      n++;
    }
  }
  assert.ok(n > 180, 'cas testés : ' + n);
});
test('le maillage suit la physique : hauteur de la chaussée = sampleLocal pour toutes les pentes (droites, courbes, descentes)', () => {
  for (const id of ['dn1', 'dn4', 'cro2', 'cdi1', 'cdo1', 'crs1', 'cds1', 'crv4', 'slope', 'steep4']) {
    const t = tile({ t: id, l: 6 }), o = {};
    for (const q of stripsFor(t)[0]) { sampleLocal(t, q.p[0], q.p[2], o); assert.ok(Math.abs(o.h - q.p[1]) < 1e-6, `${id} : maillage ${q.p[1]} ≠ physique ${o.h}`); }
  }
});
test('transitions : la chaussée est roulée autour de son axe de 0 à ±90° ; sol → mur → sol est continu, normale unitaire', () => {
  for (const id of ['tr01s', 'tr10s', 'tr02l', 'tr13s', 'tr31l']) {
    const t = tile({ t: id, l: 6 }), rib = ribbonOf(t, true), F = {}, G = {};
    let prev = null;
    for (let i = 0; i <= 40; i++) {
      frameLocal(rib, i / 40, F);
      assert.ok(Math.abs(Math.hypot(F.nx, F.ny, F.nz) - 1) < 1e-9, id + ' : normale');
      assert.ok(Math.abs(F.tx * F.nx + F.ty * F.ny + F.tz * F.nz) < 1e-6, id + ' : normale ⟂ tangente');
      if (prev) assert.ok(prev.nx * F.nx + prev.ny * F.ny + prev.nz * F.nz > 0.99, id + ' : pas de saut de normale');
      prev = { nx: F.nx, ny: F.ny, nz: F.nz };
    }
    frameLocal(rib, 0, F); frameLocal(rib, 1, G);
    const [a, b] = PIECES[id].roll, ang = (c) => (c === 0 ? 0 : c === 3 ? Math.PI : Math.PI / 2);
    assert.ok(Math.abs(Math.acos(Math.max(-1, Math.min(1, F.ny))) - ang(a)) < 1e-6, id + ' : roulis de départ');
    assert.ok(Math.abs(Math.acos(Math.max(-1, Math.min(1, G.ny))) - ang(b)) < 1e-6, id + ' : roulis d’arrivée');
  }
});
test('un circuit de pentes, de murs et de plafond : les pièces voisines se rejoignent (le chemin du pilote n’a aucun saut)', () => {
  const tr = scriptTrack('j', 'start S2 [crv05] [slope] [cro05] S [cdi05] [dn1] [cdo05] S [tr01s] S< R< S< [tr10s] S [tr02l] S> [tr20l] S [tr01s] S< [tr13s] S^ [tr31s] S< [tr10s] S finish', { l: 6 });
  let worst = 0;
  for (let i = 1; i < tr.path.length; i++) worst = Math.max(worst, Math.hypot(tr.path[i][0] - tr.path[i - 1][0], tr.path[i][1] - tr.path[i - 1][1], tr.path[i][2] - tr.path[i - 1][2]));
  assert.ok(worst < 7, 'saut du chemin : ' + worst.toFixed(2) + ' m');
  // Dénivelé cumulé : +2, -2, 0 niveaux (les murs et le plafond ne changent pas de niveau)
  const fin = tr.tiles.find((t) => t.t === 'finish');
  assert.equal(fin.l, 6);
});

console.log('Raccords d’orientation (avertissement de l’éditeur)');
test('un mur contre le sol, ou un mur gauche contre un mur droit : avertissement qui nomme les deux orientations ; une transition règle le problème', () => {
  const ok = (sc) => orientationIssues(scriptTrack('j', sc, { l: 6 })).map((i) => i.msg);
  assert.deepEqual(ok('start S2 [tr01s] S2< [tr10s] S2 finish'), []);
  assert.deepEqual(ok('start S2 [tr02l] S2> [tr20l] S2 finish'), []);
  assert.deepEqual(ok('start S2 [tr01s] S< [tr13s] S2^ [tr31s] S< [tr10s] S2 finish'), []);
  const a = ok('start S2 S2< finish');
  assert.equal(a.length, 2, 'deux raccords : sol → mur et mur → arrivée'); assert.ok(a.every((m) => /Mur gauche contre Sol|Sol contre Mur gauche/.test(m) && /transition/.test(m)), a.join('|'));
  const b = ok('start S2 [tr01s] S< S> [tr20s] S2 finish');
  assert.ok(b.length >= 1 && /Mur (gauche|droit) contre Mur (gauche|droit)/.test(b[0]), b.join('|'));
  const c = ok('start S2 [tr01s] [tr20s] S2 finish');
  assert.ok(c.length >= 1, 'transition 0→1 suivie de 2→0 : roulis différents');
  assert.deepEqual(ok('start S2 R S2 finish'), [], 'un circuit sans mur ne coûte rien');
});
test('rolls : sol 0, mur gauche +90°, mur droit −90°, plafond ±180° ; transition de 0 à 1 va de 0° à +90° ; inverse parcouru à l’envers', () => {
  assert.deepEqual(endRolls(tile({ t: 'straight' })), [0, 0]);
  assert.deepEqual(endRolls(tile({ t: 'straight', o: 1 })).map((x) => Math.round(x * 180 / Math.PI)), [90, 90]);
  assert.deepEqual(endRolls(tile({ t: 'tr02s' })).map((x) => Math.round(x * 180 / Math.PI)), [0, -90]);
  assert.deepEqual(endRolls(tile({ t: 'tr13s' })).map((x) => Math.round(x * 180 / Math.PI)), [90, 180]);
  assert.equal(endRolls(tile({ t: 'loop' })), null);
  assert.equal(rollName(Math.PI / 2), 'Mur gauche'); assert.equal(rollName(-Math.PI), 'Plafond');
});

console.log('Audit du graphe des pièces');
const A = auditPieces();
test('aucun cul-de-sac : toute sortie de pièce (hors tremplins) a une pièce qui la prolonge sans cassure', () => {
  assert.deepEqual(A.deadEnds, []);
});
test('inversions : toute pièce parcourue à l’envers existe en pièce posée normalement (descente de chaque montée, mur → sol de sol → mur…)', () => {
  // La vrille se prend à l'envers en la tournant de 180° (vrille inverse) : elle est volontairement à sens unique.
  const missing = A.missingReverse.filter((d) => d.id !== 'twist').map((d) => d.id + (d.o ? ':' + d.o : ''));
  assert.deepEqual(missing, []);
  const ids = new Set(A.all.map((d) => d.id));
  for (const id of ['dn1', 'cdo1', 'cdi1', 'cro1', 'tr10s', 'tr20l', 'tr31s', 'cvdL1']) assert.ok(ids.has(id));
});
test('raccords exacts : début doux ↔ fin douce ↔ droite, mur ↔ sol ↔ plafond (classes de pente et de roulis)', () => {
  const has = (slope, psi) => A.entries.has(`${slope}|${psi}`) && A.exits.has(`${slope}|${psi}`);
  for (const s of [0.2, 0.4, 0.8, -0.2, -0.4, -0.8, 1.6, -1.6]) assert.ok(has(s, 0), `pente ${s} au sol`);
  for (const psi of [0, 90, -90, 180]) assert.ok(has(0, psi), `plat à ${psi}°`);
  for (const s of [0.2, -0.2, 0.4, -0.4]) { assert.ok(has(s, 90), `pente ${s} sur le mur gauche`); assert.ok(has(s, -90), `pente ${s} sur le mur droit`); }
});

console.log('Conduite : pentes et raccords');
test('physique v25 : plus d’exemption d’angle : seule la vitesse de la route qui « tombe » sous la voiture compte (CAR.launch)', () => {
  assert.ok(Number.isInteger(PHYS_VER) && PHYS_VER >= 25);
  assert.equal(CAR.stickAngle, undefined, 'l’ancienne exemption de 12° n’existe plus');
  assert.ok(CAR.launch > 0.3 && CAR.launch < 1.2, 'seuil de décollage ' + CAR.launch);
});
const hop = (script, v0, secs = 4.5) => drive(script, { v0, auto: false, secs }).airMax;
test('un raccord franc (pente 11°, descente, pente douce) : à basse vitesse le saut reste court, à grande vitesse la voiture décolle franchement (plus de « collage »)', () => {
  for (const sc of ['start S S [slope] S4 S4 S4', 'start S S [dn1] S4 S4 S4', 'start S S [gentle] S4 S4 S4', 'start S S [dn05] S4 S4 S4']) {
    assert.ok(hop(sc, 10) < 0.7, `${sc} à 10 m/s : un petit saut seulement`);
    assert.ok(hop(sc, 60) > 0.4, `${sc} à 60 m/s : elle décolle`);
  }
  assert.ok(hop('start S S [slope] S4 S4 S4', 60) > hop('start S S [slope] S4 S4 S4', 10) + 0.3, 'la pente décolle d’autant plus que la vitesse est grande');
});
test('un tremplin reste un tremplin : la montée de 2 niveaux (22°) et la descente de 2 niveaux décollent toujours', () => {
  assert.ok(hop('start S S [steep] S4 S4 S4', 40) > 0.3, 'tremplin');
  assert.ok(hop('start S S [steep4] S4 S4 S4', 40) > 0.3, 'tremplin 4');
  assert.ok(hop('start S S [dn2] S4 S4 S4', 40) > 0.3, 'descente de 2 niveaux, sans raccord doux');
});
test('raccords doux : aucun décollage jusqu’à 30 m/s (108 km/h) ; à 80 m/s (288 km/h) les raccords d’un niveau décollent comme une vraie côte', () => {
  const chains = [
    'start S S [crv05] [slope] [cro05] S4 S4 S4', 'start S S [crv1] [steep] [cro1] S4 S4 S4', 'start S S [crv2] [steep4] [cro2] S4 S4 S4',
    'start S S [cdi05] [dn1] [cdo05] S4 S4 S4', 'start S S [cdi1] [dn2] [cdo1] S4 S4 S4',
    'start S S [crs05] S4 S4 S4', 'start S S [crs1] S4 S4 S4', 'start S S [cds05] S4 S4 S4', 'start S S [cds1] S4 S4 S4',
    'start S S [crv05] [slope] [cro05] [cdi05] [dn1] [cdo05] S4 S4 S4',
  ];
  for (const sc of chains) for (const v0 of [10, 20, 30]) assert.equal(hop(sc, v0), 0, `${sc} à ${v0} m/s`);
  for (const sc of ['start S S [cdi1] [dn2] [cdo1] S4 S4 S4', 'start S S [crs1] S4 S4 S4']) assert.ok(hop(sc, 80) > 0.8, `${sc} à 80 m/s`);
});
test('une colline à raccords doux se roule d’une traite avec le pilote automatique, du départ à l’arrivée (au plus un petit vol aux sommets)', () => {
  const r = drive('start S2 [crv05] [slope] [cro05] S2 [cdi05] [dn1] [cdo05] S2 [crs1] S [cds1] S2 finish', { secs: 30, l: 4 });
  assert.ok(r.finished, 'arrivée'); assert.equal(r.falls, 0); assert.ok(r.airMax < 1.5, 'vol ' + r.airMax); assert.ok(!r.lost);
});
test('virages descendants : ils se roulent comme les virages montants (niveau d’arrivée, pas de chute)', () => {
  const r = drive('start S [cvd1] S2 [cvdL1] S2 [cvdBig1] S2 finish', { secs: 30, l: 6 });
  assert.ok(r.finished, 'arrivée'); assert.equal(r.falls, 0); assert.ok(!r.lost);
  const down = scriptTrack('d', 'start S [cvd2] S finish', { l: 6 });
  assert.equal(down.tiles.find((t) => t.t === 'finish').l, 4, 'deux niveaux plus bas');
});

console.log('Conduite : murs, plafond, gravité locale');
const WALL = (a, b, mid) => `start S3 [tr0${a}s] ${mid} [tr${a}0s] S2 finish`;
test('sol → mur gauche → sol, à pleine vitesse : arrivée, aucune chute, jamais en l’air, la gravité ne change pas', () => {
  const r = drive(WALL(1, 0, 'S3<'), { secs: 30 });
  assert.ok(r.finished); assert.equal(r.falls, 0); assert.equal(r.airMax, 0); assert.equal(r.gMin, 1); assert.ok(r.ribTime > 1.5, 'longtemps sur le mur');
});
test('sol → mur droit → sol (franc et doux 2×2) et mur gauche en doux : même résultat', () => {
  for (const sc of [WALL(2, 0, 'S3>'), 'start S3 [tr01l] S3< [tr10l] S2 finish', 'start S3 [tr02l] S3> [tr20l] S2 finish']) {
    const r = drive(sc, { secs: 30 });
    assert.ok(r.finished, sc); assert.equal(r.falls, 0, sc); assert.equal(r.airMax, 0, sc); assert.equal(r.gMin, 1, sc);
  }
});
test('un virage sur le mur : intérieur (droite sur mur gauche, gauche sur mur droit) comme extérieur, avec le pilote automatique', () => {
  for (const sc of ['start S3 [tr01s] S< R< S< [tr10s] S2 finish', 'start S3 [tr01s] S< L> S< [tr10s] S2 finish', 'start S3 [tr02s] S> L< S> [tr20s] S2 finish', 'start S3 [tr02s] S> R> S> [tr20s] S2 finish', 'start S3 [tr01s] S< RR< S< [tr10s] S2 finish']) {
    const r = drive(sc, { secs: 30 });
    assert.ok(r.finished, sc); assert.equal(r.falls, 0, sc); assert.ok(!r.lost, sc);
  }
});
test('trop lente, la voiture ne tient pas sur le mur : elle glisse et tombe (la gravité ne change pas)', () => {
  const r = drive('start S [tr01s] S5< finish', { v0: 15, auto: false, throttle: false, secs: 8 });
  assert.ok(r.falls > 0 || r.finished === null, 'chute ou arrêt');
  assert.equal(r.gMin, 1);
});
test('mur → plafond → mur : la gravité suit la route toute seule (inversée au plafond, normale sur le mur) ; la voiture roule au plafond', () => {
  for (const sc of ['start S3 [tr01s] S< [tr13s] S2^ [tr31s] S< [tr10s] S2 finish', 'start S3 [tr02s] S> [tr23s] S2^ [tr32s] S> [tr20s] S2 finish', 'start S3 [tr01l] S< [tr13l] S^ [tr31l] S< [tr10l] S2 finish']) {
    const r = drive(sc, { secs: 40 });
    assert.ok(r.finished, sc); assert.equal(r.falls, 0, sc); assert.ok(!r.lost, sc); assert.equal(r.gMin, -1, 'gravité inversée au plafond');
    assert.equal(r.ph.gSign, 1, 'gravité normale à l’arrivée'); assert.ok(r.ceilTime > 0.3, 'roule au plafond : ' + r.ceilTime);
  }
});
test('pente sur un mur : la montée et la descente se prennent aussi à la verticale (route roulée, profil conservé)', () => {
  const r = drive('start S3 [tr01s] S< [slope]< S< [dn1]< S< [tr10s] S2 finish', { secs: 30, l: 6 });
  assert.ok(r.finished); assert.equal(r.falls, 0);
});

console.log('Rejeu identique (vérification serveur)');
test('un circuit avec pentes douces, mur, plafond et transitions : la course du pilote est rejouée à l’identique, sur le circuit d’origine comme sur son code partagé', () => {
  const tr = scriptTrack('mix', 'start S2 [crv05] [slope] [cro05] S [cdi05] [dn1] [cdo05] S [tr01s] S< R< S< [tr13l] S^ [tr31l] S< [tr10s] S2 [tr02l] S> [tr20l] S2 finish', { l: 6 });
  const phys = new CarPhysics(tr), logic = new RaceLogic(tr); placeAtStart(phys, logic);
  const bot = new Autopilot(tr.path); bot.reset(phys);
  const rec = new InputRecorder();
  let finished = null;
  for (let i = 0; i < 90 / DT && finished === null; i++) {
    const inp = bot.control(phys);
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    phys.clock = logic.steps;
    phys.step(inp);
    const ev = logic.update(phys);
    if (ev && ev.type === 'finish') finished = logic.time;
  }
  assert.ok(finished !== null, 'le pilote automatique termine');
  const inputs = rec.encode();
  const same = replayTime(tr, inputs);
  assert.ok(same !== null && Math.abs(same - finished) < 0.0005, `rejeu ${same} vs course ${finished}`);
  const shared = Track.decode(tr.encode());
  const again = replayTime(shared, inputs);
  assert.ok(again !== null && Math.abs(again - finished) < 0.0005, `code partagé : rejeu ${again} vs course ${finished}`);
});

console.log('Aléatoire : chaînes de pièces compatibles');
// Générateur pseudo-aléatoire déterministe.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Macros sans cassure : à chaque étape, une pièce (ou une suite) qui se raccorde exactement à l'état courant (orientation 0 sol, 1 mur gauche, 2 mur droit, 3 plafond).
const MACROS = {
  0: ['S', 'S2', 'R', 'L', 'RR', 'LL', '[crv05] [slope] [cro05]', '[cdi05] [dn1] [cdo05]', '[crs05]', '[cds05]', '[crv1] [steep] [cro1]', '[gentle] [dn05]', '[crs1]', '[cds1]', '[cdi1] [dn2] [cdo1]', '[crv2] [steep4] [cro2]',
    'S [cv05] S', 'S [cvL05] S', 'S [cvd05] S', 'S [cvdL05] S', 'S [cvBig05] S', 'S [cvdBig05] S'],
  1: ['S<', 'S2<', 'R<', 'L>', 'RR<', 'LL>', '[crv05]< [slope]< [cro05]<', '[cdi05]< [dn1]< [cdo05]<'],
  2: ['S>', 'S2>', 'R>', 'L<', 'RR>', 'LL<', '[crv05]> [slope]> [cro05]>', '[cdi05]> [dn1]> [cdo05]>'],
  3: ['S^', 'S2^'],
};
const TRANS = { 0: [['[tr01s]', 1], ['[tr01l]', 1], ['[tr02s]', 2], ['[tr02l]', 2]], 1: [['[tr10s]', 0], ['[tr10l]', 0], ['[tr13s]', 3], ['[tr13l]', 3]], 2: [['[tr20s]', 0], ['[tr20l]', 0], ['[tr23s]', 3], ['[tr23l]', 3]], 3: [['[tr31s]', 1], ['[tr31l]', 1], ['[tr32s]', 2], ['[tr32l]', 2]] };
function randomChain(seed, len = 9) {
  const R = rng(seed);
  for (let attempt = 0; attempt < 40; attempt++) {
    let ori = 0; const toks = ['start', 'S2'];
    for (let i = 0; i < len; i++) {
      if (R() < 0.34 && !(ori === 3 && i === len - 1)) { const [tok, to] = TRANS[ori][Math.floor(R() * TRANS[ori].length)]; if (ori === 0) toks.push('S'); toks.push(tok); ori = to; }      // on entre sur un mur en ligne droite
      else toks.push(MACROS[ori][Math.floor(R() * MACROS[ori].length)]);
    }
    // on revient au sol avant l'arrivée
    while (ori !== 0) { const back = TRANS[ori].find(([, to]) => to === (ori === 3 ? 1 : 0)); toks.push(back[0]); ori = back[1]; }
    toks.push('S2', 'finish');
    const script = toks.join(' ');
    try {
      // Aucune case occupée deux fois (même à des niveaux différents) : deux routes à moins d'un niveau l'une de l'autre se gêneraient.
      const t = scriptTrack('r', script, { l: 6 }), seen = new Set();
      let ok = true;
      for (const tile of t.tiles) for (const [cx, cz] of Track.cellsOf(tile)) { const k = cx + ',' + cz; if (seen.has(k)) ok = false; seen.add(k); }
      if (ok) return script;
    } catch { /* conflit de cases : on retente */ }
  }
  return null;
}
test('150 circuits tirés au hasard (pentes douces, virages, hélices, murs, plafond, transitions franches et douces) : tous se roulent du départ à l’arrivée sans chute ni long envol (moins de 2 s)', () => {
  let done = 0;
  const bad = [];
  for (let seed = 1; seed <= 150; seed++) {
    const script = randomChain(seed);
    if (!script) continue;
    const r = drive(script, { secs: 90, l: 6 });
    done++;
    const warn = orientationIssues(r.tr);
    if (warn.length) bad.push(`#${seed} ${script} → avertissement de raccord : ${warn[0].msg}`);
    if (r.nan || r.lost || !r.finished || r.falls > 0 || r.airMax > 2) bad.push(`#${seed} ${script} → ${r.nan ? 'NaN' : r.lost ? 'perdu' : !r.finished ? 'pas d’arrivée' : r.falls + ' chute(s)'}`);
  }
  assert.ok(done >= 120, 'circuits générés : ' + done);
  assert.deepEqual(bad, [], '\n' + bad.join('\n'));
});

await finish('Tous les tests des pentes et des murs passent.');
