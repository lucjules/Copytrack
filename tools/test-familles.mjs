// Familles de pièces, schéma JSON du circuit, courbes, options, mouvements, revêtements : node tools/test-familles.mjs   (npm test)
//  - familles et caractéristiques de pièces ; anciens codes toujours lisibles ; nouveaux champs optionnels ;
//  - géométrie des pièces paramétriques (courbes montantes, très grand virage, loopings ×2 / ×3) ;
//  - options : checkpoint (portique / anneau), thème, couleurs, 2e revêtement de bifurcation ;
//  - pièces mobiles réglables (ascenseur, glissière, rotation) ;
//  - conduite du pilote automatique sur un circuit qui utilise les nouvelles pièces.
import assert from 'node:assert/strict';
import { GeoBuilder } from '../js/geo.js';
import { buildTileInto, stripsFor, styleFor } from '../js/trackGeometry.js';
import { Track, scriptTrack, b64encode } from '../js/track.js';
import {
  PIECES, PIECE_ORDER, sampleLocal, baseY, flagAllowed, cpKind, moverParams, clampMover, profH, profD,
} from '../js/pieces.js';
import { FAMILIES, FAMILY_ORDER, familyOf, resolve, validValues, withTrait, isFamilyMember } from '../js/families.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { Autopilot } from '../js/autopilot.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { DT, CELL, LEVEL_H, HALF, ROAD_HALF } from '../js/constants.js';
import { arrowPose, retypePlacement, traitsOf } from '../js/tileInfo.js';
import { EditorSession } from '../js/editor.js';
import { armOption as armedOptions } from '../js/pieces.js';
import { test, finish } from './harness.mjs';

const tile = (o) => Track.normalize({ x: 0, z: 0, l: 0, r: 0, ...o });

