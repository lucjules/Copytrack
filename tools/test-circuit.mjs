// Modèle de circuit : table des règles, schéma d'une pièce, options incompatibles : node tools/test-circuit.mjs   (npm test)
//  - chaque règle de course (RULES) : valeur par défaut, bornes, code de partage, signature ;
//  - chaque champ d'une pièce survit au code de partage, à la signature (sauf visuels) et à l'historique de l'éditeur (TILE_FIELDS) ;
//  - les options incompatibles (OPTION_CONFLICTS) : une seule description, trois comportements cohérents.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { Track, RULES, TILE_FIELDS, tileToRow, rowToTile } from '../js/track.js';
import { PIECES, OPTION_CONFLICTS, flagAllowed, armOption, clearConflicts } from '../js/pieces.js';
import { VEHICLES } from '../js/constants.js';

const lcg = (s) => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const ligne = () => { const t = new Track('t'); t.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); t.add({ t: 'finish', x: 0, z: -1, l: 0, r: 0 }); return t; };

console.log('Règles de course');
test('chaque règle a sa valeur par défaut sur un circuit neuf, après clear() et après resetRules()', () => {
  const t = new Track('t');
  for (const r of RULES) assert.equal(t[r.key], r.def, r.key);
  t.setParams({ offroad: true, v0: 120, g0: 40, veh0: 'moto', flip0: true });
  t.clear();
  for (const r of RULES) assert.equal(t[r.key], r.def, 'clear ' + r.key);
});
test('les règles sont bornées : vitesse 0-300, gravité 15-250, véhicule connu, booléens', () => {
  const t = new Track('t');
  t.setParams({ v0: 9999, g0: 5, veh0: 'avion', offroad: 'oui', flip0: 1 });
  assert.deepEqual(t.rulesState(), { offroad: 1, v0: 300, g0: 15, veh0: 'car', flip0: true });
  t.setParams({ v0: -4, g0: 9999, veh0: 'glider' });
  assert.deepEqual([t.v0, t.g0, t.veh0], [0, 250, 'glider']);
  t.setParams({});                                                  // rien de précisé : rien ne change
  assert.deepEqual([t.v0, t.g0, t.veh0], [0, 250, 'glider']);
  assert.ok(VEHICLES.includes(t.veh0));
});
test('setParams accepte aussi un autre circuit (les mêmes champs sont lus)', () => {
  const a = new Track('a'); a.setParams({ desc: 'Test', v0: 80, flip0: true });
  const b = new Track('b'); b.setParams(a);
  assert.equal(b.desc, 'Test'); assert.deepEqual(b.rulesState(), a.rulesState());
});
test('chaque règle voyage dans le code de partage, et seulement si elle n\'a pas sa valeur par défaut', () => {
  const t = ligne();
  const vide = JSON.parse(atob(t.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/')));
  for (const r of RULES) assert.equal(r.code in vide, false, 'absente par défaut : ' + r.code);
  t.setParams({ offroad: 1, v0: 150, g0: 60, veh0: 'boat', flip0: true });
  const back = Track.decode(t.encode());
  assert.deepEqual(back.rulesState(), t.rulesState());
  assert.equal(back.signature(), t.signature());
});
test('la signature change avec chaque règle (sinon un record serait partagé entre deux règles)', () => {
  const sigs = new Set([ligne().signature()]);
  for (const p of [{ offroad: 1 }, { v0: 100 }, { g0: 50 }, { veh0: 'moto' }, { flip0: true }]) { const t = ligne(); t.setParams(p); sigs.add(t.signature()); }
  assert.equal(sigs.size, 6);
});
test('un circuit sans règle ni option reste en format 3 ; la gravité inversée au départ passe en format 4', () => {
  const v = (t) => JSON.parse(atob(t.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/'))).v;
  assert.equal(v(ligne()), 3);
  const t = ligne(); t.setParams({ v0: 90 }); assert.equal(v(t), 3);
  t.setParams({ flip0: true }); assert.equal(v(t), 4);
});
test('clone() copie la description et toutes les règles', () => {
  const t = ligne(); t.setParams({ desc: 'Bonjour', offroad: 1, v0: 70, g0: 130, veh0: 'glider', flip0: true });
  const c = t.clone();
  assert.equal(c.desc, 'Bonjour'); assert.deepEqual(c.rulesState(), t.rulesState());
});

console.log('Schéma d\'une pièce');
const specs = (n, seed) => {
  const r = lcg(seed), types = ['straight', 'curve', 'bigcurve', 'platform', 'steep', 'slope', 'crv1', 'cv1', 'loop', 'tube', 'twist', 'bank', 'fork', 'ring'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = { t: types[Math.floor(r() * types.length)], x: Math.floor(r() * 40) - 20, z: Math.floor(r() * 40) - 20, l: 2 + Math.floor(r() * 8), r: Math.floor(r() * 4) };
    for (const [k, p, v] of [['v', 0.2, 1], ['o', 0.2, 1], ['nb', 0.3, 1], ['tn', 0.2, 1], ['mv', 0.2, 1 + Math.floor(r() * 3)], ['cp', 0.2, 1], ['tb', 0.2, 1], ['th', 0.3, 1 + Math.floor(r() * 3)]]) if (r() < p) s[k] = v;
    if (r() < 0.3) { s.s = ['ice', 'boost', 'bounce', 'wind', 'gravity', 'conveyor', 'glass'][Math.floor(r() * 7)]; s.p = 100; }
    if (r() < 0.2) s.col = { road: '#aabbcc', line: '#112233' };
    if (s.t === 'fork' && r() < 0.5) { s.s2 = 'ice'; s.p2 = 100; }
    out.push(s);
  }
  return out;
};
test('TILE_FIELDS couvre tous les champs que Track.normalize produit (un champ ajouté sans y figurer ferait perdre des données à l\'annulation)', () => {
  const champs = Object.keys(Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0 })).sort();
  assert.deepEqual(TILE_FIELDS.map(([k]) => k).sort(), champs);
});
test('une pièce survit à l\'aller-retour de l\'historique : tileToRow puis rowToTile redonne la même pièce', () => {
  let n = 0;
  for (const s of specs(400, 7)) {
    const t = Track.normalize(s);
    const back = Track.normalize(rowToTile(tileToRow(t)));
    assert.deepEqual(back, t, JSON.stringify(s)); n++;
  }
  assert.equal(n, 400);
});
test('une pièce survit au code de partage : tous ses champs, options et couleurs comprises', () => {
  const t = new Track('t');
  let posees = 0;
  specs(300, 99).forEach((s, i) => { s.x = (i % 20) * 4; s.z = Math.floor(i / 20) * 4; if (t.add(s)) posees++; });
  assert.ok(posees > 200);
  const back = Track.decode(t.encode());
  assert.equal(back.tiles.length, t.tiles.length);
  t.tiles.forEach((tile, i) => assert.deepEqual(back.tiles[i], tile, 'pièce ' + i));
});
test('la signature voit chaque champ qui change le jeu, et ignore thème et couleurs (modifier une couleur ne doit pas invalider une vérification)', () => {
  const sig = (patch) => { const t = new Track('t'); t.add({ t: 'straight', x: 0, z: 0, l: 3, r: 0, ...patch }); return t.signature(); };
  const ref = sig({});
  for (const patch of [{ s: 'ice', p: 100 }, { v: 1 }, { nb: 1 }, { tn: 1 }, { mv: 1 }, { cp: 1 }, { tb: 1 }, { o: 1 }, { l: 4 }, { r: 1 }]) assert.notEqual(sig(patch), ref, JSON.stringify(patch));
  assert.equal(sig({ th: 2 }), ref); assert.equal(sig({ col: { road: '#ffffff' } }), ref);
  const mv = (ms, ma) => sig({ mv: 1, ms, ma });
  assert.notEqual(mv(150, 0), mv(0, 0)); assert.notEqual(mv(0, 4), mv(0, 0));
});

console.log('Options incompatibles');
const FLAGS = Object.keys(OPTION_CONFLICTS);
test('la table des incompatibilités est symétrique (le mouvement et le tunnel cohabitent)', () => {
  for (const a of FLAGS) for (const b of OPTION_CONFLICTS[a]) assert.ok(OPTION_CONFLICTS[b].includes(a), `${a} exclut ${b} mais pas l'inverse`);
  assert.ok(!OPTION_CONFLICTS.mv.includes('tn') && !OPTION_CONFLICTS.tn.includes('mv'));
});
test('armOption : choisir une option retire exactement ses incompatibles, pas les autres', () => {
  for (const a of FLAGS) for (const b of FLAGS) {
    if (a === b) continue;
    const val = (f) => (f === 'o' ? 1 : f === 'mv' ? 2 : 1);
    const o = armOption(armOption({}, b, val(b)), a, val(a));
    assert.ok(o[a], `${a} doit rester armé`);
    assert.equal(!!o[b], !OPTION_CONFLICTS[a].includes(b), `${a} après ${b}`);
  }
});
test('armOption : le sol retire aussi le plafond ; recliquer une option la retire ; thème et bordures ne gênent personne', () => {
  assert.deepEqual([armOption(armOption({}, 'v', 1), 'o', 0).v, armOption(armOption({}, 'v', 1), 'o', 0).o], [0, 0]);
  assert.equal(armOption(armOption({}, 'tn', 1), 'tn', 1).tn, 0);
  const o = armOption(armOption(armOption({}, 'mv', 1), 'th', 2), 'nb', 1);
  assert.deepEqual([o.mv, o.th, o.nb], [1, 2, 1]);
});
test('flagAllowed refuse sur une pièce un drapeau incompatible avec un autre déjà posé', () => {
  for (const [a, vals] of [['o', [1]], ['tn', [1]], ['mv', [1, 2, 3]], ['tb', [1]], ['cp', [1]]]) {
    for (const b of OPTION_CONFLICTS[a]) {
      const tile = { [b]: 1 };
      for (const val of vals) assert.equal(flagAllowed('straight', a, tile, val), false, `${a} sur une pièce qui a déjà ${b}`);
    }
  }
  assert.equal(flagAllowed('straight', 'tn', { mv: 1 }, 1), true);
  assert.equal(flagAllowed('straight', 'mv', { tn: 1 }, 1), true);
});
test('toggleFlag : le plafond et l\'orientation retirent les incompatibles ; les autres sont refusés', () => {
  const t = new Track('t');
  const tile = t.add({ t: 'straight', x: 0, z: 0, l: 5, r: 0, tn: 1, mv: 1 });
  assert.equal(t.toggleFlag(tile, 'cp', 1), false, 'checkpoint refusé : tunnel et mouvement');
  assert.equal(t.toggleFlag(tile, 'o', 1), true);
  assert.deepEqual([tile.o, tile.tn, tile.mv, tile.v], [1, 0, 0, 0], 'le mur retire tunnel et mouvement');
  assert.equal(t.toggleFlag(tile, 'v', 1), true);
  assert.deepEqual([tile.v, tile.o], [1, 0], 'le plafond retire le mur');
  assert.equal(t.toggleFlag(tile, 'mv', 1), false, 'mouvement refusé au plafond');
});
test('clearConflicts remet à zéro les réglages d\'un mouvement retiré, sans en créer sur un simple jeu d\'options', () => {
  const p = clearConflicts({ mv: 2, ms: 150, ma: 3 }, 'tb');
  assert.deepEqual([p.mv, p.ms, p.ma], [0, 0, 0]);
  const o = clearConflicts({ mv: 2 }, 'tb');
  assert.equal(o.mv, 0); assert.equal('ms' in o, false);
  assert.ok(PIECES.straight);
});

await finish('Tous les tests du modèle de circuit passent.');
