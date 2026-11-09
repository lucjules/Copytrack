// Secteurs et écarts entre deux courses projetées sur la même référence (analysis/reference.js). Module pur, testé sous Node.
//
//   sectors(trace, { count })       la référence coupée en `count` mini-secteurs égaux : temps, vitesses mini et maxi de chacun. Le dernier finit
//                                   au chrono d'arrivée : la somme des secteurs est le temps de la course.
//   compareSectors(a, b)            écart secteur par secteur (a - b : positif = a plus lent)
//   delta(a, b, { step })           écart de temps (a - b) tous les `step` mètres, sur la distance commune
//   brakingPoints(trace)            freinages : où (s), à quelle vitesse, combien de vitesse perdue (trace issue de commandes seulement)
import { timeAtS, indexAtS } from './reference.js';

export function sectors(trace, { count = 12 } = {}) {
  const L = trace.ref.length, out = [];
  let t0 = 0, s0 = 0, i0 = 0;
  for (let k = 1; k <= count; k++) {
    const s1 = (L * k) / count;
    const t1 = k === count && trace.finished ? trace.time : timeAtS(trace, s1);
    if (t1 == null) break;                                  // course pas allée jusque-là
    const i1 = k === count ? trace.n - 1 : indexAtS(trace, s1);
    let vmin = Infinity, vmax = 0;
    for (let i = i0; i <= i1; i++) { const v = trace.v[i]; if (v < vmin) vmin = v; if (v > vmax) vmax = v; }
    out.push({ k, s0, s1, t0, t1, dt: t1 - t0, vmin: Number.isFinite(vmin) ? vmin : 0, vmax });
    t0 = t1; s0 = s1; i0 = i1;
  }
  return out;
}

export function compareSectors(a, b) {
  const n = Math.min(a.length, b.length), out = [];
  for (let k = 0; k < n; k++) out.push({ k: k + 1, s0: a[k].s0, s1: a[k].s1, a: a[k].dt, b: b[k].dt, diff: a[k].dt - b[k].dt });
  return out;
}

export function delta(a, b, { step = 5 } = {}) {
  const L = Math.min(a.sm[a.n - 1], b.sm[b.n - 1]);
  const m = Math.max(0, Math.floor(L / step));
  const s = new Float32Array(m + 1), dt = new Float32Array(m + 1);
  for (let k = 0; k <= m; k++) {
    s[k] = k * step;
    dt[k] = timeAtS(a, k * step) - timeAtS(b, k * step);
  }
  return { s, dt, step };
}

// Écart à une distance donnée (pour le HUD : sans tableau).
export function deltaAt(a, b, s) {
  const ta = timeAtS(a, s), tb = timeAtS(b, s);
  return ta == null || tb == null ? null : ta - tb;
}

export function brakingPoints(trace, { minSpeed = 15 } = {}) {
  if (!trace.brk) return [];
  const out = [];
  for (let i = 1; i < trace.n; i++) {
    if (!trace.brk[i] || trace.brk[i - 1] || trace.v[i] < minSpeed || (trace.air && trace.air[i])) continue;
    let j = i;
    while (j + 1 < trace.n && trace.brk[j + 1]) j++;
    out.push({ i, s: trace.sm ? trace.sm[i] : null, t: trace.t[i], v0: trace.v[i], v1: trace.v[j], len: j - i + 1 });
  }
  return out;
}
