// Intégrité globale (phase 4) : node tools/test-integrite.mjs   (npm test)
// Circuits, sauvegardes, records, fantômes, validation serveur et parcours COMPLET du joueur, avec les nouvelles possibilités 3D (roulis, rubans roulés, obstacles roulés).
//   1. la signature d'un circuit (clé des classements) change dès que la PHYSIQUE change, et seulement alors ;
//   2. un code relu ne perd rien, et ce qu'une lecture perd est DIT (pièces inconnues, options retirées) ;
//   3. sauvegardes locales : atomiques, validées, quarantaine des données abîmées, rien d'effacé sans trace ;
//   4. records et fusion cloud : un temps abîmé ne l'emporte jamais ; les anciennes physiques restent lisibles ;
//   5. validation serveur : circuit modifié après la course, temps ou version falsifiés, courses incomplètes ;
//   6. parcours complet : créer → enregistrer → recharger → courir → record → serveur → classement → fantôme / replay, et ses cas d'erreur.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

// ---- Navigateur simulé : un stockage persistant (survit à un « rechargement »), avec quota et pannes injectables -------------------------------------
class Store {
  constructor() { this.m = new Map(); this.quota = Infinity; this.failKeys = null; this.writes = 0; }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    v = String(v);
    this.writes++;
    if (this.failKeys && this.failKeys(k, this.writes)) throw new Error('QuotaExceededError');
    const used = [...this.m.entries()].reduce((n, [kk, vv]) => n + (kk === k ? 0 : kk.length + vv.length), 0);
    if (used + k.length + v.length > this.quota) throw new Error('QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k) { this.m.delete(k); }
}
const disk = new Store();
globalThis.localStorage = new Proxy(disk, { ownKeys: () => [...disk.m.keys()], getOwnPropertyDescriptor: (t, k) => (disk.m.has(k) ? { enumerable: true, configurable: true, value: disk.m.get(k) } : undefined) });
globalThis.sessionStorage = new Store();
const reset = () => { disk.m.clear(); disk.quota = Infinity; disk.failKeys = null; disk.writes = 0; };
// « Recharger la page » : le stockage reste, tous les modules sont ré-évalués (l'état en mémoire, dont la copie des records de la session, repart de zéro).
let gen = 0;
const fresh = async (file) => import(`${file}?reload=${++gen}`);

const { Track, scriptTrack, lossText, lossBlocking, hashString } = await import('../js/track.js');
const { BUILTIN_TRACKS, buildBuiltin } = await import('../js/tracks.js');
const { PHYS_VER } = await import('../js/version.js');
const { Simulation } = await import('../js/simulation.js');
const { Autopilot } = await import('../js/autopilot.js');
const { InputRecorder, quantSteer, GhostRunner, encodeGhost, decodeGhost } = await import('../js/replay.js');
const { verifyRun, verifyPublish, trackForKey, replayRun } = await import('../js/verify.js');
const { createHandler } = await import('../supabase/functions/submit-score/handler.js');
const { mergeSaves } = await import('../js/cloudsave.js');
const { parseGhost } = await import('../js/ghostFormat.js');
const { buildSeq, pathOf } = await import('./chain3d.mjs');
const { baseY } = await import('../js/pieces.js');
const { MAX_RUN_SECONDS } = await import('../js/constants.js');

const SEQ3D = [['straight'], ['straight', { o: 3 }], ['straight', { o: 1 }], ['loop', { o: 1 }], ['straight', { o: 1 }], ['straight'], ['twist', { o: 3 }], ['straight'], ['finish']];
const built3d = () => { const b = buildSeq(SEQ3D, { level: 24 }); assert.equal(b.failed, ''); return b; };

// Course enregistrée comme le fait le jeu : le pilote automatique, ses commandes encodées, le temps obtenu.
function recordRun(track, { latLimit = 56 * 0.8, speedCap = 0 } = {}) {
  const sim = new Simulation(track), rec = new InputRecorder();
  sim.start();
  const bot = new Autopilot(track.path, { latLimit });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 150; i++) {
    const inp = bot.control(sim.phys);
    if (speedCap && sim.phys.speed * 3.6 > speedCap) { inp.throttle = false; }
    inp.steer = quantSteer(inp.steer);
    rec.push(inp, false);
    const ev = sim.step(inp);
    if (sim.lost) sim.rewind();
    if (ev && ev.type === 'finish') return { inputs: rec.encode(), time: sim.logic.time, splits: sim.logic.splits.slice() };
  }
  throw new Error('le pilote automatique ne termine pas');
}