console.log('Familles et caractéristiques');
test('chaque pièce de famille existe, une seule fois, et se résout vers elle-même', () => {
  const seen = new Set();
  for (const fam of FAMILY_ORDER) {
    const F = FAMILIES[fam];
    for (const [type, tr] of Object.entries(F.members)) {
      assert.ok(PIECES[type] && PIECE_ORDER.includes(type), type);
      assert.ok(!seen.has(type), 'doublon ' + type); seen.add(type);
      assert.equal(resolve(fam, tr), type);
      assert.deepEqual(familyOf(type), { fam, traits: tr });
      assert.ok(F.traits.every((t) => t.values.some(([v]) => v === tr[t.id])), type + ' : valeur de caractéristique inconnue');
    }
  }
  assert.ok(isFamilyMember('slope') && isFamilyMember('steep') && isFamilyMember('gentle'));
});
test('Ligne droite : inclinaison plat / ½ / 1 / 2 / 4, montée ou descente ; les anciennes Pente, Pente douce et Tremplin en font partie', () => {
  const m = FAMILIES.straight.members;
  assert.equal(m.straight.incl, '0'); assert.equal(m.gentle.incl, '0.5'); assert.equal(m.slope.incl, '1'); assert.equal(m.steep.incl, '2'); assert.equal(m.steep4.incl, '4');
  assert.deepEqual([m.dn05.incl, m.dn1.incl, m.dn2.incl, m.dn4.incl], ['-0.5', '-1', '-2', '-4'], '0.9.3 : pentes descendantes');
  for (const [type, tr] of Object.entries(m)) assert.equal(PIECES[type].rise, +tr.incl, type);
});
test('Virages : serré / grand / très grand plat et relevé ; une combinaison qui n’existe pas est repoussée', () => {
  assert.equal(PIECES.hugecurve.size, 3); assert.equal(PIECES.hugecurve.rise, 0); assert.equal(PIECES.hugecurve.kind, 'arc');
  const flat = { incl: '0', dir: 'R' };
  assert.equal(resolve('turn', { size: 'l', bank: '0', ...flat }), 'hugecurve');
  assert.equal(resolve('turn', { size: 's', bank: '1', ...flat }), null);
  assert.deepEqual([...validValues('turn', { size: 's', bank: '0', ...flat }, 'bank')], ['0']);
  assert.equal(withTrait('turn', { size: 's', bank: '0', ...flat }, 'bank', '1'), 'bank');                      // « relevé » : on prend le plus proche
  assert.equal(withTrait('turn', { size: 'l', bank: '1', ...flat }, 'size', 's'), 'curve');
  // 0.9.2 : l'Inclinaison du virage fonctionne comme celle de la ligne droite (plat, ½, 1, 2, 4) ; le sens ne compte que s'il monte.
  assert.deepEqual(FAMILIES.turn.traits.find((t) => t.id === 'incl').values.map((v) => v[0]), FAMILIES.straight.traits[0].values.map((v) => v[0]));
  assert.equal(resolve('turn', { size: 'm', bank: '0', incl: '2', dir: 'L' }), 'cvBigL2');
  assert.deepEqual([...validValues('turn', { size: 's', bank: '0', incl: '0', dir: 'R' }, 'dir')], ['R']);
  assert.deepEqual([...validValues('turn', { size: 's', bank: '0', incl: '1', dir: 'R' }, 'dir')].sort(), ['L', 'R']);
});
test('Looping : orientation × taille × 1 à 3 boucles = 12 pièces, toutes à lane ≥ 12·boucles', () => {
  const F = FAMILIES.loop;
  assert.equal(Object.keys(F.members).length, 12);
  for (const [type, tr] of Object.entries(F.members)) {
    const P = PIECES[type];
    assert.equal(P.turns, +tr.turns, type);
    assert.equal(P.mirror, tr.dir === 'R' ? 1 : -1, type);
    assert.equal(P.R, (tr.size === 'g' ? 18 : 12) * (CELL / 24), type);
    assert.ok(P.lane >= HALF * P.turns || P.turns === 1, type);
    assert.ok(P.size * HALF >= P.lane + 10, `${type} : empreinte trop petite`);
  }
  assert.equal(PIECES.loopTriple.size, 4);
});
test('Virage incliné : 16 pièces montantes + 16 descendantes (droite / gauche × serré / grand × ½, 1, 2, 4), rise = inclinaison signée', () => {
  for (const sgn of [1, -1]) {
    const inc = Object.entries(FAMILIES.turn.members).filter(([, tr]) => Math.sign(+tr.incl) === sgn);
    assert.equal(inc.length, 16, sgn > 0 ? 'montants' : 'descendants');
    for (const [type, tr] of inc) {
      assert.equal(PIECES[type].kind, 'arc'); assert.equal(PIECES[type].rise, +tr.incl);
      assert.equal(PIECES[type].size, tr.size === 's' ? 1 : 2); assert.equal(PIECES[type].mirror === -1, tr.dir === 'L');
    }
  }
});
test('Courbe (0.9.3) : 20 raccords de pente (montée / descente × début doux, fin douce, S), profil h = rise·H(t), tangentes aux extrémités', () => {
  const ms = Object.entries(FAMILIES.courbe.members);
  assert.equal(ms.length, 20);
  assert.deepEqual(ms.slice(0, 4).map(([k]) => k), ['crv05', 'crv1', 'crv2', 'crv4'], 'les anciennes Courbes (0.9.2) sont le « début doux » montant');
  for (const [type, tr] of ms) {
    const P = PIECES[type]; assert.equal(P.kind, 'line'); assert.equal(P.rise, (tr.sens === 'd' ? -1 : 1) * +tr.incl, type);
    assert.equal(P.prof || 'i', tr.prof, type);
    const t = tile({ type, t: type, l: 4 }), o = {}, half = P.size * HALF, sg = Math.sign(P.rise);
    let prevH = -Infinity;
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      sampleLocal(t, 0, half - 2 * half * u, o);
      assert.ok(Math.abs(o.h - (baseY(t) + P.rise * LEVEL_H * profH(P, u))) < 1e-6, type + ' : profil');
      assert.ok(sg * o.h >= prevH - 1e-9, type + ' : monotone'); prevH = sg * o.h;
      assert.ok(Math.abs(Math.hypot(o.nx, o.ny, o.nz) - 1) < 1e-9, 'normale unitaire');
    }
    // Pentes d'extrémité (tan de l'inclinaison) : 0 là où le raccord est « doux », 2·rise / longueur de l'autre côté.
    const slopeAt = (u) => { sampleLocal(t, 0, half - 2 * half * u, o); return -o.nz / o.ny * 1; };
    const full = 2 * Math.abs(P.rise) * LEVEL_H / (2 * half);
    const e0 = Math.abs(slopeAt(0)), e1 = Math.abs(slopeAt(1));
    const want0 = tr.prof === 'o' ? full : 0, want1 = tr.prof === 'i' ? full : 0;
    assert.ok(Math.abs(e0 - want0) < 1e-9 && Math.abs(e1 - want1) < 1e-9, `${type} : pentes d'extrémité ${e0.toFixed(3)} / ${e1.toFixed(3)} (attendu ${want0.toFixed(3)} / ${want1.toFixed(3)})`);
    // Dérivée analytique cohérente avec la différence finie.
    for (const u of [0.2, 0.5, 0.8]) {
      const d = (profH(P, u + 1e-5) - profH(P, u - 1e-5)) / 2e-5;
      assert.ok(Math.abs(d - profD(P, u)) < 1e-4, type + ' : dérivée');
    }
  }
  // Raccords exacts : un début doux de ½ / 1 / 2 se raccorde à une droite de pente 1 / 2 / 4 (même pente de sortie), la fin douce la ramène à plat.
  for (const [soft, line, rise] of [['crv05', 'slope', 1], ['crv1', 'steep', 2], ['crv2', 'steep4', 4]]) {
    const t = tile({ t: soft }), q = tile({ t: line }), o = {}, w = {};
    sampleLocal(t, 0, -HALF + 1e-9, o); sampleLocal(q, 0, 0, w);
    assert.ok(Math.abs(Math.abs(o.nz / o.ny) - Math.abs(w.nz / w.ny)) < 1e-6, `${soft} → ${line}`);
    assert.equal(PIECES[line].rise, rise);
  }
});
test('PIECE_ORDER : les anciens index n’ont pas bougé (sérialisation)', () => {
  const OLD = ['straight', 'curve', 'bigcurve', 'slope', 'steep', 'boost', 'checkpoint', 'start', 'finish', 'platform', 'ice', 'loop', 'loopL',
    'loopBig', 'loopBigL', 'loopDouble', 'loopDoubleL', 'twist', 'ramp90', 'wall', 'crest90', 'bank', 'bankBig', 'halfpipe', 'tube', 'cork', 'corkL', 'fork', 'forkL', 'ring', 'cpRing', 'cpCurve', 'gentle', 'tubeIn', 'tubeMid'];
  assert.deepEqual(PIECE_ORDER.slice(0, OLD.length), OLD);
  assert.equal(new Set(PIECE_ORDER).size, PIECE_ORDER.length);
});
test('toutes les pièces ont un libellé unique', () => {
  const labels = Object.values(PIECES).map((p) => p.label);
  assert.equal(new Set(labels).size, labels.length);
});

