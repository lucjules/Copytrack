// Paquet d'état d'une voiture (multijoueur) : 40 octets, envoyé 20 fois par seconde sur le canal WebRTC « state ».
//
//   0  u8   type (2)            1  u8  drapeaux             2  u8  compteur de téléportation   3  u8  véhicule
//   4  u16  numéro de séquence  6  u32 pas de course (1/120 s, l'horloge de l'émetteur)
//  10  f32×3 position          22  i16×4 orientation (quaternion normalisé × 32767)
//  30  i16×3 vitesse (× 50, soit ±655 m/s)               36  u8  checkpoints franchis    37  u8  tour
//  38  u16  avancement sur le circuit (0 à 1 × 65535) : sert au classement en direct d'une manche
//
// Le compteur de téléportation augmente à CHAQUE retour au checkpoint : le récepteur détecte la téléportation même
// si le paquet qui la portait s'est perdu (le canal est volontairement non fiable, pour ne jamais accumuler de retard).
import { DT, VEHICLES } from '../constants.js';

export const SEND_EVERY_STEPS = 6;       // un paquet tous les 6 pas de 1/120 s : 20 paquets par seconde
export const SNAPSHOT_BYTES = 40;
const SNAP_VERSION = 2;
export const F_FINISHED = 1, F_BOOST = 2, F_GROUNDED = 4;

const clamp16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));

export function packSnapshot(s, out = new ArrayBuffer(SNAPSHOT_BYTES)) {
  const d = new DataView(out);
  d.setUint8(0, SNAP_VERSION);
  d.setUint8(1, s.flags & 255);
  d.setUint8(2, s.tele & 255);
  d.setUint8(3, Math.max(0, VEHICLES.indexOf(s.vehicle)));
  d.setUint16(4, s.seq & 0xffff, true);
  d.setUint32(6, s.steps >>> 0, true);
  d.setFloat32(10, s.pos.x, true); d.setFloat32(14, s.pos.y, true); d.setFloat32(18, s.pos.z, true);
  d.setInt16(22, clamp16(s.quat.x * 32767), true); d.setInt16(24, clamp16(s.quat.y * 32767), true);
  d.setInt16(26, clamp16(s.quat.z * 32767), true); d.setInt16(28, clamp16(s.quat.w * 32767), true);
  d.setInt16(30, clamp16(s.vel.x * 50), true); d.setInt16(32, clamp16(s.vel.y * 50), true); d.setInt16(34, clamp16(s.vel.z * 50), true);
  d.setUint8(36, Math.min(255, s.cp | 0)); d.setUint8(37, Math.min(255, s.lap | 0));
  d.setUint16(38, Math.max(0, Math.min(65535, Math.round((Number.isFinite(s.prog) ? s.prog : 0) * 65535))), true);
  return out;
}

// Données venues d'un autre joueur : jamais de confiance. Renvoie null si le paquet est invalide.
export function unpackSnapshot(buf) {
  const ab = buf instanceof ArrayBuffer ? buf : buf && buf.buffer instanceof ArrayBuffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : null;
  if (!ab || ab.byteLength !== SNAPSHOT_BYTES) return null;
  const d = new DataView(ab);
  if (d.getUint8(0) !== SNAP_VERSION) return null;
  const pos = { x: d.getFloat32(10, true), y: d.getFloat32(14, true), z: d.getFloat32(18, true) };
  const q = { x: d.getInt16(22, true) / 32767, y: d.getInt16(24, true) / 32767, z: d.getInt16(26, true) / 32767, w: d.getInt16(28, true) / 32767 };
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  if (![pos.x, pos.y, pos.z].every(Number.isFinite) || Math.abs(pos.x) > 1e5 || Math.abs(pos.y) > 1e5 || Math.abs(pos.z) > 1e5 || n < 0.5) return null;
  q.x /= n; q.y /= n; q.z /= n; q.w /= n;
  return {
    flags: d.getUint8(1), tele: d.getUint8(2), vehicle: VEHICLES[d.getUint8(3)] || 'car',
    seq: d.getUint16(4, true), steps: d.getUint32(6, true), t: d.getUint32(6, true) * DT,
    pos, quat: q,
    vel: { x: d.getInt16(30, true) / 50, y: d.getInt16(32, true) / 50, z: d.getInt16(34, true) / 50 },
    cp: d.getUint8(36), lap: d.getUint8(37), prog: d.getUint16(38, true) / 65535,
  };
}
