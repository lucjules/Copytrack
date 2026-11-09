// Empreinte des sorties de js/dmath.js sur une grille d'entrées fixe. Module sans dépendance Node : il est importé par tools/test-dmath.mjs
// (Node, Deno) et par tools/test-browser.mjs (dans Chromium) ; la valeur doit être identique partout.
import { dsin, dcos, dtan, datan, datan2, dasin, dacos, dexp, dlog, dpow } from '../js/dmath.js';

// Entrées générées en entiers seulement (jamais par Math.*) : les mêmes sur toutes les machines.
export const inputs = (n, scale, offset = 0) => Array.from({ length: n }, (_, i) => ((i * 2654435761) % 1000003) / 1000003 * 2 * scale - scale + offset);

// Empreinte FNV-1a des bits de toutes les sorties sur une grille d'entrées fixe. La valeur attendue a été calculée une fois ; elle doit être
// retrouvée sous Node, Deno, Chromium : les opérations utilisées sont IEEE 754 exactes, donc aucun moteur ne peut s'en écarter.
export function dmathDigest() {
  const buf = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5 >>> 0, h2 = 0x01000193 >>> 0;
  const mix = (x) => {
    buf.setFloat64(0, Number.isNaN(x) ? NaN : x, true);
    for (let i = 0; i < 8; i++) { h = Math.imul(h ^ buf.getUint8(i), 16777619) >>> 0; h2 = Math.imul(h2 ^ (buf.getUint8(i) + i), 2246822519) >>> 0; }
  };
  for (const x of inputs(4000, 300)) { mix(dsin(x)); mix(dcos(x)); mix(datan(x)); mix(dexp(x / 20)); mix(dtan(x / 200)); }
  for (const x of inputs(2000, 1)) { mix(dasin(x)); mix(dacos(x)); }
  for (const x of inputs(2000, 50)) mix(dlog(Math.abs(x) + 1e-3));
  for (const y of inputs(60, 9)) for (const x of inputs(60, 9, 0.5)) mix(datan2(y, x));
  for (const x of inputs(500, 3)) mix(dpow(Math.abs(x), 1.5));
  return h.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export const DMATH_DIGEST_EXPECTED = '21e0af9b1f3416a7';
