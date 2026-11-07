// Météo décorative (lot 12) : pluie, neige, braises, poussière, pétales. Un nuage de points qui suit la caméra ; aucun effet sur la course.
import * as THREE from './vendor/three.module.min.js';

export const WEATHER_KINDS = {
  rain: { n: 700, color: '#bfd8ff', size: 0.9, fall: -34, drift: 3, op: 0.55, line: true },
  snow: { n: 600, color: '#ffffff', size: 0.5, fall: -3.2, drift: 1.6, op: 0.9 },
  embers: { n: 260, color: '#ff8a3d', size: 0.45, fall: 3.2, drift: 1.4, op: 0.9 },
  dust: { n: 320, color: '#e8d2a8', size: 0.35, fall: -0.4, drift: 5, op: 0.45 },
  petals: { n: 220, color: '#ffb7d5', size: 0.55, fall: -1.6, drift: 2.4, op: 0.95 },
};
const BOX = 38, H = 26;

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.kind = '';
    this.obj = null;
    this.t = 0;
  }

  // kind : '' (rien) ou une clé de WEATHER_KINDS ; scale : 0 à 1 (qualité graphique : 0 coupe la météo).
  set(kind, scale = 1) {
    const k = WEATHER_KINDS[kind] && scale > 0 ? kind : '';
    if (k === this.kind && (!this.obj || this.scale === scale)) return;
    this.dispose();
    this.kind = k; this.scale = scale;
    if (!k) return;
    const W = WEATHER_KINDS[k], n = Math.max(40, Math.round(W.n * scale));
    this.n = n;
    this.p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.p[i * 3] = (Math.random() - 0.5) * BOX * 2; this.p[i * 3 + 1] = Math.random() * H; this.p[i * 3 + 2] = (Math.random() - 0.5) * BOX * 2; }
    const geo = new THREE.BufferGeometry();
    if (W.line) {
      this.pos = new Float32Array(n * 6);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      this.obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: W.color, transparent: true, opacity: W.op, depthWrite: false, fog: true }));
    } else {
      this.pos = new Float32Array(n * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      this.obj = new THREE.Points(geo, new THREE.PointsMaterial({ color: W.color, size: W.size, transparent: true, opacity: W.op, depthWrite: false, sizeAttenuation: true, fog: true }));
    }
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 6;
    this.scene.add(this.obj);
  }

  update(dt, cam) {
    if (!this.obj) return;
    const W = WEATHER_KINDS[this.kind], p = this.p, n = this.n;
    this.t += dt;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      p[j] += Math.sin(this.t * 0.7 + i) * W.drift * dt;
      p[j + 1] += W.fall * dt;
      p[j + 2] += Math.cos(this.t * 0.6 + i * 1.3) * W.drift * dt * 0.6;
      // la boîte suit la caméra : une particule qui en sort est replacée de l'autre côté
      if (p[j + 1] < -4) p[j + 1] += H + 4; else if (p[j + 1] > H) p[j + 1] -= H + 4;
      if (p[j] > BOX) p[j] -= BOX * 2; else if (p[j] < -BOX) p[j] += BOX * 2;
      if (p[j + 2] > BOX) p[j + 2] -= BOX * 2; else if (p[j + 2] < -BOX) p[j + 2] += BOX * 2;
      const x = cx + p[j], y = cy + p[j + 1] - 6, z = cz + p[j + 2];
      if (W.line) { const k = i * 6; this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z; this.pos[k + 3] = x - 0.12; this.pos[k + 4] = y + W.size * 1.6; this.pos[k + 5] = z; }
      else { this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; }
    }
    this.obj.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (!this.obj) return;
    this.obj.removeFromParent();
    this.obj.geometry.dispose(); this.obj.material.dispose();
    this.obj = null; this.kind = '';
  }
}
