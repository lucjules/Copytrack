// Éléments partagés par les familles de méthodes de RaceSession (voir race.js).
import * as THREE from '../vendor/three.module.min.js';
// Format des fantômes : js/ghostFormat.js (sans rendu : la fonction serveur s'en sert aussi).
export { GHOST_EVERY, GHOST_VEHICLES, ghostVehicleAt } from '../ghostFormat.js';

// Caméras en plus pour les replays.
export const REPLAY_CAMS = [{ name: 'TV', tv: true }, { name: 'Orbite libre', orbit: true }, { name: 'Libre', free: true }, { name: 'Cinématique', cine: true }];      // Libre, Cinématique : Replay Theater (theater/cameras.js)

export const CAM_MODES = [
  // Version 1.0 : voiture 1,6 fois plus grande (CAR_SCALE) ; la poursuite est plus haute et plonge davantage : on lit le tracé devant la voiture.
  { name: 'Poursuite', dist: 13.5, height: 6.2, look: 7, lookUp: 1.6, fov: 64 },
  { name: 'Proche', dist: 9.5, height: 3.6, look: 10, lookUp: 1.5, fov: 70 },
  { name: 'Capot', hood: true, fov: 76 },
  { name: 'Lointaine', dist: 21, height: 9.5, look: 6, lookUp: 2.2, fov: 60 },
];

export const tmpV = new THREE.Vector3();

export const tmpV2 = new THREE.Vector3();

export const tmpM = new THREE.Matrix4();
