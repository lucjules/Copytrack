// Mathématiques déterministes (js/dmath.js) : précision proche de Math.*, identités exactes, et empreinte de sortie IDENTIQUE sur tous les moteurs
// (Node, Deno, Chromium...) : node tools/test-dmath.mjs   (npm test ; le workflow CI le relance sous Deno)
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { PI, dsin, dcos, dtan, datan, datan2, dasin, dacos, dexp, dlog, dpow, hypot2, hypot3 } from '../js/dmath.js';
import { inputs, dmathDigest, DMATH_DIGEST_EXPECTED } from './dmath-digest.mjs';

const maxErr = (f, g, xs, rel = false) => xs.reduce((m, x) => { const a = f(x), b = g(x); const e = Math.abs(a - b) / (rel ? Math.max(Math.abs(b), 1e-300) : 1); return e > m ? e : m; }, 0);

console.log('Précision (par rapport à Math.*, qui n\'est qu\'une approximation elle aussi)');
test('sin, cos : erreur < 2e-15 sur ±1000 rad, y compris près des multiples de π/2', () => {
  const xs = inputs(20000, 1000);
  for (let k = -300; k <= 300; k++) xs.push(k * PI / 2, k * PI / 2 + 1e-9, k * PI / 2 - 1e-9);
  assert.ok(maxErr(dsin, Math.sin, xs) < 2e-15, 'sin ' + maxErr(dsin, Math.sin, xs));
  assert.ok(maxErr(dcos, Math.cos, xs) < 2e-15, 'cos ' + maxErr(dcos, Math.cos, xs));
});
test('tan : erreur relative < 1e-12 hors des pôles', () => {
  const xs = inputs(20000, 1.5);
  assert.ok(maxErr(dtan, Math.tan, xs, true) < 1e-12, '' + maxErr(dtan, Math.tan, xs, true));
});
test('atan, atan2, asin, acos : erreur < 3e-15', () => {
  const xs = inputs(20000, 50), us = inputs(20000, 1);
  assert.ok(maxErr(datan, Math.atan, xs) < 3e-15, 'atan ' + maxErr(datan, Math.atan, xs));
  assert.ok(maxErr(dasin, Math.asin, us) < 3e-15, 'asin ' + maxErr(dasin, Math.asin, us));
  assert.ok(maxErr(dacos, Math.acos, us) < 3e-15, 'acos ' + maxErr(dacos, Math.acos, us));
  const ys = inputs(500, 7), zs = inputs(500, 7, 0.37);
  let m = 0;
  for (const y of ys) for (const x of zs) m = Math.max(m, Math.abs(datan2(y, x) - Math.atan2(y, x)));
  assert.ok(m < 4e-15, 'atan2 ' + m);
});
test('exp, log, pow : erreur relative < 1e-14', () => {
  const xs = inputs(20000, 30), ps = inputs(20000, 100).map((v) => Math.abs(v) + 1e-6);
  assert.ok(maxErr(dexp, Math.exp, xs, true) < 1e-14, 'exp ' + maxErr(dexp, Math.exp, xs, true));
  assert.ok(maxErr(dlog, Math.log, ps, true) < 1e-14, 'log');
  assert.ok(maxErr((x) => dpow(x, 1.5), (x) => Math.pow(x, 1.5), ps, true) < 1e-13, 'pow 1,5');
  assert.ok(maxErr((x) => dexp(-1.5 * x / 120), (x) => Math.exp(-1.5 * x / 120), xs, true) < 1e-14, 'exp(-k·dt)');
});

console.log('Identités et valeurs particulières');
test('symétries exactes : sin impaire, cos paire', () => {
  for (const x of inputs(2000, 500)) { assert.equal(dsin(-x), -dsin(x)); assert.equal(dcos(-x), dcos(x)); assert.equal(datan(-x), -datan(x)); }
});
test('valeurs remarquables', () => {
  assert.equal(dsin(0), 0); assert.equal(dcos(0), 1); assert.equal(datan(0), 0); assert.equal(dexp(0), 1); assert.equal(dlog(1), 0);
  assert.ok(Math.abs(dsin(PI / 2) - 1) < 1e-16 && Math.abs(dcos(PI)) - 1 > -1e-16);
  assert.ok(Math.abs(datan(1) - PI / 4) < 1e-16);
  assert.ok(Math.abs(datan2(1, -1) - 3 * PI / 4) < 1e-15 && Math.abs(datan2(-1, -1) + 3 * PI / 4) < 1e-15);
  assert.equal(datan2(1, 0), PI / 2); assert.equal(datan2(-1, 0), -PI / 2); assert.equal(datan2(0, 0), 0);
  assert.equal(dpow(2, 10), 1024); assert.equal(dpow(7, 0), 1); assert.equal(dpow(9, 0.5), 3); assert.equal(dpow(3, 2), 9);
  assert.equal(dpow(-2, 3), -8); assert.ok(Number.isNaN(dpow(-2, 0.5)));
  assert.equal(hypot2(3, 4), 5); assert.equal(hypot3(2, 3, 6), 7);
});
test('cas limites : NaN, infinis, très grands arguments', () => {
  for (const f of [dsin, dcos, dtan, datan, dasin, dacos, dexp, dlog]) assert.ok(Number.isNaN(f(NaN)), f.name);
  assert.ok(Number.isNaN(dsin(Infinity)) && Number.isNaN(dcos(-Infinity)));
  assert.equal(datan(Infinity), PI / 2); assert.equal(datan(-Infinity), -PI / 2);
  assert.equal(dexp(800), Infinity); assert.equal(dexp(-800), 0); assert.equal(dlog(0), -Infinity); assert.ok(Number.isNaN(dlog(-1)));
  assert.ok(dexp(-744) > 0 && dexp(-744) < 1e-320);
  assert.ok(Number.isNaN(dasin(1.0000001)));
  assert.ok(Math.abs(dlog(5e-324) - Math.log(5e-324)) < 1e-11);
});

console.log('Déterminisme');
const digest = dmathDigest();
test('empreinte des sorties identique sur tous les moteurs', () => {
  assert.equal(digest, DMATH_DIGEST_EXPECTED, 'empreinte actuelle : ' + digest);
});

finish('Tous les tests des mathématiques déterministes passent.');
