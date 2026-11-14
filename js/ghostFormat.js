// Format des fantômes enregistrés : une pose (x, y, z + quaternion) tous les GHOST_EVERY pas de course, plus la liste des changements de véhicule.
// Module SANS rendu ni navigateur : la fonction serveur « submit-score » s'en sert pour fabriquer le fantôme d'un record pendant qu'elle rejoue la course (js/replay.js),
// et le jeu pour le dessiner (js/race/ghosts.js) ; les fantômes du haut des classements (supabase/etape7-fantomes.sql) ont exactement le format du record local.
import { dsin, dcos } from './dmath.js';

export const GHOST_EVERY = 4;                     // un échantillon tous les 4 pas (30 Hz)
export const GHOST_STRIDE = 7;                    // x, y, z, qx, qy, qz, qw
// Identifiants de véhicule des fantômes enregistrés (l'ordre est celui des enregistrements : ne jamais réordonner).
export const GHOST_VEHICLES = ['car', 'moto', 'boat', 'glider'];

// Véhicule d'un fantôme enregistré à l'image `frame`, d'après la liste de ses changements [[image, id], …] (vide : toujours la voiture, comme les anciens records).
export function ghostVehicleAt(changes, frame) {
  let id = 0;
  for (const [f, v] of changes) { if (f > frame) break; id = v; }
  return GHOST_VEHICLES[id] || 'car';
}

// Orientation d'une voiture d'après sa pose (le haut suit la normale au sol, sinon le ciel ; l'avant est celui du roulage) : [x, y, z, w] écrit dans out.
// Même règle que RaceSession._ghostQuat (testée à l'identique dans tools/test-fantomes.mjs), mais sans bibliothèque de rendu.
export function poseQuat(p, out = [0, 0, 0, 1]) {
  let ux = p.n.x, uy = p.n.y, uz = p.n.z;
  if (!p.grounded) { ux = 0; uy = 1; uz = 0; }
  let fx = p.fwd.x, fy = p.fwd.y, fz = p.fwd.z;
  const d = fx * ux + fy * uy + fz * uz;
  fx -= ux * d; fy -= uy * d; fz -= uz * d;
  if (fx * fx + fy * fy + fz * fz < 1e-6) { fx = -dsin(p.yaw); fy = 0; fz = -dcos(p.yaw); }
  let l = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  fx /= l; fy /= l; fz /= l;
  let rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;       // droite = avant × haut
  l = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  rx /= l; ry /= l; rz /= l;
  const m11 = rx, m12 = ux, m13 = -fx, m21 = ry, m22 = uy, m23 = -fy, m31 = rz, m32 = uz, m33 = -fz;      // colonnes : droite, haut, arrière
  const tr = m11 + m22 + m33;
  let x, y, z, w;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m32 - m23) * s; y = (m13 - m31) * s; z = (m21 - m12) * s; }
  else if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); w = (m32 - m23) / s; x = 0.25 * s; y = (m12 + m21) / s; z = (m13 + m31) / s; }
  else if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); w = (m13 - m31) / s; x = (m12 + m21) / s; y = 0.25 * s; z = (m23 + m32) / s; }
  else { const s = 2 * Math.sqrt(1 + m33 - m11 - m22); w = (m21 - m12) / s; x = (m13 + m31) / s; y = (m23 + m32) / s; z = 0.25 * s; }
  out[0] = x; out[1] = y; out[2] = z; out[3] = w;
  return out;
}

// ---- Float32Array <-> base64 (fantômes enregistrés) ------------------------------------------------------------------
export function encodeFloats(arr) {
  if (!ArrayBuffer.isView(arr)) return '';
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    const slice = bytes.subarray(i, Math.min(i + CH, bytes.length));
    bin += String.fromCharCode.apply(null, slice);
  }
  return btoa(bin);
}

