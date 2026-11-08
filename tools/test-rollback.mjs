// Prototype de rollback (E18, js/net/rollback.js) : état sauvegardé et restauré au bit près, chocs entre voitures déterministes et symétriques, réseau
// simulé (retards, pertes) sans désynchronisation, attente quand une commande manque trop longtemps. node tools/test-rollback.mjs   (npm test)
// La mesure complète (10 000 pas, coût par image) : node tools/bench-rollback.mjs ; décision : docs/ROLLBACK.md.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { RollbackWorld, RollbackPeer, collideCars, CAR_R } from '../js/net/rollback.js';
import { referenceRace, networkRun } from './bench-rollback.mjs';
import { scriptTrack } from '../js/track.js';

const track = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'eclats') || BUILTIN_TRACKS[0]);
const ref = referenceRace(track, 4, 900);
const inp = (t) => ref.inputs.map((a) => a[t]);

test('le monde à 4 voitures est déterministe : deux mondes, mêmes commandes, même empreinte ; départ en grille, les voitures se touchent', () => {
  const W = new RollbackWorld(track, 4);
  for (let t = 0; t < 900; t++) W.step(inp(t));
  assert.equal(W.hash(), ref.hash);
  assert.ok(ref.contacts > 50, 'des contacts entre voitures : ' + ref.contacts);
  const xs = new RollbackWorld(track, 4).sims.map((s) => s.phys.pos.x + s.phys.pos.z);
  assert.equal(new Set(xs).size, 4, 'quatre places de grille différentes');
});
test('sauvegarder, avancer, revenir et rejouer redonne le même monde au bit près (300 retours au hasard, de 1 à 15 pas)', () => {
  const A = new RollbackWorld(track, 4), B = new RollbackWorld(track, 4), snaps = new Map([[0, B.save()]]);
  let s = 99, n = 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let t = 0; t < 900; t++) {
    A.step(inp(t));
    if (t > 20 && rnd() < 0.35) { const k = 1 + Math.floor(rnd() * 15); B.load(snaps.get(t - k)); for (let u = t - k; u < t; u++) { B.step(inp(u)); snaps.set(B.tick, B.save()); } n++; }
    B.step(inp(t)); snaps.set(B.tick, B.save());
    assert.equal(B.hash(), A.hash(), 'pas ' + t);
  }
  assert.ok(n > 250);
});
test('chocs entre voitures : séparés à parts égales, quantité de mouvement conservée, rien au-dessus d\'un pont', () => {
  const car = (x, z, vx, y = 0) => ({ phys: { pos: { x, y, z }, vel: { x: vx, y: 0, z: 0 }, rib: null }, logic: { finished: false } });
  const a = car(0, 0, 10), b = car(1.5, 0, -10);
  assert.equal(collideCars([a, b]), 1);
  assert.ok(Math.abs(a.phys.vel.x + b.phys.vel.x) < 1e-12, 'somme des vitesses : 0');
  assert.ok(a.phys.vel.x < 0 && b.phys.vel.x > 0, 'ils rebondissent');
  assert.ok(Math.abs((b.phys.pos.x - a.phys.pos.x) - 2 * CAR_R) < 1e-12, 'plus de chevauchement');
  assert.equal(collideCars([car(0, 0, 0), car(0.5, 0, 0, 3)]), 0, 'pont : rien');
  const c = car(5, 5, 0), d = car(5, 5, 0); collideCars([c, d]);
  assert.ok([c.phys.pos.x, d.phys.pos.x].every(Number.isFinite) && c.phys.pos.x !== d.phys.pos.x, 'superposées : séparées sans NaN');
});
test('réseau simulé (4 joueurs, retards de 0 à 10 pas, 10 % de pertes) : aucune désynchronisation, retours de 15 pas au plus', () => {
  const r = networkRun(track, ref, { steps: 900 });
  assert.deepEqual(r.hashes, [ref.hash, ref.hash, ref.hash, ref.hash]);
  for (const st of r.stats) { assert.ok(st.rollbacks > 50 && st.maxDepth <= 15, JSON.stringify(st)); }
});
test('une commande qui manque depuis 15 pas : le joueur attend au lieu de deviner indéfiniment ; elle arrive : il rattrape, juste', () => {
  const P = new RollbackPeer(track, 2, 0, { maxRollback: 15 });
  for (let t = 0; t < 40; t++) { P.receive(0, t, inp(t)[0]); if (t < 5) P.receive(1, t, inp(t)[1]); }
  let moved = 0;
  for (let i = 0; i < 40; i++) if (P.advance()) moved++;
  assert.equal(P.world.tick, 5 + 15, 'il s\'arrête 15 pas après la dernière commande reçue de l\'autre');
  assert.ok(P.stats.stalls > 0);
  for (let t = 5; t < 40; t++) P.receive(1, t, inp(t)[1]);
  while (P.world.tick < 40) P.advance();
  P._resim();
  const W = new RollbackWorld(track, 2);
  for (let t = 0; t < 40; t++) W.step([inp(t)[0], inp(t)[1]]);
  assert.equal(P.world.hash(), W.hash());
  assert.ok(moved > 0);
});
test('limite du prototype : un circuit à logique (E10) est refusé, plutôt que de désynchroniser', () => {
  const t = scriptTrack('l', 'start S3 C S3 finish');
  t.tiles[2].g = 2;
  t.setLogic({ rules: [{ on: ['cp', 1], do: [['hide', 2]] }] });
  assert.throws(() => new RollbackWorld(t, 2), /sans logique/);
});

await finish('Tous les tests du prototype de rollback passent.');