console.log('Schéma du circuit (JSON)');
test('un ancien code v3 (sans champs de la Phase 2) se lit à l’identique et se ré-encode en v3', () => {
  const data = { v: 3, n: 'Ancien', a: '', d: 'desert', t: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 2, 100, 0, 3, 0, -2, 0, 0, 0, 0, 0, 8, 0, -3, 0, 0, 0, 0, 0] };
  const tr = Track.decode('SHW3:' + b64encode(JSON.stringify(data)));
  assert.equal(tr.tiles.length, 4);
  assert.deepEqual(tr.tiles.map((t) => t.t), ['start', 'straight', 'slope', 'finish']);
  assert.ok(tr.tiles.every((t) => !t.cp && !t.th && !t.ms && !t.ma && !t.col && !t.s2));
  assert.equal(JSON.parse(Buffer.from(tr.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).v, 3);
});
test('la signature d’un circuit sans nouveauté ne change pas ; thème et couleurs ne l’altèrent pas', () => {
  const a = buildBuiltin(BUILTIN_TRACKS[0]);
  const sig = a.signature();
  for (const t of a.tiles) { t.th = 2; t.col = { road: '#ff0000' }; }
  assert.equal(a.signature(), sig, 'visuel seulement');
  a.tiles.find((t) => t.t === 'straight').cp = 1;
  assert.notEqual(a.signature(), sig, 'un checkpoint change le jeu');
});
test('aller-retour complet : checkpoint, thème, couleurs, mouvement réglé, 2e revêtement, couleur de déco', () => {
  const tr = new Track('x');
  tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
  tr.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0, cp: 1, th: 3, col: { road: '#AA0011', line: '#00ff00' } });
  tr.add({ t: 'straight', x: 0, z: -2, l: 0, r: 0, cp: 2 });
  tr.add({ t: 'straight', x: 3, z: 0, l: 0, r: 0, mv: 1, ms: 150, ma: 3 });
  tr.add({ t: 'platform', x: 6, z: 0, l: 0, r: 0, mv: 3, ms: -200, ma: 180 });
  tr.add({ t: 'fork', x: 0, z: -6, l: 0, r: 0, s: 'ice', s2: 'boost', p2: 150 });
  tr.add({ t: 'fork', x: 3, z: -6, l: 0, r: 0, s: 'ice', s2: '-' });
  tr.addDeco({ k: 'tree', x: 5, y: 0, z: 5, ry: 0, s: 1, c: 2, cc: '#12ABef' });
  const back = Track.decode(tr.encode());
  assert.equal(back.signature(), tr.signature());
  const by = (x, z) => back.tiles.find((t) => t.x === x && t.z === z);
  assert.equal(by(0, -1).cp, 1); assert.equal(by(0, -1).th, 3); assert.deepEqual(by(0, -1).col, { road: '#aa0011', line: '#00ff00' });
  assert.equal(by(0, -2).cp, 2);
  assert.deepEqual([by(3, 0).mv, by(3, 0).ms, by(3, 0).ma], [1, 150, 3]);
  assert.deepEqual([by(6, 0).mv, by(6, 0).ms, by(6, 0).ma], [3, -200, 180]);
  assert.deepEqual([by(0, -6).s2, by(0, -6).p2], ['boost', 150]); assert.equal(by(3, -6).s2, '-');
  assert.equal(back.decos[0].cc, '#12abef');
  assert.equal(back.clone().signature(), tr.signature());
});
test('un code d’une version future (type inconnu, champs étranges) ne casse pas la lecture', () => {
  const data = { v: 9, n: 'Futur', a: '', d: 'desert', t: [200, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0], e: [{ i: 1, cp: 7, th: 99, col: { road: 'rouge' } }, { i: 42 }, 'x'] };
  const tr = Track.decode('SHW3:' + b64encode(JSON.stringify(data)));
  assert.equal(tr.tiles.length, 1);
  assert.equal(tr.tiles[0].cp, 0); assert.equal(tr.tiles[0].th, 0); assert.equal(tr.tiles[0].col, null);
});
test('options impossibles refusées : checkpoint sur pente, anneau à l’envers, mouvement + checkpoint', () => {
  assert.equal(tile({ t: 'slope', cp: 1 }).cp, 0);
  assert.equal(tile({ t: 'straight', cp: 2, v: 1, l: 2 }).cp, 0);
  assert.equal(tile({ t: 'straight', cp: 1, mv: 1 }).cp, 0);
  assert.equal(tile({ t: 'curve', cp: 1 }).cp, 1);
  assert.equal(tile({ t: 'curve', cp: 2 }).cp, 0, 'l’anneau aérien est réservé aux lignes droites');
  assert.equal(tile({ t: 'twist', cp: 1 }).cp, 0);
  assert.equal(tile({ t: 'fork', s2: 'water' }).s2, '');
  assert.equal(tile({ t: 'straight', s2: 'boost' }).s2, '', 's2 : bifurcation seulement');
});

