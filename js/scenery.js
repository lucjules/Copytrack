// Décor : ciel crépusculaire, lumière, désert facetté, cristaux et rochers.
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder } from './geo.js';
import { CELL } from './constants.js';
import { PIECES } from './pieces.js';

export const SKY = {
  top: '#241a4a',
  mid: '#7a4a8f',
  horizon: '#ffb07a',
  sun: '#fff0c8',
  fog: '#e79a7c',
  sunDir: new THREE.Vector3(-0.55, 0.32, -0.77).normalize(),
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, z, seed) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += valueNoise(x * f, z * f, seed + i * 17) * amp; amp *= 0.5; f *= 2.03; }
  return s;
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export class Scenery {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.trackGroup = new THREE.Group();
    scene.add(this.trackGroup);

    scene.background = new THREE.Color(SKY.horizon);
    scene.fog = new THREE.Fog(SKY.fog, 220, 1100);

    // Ciel
    const skyGeo = new THREE.SphereGeometry(2500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(SKY.top) },
        mid: { value: new THREE.Color(SKY.mid) },
        horizon: { value: new THREE.Color(SKY.horizon) },
        sunColor: { value: new THREE.Color(SKY.sun) },
        sunDir: { value: SKY.sunDir.clone() },
      },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.32, y));
          col = mix(col, top, smoothstep(0.25, 0.9, y));
          col = mix(col, horizon * 0.85, smoothstep(0.0, -0.2, y));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (smoothstep(0.9982, 0.9990, s) * 1.4 + pow(s, 14.0) * 0.45 + pow(s, 3.0) * 0.08);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    // Lumières
    this.hemi = new THREE.HemisphereLight('#ffd8c2', '#5a4682', 1.55);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffd0a0', 2.6);
    this.sun.castShadow = quality !== 'low';
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 500;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.decor = null;
    this.terrain = null;
  }

  setQuality(q) {
    this.quality = q;
    this.sun.castShadow = q !== 'low';
  }

  // Reconstruit le terrain et le décor autour d'un circuit.
  setTrack(track, seedStr = 'shardway', opts = {}) {
    const withDecor = opts.decor !== false;
    this.clearTerrain();
    let seed = 7;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) | 0;
    const rand = mulberry32(seed);
    const b = track.bounds();
    const margin = CELL * 3;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const mh = opts.minHalf || 0;
    const fx0 = Math.min(b.minX - margin, cx - mh), fx1 = Math.max(b.maxX + margin, cx + mh);
    const fz0 = Math.min(b.minZ - margin, cz - mh), fz1 = Math.max(b.maxZ + margin, cz + mh);
    this.center = new THREE.Vector3(cx, 0, cz);

    // Cases occupées (pour ne pas poser de décor sur la route).
    const occupied = new Set();
    for (const t of track.tiles) {
      const s = PIECES[t.t].size;
      for (let i = -1; i <= s; i++) for (let j = -1; j <= s; j++) occupied.add((t.x + i) + ',' + (t.z + j));
    }
    const isFree = (x, z) => !occupied.has(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));

    const outside = (x, z) => {
      const dx = Math.max(fx0 - x, 0, x - fx1);
      const dz = Math.max(fz0 - z, 0, z - fz1);
      return Math.hypot(dx, dz);
    };
    const heightAt = (x, z) => {
      const o = outside(x, z);
      if (o <= 0) return 0;
      const n = fbm(x * 0.006, z * 0.006, seed);
      let h = (n * 1.4 - 0.25) * 90 * smooth(0, 160, o);
      h = Math.max(0, h);
      // Terrasses façon mesas
      const step = 14;
      const tz = Math.floor(h / step) * step;
      h = tz + Math.min(step, (h - tz) * 3.2);
      return h;
    };
    this.heightAt = heightAt;

    // Terrain
    const size = 2600, seg = this.quality === 'low' ? 70 : 110;
    const gb = new GeoBuilder();
    const step = size / seg;
    const x0 = cx - size / 2, z0 = cz - size / 2;
    const H = [];
    for (let i = 0; i <= seg; i++) {
      H.push([]);
      for (let j = 0; j <= seg; j++) {
        const x = x0 + i * step, z = z0 + j * step;
        const jx = outside(x, z) > 20 ? (hash2(i, j, seed) - 0.5) * step * 0.5 : 0;
        const jz = outside(x, z) > 20 ? (hash2(j, i, seed + 3) - 0.5) * step * 0.5 : 0;
        H[i].push([x + jx, heightAt(x, z) - 0.02, z + jz]);
      }
    }
    const sand = ['#d29a6c', '#c98f63', '#d8a476'];
    const rock = ['#b06a52', '#a35f4c', '#8e5249', '#7a4a52', '#6a4560'];
    const colorFor = (h, r) => {
      if (h < 1) return sand[Math.floor(r * sand.length)];
      const k = Math.min(rock.length - 1, Math.floor(h / 18 + r * 0.8));
      return rock[k];
    };
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg; j++) {
        const a = H[i][j], b2 = H[i + 1][j], c = H[i + 1][j + 1], d = H[i][j + 1];
        const r1 = hash2(i, j, seed + 11), r2 = hash2(j, i, seed + 13);
        // Deux triangles orientés vers le haut (+y)
        gb.tri(a, d, c, colorFor((a[1] + d[1] + c[1]) / 3, r1));
        gb.tri(a, c, b2, colorFor((a[1] + c[1] + b2[1]) / 3, r2));
      }
    }
    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    this.terrain = new THREE.Mesh(gb.build(), terrainMat);
    this.terrain.receiveShadow = true;
    this.root.add(this.terrain);

    if (!withDecor) return;

    // Décor instancié
    this.decor = new THREE.Group();
    this.root.add(this.decor);
    const dummy = new THREE.Object3D();

    const scatter = (count, fn) => {
      let tries = 0, n = 0;
      while (n < count && tries < count * 20) {
        tries++;
        const r = rand();
        const ring = r < 0.45;
        const x = ring ? fx0 + rand() * (fx1 - fx0) : cx + (rand() - 0.5) * 1400;
        const z = ring ? fz0 + rand() * (fz1 - fz0) : cz + (rand() - 0.5) * 1400;
        if (!isFree(x, z)) continue;
        fn(x, heightAt(x, z), z);
        n++;
      }
      return n;
    };

    // Rochers
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      rp.setXYZ(i, rp.getX(i) * (0.8 + hash2(i, 1, 5) * 0.5), rp.getY(i) * (0.6 + hash2(i, 2, 5) * 0.4), rp.getZ(i) * (0.8 + hash2(i, 3, 5) * 0.5));
    }
    rockGeo.computeVertexNormals();
    const rockCount = this.quality === 'low' ? 90 : 180;
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#9a5c4e', flatShading: true, roughness: 1 }), rockCount);
    let ri = 0;
    scatter(rockCount, (x, y, z) => {
      const s = 1 + rand() * 4.5;
      dummy.position.set(x, y + s * 0.2, z);
      dummy.rotation.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6);
      dummy.scale.set(s * (0.8 + rand() * 0.6), s * (0.6 + rand() * 0.6), s * (0.8 + rand() * 0.6));
      dummy.updateMatrix();
      rocks.setMatrixAt(ri++, dummy.matrix);
    });
    rocks.count = ri;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.decor.add(rocks);

    // Cristaux (la signature visuelle de Shardway)
    const crystalGeo = new THREE.OctahedronGeometry(1, 0);
    crystalGeo.scale(0.55, 2.4, 0.55);
    crystalGeo.translate(0, 1.6, 0);
    const crystalColors = ['#ff7ad9', '#5ff2ff', '#a98bff'];
    const perColor = this.quality === 'low' ? 30 : 60;
    for (const col of crystalColors) {
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, flatShading: true, roughness: 0.3, metalness: 0.1 });
      const mesh = new THREE.InstancedMesh(crystalGeo, mat, perColor * 4);
      let ci = 0;
      scatter(perColor, (x, y, z) => {
        const k = 2 + Math.floor(rand() * 3);
        const base = 1.5 + rand() * 3.5;
        for (let i = 0; i < k && ci < perColor * 4; i++) {
          const s = base * (0.5 + rand() * 0.7);
          dummy.position.set(x + (rand() - 0.5) * base * 1.6, y - 0.3, z + (rand() - 0.5) * base * 1.6);
          dummy.rotation.set((rand() - 0.5) * 0.9, rand() * Math.PI, (rand() - 0.5) * 0.9);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          mesh.setMatrixAt(ci++, dummy.matrix);
        }
      });
      mesh.count = ci;
      mesh.castShadow = true;
      this.decor.add(mesh);
    }
  }

  clearTerrain() {
    const kill = (o) => {
      if (!o) return;
      o.traverse((c) => {
        if (c.isMesh) {
          c.geometry.dispose();
          c.material.dispose();
        }
      });
      o.removeFromParent();
    };
    kill(this.terrain);
    kill(this.decor);
    this.terrain = null;
    this.decor = null;
  }

  // Suit la caméra/la voiture pour garder l'ombre nette autour du joueur.
  update(focus, camera, radius = 70) {
    const sc = this.sun.shadow.camera;
    if (sc.right !== radius) {
      sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius;
      sc.updateProjectionMatrix();
    }
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(SKY.sunDir, 250);
    if (camera) this.sky.position.copy(camera.position);
  }
}
