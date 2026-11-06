// Tests de la bêta 0.9.2 : node tools/test-v092.mjs   (npm test)
//  pot de peinture (zones vides fermées), bifurcation, plaque bateau, pièces à 90°, checkpoint sur plateforme, Ctrl+D,
//  raccourcis, décorations (véhicules, Noël, Halloween, lumières), traînée.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

const { Track } = await import('../js/track.js');
const { PIECES, PIECE_ORDER, cpKind, flagAllowed, sampleLocal, isRibbon, hasNoRails } = await import('../js/pieces.js');
const { enclosedRegion, tileRegion } = await import('../js/editorTools.js');
const { EditorSession } = await import('../js/editor.js');
const { PALETTE_ORDER, TOOLS } = await import('../js/editor/shared.js');
const { Inspector } = await import('../js/inspector.js');
const { KEY_ACTIONS } = await import('../js/input.js');
const { CarPhysics } = await import('../js/physics.js');
const { SIDE_HOLD } = await import('../js/physics/specs.js');
const { RaceLogic, placeAtStart } = await import('../js/raceLogic.js');
const { CELL, HALF, LEVEL_H, DT } = await import('../js/constants.js');
const { DECO_ORDER, DECO_CATS, DECO_LABELS, LIGHT_DECOS } = await import('../js/decoData.js');
const { GeoBuilder } = await import('../js/geo.js');
const { buildDecoInto } = await import('../js/decos.js');
const { trailStrength } = await import('../js/trail.js');

const add = (track, t, x, z, extra = {}) => track.add({ t, x, z, l: 0, r: 0, s: '', ...extra });

console.log('Pot de peinture : zones vides fermées');
// Anneau 5×5 de plateformes (cases 0..4), intérieur 3×3 vide ; une case du bord peut être retirée pour ouvrir la zone.
function ring5(gap = null) {
  const tr = new Track('r');
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
    if (x > 0 && x < 4 && z > 0 && z < 4) continue;
    if (gap && gap[0] === x && gap[1] === z) continue;
    add(tr, 'platform', x, z);
  }
  return tr;
}
test('une zone entourée de pièces est trouvée en entier (9 cases), triée', () => {
  const r = enclosedRegion(ring5(), 2, 2, 0, 0);
  assert.equal(r.ok, true); assert.equal(r.cells.length, 9);
  assert.deepEqual(r.cells[0], [1, 1]); assert.deepEqual(r.cells[8], [3, 3]);
});
test('une brèche dans l’anneau : zone ouverte, refusée', () => {
  const r = enclosedRegion(ring5([4, 2]), 2, 2, 0, 0);
  assert.deepEqual([r.ok, r.why], [false, 'open']);
});
test('une case occupée n’est pas une zone vide ; un circuit vide non plus ; une case hors du circuit est ouverte', () => {
  assert.equal(enclosedRegion(ring5(), 0, 0, 0, 0).why, 'occupied');
  assert.equal(enclosedRegion(new Track('v'), 0, 0, 0, 0).why, 'empty');
  assert.equal(enclosedRegion(ring5(), 40, 40, 0, 0).why, 'open');
});
test('deux pièces qui se touchent par un coin ferment la zone (4-voisins)', () => {
  const tr = new Track('d');
  for (const [x, z] of [[1, 0], [0, 1], [2, 1], [1, 2]]) add(tr, 'platform', x, z);     // losange autour de (1,1) : fermé
  const r = enclosedRegion(tr, 1, 1, 0, 0);
  assert.equal(r.ok, true); assert.equal(r.cells.length, 1);
});
test('seuls les niveaux qui se recoupent comptent : un anneau à un autre niveau ne ferme rien', () => {
  const tr = new Track('l');
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) if (!(x > 0 && x < 4 && z > 0 && z < 4)) add(tr, 'platform', x, z, { l: 6 });
  assert.equal(enclosedRegion(tr, 2, 2, 0, 0).why, 'open');
  assert.equal(enclosedRegion(tr, 2, 2, 6, 6).ok, true);
});
test('une grande zone est refusée (max)', () => {
  const tr = new Track('g');
  for (let x = 0; x < 22; x++) for (let z = 0; z < 22; z++) if (x === 0 || z === 0 || x === 21 || z === 21) add(tr, 'platform', x, z);
  assert.equal(enclosedRegion(tr, 5, 5, 0, 0, { max: 100 }).why, 'big');
  assert.equal(enclosedRegion(tr, 5, 5, 0, 0).ok, true);
});
test('tileRegion : pièces 2×2 posées là où elles tiennent, le reste est compté', () => {
  const cells = []; for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) cells.push([x, z]);
  const t = tileRegion(cells, 2);
  assert.equal(t.spots.length, 1); assert.equal(t.left, 5);
  assert.equal(tileRegion(cells, 1).spots.length, 9);
});
function mk(tool, hover, opts = {}) {
  const track = ring5(opts.gap);
  const calls = { commit: 0, flash: [] };
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, { track, tool, level: 0, rot: 0, opts: {}, hover: { cx: hover[0], cz: hover[1] }, surfParam: {}, app: { ui: { flash: (m) => calls.flash.push(m) }, audio: { place() {}, error() {} } }, _commit: () => calls.commit++, _changed() {} });
  return { self, track, calls };
}
test('le pot de peinture remplit la zone vide fermée (un seul commit)', () => {
  const { self, track, calls } = mk('fill-piece:platform', [2, 2]);
  const before = track.tiles.length;
  self._floodFill();
  assert.equal(track.tiles.length - before, 9); assert.equal(calls.commit, 1);
  for (let x = 1; x < 4; x++) for (let z = 1; z < 4; z++) assert.equal(track.tilesAt(x, z).length, 1);
});
test('zone non fermée : message, rien posé ; revêtement sur une case vide : refusé', () => {
  const a = mk('fill-piece:platform', [2, 2], { gap: [4, 2] });
  const n = a.track.tiles.length; a.self._floodFill();
  assert.equal(a.track.tiles.length, n); assert.equal(a.calls.commit, 0); assert.match(a.calls.flash[0], /fermée/);
  const b = mk('fill-surf:ice', [2, 2]);
  b.self._floodFill();
  assert.equal(b.calls.commit, 0); assert.match(b.calls.flash[0], /pièce/);
});
test('le départ et l’arrivée ne se posent pas au pot de peinture', () => {
  const { self, track, calls } = mk('fill-piece:start', [2, 2]);
  const n = track.tiles.length; self._floodFill();
  assert.equal(track.tiles.length, n); assert.equal(calls.commit, 0);
});
test('cliquer une pièce garde le remplissage de pièces connectées (comportement d’avant)', () => {
  const { self, track } = mk('fill-surf:slow', [0, 0]);
  self._floodFill();
  assert.equal(track.tiles.filter((t) => t.s === 'slow').length, 16);
});

