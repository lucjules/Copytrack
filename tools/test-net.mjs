// Tests du multijoueur (sans navigateur) : node tools/test-net.mjs   (npm test)
// Les vraies connexions WebRTC sont essayées à part dans Chromium (deux onglets) ; ici : la logique.
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.min.js';
import { DT } from '../js/constants.js';
import { packSnapshot, unpackSnapshot, SNAPSHOT_BYTES, F_FINISHED } from '../js/net/snapshot.js';
import { SnapshotBuffer } from '../js/net/interp.js';
import { RemoteCar, darkness, FADE_NEAR, FADE_FAR, MAX_DARKEN } from '../js/remoteCar.js';
import { SupabaseSignaling, Emitter } from '../js/net/signaling.js';
import { PeerMesh } from '../js/net/transport.js';
import { Room, newRoomCode, normalizeCode, ROOM_RE, RoomError } from '../js/net/room.js';
import { RaceLogic } from '../js/raceLogic.js';
import { Track } from '../js/track.js';
import { PHYS_VER } from '../js/replay.js';

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ok   ' + name); } catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e).split('\n').slice(0, 4).join('\n       ')); }
}
const snap = (steps, x, o = {}) => ({ steps, flags: 0, tele: 0, vehicle: 'car', seq: steps, pos: { x, y: 1, z: 0 }, quat: new THREE.Quaternion(), vel: { x: 0, y: 0, z: 0 }, cp: 0, lap: 1, ...o });
// Reçoit une suite de paquets (émetteur à 20 Hz) avec une latence fixe de 30 ms.
function feed(buf, list, lat = 30) { for (const s of list) { const u = unpackSnapshot(packSnapshot(s)); buf.push(u, s.steps * DT * 1000 + lat); } }

console.log('Paquets');
await test('un paquet fait 38 octets et se relit à l\'identique (précision de la quantification)', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), 2.1);
  const s = snap(123456, -1234.5678, { flags: F_FINISHED, tele: 7, vehicle: 'glider', cp: 3, lap: 2, quat: q, vel: { x: 55.5, y: -3.25, z: 120 } });
  const ab = packSnapshot(s);
  assert.equal(ab.byteLength, SNAPSHOT_BYTES); assert.equal(SNAPSHOT_BYTES, 38);
  const u = unpackSnapshot(ab);
  assert.equal(u.steps, 123456); assert.equal(u.tele, 7); assert.equal(u.vehicle, 'glider'); assert.equal(u.cp, 3); assert.equal(u.lap, 2); assert.equal(u.flags, F_FINISHED);
  assert.ok(Math.abs(u.pos.x - -1234.5678) < 1e-3);
  assert.ok(Math.abs(u.vel.x - 55.5) < 0.02 && Math.abs(u.vel.z - 120) < 0.02);
  const dq = new THREE.Quaternion(u.quat.x, u.quat.y, u.quat.z, u.quat.w).angleTo(q);
  assert.ok(dq < 0.001, 'orientation à 0,06° près : ' + dq);
});
await test('paquets venus d\'un autre joueur : jamais de confiance (taille, version, NaN, quaternion nul)', () => {
  assert.equal(unpackSnapshot(new ArrayBuffer(10)), null);
  assert.equal(unpackSnapshot('x'), null); assert.equal(unpackSnapshot(null), null);
  const ok = packSnapshot(snap(1, 0));
  const bad = ok.slice(0); new DataView(bad).setUint8(0, 9); assert.equal(unpackSnapshot(bad), null, 'version');
  const nan = ok.slice(0); new DataView(nan).setFloat32(10, NaN, true); assert.equal(unpackSnapshot(nan), null, 'NaN');
  const far = ok.slice(0); new DataView(far).setFloat32(10, 1e9, true); assert.equal(unpackSnapshot(far), null, 'hors du monde');
  const zero = ok.slice(0); for (const o of [22, 24, 26, 28]) new DataView(zero).setInt16(o, 0, true); assert.equal(unpackSnapshot(zero), null, 'quaternion nul');
  assert.ok(unpackSnapshot(new Uint8Array(ok)), 'accepte aussi un Uint8Array');
});

