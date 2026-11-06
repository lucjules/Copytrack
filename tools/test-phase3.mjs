// Tests de la Phase 3 : node tools/test-phase3.mjs   (npm test)
//  - visée par rayon (pièce exacte, point de pose libre), décorations libres, Maj + souris sur l'axe Y ;
//  - anneaux posés sur des cases occupées, hauteur maximale, essai sans arrivée, gravité inversée au départ ;
//  - revêtements : verre fragile (compte à rebours), unités, tapis ±200 km/h, vent, eau / plaque bateau / départ, sable et boue retirés ;
//  - tunnel : parois et toit physiques ; rejeu identique (vérification serveur).
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.min.js';
import { Track, scriptTrack, b64encode } from '../js/track.js';
import {
  PIECES, SURFACES, SURFACE_ORDER, SURFACE_CODES, surfaceAllowed, surfaceRule, paramText, beltSpeed, glassSeconds, TUNNEL_TOP, baseY, flagAllowed,
} from '../js/pieces.js';
import { CarPhysics, CAR } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { GhostRunner, InputRecorder, decodeInputs, quantSteer } from '../js/replay.js';
import { PHYS_VER } from '../js/version.js';
import { replayTime } from '../js/verify.js';
import { Autopilot } from '../js/autopilot.js';
import { pickTileExact, rayToSurface } from '../js/editorPick.js';
import { EditorSession } from '../js/editor.js';
import { DT, CELL, HALF, LEVEL_H, ROAD_TOP, ROAD_HALF, RAIL_W, MAX_LEVEL, SURF_PHYS } from '../js/constants.js';
import { test, finish } from './harness.mjs';

const IDLE = { throttle: false, brake: false, steer: 0 };
const GAS = { throttle: true, brake: false, steer: 0 };
function run(phys, track, seconds, inp = IDLE, each = null) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) { phys.clock = i; phys.step(typeof inp === 'function' ? inp(i) : inp); if (each) each(i); }
}
const strip = (type, n, extra = {}, z0 = 0) => {
  const tr = new Track('t');
  tr.add({ t: 'start', x: 0, z: z0 + n + 1, l: 0, r: 0 });
  for (let i = 0; i < n; i++) tr.add({ t: type, x: 0, z: z0 + n - i, l: 0, r: 0, ...extra });
  return tr;
};