console.log('Bifurcation : revêtement de la voie déportée');
test('la voie directe est visible par-dessus : son revêtement compte tant qu’on est sur elle', () => {
  const tr = new Track('f'); tr.add({ t: 'fork', x: 0, z: 0, l: 0, r: 0, s: '', s2: 'ice' });
  const o = {}; let onB = 0, onA = 0;
  for (let z = 0; z <= 48; z += 2) for (let x = 0; x <= 48; x += 1.5) {
    const s = tr.surfaceAt(x, 5, z, o);
    if (s.type !== 'road') continue;
    if (o.mod === 'ice') onB++; else onA++;
  }
  assert.ok(onB > 20 && onA > 100, `glace ${onB}, route ${onA}`);
  // À l'entrée (z = 46, bas de la pièce) les deux voies se confondent : jamais de glace sur la chaussée directe.
  for (let x = 4; x <= 20; x += 2) { tr.surfaceAt(x, 5, 46, o); assert.equal(o.mod, '', 'x=' + x); }
  // Tout au bout (z = 2), la voie déportée (à droite) est de la glace, la voie directe non.
  tr.surfaceAt(12, 5, 2, o); assert.equal(o.mod, '');
  tr.surfaceAt(36, 5, 2, o); assert.equal(o.mod, 'ice');
});

