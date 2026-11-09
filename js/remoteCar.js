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

// Nom flottant au-dessus d'une voiture (sprite) ; userData.map est la texture à libérer. null hors navigateur.
export function makeNameLabel(name) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(name, 128, 34, 244);
  g.fillStyle = '#ffffff'; g.fillText(name, 128, 34, 244);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(6, 1.5, 1);
  sp.position.set(0, 3.2, 0);
  sp.userData.map = tex;
  return sp;
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
    this.pos = new THREE.Vector3();    // dernière position affichée et vitesse (collisions douces d'une manche)
    this.vel = new THREE.Vector3();
    this.prog = 0;                       // avancement sur le circuit (0 à 1), du dernier paquet reçu
    this.finished = false;               // a franchi l'arrivée (drapeau du dernier paquet)
    this.shown = false;           // a déjà été vue (la première apparition n'anime pas de transformation)
    this.spin = 0;                // rotation des roues (rad)
    this.lastMs = null;
    this.dark = 0;
    this.teleports = 0;
    this.ready = false;
    this.teleportedAtMs = -1e9;      // dernier retour au checkpoint vu (protection : on ne bouscule pas une voiture qui vient d'apparaître)
    // Les matériaux fantômes sont propres à cette voiture : on peut les modifier sans toucher aux autres.
    // Chaque matériau garde SA couleur d'origine (corps, effets...) : l'assombrissement part de celle-là.
    this.mats = new Set();
    this.group.traverse((o) => { if (o.isMesh && o.material) this.mats.add(o.material); });
    this.label = this._makeLabel(name);
    if (this.label) { this.group.add(this.label); this.mats.add(this.label.material); }
    this.base = new Map([...this.mats].filter((m) => m.color).map((m) => [m, m.color.clone()]));
    this._c = new THREE.Color();
  }

  _makeLabel(name) { return makeNameLabel(name); }

  // Un paquet d'état reçu de ce joueur.
  push(snap, nowMs) { return this.buffer.push(snap, nowMs); }

  // À appeler à chaque image. cameraPos : position de la caméra du joueur local.
  update(nowMs, cameraPos) {
    const s = this.buffer.sample(nowMs);
    if (!s.ready) { this.group.visible = false; this.ready = false; return false; }
    this.ready = true;
    this.group.visible = true;
    this.group.position.copy(s.pos);
    this.group.quaternion.copy(s.quat);
    this.pos.copy(s.pos); this.vel.copy(s.vel);
    const last = this.buffer.latest;
    if (last) { this.prog = last.prog; this.finished = !!(last.flags & 1); }
    // Même animation de transformation que le joueur (instantanée à la première apparition et après une téléportation), roues qui tournent avec la vitesse.
    const dt = this.lastMs == null ? 0 : Math.min(0.1, Math.max(0, (nowMs - this.lastMs) / 1000));
    this.lastMs = nowMs;
    if (s.vehicle !== this.vehicle) { this.vehicle = s.vehicle; this.car.setVehicle(s.vehicle, !this.shown || s.teleported); }
    this.shown = true;
    this.car.update(dt, nowMs / 1000);
    this.spin += (s.speed / 0.44) * dt;
    for (const w of this.car.wheels) w.spin.rotation.x = -this.spin;
    if (s.teleported) { this.teleports++; this.teleportedAtMs = nowMs; if (this.onTeleport) this.onTeleport(s.pos); }
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
