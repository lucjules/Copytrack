// Décors : ciel, lumière, terrain facetté et objets, selon le thème du circuit.
//  - desert : désert au crépuscule et cristaux (v1.0)
//  - polar  : nuit polaire, aurore boréale, banquise, glaciers et sapins enneigés
//  - volcano : volcans, coulées de lave, braises (v1.5)
//  - orbit   : station orbitale, planète à anneau, dômes et panneaux (v1.5)
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder } from './geo.js';
import { CELL } from './constants.js';
import { PIECES } from './pieces.js';
import { buildDecoInto } from './decos.js';

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
  jungle: {
    label: 'Jungle néon',
    sky: { top: '#07051f', mid: '#2a1066', horizon: '#14a38a', sun: '#d7c8ff', aurora: 0, stars: 0.8 },
    fog: '#103a38', fogNear: 120, fogFar: 760,
    sunDir: [-0.35, 0.55, -0.75], sunColor: '#b9a3ff', sunIntensity: 1.7,
    hemi: ['#7be8c0', '#1a1038', 1.45],
    ground: ['#1d3b2a', '#22452f', '#1a3324'],
    rock: ['#2b5a3a', '#2f6b45', '#1f4d5a', '#3a2f6b', '#4a2a7a'],
    hills: 110,
    dust: '#8ff5c8',
  },
  city: {
    label: 'Ville futuriste',
    sky: { top: '#03040f', mid: '#241048', horizon: '#ff3d8a', sun: '#ffd7f0', aurora: 0, stars: 0.5 },
    fog: '#2a1038', fogNear: 160, fogFar: 900,
    sunDir: [0.5, 0.25, -0.8], sunColor: '#ff9ad0', sunIntensity: 1.5,
    hemi: ['#ff9ad8', '#161033', 1.35],
    ground: ['#1b1f33', '#20253d', '#181b2e'],
    rock: ['#2a2f4d', '#343a5e', '#242848', '#3a2f5e', '#2a2048'],
    hills: 14,
    dust: '#b9a8ff',
  },
  volcano: {
    label: 'Volcan',
    sky: { top: '#12060a', mid: '#3a0f12', horizon: '#ff5a2a', sun: '#ffb27a', aurora: 0, stars: 0.25, embers: 1 },
    fog: '#3b1612', fogNear: 150, fogFar: 880,
    sunDir: [0.3, 0.42, -0.85], sunColor: '#ff9a62', sunIntensity: 1.9,
    hemi: ['#ffb08a', '#2a0f12', 1.4],
    ground: ['#2a2224', '#30272a', '#241d20'],
    rock: ['#3a2a2c', '#4a3032', '#5a3530', '#2c2022', '#1e1718'],
    hills: 150,
    lava: true,
    dust: '#8a7a78',
  },
  orbit: {
    label: 'Station orbitale',
    sky: { top: '#010108', mid: '#050722', horizon: '#141a46', sun: '#ffffff', aurora: 0, stars: 1.3, planet: 1 },
    fog: '#0b0f2a', fogNear: 320, fogFar: 1700,
    sunDir: [0.6, 0.45, -0.66], sunColor: '#f2f4ff', sunIntensity: 2.4,
    hemi: ['#b9c6ff', '#20223a', 1.3],
    ground: ['#3a3f5a', '#41466a', '#363b55'],
    rock: ['#4a5070', '#565c80', '#3e4362', '#6a7090', '#2e3250'],
    hills: 8,
    plates: true,
    dust: '#c9d4ff',
  },
  isles: {
    label: 'Archipel tropical',
    sky: { top: '#2a7fd8', mid: '#6cc0f0', horizon: '#ffe3b0', sun: '#fff7d6', aurora: 0, stars: 0 },
    fog: '#bfe6f2', fogNear: 260, fogFar: 1500,
    sunDir: [-0.45, 0.6, -0.65], sunColor: '#fff0d0', sunIntensity: 3.0,
    hemi: ['#cfeaff', '#3a8fb0', 1.7],
    ground: ['#1f9fd0', '#27aedb', '#1a8fc0'],
    rock: ['#f2d9a0', '#e8cc88', '#55b85a', '#44a24c', '#7a8f6a'],
    hills: 55,
    dust: '#f5e6c0',
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
  uniform float time; uniform float aurora; uniform float stars; uniform float planet; uniform float embers;
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
    if (planet > 0.0) {
      // Planète géante avec anneau, au-dessus de la station.
      vec3 pd = normalize(vec3(-0.55, 0.42, -0.72));
      vec3 U = normalize(cross(pd, vec3(0.0, 1.0, 0.0)));
      vec3 V = cross(U, pd);
      float c = dot(d, pd);
      vec2 q = vec2(dot(d, U), dot(d, V));
      float R = 0.21;
      float r = length(q);
      if (c > 0.0) {
        // anneau incliné (ellipse), caché derrière la planète sur sa moitié haute
        vec2 qr = vec2(q.x * 0.94 + q.y * 0.34, -q.x * 0.34 + q.y * 0.94);
        float e = length(vec2(qr.x, qr.y / 0.24));
        float ring = smoothstep(1.35 * R, 1.42 * R, e) * (1.0 - smoothstep(2.05 * R, 2.12 * R, e));
        ring *= 0.55 + 0.45 * sin(e * 160.0);
        bool behind = r < R && qr.y > 0.0;
        if (r < R) {
          float lat = q.y / R;
          vec3 base = mix(vec3(0.85, 0.55, 0.38), vec3(0.95, 0.78, 0.55), 0.5 + 0.5 * sin(lat * 18.0 + sin(q.x * 40.0) * 0.6));
          base = mix(base, vec3(0.55, 0.32, 0.5), 0.35 * (0.5 + 0.5 * sin(lat * 7.0)));
          vec3 nrm = normalize(pd * sqrt(max(0.0, R * R - r * r)) + U * q.x + V * q.y);
          float light = 0.12 + 0.88 * max(0.0, dot(nrm, normalize(sunDir)));
          col = mix(col, base * light, smoothstep(R, R - 0.004, r));
        }
        if (!behind) col = mix(col, vec3(0.92, 0.84, 0.7), ring * 0.75 * planet);
      }
    }
    if (embers > 0.0) {
      // Lueur rouge au ras de l'horizon et braises qui montent.
      col += vec3(1.0, 0.25, 0.05) * smoothstep(0.18, 0.0, abs(y)) * 0.25 * embers;
      float h = hash3(floor(vec3(d.x * 120.0, d.y * 120.0 - time * 0.6, d.z * 120.0)));
      col += vec3(1.0, 0.45, 0.1) * step(0.997, h) * smoothstep(0.0, 0.25, y) * embers;
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
          time: { value: 0 }, aurora: { value: 0 }, stars: { value: 0 }, planet: { value: 0 }, embers: { value: 0 },
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
    u.planet.value = T.sky.planet || 0;
    u.embers.value = T.sky.embers || 0;
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
    const colorFor = (h, r, x = 0, z = 0) => {
      if (T.lava && h < 1 && fbm(x * 0.012, z * 0.012, seed + 5) > 0.62) return r < 0.5 ? '#ff4a14' : '#ff7a1f';
      if (T.plates && h < 1) return ((Math.floor(x / 24) + Math.floor(z / 24)) & 1) ? T.ground[0] : T.ground[1 + Math.floor(r * 2)];
      if (h < 1) return T.ground[Math.floor(r * T.ground.length)];
      const k = Math.min(T.rock.length - 1, Math.floor(h / 18 + r * 0.8));
      return T.rock[k];
    };
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg; j++) {
        const a = H[i][j], b2 = H[i + 1][j], c = H[i + 1][j + 1], d = H[i][j + 1];
        gb.tri(a, d, c, colorFor((a[1] + d[1] + c[1]) / 3, hash2(i, j, seed + 11), a[0], a[2]));
        gb.tri(a, c, b2, colorFor((a[1] + c[1] + b2[1]) / 3, hash2(j, i, seed + 13), c[0], c[2]));
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
    else if (this.themeId === 'jungle') this._jungleDecor(ctx);
    else if (this.themeId === 'city') this._cityDecor(ctx);
    else if (this.themeId === 'isles') this._islesDecor(ctx);
    else if (this.themeId === 'volcano') this._volcanoDecor(ctx);
    else if (this.themeId === 'orbit') this._orbitDecor(ctx);
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


  // Fusionne N décorations (builders de decos.js) en un seul maillage.
  _scatterMerged(ctx, kinds, count, opts = {}) {
    const { rand, scatter } = ctx;
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    scatter(count, (x, y, z) => {
      const k = kinds[Math.floor(rand() * kinds.length)];
      const sc = (opts.min || 1) + rand() * ((opts.max || 1.6) - (opts.min || 1));
      const c = opts.colors ? opts.colors[Math.floor(rand() * opts.colors.length)] : 0;
      buildDecoInto(gb, glow, { k, x, y: y - 0.2, z, ry: rand() * Math.PI * 2, s: sc, c });
    });
    if (!gb.empty) {
      const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide }));
      m.castShadow = true; m.receiveShadow = true;
      this.decor.add(m);
    }
    if (!glow.empty) this.decor.add(new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })));
  }

  _jungleDecor(ctx) {
    const { rand, scatter, low } = ctx;
    // Arbres géants à canopée lumineuse
    const gb = new GeoBuilder();
    gb.taper(0, 0, 0, 14, 2.4, 2.4, 1.3, 1.3, '#2a2140');
    gb.taper(0, 0, 14, 22, 1.3, 1.3, 0.8, 0.8, '#3a2c55');
    const trunk = gb.build();
    const trees = low ? 50 : 100;
    const caps = new THREE.IcosahedronGeometry(1, 1);
    const trunkMesh = this._instanced(trunk, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), trees,
      (put) => scatter(trees, (x, y, z) => { const s = 0.8 + rand() * 1.8; put(x, y, z, 0, rand() * 6, 0, s, s * (0.9 + rand() * 0.6), s); }));
    void trunkMesh;
    for (const [col, n] of [['#2dffb0', 0.4], ['#8f5bff', 0.35], ['#ff4fd8', 0.25]]) {
      const cnt = Math.round(trees * n);
      this._instanced(caps, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, flatShading: true, roughness: 0.5 }), cnt,
        (put) => scatter(cnt, (x, y, z) => { const s = 5 + rand() * 7; put(x, y + 16 + rand() * 8, z, 0, rand() * 6, 0, s, s * 0.55, s); }));
    }
    this._scatterMerged(ctx, ['mushroom'], low ? 25 : 55, { min: 2, max: 5, colors: [0, 5, 7, 4] });
    this._scatterMerged(ctx, ['bush', 'flower'], low ? 40 : 90, { min: 1, max: 2.2, colors: [0, 4, 7] });
    this._crystals(ctx, ['#2dffb0', '#ff4fd8', '#8f5bff'], low ? 20 : 40, 0.9);
    // Lucioles
    const orb = new THREE.IcosahedronGeometry(0.35, 0);
    this._instanced(orb, new THREE.MeshBasicMaterial({ color: '#c9ffe9', toneMapped: false }), 160,
      (put) => scatter(160, (x, y, z) => put(x, y + 2 + rand() * 18, z, 0, 0, 0, 1, 1, 1)));
  }

  _cityDecor(ctx) {
    const { rand, scatter, low } = ctx;
    // Texture de fenêtres lumineuses
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#05060f'; g.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 8; x++) {
        if (rand() < 0.55) {
          const c = ['#ffd27a', '#7fe9ff', '#ff7ad9', '#fff3c4'][Math.floor(rand() * 4)];
          g.fillStyle = c; g.fillRect(x * 8 + 1.5, y * 8 + 2, 5, 4);
        }
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#232845', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9, flatShading: true, roughness: 0.7 });
    const n = low ? 90 : 190;
    this._instanced(box, mat, n, (put) => scatter(n, (x, y, z) => {
      const w = 14 + rand() * 30, hgt = 40 + rand() * (rand() < 0.2 ? 260 : 130);
      put(x, y, z, 0, 0, 0, w, hgt, w * (0.7 + rand() * 0.6));
    }));
    // Néons : enseignes lumineuses sur de petits immeubles
    for (const col of ['#ff3d8a', '#36e9ff', '#8f5bff']) {
      const cnt = low ? 14 : 30;
      this._instanced(box, new THREE.MeshBasicMaterial({ color: col, toneMapped: false }), cnt,
        (put) => scatter(cnt, (x, y, z) => put(x, y + 30 + rand() * 120, z, 0, rand() * 3, 0, 1.2 + rand() * 1.6, 3 + rand() * 6, 10 + rand() * 18)));
    }
    // Pylônes et lampadaires
    this._scatterMerged(ctx, ['sign_up', 'sign_warn', 'cube'], low ? 30 : 60, { min: 1.5, max: 3, colors: [3, 5, 7] });
  }

  _islesDecor(ctx) {
    const { low } = ctx;
    this._scatterMerged(ctx, ['palm'], low ? 70 : 150, { min: 1.2, max: 2.2 });
    this._scatterMerged(ctx, ['bush', 'rock'], low ? 40 : 90, { min: 1.2, max: 3 });
    this._scatterMerged(ctx, ['flower'], low ? 20 : 50, { min: 1.5, max: 2.5, colors: [1, 7, 4] });
    // Rochers à l'horizon
    this._crystals(ctx, ['#ffe08a', '#ff9ec8', '#8ff0ff'], low ? 10 : 22, 0.4);
  }

  _volcanoDecor(ctx) {
    const { rand, scatter, low } = ctx;
    // Volcans à l'horizon (cônes facettés, cratère lumineux) et colonnes de fumée.
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    const n = low ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.4, d = 900 + rand() * 500;
      const x = this.center.x + Math.cos(a) * d, z = this.center.z + Math.sin(a) * d;
      const r = 160 + rand() * 160, h = 180 + rand() * 220;
      cone(gb, x, -5, z, r, h, 9, i % 2 ? '#2c2022' : '#3a2a2c');
      const top = h * 0.86, cr = r * 0.14;
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
        glow.tri([x + Math.cos(a0) * cr, top, z + Math.sin(a0) * cr], [x + Math.cos(a1) * cr, top, z + Math.sin(a1) * cr], [x, top + 2, z], '#ff5a1f');
      }
      // coulée de lave sur un flanc
      const fa = rand() * Math.PI * 2;
      for (let k = 0; k < 6; k++) {
        const t0 = k / 6, t1 = (k + 1) / 6;
        const p0 = [x + Math.cos(fa) * cr * (1 + t0 * 6), top * (1 - t0), z + Math.sin(fa) * cr * (1 + t0 * 6)];
        const p1 = [x + Math.cos(fa) * cr * (1 + t1 * 6), top * (1 - t1), z + Math.sin(fa) * cr * (1 + t1 * 6)];
        const w = 10 + t1 * 18, px = -Math.sin(fa) * w, pz = Math.cos(fa) * w;
        glow.quad([p0[0] - px, p0[1] + 1, p0[2] - pz], [p0[0] + px, p0[1] + 1, p0[2] + pz], [p1[0] + px, p1[1] + 1, p1[2] + pz], [p1[0] - px, p1[1] + 1, p1[2] - pz], k % 2 ? '#ff4a14' : '#ff8a2a');
      }
    }
    const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    this.decor.add(m);
    this.decor.add(new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })));
    // Fumée : grosses boules grises au-dessus des cratères (instanciées).
    const puff = new THREE.IcosahedronGeometry(1, 1);
    this._instanced(puff, new THREE.MeshStandardMaterial({ color: '#5a4a4a', flatShading: true, roughness: 1, transparent: true, opacity: 0.55 }), low ? 20 : 45,
      (put) => { for (let i = 0; i < (low ? 20 : 45); i++) { const a = rand() * Math.PI * 2, d = 900 + rand() * 500; const s = 30 + rand() * 60; put(this.center.x + Math.cos(a) * d, 300 + rand() * 260, this.center.z + Math.sin(a) * d, 0, rand() * 6, 0, s, s * 0.7, s); } });
    // Roches basaltiques, cristaux de feu, mares de lave.
    this._scatterMerged(ctx, ['rock'], low ? 60 : 130, { min: 2, max: 6 });
    this._crystals(ctx, ['#ff5a1f', '#ffb02e', '#ff2b4a'], low ? 16 : 34, 1.0);
    const pool = new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2);
    this._instanced(pool, new THREE.MeshBasicMaterial({ color: '#ff6a1a', toneMapped: false }), low ? 25 : 60,
      (put) => scatter(low ? 25 : 60, (x, y, z) => { const s = 6 + rand() * 16; put(x, y + 0.08, z, 0, rand() * 6, 0, s, 1, s * (0.6 + rand() * 0.6)); }));
  }

  _orbitDecor(ctx) {
    const { rand, scatter, low } = ctx;
    // Modules de station : dômes, tours d'antennes, panneaux solaires, balises.
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    const n = low ? 40 : 90;
    scatter(n, (x, y, z) => {
      const k = rand();
      if (k < 0.3) {
        // dôme
        const r = 10 + rand() * 18, seg = 8;
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
          for (let j = 0; j < 3; j++) {
            const b0 = (j / 3) * Math.PI / 2, b1 = ((j + 1) / 3) * Math.PI / 2;
            const P = (a, b) => [x + Math.cos(a) * Math.cos(b) * r, y + Math.sin(b) * r, z + Math.sin(a) * Math.cos(b) * r];
            gb.quad(P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1), j === 2 ? '#8fa0d8' : '#5a6290');
          }
        }
        glow.quad([x - r * 0.3, y + 0.6, z + r], [x + r * 0.3, y + 0.6, z + r], [x + r * 0.3, y + 3, z + r * 0.98], [x - r * 0.3, y + 3, z + r * 0.98], '#7fe9ff');
      } else if (k < 0.55) {
        // tour d'antennes
        const h = 30 + rand() * 70;
        gb.taper(x, z, y, y + h, 3, 3, 1.4, 1.4, '#6a7090');
        gb.box(x - 6, y + h * 0.6, z - 0.4, x + 6, y + h * 0.6 + 0.8, z + 0.4, '#8890b0');
        glow.box(x - 0.8, y + h, z - 0.8, x + 0.8, y + h + 1.6, z + 0.8, rand() < 0.5 ? '#ff3d6a' : '#36e9ff');
      } else if (k < 0.85) {
        // panneau solaire incliné
        const w = 16 + rand() * 14, d2 = 8 + rand() * 6, h = 4 + rand() * 4;
        gb.taper(x, z, y, y + h, 0.8, 0.8, 0.6, 0.6, '#565c80');
        gb.quad([x - w, y + h, z - d2], [x + w, y + h, z - d2], [x + w, y + h + d2 * 0.6, z + d2], [x - w, y + h + d2 * 0.6, z + d2], '#1f3a8a');
        for (let i = -2; i <= 2; i++) glow.quad([x + i * w / 2.5 - 0.15, y + h + 0.05, z - d2], [x + i * w / 2.5 + 0.15, y + h + 0.05, z - d2], [x + i * w / 2.5 + 0.15, y + h + d2 * 0.6 + 0.05, z + d2], [x + i * w / 2.5 - 0.15, y + h + d2 * 0.6 + 0.05, z + d2], '#4f7cff');
      } else {
        // balise lumineuse
        gb.taper(x, z, y, y + 8, 1.2, 1.2, 0.6, 0.6, '#3e4362');
        glow.box(x - 0.9, y + 8, z - 0.9, x + 0.9, y + 9.8, z + 0.9, '#b9a6ff');
      }
    });
    const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true;
    this.decor.add(m);
    this.decor.add(new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })));
    // Débris flottants et satellites au loin.
    const deb = new THREE.IcosahedronGeometry(1, 0);
    this._instanced(deb, new THREE.MeshStandardMaterial({ color: '#7a80a0', flatShading: true, roughness: 0.8 }), low ? 30 : 70,
      (put) => { for (let i = 0; i < (low ? 30 : 70); i++) { const a = rand() * Math.PI * 2, d = 400 + rand() * 900; const s = 2 + rand() * 9; put(this.center.x + Math.cos(a) * d, 60 + rand() * 300, this.center.z + Math.sin(a) * d, rand() * 6, rand() * 6, rand() * 6, s, s, s); } });
    this._crystals(ctx, ['#b9a6ff', '#7fe9ff'], low ? 8 : 18, 0.6);
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
