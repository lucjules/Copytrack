// Maillage du circuit à partir des pièces : matières, tronçons statiques reconstruits à la demande, pièces mobiles, obstacles, lampes.
// La forme 3D de chaque pièce est dans trackGeometry.js.
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder, FxBuilder } from './geo.js';
import { CELL, ROAD_HALF } from './constants.js';
import { PIECES } from './pieces.js';
import { tileToRow } from './track.js';
import { buildDecoInto, createPlaque, decoColor } from './decos.js';
import { LIGHT_DECOS } from './decoData.js';
import { isObstacle } from './obstacles.js';
import { createObstacleMesh } from './obstacleMesh.js';
import { buildTileInto } from './trackGeometry.js';
import { renderOptions } from './renderOptions.js';

const MOVO = {};

const FX_VERT = `
attribute vec4 fx;
varying vec4 vFx;
varying vec3 vPos;
#include <fog_pars_vertex>
void main() {
  vFx = fx;
  vPos = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FX_FRAG = `
uniform float uTime;
varying vec4 vFx;
varying vec3 vPos;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float k = vFx.x, t = uTime;
  vec2 p = vPos.xz;
  float edge = smoothstep(${(ROAD_HALF - 2).toFixed(1)}, ${ROAD_HALF.toFixed(1)}, abs(vFx.w));
  vec3 c;
  if (k < 0.5) {
    // Eau : houle, reflets mouvants et écume le long des bords.
    float w = sin(p.x * 0.35 + t * 1.7) + sin(p.y * 0.29 - t * 1.3) + 0.6 * sin((p.x + p.y) * 0.6 + t * 2.3);
    float ca = abs(sin(p.x * 0.8 + sin(p.y * 0.7 + t) * 1.5 + t * 0.8) * sin(p.y * 0.8 + sin(p.x * 0.6 - t) * 1.5));
    c = mix(vec3(0.02, 0.20, 0.42), vec3(0.08, 0.48, 0.82), 0.5 + 0.2 * w) + pow(ca, 5.0) * vec3(0.55, 0.85, 1.0) * 0.7;
    float foam = edge * (0.6 + 0.4 * sin(vFx.y * 0.9 + t * 3.0 + p.x));
    c = mix(c, vec3(0.92, 0.98, 1.0), clamp(foam, 0.0, 1.0));
  } else if (k < 1.5) {
    // Tapis roulant : chevrons qui défilent à la vitesse de la bande.
    float s = fract((vFx.y - t * vFx.z - abs(vFx.w) * 0.45) / 4.0);
    float ch = step(0.72, s);
    float lines = step(0.92, fract(vFx.y * 0.0 + (vFx.w + 9.0) / 4.5));
    c = mix(vec3(0.10, 0.10, 0.12), vec3(0.18, 0.18, 0.21), lines);
    c = mix(c, vec3(1.0, 0.82, 0.24), ch * (1.0 - edge));
  } else if (k < 2.5) {
    // Verre : transparence froide et reflet qui balaie la surface.
    float sweep = pow(max(0.0, sin((p.x + p.y) * 0.12 - t * 1.4)), 24.0);
    float tile = step(0.96, fract(p.x / 6.0)) + step(0.96, fract(p.y / 6.0));
    c = vec3(0.45, 0.72, 0.88) + sweep * vec3(0.6) + tile * vec3(0.25, 0.3, 0.35) + edge * vec3(0.2);
  } else {
    // Poudreuse : blanc bleuté et cristaux qui scintillent.
    float g = hash(floor(p * 2.5));
    float tw = step(0.975, g) * (0.5 + 0.5 * sin(t * 6.0 + g * 60.0));
    float drift = 0.06 * sin(p.x * 0.4 + p.y * 0.3);
    c = vec3(0.86, 0.92, 1.0) + drift + tw * vec3(0.6, 0.7, 0.8);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;

function createFxMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: FX_VERT,
    fragmentShader: FX_FRAG,
    fog: true,
    side: THREE.DoubleSide,
  });
}


