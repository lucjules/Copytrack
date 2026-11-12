// Modèles 3D animés des obstacles (voir obstacles.js pour la physique).
// Chaque obstacle est un groupe : une partie fixe et une partie mobile que update(t)
// replace selon le chrono, exactement comme la physique.
import * as THREE from './vendor/three.module.min.js';
import { GeoBuilder } from './geo.js';
import { OBST, obstacleLocal } from './obstacles.js';

const STEEL = '#aeb6c8', DARK = '#2b2f3f', RED = '#ff3b4e', WHITE = '#f4f1ea', YEL = '#ffd23e';

function sphere(gb, cx, cy, cz, r, colA, colB, n = 8, m = 6) {
  const P = (i, j) => {
    const th = (i / n) * Math.PI * 2, ph = (j / m) * Math.PI;
    return [cx + r * Math.sin(ph) * Math.cos(th), cy + r * Math.cos(ph), cz + r * Math.sin(ph) * Math.sin(th)];
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const c = (i + j) % 2 ? colA : colB;
      gb.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), c);
    }
  }
}

function cyl(gb, cx, y0, y1, cz, r, n, col, colTop = col) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const A = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], B = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r];
    gb.quad([B[0], y0, B[1]], [A[0], y0, A[1]], [A[0], y1, A[1]], [B[0], y1, B[1]], i % 2 ? col : colTop);
    gb.tri([cx, y1, cz], [B[0], y1, B[1]], [A[0], y1, A[1]], colTop);
  }
}

function pyramid(gb, cx, y0, cz, w, h, col, tip) {
  const a = [cx - w, y0, cz - w], b = [cx + w, y0, cz - w], c = [cx + w, y0, cz + w], d = [cx - w, y0, cz + w];
  const t = [cx, y0 + h, cz];
  gb.tri(a, b, t, col); gb.tri(b, c, t, tip); gb.tri(c, d, t, col); gb.tri(d, a, t, tip);
}

function meshOf(build, materials) {
  const gb = new GeoBuilder(), glow = new GeoBuilder();
  build(gb, glow);
  const g = new THREE.Group();
  if (!gb.empty) { const m = new THREE.Mesh(gb.build(), materials.solid); m.castShadow = true; g.add(m); }
  if (!glow.empty) g.add(new THREE.Mesh(glow.build(), materials.glow));
  return g;
}