console.log('Hauteur, essai sans arrivée, paramètres du niveau');
test('hauteur maximale : 60 niveaux (près de 290 m), anciens circuits inchangés, code aller-retour', () => {
  assert.equal(MAX_LEVEL, 60);
  const tr = new Track('h');
  const t = tr.add({ t: 'straight', x: 0, z: 0, l: 55, r: 0 });
  assert.equal(t.l, 55); assert.equal(tr.add({ t: 'straight', x: 1, z: 0, l: 99, r: 0 }).l, 60, 'borné à 60');
  assert.ok(Track.inBounds(t)); assert.ok(!Track.inBounds({ ...t, l: 70 }));
  assert.equal(Track.decode(tr.encode()).tiles[0].l, 55);
  assert.ok(tr.bounds().maxY >= 55 * LEVEL_H);
});
test('essai : le départ suffit, l’arrivée n’est exigée que pour jouer ou vérifier', () => {
  const tr = new Track('v'); tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
  assert.deepEqual(tr.validate({ test: true }), []);
  assert.equal(tr.validate().length, 1); assert.match(tr.validate()[0], /Arrivée/);
  assert.equal(new Track('vide').validate({ test: true }).length, 1, 'pas de départ : toujours une erreur');
  const e = Object.create(EditorSession.prototype);
  const calls = [];
  Object.assign(e, { track: tr, exportState: () => ({ code: tr.encode() }), app: { ui: { flash: (m) => calls.push(m) }, audio: { error() {} }, testTrack: (st, sp, v) => calls.push(['test', v]) } });
  e.test(false); assert.deepEqual(calls, [['test', false]], 'essai sans arrivée accepté');
  calls.length = 0; e.test(true); assert.ok(typeof calls[0] === 'string', 'la vérification exige une arrivée');
});
test('flip0 : paramètre du niveau (code, signature, copie) et départ au plafond', () => {
  const tr = scriptTrack('g', 'start S2 finish');
  const sig = tr.signature();
  assert.equal(tr.flip0, false);
  tr.setParams({ flip0: true });
  assert.equal(tr.flip0, true); assert.notEqual(tr.signature(), sig, 'change la course : change la signature');
  const back = Track.decode(tr.encode());
  assert.equal(back.flip0, true); assert.equal(back.signature(), tr.signature()); assert.equal(back.clone().flip0, true);
  assert.equal(JSON.parse(Buffer.from(tr.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).ig, 1);
  const logic = new RaceLogic(tr);
  assert.equal(logic.spawnPoint().gs, -1); assert.equal(logic.respawn.gs, -1, 'la réapparition aussi');
  const phys = new CarPhysics(tr); placeAtStart(phys, logic);
  assert.equal(phys.gSign, -1);
  assert.equal(new RaceLogic(Track.decode(scriptTrack('n', 'start S finish').encode())).spawnPoint().gs, 1, 'par défaut : normal');
  tr.clear(); assert.equal(tr.flip0, false);
});

console.log('Anneaux et superposition');
test('un anneau (pièce) se pose sur une case occupée, et inversement ; deux anneaux ne se superposent pas', () => {
  const tr = new Track('r');
  tr.add({ t: 'straight', x: 3, z: 3, l: 0, r: 0 });
  const ring = { t: 'ring', x: 3, z: 3, l: 0, r: 0 };
  assert.equal(tr.conflicts(Track.normalize(ring)).length, 0);
  tr.add(ring); assert.equal(tr.tiles.length, 2);
  assert.equal(tr.conflicts(Track.normalize({ t: 'straight', x: 3, z: 3, l: 0, r: 0, s: 'ice' })).length, 1, 'la route déjà là gêne (comme avant), l’anneau non');
  assert.deepEqual(tr.conflicts(Track.normalize({ t: 'ring', x: 3, z: 3, l: 1, r: 0 })).map((t) => t.t), ['ring']);
  assert.equal(tr.conflicts(Track.normalize({ t: 'cpRing', x: 3, z: 3, l: 0, r: 0 })).filter((t) => t.t === 'straight').length, 0);
  assert.equal(Track.decode(tr.encode()).tiles.length, 2, 'le code se relit avec les deux pièces');
});
test('anneau turbo en option : valide sur une ligne plate, exclusif du checkpoint aérien, réserve 2 niveaux, relit son code', () => {
  assert.equal(flagAllowed('straight', 'tb'), true); assert.equal(flagAllowed('slope', 'tb'), false); assert.equal(flagAllowed('curve', 'tb'), false);
  const tr = new Track('t');
  const t = tr.add({ t: 'straight', x: 0, z: 0, l: 0, r: 0 });
  assert.ok(tr.toggleFlag(t, 'tb')); assert.equal(t.tb, 1); assert.deepEqual(Track.range(t), [0, 2]);
  assert.equal(tr.toggleFlag(t, 'cp', 2), false, 'pas de checkpoint aérien en plus');
  assert.equal(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, cp: 2, tb: 1 }).tb, 0, 'le checkpoint prime');
  assert.equal(Track.decode(tr.encode()).tiles[0].tb, 1);
  const sig = tr.signature(); tr.toggleFlag(t, 'tb'); assert.notEqual(tr.signature(), sig);
});
test('physique : traverser l’anneau turbo d’une route (option) donne le coup de turbo', () => {
  const tr = strip('straight', 4);
  tr.tiles.find((t) => t.z === 2).tb = 1;
  tr.version++;
  const phys = new CarPhysics(tr);
  const logic = new RaceLogic(tr); placeAtStart(phys, logic);
  let ring = false;
  run(phys, tr, 6, GAS, () => { if (phys.ev.ring) ring = true; });
  assert.ok(ring, 'événement anneau');
});

console.log('Visée par rayon');
function cameraRay(from, to) { return new THREE.Ray(new THREE.Vector3(...from), new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize()); }
test('pickTileExact : la pièce visée, pas celle du niveau choisi ; un pont n’est touché que par un rayon qui le traverse', () => {
  const tr = new Track('p');
  const low = tr.add({ t: 'straight', x: 2, z: 2, l: 0, r: 0 });
  const bridge = tr.add({ t: 'straight', x: 2, z: 2, l: 4, r: 0 });          // même case, 4 niveaux plus haut
  const c = (2 + 0.5) * CELL;
  // Du dessus : le pont cache la route basse.
  assert.equal(pickTileExact(tr, cameraRay([c, 120, c], [c, 0, c])).obj, bridge);
  // De côté, sous le pont : on touche la route basse.
  const side = pickTileExact(tr, cameraRay([c - 60, 6, c], [c, 0.6, c]));
  assert.equal(side.obj, low);
  // Un rayon qui passe dans le vide d'une pièce basse (au-dessus d'elle) ne la touche pas : il atteint la suivante derrière.
  const tr2 = new Track('p2'); const a = tr2.add({ t: 'straight', x: 0, z: 0, l: 0, r: 0 }); const b = tr2.add({ t: 'straight', x: 0, z: 5, l: 0, r: 0 });
  const hit = pickTileExact(tr2, cameraRay([12, 40, 5 * CELL + 12 + 300], [12, 0, 5 * CELL + 12]));
  assert.equal(hit.obj, b); void a;
  assert.equal(pickTileExact(tr2, cameraRay([500, 30, 500], [510, 0, 520])), null);
});
test('rayToSurface : le point de pose suit la route (pont, rampe) ou le sol, à altitude quelconque', () => {
  const tr = new Track('s');
  tr.add({ t: 'straight', x: 2, z: 2, l: 5, r: 0 });
  tr.add({ t: 'slope', x: 6, z: 2, l: 1, r: 0 });
  const c = (2 + 0.5) * CELL;
  const top = rayToSurface(tr, cameraRay([c + 3, 200, c + 4], [c + 3, 0, c + 4]));
  assert.ok(Math.abs(top.y - (5 * LEVEL_H + ROAD_TOP)) < 0.01, 'sur le pont : ' + top.y); assert.ok(top.tile);
  assert.ok(Math.abs(top.x - (c + 3)) < 1e-6 && Math.abs(top.z - (c + 4)) < 1e-6, 'coordonnées flottantes conservées');
  const under = rayToSurface(tr, cameraRay([c - 80, 20, c + 4], [c - 2, 0, c + 4]));            // arrive de côté, sous le pont
  assert.ok(under.y < LEVEL_H, 'le pont au-dessus n’est pas touché : ' + under.y);
  const ramp = rayToSurface(tr, cameraRay([6 * CELL + 12, 90, 2 * CELL + 12], [6 * CELL + 12, 0, 2 * CELL + 12]));
  assert.ok(ramp.y > LEVEL_H + ROAD_TOP + 1 && ramp.y < 2 * LEVEL_H + ROAD_TOP, 'milieu de la rampe : ' + ramp.y);
  const ground = rayToSurface(tr, cameraRay([900, 80, 900], [910, 0, 905]));
  assert.equal(ground.y, 0); assert.equal(ground.tile, null);
  assert.equal(rayToSurface(tr, cameraRay([0, 50, 0], [100, 60, 0])), null, 'un rayon qui monte ne touche rien');
});

