// Décors : ciel, lumière, terrain facetté et objets, selon le thème du circuit.
//  - desert : désert au crépuscule et cristaux (v1.0)
//  - polar  : nuit polaire, aurore boréale, banquise, glaciers et sapins enneigés
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder } from './geo.js';
import { CELL } from './constants.js';
import { PIECES } from './pieces.js';

export const THEMES = {
  desert: {
    label: 'Désert crépuscule',
    sky: { top: '#241a4a', mid: '#7a4a8f', horizon: '#ffb07a', sun: '#fff0c8', aurora: 0, stars: 0 },
    fog: '#e79a7c', fogNear: 240, fogFar: 1150,
    sunDir: [-0.55, 0.32, -0.77], sunColor: '#ffd0a0', sunIntensity: 2.6,
    hemi: ['#ffd8c2', '#5a4682', 1.55],
    ground: ['#d29a6c', '#c98f63', '#d8a476'],
    rock: ['#b06a52', '#a35f4c', '#8e5249', '#7a4a52', '#6a4560'],
    hills: 90,
    dust: '#d9c2b0',
  },
  polar: {
    label: 'Nuit polaire',
    sky: { top: '#02040f', mid: '#0b1d42', horizon: '#2b5f84', sun: '#e3ecff', aurora: 1, stars: 1 },
    fog: '#1a3658', fogNear: 200, fogFar: 1050,
    sunDir: [0.42, 0.38, -0.82], sunColor: '#aac6ff', sunIntensity: 1.9,
    hemi: ['#a6c8f0', '#1d2c4e', 1.5],
    ground: ['#e3edf8', '#d6e3f2', '#ecf3fb'],
    rock: ['#c5dbf2', '#9fc0e4', '#7a9fcf', '#5a7cae', '#425d8a'],
    hills: 120,
    dust: '#eef6ff',
  },
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

// Cône facetté (sapins).
function cone(gb, cx, y0, cz, r, h, sides, color, snow = null) {
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r]);
  }
  const apex = [cx, y0 + h, cz];
  for (let i = 0; i < sides; i++) {
    const a = ring[i], b = ring[(i + 1) % sides];
    if (snow) {
      // Le haut du cône est enneigé.
      const k = 0.55;
      const am = [a[0] + (apex[0] - a[0]) * k, a[1] + (apex[1] - a[1]) * k, a[2] + (apex[2] - a[2]) * k];
      const bm = [b[0] + (apex[0] - b[0]) * k, b[1] + (apex[1] - b[1]) * k, b[2] + (apex[2] - b[2]) * k];
      gb.quad(b, a, am, bm, color);
      gb.tri(bm, am, apex, snow);
    } else {
      gb.tri(b, a, apex, color);
    }
    gb.tri(a, b, [cx, y0, cz], color);
  }
}

