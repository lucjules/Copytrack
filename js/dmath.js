// Mathématiques déterministes pour tout ce qui décide du résultat d'une course (physique, géométrie des pièces, pilote automatique, défi du jour).
//
// Pourquoi : la vérification des temps se fait côté serveur en REJOUANT la course (verify.js, fonction Supabase sous Deno), et les records, les
// fantômes et les salons multijoueur supposent que deux machines obtiennent exactement les mêmes nombres. Or ECMAScript laisse chaque moteur libre
// d'approximer Math.sin, Math.cos, Math.atan2, Math.exp, Math.pow, Math.hypot… : V8 12 (Node 22) et V8 15 (Deno 2.9) donnent déjà des résultats
// différents au dernier bit, et ces écarts, amplifiés par les collisions, font diverger une course (152 scénarios sur 161 de
// tools/phys-fingerprint.mjs différaient entre Node et Deno avant ce module). Firefox et Safari ont encore d'autres bibliothèques.
//
// Ici : uniquement + − × ÷ et sqrt, dont le résultat est imposé par IEEE 754 (arrondi correct) et identique partout, évalués dans un ordre fixe
// (schéma de Horner). Précision : quelques ulp (≈ 1e-15 en relatif), largement suffisante pour un jeu ; ce n'est PAS une bibliothèque numérique.
// Les fonctions exactes (abs, min, max, floor, ceil, round, trunc, sign, sqrt) restent celles de Math.
//
// Règle du dépôt (eslint.config.mjs) : pas de Math.sin / cos / tan / atan / atan2 / asin / acos / exp / log / pow / hypot dans les fichiers du
// noyau de simulation. Le rendu, l'audio et l'interface gardent Math.* (leurs résultats ne servent pas à rejouer une course).
const sqrt = Math.sqrt, floor = Math.floor, isNaN_ = Number.isNaN;

export const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;
const TWO_OVER_PI = 0.6366197723675814;
// π/2 en trois morceaux (réduction de Cody-Waite, valeurs de FDLIBM) : n·PIO2_1 est exact pour n < 2^20.
const PIO2_1 = 1.57079632673412561417e+00;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_3 = 2.02226624871116645580e-21;

// ---- sin, cos, tan ----------------------------------------------------------------------------------------------------------------
// x = n·π/2 + r avec |r| ≤ π/4 ; puis une série de Taylor (degré 17 / 18) sur r.
function ksin(r) {
  const z = r * r;
  return r * (1 + z * (-1 / 6 + z * (1 / 120 + z * (-1 / 5040 + z * (1 / 362880 + z * (-1 / 39916800 + z * (1 / 6227020800 + z * (-1 / 1307674368000 + z * (1 / 355687428096000)))))))));
}
function kcos(r) {
  const z = r * r;
  return 1 + z * (-1 / 2 + z * (1 / 24 + z * (-1 / 720 + z * (1 / 40320 + z * (-1 / 3628800 + z * (1 / 479001600 + z * (-1 / 87178291200 + z * (1 / 20922789888000 + z * (-1 / 6402373705728000)))))))));
}
let reducedR = 0;
// Renvoie n mod 4 et laisse r dans reducedR. Au-delà de ±1e6 rad (jamais atteint en jeu) ou pour NaN / ±∞ : NaN.
function reduce(x) {
  if (!(x > -1e6 && x < 1e6)) { reducedR = NaN; return 0; }
  const n = Math.round(x * TWO_OVER_PI);
  reducedR = ((x - n * PIO2_1) - n * PIO2_2) - n * PIO2_3;
  return n & 3;
}
export function dsin(x) {
  const q = reduce(x), r = reducedR;
  return q === 0 ? ksin(r) : q === 1 ? kcos(r) : q === 2 ? -ksin(r) : -kcos(r);
}
export function dcos(x) {
  const q = reduce(x), r = reducedR;
  return q === 0 ? kcos(r) : q === 1 ? -ksin(r) : q === 2 ? -kcos(r) : ksin(r);
}
export function dtan(x) {
  const q = reduce(x), r = reducedR;
  return (q & 1) === 0 ? ksin(r) / kcos(r) : -kcos(r) / ksin(r);
}

