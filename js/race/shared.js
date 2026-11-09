// Éléments partagés par les familles de méthodes de RaceSession (voir race.js).
import * as THREE from '../vendor/three.module.min.js';
// Format des fantômes : js/ghostFormat.js (sans rendu : la fonction serveur s'en sert aussi).
export { GHOST_EVERY, GHOST_VEHICLES, ghostVehicleAt } from '../ghostFormat.js';

// Caméras en plus pour les replays.
export const REPLAY_CAMS = [{ name: 'TV', tv: true }, { name: 'Orbite libre', orbit: true }, { name: 'Libre', free: true }, { name: 'Cinématique', cine: true }];      // Libre, Cinématique : Replay Theater (theater/cameras.js)

export const CAM_MODES = [
  { name: 'Poursuite', dist: 9.5, height: 3.7, look: 5, lookUp: 1.3, fov: 66 },
  { name: 'Proche', dist: 6.2, height: 2.3, look: 7, lookUp: 1.0, fov: 70 },
  { name: 'Capot', hood: true, fov: 76 },
  { name: 'Lointaine', dist: 14, height: 5.6, look: 4, lookUp: 1.6, fov: 62 },
];

export const tmpV = new THREE.Vector3();

export const tmpV2 = new THREE.Vector3();

export const tmpM = new THREE.Matrix4();
