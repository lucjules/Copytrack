// Codes de circuit abîmés : node tools/test-codes-fuzz.mjs   (npm test)
// Un code collé par un joueur peut être tronqué, modifié ou inventé. Le décodeur doit soit refuser avec une vraie erreur, soit rendre un circuit valide
// qu'on peut ensuite valider, ré-encoder et jouer quelques pas ; jamais planter autrement, jamais boucler.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { Track } from '../js/track.js';
import { Simulation } from '../js/simulation.js';

let seed = 4242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/-_=:';
function corrupt(code) {
  const r = rnd();
  if (r < 0.2) return code.slice(0, Math.floor(rnd() * code.length));
  if (r < 0.4) { const i = Math.floor(rnd() * code.length); return code.slice(0, i) + code.slice(i + 1 + Math.floor(rnd() * 20)); }
  if (r < 0.8) { let c = code; for (let n = 1 + Math.floor(rnd() * 4); n > 0; n--) { const i = Math.floor(rnd() * c.length); c = c.slice(0, i) + ALPHA[Math.floor(rnd() * ALPHA.length)] + c.slice(i + 1); } return c; }
  if (r < 0.9) return code + ALPHA.slice(0, Math.floor(rnd() * 30));
  return code.slice(0, 5) + code.slice(5).split('').reverse().join('');
}

console.log('Codes de circuit abîmés');
test('2000 codes abîmés : refus propre (Error) ou circuit jouable', () => {
  const codes = BUILTIN_TRACKS.map((d) => buildBuiltin(d).encode());
  let ok = 0, refused = 0;
  const t0 = Date.now();
  for (let i = 0; i < 2000; i++) {
    const code = corrupt(codes[i % codes.length]);
    let tr;
    try { tr = Track.decode(code); } catch (e) { assert.ok(e instanceof Error, 'exception qui n\'est pas une Error : ' + String(e)); refused++; continue; }
    try {
      tr.validate();
      const again = Track.decode(tr.encode());
      assert.equal(again.signature(), tr.signature(), 'ré-encodage instable');
      if (tr.path && tr.path.length) { const sim = new Simulation(tr); sim.start(); for (let k = 0; k < 60; k++) { sim.drive({ steer: 0, throttle: true, brake: false }); sim.score(); } assert.ok(Number.isFinite(sim.phys.pos.x)); }
      ok++;
    } catch (e) { assert.fail(`code abîmé accepté puis cassé (#${i}) : ${e && e.message}`); }
  }
  assert.ok(Date.now() - t0 < 120000, 'trop lent');
  assert.ok(refused > 500, `la plupart sont refusés (${refused} refus, ${ok} acceptés)`);
});
test('textes sans rapport : vides, très longs, caractères de contrôle, JSON : refusés', () => {
  for (const code of ['', ' ', 'SHW', 'SHW1:', 'SHW2:!!!!', '{"a":1}', 'x'.repeat(100000), '\u0000\u0001', 'SHW1:' + 'A'.repeat(50000), 'SHW1:' + '%%%']) {
    let threw = false; try { Track.decode(code); } catch (e) { threw = e instanceof Error; }
    assert.ok(threw, 'accepté : ' + code.slice(0, 20));
  }
});
finish('Tous les tests de codes abîmés passent.');
