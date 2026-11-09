// Rendu de la voiture personnalisée (lot 10) : pièces libres, livrée (dégradé, motif, dessin 16×16, texte, numéro) et plaque d'immatriculation.
// Les données et leur validation sont dans custom.js ; ici seulement Three.js et un canvas. Visuel uniquement.
import * as THREE from './vendor/three.module.min.js';
import { DRAW, DRAW_PALETTE, hasLivery } from './custom.js';

const FONT = '700 54px "Trebuchet MS", "Arial Black", sans-serif';

// ---------------------------------------------------------------- pièces libres
function partGeometry(shape) {
  switch (shape) {
    case 'sphere': return new THREE.SphereGeometry(0.5, 10, 8);
    case 'cyl': return new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    case 'cone': return new THREE.ConeGeometry(0.5, 1, 12);
    case 'ring': return new THREE.TorusGeometry(0.4, 0.1, 6, 16);
    case 'wedge': {
      const s = new THREE.Shape([new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(0.5, 0.5)]);
      const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      return g;
    }
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

// Ajoute les pièces à `parent` (repère du véhicule : x en travers, y en haut, z vers l'avant POSITIF dans les données, donc -z dans la scène).
// mat(color, glow) fournit le matériau (un matériau fantôme pour les voitures fantômes). Renvoie le nombre de maillages ajoutés.
export function addParts(parent, parts, mat) {
  let n = 0;
  for (const p of parts) {
    const sides = p.m && Math.abs(p.x) > 0.001 ? [1, -1] : [1];
    for (const sd of sides) {
      const m = new THREE.Mesh(partGeometry(p.s), mat(p.c, !!p.g));
      m.scale.set(p.sx, p.sy, p.sz);
      m.position.set(p.x * sd, p.y, -p.z);
      m.rotation.y = -(p.ry * Math.PI / 180) * sd;
      parent.add(m);
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- livrée
const rand = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

function drawPattern(g, kind, color, alpha, W, H) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 6;
  if (kind === 'stripes') for (let x = -H; x < W; x += 44) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.lineTo(x + H + 20, 0); g.lineTo(x + 20, H); g.fill(); }
  else if (kind === 'checks') for (let y = 0; y < H; y += 32) for (let x = 0; x < W; x += 32) if (((x + y) / 32) % 2 === 0) g.fillRect(x, y, 32, 32);
  else if (kind === 'dots') for (let y = 16; y < H; y += 40) for (let x = (y / 40) % 2 ? 36 : 16; x < W; x += 40) { g.beginPath(); g.arc(x, y, 9, 0, 6.3); g.fill(); }
  else if (kind === 'hex') for (let y = 0; y < H + 30; y += 26) for (let x = ((y / 26) % 2) * 22; x < W + 40; x += 44) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20); } g.closePath(); g.stroke(); }
  else if (kind === 'waves') for (let y = 12; y < H; y += 26) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x / 22) * 8); g.stroke(); }
  else if (kind === 'camo') { const r = rand(7); for (let i = 0; i < 46; i++) { g.beginPath(); g.ellipse(r() * W, r() * H, 18 + r() * 40, 10 + r() * 22, r() * 3, 0, 6.3); g.fill(); } }
  g.restore();
}

// Dessine la livrée sur un canvas W×H (le côté gauche du véhicule, vu de l'extérieur : l'avant est à droite).
export function paintLivery(g, custom, W = 512, H = 256) {
  const P = custom.paint;
  g.clearRect(0, 0, W, H);
  if (P.grad) {
    const gr = P.gradDir === 'h' ? g.createLinearGradient(0, 0, W, 0) : g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, P.gradC); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.9; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  }
  if (P.pat !== 'none') drawPattern(g, P.pat, P.patC, P.patA, W, H);
  // dessin 16 × 16, pixels francs (sans lissage)
  if (custom.draw && /[1-9a-f]/.test(custom.draw)) {
    const cell = 9, x0 = Math.round(W * 0.42), y0 = Math.round(H * 0.06);
    for (let y = 0; y < DRAW; y++) for (let x = 0; x < DRAW; x++) {
      const i = parseInt(custom.draw[y * DRAW + x], 16);
      if (!i) continue;
      g.fillStyle = DRAW_PALETTE[i]; g.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
    }
  }
  g.textBaseline = 'middle'; g.textAlign = 'center';
  if (P.num) { g.font = '900 120px "Arial Black", sans-serif'; g.fillStyle = P.numC; g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeText(P.num, W * 0.25, H * 0.42); g.fillText(P.num, W * 0.25, H * 0.42); }
  if (P.text) { g.font = FONT; g.fillStyle = P.textC; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 7; g.strokeText(P.text, W * 0.5, H * 0.86); g.fillText(P.text, W * 0.5, H * 0.86); }
}

const canvasTexture = (w, h, paint) => {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  paint(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
};

// Applique la livrée sur les deux flancs (polygone du bas de caisse, en coordonnées de profil) et la plaque à l'arrière. Renvoie une fonction de libération.
export function addLivery(body, custom, lowerUp, B, reg) {
  const disposers = [];
  const X0 = -2.4, XW = 5.2, Y0 = 0.2, YH = 0.8;
  if (hasLivery(custom)) {
    const tex = canvasTexture(512, 256, (g, w, h) => paintLivery(g, custom, w, h));
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    reg(mat); disposers.push(() => tex.dispose());
    const shape = new THREE.Shape(lowerUp.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const side of [1, -1]) {
      const g = new THREE.ShapeGeometry(shape);
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) - X0) / XW;
        uv.setXY(i, side === 1 ? u : 1 - u, (pos.getY(i) - Y0) / YH);
      }
      g.rotateY(Math.PI / 2);
      g.translate(side * (B.w / 2 + 0.02), 0, 0);
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 1;
      body.add(m);
    }
  }
  if (custom.paint.plate) {
    const tex = canvasTexture(256, 64, (g, w, h) => {
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1d4fb8'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = '#111118'; g.font = '700 40px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(custom.paint.plate, w / 2, h / 2 + 2);
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    reg(mat); disposers.push(() => tex.dispose());
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), mat);
    m.position.set(0, 0.52, -B.lower[0][0] + 0.03);
    body.add(m);
  }
  return () => disposers.forEach((f) => f());
}
