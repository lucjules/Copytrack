// Éléments partagés par les familles de méthodes de RaceSession (voir race.js).
import * as THREE from '../vendor/three.module.min.js';
export const GHOST_EVERY = 4;
// Identifiants de véhicule des fantômes enregistrés (l'ordre est celui des enregistrements : ne jamais réordonner).
export const GHOST_VEHICLES = ['car', 'moto', 'boat', 'glider'];
// Véhicule d'un fantôme enregistré à l'image `frame`, d'après la liste de ses changements [[image, id], …] (vide : toujours la voiture, comme les anciens records).
export function ghostVehicleAt(changes, frame) {
  let id = 0;
  for (const [f, v] of changes) { if (f > frame) break; id = v; }
  return GHOST_VEHICLES[id] || 'car';
} // un échantillon tous les 4 pas (30 Hz)

// Caméras en plus pour les replays.
export const REPLAY_CAMS = [{ name: 'TV', tv: true }, { name: 'Orbite libre', orbit: true }];

export const CAM_MODES = [
  { name: 'Poursuite', dist: 9.5, height: 3.7, look: 5, lookUp: 1.3, fov: 66 },
  { name: 'Proche', dist: 6.2, height: 2.3, look: 7, lookUp: 1.0, fov: 70 },
  { name: 'Capot', hood: true, fov: 76 },
  { name: 'Lointaine', dist: 14, height: 5.6, look: 4, lookUp: 1.6, fov: 62 },
];

export const tmpV = new THREE.Vector3();

export const tmpV2 = new THREE.Vector3();

export const tmpM = new THREE.Matrix4();