console.log('Plaque bateau');
test('pour un bateau la plaque est de l’eau ; pour les autres véhicules, une route normale (on ne coule pas)', () => {
  const run = (vehicle) => {
    const tr = new Track('b'); add(tr, 'start', 0, 0, { l: 0 }); tr.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0, s: 'boat' }); add(tr, 'straight', 0, -2);
    const phys = new CarPhysics(tr); const logic = new RaceLogic(tr); placeAtStart(phys, logic);
    phys.place(12, 0.4, -24 - 12, 0, 1); phys.vehicle = vehicle; phys.plateLock = 'boat'; phys.graceT = 0;
    let sank = false, minv = 99;
    for (let i = 0; i < 120 * 4; i++) { phys.step({ steer: 0, throttle: false, brake: false }); if (phys.ev.sink) sank = true; minv = Math.min(minv, phys.speed); }
    return { sank, vehicle: phys.vehicle, surf: phys.surfMod };
  };
  assert.equal(run('car').sank, false, 'une voiture arrêtée sur la plaque ne coule pas (route normale)');
  assert.equal(run('moto').sank, false);
  assert.equal(run('boat').sank, false, 'un bateau flotte');
});
test('la plaque bateau est une rampe très légère : eau (entrée) → sol (sortie)', () => {
  const tr = new Track('r'); tr.add({ t: 'straight', x: 0, z: 0, l: 0, r: 0, s: 'boat' });
  const o = {}; let prev = -Infinity;
  for (let z = CELL - 0.5; z >= 0.5; z -= 1) { tr.surfaceAt(HALF, 5, z, o); assert.ok(o.h >= prev - 1e-9, 'monte toujours'); prev = o.h; }
  tr.surfaceAt(HALF, 5, CELL - 0.1, o); assert.ok(Math.abs(o.h - (0.4 - 0.35)) < 0.02);
  tr.surfaceAt(HALF, 5, 0.1, o); assert.ok(Math.abs(o.h - 0.4) < 0.02);
});

console.log('Routes à 90°');
test('les 4 anciennes pièces gardent leur index (lecture des anciens circuits) mais deviennent une pièce ordinaire + une orientation', () => {
  const i = PIECE_ORDER.indexOf('crv05');
  assert.deepEqual(PIECE_ORDER.slice(i, i + 8), ['crv05', 'crv1', 'crv2', 'crv4', 'rollL', 'rollR', 'sideL', 'sideR']);
  const tl = (t, extra = {}) => Track.normalize({ t, x: 0, z: 0, l: 2, r: 0, ...extra });
  assert.equal(tl('rollL').t, 'tr02s'); assert.equal(tl('rollR').t, 'tr01s');
  assert.deepEqual([tl('sideL').t, tl('sideL').o], ['straight', 2]); assert.deepEqual([tl('sideR').t, tl('sideR').o], ['straight', 1]);
  for (const t of ['tr01s', 'tr02s']) { assert.ok(isRibbon({ t })); assert.equal(PIECES[t].noRails, true); }
  assert.ok(isRibbon(tl('sideL')), 'une ligne droite sur un mur se parcourt en mode ruban');
  // Elles réservent des niveaux sous elles (la moitié basse du plan descend de 9 m) : pas de niveau 0.
  assert.equal(Track.inBounds(Track.normalize({ t: 'sideL', x: 0, z: 0, l: 0, r: 0 })), false);
  assert.equal(Track.inBounds(Track.normalize({ t: 'sideL', x: 0, z: 0, l: 2, r: 0 })), true);
  assert.equal(Track.normalize({ t: 'rollL', x: 0, z: 0, l: 2, r: 0 }).nb, 1, 'sans bordures d’office');
  assert.equal(flagAllowed('tr01s', 'nb'), false);
  assert.equal(tl('sideL').o, 2); assert.equal(hasNoRails(tl('sideL')), true);
  assert.equal(flagAllowed('straight', 'o', null, 1), true, '0.9.3 : l’orientation est une option de la ligne droite');
});
function sideRun(v0, throttle, legacy = false) {
  const tr = new Track('s');
  tr.add({ t: 'start', x: 0, z: 0, l: 4, r: 0 }); tr.add({ t: legacy ? 'rollL' : 'tr02s', x: 0, z: -1, l: 4, r: 0 });
  for (let z = -2; z >= -7; z--) tr.add(legacy ? { t: 'sideL', x: 0, z, l: 4, r: 0 } : { t: 'straight', o: 2, x: 0, z, l: 4, r: 0 });
  const phys = new CarPhysics(tr), logic = new RaceLogic(tr); placeAtStart(phys, logic);
  phys.vel.z = -v0 / 3.6; phys.fwdSpeed = v0 / 3.6;
  let onSide = 0, maxDl = 0, left = false;
  for (let i = 0; i < 120 * 6; i++) {
    phys.clock = i; phys.step({ steer: 0, throttle, brake: false });
    if (phys.rib && phys.rib.tile.o === 2) { onSide++; maxDl = Math.max(maxDl, Math.abs(phys.rib.dl)); }
    if (onSide && !phys.rib && phys.pos.z > -7 * CELL) left = true;
  }
  return { onSide, maxDl, left };
}
for (const legacy of [false, true]) {
  test(`à grande vitesse la voiture tient sur le plan vertical sans glisser${legacy ? ' (ancien circuit : pièces rollL / sideL)' : ''}`, () => {
    const r = sideRun(200, true, legacy);
    assert.ok(r.onSide > 120 * 2, 'longtemps sur la route côté : ' + r.onSide);
    assert.ok(r.maxDl < 0.5, 'aucune glissade : ' + r.maxDl);
  });
  test(`trop lente, elle glisse le long du plan et tombe par le bord (la gravité ne change pas)${legacy ? ' (ancien circuit)' : ''}`, () => {
    const r = sideRun(72, false, legacy);
    assert.equal(r.left, true, 'elle quitte la route avant la fin');
    assert.ok(SIDE_HOLD > 0);
  });
}