// Éditeur minimal (sans DOM) avec une vraie caméra pour viser.
function mkEd(track, tool, { level = 0 } = {}) {
  const cam = new THREE.PerspectiveCamera(55, 1.6, 0.1, 5000);
  const calls = { commit: 0, changed: 0, flash: [] };
  const self = Object.create(EditorSession.prototype);
  Object.defineProperty(self, 'menuOpen', { value: false });
  Object.assign(self, {
    track, tool, level, rot: 0, hover: null, surfParam: {}, opts: { v: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0, th: 0 }, deco: { snap: 0, rot: 0, scale: 1, color: 0, url: '', ph: 0, dy: 0 },
    camera: cam, ndc: new THREE.Vector2(0, 0), raycaster: new THREE.Raycaster(), pitch: 0.9, dist: 100, target: new THREE.Vector3(),
    app: { camera: cam, renderer: { domElement: { getBoundingClientRect: () => ({ height: 800 }) } }, ui: { flash: (m) => calls.flash.push(m) }, audio: { place() {}, error() {} } },
    inspector: { sel: null, gizmoBusy: false, select(k, o) { this.sel = { kind: k, obj: o }; } },
    _commit: () => calls.commit++, _changed: () => calls.changed++, _refreshDeco() {}, _snapPos: (x, z) => [x, z],
  });
  const look = (from, to) => { cam.position.set(...from); cam.lookAt(new THREE.Vector3(...to)); cam.updateMatrixWorld(true); self.raycaster.setFromCamera(self.ndc, cam); };
  return { self, calls, look, cam };
}
test('revêtement : la pièce visée est peinte, même si le niveau choisi (Y) est autre et que la case survolée au sol en désigne une autre', () => {
  const tr = new Track('e');
  const target = tr.add({ t: 'straight', x: 4, z: 4, l: 6, r: 0 });
  const decoy = tr.add({ t: 'straight', x: 8, z: 4, l: 0, r: 0 });
  const { self, look } = mkEd(tr, 'surf:ice', { level: 0 });
  look([4 * CELL + 12, 160, 4 * CELL + 12 + 90], [4 * CELL + 12, 6 * LEVEL_H + ROAD_TOP, 4 * CELL + 12]);
  self.hover = { x: 8 * CELL + 12, z: 4 * CELL + 12, cx: 8, cz: 4 };                    // la case « au sol » désigne l'autre pièce
  assert.equal(self._targetTile(), target);
  self._act(false);
  assert.equal(target.s, 'ice'); assert.equal(decoy.s, '');
});
test('option : appliquée à la pièce visée (mod:), pot de peinture : zone de la pièce visée', () => {
  const tr = new Track('e');
  const a = tr.add({ t: 'straight', x: 4, z: 4, l: 3, r: 0 }); const b = tr.add({ t: 'straight', x: 4, z: 3, l: 3, r: 0 });
  const { self, look } = mkEd(tr, 'mod:th2', { level: 9 });
  look([4 * CELL + 12, 120, 4 * CELL + 12 + 70], [4 * CELL + 12, 3 * LEVEL_H + ROAD_TOP, 4 * CELL + 12]);
  self._act(false);
  assert.equal(a.th, 2); assert.equal(b.th, 0);
});
test('sans rayon exploitable, repli sur la case visée au niveau courant (comportement d’avant)', () => {
  const tr = new Track('e'); const t = tr.add({ t: 'straight', x: 1, z: 1, l: 0, r: 0 });
  const { self } = mkEd(tr, 'surf:ice');
  self.ndc.set(9, 9); self.hover = { x: 36, z: 36, cx: 1, cz: 1 };
  assert.equal(self._targetTile(), t);
  delete self.ndc; assert.equal(self._targetTile(), t, 'même sans ndc (tests, tactile)');
});