console.log('Interpolation (tampon de 100 ms)');
await test('entre deux paquets : position lissée et orientation par slerp', () => {
  const buf = new SnapshotBuffer();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.0);
  feed(buf, [snap(0, 0, { quat: qa }), snap(6, 10, { quat: qb }), snap(12, 20), snap(18, 30)]);
  const t = (steps) => steps * DT * 1000 + 30 + 100;      // l'instant local où l'on voit l'état de « steps »
  const o = buf.sample(t(3));                              // à mi-chemin entre les deux premiers
  assert.ok(o.ready && !o.teleported);
  assert.ok(Math.abs(o.pos.x - 5) < 0.05, 'x ' + o.pos.x);
  assert.ok(Math.abs(o.quat.angleTo(qa) - 0.5) < 0.01, 'slerp à mi-angle');
  assert.ok(buf.sample(t(9)).pos.x > 14.9 && buf.sample(t(9)).pos.x < 15.1);
});
await test('il affiche l\'état d\'il y a 100 ms (jamais le dernier paquet reçu)', () => {
  const buf = new SnapshotBuffer();
  feed(buf, [0, 6, 12, 18, 24].map((s, i) => snap(s, i * 10)));
  const nowMs = 24 * DT * 1000 + 30;                       // on vient de recevoir le dernier (x = 40)
  assert.ok(buf.sample(nowMs).pos.x < 40 - 15, 'retard d\'environ 100 ms : ' + buf.sample(nowMs).pos.x);
});
await test('paquets dans le désordre et doublons : ordre remis, doublon ignoré', () => {
  const buf = new SnapshotBuffer();
  const u = (s, x) => unpackSnapshot(packSnapshot(snap(s, x)));
  buf.push(u(0, 0), 0); buf.push(u(12, 20), 100); buf.push(u(6, 10), 130); // 6 arrive après 12
  assert.equal(buf.push(u(6, 10), 140), false, 'doublon');
  assert.deepEqual(buf.samples.map((s) => s.t), [0, 6 * DT, 12 * DT]);
});
await test('paquets perdus : interpolation sans à-coup, puis arrêt sur place (pas de dérive infinie)', () => {
  const buf = new SnapshotBuffer();
  feed(buf, [snap(0, 0, { vel: { x: 100, y: 0, z: 0 } }), snap(12, 10, { vel: { x: 100, y: 0, z: 0 } })]);
  const lerp = buf.sample(6 * DT * 1000 + 30 + 100);
  assert.ok(lerp.pos.x > 4 && lerp.pos.x < 6);
  // plus aucun paquet pendant 3 s : extrapolation limitée à 0,25 s (25 m à 100 m/s), puis elle ne bouge plus
  const far = buf.sample(12 * DT * 1000 + 30 + 100 + 3000);
  assert.ok(far.pos.x <= 10 + 100 * 0.25 + 1e-6 && far.pos.x > 10, 'x ' + far.pos.x);
});

console.log('Téléportation (retour au checkpoint)');
await test('la voiture reste sur place puis APPARAÎT à l\'arrivée : jamais de glissement', () => {
  const buf = new SnapshotBuffer();
  // x monte de 10 par paquet, puis téléportation de x = 40 à x = 5000 (compteur tele 0 → 1), puis ça repart de là.
  feed(buf, [snap(0, 0), snap(6, 10), snap(12, 20), snap(18, 30), snap(24, 40), snap(30, 5000, { tele: 1 }), snap(36, 5010, { tele: 1 }), snap(42, 5020, { tele: 1 })]);
  let prev = null, maxJump = 0, tpFrames = 0;
  for (let ms = 0; ms < 42 * DT * 1000 + 400; ms += 8) {   // ~120 images par seconde
    const o = buf.sample(ms + 30);
    if (!o.ready) continue;
    if (o.teleported) tpFrames++;
    if (prev !== null && !o.teleported) maxJump = Math.max(maxJump, Math.abs(o.pos.x - prev));
    prev = o.pos.x;
  }
  assert.equal(tpFrames, 1, 'exactement une image « apparition »');
  assert.ok(maxJump < 3, 'aucune image entre 40 et 5000 : saut max hors téléportation = ' + maxJump);
});
await test('compteur de téléportation : détecté même si le paquet « avant » est perdu', () => {
  const buf = new SnapshotBuffer();
  feed(buf, [snap(0, 0), snap(6, 10), snap(12, 20, { tele: 1 }), snap(18, 1000, { tele: 2 }), snap(24, 1010, { tele: 2 })]);   // le paquet tele 1 → 2 montre un saut direct
  let n = 0; for (let ms = 0; ms < 24 * DT * 1000 + 300; ms += 8) { if (buf.sample(ms + 30).teleported) n++; }
  assert.equal(n, 2, 'deux téléportations vues');
});