console.log('Checkpoint');
test('sur une plateforme, le checkpoint est une balise (« pad ») ; sur une route, un portique ; plus d’anneau aérien dans l’éditeur', () => {
  const plat = Track.normalize({ t: 'platform', x: 0, z: 0, l: 0, r: 0, cp: 1 });
  assert.equal(plat.cp, 1); assert.equal(cpKind(plat), 'pad');
  assert.equal(cpKind(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, cp: 1 })), 'gate');
  assert.equal(cpKind(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, cp: 2 })), 'ring', 'les anciens circuits restent lisibles');
  const tr = new Track('p'); add(tr, 'start', 0, 0); tr.add({ t: 'platform', x: 0, z: -1, l: 0, r: 0, cp: 1 }); add(tr, 'finish', 0, -2);
  const phys = new CarPhysics(tr), logic = new RaceLogic(tr); placeAtStart(phys, logic);
  assert.equal(logic.cps.length, 1);
  phys.place(12, 0.4, -24 + 5, 0, 1);
  assert.equal(logic.update(phys).type, 'checkpoint');
});
test('Ctrl+D : copie de la pièce inspectée sur la première place libre ; la copie est sélectionnée', () => {
  const tr = new Track('d'); add(tr, 'start', 0, 0); const t = add(tr, 'straight', 0, -1, { s: 'ice', p: 150 });
  const calls = { commit: 0, sel: null };
  const ed = { track: tr, app: { ui: { flash() {} }, audio: { place() {}, error() {} } }, _changed() {}, _commit: () => calls.commit++ };
  const ins = Object.create(Inspector.prototype);
  Object.assign(ins, { ed, sel: { kind: 'tile', obj: t }, clear() { this.sel = null; }, select(kind, obj) { this.sel = { kind, obj }; calls.sel = obj; } });
  assert.equal(ins.duplicate(), true);
  assert.equal(tr.tiles.length, 3); assert.notEqual(calls.sel, t); assert.equal(calls.sel.s, 'ice'); assert.equal(calls.sel.p, 150);
  assert.deepEqual([calls.sel.x, calls.sel.z], [0, -2], 'devant la pièce');
  assert.equal(calls.commit, 1);
  const s = Object.create(Inspector.prototype); Object.assign(s, { ed, sel: { kind: 'tile', obj: tr.tiles[0] } });
  assert.equal(s.duplicate(), false, 'un seul départ');
});

console.log('Raccourcis');
test('plus aucun raccourci clavier pour choisir une pièce ; I = Inspecter ; Q reste à la Sélection', () => {
  assert.ok(PALETTE_ORDER.every((p) => !p.key && !p.k));
  const insp = KEY_ACTIONS.editor.find((a) => a[0] === 'ed.inspect');
  assert.ok(insp[2].includes('KeyI'));
  assert.equal(TOOLS.find((t) => t.id === 'select').key, 'KeyQ');
});