console.log('1. Signature des circuits (clé des classements) : toute modification de la physique la change');
const richCode = () => {
  const b = built3d();
  b.tr.addDeco({ k: 'spikes', x: 40.0, y: 100.0, z: 40.0, ry: 0.5, s: 1, ph: 0.25, rz: Math.PI / 2 });
  b.tr.addDeco({ k: 'bumper', x: 80.0, y: 100.0, z: 80.0, ry: 0, s: 1.5 });
  b.tr.addDeco({ k: 'tree', x: 5, y: 0, z: 5, ry: 0, s: 1, c: 0 });
  b.tr.setParams({ grip: 90 });
  return b.tr.encode();
};
test('chaque champ PHYSIQUE d\'une pièce, d\'un obstacle ou des règles, modifié, change la signature ; chaque champ purement visuel ne la change pas', () => {
  const code = richCode();
  const sig0 = Track.decode(code).signature();
  const sigOf = (f) => { const t = Track.decode(code); f(t); return t.signature(); };
  const physical = {
    'pièce : type': (t) => { t.tiles[2].t = 'curve'; }, 'pièce : x': (t) => { t.tiles[2].x += 1; }, 'pièce : z': (t) => { t.tiles[2].z += 1; }, 'pièce : niveau': (t) => { t.tiles[2].l += 1; }, 'pièce : cap': (t) => { t.tiles[2].r = (t.tiles[2].r + 1) & 3; },
    'pièce : revêtement': (t) => { t.tiles[2].s = 'ice'; }, 'pièce : réglage': (t) => { t.tiles[2].s = 'boost'; t.tiles[2].p = 150; }, 'pièce : à l\'envers': (t) => { t.tiles[2].v = 1 - t.tiles[2].v; },
    'pièce : roulis 45°': (t) => { t.tiles[2].o = t.tiles[2].o === 3 ? 4 : 3; }, 'pièce : roulis 135°': (t) => { t.tiles[2].o = 5; }, 'pièce : sans bordures': (t) => { t.tiles[2].nb = 1 - t.tiles[2].nb; }, 'pièce : tunnel': (t) => { t.tiles[2].tn = 1; },
    'pièce : checkpoint': (t) => { t.tiles[2].cp = 1; }, 'pièce : anneau turbo': (t) => { t.tiles[2].tb = 1; }, 'pièce : mouvement': (t) => { t.tiles[2].mv = 1; }, 'pièce : vitesse du mouvement': (t) => { t.tiles[2].mv = 2; t.tiles[2].ms = 150; },
    'pièce : 2e revêtement': (t) => { t.tiles[2].s2 = 'ice'; },
    'obstacle : x': (t) => { t.decos[0].x += 0.2; }, 'obstacle : y': (t) => { t.decos[0].y += 0.2; }, 'obstacle : z': (t) => { t.decos[0].z += 0.2; }, 'obstacle : cap': (t) => { t.decos[0].ry += 0.05; },
    'obstacle : taille': (t) => { t.decos[0].s = 1.5; }, 'obstacle : phase': (t) => { t.decos[0].ph = 0.5; }, 'obstacle : ROULIS (phase 3)': (t) => { t.decos[0].rz = -Math.PI / 2; }, 'obstacle : roulis retiré': (t) => { delete t.decos[0].rz; },
    'obstacle : type': (t) => { t.decos[0].k = 'bumper'; }, 'obstacle : supprimé': (t) => { t.decos.splice(0, 1); },
    'règle : adhérence': (t) => { t.setParams({ grip: 70 }); }, 'règle : vent': (t) => { t.setParams({ wind: 40 }); }, 'règle : pluie': (t) => { t.setParams({ rain: 30 }); }, 'règle : profil physique': (t) => { t.setParams({ pm: 'sim' }); },
    'règle : tours': (t) => { t.laps = 3; },
  };
  const visual = {
    'pièce : thème': (t) => { t.tiles[2].th = 2; }, 'pièce : couleurs': (t) => { t.tiles[2].col = { road: '#112233' }; }, 'nom': (t) => { t.name = 'Autre nom'; }, 'description': (t) => { t.desc = 'Autre description'; },
  };
  for (const [name, f] of Object.entries(physical)) assert.notEqual(sigOf(f), sig0, `${name} : la signature doit changer`);
  assert.equal(sigOf(() => {}), sig0);
  for (const [name, f] of Object.entries(visual)) assert.equal(sigOf(f), sig0, `${name} : la signature ne doit pas changer`);
  // (les décorations, même sans contact, ET le décor sont dans la signature : prudent, jamais un trou ; modifier un arbre change la clé de classement)
  assert.notEqual(sigOf((t) => { t.decos[2].x += 3; }), sig0);
});
test('FAILLE CORRIGÉE : deux circuits qui ne diffèrent que par le roulis d\'un obstacle n\'ont plus la même clé de classement (avant la phase 4, rz n\'était pas dans la signature)', () => {
  const mk = (rz) => { const t = scriptTrack('x', 'start S4 finish', { l: 4 }); t.addDeco({ k: 'spikes', x: 16, y: baseY({ l: 4 }) + 3, z: -70, ry: 0, s: 1, ...(rz ? { rz } : {}) }); return t; };
  assert.notEqual(mk(0).userKey, mk(Math.PI).userKey);
  assert.notEqual(mk(0).signatureText(), mk(Math.PI / 2).signatureText(), 'la signature forte (SHA-256 côté serveur) vient du même texte : la collision est détectée');
  // et la différence est bien PHYSIQUE : posées à 3 m au-dessus de la route, les piques droites (pointes vers le haut) ne touchent pas la voiture ; roulées d'un demi-tour (pointes vers la route) elles la tuent
  const run = (t) => { const sim = new Simulation(t); sim.start(); let died = false; for (let i = 0; i < 120 * 6; i++) { sim.step({ steer: 0, throttle: true, brake: false }); if (sim.phys.ev.sink || sim.lost) { died = true; break; } } return died; };
  assert.equal(run(mk(0)), false); assert.equal(run(mk(Math.PI)), true);
});
test('les signatures des circuits d\'avant la phase 3 (sans roulis d\'obstacle) ne changent pas : les classements existants restent', () => {
  for (const d of BUILTIN_TRACKS) { const t = buildBuiltin(d); assert.ok(!t.signatureText().includes(':z'), d.id); }
});
test('l\'arrondi de position des obstacles (0,1 m) est une limite CONNUE de la signature : un décalage de moins de 0,05 m garde la même clé (documenté, voir docs/AUDIT-PHASE4-INTEGRITE.md)', () => {
  const t = Track.decode(richCode()), s0 = t.signature();
  t.decos[0].x += 0.04;
  assert.equal(t.signature(), s0);
});

