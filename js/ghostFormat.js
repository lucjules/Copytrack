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

export function decodeFloats(b64) {
  if (typeof b64 !== 'string' || !b64) return new Float32Array(0);
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