console.log('Décorations');
test('toutes les décorations ont un nom, une catégorie et se construisent (géométrie finie)', () => {
  const inCat = new Set(Object.values(DECO_CATS).flatMap((c) => c.kinds));
  for (const k of DECO_ORDER) {
    assert.ok(DECO_LABELS[k], 'nom ' + k);
    if (k !== 'plaque' && k !== 'shard') assert.ok(inCat.has(k), 'catégorie ' + k);
    if (k === 'plaque') continue;
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    try { buildDecoInto(gb, glow, { k, x: 0, y: 0, z: 0, ry: 0.3, s: 1, c: 0 }); } catch (e) { if (!/obstacle|createObstacle/i.test(String(e))) throw new Error(k + ' : ' + e.message); continue; }
    for (const g of [gb, glow]) for (const v of g.pos) if (!Number.isFinite(v)) throw new Error(k + ' : sommet non fini');
  }
  for (const c of ['vehicles', 'xmas', 'halloween', 'lights']) assert.ok(DECO_CATS[c].kinds.length >= 5, c);
  for (const k of ['plane', 'helicopter', 'bus']) assert.ok(DECO_CATS.vehicles.kinds.includes(k));
});
test('les lumières : portée, intensité et couleur par défaut définies', () => {
  for (const [k, L] of Object.entries(LIGHT_DECOS)) { assert.ok(DECO_ORDER.includes(k)); assert.ok(L.range > 0 && L.power > 0 && /^#[0-9a-f]{6}$/i.test(L.color), k); }
});
test('traînée : toujours là (discrète à l’arrêt), plus forte avec la vitesse et le boost, bornée à 1', () => {
  assert.ok(trailStrength(0, 0) > 0.1 && trailStrength(0, 0) < 0.25);
  assert.ok(trailStrength(30, 0) > trailStrength(10, 0)); assert.ok(trailStrength(30, 1) > trailStrength(30, 0));
  assert.equal(trailStrength(80, 1), 1);
});
test('Courbe : une rampe courbe monte comme prévu dans le circuit (niveau final)', () => {
  const tr = new Track('c'); tr.add({ t: 'crv2', x: 0, z: 0, l: 1, r: 0 });
  const o = {}; sampleLocal(tr.tiles[0], 0, -HALF, o);
  assert.ok(Math.abs(o.h - (1 * LEVEL_H + 0.4 + 2 * LEVEL_H)) < 1e-6);
  void DT;
});

console.log('Deltaplane');
function glide(tiles, setup, steps = 600, input = {}) {
  const tr = new Track('g'); for (const t of tiles) tr.add(t);
  const phys = new CarPhysics(tr);
  phys.place(setup.x, setup.y, setup.z, setup.yaw, 1);
  phys.pos.y = setup.y; phys.prev.y = setup.y; phys.vehicle = 'glider'; phys.grounded = false; phys.graceT = 0; phys.hazardGrace = 0;
  phys.vel.x = -Math.sin(setup.yaw) * setup.v; phys.vel.z = -Math.cos(setup.yaw) * setup.v; phys.vel.y = setup.vy || 0;
  const trace = [];
  for (let i = 0; i < steps; i++) { phys.step({ steer: 0, throttle: false, brake: false, ...input }); trace.push([phys.pos.x, phys.pos.y, phys.pos.z, phys.yaw]); }
  return { phys, trace, tr };
}
test('plateforme en vol : le deltaplane ne la traverse ni par le dessous ni par la tranche', () => {
  const plat = { t: 'platform', x: 0, z: 0, l: 6, r: 0 };            // dalle à 29,2 m, en l'air
  const top = 6 * LEVEL_H + 0.4;
  // par dessous, en cabrant fort
  const up = glide([plat], { x: 12, y: top - 14, z: 12 + 30, yaw: 0, v: 35, vy: 9 }, 400, { brake: true });
  const o = {}; let inside = 0;
  for (const [x, y, z] of up.trace) { up.tr.surfaceAt(x, y + 50, z, o, 1.6); if (o.type === 'road' && y > o.h - 0.8 && y < o.h - 0.3) inside++; }
  assert.equal(inside, 0, 'jamais dans la dalle (par dessous)');
  // de face, à hauteur de la tranche
  const face = glide([plat], { x: 12, y: top - 0.5, z: 12 + 60, yaw: 0, v: 40, vy: 0 }, 300);
  inside = 0;
  for (const [x, y, z] of face.trace) { face.tr.surfaceAt(x, y + 50, z, o, 1.6); if (o.type === 'road' && y > o.h - 0.8 && y < o.h - 0.3) inside++; }
  assert.equal(inside, 0, 'jamais dans la dalle (de face)');
});
test('le deltaplane vire franchement : plus de 1,2 rad/s au volant à fond, dès 10 m/s', () => {
  const turn = (v) => { const g = glide([], { x: 0, y: 200, z: 0, yaw: 0, v, vy: 0 }, 120, { steer: 1 }); const yaw = g.trace[g.trace.length - 1][3]; return Math.abs(yaw) / 1.0; };
  assert.ok(turn(40) > 1.2, 'à 40 m/s : ' + turn(40));
  assert.ok(turn(12) > 0.8, 'à 12 m/s : ' + turn(12));
});

await finish('Tous les tests de la bêta 0.9.2 passent.');
