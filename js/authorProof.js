// Preuve du temps de l'auteur (Phase 2 backend) : la course de VÉRIFICATION faite dans l'éditeur. Publier un circuit envoie cette course au serveur, qui la
// REJOUE sur le code publié : le temps de l'auteur est celui du rejeu, jamais une affirmation du client (js/verify.js, verifyPublish).
// Elle reste sur CET appareil (storage.DEVICE_ONLY_KEYS : ni code joueur, ni sauvegarde partagée) ; au plus 8 circuits, les plus récents.
import { getJSON, setJSON } from './storage.js';

const KEY = 'vproof';
const MAX_PROOFS = 8;

// proof : { inputs (base64), time }. Rangée sous la signature du circuit, avec le temps : si le circuit change (autre signature) ou si le temps de l'auteur
// change, elle ne correspond plus.
export function saveProof(track, proof) {
  if (!track.verified || !proof || typeof proof.inputs !== 'string' || !(proof.time > 0)) return false;
  const all = getJSON(KEY, {}) || {};
  all[track.signature()] = { inputs: proof.inputs, time: proof.time, vt: track.vt, at: Date.now() };
  const keys = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0));
  for (const k of keys.slice(MAX_PROOFS)) delete all[k];
  return setJSON(KEY, all) !== false;
}

// La preuve du circuit tel qu'il est maintenant, ou null (jamais vérifié ici, circuit modifié, temps différent).
export function loadProof(track) {
  if (!track.verified) return null;
  const p = (getJSON(KEY, {}) || {})[track.signature()];
  if (!p || typeof p.inputs !== 'string' || !(p.time > 0) || Math.abs(p.time - track.vt) > 0.001) return null;
  return { inputs: p.inputs, time: p.time };
}
