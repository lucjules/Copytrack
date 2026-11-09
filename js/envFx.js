// Effets visuels et sonores des environnements déterministes (E19, sim/env.js) : flaques et plaques de givre posées sur la route, pluie dont la
// densité suit l'intensité de la course (conditions qui varient), éclaboussures et bruit d'eau dans une flaque, crissement sur le givre, souffle
// des rafales. Purement visuel et sonore : tout ce qui compte pour la course est dans la physique (sim/env.js), qui ne dépend pas d'ici.
import * as THREE from './vendor/three.module.min.js';
import { Weather } from './weather.js';

const LIFT = 0.04;                                       // au-dessus de la route (sans scintillement)

export class EnvFx {
  // env : objet de sim/env.js (jamais null ici) ; particles : qualité graphique (0 coupe la pluie, pas les flaques : elles comptent pour la course).
  constructor(scene, env, particles = 1) {
    this.scene = scene; this.env = env;
    this.group = new THREE.Group();
    this.group.name = 'env';
    const disc = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    for (const [kind, color, opacity, rough] of [['puddle', '#2b4a66', 0.72, 0.08], ['frost', '#dff4ff', 0.8, 0.35]]) {
      const list = env.patches.filter((p) => p.kind === kind);
      if (!list.length) continue;
      const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: rough, metalness: kind === 'puddle' ? 0.6 : 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.InstancedMesh(disc, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
      list.forEach((p, i) => mesh.setMatrixAt(i, m.compose(v.set(p.x, p.y + LIFT, p.z), q, s.set(p.r, 1, p.r * (kind === 'frost' ? 0.8 : 1)))));
      mesh.renderOrder = 2;
      this.group.add(mesh);
    }
    this._disc = disc;
    scene.add(this.group);
    this.rain = env.rain ? new Weather(scene) : null;
    if (this.rain) this.rain.set('rain', particles);
    this.inPatch = null; this.gustOn = false; this.level = -1;
  }

  // Chaque image : step = pas de la course (le même que la physique), pos = position affichée de la voiture, speed en m/s.
  frame(dt, camera, step, pos, speed, grounded, app) {
    const E = this.env;
    if (this.rain) {
      const k = E.rainAt(step);
      if (Math.abs(k - this.level) > 0.02) { this.level = k; this.rain.setIntensity(Math.max(0.15, k)); }
      this.rain.update(dt, camera);
    }
    const audio = app.audio;
    const p = grounded ? E.patchAt(pos.x, pos.y, pos.z) : null;
    if (p && p !== this.inPatch && Math.abs(speed) > 6) {
      const n = Math.min(26, 6 + Math.abs(speed) * 0.3);
      if (p.kind === 'puddle') { app.particles.burst(pos.x, pos.y + 0.3, pos.z, n, 6 + Math.abs(speed) * 0.08, 0.5, 0.45, '#cfe8ff', 9, 1); audio.splash(Math.min(1, Math.abs(speed) / 60)); }
      else { app.particles.burst(pos.x, pos.y + 0.2, pos.z, Math.round(n / 2), 4, 0.4, 0.3, '#ffffff', 3); audio.noise(0.25, 4200, 0.06, 'highpass'); }
    }
    this.inPatch = p;
    if (E.gust) {
      const g = E.gustAt(step), on = g.x * g.x + g.z * g.z > 0.5;
      if (on && !this.gustOn) audio.noise(0.9, 300, 0.12, 'bandpass', 0, 900);       // une rafale se lève
      this.gustOn = on;
    }
    audio.envLevel(this.rain ? this.level : 0);
    this._audio = audio;
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of this.group.children) m.material.dispose();
    this._disc.dispose();
    if (this.rain) this.rain.dispose();
    this.rain = null;
    this._audio?.envLevel(0);
  }
}
