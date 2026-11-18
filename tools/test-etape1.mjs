// 0.9.68, étape 1 des nouvelles pièces : node tools/test-etape1.mjs   (npm test)
//  A. chicanes (courbes en S latérales) : géométrie exacte, raccords, vitesse de passage, famille de l'éditeur, encodage, langage des circuits ;
//  B. panneaux de bord de route (chevrons, danger, interdit, descente, demi-tour) : décorations à la suite de l'ordre d'encodage ;
//  C. portiques : quatre styles (visuels, hors signature), départ / arrivée / checkpoint sans bordures ;
//  D. piliers et poutres : des SOLIDES (la voiture ne les traverse pas, passe dessous, s'y cogne la tête ; leur dessus porte), dans la signature.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

globalThis.document = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) };   // (canvas des plaques : TrackView)
const { scriptTrack, Track, hashString } = await import('../js/track.js');
const { PIECES, PIECE_ORDER, sampleLocal, sbendParams, sbendPoint, flagAllowed, GATE_STYLES } = await import('../js/pieces.js');
const { centerlineWorld } = await import('../js/ribbons.js');
const { tileEnds, endsTouch, placementsAfter } = await import('../js/connect.js');
const { FAMILIES, FAMILY_ORDER, resolve, familyOf } = await import('../js/families.js');
const { DECO_ORDER, DECO_CATS, DECO_LABELS } = await import('../js/decoData.js');
const { GeoBuilder } = await import('../js/geo.js');
const { buildDecoInto } = await import('../js/decos.js');
const { buildTileInto, stripsFor } = await import('../js/trackGeometry.js');
const { SOLIDS, SOLID_IDS, isSolid, buildSolidGrid } = await import('../js/solids.js');
const { renderOptions } = await import('../js/renderOptions.js');
const { TrackView, createTrackMaterials } = await import('../js/trackMesh.js');
const { runTrack } = await import('./lab.mjs');
const { CELL } = await import('../js/constants.js');

const CHICANES = ['sbend', 'sbendL', 'sbendLong', 'sbendLongL', 'sbendFast', 'sbendFastL', 'sbendWide', 'sbendWideL'];
const build = (sc, l = 2) => scriptTrack('essai', sc, { l });
const vmin = (tr) => { const S = runTrack(tr, { vCap: 80 }); assert.ok(S.ok && S.respawns === 0, S.reason); const v = S.samples.map((s) => s[1] * 3.6), i0 = v.findIndex((x) => x > 245); return { S, v: Math.min(...v.slice(i0)) }; };

