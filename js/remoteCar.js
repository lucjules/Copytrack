// Voiture fantôme d'un adversaire (multijoueur) : traverse tout, ne collisionne avec rien, ne s'affiche que par ce que
// le réseau en dit. Plus elle est loin de la caméra du joueur local, plus son matériau s'assombrit.
import * as THREE from './vendor/three.module.min.js';
import { createCar } from './carModel.js';
import { SnapshotBuffer } from './net/interp.js';

export const FADE_NEAR = 30;      // m : en deçà, couleur pleine
export const FADE_FAR = 260;      // m : au-delà, assombrissement maximal
export const MAX_DARKEN = 0.88;   // part maximale de noir mélangée à la couleur (0 = aucune, 1 = noir complet)
const PLAYER_COLORS = ['#ff6b57', '#5ff2ff', '#ffd23e', '#7cf06b', '#ff7ad9', '#8f7cff', '#ffb84d', '#3ec1ff'];
const DARK = new THREE.Color('#05050b');

// Intensité d'assombrissement (0 à 1) selon la distance : lissée (smoothstep), pour qu'aucune « marche » ne se voie.
export function darkness(distance, near = FADE_NEAR, far = FADE_FAR) {
  const t = Math.max(0, Math.min(1, (distance - near) / (far - near)));
  return t * t * (3 - 2 * t) * MAX_DARKEN;
}

export class RemoteCar {
  // scene : où ajouter la voiture ; info : { id, name, colorIndex } ; onTeleport(pos) : effet à l'apparition après un retour au checkpoint
  constructor(scene, { id, name, colorIndex = 0 }, { onTeleport = null, delay } = {}) {
    this.id = id; this.name = name;
    this.baseColor = new THREE.Color(PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]);
    this.car = createCar(null, { ghost: true, ghostColor: '#' + this.baseColor.getHexString() });
    this.group = this.car.group;
    this.group.visible = false;
    scene.add(this.group);
    this.buffer = new SnapshotBuffer(delay !== undefined ? { delay } : {});
    this.onTeleport = onTeleport;
    this.vehicle = 'car';
    this.dark = 0;
    this.teleports = 0;
    // Les matériaux fantômes sont propres à cette voiture : on peut les modifier sans toucher aux autres.
    // Chaque matériau garde SA couleur d'origine (corps, effets...) : l'assombrissement part de celle-là.
    this.mats = new Set();
    this.group.traverse((o) => { if (o.isMesh && o.material) this.mats.add(o.material); });
    this.label = this._makeLabel(name);
    if (this.label) { this.group.add(this.label); this.mats.add(this.label.material); }
    this.base = new Map([...this.mats].filter((m) => m.color).map((m) => [m, m.color.clone()]));
    this._c = new THREE.Color();
  }

  _makeLabel(name) {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d');
    if (!g) return null;
    g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(name, 128, 34);
    g.fillStyle = '#ffffff'; g.fillText(name, 128, 34);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(6, 1.5, 1);
    sp.position.set(0, 3.2, 0);
    sp.userData.map = tex;
    return sp;
  }

  // Un paquet d'état reçu de ce joueur.
  push(snap, nowMs) { return this.buffer.push(snap, nowMs); }

  // À appeler à chaque image. cameraPos : position de la caméra du joueur local.
  update(nowMs, cameraPos) {
    const s = this.buffer.sample(nowMs);
    if (!s.ready) { this.group.visible = false; return false; }
    this.group.visible = true;
    this.group.position.copy(s.pos);
    this.group.quaternion.copy(s.quat);
    if (s.vehicle !== this.vehicle) { this.vehicle = s.vehicle; this.car.setVehicle(s.vehicle, true); }
    if (s.teleported) { this.teleports++; if (this.onTeleport) this.onTeleport(s.pos); }
    this.setDistance(this.group.position.distanceTo(cameraPos));
    return true;
  }

  // Assombrissement selon la distance à la caméra (voir darkness).
  setDistance(d) {
    const k = darkness(d);
    if (Math.abs(k - this.dark) < 0.004) return;
    this.dark = k;
    for (const [m, base] of this.base) m.color.copy(base).lerp(DARK, k);     // couleur d'origine → presque noir
  }

  dispose() {
    if (this.label) { this.label.userData.map.dispose(); this.label.removeFromParent(); }
    this.car.dispose();
  }
}