console.log('RemoteCar : assombrissement avec la distance');
await test('darkness : 0 de près, maximum de loin, croissante et lisse', () => {
  assert.equal(darkness(0), 0); assert.equal(darkness(FADE_NEAR), 0);
  assert.ok(Math.abs(darkness(FADE_FAR) - MAX_DARKEN) < 1e-9); assert.ok(Math.abs(darkness(5000) - MAX_DARKEN) < 1e-9);
  let prev = -1; for (let d = 0; d <= 400; d += 5) { const k = darkness(d); assert.ok(k >= prev - 1e-12); prev = k; }
  assert.ok(darkness((FADE_NEAR + FADE_FAR) / 2) > 0.3 * MAX_DARKEN && darkness((FADE_NEAR + FADE_FAR) / 2) < 0.7 * MAX_DARKEN);
});
await test('la couleur des matériaux devient plus sombre quand la voiture s\'éloigne de la caméra', () => {
  const scene = new THREE.Scene();
  const rc = new RemoteCar(scene, { id: 'a', name: 'Zoé', colorIndex: 1 });
  assert.ok(rc.mats.size > 0);
  const lum = () => { let l = 0, n = 0; for (const m of rc.mats) if (m.color) { l += m.color.r + m.color.g + m.color.b; n++; } return l / n; };
  rc.push(unpackSnapshot(packSnapshot(snap(0, 0))), 0); rc.push(unpackSnapshot(packSnapshot(snap(12, 0))), 100);
  const cam = new THREE.Vector3(0, 0, 0);
  const seen = [];
  for (const dist of [5, 60, 120, 200, 400]) { cam.set(dist, 1, 0); rc.update(500, cam); seen.push(lum()); }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] <= seen[i - 1] + 1e-9, 'décroissante : ' + seen);
  assert.ok(seen[4] < seen[0] * 0.25, 'au loin, nettement plus sombre : ' + seen);
  rc.update(500, cam.set(3, 1, 0)); assert.ok(Math.abs(lum() - seen[0]) < 1e-6, 'retour à la couleur pleine de près');
  // deux voitures : matériaux indépendants (assombrir l'une ne touche pas l'autre)
  const rc2 = new RemoteCar(scene, { id: 'b', name: 'Max', colorIndex: 2 });
  for (const m of rc2.mats) assert.ok(!rc.mats.has(m));
  rc.dispose(); rc2.dispose();
});
await test('RemoteCar : invisible avant le premier paquet ; téléportation signalée', () => {
  const scene = new THREE.Scene(); let tp = 0;
  const rc = new RemoteCar(scene, { id: 'a', name: 'A' }, { onTeleport: () => tp++ });
  assert.equal(rc.update(0, new THREE.Vector3()), false); assert.equal(rc.group.visible, false);
  const pk = (s, x, t) => unpackSnapshot(packSnapshot(snap(s, x, { tele: t })));
  [pk(0, 0, 0), pk(6, 10, 0), pk(12, 900, 1), pk(18, 910, 1)].forEach((p, i) => rc.push(p, p.steps * DT * 1000));
  for (let ms = 0; ms < 400; ms += 8) rc.update(ms + 100, new THREE.Vector3());
  assert.equal(tp, 1); assert.equal(rc.group.visible, true);
  rc.dispose();
});

console.log('Chrono et retour au checkpoint');
await test('solo : le chrono revient au checkpoint ; multijoueur : il continue de tourner', () => {
  const tr = new Track('t'); tr.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 }); tr.add({ t: 'finish', x: 0, z: -2, l: 0, r: 0 });
  const mk = () => { const l = new RaceLogic(tr); l.respawn = { x: 0, y: 0, z: 0, yaw: 0, snap: { steps: 100, splits: 0, collected: [], lap: 1 } }; l.steps = 900; return l; };
  const solo = mk(); solo.rewind(); assert.equal(solo.steps, 100);
  const multi = mk(); multi.rewind({ keepClock: true }); assert.equal(multi.steps, 900, 'le temps perdu est une pénalité');
});

