// Particules low-poly (petits tétraèdres instanciés) : poussière, étincelles, éclats.
import * as THREE from './vendor/three.module.min.js';

export class Particles {
  constructor(scene, max = 400) {
    this.max = max;
    const geo = new THREE.TetrahedronGeometry(0.35, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, g: 0, rx: 0, ry: 0, c: new THREE.Color() });
    this.cursor = 0;
    this.dummy = new THREE.Object3D();
  }

  spawn(x, y, z, vx, vy, vz, life, size, color, gravity = 0) {
    const q = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    q.alive = true;
    q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz;
    q.life = life; q.max = life; q.size = size; q.g = gravity;
    q.rx = Math.random() * 6; q.ry = Math.random() * 6;
    q.c.set(color);
  }

  burst(x, y, z, n, speed, life, size, color, gravity = 0, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * 2 - 1;
      const s = speed * (0.4 + Math.random() * 0.6);
      const r = Math.sqrt(1 - b * b);
      this.spawn(x, y, z, Math.cos(a) * r * s, Math.abs(b) * s + up, Math.sin(a) * r * s, life * (0.6 + Math.random() * 0.6), size, color, gravity);
    }
  }

  update(dt) {
    const d = this.dummy;
    let n = 0;
    for (const q of this.p) {
      if (!q.alive) continue;
      q.life -= dt;
      if (q.life <= 0) { q.alive = false; continue; }
      q.vy -= q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const drag = 1 - 1.8 * dt;
      q.vx *= drag; q.vz *= drag;
      q.rx += dt * 4; q.ry += dt * 3;
      const k = q.life / q.max;
      const s = q.size * Math.max(0.05, k);
      d.position.set(q.x, q.y, q.z);
      d.rotation.set(q.rx, q.ry, 0);
      d.scale.set(s, s, s);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.mesh.setColorAt(n, q.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const q of this.p) q.alive = false;
    this.mesh.count = 0;
  }
}