export function createTrackMaterials() {
  return {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }),
    fx: createFxMaterial(),
  };
}

// Tronçons : le maillage statique (route, piliers, décorations fixes) est découpé en carrés de CHUNK × CHUNK cases (128 m). Un tronçon n'est reconstruit
// que si l'un de ses éléments, ou un voisin qui influe sur ses piliers, a changé : dans l'éditeur, poser une pièce ne régénère plus tout le circuit
// (un grand circuit de 270 pièces et 300 décorations coûtait ~130 ms par modification). Chaque tronçon a sa boîte englobante : la caméra et les
// ombres n'envoient à la carte graphique que ceux qu'elles voient.
const CHUNK = 4;
const chunkKey = (cx, cz) => cx * 8192 + cz;
const tileSig = (t, flags) => flags + JSON.stringify(tileToRow(t));
const decoSig = (d) => `${d.k}|${d.x}|${d.y}|${d.z}|${d.ry || 0}|${d.s || 1}|${d.c || 0}|${d.cc || ''}|${d.u || ''}`;

export class TrackView {
  constructor(track, materials, { showAllDecos = false } = {}) {
    this.track = track;
    this.materials = materials;
    this.showAllDecos = showAllDecos;
    this.group = new THREE.Group();
    this.chunks = new Map();            // clé de tronçon -> { sig, meshes } (maillage statique, conservé d'une reconstruction à l'autre)
    this.chunkMeshes = new Set();
    this.chunkBuilds = 0;               // nombre de tronçons construits depuis la création (mesuré par les tests)
    this.plaques = [];
    this.obstacles = [];
    this.movers = [];
    this.glassGroups = [];
    this.lamps = [];
    this.pool = null;
    this.rebuild();
  }