console.log('Décorations libres et Maj + souris');
test('décoration : posée là où le rayon touche (route à altitude quelconque, sol), coordonnées flottantes, plus de niveau imposé', () => {
  const tr = new Track('d');
  tr.add({ t: 'straight', x: 2, z: 2, l: 7, r: 0 });
  const { self, look } = mkEd(tr, 'deco:tree', { level: 0 });
  look([2 * CELL + 14.37, 220, 2 * CELL + 19.91 + 60], [2 * CELL + 14.37, 7 * LEVEL_H + ROAD_TOP, 2 * CELL + 19.91]);
  const d = self._decoAt();
  assert.ok(Math.abs(d.y - (7 * LEVEL_H + ROAD_TOP)) < 0.05, 'posée sur la route du niveau 7 : y = ' + d.y);
  assert.ok(d.x % 1 !== 0 || d.z % 1 !== 0, 'flottant, pas calé sur la grille : ' + d.x + ', ' + d.z);
  self.deco.dy = 2.5;
  assert.ok(Math.abs(self._decoAt().y - d.y - 2.5) < 1e-9, 'décalage vertical');
  self.deco.dy = 0;
  look([700, 90, 700], [650, 0, 640]);
  assert.equal(self._decoAt().y, 0, 'au sol');
  self._placeDeco();
  assert.equal(tr.decos.length, 1); assert.ok(Math.abs(tr.decos[0].y) < 1e-6);
  assert.ok(Math.abs(tr.decos[0].x - self._decoAt().x) < 1e-9);
  const hover = { x: 100.5, z: 77.25, cx: 4, cz: 3 };
  self.ndc.set(9, 9); self.hover = hover; assert.deepEqual([self._decoAt().x, self._decoAt().z], [100.5, 77.25], 'sans rayon : le plan du niveau courant');
});
test('Maj + souris (outil Inspecter) : la pièce monte et descend par demi-niveaux, un seul pas d’historique à la fin', () => {
  const tr = new Track('y'); const t = tr.add({ t: 'straight', x: 3, z: 3, l: 2, r: 0 });
  const { self, calls } = mkEd(tr, 'inspect');
  self.inspector.select('tile', t);
  self.cam = null;
  self.app.camera.position.set(3 * CELL, 120, 3 * CELL + 120); self.app.camera.updateMatrixWorld(true);
  assert.equal(self._shiftY(0), false, 'pas de mouvement : rien');
  let moved = 0;
  for (let i = 0; i < 400 && t.l < 8; i++) { self._shiftY(-6); moved++; }       // souris vers le haut
  assert.ok(t.l >= 8, 'monté : ' + t.l); assert.equal(t.l % 0.5, 0);
  assert.equal(calls.commit, 0, 'pas d’historique en cours de geste');
  for (let i = 0; i < 400 && t.l > 1; i++) self._shiftY(6);
  assert.ok(t.l <= 1 && t.l >= 0, 'redescendu : ' + t.l);
  self._endShiftY(); assert.equal(calls.commit, 1);
  assert.equal(t.x, 3); assert.equal(t.z, 3, 'axe Y seulement');
  assert.equal(tr.tilesAt(3, 3)[0], t, 'toujours indexée sur la case');
  for (let i = 0; i < 600; i++) self._shiftY(-8);
  assert.ok(t.l <= MAX_LEVEL, 'bornée à la hauteur maximale');
  // Pièce bloquée : pas de passage à travers une autre.
  assert.ok(self._applyTilePatch(t, { l: 10 }));
  const o = tr.add({ t: 'straight', x: 3, z: 3, l: 13, r: 0 });
  self._yAcc = 0;
  for (let i = 0; i < 100; i++) self._shiftY(-8);
  assert.ok(t.l < o.l, 'ne traverse pas la pièce du dessus'); void o;
});
test('Maj + souris : une décoration monte et descend librement ; outil Décoration : décalage de pose', () => {
  const tr = new Track('y'); const d = tr.addDeco({ k: 'tree', x: 40, y: 3, z: 40, ry: 0, s: 1, c: 0 });
  const { self, calls } = mkEd(tr, 'inspect');
  self.inspector.select('deco', d);
  self.app.camera.position.set(40, 60, 100); self.app.camera.updateMatrixWorld(true);
  const y0 = d.y;
  self._shiftY(-20); assert.ok(d.y > y0); const y1 = d.y;
  self._shiftY(40); assert.ok(d.y < y1);
  assert.equal(d.x, 40); assert.equal(d.z, 40);
  self._endShiftY(); assert.equal(calls.commit, 1);
  self.tool = 'deco:tree'; self.target.set(40, 0, 40);
  self._shiftY(-30); assert.ok(self.deco.dy > 0, 'décalage de pose : ' + self.deco.dy);
  self.tool = 'straight'; assert.equal(self._shiftY(-30), false, 'les autres outils gardent leurs gestes');
});

