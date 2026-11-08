// Banc d'essai du prototype de rollback (E18, js/net/rollback.js) : la décision go / no-go de docs/ROLLBACK.md.
//   node tools/bench-rollback.mjs [--steps 10000] [--json]
//  1. COÛT : 4 voitures, et à CHAQUE image le pire cas : retour 15 pas en arrière (chargement d'un état, 15 pas rejoués avec leurs sauvegardes), puis le
//     pas présent. Critère : moins de 4 ms par image (95e centile) sur la machine qui fait tourner le banc.
//  2. DÉSYNCHRONISATION : 4 joueurs, chacun son monde ; les commandes des autres arrivent avec 0 à 10 pas de retard et 10 % de paquets perdus (chaque
//     paquet répète les 24 dernières commandes, environ 50 octets : une commande perdue revient dans les paquets suivants, avant la fin de la fenêtre de retour). Critère : au bout de N pas, les 4 mondes sont identiques au bit près à la course de référence (toutes
//     les commandes connues à temps), et aucun joueur n'a dû revenir de plus de 15 pas.
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Autopilot } from '../js/autopilot.js';
import { quantSteer } from '../js/replay.js';
import { RollbackWorld, RollbackPeer } from '../js/net/rollback.js';

const lcg = (s) => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;

// Course de référence : 4 pilotes automatiques (prudents différemment) sur le même circuit, départ en grille : leurs commandes, et l'empreinte du monde.
export function referenceRace(track, players, steps) {
  const W = new RollbackWorld(track, players);
  const bots = W.sims.map((s, i) => { const b = new Autopilot(track.path, { latLimit: 56 * (0.7 + 0.08 * i) }); b.reset(s.phys); return b; });
  const inputs = Array.from({ length: players }, () => []);
  let contacts = 0;
  for (let t = 0; t < steps; t++) {
    const inp = W.sims.map((s, i) => { const x = bots[i].control(s.phys); return { throttle: !!x.throttle, brake: !!x.brake, steer: quantSteer(x.steer), drift: false }; });
    inp.forEach((x, i) => inputs[i].push(x));
    W.step(inp);
    contacts += W.contacts;
    for (let i = 0; i < players; i++) if (W.sims[i].lost) bots[i].reset(W.sims[i].phys);
  }
  return { inputs, hash: W.hash(), world: W, contacts };      // contacts : pas où deux voitures se sont touchées
}

// Les 4 joueurs en réseau simulé ; renvoie leurs empreintes finales et les statistiques.
export function networkRun(track, ref, { players = 4, steps, maxDelay = 10, loss = 0.1, redundancy = 24, seed = 7, maxRollback = 15 } = {}) {
  const rnd = lcg(seed);
  const peers = Array.from({ length: players }, (_, me) => new RollbackPeer(track, players, me, { maxRollback }));
  // Paquets : à chaque pas t, le joueur p envoie à chacun des autres ses commandes t-redundancy+1 … t ; chaque paquet est perdu ou retardé.
  const inbox = Array.from({ length: players }, () => new Map());       // arrivée (pas) -> [[p, t, inp]]
  const post = (to, at, msg) => { const a = inbox[to].get(at) || []; a.push(msg); inbox[to].set(at, a); };
  let clock = 0;
  const sent = new Array(players).fill(0);
  while (peers.some((pr) => pr.world.tick < steps) && clock < steps * 4) {
    // Chaque joueur envoie la commande de son prochain pas dès qu'il l'a (il la connaît : c'est la sienne).
    for (let p = 0; p < players; p++) {
      while (sent[p] <= Math.min(steps - 1, peers[p].world.tick)) {
        const t = sent[p]++;
        peers[p].receive(p, t, ref.inputs[p][t]);
        for (let q = 0; q < players; q++) {
          if (q === p || rnd() < loss) continue;
          const msgs = [];
          for (let k = Math.max(0, t - redundancy + 1); k <= t; k++) msgs.push([p, k, ref.inputs[p][k]]);
          post(q, clock + Math.floor(rnd() * (maxDelay + 1)), msgs);
        }
      }
    }
    for (let q = 0; q < players; q++) {
      for (const msgs of inbox[q].get(clock) || []) for (const [p, t, inp] of msgs) peers[q].receive(p, t, inp);
      inbox[q].delete(clock);
      // (paquets perdus d'affilée : le retard s'allonge ; au-delà de la fin, plus rien ne se perd, pour que tout arrive)
      if (peers[q].world.tick < steps) peers[q].advance();
    }
    clock++;
  }
  // Fin : les paquets encore en route arrivent (un vrai réseau finit par les livrer, ou les renvoie), puis ils corrigent le passé, sans pas en plus.
  for (let q = 0; q < players; q++) for (const [, list] of [...inbox[q].entries()].sort((a, b) => a[0] - b[0])) for (const msgs of list) for (const [p, t, inp] of msgs) peers[q].receive(p, t, inp);
  for (let q = 0; q < players; q++) for (let p = 0; p < players; p++) for (let t = 0; t < steps; t++) peers[q].receive(p, t, ref.inputs[p][t]);
  for (const pr of peers) pr._resim();
  return { hashes: peers.map((pr) => pr.world.hash()), ticks: peers.map((pr) => pr.world.tick), stats: peers.map((pr) => pr.stats), clock };
}