console.log('A. Chicanes');
test('huit pièces (courte 2×2, longue 3×3, rapide 4×4, grand S 3×3 ; → et ←) ajoutées à la SUITE de l’ordre d’encodage (index 136 à 143)', () => {
  assert.deepEqual(PIECE_ORDER.slice(136, 144), CHICANES);
  assert.equal(hashString(PIECE_ORDER.slice(0, 136).join(',')), hashString([...PIECE_ORDER.slice(0, 135), 'giantcurve'].join(',')));
  for (const id of CHICANES) assert.equal(PIECES[id].kind, 'sbend', id);
});
test('deux arcs de même rayon, tangents au milieu : R = (D² + L²) / 4D (40, 80, 136 et 52 m) ; le S relie deux colonnes de cases', () => {
  const R = Object.fromEntries(['sbend', 'sbendLong', 'sbendFast', 'sbendWide'].map((id) => [id, sbendParams(PIECES[id]).R]));
  assert.deepEqual(R, { sbend: 40, sbendLong: 80, sbendFast: 136, sbendWide: 52 });
  for (const id of CHICANES) {
    const P = PIECES[id], g = sbendParams(P), a = sbendPoint(P, 0), m1 = sbendPoint(P, 0.5 - 1e-9), m2 = sbendPoint(P, 0.5 + 1e-9), b = sbendPoint(P, 1);
    assert.ok(Math.abs(a.x - g.x0) < 1e-9 && Math.abs(b.x - g.x1) < 1e-9 && Math.abs(a.z - P.size * CELL / 2) < 1e-9 && Math.abs(b.z + P.size * CELL / 2) < 1e-9, id);
    assert.ok(Math.abs(a.tx) < 1e-12 && Math.abs(b.tx) < 1e-12 && a.tz === -1 && b.tz === -1, id + ' : entre et sort dans l’axe');
    assert.ok(Math.hypot(m1.x - m2.x, m1.z - m2.z) < 1e-6 && Math.abs(m1.tx - m2.tx) < 1e-6, id + ' : continu au milieu (position et cap)');
    assert.equal(Math.abs(b.x - a.x), P.shift * CELL, id);
  }
});
test('écart latéral EXACT (distance au bon arc) : nul sur la ligne centrale, 10 m à 10 m à droite, partout le long du S', () => {
  const S = {};
  for (const id of CHICANES) {
    const tile = { t: id, x: 0, z: 0, l: 0, r: 0 };
    for (let i = 0; i <= 64; i++) {
      const q = sbendPoint(PIECES[id], i / 64);
      sampleLocal(tile, q.x, q.z, S); assert.ok(Math.abs(S.d) < 1e-9, id);
      sampleLocal(tile, q.x - q.tz * 10, q.z + q.tx * 10, S); assert.ok(Math.abs(S.d - 10) < 1e-9, id + ' (à droite)');
      assert.ok(Math.abs(S.along - i / 64) < 1e-9, id + ' : avancée');
    }
  }
});
test('deux bouts chacun, raccordés à eux-mêmes ; se pose derrière une droite à n’importe quel cap', () => {
  for (const id of CHICANES) for (const r of [0, 1, 2, 3]) {
    const a = Track.normalize({ t: id, x: 4, z: -3, l: 2, r }), e = tileEnds(a);
    assert.equal(e.length, 2);
    const exit = e.find((x) => x.exit), c = placementsAfter(exit, id, {});
    assert.ok(c.length, `${id} r${r}`);
    assert.ok(endsTouch(exit, tileEnds(Track.normalize(c[0])).find((x) => x.entry)));
  }
});
test('langage des circuits : ZR / ZL (2, 3 ou 4 cases), ZZR / ZZL ; même cap à la sortie, décalé d’une ou deux colonnes ; partage à l’identique', () => {
  const tr = build('start S2 ZR S ZL3 S ZR4 S ZZR S ZZL S [sbendWideL] S2 finish');
  assert.deepEqual(tr.tiles.filter((t) => PIECES[t.t].kind === 'sbend').map((t) => t.t), ['sbend', 'sbendLongL', 'sbendFast', 'sbendWide', 'sbendWideL', 'sbendWideL']);
  assert.deepEqual(tr.validate(), []);
  assert.equal(tr.turtle.h, 0);
  assert.equal(tr.turtle.x, 0 + 1 - 1 + 1 + 2 - 2 - 2, 'décalage latéral total');
  assert.equal(Track.decode(tr.encode()).signature(), tr.signature());
});
test('vitesse de passage (pilote, élan de 16 cases) : courte ≈ un grand virage, longue ≈ un très grand, rapide : presque à fond ; aucun choc', () => {
  const short = vmin(build('start B3 S16 ZR S8 finish')).v, long = vmin(build('start B3 S16 ZR3 S8 finish')).v, fast = vmin(build('start B3 S16 ZR4 S8 finish')).v;
  const wide = vmin(build('start B3 S16 ZZR S8 finish')).v, straight = vmin(build('start B3 S18 S8 finish')).v;
  assert.ok(short > 105 && short < 145, 'courte ' + short);
  assert.ok(long > 170 && long < 215, 'longue ' + long);
  assert.ok(fast > 225, 'rapide ' + fast);
  assert.ok(wide > short && wide < long, 'grand S ' + wide);
  assert.ok(straight >= fast);
});
test('famille « Chicane » de l’éditeur (longueur × décalage × sens), entre Virage et Courbe', () => {
  assert.deepEqual(FAMILY_ORDER.slice(0, 4), ['straight', 'turn', 'chicane', 'courbe']);
  assert.equal(resolve('chicane', { len: '3', shift: '2', dir: 'L' }), 'sbendWideL');
  assert.equal(resolve('chicane', { len: '2', shift: '2', dir: 'R' }), null, 'pas de décalage de 2 colonnes sur 2 cases');
  assert.deepEqual(familyOf('sbendFast').traits, { len: '4', shift: '1', dir: 'R' });
  assert.equal(Object.keys(FAMILIES.chicane.members).length, 10);
  assert.equal(resolve('chicane', { len: '4', shift: '2', dir: 'L' }), 'sbendFastWideL', '0.12.0 : grand S rapide (4×4, deux colonnes)');
});
test('options : à l’envers, sans bordures, tunnel, thème ; ni mouvement, ni checkpoint ; sur un mur gauche ou droit seulement (0.11.3, wall-ride qui monte ou descend) ; les bandes de route ont 4 tronçons par case', () => {
  for (const f of ['v', 'nb', 'tn', 'th']) assert.ok(flagAllowed('sbend', f), f);
  for (const f of ['mv', 'cp', 'tb']) assert.ok(!flagAllowed('sbend', f, null, 1), f);
  for (const o of [1, 2]) assert.ok(flagAllowed('sbend', 'o', null, o), 'mur ' + o);      // (0.11.3 : roulée sur un mur, la chicane monte ou descend le long du mur)
  for (const o of [3, 4, 5, 6]) assert.ok(!flagAllowed('sbend', 'o', null, o), 'roulis ' + o + ' : sortie hors de la grille');
  for (const id of CHICANES) assert.equal(stripsFor({ t: id, x: 0, z: 0, l: 0, r: 0 })[0].length, 8 * PIECES[id].size + 1);
  const gb = new GeoBuilder(), glow = new GeoBuilder();
  buildTileInto(gb, glow, Track.normalize({ t: 'sbendWide', x: 0, z: 0, l: 3, r: 1, tn: 1 }));
  assert.ok(!gb.empty);
  assert.ok(centerlineWorld(Track.normalize({ t: 'sbendFast', x: 0, z: 0, l: 0, r: 0 }), 6).length >= 33, 'ligne centrale assez fine pour le pilote');
});