// ---- atan, atan2, asin, acos --------------------------------------------------------------------------------------------------------
// atan(t) = 2·atan(t / (1 + √(1 + t²))) : trois fois pour ramener |t| ≤ 1 sous 0,1, puis Taylor.
export function datan(x) {
  if (isNaN_(x)) return NaN;
  const neg = x < 0;
  let t = neg ? -x : x;
  const inv = t > 1;
  if (inv) t = 1 / t;
  t = t / (1 + sqrt(1 + t * t));
  t = t / (1 + sqrt(1 + t * t));
  t = t / (1 + sqrt(1 + t * t));
  const z = t * t;
  let s = t * (1 + z * (-1 / 3 + z * (1 / 5 + z * (-1 / 7 + z * (1 / 9 + z * (-1 / 11 + z * (1 / 13 + z * (-1 / 15 + z * (1 / 17)))))))));
  s *= 8;
  if (inv) s = HALF_PI - s;
  return neg ? -s : s;
}
export function datan2(y, x) {
  if (isNaN_(x) || isNaN_(y)) return NaN;
  if (x > 0) return datan(y / x);
  if (x < 0) { const a = datan(y / x); return y >= 0 ? a + PI : a - PI; }
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}
export function dasin(x) {
  if (!(x >= -1 && x <= 1)) return NaN;
  return datan2(x, sqrt((1 - x) * (1 + x)));
}
export function dacos(x) {
  if (!(x >= -1 && x <= 1)) return NaN;
  return datan2(sqrt((1 - x) * (1 + x)), x);
}

// ---- exp, log, pow ---------------------------------------------------------------------------------------------------------------
// Puissances de deux exactes (produits successifs : exacts), sans passer par Math.pow.
const POW2 = new Float64Array(2100);       // POW2[k + 1074] = 2^k
{
  let p = 1;
  for (let k = 0; k <= 1023; k++) { POW2[k + 1074] = p; p *= 2; }
  p = 1;
  for (let k = 0; k >= -1074; k--) { POW2[k + 1074] = p; p *= 0.5; }
}
const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.4426950408889634;

export function dexp(x) {
  if (isNaN_(x)) return NaN;
  if (x > 709.7) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x * INV_LN2);
  const r = (x - k * LN2_HI) - k * LN2_LO;
  const s = 1 + r * (1 + r * (1 / 2 + r * (1 / 6 + r * (1 / 24 + r * (1 / 120 + r * (1 / 720 + r * (1 / 5040 + r * (1 / 40320 + r * (1 / 362880 + r * (1 / 3628800 + r * (1 / 39916800 + r * (1 / 479001600 + r * (1 / 6227020800)))))))))))));
  // 2^k en deux temps pour ne pas sortir de la table quand k est très négatif
  const k1 = k < -1000 ? k + 100 : k;
  return k1 === k ? s * POW2[k + 1074] : s * POW2[k1 + 1074] * POW2[-100 + 1074];
}

const view = new DataView(new ArrayBuffer(8));
export function dlog(x) {
  if (isNaN_(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0;
  if (x < 2.2250738585072014e-308) { x *= POW2[54 + 1074]; e = -54; }       // sous-normal : on remonte d'abord dans la plage normale
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  e += ((hi >>> 20) & 0x7ff) - 1023;
  view.setUint32(0, (hi & 0x000fffff) | 0x3ff00000);
  let m = view.getFloat64(0);                // mantisse dans [1, 2)
  if (m > 1.4142135623730951) { m *= 0.5; e += 1; }
  const s = (m - 1) / (m + 1), z = s * s;
  const p = s * (2 + z * (2 / 3 + z * (2 / 5 + z * (2 / 7 + z * (2 / 9 + z * (2 / 11 + z * (2 / 13 + z * (2 / 15 + z * (2 / 17 + z * (2 / 19 + z * (2 / 21)))))))))));
  return e * LN2_HI + (p + e * LN2_LO);
}

export function dpow(x, y) {
  if (y === 0) return 1;
  if (isNaN_(x) || isNaN_(y)) return NaN;
  if (y === 1) return x;
  if (y === 2) return x * x;
  if (y === 0.5) return sqrt(x);
  if (x === 1) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  // Petit exposant entier : produits successifs (exacts tant que le résultat est représentable), signe de x respecté.
  if (y === floor(y) && y >= -64 && y <= 64) {
    let r = 1, b = x, n = y < 0 ? -y : y;
    while (n > 0) { if (n & 1) r *= b; b *= b; n >>= 1; }
    return y < 0 ? 1 / r : r;
  }
  if (x < 0) {
    if (floor(y) !== y) return NaN;
    const r = dexp(y * dlog(-x));
    return (y % 2 !== 0) ? -r : r;
  }
  return dexp(y * dlog(x));
}

// ---- hypot --------------------------------------------------------------------------------------------------------------------------
// (Math.hypot est « approximé » par la spécification : sa précision et son ordre de sommation dépendent du moteur.)
export const hypot2 = (a, b) => sqrt(a * a + b * b);
export const hypot3 = (a, b, c) => sqrt(a * a + b * b + c * c);