console.log('Revêtements : unités et réglages');
test('unités réelles : km/h, m/s², m, s (et % pour les réglages sans unité physique)', () => {
  assert.equal(paramText('conveyor', 1), '-200 km/h'); assert.equal(paramText('conveyor', 101), '0 km/h'); assert.equal(paramText('conveyor', 201), '+200 km/h');
  assert.equal(paramText('glass', 150), '1,5 s'); assert.equal(paramText('glass', 30), '0,3 s'); assert.equal(paramText('glass', 500), '5 s');
  assert.equal(paramText('boost', 100), 'jusqu\'à 403 km/h'); assert.match(paramText('bounce', 100), /^3,9 m$/); assert.equal(paramText('gravity', 40), '10 m/s²');
  assert.equal(paramText('wind', 100), 'nul'); assert.equal(paramText('wind', 150), '→ 27 m/s²'); assert.equal(paramText('wind', 50), '← 27 m/s²');
  assert.match(paramText('spring', 150), /^→ \d+ km\/h$/); assert.equal(paramText('ice', 100), '100 %');
  assert.equal(paramText('', 0), ''); assert.equal(paramText('magnet', 0), '');
  for (const s of SURFACE_ORDER.filter((x) => SURFACES[x] && SURFACES[x].def != null)) {
    const S = SURFACES[s];
    for (const p of [S.min, S.def, S.max]) assert.ok(/\d/.test(paramText(s, p)) || paramText(s, p) === 'nul' || paramText(s, p) === 'nulle', s + ' ' + p);
  }
});
test('tapis roulant : de -200 à +200 km/h', () => {
  assert.equal(SURFACES.conveyor.min, 1); assert.equal(SURFACES.conveyor.max, 201);
  assert.ok(Math.abs(beltSpeed(201) * 3.6 - 200) < 1e-9); assert.ok(Math.abs(beltSpeed(1) * 3.6 + 200) < 1e-9); assert.equal(beltSpeed(101), 0);
  assert.equal(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, s: 'conveyor', p: 9999 }).p, 201);
  assert.equal(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, s: 'conveyor', p: 1 }).p, 1);
  // La voiture posée sur un tapis est emportée dans un sens ou dans l'autre.
  const speedOn = (p) => {
    const tr = strip('straight', 6, { s: 'conveyor', p });
    const phys = new CarPhysics(tr); phys.place(12, ROAD_TOP + 0.01, 3 * CELL + 12, 0, 1);
    run(phys, tr, 4);
    return -(phys.pos.z - (3 * CELL + 12));                    // avancée vers le nord (-z), en m
  };
  const fwd = speedOn(201), back = speedOn(1), none = speedOn(101);
  assert.ok(fwd > 60, 'vers l’avant : ' + fwd); assert.ok(back < -60, 'vers l’arrière : ' + back); assert.ok(Math.abs(none) < 3, 'tapis à l’arrêt : ' + none);
});
test('vent : l’impulsion est plus forte (54 m/s² à pleine force, était 36)', () => {
  assert.equal(CAR.wind, 54); assert.equal(SURF_PHYS.wind, 54);
  const push = (wind) => {
    const tr = strip('straight', 6, { s: 'wind', p: 200 });
    const phys = new CarPhysics(tr); phys.place(12, ROAD_TOP + 0.01, 3 * CELL + 12, 0, 1);
    const saved = CAR.wind; CAR.wind = wind;
    try { run(phys, tr, 0.6); } finally { CAR.wind = saved; }
    return Math.abs(phys.pos.x - 12) + Math.abs(phys.vel.x);
  };
  assert.ok(push(54) > push(36) * 1.2, `${push(54)} vs ${push(36)}`);
});
test('sable et boue supprimés : plus proposés ; leurs numéros sérialisés restent réservés ; les anciens circuits se lisent avec une route normale', () => {
  assert.ok(!SURFACES.sand && !SURFACES.mud); assert.ok(!SURFACE_ORDER.includes('sand') && !SURFACE_ORDER.includes('mud'));
  assert.equal(SURFACE_CODES[4], 'sand'); assert.equal(SURFACE_CODES[6], 'mud'); assert.equal(SURFACE_CODES.indexOf('drift'), 7, 'les autres numéros n’ont pas bougé');
  const data = { v: 3, n: 'Vieux', a: '', d: 'desert', t: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 4, 100, 0, 0, 0, -2, 0, 0, 6, 100, 0, 8, 0, -3, 0, 0, 0, 0, 0] };
  const tr = Track.decode('SHW3:' + b64encode(JSON.stringify(data)));
  assert.deepEqual(tr.tiles.map((t) => [t.t, t.s]), [['start', ''], ['straight', ''], ['straight', ''], ['finish', '']]);
  assert.throws(() => scriptTrack('x', 'start S2.s finish'), /Revêtement inconnu|interdit/);
  assert.equal(surfaceAllowed('straight', 'sand'), false);
});

