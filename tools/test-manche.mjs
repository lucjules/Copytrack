// Multijoueur « manche » (championnat) : barème et classement général, avancement sur le circuit, grille de départ, collisions douces, protocole du salon
// (départ commun, arrivées, clôture, manche suivante, abandon, hôte parti, arrivant en cours de route), annuaire des salons publics.
// node tools/test-manche.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { POINTS, Championship, buildPlaylist, poolFor, liveOrder, pointsFor, MAX_ROUNDS } from '../js/net/championship.js';
import { ProgressTracker, checkpointProgress, gridSpawn, GRID_COLS } from '../js/net/progress.js';
import { softCollide, CAR_R, MAX_DV_STEP } from '../js/net/collide.js';
import { Room, FINISH_GRACE_MS, RESULTS_MS, MAX_ROUND_MS } from '../js/net/room.js';
import { Emitter } from '../js/net/signaling.js';
import { PublicDirectory, cleanListing, describeRoom } from '../js/net/directory.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Simulation } from '../js/simulation.js';
import { Autopilot } from '../js/autopilot.js';
import { PHYS_VER, NET_VER } from '../js/version.js';

const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

console.log('Championnat : barème et classement général');
test('barème : 10, 8, 6, 5, 4, 3, 2, 1 points, rien au-delà de la 8e place', () => {
  assert.deepEqual(POINTS, [10, 8, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual([0, 1, 7, 8, 20].map(pointsFor), [10, 8, 1, 0, 0]);
});
test('une manche : places au temps, abandons derrière sans point, égalité de temps départagée par l\'identifiant', () => {
  const c = new Championship({ rounds: [{ id: 'b-1-a' }, { id: 'b-2-b' }] });
  const r = c.scoreRound(0, { d: null, b: 4100, a: 4000, c: 4100 }, ['a', 'b', 'c', 'd']);
  assert.deepEqual(r.order, ['a', 'b', 'c', 'd']);
  assert.deepEqual(r.points, { a: 10, b: 8, c: 6, d: 0 });
  assert.equal(r.times.d, null);
});
test('un temps invalide (négatif, NaN, zéro) vaut un abandon ; une manche déjà rangée ou hors d\'ordre est ignorée', () => {
  const c = new Championship({ rounds: [{ id: 'b-1-a' }, { id: 'b-2-b' }, { id: 'b-3-c' }] });
  assert.equal(c.scoreRound(1, { a: 1 }), null, 'pas la suivante');
  const r = c.scoreRound(0, { a: -5, b: NaN, c: 0, d: 4000 }, ['a', 'b', 'c', 'd']);
  assert.deepEqual(r.order, ['d', 'a', 'b', 'c']);
  assert.equal(c.scoreRound(0, { a: 1 }), null, 'déjà rangée');
  assert.equal(c.played, 1); assert.equal(c.finished, false); assert.equal(c.nextRound.id, 'b-2-b');
  c.scoreRound(1, { a: 1 }); c.scoreRound(2, { a: 1 });
  assert.equal(c.finished, true); assert.equal(c.nextRound, null);
  assert.equal(c.scoreRound(3, { a: 1 }), null, 'plus de manche');
});
test('classement général : points, puis victoires, puis meilleure somme des places, puis identifiant', () => {
  const c = new Championship({ rounds: [{ id: 'b-1-a' }, { id: 'b-2-b' }, { id: 'b-3-c' }] });
  for (const id of 'abcd') c.setName(id, id.toUpperCase());
  c.scoreRound(0, { a: 1, b: 2, c: 3, d: 4 }, ['a', 'b', 'c', 'd']);       // a 10, b 8, c 6, d 5
  c.scoreRound(1, { b: 1, a: 2, d: 3, c: 4 }, ['a', 'b', 'c', 'd']);       // b 10, a 8, d 6, c 5
  const st = c.standings();
  assert.deepEqual(st.map((r) => [r.id, r.points, r.wins]), [['a', 18, 1], ['b', 18, 1], ['c', 11, 0], ['d', 11, 0]], 'à égalité de points, de victoires et de somme des places : l\'identifiant tranche');
  assert.equal(st[0].name, 'A');
  // Une victoire départage deux joueurs à égalité de points.
  const d = new Championship({ rounds: [{ id: 'b-1-a' }, { id: 'b-2-b' }] });
  d.scoreRound(0, { x: 1, y: 2, z: 3 }, ['x', 'y', 'z']);       // x 10, y 8, z 6
  d.scoreRound(1, { z: 1, y: 2, x: null }, ['x', 'y', 'z']);    // z 10, y 8, x 0
  assert.deepEqual(d.standings().map((r) => [r.id, r.points, r.wins]), [['z', 16, 1], ['y', 16, 0], ['x', 10, 1]], 'à égalité de points (z et y), la victoire de manche départage ; x a gagné la 1re manche mais a fini loin');
});
test('un joueur absent d\'une manche (arrivé après) n\'est pas pénalisé : il garde ses points, il n\'en marque pas', () => {
  const c = new Championship({ rounds: [{ id: 'b-1-a' }, { id: 'b-2-b' }] });
  c.scoreRound(0, { a: 1, b: 2 }, ['a', 'b']);
  c.scoreRound(1, { a: 1, b: 2, n: 3 }, ['a', 'b', 'n']);
  assert.equal(c.standings().find((r) => r.id === 'n').points, 6);
  assert.equal(c.standings().find((r) => r.id === 'n').rounds, 1);
});
test('sérialisation : un arrivant en cours de championnat retrouve exactement le même classement ; rien n\'est cru sur parole', () => {
  const c = new Championship({ id: 'zz', rounds: [{ id: 'b-1-a', name: 'Un' }, { id: 'b-2-b', name: 'Deux' }], collisions: true });
  c.setName('a', 'Ana'); c.setName('b', 'Ben');
  c.scoreRound(0, { a: 4000, b: null }, ['a', 'b']);
  const d = Championship.from(JSON.parse(JSON.stringify(c.toJSON())));
  assert.deepEqual(d.standings(), c.standings()); assert.equal(d.collisions, true); assert.equal(d.total, 2); assert.equal(d.played, 1);
  const bad = Championship.from({ rounds: Array.from({ length: 40 }, (_, i) => ({ id: 'b-' + i })), results: [{ n: 5, times: { a: 1 } }, 7], names: { x: 'y'.repeat(99) } });
  assert.equal(bad.total, MAX_ROUNDS); assert.equal(bad.played, 0, 'une manche hors d\'ordre est ignorée');
  assert.ok([...bad.names.values()][0].length <= 20);
});
test('liveOrder : les arrivés d\'abord (par temps), puis les autres par avancement décroissant', () => {
  const o = liveOrder([{ id: 'a', finished: null, prog: 0.5 }, { id: 'b', finished: 4200, prog: 1 }, { id: 'c', finished: null, prog: 0.9 }, { id: 'd', finished: 4100, prog: 1 }, { id: 'e', finished: null, prog: 0.5 }]);
  assert.deepEqual(o.map((e) => e.id), ['d', 'b', 'c', 'a', 'e']);
});
test('playlist : circuits tous différents, du plus facile au plus dur, tirage reproductible ; sélections', () => {
  const builtins = BUILTIN_TRACKS.map((def) => ({ key: 'b-' + def.id + '-x', def }));
  for (const kind of ['all', 'easy', 'medium', 'hard', 'theme']) {
    const pool = poolFor(builtins, kind, { rounds: 4, random: seeded(3) });
    assert.ok(pool.length >= 4, kind);
    const pl = buildPlaylist(pool, { rounds: 4, random: seeded(9) });
    assert.equal(pl.length, 4); assert.equal(new Set(pl.map((p) => p.id)).size, 4, 'tous différents : ' + kind);
    const diff = pl.map((p) => pool.find((x) => x.key === p.id).difficulty);
    assert.deepEqual(diff, [...diff].sort((a, b) => a - b), 'du plus facile au plus dur : ' + kind);
    assert.deepEqual(buildPlaylist(pool, { rounds: 4, random: seeded(9) }), pl, 'reproductible');
  }
  assert.ok(poolFor(builtins, 'easy').every((x) => x.difficulty <= 2));
  assert.ok(poolFor(builtins, 'hard').every((x) => x.difficulty >= 4));
  const theme = poolFor(builtins, 'theme', { rounds: 3, random: seeded(1) });
  assert.equal(new Set(theme.map((x) => x.decor)).size, 1, 'un seul thème');
  assert.equal(buildPlaylist([{ key: 'a', name: 'A', difficulty: 1 }], { rounds: 5 }).length, 1, 'jamais plus de circuits que disponibles');
  assert.ok(buildPlaylist(builtins.map((b) => ({ key: b.key, difficulty: 1 })), { rounds: 99 }).length <= MAX_ROUNDS);
});

console.log('Avancement sur le circuit et grille de départ');
test('avancement : croissant du départ (0) à l\'arrivée (~1) le long du pilote automatique, y compris sur un circuit à plusieurs tours', () => {
  for (const def of [BUILTIN_TRACKS[0], BUILTIN_TRACKS.find((d) => d.laps > 1)]) {
    const track = buildBuiltin(def), sim = new Simulation(track);
    sim.start();
    const bot = new Autopilot(track.path, { latLimit: 56 * 0.8 });
    bot.reset(sim.phys);
    const pt = new ProgressTracker(track.path);
    assert.ok(pt.available);
    let last = -1, worst = 0, fin = false, i = 0;
    for (; i < 120 * 200 && !fin; i++) {
      const ev = sim.step(bot.control(sim.phys));
      if (sim.lost) { sim.rewind(); }
      if (i % 6 === 0) {
        const p = pt.update(sim.phys.pos, pt.lapRange(sim.logic.lap, sim.logic.laps), !!sim.lost);
        worst = Math.max(worst, last - p);
        last = p;
      }
      if (ev && ev.type === 'finish') fin = true;
    }
    assert.ok(fin, def.id + ' : arrivée');
    assert.ok(last > 0.93 && last <= 1, def.id + ' : avancement final ' + last);
    assert.ok(worst < 0.02, def.id + ' : recul maximal ' + worst);
  }
});
test('avancement : sans ligne centrale on retombe sur les checkpoints, et la progression reste entre 0 et 1', () => {
  assert.equal(new ProgressTracker(null).available, false);
  assert.equal(new ProgressTracker(null).update({ x: 0, y: 0, z: 0 }), null);
  assert.equal(checkpointProgress(0, 3, 1, 1), 0);
  assert.equal(checkpointProgress(3, 3, 1, 1), 0.75);
  assert.equal(checkpointProgress(0, 3, 2, 2), 0.5);
  assert.ok(checkpointProgress(99, 3, 9, 1) <= 1);
});
test('grille : les voitures ne se superposent pas, le premier est devant, huit tiennent sur la case de départ', () => {
  const sp = { x: 100, y: 0.4, z: 50, yaw: Math.PI / 2, gs: 1 };
  const g = Array.from({ length: 8 }, (_, k) => gridSpawn(sp, k, 8));
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) assert.ok(Math.hypot(g[i].x - g[j].x, g[i].z - g[j].z) >= 5.4, `${i}/${j} trop proches`);
  const fwd = [-Math.sin(sp.yaw), -Math.cos(sp.yaw)];
  const ahead = (p) => (p.x - sp.x) * fwd[0] + (p.z - sp.z) * fwd[1];
  assert.ok(ahead(g[0]) > ahead(g[GRID_COLS]), 'la deuxième rangée est derrière la première');
  assert.ok(g.slice(0, GRID_COLS).every((p) => Math.abs(ahead(p)) < 1e-6), 'première rangée : sur la ligne de départ');
  assert.ok(g.every((p) => p.yaw === sp.yaw && p.y === sp.y && p.gs === 1), 'même cap, même hauteur');
  assert.ok(Math.abs(gridSpawn(sp, 0, 1).x - sp.x) < 1e-9 && Math.abs(gridSpawn(sp, 0, 1).z - sp.z) < 1e-9, 'seul : exactement au départ');
  const lat = (p) => { const r = [-fwd[1], fwd[0]]; return (p.x - sp.x) * r[0] + (p.z - sp.z) * r[1]; };
  assert.ok(Math.max(...g.slice(0, 4).map(lat)) < 12 && Math.min(...g.slice(0, 4).map(lat)) > -12, 'reste dans les 24 m de la route');
});

console.log('Collisions douces');
const car = (x, z, vx = 0, vz = 0, y = 0) => ({ pos: { x, y, z }, vel: { x: vx, y: 0, z: vz } });
test('deux voitures qui se chevauchent se repoussent ; trop loin ou à une autre hauteur : rien', () => {
  const a = car(0, 0), b = car(1, 0);
  assert.equal(softCollide(a, [b]), 1);
  assert.ok(a.vel.x < 0 && a.pos.x < 0, 'repoussée vers l\'arrière de l\'autre');
  const far = car(0, 0); assert.equal(softCollide(far, [car(2 * CAR_R + 0.01, 0)]), 0); assert.equal(far.vel.x, 0);
  const above = car(0, 0); assert.equal(softCollide(above, [car(0.5, 0, 0, 0, 3)]), 0, 'pont : on passe dessous');
});
test('rattraper une voiture plus lente : la voiture arrière perd de la vitesse relative, sans rebond brutal', () => {
  const rear = car(0, 0, 0, -40), front = car(0, -2, 0, -30);           // 10 m/s de rapprochement (le -z est l'avant)
  let n = 0;
  while (softCollide(rear, [front]) && n++ < 50) { rear.pos.z += rear.vel.z / 120; front.pos.z += front.vel.z / 120; }
  assert.ok(rear.vel.z > -40 && rear.vel.z < -25, 'vitesse arrière réduite mais pas inversée : ' + rear.vel.z);
  assert.ok(n < 40, 'le contact finit vite : ' + n + ' pas');
});
test('la poussée par pas est plafonnée (douce), même enfoncée de moitié', () => {
  const a = car(0, 0), b = car(0.3, 0);
  const v0 = a.vel.x; softCollide(a, [b]);
  assert.ok(Math.abs(a.vel.x - v0) <= MAX_DV_STEP + 1e-9, 'Δv ' + (a.vel.x - v0));
});
test('deux voitures exactement superposées (même grille) se séparent, sans NaN', () => {
  const a = car(10, 10), b = car(10, 10);
  softCollide(a, [b]); softCollide(b, [a]);
  assert.ok([a.pos.x, a.pos.z, a.vel.x, a.vel.z].every(Number.isFinite));
  assert.ok(Math.hypot(a.vel.x, a.vel.z) > 0);
  const c = car(10, 10, 0, -20); softCollide(c, [car(10, 10)]); assert.ok([c.vel.x, c.vel.z].every(Number.isFinite));
});
test('échange symétrique : chacun applique sa moitié, la quantité de mouvement totale ne dérive pas', () => {
  const a = car(0, 0, 10, 0), b = car(1.6, 0, -10, 0);
  const sum0 = a.vel.x + b.vel.x;
  softCollide(a, [{ pos: b.pos, vel: b.vel }]); softCollide(b, [{ pos: a.pos, vel: a.vel }]);
  assert.ok(Math.abs(a.vel.x + b.vel.x - sum0) < 1.0, 'somme ' + (a.vel.x + b.vel.x));
  assert.ok(a.vel.x < 10 && b.vel.x > -10, 'ils se freinent mutuellement');
});

// ---- Salon : réseau simulé en mémoire --------------------------------------------------------------------------------
function lan(ids, { code = 'ABC234' } = {}) {
  const clock = { t: 1000 };
  const reg = new Map(), rooms = [];
  const sigFor = (id) => {
    const sig = new Emitter(); sig.peers = new Map(); sig.id = id;
    sig.join = async (meta) => { sig.meta = meta; for (const [oid, o] of reg) sig.peers.set(oid, o.meta); reg.set(id, sig); for (const [oid, o] of reg) if (oid !== id) { o.peers.set(id, meta); o.emit('join', id, meta); } };
    sig.track = (meta) => { sig.meta = meta; for (const [oid, o] of reg) if (oid !== id) { o.peers.set(id, meta); o.emit('meta', id, meta); } };
    sig.send = () => true;
    sig.leave = () => { reg.delete(id); for (const o of reg.values()) { o.peers.delete(id); o.emit('leave', id); } };
    return sig;
  };
  const makeMesh = ({ selfId, handlers }) => ({
    selfId, handlers, sent: [],
    addPeer() {}, removePeer() {}, closeAll() {}, broadcastState() {},
    sendCtl(msg, to) {
      const m = JSON.parse(JSON.stringify(msg)); this.sent.push([m, to]);
      for (const r of [...rooms]) if (r.selfId !== selfId && !r.closed && (!to || r.selfId === to)) r._onMessage(selfId, 'ctl', m);
    },
  });
  const opts = (name, selfId) => ({ name, selfId, code, makeSignaling: ({ selfId: s }) => sigFor(s), makeMesh, now: () => clock.t });
  const open = () => { for (const r of rooms) for (const o of rooms) if (r !== o && !r.closed && !o.closed && r.members.has(o.selfId)) r._onLink(o.selfId, 'open'); };
  const env = { clock, rooms, open, events: {} };
  const spy = (r) => {
    const ev = env.events[r.selfId] = { start: [], round: [], stop: 0, wait: [], cup: 0 };
    r.on('start', (e) => ev.start.push(e)); r.on('cupround', (e) => ev.round.push(e)); r.on('cupstop', () => ev.stop++); r.on('cupwait', (e) => ev.wait.push(e)); r.on('cup', () => ev.cup++);
  };
  env.add = async (name, id) => { const r = rooms.length ? await Room.join(code, opts(name, id)) : await Room.create(opts(name, id)); rooms.push(r); spy(r); return r; };
  env.end = () => { for (const r of rooms) r.leave(); };
  return env;
}
const ROUNDS = [{ id: 'b-un-a1', name: 'Un' }, { id: 'b-deux-b2', name: 'Deux' }];

console.log('Championnat : protocole du salon');
await test('un championnat de bout en bout : départ commun sur la grille, arrivées, clôture, manche suivante, classement final', async () => {
  const env = lan(); const [a, b, c] = [await env.add('Ana', 'a'), await env.add('Ben', 'b'), await env.add('Cléo', 'c')];
  env.open();
  assert.equal(b.startCup({ rounds: ROUNDS }), false, 'un invité ne lance pas de championnat');
  assert.equal(a.startCup({ rounds: [] }), false); assert.equal(a.startCup({ rounds: [{ id: 'u:abc' }] }), false, 'pas de circuit à code ici');
  assert.equal(a.startCup({ rounds: ROUNDS, collisions: true }), true);
  for (const [i, r] of [a, b, c].entries()) {
    const st = env.events[r.selfId].start; assert.equal(st.length, 1, r.selfId);
    assert.deepEqual([st[0].trackId, st[0].cup.n, st[0].cup.total, st[0].cup.slot, st[0].cup.count, st[0].cup.collisions], ['b-un-a1', 0, 2, i, 3, true]);
    assert.equal(st[0].startLocal, 1000 + 4000);
    assert.equal(r.cup.names.get('b'), 'Ben', 'les noms voyagent avec la manche');
  }
  // Arrivées : b puis c ; la manche reste ouverte tant qu'Ana roule.
  assert.equal(b.reportFinish(4100), true); assert.equal(b.reportFinish(4000), false, 'un seul temps par manche');
  c.reportFinish(4300);
  assert.equal(a.cupState.phase, 'racing');
  assert.deepEqual(a.liveEntries(() => 0.5).map((e) => [e.id, e.finished]), [['a', null], ['b', 4100], ['c', 4300]]);
  a.reportFinish(3900);
  for (const r of [a, b, c]) {
    const ev = env.events[r.selfId].round; assert.equal(ev.length, 1, r.selfId);
    assert.deepEqual(ev[0].result.order, ['a', 'b', 'c']); assert.deepEqual(ev[0].result.points, { a: 10, b: 8, c: 6 });
    assert.equal(ev[0].final, false); assert.equal(ev[0].nextIn, RESULTS_MS); assert.equal(r.cupState.phase, 'results');
  }
  // Manche suivante : pas avant la fin du délai, puis départ pour tous (la grille suit le classement).
  env.clock.t += RESULTS_MS - 1; a._cupTick(); assert.equal(env.events.a.start.length, 1);
  env.clock.t += 1; a._cupTick();
  for (const r of [a, b, c]) { const st = env.events[r.selfId].start; assert.equal(st.length, 2, r.selfId); assert.deepEqual([st[1].trackId, st[1].cup.n], ['b-deux-b2', 1]); }
  assert.deepEqual(env.events.a.start[1].cup.roster, ['a', 'b', 'c'], 'le meilleur devant');
  // Deuxième manche : Cléo gagne, Ana abandonne (pas de temps) : clôturée par le délai de grâce.
  c.reportFinish(5000); b.reportFinish(5200);
  env.clock.t += FINISH_GRACE_MS; a._cupTick(); assert.equal(env.events.a.round.length, 1, 'pas encore : la grâce est « plus de 30 s »');
  env.clock.t += 1; a._cupTick();
  const fin = env.events.b.round[1];
  assert.equal(fin.final, true); assert.equal(fin.nextIn, 0);
  assert.deepEqual(fin.result.order, ['c', 'b', 'a']); assert.equal(fin.result.times.a, null);
  assert.deepEqual(fin.standings.map((r) => [r.id, r.points, r.wins]), [['c', 16, 1], ['b', 16, 0], ['a', 10, 1]], 'c et b à égalité : la victoire de manche de c les départage');
  for (const r of [a, b, c]) { assert.equal(r.cup.finished, true); assert.equal(r.cupState.phase, 'done'); }
  env.clock.t += 60000; a._cupTick(); assert.equal(env.events.a.start.length, 2, 'championnat fini : plus de manche');
  env.end();
});
await test('un joueur qui quitte ne bloque pas la manche ; si c\'est l\'hôte, l\'identifiant le plus petit prend la suite et clôt', async () => {
  const env = lan(); const [a, b, c] = [await env.add('Ana', 'a'), await env.add('Ben', 'b'), await env.add('Cléo', 'c')];
  env.open(); a.startCup({ rounds: ROUNDS });
  c.leave();                                                               // Cléo part : plus rien à attendre d'elle
  b.reportFinish(4000);
  assert.equal(env.events.a.round.length, 0, 'Ana roule encore');
  a.leave();                                                               // l'hôte part
  assert.equal(b.isHost, true);
  b._cupTick();
  const ev = env.events.b.round; assert.equal(ev.length, 1, 'la manche est close par le nouvel hôte');
  assert.deepEqual(ev[0].result.order, ['b', 'a', 'c']); assert.deepEqual(ev[0].result.points, { b: 10, a: 0, c: 0 });
  env.clock.t += RESULTS_MS; b._cupTick();
  assert.equal(env.events.b.start.length, 2, 'le nouvel hôte lance la manche suivante');
  assert.deepEqual(env.events.b.start[1].cup.roster, ['b'], 'seul sur la grille');
  b.leave();
});
await test('plafond : une manche qui ne se termine jamais est close au bout de 10 minutes', async () => {
  const env = lan(); const a = await env.add('Ana', 'a'); await env.add('Ben', 'b');
  env.open(); a.startCup({ rounds: ROUNDS });
  env.clock.t += MAX_ROUND_MS + 4000; a._cupTick(); assert.equal(env.events.a.round.length, 0, 'dix minutes depuis le « GO », pas avant');
  env.clock.t += 1; a._cupTick();
  assert.deepEqual(env.events.a.round[0].result.points, { a: 0, b: 0 });
  env.end();
});
await test('seul l\'hôte conduit le championnat : messages d\'un invité, mauvaise manche, joueur hors grille, temps absurdes ignorés', async () => {
  const env = lan(); const a = await env.add('Ana', 'a'); await env.add('Ben', 'b'); const c = await env.add('Cléo', 'c');
  env.open(); a.startCup({ rounds: ROUNDS });
  const before = env.events.c.start.length;
  c._onMessage('b', 'ctl', { k: 'round', n: 1, roster: ['a', 'b', 'c'], names: {}, startIn: 4000 });
  c._onMessage('b', 'ctl', { k: 'rend', n: 0, times: { a: 1, b: 2, c: 3 }, nextIn: 5 });
  c._onMessage('b', 'ctl', { k: 'cupstop' });
  c._onMessage('b', 'ctl', { k: 'cup', cup: { rounds: [{ id: 'b-x-1' }] } });
  assert.equal(env.events.c.start.length, before); assert.equal(c.cupState.phase, 'racing'); assert.equal(env.events.c.stop, 0); assert.equal(c.cup.total, 2);
  a._onMessage('b', 'ctl', { k: 'finish', steps: 4000, rn: 1 }); assert.equal(a.cupState.finishes.size, 0, 'mauvais numéro de manche');
  a._onMessage('zzz', 'ctl', { k: 'finish', steps: 4000, rn: 0 }); assert.equal(a.cupState.finishes.size, 0, 'hors grille');
  a._onMessage('b', 'ctl', { k: 'finish', steps: -3, rn: 0 }); a._onMessage('b', 'ctl', { k: 'finish', steps: 1e12, rn: 0 }); a._onMessage('b', 'ctl', { k: 'finish', steps: 'x', rn: 0 });
  assert.equal(a.cupState.finishes.size, 0, 'temps absurdes');
  a._onMessage('b', 'ctl', { k: 'finish', steps: 4000 });                       // temps du mode libre : sans effet en championnat
  assert.equal(a.cupState.finishes.size, 0); assert.equal(a.results.size, 0);
  a._onMessage('b', 'ctl', { k: 'finish', steps: 4000, rn: 0 }); a._onMessage('b', 'ctl', { k: 'finish', steps: 3000, rn: 0 });
  assert.equal(a.cupState.finishes.get('b'), 4000, 'le premier temps compte');
  // L'hôte envoie des temps pour des joueurs hors grille ou absurdes dans « rend » : nettoyés.
  c._onMessage('a', 'ctl', { k: 'rend', n: 0, times: { a: 3000, b: -1, c: 1e12, intrus: 10 }, nextIn: 5000 });
  assert.deepEqual(env.events.c.round[0].result.times, { a: 3000, b: null, c: null });
  c._onMessage('a', 'ctl', { k: 'rend', n: 0, times: { a: 1 }, nextIn: 5000 }); assert.equal(env.events.c.round.length, 1, 'une manche close ne se clôt pas deux fois');
  env.end();
});
await test('un résultat manqué est rattrapé au départ suivant ; arrêter le championnat remet tout le monde au salon', async () => {
  const env = lan(); const [a, b] = [await env.add('Ana', 'a'), await env.add('Ben', 'b')];
  env.open(); a.startCup({ rounds: ROUNDS });
  // Ben « manque » la clôture de la manche 0 (liaison coupée un instant) : le message « rend » ne lui parvient pas.
  const hear = b._onMessage.bind(b);
  b._onMessage = (from, kind, data) => (data && data.k === 'rend' ? undefined : hear(from, kind, data));
  a.reportFinish(4000); b.reportFinish(4100);
  assert.equal(a.cup.played, 1); assert.equal(b.cup.played, 0, 'Ben n\'a pas reçu les résultats');
  b._onMessage = hear;
  env.clock.t += RESULTS_MS; a._cupTick();
  assert.equal(b.cup.played, 1, 'le résultat de la manche 0 voyage avec le départ de la manche 1');
  assert.equal(env.events.b.start.length, 2);
  assert.deepEqual(b.cup.standings().map((r) => [r.id, r.points]), [['a', 10], ['b', 8]]);
  assert.equal(a.stopCup(), true); assert.equal(b.cup, null); assert.equal(env.events.b.stop, 1); assert.equal(a.cup, null);
  assert.equal(b.stopCup(), false, 'un invité n\'arrête rien');
  env.end();
});
await test('un arrivant en cours de championnat reçoit le championnat, suit la manche sans la courir, puis part à la suivante', async () => {
  const env = lan(); const [a, b] = [await env.add('Ana', 'a'), await env.add('Ben', 'b')];
  env.open(); a.startCup({ rounds: ROUNDS });
  const d = await env.add('Dan', 'd');
  env.open();                                                                // les liaisons s'ouvrent : l'hôte envoie le championnat à Dan
  assert.equal(d.cup.total, 2); assert.equal(d.cupState.phase, 'racing'); assert.deepEqual(d.cupState.roster, ['a', 'b']);
  assert.equal(env.events.d.start.length, 0, 'il ne démarre pas une manche déjà commencée');
  assert.equal(d.cupActive, true);
  a.reportFinish(4000); b.reportFinish(4100);
  assert.equal(env.events.d.round.length, 1, 'il voit les résultats');
  env.clock.t += RESULTS_MS; a._cupTick();
  assert.equal(env.events.d.start.length, 1); assert.equal(env.events.d.start[0].cup.slot, 2); assert.equal(env.events.d.start[0].cup.count, 3);
  assert.deepEqual(d.cup.standings().map((r) => [r.id, r.points]).sort(), [['a', 10], ['b', 8], ['d', 0]], 'même classement que les autres, sans point pour lui');
  env.end();
});
await test('un départ libre de l\'hôte met fin au championnat ; en championnat, l\'arrivée en mode libre n\'est pas prise pour un temps de manche', async () => {
  const env = lan(); const [a, b] = [await env.add('Ana', 'a'), await env.add('Ben', 'b')];
  env.open(); a.selectTrack({ id: 'b-un-a1', name: 'Un' }); a.startCup({ rounds: ROUNDS });
  a.start();
  assert.equal(a.cup, null); assert.equal(b.cup, null, 'tout le monde est revenu en mode libre');
  env.end();
});
console.log('Règles de la partie (0.9.25)');
await test('l\'hôte choisit des règles : elles arrivent validées à tous, y compris à un arrivant tardif ; un invité ne peut pas en imposer', async () => {
  const env = lan(); const [a, b] = [await env.add('Ana', 'a'), await env.add('Ben', 'b')];
  env.open();
  b.setRules({ g0: 40 }); assert.equal(a.rules, null, 'un invité ne choisit pas les règles');
  a.setRules({ g0: 40, veh0: 'moto', obstacles: 'off', sameCars: 1, laps: 99, bogus: 1 });
  assert.deepEqual(b.rules, { laps: 5, g0: 40, veh0: 'moto', v0: -1, offroad: -1, obstacles: 'off', sameCars: 1 }, 'bornées et nettoyées à l\'arrivée');
  const c = await env.add('Cléo', 'c'); env.open();
  assert.equal(c.rules && c.rules.g0, 40, 'un arrivant reçoit les règles');
  // un message hostile d'un invité est ignoré ; des règles par défaut les effacent
  b._onMessage('b', 'ctl', { k: 'rules', r: { g0: 250 } }); assert.equal(c.rules.g0, 40);
  a.setRules({}); assert.equal(a.rules, null); assert.equal(b.rules, null); assert.equal(c.rules, null);
  env.end();
});

await test('NET_VER : le salon refuse un hôte qui parle un autre protocole', async () => {
  const env = lan(); const a = await env.add('Ana', 'a');
  assert.equal(a.meta.net, NET_VER); assert.equal(a.meta.v, PHYS_VER);
  a.meta.net = NET_VER - 1; a.signaling.track(a.meta);
  await assert.rejects(() => env.add('Zoé', 'z'), (e) => e.code === 'version', 'même physique, autre protocole : refusé');
  env.end();
});

console.log('Annuaire des salons publics');
test('fiche : valide, bornée, d\'une version compatible seulement ; jamais de balisage', () => {
  const ok = { room: { code: 'ABC234', host: 'Ana', track: 'Un', players: 3, max: 8, mode: 'cup', round: 2, rounds: 4, v: PHYS_VER, net: NET_VER } };
  assert.deepEqual(cleanListing(ok), { code: 'ABC234', host: 'Ana', track: 'Un', players: 3, max: 8, mode: 'cup', round: 2, rounds: 4 });
  for (const bad of [null, {}, { room: null }, { room: { ...ok.room, code: 'abc' } }, { room: { ...ok.room, code: 'ABC0O1' } }, { room: { ...ok.room, v: PHYS_VER - 1 } }, { room: { ...ok.room, net: NET_VER + 1 } }]) assert.equal(cleanListing(bad), null);
  const wild = cleanListing({ room: { ...ok.room, host: '<img src=x onerror=1>' + 'z'.repeat(99), track: 'a\u0000b', players: 1e9, mode: 'x', round: -4, rounds: 'x' } });
  assert.ok(!/[<>]/.test(wild.host) && wild.host.length <= 20); assert.equal(wild.track, 'ab'); assert.equal(wild.players, 8); assert.equal(wild.mode, 'free'); assert.equal(wild.round, 0); assert.equal(wild.rounds, 0);
});
await test('l\'hôte annonce sa fiche, qui suit le salon et disparaît quand il part ; un observateur voit la liste sans y figurer', async () => {
  const board = new Map();
  const make = ({ selfId, observe }) => {
    const sig = new Emitter(); sig.peers = new Map();
    sig.join = async (meta) => { sig.meta = meta; if (!observe) { board.set(selfId, sig); for (const o of board.values()) if (o !== sig && o.watch) { o.peers.set(selfId, meta); o.emit('join', selfId, meta); } } else { sig.watch = true; for (const [id, o] of board) sig.peers.set(id, o.meta); board.set(selfId + '#obs', sig); } };
    sig.track = (meta) => { sig.meta = meta; for (const o of board.values()) if (o !== sig && o.watch) { o.peers.set(selfId, meta); o.emit('meta', selfId, meta); } };
    sig.leave = () => { board.delete(selfId); board.delete(selfId + '#obs'); for (const o of board.values()) if (o.watch && o.peers.delete(selfId)) o.emit('leave', selfId); };
    return sig;
  };
  const env = lan(); const room = await env.add('Ana', 'a');
  room.cup = null;
  const dirHost = new PublicDirectory({ makeSignaling: make, selfId: 'h' }), dirGuest = new PublicDirectory({ makeSignaling: make, selfId: 'g' });
  const seen = [];
  const stop = await dirGuest.watch((rows) => seen.push(rows));
  assert.deepEqual(seen.at(-1), []);
  await dirHost.announce(describeRoom(room));
  assert.equal(seen.at(-1).length, 1); assert.equal(seen.at(-1)[0].code, 'ABC234'); assert.equal(seen.at(-1)[0].players, 1); assert.equal(seen.at(-1)[0].mode, 'free');
  room.selectTrack({ id: 'b-un-a1', name: 'Un' });
  await dirHost.announce(describeRoom(room));
  assert.equal(seen.at(-1)[0].track, 'Un', 'mise à jour');
  dirHost.retract();
  assert.deepEqual(seen.at(-1), [], 'la fiche disparaît');
  stop(); dirHost.close(); dirGuest.close(); env.end();
});

await finish('Tous les tests du multijoueur « manche » passent.');
