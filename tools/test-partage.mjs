// Partage de replays (0.9.17) : lien de fantôme (#g=…), export vidéo. node tools/test-partage.mjs   (npm test)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { encodeGhost, decodeGhost, ghostLink, ghostFromHash, GHOST_LINK_MAX } from '../js/replay.js';
import { pickMime, videoSupported, CanvasRecorder, videoFileName } from '../js/videoExport.js';
import { PHYS_VER } from '../js/version.js';

const GH = { trackKey: 'b-eclats-abc123', time: 21.345, name: 'Ana', inputs: 'AAECAwQFBgcICQ==' };

console.log('Lien de fantôme');
test('un fantôme voyage dans un lien et se relit à l\'identique, quelle que soit l\'adresse de départ (avec ou sans # ou ?)', () => {
  const code = encodeGhost(GH);
  for (const base of ['https://jeu.example/', 'https://jeu.example/copytrack/?net=local#t=autre', 'http://localhost:8000/index.html#g=ancien']) {
    const link = ghostLink(base, code);
    assert.ok(link.startsWith(base.split('#')[0] + '#g='), link);
    assert.equal(link.split('#').length, 2, 'un seul fragment');
    const hash = '#' + link.split('#')[1];
    const g = ghostFromHash(hash);
    assert.deepEqual([g.trackKey, g.time, g.name, g.inputs, g.v], [GH.trackKey, GH.time, 'Ana', GH.inputs, PHYS_VER]);
  }
  assert.deepEqual(decodeGhost(code), ghostFromHash(ghostLink('https://x/', code).slice(ghostLink('https://x/', code).indexOf('#'))));
});
test('ce qui n\'est pas un lien de fantôme est ignoré ; un lien cassé ou coupé donne une erreur lisible, jamais une exception brute', () => {
  for (const h of ['', '#', '#t=abc', '#g', null, undefined]) assert.equal(ghostFromHash(h), null, String(h));
  const code = encodeGhost(GH);
  assert.throws(() => ghostFromHash('#g=%E0%A4%A'), /Lien de fantôme invalide/, 'pourcentage cassé');
  assert.throws(() => ghostFromHash('#g=' + encodeURIComponent('SHW1:abc')), /Lien de fantôme invalide/, 'un code de circuit n\'est pas un fantôme');
  assert.throws(() => ghostFromHash('#g=' + encodeURIComponent(code.slice(0, code.length - 12))), /invalide ou coupé/, 'code tronqué par une messagerie');
  assert.throws(() => ghostFromHash('#g=' + encodeURIComponent('SHG1:' + btoa('{"k":"x"}'))), /invalide ou coupé/, 'champs manquants');
});
test('un fantôme de course ordinaire (une minute) tient dans la limite d\'un lien ; un très long replay la dépasse (le jeu prévient)', () => {
  const small = encodeGhost({ ...GH, inputs: 'A'.repeat(3000) });
  assert.ok(ghostLink('https://jeu.example/', small).length < GHOST_LINK_MAX);
  const big = encodeGhost({ ...GH, inputs: 'A'.repeat(9000) });
  assert.ok(ghostLink('https://jeu.example/', big).length > GHOST_LINK_MAX);
});

console.log('Export vidéo');
class FakeMR {
  static isTypeSupported(m) { return FakeMR.ok.includes(m); }
  constructor(stream, o) { this.stream = stream; this.opts = o; this.state = 'inactive'; FakeMR.last = this; }
  start(ms) { this.state = 'recording'; this.slice = ms; setTimeout(() => this.ondataavailable && this.ondataavailable({ data: new Blob(['x'.repeat(100)]) }), 1); }
  stop() { this.state = 'inactive'; setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob(['y'.repeat(50)]) }); this.onstop && this.onstop(); }, 1); }
}
const fakeCanvas = (tracks = []) => ({ captureStream: (fps) => ({ fps, getTracks: () => tracks }) });
test('format : VP9 de préférence, puis VP8, WebM, MP4 ; aucun si MediaRecorder est absent', () => {
  FakeMR.ok = ['video/webm;codecs=vp9', 'video/webm'];
  assert.equal(pickMime(FakeMR), 'video/webm;codecs=vp9');
  FakeMR.ok = ['video/webm'];
  assert.equal(pickMime(FakeMR), 'video/webm');
  FakeMR.ok = ['video/mp4'];
  assert.equal(pickMime(FakeMR), 'video/mp4');
  FakeMR.ok = [];
  assert.equal(pickMime(FakeMR), null); assert.equal(pickMime(undefined), null); assert.equal(pickMime({}), null);
  assert.equal(videoSupported(fakeCanvas(), FakeMR), false);
  FakeMR.ok = ['video/webm'];
  assert.equal(videoSupported(fakeCanvas(), FakeMR), true); assert.equal(videoSupported({}, FakeMR), false); assert.equal(videoSupported(null, FakeMR), false);
});
await test('enregistrement : les morceaux sont réunis dans un fichier du bon type, les pistes du flux sont arrêtées, l\'annulation ne livre rien', async () => {
  FakeMR.ok = ['video/webm;codecs=vp8', 'video/webm'];
  let stopped = 0;
  const canvas = fakeCanvas([{ stop: () => { stopped++; } }, { stop: () => { stopped++; } }]);
  const rec = new CanvasRecorder(canvas, { fps: 30, bitsPerSecond: 1_000_000, MR: FakeMR });
  assert.equal(rec.mime, 'video/webm;codecs=vp8'); assert.equal(FakeMR.last.opts.videoBitsPerSecond, 1_000_000); assert.equal(rec.stream.fps, 30);
  rec.start();
  assert.equal(FakeMR.last.state, 'recording'); assert.equal(FakeMR.last.slice, 500);
  await new Promise((r) => setTimeout(r, 5));
  const blob = await rec.stop();
  assert.equal(blob.type, 'video/webm'); assert.equal(blob.size, 150); assert.equal(stopped, 2);
  const c2 = new CanvasRecorder(fakeCanvas([{ stop: () => { stopped++; } }]), { MR: FakeMR }).start();
  c2.cancel();
  assert.equal(stopped, 3); assert.equal(c2.chunks.length, 0);
  assert.throws(() => new CanvasRecorder({}, { MR: FakeMR }), /pas disponible/);
  FakeMR.ok = [];
  assert.throws(() => new CanvasRecorder(fakeCanvas(), { MR: FakeMR }), /pas disponible/);
});
test('nom de fichier : lettres, chiffres et tirets seulement, accents retirés, temps lisible', () => {
  assert.equal(videoFileName('Îles Suspendues', 31.456), 'copytrack-iles-suspendues-31_46s.webm');
  assert.equal(videoFileName('../../etc/passwd<>', 12), 'copytrack-etc-passwd-12_00s.webm');
  assert.equal(videoFileName('', NaN, 'video/mp4'), 'copytrack-replay-clip.mp4');
  assert.ok(videoFileName('x'.repeat(200), 1).length < 70);
});

await finish('Tous les tests du partage de replays passent.');
