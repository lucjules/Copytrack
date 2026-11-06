// Décors de chaque thème (désert, pôles, jungle, ville, îles, volcan, orbite, grottes, ciel, récif, usine) et terrain.
// Ces méthodes s'ajoutent au prototype de Scenery (voir scenery.js) : `this` est l'instance.
import * as THREE from '../vendor/three.module.min.js';
import { GeoBuilder } from '../geo.js';
import { buildDecoInto } from '../decos.js';
import { hash2 } from './shared.js';
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

export const decorMethods = {
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
  },

  _rockGeo() {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const rp = g.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      rp.setXYZ(i, rp.getX(i) * (0.8 + hash2(i, 1, 5) * 0.5), rp.getY(i) * (0.6 + hash2(i, 2, 5) * 0.4), rp.getZ(i) * (0.8 + hash2(i, 3, 5) * 0.5));
    }
    g.computeVertexNormals();
    return g;
  },

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
  },

  _desertDecor(ctx) {
    const { rand, scatter, low } = ctx;
    const count = low ? 90 : 180;
    this._instanced(this._rockGeo(), new THREE.MeshStandardMaterial({ color: '#9a5c4e', flatShading: true, roughness: 1 }), count,
      (put) => scatter(count, (x, y, z) => {
        const s = 1 + rand() * 4.5;
        put(x, y + s * 0.2, z, rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6, s * (0.8 + rand() * 0.6), s * (0.6 + rand() * 0.6), s * (0.8 + rand() * 0.6));
      }));
    this._crystals(ctx, ['#ff7ad9', '#5ff2ff', '#a98bff'], low ? 30 : 60, 0.55);
  },

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
  },

  // Fusionne N décorations (builders de decos.js) en un seul maillage.
  _scatterMerged(ctx, kinds, count, opts = {}) {
    const { rand, scatter } = ctx;
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    scatter(count, (x, y, z) => {
      const k = kinds[Math.floor(rand() * kinds.length)];
      const sc = (opts.min || 1) + rand() * ((opts.max || 1.6) - (opts.min || 1));
      const c = opts.colors ? opts.colors[Math.floor(rand() * opts.colors.length)] : 0;
      const lift = opts.lift ? opts.lift[0] + rand() * (opts.lift[1] - opts.lift[0]) : 0;
      buildDecoInto(gb, glow, { k, x, y: y - 0.2 + lift, z, ry: rand() * Math.PI * 2, s: sc, c });
    });
    if (!gb.empty) {
      const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide }));
      m.castShadow = true; m.receiveShadow = true;
      this.decor.add(m);
    }
    if (!glow.empty) this.decor.add(new THREE.Mesh(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide })));
  },

  _jungleDecor(ctx) {
    const { rand, scatter, low } = ctx;
    // Arbres géants à canopée lumineuse
    const gb = new GeoBuilder();
    gb.taper(0, 0, 0, 14, 2.4, 2.4, 1.3, 1.3, '#2a2140');
    gb.taper(0, 0, 14, 22, 1.3, 1.3, 0.8, 0.8, '#3a2c55');
    const trunk = gb.build();
    const trees = low ? 50 : 100;
    const caps = new THREE.IcosahedronGeometry(1, 1);
    this._instanced(trunk, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), trees,
      (put) => scatter(trees, (x, y, z) => { const s = 0.8 + rand() * 1.8; put(x, y, z, 0, rand() * 6, 0, s, s * (0.9 + rand() * 0.6), s); }));
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
  },

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
  },

  _islesDecor(ctx) {
    const { low } = ctx;
    this._scatterMerged(ctx, ['palm'], low ? 70 : 150, { min: 1.2, max: 2.2 });
    this._scatterMerged(ctx, ['bush', 'rock'], low ? 40 : 90, { min: 1.2, max: 3 });
    this._scatterMerged(ctx, ['flower'], low ? 20 : 50, { min: 1.5, max: 2.5, colors: [1, 7, 4] });
    // Rochers à l'horizon
    this._crystals(ctx, ['#ffe08a', '#ff9ec8', '#8ff0ff'], low ? 10 : 22, 0.4);
  },

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
  },

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
    // 0.9 : satellites, antennes, fusées, astéroïdes en orbite et petites planètes.
    this._scatterMerged(ctx, ['antenna', 'rocket'], low ? 10 : 24, { min: 1.5, max: 3 });
    this._scatterMerged(ctx, ['satellite', 'asteroid', 'planetMini'], low ? 14 : 34, { min: 2, max: 6, lift: [40, 220] });
  },

  _cavesDecor(ctx) {
    const { rand, low } = ctx;
    this._scatterMerged(ctx, ['stalagmite', 'stalagmite', 'cavePillar'], low ? 60 : 140, { min: 1.5, max: 5 });
    this._scatterMerged(ctx, ['crystalCluster'], low ? 40 : 90, { min: 1.2, max: 4, colors: [0, 0, 4, 6, 5] });
    this._scatterMerged(ctx, ['glowMushroom'], low ? 25 : 60, { min: 1, max: 3, colors: [0, 4, 7] });
    this._scatterMerged(ctx, ['lantern', 'minecart'], low ? 10 : 24, { min: 1, max: 1.6 });
    this._crystals(ctx, ['#5ff2ff', '#b48cff', '#ff7ad9'], low ? 30 : 70, 1.1);
    // Stalactites géantes qui pendent de la voûte, au loin.
    const geo = new THREE.ConeGeometry(1, 1, 7);
    geo.rotateX(Math.PI);
    geo.translate(0, -0.5, 0);
    this._instanced(geo, new THREE.MeshStandardMaterial({ color: '#3a2e4a', flatShading: true, roughness: 1 }), low ? 40 : 90,
      (put) => { for (let i = 0; i < (low ? 40 : 90); i++) { const a = rand() * Math.PI * 2, d = 200 + rand() * 900; const r = 8 + rand() * 30; put(this.center.x + Math.cos(a) * d, 180 + rand() * 120, this.center.z + Math.sin(a) * d, 0, rand() * 6, 0, r, 60 + rand() * 120, r); } });
    // Lucioles de cristal.
    const orb = new THREE.IcosahedronGeometry(0.3, 0);
    this._instanced(orb, new THREE.MeshBasicMaterial({ color: '#c9f5ff', toneMapped: false }), 140,
      (put) => ctx.scatter(140, (x, y, z) => put(x, y + 1 + rand() * 14, z, 0, 0, 0, 1, 1, 1)));
  },

  _skyDecor(ctx) {
    const { low } = ctx;
    // Îles flottantes, nuages, montgolfières, dirigeables, tours célestes.
    this._scatterMerged(ctx, ['floatIsle'], low ? 18 : 40, { min: 2.5, max: 6, lift: [10, 90] });
    this._scatterMerged(ctx, ['cloud'], low ? 40 : 100, { min: 3, max: 9, lift: [-6, 120] });
    this._scatterMerged(ctx, ['balloon'], low ? 12 : 30, { min: 1.4, max: 3, lift: [10, 120], colors: [0, 1, 2, 4, 6] });
    this._scatterMerged(ctx, ['airship'], low ? 5 : 12, { min: 2, max: 4, lift: [40, 160] });
    this._scatterMerged(ctx, ['skyTower', 'windmill'], low ? 14 : 34, { min: 1.5, max: 3.5 });
  },

  _reefDecor(ctx) {
    const { rand, low } = ctx;
    this._scatterMerged(ctx, ['coral'], low ? 60 : 140, { min: 1.2, max: 4, colors: [0, 0, 1, 6, 5, 2] });
    this._scatterMerged(ctx, ['seaweed'], low ? 60 : 140, { min: 1.2, max: 3.5 });
    this._scatterMerged(ctx, ['shell', 'rock', 'anchor', 'treasure'], low ? 30 : 70, { min: 1, max: 2.5 });
    this._scatterMerged(ctx, ['fishSchool'], low ? 25 : 60, { min: 1.2, max: 3, lift: [2, 40], colors: [0, 0, 4, 2] });
    this._scatterMerged(ctx, ['jellyfish'], low ? 12 : 30, { min: 1, max: 2.5, lift: [6, 50], colors: [0, 6, 5] });
    // Bulles qui flottent.
    const bub = new THREE.IcosahedronGeometry(0.4, 1);
    this._instanced(bub, new THREE.MeshBasicMaterial({ color: '#bff4ff', toneMapped: false, transparent: true, opacity: 0.6 }), 220,
      (put) => ctx.scatter(220, (x, y, z) => { const s = 0.5 + rand() * 1.5; put(x, y + 2 + rand() * 40, z, 0, 0, 0, s, s, s); }));
  },

  _factoryDecor(ctx) {
    const { rand, low } = ctx;
    // Hangars sombres aux fenêtres orangées.
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const n = low ? 40 : 90;
    this._instanced(box, new THREE.MeshStandardMaterial({ color: '#3a3430', flatShading: true, roughness: 0.9, metalness: 0.2 }), n,
      (put) => ctx.scatter(n, (x, y, z) => { const w = 16 + rand() * 30; put(x, y, z, 0, rand() * 3, 0, w, 12 + rand() * 30, w * (0.6 + rand() * 0.6)); }));
    this._scatterMerged(ctx, ['chimney'], low ? 12 : 30, { min: 1.5, max: 3.5 });
    this._scatterMerged(ctx, ['gear'], low ? 14 : 30, { min: 2, max: 5 });
    this._scatterMerged(ctx, ['pipe', 'crane'], low ? 16 : 36, { min: 1.2, max: 2.5 });
    this._scatterMerged(ctx, ['crate', 'barrel', 'warnLight'], low ? 30 : 70, { min: 1, max: 2 });
    // Fumée au-dessus des cheminées (lointaine).
    const puff = new THREE.IcosahedronGeometry(1, 1);
    this._instanced(puff, new THREE.MeshStandardMaterial({ color: '#6a5a50', flatShading: true, roughness: 1, transparent: true, opacity: 0.5 }), low ? 25 : 60,
      (put) => { for (let i = 0; i < (low ? 25 : 60); i++) { const a = rand() * Math.PI * 2, d = 300 + rand() * 900; const s = 15 + rand() * 40; put(this.center.x + Math.cos(a) * d, 80 + rand() * 200, this.center.z + Math.sin(a) * d, 0, rand() * 6, 0, s, s * 0.6, s); } });
  },

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
  },
};