console.log('Courbes montantes et pièces paramétriques');
const CURVES = Object.entries(FAMILIES.turn.members).filter(([, tr]) => tr.incl !== '0').map(([type]) => type);
for (const type of CURVES) {
  test(`${type} : l’altitude ${PIECES[type].rise > 0 ? 'monte' : 'descend'} de ${Math.abs(PIECES[type].rise)} niveau(x) de l’entrée à la sortie, normale unitaire, bords cohérents avec le maillage`, () => {
    const P = PIECES[type], t = tile({ t: type, l: 1 }), half = P.size * HALF, mir = P.mirror < 0 ? -1 : 1;
    const o = {};
    // Entrée : milieu du bord sud de la route ; sortie : bord est (ou ouest).
    const A = P.size === 1 ? { x: 0, z: half } : { x: mir * -HALF, z: half };
    const B = P.size === 1 ? { x: mir * half, z: 0 } : { x: mir * half, z: -HALF };
    sampleLocal(t, A.x, A.z, o);
    assert.ok(Math.abs(o.h - baseY(t)) < 1e-6, 'entrée à ' + o.h);
    assert.ok(Math.abs(o.d) < 1e-6, 'sur la ligne centrale');
    sampleLocal(t, B.x, B.z, o);
    assert.ok(Math.abs(o.h - (baseY(t) + P.rise * LEVEL_H)) < 1e-6, 'sortie à ' + o.h);
    // Hauteur continue et monotone (croissante pour une montée, décroissante pour une descente), normale unitaire inclinée.
    let prev = -Infinity;
    const sg = Math.sign(P.rise);
    const fr = stripsFor(t)[0];
    for (let i = 0; i < fr.length; i++) {
      const q = fr[i].p;
      sampleLocal(t, q[0], q[2], o);
      assert.ok(Math.abs(o.h - q[1]) < 1e-6, `image ${i} : maillage ${q[1]} ≠ physique ${o.h}`);
      assert.ok(Math.abs(Math.hypot(o.nx, o.ny, o.nz) - 1) < 1e-9);
      assert.ok(o.ny > 0.3 && o.ny < 1, 'normale ' + o.ny);
      assert.ok(sg * q[1] >= prev - 1e-9); prev = sg * q[1];
      assert.ok(Math.abs(o.d) < 1e-6);
    }
    // Pente le long de la route égale à la dérivée de la hauteur le long de la ligne centrale.
    const mid = fr[Math.floor(fr.length / 2)], nxt = fr[Math.floor(fr.length / 2) + 1];
    sampleLocal(t, mid.p[0], mid.p[2], o);
    const dxz = Math.hypot(nxt.p[0] - mid.p[0], nxt.p[2] - mid.p[2]), dy = nxt.p[1] - mid.p[1];
    const along = ((nxt.p[0] - mid.p[0]) * -o.nx + (nxt.p[2] - mid.p[2]) * -o.nz) / (dxz * Math.hypot(o.nx, o.nz));
    assert.ok(Math.abs(Math.hypot(o.nx, o.nz) / o.ny - Math.abs(dy / dxz)) < 0.03, 'pente de la normale ' + (Math.hypot(o.nx, o.nz) / o.ny) + ' vs ' + dy / dxz);
    assert.ok(sg * along > 0.9, 'la normale penche vers l’arrière d’une montée (vers l’avant d’une descente)');
  });
}
test('Courbe gauche = miroir exact de la courbe droite (hauteur, distance à l’axe, normale)', () => {
  for (const [r, l] of [['cv2', 'cvL2'], ['cvBig4', 'cvBigL4']]) {
    const a = tile({ t: r }), b = tile({ t: l }), o = {}, q = {};
    for (let i = 0; i < 200; i++) {
      const lx = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 36, lz = (Math.sin(i * 78.233) * 43758.5453 % 1) * 36;
      sampleLocal(a, lx, lz, o); sampleLocal(b, -lx, lz, q);
      assert.ok(Math.abs(o.h - q.h) < 1e-9 && Math.abs(o.d - q.d) < 1e-9);
      assert.ok(Math.abs(o.nx + q.nx) < 1e-9 && Math.abs(o.nz - q.nz) < 1e-9 && Math.abs(o.gx + q.gx) < 1e-9);
    }
  }
});
test('maillage de toutes les nouvelles pièces : sommets finis, hauteur max cohérente', () => {
  const news = ['steep4', 'hugecurve', ...CURVES, 'loopBigDouble', 'loopBigDoubleL', 'loopTriple', 'loopTripleL', 'loopBigTriple', 'loopBigTripleL'];
  for (const type of news) {
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    buildTileInto(gb, glow, tile({ t: type, l: 2 }), null);
    assert.ok(gb.pos.length > 100, type);
    let maxY = -Infinity;
    for (let i = 0; i < gb.pos.length; i++) assert.ok(Number.isFinite(gb.pos[i]), type + ' : NaN');
    for (let i = 1; i < gb.pos.length; i += 3) maxY = Math.max(maxY, gb.pos[i]);
    const P = PIECES[type];
    const top = baseY(tile({ t: type, l: 2 })) + (P.kind === 'loop' ? P.R * 2 + 6 : Math.max(P.rise, 0) * LEVEL_H + 8);
    assert.ok(maxY <= top + 8, `${type} dépasse (${maxY} > ${top})`);
  }
});
test('looping ×3 : les trois tours restent à ≥ 18 m les uns des autres au sol, et dans l’empreinte', () => {
  for (const type of ['loopTriple', 'loopBigTriple', 'loopBigDouble']) {
    const strips = stripsFor(tile({ t: type }));
    const P = PIECES[type], half = P.size * HALF;
    const rib = strips[1];
    let minGap = Infinity, maxX = 0;
    for (const f of rib) maxX = Math.max(maxX, Math.abs(f.p[0]));
    assert.ok(maxX + 11 <= half + 1e-6, `${type} : déborde de l’empreinte (${maxX + 11} > ${half})`);
    // Passages au point bas (hauteur minimale) : écarts latéraux.
    const lows = rib.filter((f, i) => i > 0 && i < rib.length - 1 && f.p[1] <= rib[i - 1].p[1] && f.p[1] <= rib[i + 1].p[1]).map((f) => f.p[0]).sort((a, b) => a - b);
    for (let i = 1; i < lows.length; i++) minGap = Math.min(minGap, lows[i] - lows[i - 1]);
    assert.ok(lows.length === 0 || minGap >= 18, `${type} : écart ${minGap}`);
  }
});