const SKY_VERT = `varying vec3 vDir;
  void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir;
  uniform float time; uniform float aurora; uniform float stars;
  varying vec3 vDir;
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  void main(){
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.32, y));
    col = mix(col, top, smoothstep(0.25, 0.9, y));
    col = mix(col, horizon * 0.85, smoothstep(0.0, -0.2, y));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * (smoothstep(0.9982, 0.9990, s) * 1.4 + pow(s, 14.0) * 0.45 + pow(s, 3.0) * 0.08);
    if (stars > 0.0 && y > 0.0) {
      float h = hash3(floor(d * 380.0));
      float st = step(0.9965, h) * smoothstep(0.02, 0.3, y);
      col += vec3(st) * stars * (0.55 + 0.45 * sin(time * 2.3 + h * 70.0));
    }
    if (aurora > 0.0 && y > 0.0) {
      float az = atan(d.z, d.x);
      float band = smoothstep(0.06, 0.2, y) * smoothstep(0.7, 0.32, y);
      float wave = sin(az * 4.0 + time * 0.22 + sin(az * 9.0 - time * 0.35) * 0.9);
      float curtain = pow(0.5 + 0.5 * wave, 3.0);
      float rays = 0.65 + 0.35 * sin(az * 85.0 + time * 0.7 + sin(az * 13.0) * 3.0);
      vec3 ac = mix(vec3(0.1, 1.0, 0.62), vec3(0.62, 0.32, 1.0), smoothstep(0.22, 0.6, y));
      col += ac * band * curtain * rays * 0.6 * aurora;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export class Scenery {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.trackGroup = new THREE.Group();
    scene.add(this.trackGroup);
    scene.fog = new THREE.Fog('#000000', 200, 1000);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(2500, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
          sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() },
          time: { value: 0 }, aurora: { value: 0 }, stars: { value: 0 },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#000000', 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = quality !== 'low';
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.sunDir = new THREE.Vector3();

    this.decor = null;
    this.terrain = null;
    this.setTheme('desert');
  }

  setQuality(q) {
    this.quality = q;
    this.sun.castShadow = q !== 'low';
  }

  setTheme(id) {
    const T = THEMES[id] || THEMES.desert;
    this.themeId = THEMES[id] ? id : 'desert';
    this.theme = T;
    const u = this.sky.material.uniforms;
    u.top.value.set(T.sky.top);
    u.mid.value.set(T.sky.mid);
    u.horizon.value.set(T.sky.horizon);
    u.sunColor.value.set(T.sky.sun);
    u.aurora.value = T.sky.aurora;
    u.stars.value = T.sky.stars;
    this.sunDir.set(...T.sunDir).normalize();
    u.sunDir.value.copy(this.sunDir);
    this.scene.background = new THREE.Color(T.sky.horizon);
    this.scene.fog.color.set(T.fog);
    this.scene.fog.near = T.fogNear;
    this.scene.fog.far = T.fogFar;
    this.hemi.color.set(T.hemi[0]);
    this.hemi.groundColor.set(T.hemi[1]);
    this.hemi.intensity = T.hemi[2];
    this.sun.color.set(T.sunColor);
    this.sun.intensity = T.sunIntensity;
  }

  // Reconstruit le terrain et le décor autour d'un circuit.
  setTrack(track, seedStr = 'shardway', opts = {}) {
    this.setTheme(opts.theme || track.decor || 'desert');
    const T = this.theme;
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
      let h = (n * 1.4 - 0.25) * T.hills * smooth(0, 160, o);
      h = Math.max(0, h);
      const step = 14;
      const tz = Math.floor(h / step) * step;
      h = tz + Math.min(step, (h - tz) * 3.2);
      return h;
    };
    this.heightAt = heightAt;

    // Terrain
    const size = 3000, seg = this.quality === 'low' ? 70 : 110;
    const gb = new GeoBuilder();
    const step = size / seg;
    const x0 = cx - size / 2, z0 = cz - size / 2;
    const H = [];
    for (let i = 0; i <= seg; i++) {
      H.push([]);
      for (let j = 0; j <= seg; j++) {
        const x = x0 + i * step, z = z0 + j * step;
        const far = outside(x, z) > 20;
        const jx = far ? (hash2(i, j, seed) - 0.5) * step * 0.5 : 0;
        const jz = far ? (hash2(j, i, seed + 3) - 0.5) * step * 0.5 : 0;
        H[i].push([x + jx, heightAt(x, z) - 0.02, z + jz]);
      }
    }
    const colorFor = (h, r) => {
      if (h < 1) return T.ground[Math.floor(r * T.ground.length)];
      const k = Math.min(T.rock.length - 1, Math.floor(h / 18 + r * 0.8));
      return T.rock[k];
    };
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg; j++) {
        const a = H[i][j], b2 = H[i + 1][j], c = H[i + 1][j + 1], d = H[i][j + 1];
        gb.tri(a, d, c, colorFor((a[1] + d[1] + c[1]) / 3, hash2(i, j, seed + 11)));
        gb.tri(a, c, b2, colorFor((a[1] + c[1] + b2[1]) / 3, hash2(j, i, seed + 13)));
      }
    }
    this.terrain = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    this.terrain.receiveShadow = true;
    this.root.add(this.terrain);

    if (!withDecor) return;
    this.decor = new THREE.Group();
    this.root.add(this.decor);

    const scatter = (count, fn) => {
      let tries = 0, n = 0;
      while (n < count && tries < count * 20) {
        tries++;
        const ring = rand() < 0.45;
        const x = ring ? fx0 + rand() * (fx1 - fx0) : cx + (rand() - 0.5) * 1500;
        const z = ring ? fz0 + rand() * (fz1 - fz0) : cz + (rand() - 0.5) * 1500;
        if (!isFree(x, z)) continue;
        fn(x, heightAt(x, z), z);
        n++;
      }
    };
    const ctx = { rand, scatter, low: this.quality === 'low' };
    if (this.themeId === 'polar') this._polarDecor(ctx);
    else this._desertDecor(ctx);
  }

  _instanced(geo, mat, max, place) {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    const dummy = new THREE.Object3D();
    let i = 0;
    place((x, y, z, rx, ry, rz, sx, sy, sz) => {
      if (i >= max) return;
      dummy.position.set(x, y, z);
      dummy.rotation.set(rx, ry, rz);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i++, dummy.matrix);
    });
    mesh.count = i;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.decor.add(mesh);
    return mesh;
  }

  _rockGeo() {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const rp = g.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      rp.setXYZ(i, rp.getX(i) * (0.8 + hash2(i, 1, 5) * 0.5), rp.getY(i) * (0.6 + hash2(i, 2, 5) * 0.4), rp.getZ(i) * (0.8 + hash2(i, 3, 5) * 0.5));
    }
    g.computeVertexNormals();
    return g;
  }

  _crystals(ctx, colors, perColor, intensity) {
    const { rand, scatter } = ctx;
    const geo = new THREE.OctahedronGeometry(1, 0);
    geo.scale(0.55, 2.4, 0.55);
    geo.translate(0, 1.6, 0);
    for (const col of colors) {
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: intensity, flatShading: true, roughness: 0.3, metalness: 0.1 });
      this._instanced(geo, mat, perColor * 4, (put) => scatter(perColor, (x, y, z) => {
        const k = 2 + Math.floor(rand() * 3);
        const base = 1.5 + rand() * 3.5;
        for (let i = 0; i < k; i++) {
          const s = base * (0.5 + rand() * 0.7);
          put(x + (rand() - 0.5) * base * 1.6, y - 0.3, z + (rand() - 0.5) * base * 1.6,
            (rand() - 0.5) * 0.9, rand() * Math.PI, (rand() - 0.5) * 0.9, s, s, s);
        }
      }));
    }
  }

  _desertDecor(ctx) {
    const { rand, scatter, low } = ctx;
    const count = low ? 90 : 180;
    this._instanced(this._rockGeo(), new THREE.MeshStandardMaterial({ color: '#9a5c4e', flatShading: true, roughness: 1 }), count,
      (put) => scatter(count, (x, y, z) => {
        const s = 1 + rand() * 4.5;
        put(x, y + s * 0.2, z, rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6, s * (0.8 + rand() * 0.6), s * (0.6 + rand() * 0.6), s * (0.8 + rand() * 0.6));
      }));
    this._crystals(ctx, ['#ff7ad9', '#5ff2ff', '#a98bff'], low ? 30 : 60, 0.55);
  }

  _polarDecor(ctx) {
    const { rand, scatter, low } = ctx;
    // Sapins enneigés (géométrie à couleurs par sommet, instanciée)
    const gb = new GeoBuilder();
    gb.taper(0, 0, 0, 1.2, 0.5, 0.5, 0.4, 0.4, '#4a3530');
    cone(gb, 0, 1.0, 0, 2.2, 3.0, 7, '#1f4d4c', '#f3f8ff');
    cone(gb, 0, 2.6, 0, 1.7, 2.6, 7, '#22595a', '#f3f8ff');
    cone(gb, 0, 4.0, 0, 1.1, 2.2, 7, '#276463', '#ffffff');
    const pineGeo = gb.build();
    const pines = low ? 110 : 220;
    this._instanced(pineGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), pines,
      (put) => scatter(pines * 0.4, (x, y, z) => {
        const k = 1 + Math.floor(rand() * 4);
        for (let i = 0; i < k; i++) {
          const s = 1.1 + rand() * 1.4;
          put(x + (rand() - 0.5) * 14, y, z + (rand() - 0.5) * 14, 0, rand() * Math.PI * 2, 0, s, s * (0.9 + rand() * 0.4), s);
        }
      }));
    // Blocs de glace / glaciers
    const iceCount = low ? 60 : 120;
    this._instanced(this._rockGeo(), new THREE.MeshStandardMaterial({
      color: '#a9d6ff', emissive: '#1b4f8f', emissiveIntensity: 0.35, flatShading: true, roughness: 0.25, metalness: 0.1,
    }), iceCount, (put) => scatter(iceCount, (x, y, z) => {
      const s = 1.5 + rand() * 6;
      put(x, y + s * 0.25, z, rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4, s * (0.7 + rand() * 0.6), s * (0.8 + rand() * 1.4), s * (0.7 + rand() * 0.6));
    }));
    // Rochers sombres
    const rocks = low ? 40 : 80;
    this._instanced(this._rockGeo(), new THREE.MeshStandardMaterial({ color: '#4f607f', flatShading: true, roughness: 1 }), rocks,
      (put) => scatter(rocks, (x, y, z) => {
        const s = 1 + rand() * 3;
        put(x, y + s * 0.15, z, rand(), rand() * 6, rand(), s, s * 0.6, s);
      }));
    // Éclats de glace lumineux
    this._crystals(ctx, ['#7fe9ff', '#b48cff', '#e9f6ff'], low ? 18 : 36, 0.8);
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
  update(focus, camera, radius = 80) {
    const sc = this.sun.shadow.camera;
    if (sc.right !== radius) {
      sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius;
      sc.updateProjectionMatrix();
    }
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 280);
    if (camera) this.sky.position.copy(camera.position);
    this.sky.material.uniforms.time.value = performance.now() / 1000;
  }
}