console.log('B. Panneaux');
test('huit panneaux à la suite des décorations (après « custom ») : chevrons ×4, danger, interdit, descente, demi-tour ; tous dessinés, nommés, rangés dans « Panneaux »', () => {
  const ids = ['board_left', 'board_right', 'board_up', 'board_down', 'board_warn', 'board_no', 'sign_down', 'sign_uturn'];
  assert.deepEqual(DECO_ORDER.slice(312, 320), ids);
  assert.equal(DECO_ORDER[311], 'custom');
  for (const id of ids) {
    assert.ok(DECO_CATS.signs.kinds.includes(id) && DECO_LABELS[id], id);
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    buildDecoInto(gb, glow, { k: id, x: 0, y: 0, z: 0, ry: 0, s: 1, c: 0 });
    assert.ok(!gb.empty && !glow.empty, id);
  }
});

console.log('C. Portiques');
test('quatre styles (portique, ligne au sol, arche, pylônes) pour un départ, une arrivée ou un checkpoint (pièce ou option) ; jamais ailleurs', () => {
  assert.equal(GATE_STYLES.length, 4);
  for (const id of ['start', 'finish', 'checkpoint', 'cpCurve']) assert.ok(flagAllowed(id, 'gs', null, 2), id);
  assert.ok(flagAllowed('straight', 'gs', { cp: 1 }, 3) && !flagAllowed('straight', 'gs', { cp: 0 }, 3));
  for (const id of ['ring', 'cpRing', 'platform', 'loop', 'sbend']) assert.ok(!flagAllowed(id, 'gs', null, 1), id);
  assert.equal(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, gs: 2 }).gs, 0, 'sans portique, pas de style');
  assert.equal(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0, cp: 1, gs: 2 }).gs, 2);
  assert.equal(Track.normalize({ t: 'finish', x: 0, z: 0, l: 0, r: 0, gs: 9 }).gs, 0, 'style inconnu : refusé');
});
test('le style est visuel : hors signature (records et vérification gardés), mais voyage avec le code ; chaque style dessine autre chose', () => {
  const a = build('start S2 C S2 finish'), b = build('start*2 S2 C*3 S2 finish*1');
  assert.equal(a.signature(), b.signature());
  const back = Track.decode(b.encode());
  assert.deepEqual(back.tiles.filter((t) => t.gs).map((t) => [t.t, t.gs]), [['start', 2], ['checkpoint', 3], ['finish', 1]]);
  const counts = [0, 1, 2, 3].map((gs) => { const gb = new GeoBuilder(), glow = new GeoBuilder(); buildTileInto(gb, glow, Track.normalize({ t: 'finish', x: 0, z: 0, l: 0, r: 0, gs })); return gb.pos.length + glow.pos.length; });
  assert.equal(new Set(counts).size, 4, 'quatre géométries différentes');
  assert.throws(() => build('start S*2 finish'), /style de portique/);
  // toggleFlag (éditeur) : visuel, comme le thème
  const t = a.tiles.find((x) => x.t === 'checkpoint'), v = a.version;
  assert.ok(a.toggleFlag(t, 'gs', 2) && t.gs === 2 && a.version > v);
  assert.ok(a.toggleFlag(t, 'gs', 2) && t.gs === 0, 'même choix : retiré');
});
test('départ, arrivée et checkpoint se posent sans bordures (portique sur la dalle nue) ; la course se fait', () => {
  for (const id of ['start', 'finish', 'checkpoint']) assert.ok(flagAllowed(id, 'nb'), id);
  const tr = build('start_*1 S4 C_*2 S4 finish_*3');
  assert.ok(tr.tiles.filter((t) => PIECES[t.t].special).every((t) => t.nb));
  const S = runTrack(tr);
  assert.ok(S.ok && S.respawns === 0, S.reason);
});