console.log('Options : checkpoint, thème, couleurs');
test('cpKind : pièces checkpoint d’origine et option', () => {
  assert.equal(cpKind(tile({ t: 'checkpoint' })), 'gate'); assert.equal(cpKind(tile({ t: 'cpRing' })), 'ring'); assert.equal(cpKind(tile({ t: 'cpCurve' })), 'gate');
  assert.equal(cpKind(tile({ t: 'straight', cp: 1 })), 'gate'); assert.equal(cpKind(tile({ t: 'straight', cp: 2 })), 'ring');
  assert.equal(cpKind(tile({ t: 'straight' })), null); assert.equal(cpKind(tile({ t: 'start' })), null);
});
test('checkpoint en option : portique dessiné (virage et ligne), anneau dessiné ; compte dans RaceLogic', () => {
  const sizes = (t) => { const gb = new GeoBuilder(), gl = new GeoBuilder(); buildTileInto(gb, gl, t, null); return gb.pos.length + gl.pos.length; };
  assert.ok(sizes(tile({ t: 'straight', cp: 1 })) > sizes(tile({ t: 'straight' })) + 100, 'portique');
  assert.ok(sizes(tile({ t: 'curve', cp: 1 })) > sizes(tile({ t: 'curve' })) + 100, 'portique en virage');
  assert.ok(sizes(tile({ t: 'straight', cp: 2 })) > sizes(tile({ t: 'straight' })) + 100, 'anneau');
  const tr = new Track('c');
  tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); tr.add({ t: 'straight', x: 0, z: -1, l: 0, r: 0, cp: 1 });
  tr.add({ t: 'checkpoint', x: 0, z: -2, l: 0, r: 0 }); tr.add({ t: 'straight', x: 0, z: -3, l: 0, r: 0, cp: 2 }); tr.add({ t: 'finish', x: 0, z: -4, l: 0, r: 0 });
  assert.equal(new RaceLogic(tr).cps.length, 3);
});
test('réserve de hauteur : un checkpoint aérien en option occupe 2 niveaux au-dessus, un portique 1', () => {
  assert.deepEqual(Track.range(tile({ t: 'straight', cp: 2 })), [0, 2]);
  assert.deepEqual(Track.range(tile({ t: 'straight', cp: 1 })), [0, 1]);
  assert.deepEqual(Track.range(tile({ t: 'straight' })), [0, 0]);
});
test('thème et couleurs : la chaussée change, un revêtement de jeu garde sa chaussée', () => {
  const road = (o) => styleFor(tile({ t: 'straight', ...o })).road[0];
  assert.notEqual(road({ th: 1 }), road({})); assert.notEqual(road({ th: 2 }), road({ th: 3 }));
  assert.equal(road({ s: 'ice', th: 1 }), road({ s: 'ice' }), 'verglas reste du verglas');
  assert.equal(road({ col: { road: '#123456' } }), '#123456');
  assert.equal(styleFor(tile({ t: 'straight', col: { line: '#abcdef' } })).line, '#abcdef');
  assert.equal(styleFor(tile({ t: 'straight', col: { rail: '#102030' } })).railA, '#102030');
  assert.equal(tile({ t: 'straight', col: { road: 'pas une couleur', x: 3 } }).col, null);
  assert.equal(flagAllowed('ring', 'th'), false); assert.equal(flagAllowed('loop', 'th'), true);
});
test('toggleFlag : cp / th s’activent, se désactivent, et le checkpoint refuse un mouvement', () => {
  const tr = new Track('f');
  const t = tr.add({ t: 'straight', x: 0, z: 0, l: 0, r: 0 });
  assert.equal(tr.toggleFlag(t, 'cp', 1), true); assert.equal(t.cp, 1);
  assert.equal(tr.toggleFlag(t, 'cp', 2), true); assert.equal(t.cp, 2, 'passe du portique à l’anneau');
  assert.equal(tr.toggleFlag(t, 'cp', 2), true); assert.equal(t.cp, 0);
  assert.equal(tr.toggleFlag(t, 'th', 2), true); assert.equal(t.th, 2); assert.equal(tr.toggleFlag(t, 'th', 2), true); assert.equal(t.th, 0);
  tr.toggleFlag(t, 'cp', 1);
  assert.equal(tr.toggleFlag(t, 'mv', 1), false, 'pas de mouvement avec un checkpoint');
  tr.toggleFlag(t, 'cp', 1);
  assert.equal(tr.toggleFlag(t, 'mv', 1), true); assert.equal(t.mv, 1);
  assert.equal(tr.toggleFlag(t, 'cp', 1), false, 'pas de checkpoint avec un mouvement');
  // Une pièce au-dessus bloque l'anneau (2 niveaux réservés).
  const u = tr.add({ t: 'straight', x: 1, z: 0, l: 0, r: 0 }); tr.add({ t: 'straight', x: 1, z: 0, l: 2, r: 0 });
  assert.equal(tr.toggleFlag(u, 'cp', 2), false, 'l’anneau monte jusqu’au niveau 2 : occupé');
  assert.equal(u.cp, 0);
});

