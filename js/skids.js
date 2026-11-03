// Traces de pneus : bandes sombres posées sur la route pendant les glisses et les gros freinages.
// Tampon circulaire de quadrilatères (les plus anciennes traces sont réutilisées).
import * as THREE from './vendor/three.module.min.js';

export class SkidMarks {
  constructor(scene, max = 700) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const a = i * 4;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.attr);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.MeshBasicMaterial({
      color: '#0b0b10', transparent: true, opacity: 0.38, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.cursor = 0;
    this.last = [null, null, null];
  }

  // Ajoute un point de trace pour la roue « w » (x, y, z : contact ; rx, rz : axe latéral).
  add(w, x, y, z, rx, rz, width = 0.32) {
    const L = this.last[w];
    const hx = rx * width, hz = rz * width;
    const pt = { lx: x - hx, ly: y + 0.04, lz: z - hz, rx: x + hx, ry: y + 0.04, rz: z + hz, x, z };
    if (L) {
      const d = Math.hypot(x - L.x, z - L.z);
      if (d < 0.35) return;
      if (d < 4.5) {
        const o = this.cursor * 12;
        this.pos.set([L.lx, L.ly, L.lz, L.rx, L.ry, L.rz, pt.lx, pt.ly, pt.lz, pt.rx, pt.ry, pt.rz], o);
        this.cursor = (this.cursor + 1) % this.max;
        this.attr.needsUpdate = true;
      }
    }
    this.last[w] = pt;
  }

  lift(w) { this.last[w] = null; }

  clear() {
    this.pos.fill(0);
    this.attr.needsUpdate = true;
    this.last = [null, null, null];
    this.cursor = 0;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