console.log('Salon et code');
await test('code de salle : 6 caractères sans confusion possible, saisie tolérante', () => {
  for (let i = 0; i < 200; i++) assert.ok(ROOM_RE.test(newRoomCode()), newRoomCode());
  assert.equal(normalizeCode(' ab-c d23 '), 'ABCD23'); assert.ok(!ROOM_RE.test('ABC0EF') && !ROOM_RE.test('ABCDE') && !ROOM_RE.test('ABCDEFG'));
});

console.log('Signalisation Supabase Realtime (protocole Phoenix, faux WebSocket)');
class FakeWS {
  static last = null;
  constructor(url) { this.url = url; this.sent = []; this.readyState = 0; FakeWS.last = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); }
  send(t) { this.sent.push(JSON.parse(t)); }
  close() { this.readyState = 3; this.onclose && this.onclose(); }
  recv(m) { this.onmessage({ data: JSON.stringify(m) }); }
}
await test('rejoindre : bon topic, bonne config, présence et signaux filtrés', async () => {
  const sig = new SupabaseSignaling({ code: 'ABC234', selfId: 'me', WebSocketImpl: FakeWS, url: 'https://x.supabase.co', key: 'K', getToken: async () => 'TOK', heartbeatMs: 20 });
  const joined = []; const left = []; const sigs = [];
  sig.on('join', (id, m) => joined.push([id, m])); sig.on('leave', (id) => left.push(id)); sig.on('signal', (f, d) => sigs.push([f, d]));
  const p = sig.join({ name: 'Zoé', host: true });
  await new Promise((r) => setTimeout(r, 20));
  const ws = FakeWS.last;
  assert.ok(ws.url.startsWith('wss://x.supabase.co/realtime/v1/websocket?apikey=K&vsn=1.0.0'), ws.url);
  const j = ws.sent[0];
  assert.equal(j.topic, 'realtime:copytrack-room-ABC234'); assert.equal(j.event, 'phx_join');
  assert.equal(j.payload.config.presence.key, 'me'); assert.equal(j.payload.config.broadcast.self, false); assert.equal(j.payload.config.private, false); assert.equal(j.payload.access_token, 'TOK');
  ws.recv({ topic: j.topic, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: j.ref });
  ws.recv({ topic: j.topic, event: 'presence_state', payload: { me: { metas: [{ phx_ref: 'r0', name: 'Zoé' }] }, bob: { metas: [{ phx_ref: 'r1', name: 'Bob', host: false, v: 18 }] } } });
  await p;
  assert.deepEqual(joined, [['bob', { name: 'Bob', host: false, v: 18 }]], 'soi-même exclu, métadonnées Phoenix retirées');
  assert.ok(ws.sent.some((m) => m.event === 'presence' && m.payload.event === 'track' && m.payload.payload.name === 'Zoé'));
  // diff : arrivée et départ
  ws.recv({ topic: j.topic, event: 'presence_diff', payload: { joins: { cat: { metas: [{ phx_ref: 'r2', name: 'Cat' }] } }, leaves: { bob: { metas: [{}] } } } });
  assert.equal(joined.length, 2); assert.deepEqual(left, ['bob']);
  // signal : seulement ceux qui me sont destinés
  ws.recv({ topic: j.topic, event: 'broadcast', payload: { type: 'broadcast', event: 'signal', payload: { from: 'cat', to: 'me', data: { k: 'ice' } } } });
  ws.recv({ topic: j.topic, event: 'broadcast', payload: { type: 'broadcast', event: 'signal', payload: { from: 'cat', to: 'autre', data: { k: 'ice' } } } });
  assert.equal(sigs.length, 1);
  sig.send('cat', { k: 'desc' });
  const b = ws.sent.at(-1); assert.equal(b.event, 'broadcast'); assert.deepEqual(b.payload.payload, { from: 'me', to: 'cat', data: { k: 'desc' } });
  await new Promise((r) => setTimeout(r, 70));
  assert.ok(ws.sent.some((m) => m.topic === 'phoenix' && m.event === 'heartbeat'), 'battement de cœur');
  sig.leave();
});
await test('serveur qui refuse la salle : erreur claire', async () => {
  const sig = new SupabaseSignaling({ code: 'ABC234', selfId: 'me', WebSocketImpl: FakeWS, url: 'https://x.supabase.co', key: 'K' });
  const p = sig.join({});
  await new Promise((r) => setTimeout(r, 20));
  const ws = FakeWS.last, j = ws.sent[0];
  ws.recv({ topic: j.topic, event: 'phx_reply', payload: { status: 'error', response: { reason: 'Unauthorized' } }, ref: j.ref });
  await assert.rejects(p, /refusée.*Unauthorized/);
});

