// Traînée lumineuse du véhicule (cosmétique) : un ruban derrière la voiture, TOUJOURS présent (même à l'arrêt, très discret), dont l'intensité,
// la longueur et la largeur suivent la vitesse et le boost. Un ruban 3D avec une opacité par sommet (additif) : pas de particules qui
// apparaissent et disparaissent.
import * as THREE from './vendor/three.module.min.js';
import { clamp } from './mathutil.js';

const N = 72;                                   // échantillons au plus
const tmp = new THREE.Color();

// Intensité (0 à 1) selon la vitesse (m/s) et le boost (0 à 1) : discrète à l'arrêt, pleine à ~180 km/h, renforcée par le boost.
export function trailStrength(speed, boost) {
  const k = clamp((speed - 4) / 46, 0, 1);
  return Math.min(1, 0.16 + 0.6 * k + 0.45 * boost);
}

export class TrailRibbon {
  constructor(scene) {
    this.pts = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    this.col = new Float32Array(N * 2 * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < N - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  reset() { this.pts.length = 0; this.geo.setDrawRange(0, 0); }

  // anchor : arrière de la voiture (monde) ; right : axe latéral (vecteur unitaire) ; color : '#rrggbb' ou null (arc-en-ciel).
  // cam : position de la caméra (monde), ou null : les points trop près d'elle s'effacent (sinon le ruban passe devant l'objectif).
  update(dt, anchor, right, speed, boost, color, time, cam = null) {
    const k = clamp((speed - 4) / 46, 0, 1), strength = trailStrength(speed, boost);
    const maxAge = 0.2 + 0.75 * k + 0.35 * boost, half = 0.22 + 0.5 * k + 0.5 * boost;
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[0].age > maxAge) this.pts.shift();
    const last = this.pts[this.pts.length - 1];
    if (!last || Math.hypot(anchor.x - last.x, anchor.y - last.y, anchor.z - last.z) > 0.12) {
      this.pts.push({ x: anchor.x, y: anchor.y, z: anchor.z, rx: right.x, ry: right.y, rz: right.z, age: 0, hue: ((time * 90) % 360) / 360 });
      if (this.pts.length > N) this.pts.shift();
    }
    const n = this.pts.length;
    if (n < 2) { this.geo.setDrawRange(0, 0); return; }
    const base = color ? tmp.set(color) : null;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i], f = Math.max(0, 1 - p.age / maxAge), w = half * (0.3 + 0.7 * f);
      const nc = cam ? clamp((Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) - 5) / 9, 0, 1) : 1;
      const a = strength * f * f * nc * nc;
      const c = base || tmp.setHSL((p.hue + i * 0.012) % 1, 0.95, 0.6);
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s), sg = s ? 1 : -1;
        this.pos[o * 3] = p.x + p.rx * w * sg; this.pos[o * 3 + 1] = p.y + p.ry * w * sg; this.pos[o * 3 + 2] = p.z + p.rz * w * sg;
        this.col[o * 4] = c.r; this.col[o * 4 + 1] = c.g; this.col[o * 4 + 2] = c.b; this.col[o * 4 + 3] = a;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }

  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mesh.material.dispose(); }
}