// Crée le groupe 3D d'un obstacle ; group.userData.update(t) l'anime.
export function createObstacleMesh(d, materials) {
  const def = OBST[d.k];
  const root = new THREE.Group();
  root.position.set(d.x, d.y, d.z);
  root.rotation.order = 'YXZ';      // cap d'abord, puis le roulis autour de l'axe z de l'obstacle (phase 3 : sur un mur, au plafond)
  root.rotation.y = d.ry || 0;
  root.rotation.z = -(d.rz || 0);      // (convention de pièces roulées : le haut local devient (sin rz, cos rz, 0))
  root.scale.setScalar(d.s || 1);
  const st = {};
  let moving = null, update = () => {};

  if (def.type === 'spike') {
    root.add(meshOf((gb) => gb.box(-def.hx - 0.3, 0, -def.hz - 0.3, def.hx + 0.3, 0.12, def.hz + 0.3, DARK), materials));
    moving = meshOf((gb) => {
      for (let x = -def.hx + 0.5; x <= def.hx - 0.4; x += 1) {
        for (let z = -def.hz + 0.5; z <= def.hz - 0.4; z += 1) pyramid(gb, x, 0, z, 0.42, def.hy, STEEL, RED);
      }
    }, materials);
    root.add(moving);
    update = (t) => { obstacleLocal(d, t, st); moving.position.y = (st.on - 1) * (def.hy + 0.1); moving.visible = st.on > 0.02; };
  } else if (d.k === 'pendulum') {
    // Portique et boule rayée au bout d'un bras.
    root.add(meshOf((gb, glow) => {
      for (const sx of [-11.5, 11.5]) gb.taper(sx, 0, 0, def.pivot + 1, 1.2, 1.2, 0.8, 0.8, DARK);
      gb.box(-12, def.pivot + 0.6, -0.6, 12, def.pivot + 1.4, 0.6, DARK);
      glow.box(-3, def.pivot + 1.4, -0.65, 3, def.pivot + 1.6, 0.65, RED);
    }, materials));
    moving = meshOf((gb) => {
      gb.box(-0.25, -def.arm, -0.25, 0.25, 0, 0.25, STEEL);
      sphere(gb, 0, -def.arm, 0, def.r, RED, WHITE);
    }, materials);
    moving.position.y = def.pivot;
    root.add(moving);
    update = (t) => { obstacleLocal(d, t, st); moving.rotation.z = st.a; };
  } else if (d.k === 'hammer') {
    root.add(meshOf((gb, glow) => {
      for (const sx of [-11.5, 11.5]) gb.taper(sx, -3.6, 0, def.pivot + def.arm + 2, 1.2, 1.2, 0.8, 0.8, DARK);
      gb.box(-12, def.pivot + def.arm + 1.4, -4.2, 12, def.pivot + def.arm + 2.2, -3, DARK);
      gb.box(-0.4, def.pivot, -4, 0.4, def.pivot + def.arm + 1.6, -3.2, DARK);
      cyl(gb, 0, def.pivot - 0.6, def.pivot + 0.6, -3.2, 0.6, 8, STEEL);
      glow.box(-0.45, def.pivot + def.arm + 1.2, -4.05, 0.45, def.pivot + def.arm + 1.4, -3.15, YEL);
    }, materials));
    moving = meshOf((gb) => {
      gb.box(-0.35, -def.arm, -0.35, 0.35, 0, 0.35, STEEL);
      gb.box(-0.4, -0.4, -3.4, 0.4, 0.4, 0, STEEL);
      gb.box(-1.6, -def.arm - 1.6, -2.2, 1.6, -def.arm + 1.6, 2.2, '#5a3a2a', ['#6b4632', '#6b4632', YEL, YEL, '#4a2e20', '#4a2e20']);
    }, materials);
    moving.position.y = def.pivot;
    root.add(moving);
    update = (t) => { obstacleLocal(d, t, st); moving.rotation.z = st.a; };
  } else if (d.k === 'slider') {
    root.add(meshOf((gb, glow) => {
      for (const z of [-def.hz - 0.4, def.hz + 0.4]) glow.box(-def.travel - def.hx, 0.02, z - 0.15, def.travel + def.hx, 0.08, z + 0.15, YEL);
    }, materials));
    moving = meshOf((gb, glow) => {
      gb.box(-def.hx, 0, -def.hz, def.hx, def.hy * 2, def.hz, '#4a5075', [YEL, YEL, DARK, DARK, '#4a5075', '#4a5075']);
      for (let i = 0; i < 3; i++) glow.box(-def.hx - 0.02, 0.6 + i * 1, -def.hz + 0.3, def.hx + 0.02, 0.9 + i * 1, def.hz - 0.3, i % 2 ? RED : YEL);
    }, materials);
    root.add(moving);
    update = (t) => { obstacleLocal(d, t, st); moving.position.x = st.x; };
  } else if (d.k === 'sweeper') {
    root.add(meshOf((gb, glow) => {
      cyl(gb, 0, 0, def.y * 2 + 0.6, 0, 1.2, 10, DARK, STEEL);
      glow.box(-0.5, def.y * 2 + 0.6, -0.5, 0.5, def.y * 2 + 0.9, 0.5, RED);
    }, materials));
    moving = meshOf((gb, glow) => {
      gb.box(-def.len, def.y - def.r, -def.r, def.len, def.y + def.r, def.r, STEEL, [RED, RED, YEL, DARK, STEEL, STEEL]);
      for (const sx of [-1, 1]) glow.box(sx * def.len - 0.5, def.y - def.r - 0.02, -def.r - 0.02, sx * def.len + 0.5, def.y + def.r + 0.02, def.r + 0.02, YEL);
    }, materials);
    root.add(moving);
    update = (t) => { obstacleLocal(d, t, st); moving.rotation.y = -st.a; };
  } else {
    root.add(meshOf((gb, glow) => {
      cyl(gb, 0, 0, def.h, 0, def.r, 14, '#ff5fd2', '#ffffff');
      cyl(glow, 0, def.h * 0.4, def.h * 0.65, 0, def.r + 0.05, 14, '#ff5fd2', '#ffd0f2');
    }, materials));
  }
  root.userData.update = update;
  update(0);
  return root;
}