console.log('Pièces mobiles réglables');
test('valeurs par défaut : exactement l’ancien mouvement (6 s, 2 niveaux ; 5 s, 1 case)', () => {
  const tr = new Track('m');
  const a = tr.add({ t: 'straight', x: 0, z: 0, l: 0, r: 0, mv: 1 }), b = tr.add({ t: 'straight', x: 4, z: 0, l: 0, r: 0, mv: 2 });
  const o = {};
  for (const t of [0, 0.7, 1.5, 3, 4.4, 6]) {
    tr.moverOffset(a, t, o);
    assert.equal(o.y, 2 * LEVEL_H * ((1 - Math.cos(((Math.PI * 2) / 6) * t)) / 2));
    tr.moverOffset(b, t, o);
    assert.equal(o.x, CELL * ((1 - Math.cos(((Math.PI * 2) / 5) * t)) / 2));
  }
});
test('vitesse et amplitude : période et débattement changent, bornes respectées', () => {
  const tr = new Track('m');
  const a = tr.add({ t: 'straight', x: 0, z: 0, l: 0, r: 0, mv: 1, ms: 200, ma: 4 });
  const o = {};
  tr.moverOffset(a, 1.5, o);           // vitesse 200 % : période 3 s → mi-course à 1,5 s
  assert.ok(Math.abs(o.y - 4 * LEVEL_H) < 1e-9, o.y);
  assert.deepEqual(clampMover(1, 9999, 99), { ms: 300, ma: 8 });
  assert.deepEqual(clampMover(1, 100, 2), { ms: 0, ma: 0 });                 // valeurs par défaut : 0 = compact
  assert.deepEqual(clampMover(3, -10, 0), { ms: -25, ma: 0 });
  assert.equal(moverParams(a).speed, 200);
  assert.deepEqual(Track.range(a), [0, 4]);
  const b = tr.add({ t: 'straight', x: 5, z: 0, l: 0, r: 0, mv: 2, ma: 3 });
  assert.equal(Track.cellsOf(b).length, 1 + 3, 'la glissière balaie 3 cases');
});
test('Rotation : réserve la couronne de cases autour, tourne autour du centre, aller-retour si amplitude < 360', () => {
  const tr = new Track('r');
  const p = tr.add({ t: 'platform', x: 2, z: 2, l: 0, r: 0, mv: 3 });
  assert.equal(Track.cellsOf(p).length, 9);
  const o = {};
  tr.moverOffset(p, 3, o);
  assert.ok(Math.abs(o.a - (Math.PI * 2 * 3) / 12) < 1e-9 && Math.abs(o.w - (Math.PI * 2) / 12) < 1e-9);
  assert.ok(Math.abs(o.cx - (2 * CELL + HALF)) < 1e-9);
  const q = tr.add({ t: 'platform', x: 8, z: 2, l: 0, r: 0, mv: 3, ma: 90, ms: -100 });
  tr.moverOffset(q, 6, o);               // demi-période : amplitude maximale, dans le sens négatif
  assert.ok(Math.abs(o.a + Math.PI / 2) < 1e-9, 'a = ' + o.a);
  assert.equal(flagAllowed('straight', 'mv', null, 3), true); assert.equal(flagAllowed('twist', 'mv'), false);
});
test('Rotation : une voiture posée sur la plateforme tourne avec elle (cap et position)', () => {
  const tr = new Track('r');
  tr.add({ t: 'start', x: 6, z: 6, l: 0, r: 0 });
  const p = tr.add({ t: 'platform', x: 2, z: 2, l: 0, r: 0, mv: 3 });
  const phys = new CarPhysics(tr);
  const cx = 2 * CELL + HALF, cz = 2 * CELL + HALF;
  phys.place(cx + 6, baseY(p) + 0.4, cz, 0, 1);
  const steps = Math.round(4 / DT);
  const yaw0 = phys.yaw;
  for (let i = 0; i < steps; i++) { phys.clock = i; phys.step({ throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false }); }
  const A = (Math.PI * 2 * 4) / 12;
  const r = Math.hypot(phys.pos.x - cx, phys.pos.z - cz);
  const ang = Math.atan2(-(phys.pos.z - cz), phys.pos.x - cx);        // angle de la voiture autour du pivot (x vers z négatif = sens trigo de la vue de dessus)
  assert.ok(phys.grounded, 'la voiture reste posée');
  assert.ok(Math.abs(r - 6) < 2.2, 'rayon ' + r);
  let da = ang - 0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  assert.ok(Math.abs(da - A) < 0.5, `angle ${da.toFixed(2)} attendu ${A.toFixed(2)}`);
  let dy = phys.yaw - yaw0; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  assert.ok(Math.abs(dy - A) < 0.5, `cap ${dy.toFixed(2)} attendu ${A.toFixed(2)}`);
});
test('Rotation : la route tournante porte sa surface (surfaceAt) là où elle est vraiment', () => {
  const tr = new Track('r');
  const p = tr.add({ t: 'straight', x: 0, z: 0, l: 0, r: 0, mv: 3, s: 'boost' });
  const cx = HALF, cz = HALF;
  const o = {}, s = {};
  const T = 3;                              // chrono de la course : 90° (quart de tour)
  tr.moverOffset(p, T, o);
  // Au repos la route couvre x ∈ [-9, 9] autour du centre (axe nord-sud) ; après un quart de tour elle est est-ouest.
  tr.surfaceAt(cx, 1, cz + HALF - 1, s, 1.6, null, 0); assert.equal(s.type, 'road', 'au repos la route va du nord au sud');
  tr.surfaceAt(cx + ROAD_HALF + 2, 1, cz, s, 1.6, null, 0); assert.equal(s.type, 'ground');
  tr.surfaceAt(cx + ROAD_HALF + 2, 1, cz, s, 1.6, null, T); assert.equal(s.type, 'road', 'après un quart de tour elle va de l’ouest à l’est');
  tr.surfaceAt(cx, 1, cz + ROAD_HALF + 2, s, 1.6, null, T); assert.equal(s.type, 'ground', 'au nord/sud, la route est partie');
  assert.equal(o.a > 0, true);
});
test('Bifurcation à deux revêtements : la voie déportée a le sien (physique)', () => {
  const tr = new Track('f');
  const f = tr.add({ t: 'fork', x: 0, z: 0, l: 0, r: 0, s: 'ice', s2: 'boost', p2: 150 });
  const o = {};
  // Pièce 2×2 en (0, 0) : centre (24, 24) ; entrée au sud de la colonne gauche (x = 12), sorties au nord en x = 12 (voie A) et x = 36 (voie B).
  tr.surfaceAt(HALF, 1, 2 * CELL - 2, o); assert.equal(o.mod, 'ice');                        // départ : voie d'entrée
  tr.surfaceAt(HALF + CELL, 1, 2, o); assert.equal(o.mod, 'boost'); assert.equal(o.p, 150);   // sortie : voie déportée
  tr.surfaceAt(HALF, 1, 2, o); assert.equal(o.mod, 'ice');
  const g = tr.add({ t: 'fork', x: 4, z: 0, l: 0, r: 0, s: 'ice', s2: '-' });
  tr.surfaceAt(4 * CELL + 36, 1, 2, o); assert.equal(o.mod, '');                 // « - » : route normale
  tr.surfaceAt(4 * CELL + 12, 1, 2, o); assert.equal(o.mod, 'ice');
  const h = tr.add({ t: 'fork', x: 8, z: 0, l: 0, r: 0, s: 'drift' });
  tr.surfaceAt(8 * CELL + 36, 1, 2, o); assert.equal(o.mod, 'drift', 'sans s2, toute la pièce garde s');
  void f; void g; void h;
});