console.log('Négociation WebRTC (faux RTCPeerConnection en mémoire)');
// Deux faux navigateurs reliés : la logique d'offre / réponse / candidats, pas le réseau.
class Hub { constructor() { this.sig = new Map(); } }
class FakeSignaling extends Emitter {
  constructor(hub, id) { super(); this.hub = hub; this.id = id; hub.sig.set(id, this); this.sent = []; this.peers = new Map(); }
  send(to, data) { this.sent.push({ to, data }); queueMicrotask(() => { const t = this.hub.sig.get(to); if (t) t.emit('signal', this.id, JSON.parse(JSON.stringify(data))); }); return true; }
}
const pcs = new Map();   // pc id → instance
class FakeChannel { constructor(label, opts) { this.label = label; this.opts = opts; this.readyState = 'connecting'; this.bufferedAmount = 0; this.sent = []; this.peer = null; }
  send(d) { this.sent.push(d); if (this.peer && this.peer.onmessage) { const data = typeof d === 'string' ? d : d; queueMicrotask(() => this.peer.onmessage({ data })); } }
  close() { this.readyState = 'closed'; if (this.onclose) this.onclose(); } }
let PC_N = 0;
class FakePC {
  constructor() { this.id = ++PC_N; this.channels = []; this.cands = []; this.remote = null; this.local = null; this.closed = false; pcs.set(this.id, this); }
  createDataChannel(label, opts) { const c = new FakeChannel(label, opts); this.channels.push(c); return c; }
  async createOffer() { return { type: 'offer', sdp: 'offer-' + this.id }; }
  async createAnswer() { return { type: 'answer', sdp: 'answer-' + this.id }; }
  async setLocalDescription(d) { this.local = d; this.localDescription = { ...d, toJSON() { return { type: d.type, sdp: d.sdp }; } }; setTimeout(() => this.onicecandidate && this.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'cand-' + this.id }) } }), 0); }
  async setRemoteDescription(d) {
    if (!d || !d.type) throw new Error('bad');
    this.remote = d;
    if (d.type === 'offer' && this.ondatachannel) {      // l'autre côté reçoit des canaux miroirs
      const other = [...pcs.values()].find((p) => p !== this && p.channels.length && !p.paired && p.local && p.local.sdp === d.sdp);
      if (other) { other.paired = true; this.paired = true; for (const c of other.channels) { const m = new FakeChannel(c.label, c.opts); m.peer = c; c.peer = m; this.channels.push(m); queueMicrotask(() => this.ondatachannel({ channel: m })); setTimeout(() => { m.readyState = 'open'; c.readyState = 'open'; m.onopen && m.onopen(); c.onopen && c.onopen(); }, 5); } }
    }
  }
  async addIceCandidate(c) { if (!this.remote) throw new Error('candidat avant la description distante'); this.cands.push(c); }
  close() { this.closed = true; }
}
await test('une seule offre par paire (le plus petit identifiant initie), candidats mis en file, canaux ouverts', async () => {
  const hub = new Hub();
  const sA = new FakeSignaling(hub, 'aaa'), sB = new FakeSignaling(hub, 'bbb');
  const got = { A: [], B: [] }, links = { A: [], B: [] };
  const mk = (id, sig, k) => new PeerMesh({ selfId: id, signaling: sig, RTC: FakePC, handlers: { onMessage: (from, kind, d) => got[k].push([from, kind, d]), onLink: (from, st) => links[k].push([from, st]) } });
  const mA = mk('aaa', sA, 'A'), mB = mk('bbb', sB, 'B');
  mA.addPeer('bbb'); mB.addPeer('aaa');                                  // les deux se voient en même temps
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(sA.sent.filter((m) => m.data.k === 'desc').length, 1, 'A (initiateur) envoie une offre');
  assert.equal(sB.sent.filter((m) => m.data.k === 'desc').length, 1, 'B envoie la réponse, pas une offre');
  assert.equal(sA.sent.find((m) => m.data.k === 'desc').data.d.type, 'offer');
  assert.equal(sB.sent.find((m) => m.data.k === 'desc').data.d.type, 'answer');
  const pcB = [...pcs.values()].at(-1); assert.ok(pcB.cands.length >= 1, 'candidat appliqué (après la description distante)');
  assert.deepEqual(links.A.at(-1), ['bbb', 'open']); assert.deepEqual(links.B.at(-1), ['aaa', 'open']);
  const chA = mA.links.get('bbb').state;
  assert.equal(chA.opts.ordered, false); assert.equal(chA.opts.maxRetransmits, 0, 'canal d\'état non fiable');
  assert.equal(mA.links.get('bbb').ctl.opts.ordered, true);
  // messages fiables et paquets d'état de bout en bout
  mA.sendCtl({ k: 'hi', n: 1 }); mA.broadcastState(new Uint8Array([1, 2, 3]).buffer);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got.B.find((g) => g[1] === 'ctl'), ['aaa', 'ctl', { k: 'hi', n: 1 }]);
  assert.ok(got.B.some((g) => g[1] === 'state'));
  // file d'envoi pleine : le paquet est sauté, pas empilé
  chA.bufferedAmount = 1e6; const before = chA.sent.length; mA.broadcastState(new ArrayBuffer(38)); assert.equal(chA.sent.length, before); assert.equal(mA.stats.skipped, 1);
  // départ d'un joueur
  mA.removePeer('bbb'); assert.equal(mA.links.has('bbb'), false);
});
await test('signalisation invalide ou tardive : ignorée sans planter', async () => {
  const hub = new Hub(); const s = new FakeSignaling(hub, 'aaa');
  const m = new PeerMesh({ selfId: 'aaa', signaling: s, RTC: FakePC, handlers: { onMessage() {}, onLink() {} } });
  for (const bad of [null, 5, 'x', { k: 'desc' }, { k: 'desc', d: { type: 'rien' } }, { k: 'ice', c: { candidate: 'x' } }]) s.emit('signal', 'zzz', bad);
  await new Promise((r) => setTimeout(r, 10));
});