  // Remet le maillage à jour. Les objets dynamiques (pièces mobiles, dalles de verre, obstacles, plaques, lampes) sont recréés ; le maillage
  // statique ne l'est que pour les tronçons dont la signature a changé.
  rebuild() {
    this._disposeDynamic();
    const track = this.track, focus = this.focus;
    // Vue par niveau (éditeur) : les pièces des autres niveaux sont dessinées estompées.
    const dimG = new GeoBuilder(), dimGlow = new GeoBuilder();
    const buckets = new Map();
    const bucket = (cx, cz) => {
      const k = chunkKey(cx, cz);
      let b = buckets.get(k);
      if (!b) buckets.set(k, b = { cx, cz, tiles: [], decos: [], sig: '' });
      return b;
    };
    const sigs = new Map();
    for (const tile of track.tiles) {
      const P = PIECES[tile.t];
      const hi = tile.l + Math.max(P.rise || 0, 0) + (P.clearance || tile.cp ? 1 : 0) + (tile.o ? 2 : 0);
      const lo = tile.l + Math.min(P.rise || 0, 0) - Math.max(P.below || 0, tile.o ? 2 : 0);          // (`below` : route sur le côté, qui descend sous son niveau ; pente descendante : sous son niveau d'entrée)
      const dim = focus != null && !(focus >= lo - 0.01 && focus <= hi + 0.01);
      const glassy = tile.s === 'glass' || tile.s2 === 'glass';
      sigs.set(tile, tileSig(tile, dim ? 'd' : 's'));
      if ((tile.mv || glassy) && !dim) {
        // Pièce mobile (déplacée à chaque image selon le chrono) ou dalle de verre (masquée quand elle se brise) : son propre groupe.
        const g1 = new GeoBuilder(), g2 = new GeoBuilder(), g3 = new FxBuilder();
        buildTileInto(g1, g2, tile, track, g3);
        const grp = new THREE.Group();
        const m1 = new THREE.Mesh(g1.build(), this.materials.solid);
        m1.castShadow = true; m1.receiveShadow = true;
        grp.add(m1);
        if (!g2.empty) grp.add(new THREE.Mesh(g2.build(), this.materials.glow));
        if (!g3.empty && this.materials.fx) grp.add(this._fxMesh(g3));
        this.group.add(grp);
        if (tile.mv) this.movers.push({ tile, grp });
        if (glassy) this.glassGroups.push({ tile, grp });
      } else if (dim) buildTileInto(dimG, dimGlow, tile, track);
      else bucket(Math.floor(tile.x / CHUNK), Math.floor(tile.z / CHUNK)).tiles.push(tile);
    }
    if (!dimG.empty) {
      if (!this.dimMat) this.dimMat = new THREE.MeshBasicMaterial({ color: '#8c90b8', transparent: true, opacity: 0.16, depthWrite: false });
      this.group.add(new THREE.Mesh(dimG.build(), this.dimMat));
      if (!dimGlow.empty) this.group.add(new THREE.Mesh(dimGlow.build(), this.dimMat));
    }
    const span = CELL * CHUNK;
    for (const d of track.decos) {
      if (renderOptions.hideDecos && !this.showAllDecos && !isObstacle(d.k)) continue;
      if (d.k === 'plaque') {
        const mesh = createPlaque(d);
        this.group.add(mesh);
        this.plaques.push(mesh);
      } else if (isObstacle(d.k)) {
        const o = createObstacleMesh(d, this.materials);
        this.group.add(o);
        this.obstacles.push(o);
      } else {
        bucket(Math.floor(d.x / span), Math.floor(d.z / span)).decos.push(d);
        if (LIGHT_DECOS[d.k]) this._addLamp(d);
      }
    }
    this._initLightPool();

    // Signature d'un tronçon : ses pièces, ses décorations, et les pièces voisines (la case d'à côté, comprise) dont dépend l'emplacement de
    // ses piliers (un pilier est omis sous une autre pièce) ; plus les réglages de qualité qui changent le contenu.
    const flags = (renderOptions.hideDecos ? 'h' : 'v') + (this.showAllDecos ? 'a' : 'n') + (renderOptions.colorblind ? 'c' : 'n');
    for (const b of buckets.values()) {
      const seen = new Set(b.tiles);
      let sig = flags;
      for (const t of b.tiles) sig += '|' + sigs.get(t);
      for (let cz = b.cz * CHUNK - 1; cz <= b.cz * CHUNK + CHUNK; cz++) {
        for (let cx = b.cx * CHUNK - 1; cx <= b.cx * CHUNK + CHUNK; cx++) {
          for (const o of track.tilesAt(cx, cz)) if (!seen.has(o)) { seen.add(o); sig += '#' + sigs.get(o); }
        }
      }
      for (const d of b.decos) sig += '~' + decoSig(d);
      b.sig = sig;
    }
    for (const [key, ch] of [...this.chunks]) {
      const b = buckets.get(key);
      if (!b || b.sig !== ch.sig) { this._disposeChunk(ch); this.chunks.delete(key); }
    }
    for (const [key, b] of buckets) if (!this.chunks.has(key)) this.chunks.set(key, this._buildChunk(b));
    this.builtVersion = track.version;
  }