console.log('Éditeur : pose combinée pièce + options, inspecteur');
function mkEd(tool, opts = {}) {
  const track = new Track('t');
  const calls = { commit: 0, changed: 0, flash: [] };
  const self = Object.create(EditorSession.prototype);
  Object.assign(self, {
    track, tool, level: 0, rot: 0, hover: { x: HALF, z: HALF, cx: 0, cz: 0 }, surfParam: {}, opts: { v: 0, nb: 0, tn: 0, mv: 0, cp: 0, th: 0, ...opts },
    app: { ui: { flash: (m) => calls.flash.push(m) }, audio: { place() {}, error() {} } },
    _commit: () => calls.commit++, _changed: () => calls.changed++,
  });
  return { self, track, calls };
}
test('options armées : le dernier choix l’emporte sur les incompatibles', () => {
  const none = { v: 0, o: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0, th: 0 };
  let o = armedOptions(none, 'v', 1); assert.deepEqual([o.v, o.cp], [1, 0]);
  o = armedOptions(o, 'cp', 2); assert.deepEqual([o.v, o.cp], [0, 2], 'l’anneau aérien ne va pas à l’envers');
  o = armedOptions(o, 'mv', 3); assert.deepEqual([o.mv, o.cp], [3, 0]);
  o = armedOptions(o, 'cp', 1); assert.deepEqual([o.mv, o.cp], [0, 1]);
  o = armedOptions(o, 'tn', 1); assert.deepEqual([o.tn, o.cp], [1, 0], 'tunnel et portique ne cohabitent pas');
  o = armedOptions(o, 'th', 2); assert.equal(o.th, 2); o = armedOptions(o, 'th', 2); assert.equal(o.th, 0, 'recliquer retire');
  assert.deepEqual(armedOptions(none, 'nb', 1), { ...none, nb: 1 });
  // 0.9.3 : l'orientation (sol / mur gauche / mur droit / plafond) est un choix exclusif.
  o = armedOptions(none, 'o', 1); assert.deepEqual([o.o, o.v], [1, 0]);
  o = armedOptions(o, 'o', 2); assert.deepEqual([o.o, o.v], [2, 0], 'mur droit remplace mur gauche');
  o = armedOptions(o, 'v', 1); assert.deepEqual([o.o, o.v], [0, 1], 'le plafond remplace le mur');
  o = armedOptions(o, 'o', 1); assert.deepEqual([o.o, o.v], [1, 0], 'le mur remplace le plafond');
  o = armedOptions(o, 'o', 1); assert.equal(o.o, 0, 'recliquer retire le mur');
  o = armedOptions(armedOptions(none, 'tn', 1), 'o', 1); assert.deepEqual([o.o, o.tn], [1, 0], 'un mur n’a pas de tunnel');
  o = armedOptions(armedOptions(none, 'o', 2), 'mv', 1); assert.deepEqual([o.o, o.mv], [0, 1], 'un mouvement retire le mur');
  o = armedOptions(armedOptions(none, 'v', 1), 'o', 0); assert.deepEqual([o.o, o.v], [0, 0], '« Sol » remet tout à plat');
});
test('_candidate : la pièce porte les options armées (aperçu et pose identiques)', () => {
  const { self } = mkEd('straight', { v: 1, th: 2 });
  self.level = 2;
  assert.deepEqual(self._candidate(), { t: 'straight', x: 0, z: 0, l: 2, r: 0, s: '', v: 1, th: 2 });
  const { self: e2 } = mkEd('loopTriple', { cp: 1 });
  assert.equal(e2._candidate().x, -1, 'empreinte 4×4 centrée sur la case visée');
});
test('_act : pose Ligne droite + Tunnel + Thème Roche, puis un 2e clic identique ne repose rien', () => {
  const { self, track, calls } = mkEd('straight', { tn: 1, th: 3 });
  self._act(false);
  assert.equal(track.tiles.length, 1);
  assert.deepEqual([track.tiles[0].t, track.tiles[0].tn, track.tiles[0].th], ['straight', 1, 3]);
  self._act(false);
  assert.equal(calls.commit, 1, 'rien de nouveau à poser');
  self.opts.th = 1; self._act(false);                              // même pièce, autre option : remplacée
  assert.equal(track.tiles.length, 1); assert.equal(track.tiles[0].th, 1); assert.equal(calls.commit, 2);
});
test('_act : une option impossible sur la pièce est ignorée avec un message, le reste est posé', () => {
  const { self, track, calls } = mkEd('loop', { cp: 1, th: 2, tn: 1 });
  self._act(false);
  const t = track.tiles[0];
  assert.deepEqual([t.cp, t.tn, t.th], [0, 0, 2]);
  assert.ok(calls.flash.some((m) => /Option ignorée/.test(m) && /checkpoint/.test(m) && /tunnel/.test(m)), calls.flash.join('|'));
});
test('_act : pièce posée à l’envers au niveau 0 refusée, au niveau 2 acceptée', () => {
  const { self, track, calls } = mkEd('straight', { v: 1 });
  self._act(false); assert.equal(track.tiles.length, 0); assert.ok(calls.flash.length);
  self.level = 2; self._act(false); assert.equal(track.tiles.length, 1); assert.equal(track.tiles[0].v, 1);
});
test('Courbe montante posée : le niveau suit pour la case suivante (aide à la pose)', () => {
  const { self } = mkEd('cv2');
  self._act(false);
  const [bx, bz] = [0, 1];                                            // derrière la pièce (sud) : même niveau ; à droite (est) : +2
  assert.equal(self.autoLevel.get('1,0'), 2); assert.equal(self.autoLevel.get(`${bx},${bz}`), 0);
  const { self: e2 } = mkEd('cvL2'); e2._act(false);
  assert.equal(e2.autoLevel.get('-1,0'), 2, 'la version gauche sort à gauche');
});
test('retypePlacement : looping 1 → 3 boucles garde la pièce en place (2×2 → 4×4), refuse si la place manque', () => {
  const tr = new Track('r');
  const lp = tr.add({ t: 'loop', x: 4, z: 4, l: 0, r: 0 });
  const c = retypePlacement(tr, lp, 'loopTriple');
  assert.ok(c); assert.deepEqual([c.t, c.x, c.z], ['loopTriple', 3, 3]);
  assert.equal(tr.tiles.length, 1, 'la pièce d’origine reste en place le temps du test');
  const blocker = tr.add({ t: 'straight', x: 3, z: 3, l: 0, r: 0 }); void blocker;
  tr.add({ t: 'straight', x: 6, z: 6, l: 0, r: 0 }); tr.add({ t: 'straight', x: 5, z: 3, l: 0, r: 0 });
  // Toutes les ancres autour sont maintenant gênées par une pièce voisine : pas de variante 4×4 possible
  tr.add({ t: 'straight', x: 3, z: 6, l: 0, r: 0 }); tr.add({ t: 'straight', x: 6, z: 3, l: 0, r: 0 }); tr.add({ t: 'straight', x: 4, z: 3, l: 0, r: 0 });
  assert.equal(retypePlacement(tr, lp, 'loopTriple'), null);
  assert.equal(tr.tiles.includes(lp), true);
});
test('_retypeFamily : l’objet gardé (sélection de l’Inspecteur), nouvelle empreinte ; _legacyToOption convertit les anciens checkpoints', () => {
  const { self, track } = mkEd('straight');
  const lp = track.add({ t: 'loopDouble', x: 6, z: 6, l: 1, r: 1, s: 'ice' });
  assert.ok(self._retypeFamily(lp, 'loopBigTripleL'));
  assert.equal(track.tiles[track.tiles.length - 1], lp); assert.equal(lp.t, 'loopBigTripleL'); assert.equal(lp.s, 'ice'); assert.equal(lp.r, 1); assert.equal(lp.l, 1);
  assert.equal(track.tilesAt(lp.x, lp.z).includes(lp), true);
  for (const [legacy, t, cp] of [['checkpoint', 'straight', 1], ['cpCurve', 'curve', 1], ['cpRing', 'straight', 2]]) {
    const tl = track.add({ t: legacy, x: 20, z: 20, l: 0, r: 2 });
    assert.ok(self._legacyToOption(tl), legacy);
    assert.deepEqual([tl.t, tl.cp, tl.r], [t, cp, 2]);
    assert.equal(cpKind(tl) !== null, true);
    track.remove(tl);
  }
});
test('flèche de direction : cap = sens de parcours (droite, virage, courbe gauche, pièce tournée, looping)', () => {
  const yawVec = (a) => [-Math.sin(a.yaw), -Math.cos(a.yaw)];
  const close = (v, w) => Math.hypot(v[0] - w[0], v[1] - w[1]) < 0.12;
  for (let r = 0; r < 4; r++) {
    const f = [[0, -1], [1, 0], [0, 1], [-1, 0]][r];
    assert.ok(close(yawVec(arrowPose(tile({ t: 'straight', r }))), f), 'droite r=' + r);
    assert.ok(close(yawVec(arrowPose(tile({ t: 'loop', r }))), f), 'looping r=' + r);
  }
  const s = Math.SQRT1_2;
  assert.ok(close(yawVec(arrowPose(tile({ t: 'curve' }))), [s, -s]), 'virage à droite : nord-est au milieu');
  assert.ok(close(yawVec(arrowPose(tile({ t: 'cvL2' }))), [-s, -s]), 'courbe gauche : nord-ouest');
  const a = arrowPose(tile({ t: 'cv4', l: 3 }));
  assert.ok(a.y > baseY(tile({ t: 'cv4', l: 3 })) + 8, 'la flèche suit la montée (milieu de la courbe)');
  const inv = arrowPose(tile({ t: 'straight', v: 1, l: 2 }));
  assert.ok(inv.y < baseY(tile({ t: 'straight', l: 2 })), 'à l’envers, la flèche est sous le niveau (côté route)');
  const wall = arrowPose(tile({ t: 'wall', r: 1 }));
  assert.ok(close(yawVec(wall), [1, 0]), 'mur vertical : sens nominal de la pièce');
  for (const type of Object.keys(PIECES)) { const q = arrowPose(tile({ t: type })); assert.ok(Number.isFinite(q.x + q.y + q.z + q.yaw + q.len), type); }
});
test('traitsOf : décrit la famille d’une pièce (null sinon)', () => {
  assert.equal(traitsOf('twist'), null);
  const t = traitsOf('loopBigTripleL');
  assert.equal(t.label, 'Looping'); assert.deepEqual(t.values, { dir: 'L', size: 'g', turns: '3' }); assert.equal(t.traits.length, 3);
});