console.log('Salon (hôte, jonction, version, départ)');
function fakeRoomEnv() {
  const peers = new Map();       // code → Map id → signaling
  const make = (id, code) => {
    const reg = peers.get(code) || peers.set(code, new Map()).get(code);
    const sig = new Emitter(); sig.peers = new Map(); sig.sentTo = []; sig.id = id;
    sig.join = async (meta) => { sig.meta = meta; for (const [oid, o] of reg) { sig.peers.set(oid, o.meta); } reg.set(id, sig); for (const [oid, o] of reg) if (oid !== id) { o.peers.set(id, meta); o.emit('join', id, meta); } };
    sig.track = (meta) => { sig.meta = meta; for (const [oid, o] of reg) if (oid !== id) { o.peers.set(id, meta); o.emit('meta', id, meta); } };
    sig.send = () => true;
    sig.leave = () => { reg.delete(id); for (const o of reg.values()) { o.peers.delete(id); o.emit('leave', id); } };
    return sig;
  };
  const meshes = [];
  const makeMesh = ({ selfId, handlers }) => { const m = { selfId, handlers, links: new Map(), ctl: [], state: [], addPeer(id) { this.added = (this.added || []).concat(id); }, removePeer() {}, closeAll() {}, sendCtl(msg, to) { this.ctl.push([msg, to]); }, broadcastState(b) { this.state.push(b); } }; meshes.push(m); return m; };
  return { make, makeMesh, meshes };
}
await test('créer puis rejoindre par code ; code inconnu, code pris, salle pleine, mauvaise version', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  const host = await Room.create({ ...opts('Hôte'), code: 'ABC234' });
  assert.ok(host.isHost && host.code === 'ABC234');
  await assert.rejects(() => Room.create({ ...opts('Autre'), code: 'ABC234' }), (e) => e.code === 'taken');
  await assert.rejects(() => Room.join('zzz', opts('X')), (e) => e.code === 'bad-code');
  await assert.rejects(() => Room.join('QQQQQ2', opts('X')), (e) => e.code === 'not-found');
  const guest = await Room.join('abc 234', opts('Invité'));            // saisie tolérante
  assert.equal(guest.members.size, 1); assert.equal(host.members.size, 1);
  assert.ok(!guest.isHost && host.isHost);
  assert.equal(guest.mesh.added.length, 1, 'le joueur présent est ajouté au maillage');
  // version différente : l'hôte ne s'y connecte pas
  host.signaling.peers.set('old', { name: 'Vieux', v: PHYS_VER - 1 }); host._onPeer('old', { name: 'Vieux', v: PHYS_VER - 1 });
  assert.equal(host.members.get('old').link, 'incompatible');
  // hôte parti : migration vers l'identifiant le plus petit
  const ids = [guest.selfId];
  host.leave();
  assert.equal(guest.isHost, true, 'le seul restant devient hôte');
  guest.leave();
});
await test('le départ est donné par l\'hôte seulement, avec un délai commun', async () => {
  const env = fakeRoomEnv();
  const opts = (name) => ({ name, makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh });
  let t = 1000; const now = () => t;
  const host = await Room.create({ ...opts('H'), code: 'ABC234', now }); const g = await Room.join('ABC234', { ...opts('G'), now });
  let started = null; g.on('start', (e) => { started = e; });
  host.selectTrack('b-1-xyz');
  assert.deepEqual(env.meshes[0].ctl.at(-1)[0], { k: 'track', id: 'b-1-xyz' });
  assert.equal(g.start(), false, 'un invité ne peut pas lancer');
  // l'invité reçoit le message de départ de l'hôte (par le canal fiable)
  g.members.get(host.selfId).rtt = 80;
  g._onMessage(host.selfId, 'ctl', { k: 'start', trackId: 'b-1-xyz', startIn: 4000 });
  assert.equal(started.trackId, 'b-1-xyz'); assert.equal(started.startLocal, 1000 + 4000 - 40, 'départ = délai − demi-aller-retour');
  // un faux « départ » venu d'un autre joueur est ignoré
  g.state = 'lobby'; started = null; g._onMessage('intrus', 'ctl', { k: 'start', trackId: 'x', startIn: 10 }); assert.equal(started, null);
  host.leave(); g.leave();
});
await test('paquets d\'état : anti-inondation et classement des arrivées', async () => {
  const env = fakeRoomEnv();
  const room = await Room.create({ name: 'H', code: 'ABC234', makeSignaling: ({ code, selfId }) => env.make(selfId, code), makeMesh: env.makeMesh, now: () => 5 });
  let n = 0; room.on('snapshot', () => n++);
  const ab = packSnapshot(snap(1, 0));
  for (let i = 0; i < 300; i++) room._onMessage('p', 'state', ab);
  assert.equal(n, 80, 'au plus 80 paquets par seconde et par joueur');
  room._onMessage('p', 'state', new ArrayBuffer(5)); assert.equal(n, 80);
  room.members.set('p', { id: 'p', name: 'Pierre', link: 'open', rtt: 0 }); room.members.set('q', { id: 'q', name: 'Quentin', link: 'open', rtt: 0 });
  room._onMessage('q', 'ctl', { k: 'finish', steps: 5000 }); room._onMessage('p', 'ctl', { k: 'finish', steps: 4800 });
  room._onMessage('p', 'ctl', { k: 'finish', steps: 1 });                  // un second « finish » ne change rien
  room._onMessage('q', 'ctl', { k: 'finish', steps: -4 });
  assert.deepEqual(room.ranking().map((r) => r.name), ['Pierre', 'Quentin', 'H']);
  room.reportFinish(4900);
  assert.deepEqual(room.ranking().map((r) => r.name), ['Pierre', 'H', 'Quentin']);
  room.leave();
});

if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
console.log('\nTous les tests réseau passent.');
