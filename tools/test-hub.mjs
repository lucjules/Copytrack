// Race Hub : descripteur de circuit et mini-carte : node tools/test-hub.mjs   (npm test)
// Le descripteur remplace les options de lancement écrites à la main dans chaque écran : elles doivent rester EXACTEMENT les mêmes.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track, hashString } from '../js/track.js';
import { dailyChallenge } from '../js/daily.js';
import { goalFor, nextBuiltinIndex, CHAPTER_SIZE } from '../js/career.js';
import { describeBuiltin, describeDaily, describeUser, describeCommunity, personalRecord, trackLength, chapterLock } from '../js/trackDescriptor.js';
import { mapGeometry, fitView } from '../js/ui/trackMap.js';

const builtins = BUILTIN_TRACKS.map((def, index) => { const track = buildBuiltin(def); return { def, track, index, key: `b-${def.id}-${hashString(track.encode())}` }; });
const total = builtins.length;
const noRecords = () => null;

console.log('Descripteur de circuit');
test('carrière : les options de lancement sont celles de playBuiltin d’avant (72 circuits)', () => {
  for (const b of builtins) {
    const i = b.index;
    const old = { trackKey: b.key, medals: b.def.medals, difficulty: b.def.difficulty, hasNext: nextBuiltinIndex(i, total) != null, builtinIndex: i, seed: b.key, goal: goalFor(b.def, i), goalKey: b.key + '#goal' };
    const d = describeBuiltin(b, { total, builtins, getRecord: noRecords });
    assert.deepEqual(d.launch, old, b.def.id);
    assert.equal(d.track, b.track, 'le circuit n’est pas copié');
    assert.equal(d.key, b.key); assert.equal(d.name, b.def.name); assert.equal(d.stars, b.def.difficulty);
    assert.deepEqual(d.recordKeys, [b.key]);
  }
});
test('défi du jour, code ouvert, Mes circuits, communauté : mêmes options qu’avant', () => {
  const c = dailyChallenge('2026-03-14');
  assert.deepEqual(describeDaily(c).launch, { trackKey: c.key, medals: c.medals, difficulty: 3, seed: c.key, daily: true });
  const tr = Track.decode(builtins[3].track.encode());
  assert.deepEqual(describeUser(tr).launch, { trackKey: tr.userKey, userEntry: null, seed: tr.name, userMap: true, medals: tr.derivedMedals, difficulty: 2 });
  const du = describeUser(tr, { id: 'abc', name: 'Le mien' });
  assert.deepEqual(du.launch, { trackKey: tr.userKey, userEntry: 'abc', seed: tr.name, userMap: true, medals: tr.derivedMedals, difficulty: 2 });
  assert.equal(du.name, 'Le mien');
  assert.deepEqual(du.recordKeys, [tr.userKey, 'u-' + hashString(tr.encode())], 'ancienne clé de « Mes circuits » comprise');
  const row = { id: 'r1', name: 'Publié', description: 'Super', players: { name: 'Zoé' }, plays: 12, likes: 3, author_time: 31.5 };
  const dc = describeCommunity(tr, row);
  assert.deepEqual(dc.launch, { trackKey: tr.userKey, seed: tr.name, userMap: true, medals: tr.derivedMedals, difficulty: 2, community: 'r1' });
  assert.deepEqual([dc.name, dc.author, dc.desc, dc.plays, dc.likes, dc.authorTime], ['Publié', 'Zoé', 'Super', 12, 3, 31.5]);
});
test('verrou de chapitre : même règle que la carte de la carrière', () => {
  assert.equal(chapterLock(0, builtins, noRecords), null, 'le chapitre 1 est toujours ouvert');
  assert.match(chapterLock(CHAPTER_SIZE, builtins, noRecords), /Chapitre verrouillé : gagne \d+ médailles au chapitre 1\./);
  // Toutes les médailles d'or au chapitre 1 : le chapitre 2 s'ouvre.
  const gold = (k) => { const b = builtins.find((x) => x.key === k); return b && b.index < CHAPTER_SIZE ? { time: b.def.medals.or } : null; };
  assert.equal(chapterLock(CHAPTER_SIZE, builtins, gold), null);
  assert.equal(describeBuiltin(builtins[CHAPTER_SIZE], { total, builtins, getRecord: noRecords }).locked !== null, true);
});
test('record personnel : la première clé qui en a un', () => {
  const tr = Track.decode(builtins[1].track.encode());
  const d = describeUser(tr);
  const legacy = 'u-' + hashString(tr.encode());
  assert.equal(personalRecord(d, (k) => (k === legacy ? { time: 9 } : null)).time, 9);
  assert.equal(personalRecord(d, noRecords), null);
});
test('longueur : ligne de course pour les circuits scriptés, pièces posées sinon (jamais nulle)', () => {
  for (const b of builtins) {
    const L = trackLength(b.track);
    assert.equal(L.kind, 'race', b.def.id); assert.ok(L.m > 200 && L.m < 20000, `${b.def.id} : ${L.m} m`);
    const u = trackLength(Track.decode(b.track.encode()));
    assert.equal(u.kind, 'pieces'); assert.ok(u.m > 100, `${b.def.id} en code joueur : ${u.m} m`);
  }
});

console.log('Mini-carte');
test('géométrie : départ, arrivée et checkpoints repérés sur les 72 circuits', () => {
  for (const b of builtins) {
    const g = mapGeometry(b.track);
    assert.ok(g.markers.start && g.markers.finish || b.track.laps > 1 && g.markers.start, `${b.def.id} : départ / arrivée`);
    assert.ok(g.items.length >= b.track.tiles.length - 1, b.def.id);
    const cps = g.markers.checkpoints;
    if (cps.length) {
      assert.deepEqual(cps.map((c) => c.n).sort((x, y) => x - y), cps.map((_, i) => i + 1), `${b.def.id} : numéros des checkpoints (ordre de la ligne de course)`);
    }
  }
});
test('sans ligne de course (circuit de l’éditeur), les checkpoints ne sont pas numérotés', () => {
  const b = builtins.find((x) => mapGeometry(x.track).markers.checkpoints.length);
  const g = mapGeometry(Track.decode(b.track.encode()));
  assert.ok(g.markers.checkpoints.length > 0);
  assert.ok(g.markers.checkpoints.every((c) => c.n === undefined));
});
test('zones, pièces mobiles et obstacles sont repérés', () => {
  const zones = new Set(builtins.flatMap((b) => mapGeometry(b.track).zones));
  for (const z of ['boost', 'ice', 'water']) assert.ok(zones.has(z), z);
  assert.ok(builtins.some((b) => mapGeometry(b.track).markers.movers.length), 'pièces mobiles');
  assert.ok(builtins.some((b) => mapGeometry(b.track).markers.obstacles.length), 'obstacles');
});
test('cadrage : le circuit tient dans la vue, centré', () => {
  const v = fitView({ minX: 0, maxX: 100, minZ: 0, maxZ: 50 }, 220, 120, 10);
  assert.equal(v.s, 2);
  assert.equal(v.ox, 10); assert.equal(v.oz, 10);
  const w = fitView({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, 100, 100, 6);
  assert.ok(Number.isFinite(w.s) && w.s > 0, 'circuit d’une seule case');
});

await finish('Tous les tests du Race Hub passent.');