// Pire cas par image : retour de 15 pas, 15 pas rejoués avec sauvegarde, puis le pas présent.
export function frameCost(track, { players = 4, depth = 15, frames = 600, warm = 120 } = {}) {
  const ref = referenceRace(track, players, frames + depth + warm + 5);
  const W = new RollbackWorld(track, players), snaps = [W.save()], times = [];
  const inp = (t) => ref.inputs.map((a) => a[t]);
  for (let t = 0; t < depth; t++) { W.step(inp(t)); snaps.push(W.save()); }
  for (let f = 0; f < frames + warm; f++) {
    const t0 = performance.now();
    const now = W.tick;
    W.load(snaps[now - depth]);
    for (let t = now - depth; t < now; t++) { W.step(inp(t)); snaps[t + 1] = W.save(); }
    W.step(inp(now)); snaps[now + 1] = W.save();
    if (f >= warm) times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const q = (x) => times[Math.min(times.length - 1, Math.floor(x * times.length))];
  return { median: q(0.5), p95: q(0.95), max: times[times.length - 1], mean: times.reduce((a, b) => a + b, 0) / times.length };
}

if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('bench-rollback.mjs')) {           // (aussi importé dans le navigateur par le test)
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
  const steps = arg('--steps', 10000);
  const track = buildBuiltin(BUILTIN_TRACKS.find((d) => d.id === 'eclats') || BUILTIN_TRACKS[0]);
  const cost = frameCost(track);
  const ref = referenceRace(track, 4, steps);
  const t0 = performance.now();
  const net = networkRun(track, ref, { steps });
  const same = net.hashes.every((h) => h === ref.hash), deepest = Math.max(...net.stats.map((s) => s.maxDepth));
  const go = cost.p95 < 4 && same && deepest <= 15;
  const out = { contacts: ref.contacts, machine: `${process.platform} ${process.arch}, Node ${process.version}`, cost, steps, reference: ref.hash, peers: net.hashes, same, stats: net.stats, deepest, seconds: (performance.now() - t0) / 1000, go };
  if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`Coût par image (4 voitures, retour de 15 pas à chaque image) : médiane ${cost.median.toFixed(2)} ms, 95e centile ${cost.p95.toFixed(2)} ms, max ${cost.max.toFixed(2)} ms`);
    console.log(`Course de référence : ${ref.contacts} pas avec contact entre voitures`);
    console.log(`Désynchronisation (${steps} pas, retard 0-10 pas, 10 % de pertes) : ${same ? 'aucune' : 'OUI'} — référence ${ref.hash}, joueurs ${net.hashes.join(' ')}`);
    console.log(`Retours en arrière : ${net.stats.map((s) => `${s.rollbacks} (${s.resimSteps} pas rejoués, ${s.stalls} attentes, au plus ${s.maxDepth})`).join(' · ')}`);
    console.log(go ? 'GO : les deux critères sont tenus sur cette machine.' : 'NO-GO : au moins un critère n’est pas tenu.');
  }
  process.exit(go ? 0 : 1);
}
