// Continuité physique des circuits (phase 1 après l'audit 0.9.59) : js/connect.js (raccords), js/continuity.js (vérificateur), matrice de compatibilité
// des pièces (tools/matrice-pieces.mjs, js/pieceFacts.js) : node tools/test-continuite.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { Track, scriptTrack } from '../js/track.js';
import { PIECES, LEGACY_TILE, flagAllowed } from '../js/pieces.js';
import { tileEnds, placementsAfter, compatiblePlacement, rollGap, endsTouch, ROLL_TOLERANCE } from '../js/connect.js';
import { continuityIssues, issueText } from '../js/continuity.js';
import { orientationIssues } from '../js/joins.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { PIECE_FACTS } from '../js/pieceFacts.js';
import { computeMatrix, renderFacts, buildChain, COLS } from './matrice-pieces.mjs';

const codes = (tr, level) => continuityIssues(tr).filter((i) => !level || i.level === level).map((i) => i.code);
const S = (s, l = 4) => scriptTrack('t', s, { l });

console.log('Raccords (connect.js)');
test('chaque type de pièce a ses extrémités : deux bouts (une bifurcation : trois), sauf anneaux et plateformes', () => {
  for (const type of Object.keys(PIECES)) {
    const e = tileEnds(Track.normalize({ t: type, x: 0, z: 0, l: 8, r: 0 }));
    const k = PIECES[type].kind;
    assert.equal(e.length, k === 'ring' || k === 'area' ? 0 : k === 'fork' ? 3 : 2, type);
    for (const x of e) for (const v of [x.x, x.y, x.z, x.dx, x.dy, x.dz, x.nx, x.ny, x.nz]) assert.ok(Number.isFinite(v), type);
  }
});
test('toute pièce à deux bouts se raccorde à elle-même : placementsAfter retrouve la pièce suivante, à n\'importe quel cap et niveau', () => {
  for (const type of Object.keys(PIECES)) {
    if (['ring', 'area', 'fork'].includes(PIECES[type].kind) || LEGACY_TILE[type]) continue;
    for (const r of [0, 1, 2, 3]) for (const l of [6, 9.5]) {
      const a = Track.normalize({ t: type, x: 3, z: -2, l, r });
      const exit = tileEnds(a).find((e) => e.exit);
      const c = placementsAfter(exit, type, {});
      if (!c.length) continue;      // (une montée en L ou un tube ne se prolonge pas par elle-même : testé par la matrice)
      for (const t of c) { const got = tileEnds(Track.normalize(t)).find((e) => e.entry); assert.ok(endsTouch(exit, got), `${type} r${r} l${l}`); }
    }
  }
});
test('une ligne droite se raccorde à la suivante au bon cap, et la case suivante est celle du cap (nord = z − 1)', () => {
  const a = Track.normalize({ t: 'straight', x: 0, z: 0, l: 4, r: 0 });
  const n = compatiblePlacement(tileEnds(a).find((e) => e.exit), 'straight');
  assert.deepEqual([n.x, n.z, n.l, n.r], [0, -1, 4, 0]);
  const b = Track.normalize({ t: 'straight', x: 0, z: 0, l: 4, r: 1 });
  const m = compatiblePlacement(tileEnds(b).find((e) => e.exit), 'straight');
  assert.deepEqual([m.x, m.z, m.r], [1, 0, 1]);
});
test('roulis : sol contre mur ≈ 90°, endroit contre envers ≈ 180°, mur gauche contre mur droit ≈ 180°', () => {
  const g = tileEnds(Track.normalize({ t: 'straight', x: 0, z: 0, l: 8, r: 0 }))[1];
  const w1 = tileEnds(Track.normalize({ t: 'straight', x: 0, z: -1, l: 8, r: 0, o: 1 }))[0];
  const w2 = tileEnds(Track.normalize({ t: 'straight', x: 0, z: -1, l: 8, r: 0, o: 2 }))[0];
  const c = tileEnds(Track.normalize({ t: 'straight', x: 0, z: -1, l: 8, r: 0, v: 1 }))[0];
  assert.ok(Math.abs(rollGap(g, w1) - Math.PI / 2) < 0.01);
  assert.ok(Math.abs(rollGap(g, c) - Math.PI) < 0.01);
  assert.ok(Math.abs(rollGap(w1, w2) - Math.PI) < 0.01);
  assert.ok(rollGap(g, g) < ROLL_TOLERANCE);
});

