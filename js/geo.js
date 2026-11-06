// Petit constructeur de géométrie low-poly (triangles non indexés + couleurs
// par sommet => rendu "facetté" en un seul appel de dessin).
import * as THREE from './vendor/three.module.min.js';

const colorCache = new Map();
function lin(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    const col = new THREE.Color(hex);
    c = [col.r, col.g, col.b];
    colorCache.set(hex, c);
  }
  return c;
}

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.col = [];
    this.m = null; // matrice 4x4 (tableau colonne) appliquée aux points
  }

  setMatrix(m4) {
    this.m = m4 ? m4.elements : null;
    // Matrice miroir (pièce à l'envers) : on inverse l'ordre des sommets pour garder
    // les faces tournées vers l'extérieur (sinon l'éclairage les voit de dos).
    this.flip = !!m4 && m4.determinant() < 0;
  }

  _p(p) {
    const m = this.m;
    if (!m) { this.pos.push(p[0], p[1], p[2]); return; }
    const x = p[0], y = p[1], z = p[2];
    this.pos.push(
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    );
  }

  tri(a, b, c, hex) {
    if (this.flip) { this._p(a); this._p(c); this._p(b); } else { this._p(a); this._p(b); this._p(c); }
    const k = lin(hex);
    this.col.push(k[0], k[1], k[2], k[0], k[1], k[2], k[0], k[1], k[2]);
  }

  // Quadrilatère a,b,c,d dans le sens anti-horaire vu de l'extérieur.
  quad(a, b, c, d, hex) {
    this.tri(a, b, c, hex);
    this.tri(a, c, d, hex);
  }

  // Hexaèdre à partir de 8 coins c[ix + 2*iy + 4*iz].
  hex8(c, hex, faces = null) {
    const col = (i) => (faces ? faces[i] || hex : hex);
    const P = (ix, iy, iz) => c[ix + 2 * iy + 4 * iz];
    // +X, -X, +Y, -Y, +Z, -Z
    this.quad(P(1, 0, 1), P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), col(0));
    this.quad(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0), col(1));
    this.quad(P(0, 1, 1), P(1, 1, 1), P(1, 1, 0), P(0, 1, 0), col(2));
    this.quad(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1), col(3));
    this.quad(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1), col(4));
    this.quad(P(1, 0, 0), P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), col(5));
  }

  box(x0, y0, z0, x1, y1, z1, hex, faces = null) {
    this.hex8([
      [x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1],
    ], hex, faces);
  }

  // Boîte centrée effilée : base (bw, bd) en y0, sommet (tw, td) en y1.
  taper(cx, cz, y0, y1, bw, bd, tw, td, hex, faces = null) {
    const b = [bw / 2, bd / 2], t = [tw / 2, td / 2];
    this.hex8([
      [cx - b[0], y0, cz - b[1]], [cx + b[0], y0, cz - b[1]],
      [cx - t[0], y1, cz - t[1]], [cx + t[0], y1, cz - t[1]],
      [cx - b[0], y0, cz + b[1]], [cx + b[0], y0, cz + b[1]],
      [cx - t[0], y1, cz + t[1]], [cx + t[0], y1, cz + t[1]],
    ], hex, faces);
  }

  get empty() {
    return this.pos.length === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// Variante avec un attribut d'effet par sommet (revêtements animés) :
// fx = (type, abscisse le long de la route, vitesse, écart latéral).
export class FxBuilder extends GeoBuilder {
  constructor() { super(); this.fx = []; }

  fxQuad(a, b, c, d, fa, fb, fc, fd, hex) {
    this.fxTri(a, b, c, fa, fb, fc, hex);
    this.fxTri(a, c, d, fa, fc, fd, hex);
  }

  fxTri(a, b, c, fa, fb, fc, hex) {
    this.tri(a, b, c, hex);
    if (this.flip) this.fx.push(...fa, ...fc, ...fb);
    else this.fx.push(...fa, ...fb, ...fc);
  }

  build() {
    const g = super.build();
    g.setAttribute('fx', new THREE.Float32BufferAttribute(this.fx, 4));
    return g;
  }
}