// ---- Format compact « G2 » : fantôme de RECORD LOCAL (localStorage et sauvegarde du compte) ------------------------------------------------
// Le format serveur (Float32 en base64, `encodeFloats`) ne change pas. Le record local, lui, ne sert qu'à DESSINER la voiture : position au centimètre et orientation à 3e-5 près
// suffisent. Chaque image est écrite par prédiction : la position et chacune des 4 composantes du quaternion sont prédites par extrapolation linéaire des deux images précédentes
// (ordre 2) ; seul le RÉSIDU (petit : la voiture est un corps lisse) est écrit, en entier signé « zigzag » à longueur variable (1 octet le plus souvent). Mesuré sur les 72 circuits
// intégrés : 7,2 octets par image au lieu de 28 (×3,9 en base64), erreur de position ≤ 0,5 cm. Une téléportation donne seulement un résidu plus long, jamais une erreur.
// Les quaternions sont rangés dans un même hémisphère (q et −q sont la même rotation ; le rendu interpole par le plus court chemin) : sans cela les composantes sauteraient de signe.
// Chaîne : « G2: » + base64. Le préfixe est sans ambiguïté (« : » n'existe pas en base64) : decodeFloats lit les deux formats, les anciens records restent donc lisibles.
// Seulement + − × ÷, sqrt, round, floor (règle du noyau : ce module est dans la fermeture de la vérification serveur).
export const GHOST_PACK_PREFIX = 'G2:';
const POS_SCALE = 100;       // 1 cm
const QUAT_SCALE = 32767;
const zigzag = (n) => (n < 0 ? -2 * n - 1 : 2 * n);
const unzigzag = (v) => (v % 2 === 0 ? v / 2 : -(v + 1) / 2);
const predict = (a, b, i) => (i >= 2 ? 2 * a - b : i === 1 ? a : 0);

// Float32Array (x, y, z, qx, qy, qz, qw par image) -> « G2:… », ou null si les données ne s'y prêtent pas (vide, démesurées, non finies) : l'appelant garde alors encodeFloats.
export function packGhost(arr) {
  if (!ArrayBuffer.isView(arr) || !arr.length || arr.length % GHOST_STRIDE !== 0) return null;
  const n = arr.length / GHOST_STRIDE;
  if (n > MAX_GHOST_FRAMES) return null;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i]) || Math.abs(arr[i]) > 1e5) return null;
  const out = new Uint8Array(8 + n * GHOST_STRIDE * 5);
  let o = 0;
  const put = (v) => { while (v >= 128) { out[o++] = (v % 128) + 128; v = Math.floor(v / 128); } out[o++] = v; };
  put(n);
  const P0 = [0, 0, 0], P1 = [0, 0, 0], Q0 = [0, 0, 0, 0], Q1 = [0, 0, 0, 0];
  let pq0 = 0, pq1 = 0, pq2 = 0, pq3 = 1;      // quaternion précédent (pour le signe)
  for (let i = 0; i < n; i++) {
    const b = i * GHOST_STRIDE;
    for (let c = 0; c < 3; c++) {
      const q = Math.round(arr[b + c] * POS_SCALE);
      put(zigzag(q - predict(P0[c], P1[c], i)));
      P1[c] = P0[c]; P0[c] = q;
    }
    let x = arr[b + 3], y = arr[b + 4], z = arr[b + 5], w = arr[b + 6];
    if (x * pq0 + y * pq1 + z * pq2 + w * pq3 < 0) { x = -x; y = -y; z = -z; w = -w; }
    pq0 = x; pq1 = y; pq2 = z; pq3 = w;
    const qv = [x, y, z, w];
    for (let c = 0; c < 4; c++) {
      const q = Math.round(Math.max(-1, Math.min(1, qv[c])) * QUAT_SCALE);
      put(zigzag(q - predict(Q0[c], Q1[c], i)));
      Q1[c] = Q0[c]; Q0[c] = q;
    }
  }
  return GHOST_PACK_PREFIX + bytesToB64(out.subarray(0, o));
}