console.log('Eau, plaque bateau, départ');
test('compatibilité : l’eau va sur le Départ, pas sur l’Arrivée ni une bifurcation ; la plaque bateau est posée sur l’eau', () => {
  assert.equal(surfaceAllowed('start', 'water'), true); assert.equal(surfaceAllowed('finish', 'water'), false);
  assert.equal(surfaceAllowed('fork', 'water'), false); assert.equal(surfaceAllowed('checkpoint', 'water'), true); assert.equal(surfaceAllowed('straight', 'water'), true);
  assert.equal(surfaceRule(PIECES.start, SURFACES.water, 'water'), '');
  assert.match(surfaceRule(PIECES.finish, SURFACES.water, 'water'), /arrivée/);
  assert.equal(Track.normalize({ t: 'start', x: 0, z: 0, l: 0, r: 0, s: 'water' }).s, 'water');
  const tr = new Track('w'); tr.add({ t: 'straight', x: 0, z: 0, l: 0, r: 0, s: 'boat' }); tr.add({ t: 'straight', x: 1, z: 0, l: 0, r: 0, s: 'water' }); tr.add({ t: 'straight', x: 2, z: 0, l: 0, r: 0 });
  const o = {};
  tr.surfaceAt(CELL + HALF, 5, HALF, o); const hw = o.h; tr.surfaceAt(2 * CELL + HALF, 5, HALF, o); const hr = o.h;
  // 0.9.2 : la plaque bateau est une très légère montée de l'eau (entrée au niveau de l'eau) vers le sol (sortie au niveau de la route).
  tr.surfaceAt(HALF, 5, HALF + HALF - 0.1, o); const hIn = o.h; tr.surfaceAt(HALF, 5, 0.1, o); const hOut = o.h;
  assert.ok(Math.abs(hIn - hw) < 0.02 && Math.abs(hOut - hr) < 0.02 && hw < hr, 'rampe : eau → route (' + [hIn, hw, hOut, hr].join(', ') + ')');
});
test('un circuit peut commencer sur l’eau, en bateau : le bateau flotte indéfiniment', () => {
  const tr = scriptTrack('eau', 'start S2 finish');
  tr.tiles.find((t) => t.t === 'start').s = 'water';
  tr.setParams({ veh0: 'boat' });
  const phys = new CarPhysics(tr); const logic = new RaceLogic(tr); placeAtStart(phys, logic);
  let sank = false;
  run(phys, tr, 6, IDLE, () => { if (phys.ev.sink) sank = true; });
  assert.ok(!sank); assert.equal(phys.surfMod, 'water'); assert.equal(phys.vehicle, 'boat');
});
test('plaque bateau : le bateau y est à l’aise (comme sur l’eau), la voiture qui la touche devient bateau et ne coule pas', () => {
  const topSpeed = (s) => {
    const tr = strip('straight', 6, { s }); const phys = new CarPhysics(tr); phys.place(12, ROAD_TOP + 0.01, 3 * CELL + 12, 0, 1); phys.vehicle = 'boat'; phys.plateLock = s === 'boat' ? 'boat' : '';      // déjà bateau : la plaque ne le retransforme pas
    phys.graceT = 0; run(phys, tr, 3, GAS); return phys.speed;
  };
  const onBoat = topSpeed('boat'), onWater = topSpeed('water'), onRoad = topSpeed('');
  assert.ok(Math.abs(onBoat - onWater) < 1, `${onBoat} vs ${onWater}`); assert.ok(onBoat > onRoad * 1.5, `${onBoat} vs route ${onRoad}`);
  const tr = new Track('b'); tr.add({ t: 'start', x: 0, z: 7, l: 0, r: 0 });
  for (let z = 6; z >= 0; z--) tr.add({ t: 'straight', x: 0, z, l: 0, r: 0, s: z === 4 ? 'boat' : z < 4 ? 'water' : '' });
  const phys = new CarPhysics(tr); const logic = new RaceLogic(tr); placeAtStart(phys, logic);
  let sank = false;
  run(phys, tr, 9, GAS, () => { if (phys.ev.sink) sank = true; });
  assert.equal(phys.vehicle, 'boat'); assert.ok(!sank, 'pas de noyade'); assert.ok(phys.pos.z < 3 * CELL, 'avance sur l’eau');
});