console.log('Conduite : un circuit qui utilise les nouvelles pièces');
function drive(track, maxTime = 150) {
  const phys = new CarPhysics(track), logic = new RaceLogic(track);
  placeAtStart(phys, logic);
  const bot = new Autopilot(track.path);
  bot.reset(phys);
  const steps = Math.round(maxTime / DT);
  let respawns = 0, last = 0;
  for (let i = 0; i < steps; i++) {
    const inp = bot.control(phys);
    phys.clock = logic.steps;
    phys.step(inp);
    const ev = logic.update(phys);
    if (ev && ev.type === 'finish') return { ok: true, time: logic.time, respawns, cps: logic.collected.size };
    if (phys.pos.y < -30 || phys.ev.fell) { respawns++; if (respawns > 2) break; }
    last = i;
  }
  return { ok: false, time: last * DT, respawns, cps: logic.collected.size, pos: { ...phys.pos } };
}
const SHOW = [
  ['courbes montantes (droite et gauche, serrée et grande)', 'start S2 CVR1 S2 CBL1 S3 CVR2 S2 CBR0 S2 finish'],
  ['très grand virage plat et ligne inclinée ×4', 'start S3 HR S2 UX S2 HL S2 finish'],
  ['looping ×3 normal', 'start S4 OT S3 finish'],
  ['grand looping ×2 et grand looping ×3', 'start S4 OBD S3 OBT S3 finish'],
];
for (const [name, script] of SHOW) {
  test('le pilote automatique termine : ' + name, () => {
    const tr = scriptTrack(name, script);
    const r = drive(tr);
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(r.respawns === 0, 'sorties de route : ' + r.respawns);
  });
}
test('checkpoints en option (portique, anneau, virage) : indispensables pour finir', () => {
  const tr = scriptTrack('cp', 'start S3 R S3 L S3 finish');
  // Portiques sur une droite et sur un virage, anneau aérien sur une autre droite.
  const st = tr.tiles.filter((t) => t.t === 'straight'), cu = tr.tiles.filter((t) => t.t === 'curve');
  assert.ok(tr.toggleFlag(st[1], 'cp', 1)); assert.ok(tr.toggleFlag(cu[1], 'cp', 1)); assert.ok(tr.toggleFlag(st[8], 'cp', 2));
  const r = drive(tr);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.cps, 3);
  // Sans le franchir (on le retire du chemin) la course ne peut pas se terminer : le compte exige les 3.
  assert.equal(new RaceLogic(tr).cps.length, 3);
});

await finish('Tous les tests de la Phase 2 passent.');