console.log('\nVérificateur de continuité (continuity.js)');
test('vrille sans « Inversion de gravité » : erreur « invert » avec où / pourquoi / conséquence / remède ; avec le revêtement, plus rien', () => {
  const bad = continuityIssues(S('start S2 TW S2^ TWB S2 finish'));
  const i = bad.find((x) => x.code === 'invert');
  assert.ok(i && i.level === 'error');
  assert.match(i.why, /Vrille \(case 0, -4, niveau 4\)/);
  assert.match(i.effect, /tombe/);
  assert.match(i.fix, /Inversion de gravité/);
  assert.match(issueText(i), /Vrille/);
  assert.deepEqual(codes(S('start S2 TW.f S2^ TWB.f S2 finish'), 'error'), []);
  assert.deepEqual(codes(S('start S2 TW.f S2^ TWB.f S2 finish'), 'warn'), []);
});
test('autres pièces qui retournent la voiture sans gravité : transition retournée (wall → sol posée à l\'envers), montée en L à l\'envers', () => {
  // transition « mur → sol » posée à l'envers = « mur → plafond » sans autoFlip : même famille que la vrille
  const t = new Track('t');
  const add = (o) => t.add(Track.normalize({ x: 0, z: 0, l: 10, r: 0, ...o }));
  add({ t: 'start', z: 0 }); add({ t: 'straight', z: -1 }); add({ t: 'tr01s', z: -2 }); add({ t: 'straight', z: -3, o: 1 });
  add({ t: 'tr10s', z: -4, v: 1 });
  assert.ok(codes(t).includes('invert'), codes(t).join());
  // le même enchaînement, avec la vraie transition vers le plafond : propre
  assert.deepEqual(codes(S('start S2 [tr01s] S2< [tr13s] S3^ [tr31s] S2< [tr10s] S2 finish', 8), 'error'), []);
});
test('raccord de roulis : mur gauche contre mur droit, sol contre plafond ; un seul constat par raccord (pas un par sens) et pas de cascade de gravité', () => {
  const a = continuityIssues(S('start S2 [tr01s] S2< [tr20s] S2 finish'));
  assert.equal(a.filter((i) => i.code === 'roll-mismatch').length, 1);
  assert.match(a.find((i) => i.code === 'roll-mismatch').fix, /repasse par le sol/);
  const b = continuityIssues(S('start S2 S2^ finish'));
  assert.equal(b.filter((i) => i.code === 'roll-mismatch').length, 2);                   // sol → plafond, puis plafond → arrivée au sol
  assert.equal(b.filter((i) => i.code === 'gravity').length, 0, 'la gravité n\'est pas propagée à travers un raccord déjà signalé');
  assert.match(b.find((i) => i.code === 'roll-mismatch').fix, /Vrille/);
});
test('gravité : route retournée abordée en gravité normale / route à l\'endroit abordée en gravité inversée ; le départ au plafond (v ou règle) donne la bonne gravité', () => {
  // départ à l'endroit, puis un tronçon au plafond relié sans retournement : le raccord est déjà signalé, on teste la gravité sur un enchaînement SANS roulis incompatible
  const t = new Track('t');
  t.add(Track.normalize({ t: 'start', x: 0, z: 0, l: 10, r: 0, v: 1 }));
  t.add(Track.normalize({ t: 'straight', x: 0, z: -1, l: 10, r: 0, v: 1 }));
  t.add(Track.normalize({ t: 'finish', x: 0, z: -2, l: 10, r: 0, v: 1 }));
  assert.deepEqual(codes(t, 'error'), [], 'départ au plafond : gravité inversée d\'office (placeAtStart)');
  const u = new Track('u');
  u.add(Track.normalize({ t: 'start', x: 0, z: 0, l: 10, r: 0 }));
  u.add(Track.normalize({ t: 'straight', x: 0, z: -1, l: 10, r: 0 }));
  u.add(Track.normalize({ t: 'finish', x: 0, z: -2, l: 10, r: 0 }));
  u.setParams({ flip0: true });
  assert.ok(codes(u).includes('gravity'), 'règle « gravité inversée au départ » sur un circuit à l\'endroit : la voiture traverse la route');
});
test('raccord manqué de peu : un demi-niveau d\'écart se voit, avec l\'écart chiffré et un remède ; un raccord parfait ne dit rien', () => {
  const t = new Track('t');
  t.add(Track.normalize({ t: 'start', x: 0, z: 0, l: 4, r: 0 }));
  t.add(Track.normalize({ t: 'straight', x: 0, z: -1, l: 4, r: 0 }));
  t.add(Track.normalize({ t: 'straight', x: 0, z: -2, l: 4.5, r: 0 }));
  t.add(Track.normalize({ t: 'finish', x: 0, z: -3, l: 4.5, r: 0 }));
  const n = continuityIssues(t).filter((i) => i.code === 'near-miss');
  assert.equal(n.length, 1);
  assert.match(n[0].why, /0,5 niveau d'écart en hauteur/);
  assert.match(n[0].fix, /touches E \/ C/);
  assert.deepEqual(continuityIssues(S('start S3 finish')).filter((i) => i.code === 'near-miss'), []);
});
test('rupture de pente : conseil (info) avec vitesse de décollage et temps de vol ; les pièces « Courbe » à profil adouci n\'en déclenchent pas', () => {
  const brk = continuityIssues(S('start S2 U S2 finish')).filter((i) => i.code === 'slope-break');
  assert.equal(brk.length, 1);
  assert.equal(brk[0].level, 'info');
  assert.match(brk[0].effect, /à 120 km\/h elle reste environ 0,7 s/, brk[0].effect);       // mesuré : 0,68 s (docs/AUDIT-EXPERIENCE-0.9.59.md §3.2)
  assert.equal(continuityIssues(S('start S2 [crv1] [cro1] S2 finish')).filter((i) => i.code === 'slope-break').length, 0);
  assert.equal(continuityIssues(S('start S2 [cdi1] [dn2] [cdo1] S2 finish')).filter((i) => i.code === 'slope-break').length, 0);
});
test('route sur un mur : un seul conseil par suite de pièces murales, avec le seuil de 108 km/h', () => {
  const w = continuityIssues(S('start S2 [tr01s] S4< [tr10s] S2 finish')).filter((i) => i.code === 'wall-speed');
  assert.equal(w.length, 1);
  assert.match(w[0].effect, /108 km\/h/);
  assert.equal(w[0].level, 'info');
});
test('les conseils (info) ne comptent pas : un circuit correct n\'a ni erreur ni avertissement', () => {
  for (const s of ['start S2 U S2 finish', 'start S2 [tr01s] S4< [tr10s] S2 finish', 'start S2 O S2 finish', 'start S2 TW.f S2^ TWB.f S2 finish', 'start S2 BR S2 finish']) {
    assert.deepEqual(codes(S(s, 8), 'error').concat(codes(S(s, 8), 'warn')), [], s);
  }
});
test('les 72 circuits officiels : aucune erreur ni avertissement de continuité (zéro faux positif sur le contenu validé)', () => {
  for (const d of BUILTIN_TRACKS) {
    const bad = continuityIssues(buildBuiltin(d)).filter((i) => i.level !== 'info');
    assert.deepEqual(bad.map((i) => i.code + ' ' + i.why), [], d.id);
  }
});
test('orientationIssues (joins.js) reste valable ; chaque raccord qu\'il signale est aussi un « roll-mismatch » du nouveau vérificateur', () => {
  for (const s of ['start S2 [tr01s] S2< [tr20s] S2 finish', 'start S2 [tr01s] S2< S2 finish']) {
    const tr = S(s);
    const old = orientationIssues(tr);
    if (!old.length) continue;
    assert.ok(codes(tr).includes('roll-mismatch'), s);
  }
});
test('circuit vide, départ seul, circuit de 5 000 pièces : aucun plantage, temps raisonnable', () => {
  assert.deepEqual(continuityIssues(new Track('v')), []);
  const one = new Track('u'); one.add(Track.normalize({ t: 'start', x: 0, z: 0, l: 2, r: 0 }));
  assert.ok(Array.isArray(continuityIssues(one)));
  const big = new Track('b');
  big.add(Track.normalize({ t: 'start', x: 0, z: 0, l: 2, r: 0 }));
  for (let z = 1; z < 2500; z++) big.add(Track.normalize({ t: 'straight', x: 0, z: -z, l: 2, r: 0 }));
  for (let z = 1; z < 2500; z++) big.add(Track.normalize({ t: 'straight', x: 3, z: -z, l: 2, r: 0 }));
  const t0 = Date.now();
  continuityIssues(big);
  assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
});

console.log('\nMatrice de compatibilité (tools/matrice-pieces.mjs)');
const matrix = computeMatrix();
test('la matrice est complète : chaque type (hors anciens) × 4 orientations, chaque case a un code connu', () => {
  const types = Object.keys(PIECES).filter((t) => !LEGACY_TILE[t]);
  assert.deepEqual(Object.keys(matrix).sort(), types.sort());
  for (const [t, row] of Object.entries(matrix)) for (const c of COLS) {
    const code = row.cells[c.id].code;
    assert.ok(/^(OK|SAUT|CHUTE|RACCORD|—|n\/a|v≥\d+)$/.test(code), `${t}/${c.id} : ${code}`);
  }
});
test('« — » exactement là où l\'éditeur refuse l\'orientation (flagAllowed), sans écart', () => {
  for (const [type, row] of Object.entries(matrix)) {
    if (row.cells.sol.code === 'n/a') continue;
    const tile = { t: type, v: 0, o: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0 };
    assert.equal(row.cells.murG.code === '—', !flagAllowed(type, 'o', tile, 1), `${type} mur gauche`);
    assert.equal(row.cells.murD.code === '—', !flagAllowed(type, 'o', tile, 2), `${type} mur droit`);
    assert.equal(row.cells.plafond.code === '—', !flagAllowed(type, 'v', tile, 1), `${type} plafond`);
  }
});
test('la matrice ne change pas sans qu\'on le décide (tools/compat/matrice-pieces.json) : une évolution de physique ou de géométrie la fait échouer', () => {
  assert.equal(JSON.stringify(matrix, null, 1) + '\n', readFileSync(new URL('./compat/matrice-pieces.json', import.meta.url), 'utf8'));
});
test('js/pieceFacts.js est exactement la table générée de la matrice', () => {
  assert.equal(renderFacts(matrix), readFileSync(new URL('../js/pieceFacts.js', import.meta.url), 'utf8'));
  for (const [t, row] of Object.entries(matrix)) for (const c of COLS) assert.equal(PIECE_FACTS[t][c.id], row.cells[c.id].code);
});
test('le vérificateur est d\'accord avec la physique : une case « OK » ou « SAUT » ne produit ni erreur ni avertissement ; une case « CHUTE » en produit au moins un', () => {
  let ok = 0, chute = 0;
  for (const [type, row] of Object.entries(matrix)) for (const col of COLS) {
    const code = row.cells[col.id].code;
    if (!['OK', 'SAUT', 'CHUTE'].includes(code) && !code.startsWith('v≥')) continue;
    const chain = buildChain(type, col.opts);
    if (chain.fail) continue;
    const bad = continuityIssues(chain.track).filter((i) => i.level !== 'info');
    if (code === 'CHUTE') { chute++; assert.ok(bad.length, `${type}/${col.id} : la matrice dit CHUTE, le vérificateur ne dit rien`); }
    else { ok++; assert.deepEqual(bad.map((i) => i.code), [], `${type}/${col.id} (${code}) : faux positif`); }
  }
  assert.ok(ok > 150 && chute >= 20, `${ok} cases saines, ${chute} chutes`);
});
test('constats de la matrice (documentés dans docs/MATRICE-PIECES.md) : vrille et transitions retournées au sol sans gravité = CHUTE ; les loopings et le tire-bouchon passent', () => {
  assert.equal(matrix.twist.cells.sol.code, 'CHUTE');
  for (const t of ['tr10s', 'tr20s', 'tr10l', 'tr20l']) assert.equal(matrix[t].cells.plafond.code, 'CHUTE', t);
  for (const t of ['loop', 'loopBig', 'loopDouble', 'cork', 'corkL', 'tube', 'bank']) assert.ok(['OK', 'SAUT'].includes(matrix[t].cells.sol.code) || matrix[t].cells.sol.code.startsWith('v≥'), t + ' ' + matrix[t].cells.sol.code);
});

finish('Continuité, raccords et matrice de compatibilité : tout passe.');