console.log('D. Piliers et poutres (solides)');
const road = (deco) => {
  const tr = scriptTrack('t', 'start S12 finish', { l: 0 }), mid = tr.path[Math.floor(tr.path.length / 2)];
  if (deco) tr.addDeco({ ...deco, x: mid[0] + (deco.dx || 0), z: mid[2] });
  return tr;
};
test('neuf solides à la suite des décorations, catégorie « Piliers et poutres » ; jamais inclinés ni roulés, échelle bornée', () => {
  assert.deepEqual(DECO_ORDER.slice(320, 329), SOLID_IDS.slice(0, 9));
  assert.deepEqual(DECO_CATS.struct.kinds, SOLID_IDS.slice(0, 9));
  const tr = new Track('t');
  const d = tr.addDeco({ k: 'pillar', x: 1, y: 0, z: 2, ry: 0.3, s: 50, c: 0, rx: 0.4, rz: 0.7 });
  assert.equal(d.s, 8); assert.ok(!d.rx && !d.rz);
  assert.equal(tr.addDeco({ k: 'beam', x: NaN, y: 0, z: 0, ry: 0, s: 1 }), null, 'position invalide : refusée');
  for (const id of SOLID_IDS) { const gb = new GeoBuilder(), glow = new GeoBuilder(); buildDecoInto(gb, glow, { k: id, x: 0, y: 0, z: 0, ry: 0, s: 1, c: 0 }); assert.ok(!gb.empty, id); }
});
test('un pilier au milieu de la route arrête la voiture (choc, elle ne le traverse pas) ; elle repart et finit', () => {
  const free = runTrack(road(null)), hit = runTrack(road({ k: 'pillar', y: 0.4, ry: 0, s: 1 }));
  assert.ok(free.ok && free.wallHits === 0);
  assert.ok(hit.ok && hit.wallHits >= 1 && hit.time > free.time + 2, `${hit.wallHits} choc(s), ${hit.time.toFixed(1)} s contre ${free.time.toFixed(1)} s`);
});
test('sous un portique en poutres, ou sous une poutre à 3 m : rien ne change ; un poteau fin sur la route : choc', () => {
  const free = runTrack(road(null));
  for (const d of [{ k: 'gantry', y: 0.4, ry: 0, s: 1 }, { k: 'beam', y: 3.4, ry: 0, s: 1 }]) {
    const S = runTrack(road(d));
    assert.ok(S.ok && S.wallHits === 0 && Math.abs(S.time - free.time) < 1e-9, d.k);
  }
  assert.ok(runTrack(road({ k: 'pillarThin', y: 0.4, ry: 0.5, s: 1 })).wallHits >= 1);
});
test('le dessus d’un solide porte la voiture (sol : hauteur, normale, sans revêtement) ; caché par la logique, il ne porte plus', () => {
  const tr = road({ k: 'pillar', y: 0.4, ry: 0.7, s: 1, dx: 60 }), d = tr.decos[0], out = {};
  tr.surfaceAt(d.x + 0.5, 20, d.z - 0.5, out, 1.6);
  assert.equal(out.h, 12.4 - 0); assert.equal(out.type, 'road'); assert.equal(out.solid, d); assert.equal(out.ny, 1);
  tr.surfaceAt(d.x + 0.5, 20, d.z - 0.5, out, 1.6, null, 0, new Set([d]));
  assert.equal(out.h, 0, 'caché : retour au terrain');
  tr.surfaceAt(d.x + 3, 20, d.z, out, 1.6);
  assert.notEqual(out.solid, d, 'à côté du pilier (1,6 m de demi-côté, tourné) : pas dessus');
});
test('une poutre dans l’axe, au-dessus d’une bosse : la voiture qui saute s’y cogne la tête (sans choc de côté) et retombe plus tôt', () => {
  const sc = 'start B3 S6 UU DD S8 finish';
  const free = runTrack(build(sc, 0));
  const tr = build(sc, 0), t = tr.tiles.filter((x) => x.t === 'steep')[1];
  tr.addDeco({ k: 'beam', x: t.x * CELL + 16, y: 17, z: t.z * CELL + 16, ry: Math.PI / 2, s: 2 });
  const roof = runTrack(tr);
  assert.ok(free.ok && roof.ok && roof.respawns === 0, roof.reason);
  assert.ok(Math.abs(roof.yMax - (17 - 1.3)) < 0.05 && free.yMax > 21, `plafond : ${roof.yMax.toFixed(2)} m contre ${free.yMax.toFixed(2)} m`);
  assert.ok(roof.airTotal < free.airTotal - 0.8 && roof.wallHits === 0);
});
test('un solide compte pour la course : sa position, sa hauteur et son cap sont dans la signature (pas sa couleur)', () => {
  const a = road({ k: 'pillar', y: 0.4, ry: 0, s: 1, dx: 40 }), sig = a.signature();
  a.decos[0].y = 6; assert.notEqual(a.signature(), sig);
  a.decos[0].y = 0.4; a.decos[0].ry = 0.5; assert.notEqual(a.signature(), sig);
  a.decos[0].ry = 0; a.decos[0].c = 3; assert.equal(a.signature(), sig);
  const back = Track.decode(a.encode());
  assert.equal(back.signature(), a.signature());
  assert.ok(isSolid('gantry') && !isSolid('cube') && !isSolid('spikes'));
});
test('index des solides : un solide long est rangé dans toutes les cases qu’il couvre', () => {
  const tr = new Track('t'); tr.addDeco({ k: 'beam', x: 0, y: 0, z: 0, ry: 0, s: 4, c: 0 });
  const idx = buildSolidGrid(tr.decos);
  assert.equal(idx.list.length, 1);
  assert.ok(idx.grid.size >= 9, 'une poutre de 64 m couvre plusieurs cases de 16 m : ' + idx.grid.size);
  assert.ok(Object.values(SOLIDS).every((s) => s.label && s.parts.length));
});
test('« masquer les décorations » (qualité basse) ne cache jamais un solide : il compte pour la course', () => {
  const tr = road({ k: 'gantry', y: 0.4, ry: 0, s: 1 });
  tr.addDeco({ k: 'tree', x: 200, y: 0, z: 0, ry: 0, s: 1, c: 0 });
  const mats = createTrackMaterials(), keep = renderOptions.hideDecos;
  try {
    renderOptions.hideDecos = false;
    const count = (v) => { let n = 0; for (const m of v.chunkMeshes) n += m.geometry.attributes.position.count; v.dispose(); return n; };
    const n0 = count(new TrackView(tr, mats));
    renderOptions.hideDecos = true;
    const n1 = count(new TrackView(tr, mats)), n2 = count(new TrackView(scriptTrack('t', 'start S12 finish', { l: 0 }), mats));
    assert.ok(n1 < n0, 'l’arbre est caché');
    assert.ok(n1 > n2, 'le portique en poutres reste');
  } finally { renderOptions.hideDecos = keep; }
});

await finish('Étape 1 (chicanes, panneaux, portiques, piliers et poutres) : tout passe.');