  _buildChunk(b) {
    this.chunkBuilds++;
    const gb = new GeoBuilder(), glow = new GeoBuilder(), fx = new FxBuilder();
    for (const tile of b.tiles) buildTileInto(gb, glow, tile, this.track, fx);
    for (const d of b.decos) buildDecoInto(gb, glow, d);
    const meshes = [];
    if (!gb.empty) {
      const mesh = new THREE.Mesh(gb.build(), this.materials.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
    if (!glow.empty) meshes.push(new THREE.Mesh(glow.build(), this.materials.glow));
    if (!fx.empty && this.materials.fx) meshes.push(this._fxMesh(fx));
    for (const m of meshes) {
      m.matrixAutoUpdate = false;          // statique : la matrice (identité) ne se recalcule pas à chaque image
      this.group.add(m);
      this.chunkMeshes.add(m);
    }
    return { sig: b.sig, meshes };
  }

  _disposeChunk(ch) {
    for (const m of ch.meshes) {
      m.geometry.dispose();
      this.group.remove(m);
      this.chunkMeshes.delete(m);
    }
  }

  // Couche d'effets animés (le temps passe par une variable de la matière, mise à jour juste avant le dessin).
  _fxMesh(builder) {
    const mesh = new THREE.Mesh(builder.build(), this.materials.fx), mat = this.materials.fx;
    mesh.onBeforeRender = () => { mat.uniforms.uTime.value = performance.now() / 1000; };
    mesh.receiveShadow = false;
    return mesh;
  }

  // ---- Décorations lumineuses (projecteurs, lanternes, lampadaires) -------------------------------------------------------------
  // Chaque lampe a un groupe dynamique (faisceau tournant, halo) ; la lumière réelle vient d'un petit nombre de lumières partagées
  // (voir renderOptions.lightBudget) attribuées à chaque image aux lampes les plus proches de la caméra. La couleur de la lumière suit celle de l'objet.
  _addLamp(d) {
    const L = LIGHT_DECOS[d.k];
    const grp = new THREE.Group();
    grp.position.set(d.x, d.y, d.z); grp.rotation.y = d.ry || 0; grp.scale.setScalar(d.s || 1);
    grp.userData.lamp = true;
    const hex = decoColor(d) || L.color;
    const col = new THREE.Color(hex);
    const lamp = { d, L, grp, col, hex, head: null, mats: [], phase: ((d.x * 12.9898 + d.z * 78.233) % 6.283 + 6.283) % 6.283 };
    const mat = (o) => { const m = new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...o }); lamp.mats.push(m); return m; };
    if (L.type === 'spot') {
      const head = new THREE.Group(); head.position.y = L.y; grp.add(head);
      const phi = Math.PI / 2 + L.tilt;
      const cone = (r, len, op) => { const g = new THREE.ConeGeometry(r, len, 20, 1, true); g.translate(0, -len / 2, 0); g.rotateX(phi); return new THREE.Mesh(g, mat({ opacity: op })); };
      const r = L.beam * Math.tan(L.angle);
      head.add(cone(r, L.beam, 0.06), cone(r * 0.4, L.beam, 0.11));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 2.0, 12).rotateX(phi), new THREE.MeshStandardMaterial({ color: '#2f3247', roughness: 0.6 }));
      barrel.position.set(0, Math.sin(L.tilt) * 0.7, -Math.cos(L.tilt) * 0.7);
      barrel.userData.own = true;
      head.add(barrel);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12).rotateX(phi - Math.PI / 2 + Math.PI), mat({ opacity: 0.95 }));
      lens.position.set(0, Math.sin(L.tilt) * 1.55, -Math.cos(L.tilt) * 1.55);
      head.add(lens);
      lamp.head = head;
    } else {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(L.type === 'point' && L.y > 6 ? 1.5 : 1.1, 10, 8), mat({ opacity: 0.12 }));
      halo.position.set(d.k === 'streetLamp' ? 1.8 : 0, L.y - (d.k === 'streetLamp' ? 0.2 : d.k === 'lanternHang' ? 0.1 : 0), 0);
      grp.add(halo);
    }
    this.group.add(grp);
    this.lamps.push(lamp);
  }

  _initLightPool() {
    this.pool = null;
    if (!this.lamps || !this.lamps.length) return;
    const b = renderOptions.lightBudget, pool = { points: [], spots: [] };
    for (let i = 0; i < b.point; i++) { const l = new THREE.PointLight('#ffffff', 0, 40, 2); l.userData.pool = true; this.group.add(l); pool.points.push(l); }
    for (let i = 0; i < b.spot; i++) {
      const l = new THREE.SpotLight('#ffffff', 0, 120, 0.3, 0.55, 1.6);
      l.userData.pool = true; this.group.add(l); this.group.add(l.target); pool.spots.push(l);
    }
    this.pool = pool;
  }

  // À appeler à chaque image : fait tourner les projecteurs et attribue les vraies lumières aux lampes les plus proches de pos.
  updateLights(pos, t) {
    if (!this.lamps || !this.lamps.length) return;
    const near = { point: [], spot: [] };
    for (const lamp of this.lamps) {
      const { L, d, col } = lamp;
      // La couleur ne se recalcule que si l'inspecteur vient de la changer (analyser « #rrggbb » à chaque image et pour chaque lampe coûte).
      const hex = decoColor(d) || L.color;
      if (hex !== lamp.hex) { lamp.hex = hex; col.set(hex); for (const m of lamp.mats) m.color.copy(col); }
      const ang = L.spin ? L.spin * t + lamp.phase : 0;
      if (lamp.head) lamp.head.rotation.y = ang;
      lamp.ang = ang;
      const s = d.s || 1, wy = d.y + L.y * s;
      const dx = d.x - pos.x, dy = wy - pos.y, dz = d.z - pos.z, d2 = dx * dx + dy * dy + dz * dz;
      const reach = L.range * s * 1.4;
      if (d2 < reach * reach) near[L.type].push({ lamp, d2, wy, s });
    }
    if (!this.pool) return;
    const assign = (lights, list, spot) => {
      list.sort((a, b) => a.d2 - b.d2);
      lights.forEach((light, i) => {
        const e = list[i];
        if (!e) { light.intensity = 0; return; }
        const { lamp, wy, s } = e, { L, d } = lamp;
        light.position.set(d.x, wy, d.z);
        light.color.copy(lamp.col);
        light.intensity = L.power * s;
        light.distance = L.range * s;
        if (spot) {
          const yaw = (d.ry || 0) + lamp.ang, ct = Math.cos(L.tilt);
          light.angle = L.angle;
          light.target.position.set(d.x - ct * Math.sin(yaw) * 40, wy + Math.sin(L.tilt) * 40, d.z - ct * Math.cos(yaw) * 40);
          light.target.updateMatrixWorld();
        }
      });
    };
    assign(this.pool.points, near.point, false);
    assign(this.pool.spots, near.spot, true);
  }

  // Anime les obstacles et les pièces mobiles au temps t (s, chrono de la course).
  updateMoving(t) {
    for (const o of this.obstacles) o.userData.update(t);
    for (const m of this.movers) {
      const o = this.track.moverOffset(m.tile, t, MOVO);
      if (o.a) {
        // Rotation autour du centre de la pièce : tourne le groupe, puis le replace pour que le pivot reste fixe.
        const c = Math.cos(o.a), sn = Math.sin(o.a);
        m.grp.rotation.y = o.a;
        m.grp.position.set(o.cx - (c * o.cx + sn * o.cz), o.y, o.cz - (-sn * o.cx + c * o.cz));
      } else {
        m.grp.rotation.y = 0;
        m.grp.position.set(o.x, o.y, o.z);
      }
    }
  }

  // Libère les objets dynamiques (tout sauf le maillage statique des tronçons).
  _disposeDynamic() {
    for (const c of [...this.group.children]) {
      if (this.chunkMeshes.has(c)) continue;
      if (c.isGroup) c.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (c.userData.lamp && m.material) m.material.dispose(); });
      if (c.geometry) c.geometry.dispose();
      if (c.userData.own && c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
      this.group.remove(c);
    }
    this.plaques = [];
    this.obstacles = [];
    this.movers = [];
    this.glassGroups = [];
    this.lamps = [];
    this.pool = null;
  }

  // Dalles de verre brisées (voir CarPhysics.broken) : elles disparaissent ; vide = tout est restauré.
  setBroken(set) {
    for (const g of this.glassGroups) g.grp.visible = !(set && set.has(g.tile));
  }

  dispose() {
    this._disposeDynamic();
    for (const ch of this.chunks.values()) this._disposeChunk(ch);
    this.chunks.clear();
    if (this.dimMat) this.dimMat.dispose();
    this.group.removeFromParent();
  }
}

// Maillage isolé d'une pièce (aperçu de l'éditeur).
export function buildTileMesh(tile, material, glowMaterial) {
  const gb = new GeoBuilder();
  const glow = new GeoBuilder();
  buildTileInto(gb, glow, tile, null);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(gb.build(), material));
  if (!glow.empty) g.add(new THREE.Mesh(glow.build(), glowMaterial || material));
  return g;
}