console.log('Verre fragile : compte à rebours');
const glassTrack = (p) => { const tr = strip('straight', 4, {}); const g = tr.tiles.find((t) => t.z === 3); g.s = 'glass'; g.p = p; tr.version++; return { tr, g }; };
test('plus de vitesse mini : une voiture ARRÊTÉE sur le verre le brise après sa durée (p centièmes de s), sans noyade ni réapparition', () => {
  for (const [p, secs] of [[100, 1], [300, 3]]) {
    const { tr, g } = glassTrack(p);
    const phys = new CarPhysics(tr); phys.place(12, ROAD_TOP + 0.01, 3 * CELL + 12, 0, 1);
    let t0 = null, tBreak = null, sink = false;
    run(phys, tr, 6, IDLE, (i) => {
      if (phys.graceT <= 0 && t0 === null) t0 = i * DT;
      if (phys.ev.sink) sink = true;
      if (phys.ev.glass && tBreak === null) tBreak = i * DT;
    });
    assert.ok(tBreak !== null, 'la dalle cède (p=' + p + ')');
    assert.ok(Math.abs(tBreak - t0 - secs) < 0.05, `p=${p} : durée ${tBreak - t0} s, attendu ${secs} s`);
    assert.ok(phys.broken.has(g)); assert.ok(!sink, 'pas de mort : la voiture tombe'); assert.ok(phys.pos.y < 0.2 || !phys.grounded, 'elle tombe');
    assert.equal(glassSeconds(p), secs);
  }
});
test('la dalle brisée perd ses collisions, pas les voisines ; seule la durée de contact compte, pas la vitesse', () => {
  const { tr, g } = glassTrack(100);
  const out = {};
  tr.surfaceAt(12, 5, 3 * CELL + 12, out, 1.6, null); assert.equal(out.tile, g);
  const broken = new Set([g]);
  tr.surfaceAt(12, 5, 3 * CELL + 12, out, 1.6, broken); assert.equal(out.type, 'ground', 'plus de collision');
  tr.surfaceAt(12, 5, 2 * CELL + 12, out, 1.6, broken); assert.equal(out.type, 'road', 'la voisine est intacte');
  // Pas de règle de vitesse, seulement du temps : à pleine vitesse la voiture reste moins d'une seconde sur chaque dalle (1 s : intacte),
  // mais avec une dalle plus fragile (0,3 s) le contact de 0,45 s suffit, même à 200 km/h.
  const crossing = (p) => {
    const tr2 = strip('straight', 12, { s: 'glass', p });
    const phys = new CarPhysics(tr2); const logic = new RaceLogic(tr2); placeAtStart(phys, logic);
    phys.vel.z = -55; phys.fwdSpeed = 55; phys.graceT = 0;          // 0.9.4 : le moteur monte lentement, on lance la voiture déjà vite
    let broke = 0, vmax = 0;
    run(phys, tr2, 8, GAS, () => { vmax = Math.max(vmax, phys.speed); if (phys.ev.glass) broke++; });
    return { broke, vmax, size: phys.broken.size };
  };
  const sturdy = crossing(100), fragile = crossing(30);
  assert.ok(sturdy.vmax > 40 && sturdy.broke === 0, 'à vitesse, la dalle de 1 s ne cède pas : ' + JSON.stringify(sturdy));
  assert.ok(fragile.broke >= 1 && fragile.size === fragile.broke, 'la dalle de 0,3 s cède même à vitesse : ' + JSON.stringify(fragile));
});
test('la dalle brisée n’est restaurée qu’au (re)départ : place() (respawn, retour au checkpoint) la remet, et le compte repart de zéro', () => {
  const { tr, g } = glassTrack(100);
  const phys = new CarPhysics(tr); phys.place(12, ROAD_TOP + 0.01, 3 * CELL + 12, 0, 1);
  run(phys, tr, 4);
  assert.ok(phys.broken.has(g));
  run(phys, tr, 1);
  assert.ok(phys.broken.has(g), 'toujours brisée tant qu’on ne repart pas');
  phys.place(12, ROAD_TOP + 0.01, 3 * CELL + 12, 0, 1);
  assert.equal(phys.broken.size, 0); assert.equal(phys.glassTime.size, 0);
  assert.equal(phys.surfTile, g, 'la dalle porte de nouveau la voiture');
  run(phys, tr, 0.9 + 1.5);
  assert.ok(!phys.broken.has(g), 'compte repartie de zéro (grâce de 1,5 s puis 1 s)');
});
test('le verre se brise aussi sous un looping (ruban) : la voiture se détache et tombe', () => {
  const tr = scriptTrack('lv', 'start S4 O S3 finish');
  const lp = tr.tiles.find((t) => t.t === 'loop'); lp.s = 'glass'; lp.p = 30; tr.version++;
  const rec = new CarPhysics(tr); const logic = new RaceLogic(tr); placeAtStart(rec, logic);
  const bot = new Autopilot(tr.path); bot.reset(rec);
  let broke = false;
  for (let i = 0; i < 20 / DT && !broke; i++) { rec.clock = i; rec.step(bot.control(rec)); if (rec.ev.glass) broke = true; }
  assert.ok(broke, 'le verre du looping cède (0,3 s)');
  assert.ok(rec.broken.has(lp)); assert.ok(!rec.rib, 'plus guidée par le ruban');
});