// « G2:… » -> Float32Array ; vide si la chaîne est abîmée, tronquée ou démesurée (jamais d'exception : le fantôme est simplement absent).
export function unpackGhost(s) {
  try {
    if (typeof s !== 'string' || !s.startsWith(GHOST_PACK_PREFIX)) return new Float32Array(0);
    const bin = atob(s.slice(GHOST_PACK_PREFIX.length));
    const end = bin.length;
    let o = 0;
    const get = () => {
      let v = 0, mul = 1;
      for (let k = 0; k < 7; k++) {
        if (o >= end) throw new Error('fin');
        const byte = bin.charCodeAt(o++);
        v += (byte % 128) * mul;
        if (byte < 128) return v;
        mul *= 128;
      }
      throw new Error('entier trop long');
    };
    const n = get();
    if (!(n >= 1 && n <= MAX_GHOST_FRAMES)) return new Float32Array(0);
    const res = new Float32Array(n * GHOST_STRIDE);
    const P0 = [0, 0, 0], P1 = [0, 0, 0], Q0 = [0, 0, 0, 0], Q1 = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const b = i * GHOST_STRIDE;
      for (let c = 0; c < 3; c++) {
        const q = predict(P0[c], P1[c], i) + unzigzag(get());
        P1[c] = P0[c]; P0[c] = q;
        res[b + c] = q / POS_SCALE;
      }
      for (let c = 0; c < 4; c++) {
        const q = predict(Q0[c], Q1[c], i) + unzigzag(get());
        Q1[c] = Q0[c]; Q0[c] = q;
      }
      const l = Math.sqrt(Q0[0] * Q0[0] + Q0[1] * Q0[1] + Q0[2] * Q0[2] + Q0[3] * Q0[3]);      // (renormalisé : la quantification l'écarte de 1 de ~1e-5)
      if (l > 1e-3) { res[b + 3] = Q0[0] / l; res[b + 4] = Q0[1] / l; res[b + 5] = Q0[2] / l; res[b + 6] = Q0[3] / l; } else res[b + 6] = 1;
    }
    for (let i = 0; i < res.length; i++) if (!Number.isFinite(res[i])) return new Float32Array(0);
    return res;
  } catch {
    return new Float32Array(0);
  }
}

// Place gagnée en passant un fantôme local de l'ancien format à G2 : la chaîne compacte si elle est plus courte, sinon la chaîne d'origine (déjà compacte, illisible ou à garder telle quelle).
export function compactGhost(s) {
  if (typeof s !== 'string' || !s || s.startsWith(GHOST_PACK_PREFIX)) return s;
  const data = decodeFloats(s);
  const packed = packGhost(data);
  return packed && packed.length < s.length ? packed : s;
}

function bytesToB64(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length)));
  return btoa(bin);
}

export function decodeFloats(b64) {
  if (typeof b64 !== 'string' || !b64) return new Float32Array(0);
  if (b64.startsWith(GHOST_PACK_PREFIX)) return unpackGhost(b64);
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
  } catch {
    return new Float32Array(0);
  }
}

// Fantôme venu d'ailleurs (serveur, fichier) : jamais de confiance. Renvoie { data, veh } ou null si le format est faux ou démesuré.
export const MAX_GHOST_FRAMES = 60000;
export function parseGhost(b64, veh) {
  const data = decodeFloats(b64);
  if (!data.length || data.length % GHOST_STRIDE !== 0 || data.length / GHOST_STRIDE > MAX_GHOST_FRAMES) return null;
  for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i]) || Math.abs(data[i]) > 1e5) return null;
  const changes = [];
  if (Array.isArray(veh)) for (const c of veh.slice(0, 1000)) if (Array.isArray(c) && Number.isInteger(c[0]) && Number.isInteger(c[1]) && c[1] >= 0 && c[1] < GHOST_VEHICLES.length) changes.push([c[0], c[1]]);
  changes.sort((a, b) => a[0] - b[0]);
  return { data, veh: changes };
}
