// Référence de parcours : une ligne le long du circuit, graduée en mètres, sur laquelle on projette toute course pour la comparer à une autre
// (« à 820 m du départ, tu avais 0,4 s de retard »). Module pur, testé sous Node.
//
//   makeReference(track, fallback)   la ligne de course du circuit (track.path : circuits scriptés, tours compris) ; sinon la trajectoire d'une
//                                    course (fallback : une RunTrace, en général le record) : un circuit de l'éditeur n'a pas de ligne centrale continue
//   alignTrace(trace, ref)           ajoute à la trace s (distance projetée, m) et sm (la même, jamais décroissante : pour lire le temps à une distance)
//   timeAtS(trace, s)                chrono de la course quand elle passe à la distance s (interpolé)
const MIN_SPACING = 0.5;          // m : points trop proches fusionnés (une trace arrêtée ne fait pas de segments nuls)
const WINDOW_BACK = 4, WINDOW_FWD = 80, LOST = 45;

export function makeReference(track, fallback = null) {
  const src = [];
  if (track.path && track.path.length > 1) for (const p of track.path) src.push(p[0], p[1], p[2]);
  else if (fallback && fallback.n > 1) for (let i = 0; i < fallback.n; i++) src.push(fallback.pos[i * 3], fallback.pos[i * 3 + 1], fallback.pos[i * 3 + 2]);
  else return null;
  const pts = [src[0], src[1], src[2]], cum = [0];
  for (let i = 3; i < src.length; i += 3) {
    const k = pts.length - 3, dx = src[i] - pts[k], dy = src[i + 1] - pts[k + 1], dz = src[i + 2] - pts[k + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < MIN_SPACING) continue;
    pts.push(src[i], src[i + 1], src[i + 2]);
    cum.push(cum[cum.length - 1] + d);
  }
  return { pts: Float64Array.from(pts), cum: Float64Array.from(cum), n: cum.length, length: cum[cum.length - 1], source: track.path && track.path.length > 1 ? 'path' : 'trace' };
}

// Point le plus proche sur le segment j (j -> j+1) : { d2, s }.
function onSegment(ref, j, x, y, z, out) {
  const P = ref.pts, a = j * 3, b = a + 3;
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
  const L2 = ux * ux + uy * uy + uz * uz || 1e-9;
  let t = ((x - P[a]) * ux + (y - P[a + 1]) * uy + (z - P[a + 2]) * uz) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = P[a] + ux * t - x, py = P[a + 1] + uy * t - y, pz = P[a + 2] + uz * t - z;
  out.d2 = px * px + py * py + pz * pz;
  out.s = ref.cum[j] + (ref.cum[j + 1] - ref.cum[j]) * t;
  return out;
}

// Projection fenêtrée : on cherche près du segment précédent (une course avance), et partout seulement si on s'est perdu (raccourci, saut).
export function project(ref, x, y, z, j0 = 0, out = { s: 0, j: 0, d: 0 }) {
  const seg = { d2: 0, s: 0 };
  let best = Infinity, bs = 0, bj = j0;
  const scan = (lo, hi) => {
    for (let j = Math.max(0, lo); j <= Math.min(ref.n - 2, hi); j++) {
      onSegment(ref, j, x, y, z, seg);
      if (seg.d2 < best) { best = seg.d2; bs = seg.s; bj = j; }
    }
  };
  scan(j0 - WINDOW_BACK, j0 + WINDOW_FWD);
  if (best > LOST * LOST) scan(0, ref.n - 2);
  out.s = bs; out.j = bj; out.d = Math.sqrt(best);
  return out;
}

export function alignTrace(trace, ref) {
  const s = new Float64Array(trace.n), sm = new Float64Array(trace.n), off = new Float32Array(trace.n);
  const o = { s: 0, j: 0, d: 0 };
  let j = 0, m = 0;
  for (let i = 0; i < trace.n; i++) {
    project(ref, trace.pos[i * 3], trace.pos[i * 3 + 1], trace.pos[i * 3 + 2], j, o);
    j = o.j; s[i] = o.s; off[i] = o.d;
    m = Math.max(m, o.s); sm[i] = m;
  }
  trace.s = s; trace.sm = sm; trace.off = off; trace.ref = ref;
  return trace;
}

// Chrono à la distance s (interpolé entre deux échantillons ; avant le premier : proportionnel ; au-delà : null).
export function timeAtS(trace, s) {
  const sm = trace.sm, n = trace.n;
  if (!n || s > sm[n - 1]) return null;
  if (s <= sm[0]) return sm[0] > 0 ? trace.t[0] * (s / sm[0]) : trace.t[0];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (sm[mid] < s) lo = mid; else hi = mid; }
  const ds = sm[hi] - sm[lo];
  return ds > 0 ? trace.t[lo] + (trace.t[hi] - trace.t[lo]) * ((s - sm[lo]) / ds) : trace.t[hi];
}

// Indice de l'échantillon le plus proche d'une distance s.
export function indexAtS(trace, s) {
  const sm = trace.sm;
  let lo = 0, hi = trace.n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (sm[mid] < s) lo = mid; else hi = mid; }
  return Math.abs(sm[lo] - s) <= Math.abs(sm[hi] - s) ? lo : hi;
}