console.log('Tunnel : parois et toit');
test('sans tunnel la voiture saute par-dessus la bordure ; avec le tunnel elle reste dedans (même lancée haut et fort)', () => {
  const lateral = (tn) => {
    const tr = strip('straight', 8, { tn });
    const phys = new CarPhysics(tr); phys.place(CELL / 2, ROAD_TOP + 0.01, 4 * CELL + CELL / 2, 0, 1);
    phys.graceT = 0;
    phys.vel.x = 30; phys.vel.y = 10; phys.grounded = false;
    let maxD = 0, maxY = -1;
    run(phys, tr, 2.5, IDLE, () => { maxD = Math.max(maxD, Math.abs(phys.pos.x - CELL / 2)); maxY = Math.max(maxY, phys.pos.y); });
    return { maxD, maxY, x: phys.pos.x };
  };
  const open = lateral(0), closed = lateral(1);
  assert.ok(open.maxD > ROAD_HALF + RAIL_W + 3, 'sans tunnel : sortie par-dessus la bordure (' + open.maxD.toFixed(1) + ')');
  assert.ok(closed.maxD <= ROAD_HALF + RAIL_W + 0.6, 'avec tunnel : retenue par la paroi (' + closed.maxD.toFixed(1) + ')');
});
test('toit du tunnel : une voiture lancée vers le haut reste sous la voûte ; celle qui survole le tunnel passe au-dessus', () => {
  const tr = strip('straight', 8, { tn: 1 });
  const phys = new CarPhysics(tr); phys.place(12, ROAD_TOP + 0.01, 4 * CELL + 12, 0, 1); phys.graceT = 0;
  phys.vel.y = 40; phys.grounded = false;
  let maxY = 0;
  run(phys, tr, 2, IDLE, () => { maxY = Math.max(maxY, phys.pos.y + CAR.height); });
  assert.ok(maxY <= ROAD_TOP + TUNNEL_TOP + 0.01, 'sous le toit : ' + maxY);
  const over = new CarPhysics(tr); over.place(12, 60, 4 * CELL + 12, 0, 1); over.pos.y = 60; over.prev.y = 60; over.grounded = false; over.vel.y = 0; over.graceT = 0;
  let minY = 1e9;
  run(over, tr, 0.35, IDLE, () => { minY = Math.min(minY, over.pos.y); });
  assert.ok(minY > ROAD_TOP + TUNNEL_TOP, 'passe au-dessus : ' + minY);
});
test('tunnel sans bordures : les parois du tunnel existent quand même', () => {
  const tr = strip('straight', 8, { tn: 1, nb: 1 });
  const phys = new CarPhysics(tr); phys.place(12, ROAD_TOP + 0.01, 4 * CELL + 12, 0, 1); phys.graceT = 0;
  phys.vel.x = 25; run(phys, tr, 2);
  assert.ok(Math.abs(phys.pos.x - 12) <= ROAD_HALF + RAIL_W + 0.6, 'x = ' + phys.pos.x);
});

console.log('Rejeu identique (vérification serveur) et version');
test('PHYS_VER 25 ; un circuit avec verre, tapis, vent, eau et tunnel est rejoué à l’identique par la vérification', () => {
  assert.equal(PHYS_VER, 25);
  const tr = scriptTrack('mix', 'start S2 S.v S2.t137 S2.w150 S.a2 R S2# S2.a L S2 finish');
  // Enregistre une course du pilote automatique, puis la rejoue comme le fait le serveur.
  const phys = new CarPhysics(tr), logic = new RaceLogic(tr); placeAtStart(phys, logic);
  const bot = new Autopilot(tr.path); bot.reset(phys);
  const rec = new InputRecorder();
  let finished = null;
  for (let i = 0; i < 90 / DT && finished === null; i++) {
    const inp = bot.control(phys);
    inp.steer = quantSteer(inp.steer);                      // comme en course : la commande est quantifiée avant d'agir
    rec.push(inp, false);
    phys.clock = logic.steps;
    phys.step(inp);
    const ev = logic.update(phys);
    if (ev && ev.type === 'finish') finished = logic.time;
  }
  assert.ok(finished !== null, 'le pilote automatique termine');
  const again = replayTime(tr, rec.encode());
  assert.ok(again !== null && Math.abs(again - finished) < 0.0005, `rejeu ${again} vs course ${finished}`);
  void GhostRunner; void decodeInputs;
});

await finish('Tous les tests de la Phase 3 passent.');