console.log('\n2. Lecture des codes : rien n\'est perdu en silence');
test('tous les circuits intégrés, et un circuit 3D complexe avec obstacles roulés, se relisent sans aucune perte et se réécrivent à l\'identique (deux fois)', () => {
  const codes = BUILTIN_TRACKS.map((d) => buildBuiltin(d).encode());
  codes.push(richCode());
  for (const c of codes) {
    const t = Track.decode(c);
    assert.deepEqual(t.lost, { unknown: 0, overlap: 0, options: 0, decos: 0 });
    assert.equal(lossText(t), '');
    assert.equal(t.encode(), c);
    assert.equal(Track.decode(t.encode()).encode(), c);
  }
});
test('conservation des pièces, orientations et paramètres : tuile par tuile, le circuit 3D relu est identique (type, position, niveau, cap, roulis, revêtement, options)', () => {
  const b = built3d(), back = Track.decode(b.tr.encode());
  const flat = (t) => t.tiles.map((x) => [x.t, x.x, x.z, x.l, x.r, x.o, x.v, x.s, x.p, x.nb, x.tn, x.mv, x.cp, x.tb, x.th].join(':'));
  assert.deepEqual(flat(back), flat(b.tr));
  assert.ok(back.tiles.some((x) => x.o === 3) && back.tiles.some((x) => x.o === 1 && x.t === 'loop') && back.tiles.some((x) => /^tr\d\ds$/.test(x.t)));
});
const { PIECE_ORDER: _order } = await import('../js/pieces.js');
const dataOf = (code) => JSON.parse(Buffer.from(code.slice(5).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
const codeOf = (o) => 'SHW3:' + Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
test('un code qui contient une pièce INCONNUE (version plus récente) ou une option que ce jeu ne connaît pas : la perte est comptée, nommée, et bloque l\'import', () => {
  const data = dataOf(richCode()), stride = 8;
  const t1 = Track.decode(codeOf({ ...data, t: [...data.t.slice(0, stride * 3), 9999, 0, -40, 1, 0, 0, 100, 0, ...data.t.slice(stride * 3)] }));
  assert.equal(t1.lost.unknown, 1); assert.ok(lossBlocking(t1)); assert.match(lossText(t1), /1 pièce\(s\) d'une version plus récente/);
  // un tube avec un roulis (6) que le jeu refuse : l'option est retirée MAIS la perte est comptée
  const idx = data.t.length / stride;
  const t2 = Track.decode(codeOf({ ...data, t: [...data.t, _order.indexOf('tube'), 3, -3, 12, 0, 0, 100, 0], e: [...(data.e || []), { i: idx, o: 6 }] }));
  assert.equal(t2.lost.options, 1, JSON.stringify(t2.lost)); assert.ok(lossBlocking(t2));
});
test('codes abîmés : tronqués, caractères altérés, JSON vide, types faux : une VRAIE erreur ou un circuit valide qui dit ce qu\'il a perdu — jamais un plantage, jamais un circuit vide sans le dire', () => {
  const code = richCode();
  const samples = [code.slice(0, 40), code.slice(0, Math.floor(code.length / 2)), code.slice(0, -3), code.replace(/A/g, '_'), 'SHW3:', 'SHW3:e30', 'SHW3:' + Buffer.from('{"v":4,"t":[1,2]}').toString('base64'), 'SHW9:xyz', '', 'null', code + code];
  for (const s of samples) {
    let t = null, err = null;
    try { t = Track.decode(s); } catch (e) { err = e; }
    assert.ok(err instanceof Error || (t && t.lost), `réaction inattendue : ${s.slice(0, 30)}`);
    if (t) { t.encode(); t.signature(); assert.ok(t.lost && Number.isInteger(t.lost.unknown)); }
  }
});
test('un circuit dont des pièces se recouvrent est relu AVEC la perte comptée (overlap), sans effacer le circuit', () => {
  const t = scriptTrack('x', 'start S3 finish', { l: 4 });
  const data = JSON.parse(Buffer.from(t.encode().slice(5).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  data.t = [...data.t, ...data.t.slice(0, 8)];      // la 1re pièce en double
  const back = Track.decode('SHW3:' + Buffer.from(JSON.stringify(data)).toString('base64'));
  assert.equal(back.lost.overlap, 1); assert.ok(!lossBlocking(back)); assert.equal(back.tiles.length, t.tiles.length);
});

console.log('\n3. Sauvegardes locales');
await test('enregistrer → fermer la page → rouvrir : le circuit 3D est intact (code, nom, identifiant), dans la liste et rejouable', async () => {
  reset();
  const S1 = await fresh('../js/storage.js');
  const b = built3d(), code = b.tr.encode(), id = S1.newId();
  S1.saveMyTrack({ id, name: 'Mon 3D', code });
  assert.equal(S1.wroteOk(), true);
  const S2 = await fresh('../js/storage.js');          // « actualisation »
  const list = S2.listMyTracks();
  assert.equal(list.length, 1); assert.deepEqual([list[0].id, list[0].name, list[0].code], [id, 'Mon 3D', code]);
  assert.equal(Track.decode(list[0].code).signature(), b.tr.signature());
});
await test('duplication, modification, suppression : une copie est un nouvel identifiant ; modifier garde l\'identifiant et met à jour ; supprimer pose une pierre tombale et ne touche pas les autres', async () => {
  reset();
  const S = await fresh('../js/storage.js'), code = built3d().tr.encode();
  const a = S.saveMyTrack({ id: 'a', name: 'A', code }), b = S.saveMyTrack({ id: S.newId(), name: 'A (copie)', code });
  assert.equal(S.listMyTracks().length, 2); assert.notEqual(a.id, b.id);
  S.saveMyTrack({ id: 'a', name: 'A modifié', code: scriptTrack('x', 'start S2 finish').encode() });
  assert.equal(S.listMyTracks().length, 2); assert.equal(S.listMyTracks().find((t) => t.id === 'a').name, 'A modifié'); assert.equal(S.listMyTracks().find((t) => t.id === b.id).code, code);
  S.deleteMyTrack('a');
  assert.deepEqual(S.listMyTracks().map((t) => t.id), [b.id]);
  assert.ok(Number.isFinite(JSON.parse(disk.getItem('shardway.tracksDel')).a), 'pierre tombale (la synchronisation du compte ne le ressuscite pas)');
});
await test('données abîmées : une entrée sans code, nulle, ou d\'un autre type n\'est pas affichée, ne plante rien, et n\'est JAMAIS effacée : elle part en quarantaine, récupérable', async () => {
  reset();
  const S = await fresh('../js/storage.js'), code = built3d().tr.encode();
  disk.setItem('shardway.tracks', JSON.stringify([{ id: 'ok', name: 'Bon', code }, null, { id: 'sans-code', name: 'X' }, { id: 7, code }, 'texte', { id: 'ok', name: 'Doublon', code }, { id: 'long', name: 'L', code: 'x'.repeat(500000) }]));
  assert.deepEqual(S.listMyTracks().map((t) => t.id), ['ok']);
  S.saveMyTrack({ id: 'nouveau', name: 'Nouveau', code });
  assert.deepEqual(S.listMyTracks().map((t) => t.id).sort(), ['nouveau', 'ok']);
  const quarantaine = S.listBadTracks().map((q) => q.lost);
  assert.ok(quarantaine.some((x) => x && x.id === 'sans-code') && quarantaine.some((x) => x && x.id === 'long') && quarantaine.some((x) => x === 'texte') && quarantaine.some((x) => x && x.name === 'Doublon'), JSON.stringify(quarantaine).slice(0, 200));
  // la liste entière corrompue (pas un tableau) : rien n'est perdu non plus
  disk.setItem('shardway.tracks', '{"id":"seul","code":"SHW3:abc"}');
  assert.deepEqual(S.listMyTracks(), []);
  S.saveMyTrack({ id: 'n2', name: 'N2', code });
  assert.ok(S.listBadTracks().some((q) => q.lost && q.lost.id === 'seul'));
  disk.setItem('shardway.tracks', '{{pas du JSON');
  assert.deepEqual(S.listMyTracks(), []);
});
await test('interruption pendant une sauvegarde (stockage plein, écriture refusée) : l\'ancienne liste reste intacte, wroteOk() est faux, et la réessayer après avoir fait de la place réussit', async () => {
  reset();
  const S = await fresh('../js/storage.js'), code = built3d().tr.encode();
  S.saveMyTrack({ id: 'a', name: 'A', code });
  const before = disk.getItem('shardway.tracks');
  disk.failKeys = (k) => k === 'shardway.tracks';
  S.saveMyTrack({ id: 'b', name: 'B', code });
  assert.equal(S.wroteOk(), false);
  assert.equal(disk.getItem('shardway.tracks'), before, 'la liste d\'avant n\'a pas été touchée');
  disk.failKeys = null;
  S.saveMyTrack({ id: 'b', name: 'B', code });
  assert.equal(S.wroteOk(), true); assert.equal(S.listMyTracks().length, 2);
  // un circuit sans code ne s'enregistre pas, et le dit
  S.saveMyTrack({ id: 'vide', name: 'Vide', code: '' });
  assert.equal(S.wroteOk(), false); assert.equal(S.listMyTracks().length, 2);
});
await test('stockage presque plein : faire de la place retire les FANTÔMES des autres records, jamais leurs temps, avant de renoncer', async () => {
  reset();
  const S = await fresh('../js/storage.js'), code = built3d().tr.encode();
  for (let i = 0; i < 4; i++) S.saveRecord('b-x' + i + '-abc', { time: 20 + i, pv: PHYS_VER, date: i, ghost: 'g'.repeat(3000), inputs: 'i'.repeat(3000) });
  const used = [...disk.m.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  disk.quota = used + code.length + 200;
  S.saveMyTrack({ id: 'a', name: 'A', code });
  assert.equal(S.wroteOk(), true);
  for (let i = 0; i < 4; i++) assert.equal(S.getRecord('b-x' + i + '-abc').time, 20 + i, 'les temps sont intacts');
});
await test('restauration d\'une sauvegarde ATOMIQUE : une écriture qui échoue à mi-chemin remet TOUT comme avant (avant : les clés étaient effacées d\'abord, puis réécrites une à une)', async () => {
  reset();
  const S = await fresh('../js/storage.js');
  S.setJSON('settings', { volume: 0.2 }); S.saveRecord('b-a-1', { time: 12.5, pv: PHYS_VER, date: 1 }); S.saveMyTrack({ id: 't', name: 'T', code: built3d().tr.encode() });
  const snapshot = new Map(disk.m);
  const backup = { settings: JSON.stringify({ volume: 0.9 }), 'rec3.b-z-9': JSON.stringify({ time: 9.9, pv: PHYS_VER, date: 5 }), tracks: JSON.stringify([]), extra: '"x"' };
  let n = 0; disk.failKeys = () => ++n === 3;
  assert.equal(S.restoreAll(backup), false);
  disk.failKeys = null;
  assert.deepEqual([...disk.m.entries()].sort(), [...snapshot.entries()].sort(), 'le stockage est identique à l\'avant-restauration');
  assert.equal(S.restoreAll(backup), true);
  assert.equal(S.getRecord('b-z-9').time, 9.9); assert.equal(S.getRecord('b-a-1'), null, 'ce que la sauvegarde ne contient pas est retiré (restauration complète)');
  assert.equal(S.restoreAll({ more: '"y"' }, true), true); assert.equal(S.getRecord('b-z-9').time, 9.9, 'restauration « en plus » : rien n\'est retiré');
});

console.log('\n4. Records, médailles, progression');
await test('un record dont le temps est 0, négatif, non fini ou démesuré n\'est JAMAIS lu comme record (il ne donne ni médaille ni déverrouillage) ni écrit ; il reste sur le disque', async () => {
  reset();
  const S = await fresh('../js/storage.js');
  for (const [i, time] of [0, -3, NaN, Infinity, 'abc', null, MAX_RUN_SECONDS + 1, 1e9].entries()) {
    disk.setItem('shardway.rec3.b-bad-' + i, JSON.stringify({ time, pv: PHYS_VER, date: 1 }));
    assert.equal(S.getRecord('b-bad-' + i), null, `temps ${time}`);
    assert.equal(S.saveRecord('b-w-' + i, { time, pv: PHYS_VER, date: 1 }), false);
    assert.equal(S.getRecord('b-w-' + i), null);
  }
  assert.ok(disk.getItem('shardway.rec3.b-bad-0'), 'rien n\'est effacé');
  assert.equal(S.saveRecord('b-ok', { time: 17.234, pv: PHYS_VER, date: 1 }), true);
  assert.equal(S.getRecord('b-ok').time, 17.234);
  disk.setItem('shardway.rec3.b-pv', JSON.stringify({ time: 20, pv: 'x' })); assert.equal(S.getRecord('b-pv'), null, 'version de physique illisible');
});
await test('changement de physique : un record d\'une ancienne version reste LU et affiché ; le premier temps de la nouvelle version le remplace même plus lent ; le meilleur temps de toutes les versions (médailles) ne remonte jamais', async () => {
  reset();
  const S = await fresh('../js/storage.js');
  S.saveRecord('b-m', { time: 15.0, pv: PHYS_VER - 1, date: 1, ghost: 'g', inputs: 'i' });
  assert.equal(S.getRecord('b-m').pv, PHYS_VER - 1);
  S.saveRecord('b-m', { time: 15.4, pv: PHYS_VER, date: 2, ghost: 'g2', inputs: 'i2' });
  const r = S.getRecord('b-m');
  assert.equal(r.time, 15.4); assert.equal(r.pv, PHYS_VER); assert.equal(r.bt, 15.0, 'le meilleur temps d\'avant est mémorisé');
  assert.equal(S.medalTime(r), 15.0, 'médaille calculée sur le meilleur temps de toutes les versions');
  S.saveRecord('b-m', { time: 15.2, pv: PHYS_VER, date: 3 });
  assert.equal(S.medalTime(S.getRecord('b-m')), 15.0);
  const S2 = await fresh('../js/storage.js');           // après actualisation, mêmes valeurs
  assert.deepEqual([S2.getRecord('b-m').time, S2.medalTime(S2.getRecord('b-m'))], [15.2, 15.0]);
});
test('fusion cloud : un record abîmé (temps nul, négatif, NaN) ne l\'emporte jamais sur un bon, de n\'importe quelle version ; un circuit tronqué plus récent n\'efface pas le bon', () => {
  const good = { time: 20, pv: PHYS_VER, date: 5 };
  for (const bad of [{ time: 0, pv: PHYS_VER + 5, date: 9 }, { time: -4, pv: PHYS_VER, date: 9 }, { time: 'x', pv: PHYS_VER, date: 9 }, { time: NaN, pv: 999, date: 9 }]) {
    for (const [a, b] of [[good, bad], [bad, good]]) assert.equal(mergeSaves({ 'rec3.k': a }, { 'rec3.k': b })['rec3.k'].time, 20);
  }
  const code = scriptTrack('x', 'start S2 finish').encode();
  const merged = mergeSaves({ tracks: [{ id: 't1', name: 'Bon', code, updated: 100 }] }, { tracks: [{ id: 't1', name: 'Tronqué', updated: 999 }, { id: 't2', name: 'Autre', code, updated: 5 }] }).tracks;
  assert.deepEqual(merged.map((t) => [t.id, t.name]).sort(), [['t1', 'Bon'], ['t2', 'Autre']]);
  assert.equal(mergeSaves({ tracks: [{ id: 't1', name: 'Seul', updated: 1 }] }, { tracks: [] }).tracks.length, 1, 'une entrée abîmée SEULE est conservée (rien n\'est supprimé)');
});
await test('preuve de vérification d\'un circuit : liée à la version de la physique ; une preuve d\'une autre version n\'est pas renvoyée au serveur', async () => {
  reset();
  const P = await fresh('../js/authorProof.js');
  const t = scriptTrack('x', 'start S2 finish', { l: 4 }); t.vt = 12.3; t.vh = t.signature();
  assert.equal(P.saveProof(t, { inputs: 'AAAA', time: 12.3 }), true);
  assert.deepEqual(P.loadProof(t), { inputs: 'AAAA', time: 12.3 });
  const all = JSON.parse(disk.getItem('shardway.vproof')); all[t.signature()].pv = PHYS_VER - 1; disk.setItem('shardway.vproof', JSON.stringify(all));
  assert.equal(P.loadProof(t), null, 'preuve d\'une autre version de la physique');
});

console.log('\n5. Validation des courses : circuits modifiés, temps et versions falsifiés');
const UID = '11111111-2222-3333-4444-555555555555';
function fakeSupabase({ authOk = true, db = null, offline = false } = {}) {
  const state = db || { scores: new Map(), binds: new Map(), tracks: new Map() };
  const calls = [];
  const ok = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = async (url, init = {}) => {
    if (offline) throw new TypeError('network down');
    const u = String(url), body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ u, body });
    if (u.includes('/auth/v1/user')) return authOk ? ok({ id: UID, is_anonymous: false }) : ok({}, 401);
    if (u.includes('/rest/v1/players')) return ok([{ id: UID }]);
    if (u.includes('/rpc/rate_check')) return ok(0);
    if (u.includes('/rpc/submit_best')) {
      const a = body;
      if (a.strong) { if (!state.binds.has(a.tk)) state.binds.set(a.tk, a.strong); if (state.binds.get(a.tk) !== a.strong) return ok({ status: 'collision' }); }
      const k = a.tk + '|' + a.p, cur = state.scores.get(k);
      let improved = false;
      if (!cur || a.pv > cur.pv || (a.pv === cur.pv && a.t < cur.t)) { state.scores.set(k, { t: a.t, inp: a.inp, pv: a.pv, gh: a.gh, sp: a.sp, gveh: a.gveh }); improved = true; }
      const best = state.scores.get(k).t, all = [...state.scores.entries()].filter(([kk, v]) => kk.startsWith(a.tk + '|') && v.pv === a.pv);
      return ok({ status: 'ok', improved, best, rank: all.filter(([, v]) => v.t < best).length + 1, total: all.length });
    }
    return ok({}, 404);
  };
  return { fetch, calls, state };
}
const request = (body) => new Request('https://fn.example/submit-score', { method: 'POST', headers: { Authorization: 'Bearer jeton', 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const handlerOf = (sb) => createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', fetch: sb.fetch, log: () => {}, rateLimit: { max: 1000, windowMs: 60000, globalMax: 1e6, anonMax: 1e6 } });

// Un circuit 3D complet, sa course, et ce que le jeu enverrait.
const B = built3d(), TRACK = B.tr, CODE = TRACK.encode(), KEY = TRACK.userKey;
TRACK.path = pathOf(B.pieces);
const RUN = recordRun(TRACK);
const send = (over = {}) => ({ trackKey: KEY, code: CODE, inputs: RUN.inputs, time: RUN.time, physVer: PHYS_VER, ...over });

test('référence : la course du circuit 3D (roulis 45° et 90°, looping sur un mur, vrille inclinée) est confirmée par le serveur et rejouée à l\'identique après relecture du code', () => {
  const r = verifyRun({ ...send() });
  assert.ok(r.ok, r.error); assert.ok(Math.abs(r.time - RUN.time) < 1e-9);
  const back = Track.decode(CODE);
  assert.equal(back.userKey, KEY);
  assert.ok(Math.abs(replayRun(back, RUN.inputs).time - RUN.time) < 1e-9);
});
test('circuit MODIFIÉ après la course : tout changement physique (pièce, roulis, obstacle, règle) sous l\'ancienne clé est refusé ; un changement purement visuel est accepté', () => {
  const mutate = (f) => { const t = Track.decode(CODE); f(t); return t.encode(); };
  const physical = [
    (t) => { t.tiles[1].o = 4; }, (t) => { t.tiles[2].s = 'ice'; }, (t) => { t.setParams({ grip: 60 }); }, (t) => { t.addDeco({ k: 'spikes', x: 33, y: 100, z: 33, ry: 0, s: 1, rz: Math.PI / 2 }); },
    (t) => { t.tiles.splice(3, 1); },
  ];
  for (const f of physical) {
    const r = verifyRun({ ...send({ code: mutate(f) }) });
    assert.equal(r.ok, false, 'accepté à tort'); assert.match(r.error, /ne correspond pas/);
  }
  const roll = Track.decode(CODE); roll.addDeco({ k: 'spikes', x: 33, y: 100, z: 33, ry: 0, s: 1 });
  const keyA = roll.userKey; roll.decos[roll.decos.length - 1].rz = Math.PI / 2;
  assert.equal(verifyRun({ ...send({ trackKey: keyA, code: roll.encode() }) }).ok, false, 'même clé, roulis d\'obstacle différent : refusé (la faille de la phase 3)');
  const visual = mutate((t) => { t.name = 'Renommé'; t.desc = 'x'; t.tiles[2].th = 3; });
  assert.ok(verifyRun({ ...send({ code: visual }) }).ok, 'nom, description, thème : la clé ne change pas');
});
test('temps falsifiés : un temps plus court (même d\'un millième), négatif, nul, démesuré, non numérique est refusé ; le temps retenu est toujours celui du REJEU', () => {
  for (const d of [-0.0011, 0.0011, -1, 5]) assert.equal(verifyRun({ ...send({ time: RUN.time + d }) }).ok, false, 'delta ' + d);
  for (const time of [0, -1, NaN, Infinity, '12.3', null, MAX_RUN_SECONDS + 1]) assert.equal(verifyRun({ ...send({ time }) }).ok, false, String(time));
  assert.ok(Math.abs(verifyRun({ ...send({ time: RUN.time + 0.0004 }) }).time - RUN.time) < 1e-9);
});
test('courses incohérentes : commandes d\'un autre circuit, tronquées, vides, illisibles, sans arrivée, démesurées, répétées : jamais confirmées', () => {
  const other = recordRun(buildBuiltin(BUILTIN_TRACKS[0]));
  const inputs = RUN.inputs;
  const cases = { 'autre circuit': other.inputs, 'tronquées': inputs.slice(0, Math.floor(inputs.length / 2)), vides: '', illisibles: '!!!!', 'un seul caractère': 'A', 'octets au hasard': 'AAAAAAAAAAAAAAAAAAAAAAAA'.repeat(50) };
  for (const [name, inp] of Object.entries(cases)) assert.equal(verifyRun({ ...send({ inputs: inp }) }).ok, false, name);
  assert.equal(verifyRun({ ...send({ inputs: 'A'.repeat(2_000_000) }) }).ok, false, 'démesurées : refusées avant tout rejeu');
});
test('versions : une autre version de la physique (plus ancienne, plus récente, 0, NaN) est refusée avec les deux versions dans le message ; la clé d\'un circuit officiel d\'une autre version aussi', () => {
  for (const v of [PHYS_VER - 1, PHYS_VER + 1, 0, 34]) { const r = verifyRun({ ...send({ physVer: v }) }); assert.equal(r.ok, false); assert.equal(r.versionMismatch, true); assert.match(r.error, new RegExp(String(PHYS_VER))); }
  assert.equal(verifyRun({ ...send({ physVer: NaN }) }).ok, false);
  const def = BUILTIN_TRACKS[0];
  assert.throws(() => trackForKey(`b-${def.id}-zzzzz`), /Version du circuit différente/);
});
test('publication : un code dont des pièces sont inconnues du serveur (version plus récente) est refusé avec la VRAIE raison, pas « ne correspond pas »', () => {
  // Un client plus récent a posé une pièce de plus (clé K2) ; le serveur, qui ne connaît pas ce type, la saute à la lecture : sa signature diffère de K2.
  const data = dataOf(CODE);
  const withReal = codeOf({ ...data, t: [...data.t, _order.indexOf('straight'), 2, -9, 12, 0, 0, 100, 0] });
  const K2 = Track.decode(withReal).userKey;
  assert.notEqual(K2, KEY);
  const odd = codeOf({ ...data, t: [...data.t, 9999, 2, -9, 12, 0, 0, 100, 0] });
  assert.throws(() => trackForKey(K2, odd), /ne connaît pas toutes les pièces/);
  assert.match(verifyRun({ ...send({ trackKey: K2, code: odd }) }).error, /ne connaît pas toutes les pièces/);
  assert.match(verifyPublish({ code: odd, inputs: RUN.inputs, time: RUN.time, physVer: PHYS_VER }).error, /ne connaît pas toutes les pièces/);
});
test('simulation locale = validation serveur : sur 8 circuits intégrés, le temps du rejeu côté serveur (verifyRun) est EXACTEMENT celui de la simulation du jeu, au pas près', () => {
  for (const d of BUILTIN_TRACKS.slice(0, 8)) {
    const track = buildBuiltin(d), run = recordRun(track);
    const r = verifyRun({ trackKey: `b-${d.id}-${hashString(track.encode())}`, inputs: run.inputs, time: run.time, physVer: PHYS_VER });
    assert.ok(r.ok, `${d.id} : ${r.error}`); assert.equal(r.time, run.time, d.id);
  }
});

console.log('\n6. Parcours complet du joueur');
await test('créer → enregistrer → recharger → courir → record → serveur → classement → fantôme et replay (circuit 3D)', async () => {
  reset();
  // 1-2. création (déjà construit) et sauvegarde dans « Mes circuits »
  const S1 = await fresh('../js/storage.js'), id = S1.newId();
  S1.saveMyTrack({ id, name: 'Parcours 3D', code: CODE });
  assert.equal(S1.wroteOk(), true);
  // 3. rechargement de la page : le circuit revient identique, sans perte
  const S2 = await fresh('../js/storage.js');
  const entry = S2.listMyTracks().find((t) => t.id === id), loaded = Track.decode(entry.code);
  assert.equal(lossText(loaded), ''); assert.equal(loaded.userKey, KEY); assert.equal(loaded.encode(), CODE);
  // 4-5. course et enregistrement du temps (record local : commandes, fantôme, temps intermédiaires)
  const gr = new GhostRunner(loaded, { inputs: RUN.inputs, ghost: true });
  while (!gr.done && gr.k < 120 * 200) gr.step();
  assert.ok(gr.logic.finished); assert.ok(Math.abs(gr.logic.time - RUN.time) < 1e-9, 'le rejeu local sur le circuit RECHARGÉ donne le même temps');
  const ghost = gr.ghostResult();
  const { encodeFloats } = await import('../js/ghostFormat.js');
  const rec = { time: RUN.time, splits: RUN.splits, ghost: encodeFloats(ghost.data), ghostVeh: ghost.veh, inputs: RUN.inputs, pv: PHYS_VER, date: Date.now(), name: 'Pilote' };
  assert.equal(S2.saveRecord(KEY, rec), true); S2.pushRun(KEY, { time: RUN.time, date: Date.now() });
  // 6. validation serveur
  const sb = fakeSupabase(), h = handlerOf(sb);
  const res = await h(request(send())), j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j)); assert.deepEqual([j.ok, j.improved, j.rank, j.total], [true, true, 1, 1]);
  // 7. le classement contient le temps REJOUÉ, avec son fantôme jouable
  const row = sb.state.scores.get(KEY + '|' + UID);
  assert.ok(Math.abs(row.t - RUN.time) < 1e-9 && row.pv === PHYS_VER && row.inp === RUN.inputs);
  const g = parseGhost(row.gh, row.gveh);
  assert.ok(g && g.data.length >= 7 * 10 && g.data.length % 7 === 0, 'fantôme du classement lisible');
  // 8. consulter : après actualisation, le record, ses commandes et son fantôme sont là ; le replay et le code de fantôme se relisent
  const S3 = await fresh('../js/storage.js'), r3 = S3.getRecord(KEY);
  assert.deepEqual([r3.time, r3.pv, r3.inputs, r3.ghost], [rec.time, PHYS_VER, RUN.inputs, rec.ghost]);
  assert.equal(S3.listRuns(KEY).length, 1);
  const code = encodeGhost({ trackKey: KEY, time: r3.time, name: 'Pilote', inputs: r3.inputs }), gh = decodeGhost(code);
  assert.deepEqual([gh.trackKey, gh.time, gh.v], [KEY, RUN.time, PHYS_VER]);
  const again = new GhostRunner(loaded, { inputs: gh.inputs });
  while (!again.done && again.k < 120 * 200) again.step();
  assert.ok(Math.abs(again.logic.time - RUN.time) < 1e-9, 'le fantôme importé rejoue la même course');
});
await test('erreurs : déconnexion (serveur injoignable, session expirée), données incomplètes, actualisation avant l\'envoi : le record local reste, le renvoi est idempotent et ne double rien', async () => {
  reset();
  const S = await fresh('../js/storage.js');
  S.saveRecord(KEY, { time: RUN.time, splits: RUN.splits, inputs: RUN.inputs, pv: PHYS_VER, date: 1 });
  // hors ligne : la requête échoue, rien n'est perdu localement
  let threw = false;
  try { await handlerOf(fakeSupabase({ offline: true }))(request(send())); } catch { threw = true; }
  const down = await handlerOf(fakeSupabase({ offline: true }))(request(send())).catch(() => ({ status: 599 }));
  assert.ok(threw || down.status >= 500 || down.status === 599);
  assert.equal((await handlerOf(fakeSupabase({ authOk: false }))(request(send()))).status, 401, 'session expirée');
  // actualisation : le record est toujours là, prêt à être renvoyé
  const S2 = await fresh('../js/storage.js'), rec = S2.getRecord(KEY);
  assert.equal(rec.time, RUN.time);
  // données incomplètes
  const sb = fakeSupabase(), h = handlerOf(sb);
  for (const bad of [{ ...send(), inputs: undefined }, { ...send(), time: undefined }, { ...send(), trackKey: undefined }, { ...send(), physVer: undefined }, '{coupé', { ...send(), inputs: rec.inputs.slice(0, 40) }]) {
    const r = await h(request(bad));
    assert.ok([400, 422].includes(r.status), `statut ${r.status}`);
  }
  assert.equal(sb.state.scores.size, 0, 'aucun enregistrement pour une requête incomplète');
  // renvoi (même course) : accepté une fois, puis idempotent
  const a = await (await h(request(send()))).json(), b = await (await h(request(send()))).json();
  assert.deepEqual([a.improved, b.improved, b.rank, b.total], [true, false, 1, 1]);
  assert.equal(sb.state.scores.size, 1);
});
await test('physique changée entre deux sessions : un record d\'une version antérieure n\'est plus envoyé au classement (il n\'a pas de commandes rejouables) mais reste affiché ; la nouvelle course le remplace', async () => {
  reset();
  const S = await fresh('../js/storage.js');
  S.saveRecord(KEY, { time: RUN.time - 1, inputs: RUN.inputs, pv: PHYS_VER - 1, date: 1 });
  const old = S.getRecord(KEY);
  assert.equal(old.time, RUN.time - 1, 'affiché');
  const canSend = (r) => !!(r && r.inputs && r.pv === PHYS_VER);
  assert.equal(canSend(old), false);
  const sb = fakeSupabase(); sb.state.scores.set(KEY + '|' + UID, { t: RUN.time - 1, inp: 'old', pv: PHYS_VER - 1 });
  const j = await (await handlerOf(sb)(request(send()))).json();
  assert.equal(j.improved, true, 'une physique plus récente remplace l\'ancien record du classement, même plus lent');
  assert.equal(sb.state.scores.get(KEY + '|' + UID).pv, PHYS_VER);
});

finish('Intégrité globale (phase 4) : tout passe.');
