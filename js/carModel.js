// Modèles 3D de la voiture et de la moto (low-poly, originaux), construits par code.
// Tout est visuel : la physique ne dépend d'aucune dimension de ces modèles.
import * as THREE from './vendor/three.module.min.js';
import { CATALOG, DEFAULT_LOADOUT, sanitizeLoadout } from './cosmetics.js';

const TAU = Math.PI * 2;
// Couleurs de la LED « pulsation » (créées une fois : pas d'allocation ni d'analyse de texte à chaque image).
const PULSE_FROM = new THREE.Color('#36e9ff'), PULSE_TO = new THREE.Color('#ff4fd8');

function extrudeProfile(points, width, offsetX = 0) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1 });
  g.rotateY(Math.PI / 2);
  g.translate(-width / 2 + offsetX, 0, 0);
  return g;
}

// Carrosseries : profil latéral (x = avant du véhicule), cabine, largeur.
const BODIES = {
  buggy: { w: 1.95, lower: [[-2.15, 0.32], [1.75, 0.28], [2.28, 0.38], [2.22, 0.56], [1.2, 0.8], [-1.2, 0.86], [-2.2, 0.8]], cabin: [[-1.35, 0.84], [1.05, 0.8], [0.2, 1.38], [-0.95, 1.34]], cw: 1.42, trunkY: 0.86 },
  sport: { w: 2.0, lower: [[-2.2, 0.3], [1.9, 0.26], [2.42, 0.34], [2.36, 0.5], [1.4, 0.68], [-1.3, 0.78], [-2.25, 0.72]], cabin: [[-1.2, 0.74], [0.9, 0.7], [0.1, 1.2], [-0.9, 1.16]], cw: 1.5, trunkY: 0.76 },
  hatch: { w: 1.9, lower: [[-2.0, 0.34], [1.6, 0.3], [2.1, 0.42], [2.05, 0.7], [1.0, 0.9], [-1.9, 0.95]], cabin: [[-1.85, 0.92], [0.9, 0.9], [0.5, 1.55], [-1.7, 1.6]], cw: 1.6, trunkY: 0.95 },
  muscle: { w: 2.0, lower: [[-2.2, 0.32], [1.8, 0.3], [2.3, 0.4], [2.3, 0.72], [1.3, 0.92], [-1.4, 0.95], [-2.2, 0.9]], cabin: [[-1.4, 0.94], [0.7, 0.92], [0.4, 1.45], [-1.1, 1.4]], cw: 1.5, trunkY: 0.9 },
  rally: { w: 2.1, lower: [[-2.2, 0.4], [1.8, 0.34], [2.3, 0.46], [2.25, 0.72], [1.2, 0.9], [-1.2, 0.94], [-2.25, 0.9]], cabin: [[-1.3, 0.92], [0.9, 0.9], [0.3, 1.5], [-1.0, 1.46]], cw: 1.55, trunkY: 0.9 },
  pickup: { w: 2.1, lower: [[-2.35, 0.4], [1.8, 0.36], [2.3, 0.48], [2.25, 0.82], [0.9, 0.92], [-2.35, 0.95]], cabin: [[-0.5, 0.94], [0.85, 0.92], [0.55, 1.62], [-0.45, 1.64]], cw: 1.6, trunkY: 0.95 },
  formula: { w: 1.5, lower: [[-2.3, 0.25], [2.3, 0.2], [2.7, 0.28], [2.6, 0.4], [0.6, 0.62], [-1.0, 0.8], [-2.3, 0.62]], cabin: [[-0.95, 0.74], [0.2, 0.7], [-0.25, 1.05], [-0.8, 1.04]], cw: 0.8, trunkY: 0.7 },
  wedge: { w: 2.0, lower: [[-2.2, 0.3], [2.5, 0.28], [2.56, 0.34], [1.0, 0.78], [-1.4, 0.86], [-2.2, 0.8]], cabin: [[-1.3, 0.82], [0.6, 0.76], [-0.2, 1.22], [-0.9, 1.2]], cw: 1.45, trunkY: 0.82 },
};

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

export function createCar(loadoutIn = DEFAULT_LOADOUT, opts = {}) {
  const L = typeof loadoutIn === 'string' ? { ...DEFAULT_LOADOUT, color: loadoutIn } : sanitizeLoadout(loadoutIn);
  const ghost = !!opts.ghost;
  const group = new THREE.Group();
  const own = []; // matériaux à libérer
  const mk = (params) => {
    const m = ghost
      ? new THREE.MeshBasicMaterial({ color: opts.ghostColor || '#bfe9ff', transparent: true, opacity: 0.32, depthWrite: false })
      : new THREE.MeshStandardMaterial({ flatShading: true, ...params });
    own.push(m);
    return m;
  };
  const basic = (color, extra = {}) => {
    const m = ghost ? mk({}) : new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });
    if (!ghost) own.push(m);
    return m;
  };

  // Finition : brillante, mate, métallisée ou nacrée (aspect uniquement).
  const FIN = { gloss: [0.45, 0.15], matte: [0.95, 0.0], metal: [0.22, 0.85], pearl: [0.3, 0.35] }[L.finish] || [0.45, 0.15];
  const paint = mk({ color: L.color, roughness: FIN[0], metalness: FIN[1], ...(L.finish === 'pearl' && !ghost ? { emissive: L.color2, emissiveIntensity: 0.12 } : {}) });
  const trim = mk({ color: L.color2, roughness: 0.8 });
  const dark = mk({ color: '#23242f', roughness: 0.8 });
  const glass = mk({ color: '#1b2444', roughness: 0.15, metalness: 0.4 });
  const rubber = mk({ color: '#17171f', roughness: 0.95 });
  const rimMat = mk({ color: L.wheels === 'gold' ? '#f2c14e' : '#c9ccd8', roughness: 0.35, metalness: 0.6 });
  const decalMat = ghost ? mk({}) : new THREE.MeshBasicMaterial({ color: L.decalColor, toneMapped: false, side: THREE.DoubleSide });
  if (!ghost) own.push(decalMat);

  const ledDef = CATALOG.led.find((x) => x.id === L.led) || CATALOG.led[0];
  const ledMat = ledDef.id !== 'none' && !ghost
    ? new THREE.MeshBasicMaterial({ color: ledDef.color || '#ffffff', map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    : null;
  if (ledMat) own.push(ledMat);
  const ledBar = ledMat ? new THREE.MeshBasicMaterial({ color: ledDef.color || '#ffffff', toneMapped: false }) : null;
  if (ledBar) own.push(ledBar);

  // ---------------------------------------------------------------- Voiture
  const carRoot = new THREE.Group();
  const body = new THREE.Group();
  carRoot.add(body);
  const B = BODIES[L.body] || BODIES.buggy;

  body.add(new THREE.Mesh(extrudeProfile(B.lower, B.w), paint));
  body.add(new THREE.Mesh(extrudeProfile([[-2.05, 0.22], [1.7, 0.22], [1.75, 0.36], [-2.1, 0.4]], B.w + 0.1), dark));
  body.add(new THREE.Mesh(extrudeProfile(B.cabin, B.cw), glass));
  // Bande décorative d'origine (couleur secondaire)
  const lowerUp = B.lower.map(([x, y]) => [x, y + 0.012]);
  if (L.decal !== 'stripe' && L.decal !== 'twin') body.add(new THREE.Mesh(extrudeProfile(lowerUp, 0.3), trim));

  // Dessins
  const sideShape = (shape, scale = 1, x0 = 0, y0 = 0) => {
    for (const side of [-1, 1]) {
      const g = new THREE.ShapeGeometry(shape);
      g.scale(scale, scale, 1);
      g.translate(x0, y0, 0);
      g.rotateY(Math.PI / 2);
      g.translate(side * (B.w / 2 + 0.012), 0, 0);
      body.add(new THREE.Mesh(g, decalMat));
    }
  };
  const poly = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  if (L.decal === 'stripe') body.add(new THREE.Mesh(extrudeProfile(lowerUp, 0.5), decalMat));
  else if (L.decal === 'twin') {
    body.add(new THREE.Mesh(extrudeProfile(lowerUp, 0.18, -0.36), decalMat));
    body.add(new THREE.Mesh(extrudeProfile(lowerUp, 0.18, 0.36), decalMat));
  } else if (L.decal === 'flames') {
    const f = poly([[1.9, 0.45], [1.2, 0.62], [1.4, 0.5], [0.6, 0.62], [0.9, 0.46], [0.0, 0.58], [0.4, 0.44], [-0.5, 0.52], [0.0, 0.42], [1.9, 0.42]]);
    sideShape(f);
  } else if (L.decal === 'bolt') {
    sideShape(poly([[0.6, 0.72], [-0.1, 0.5], [0.25, 0.5], [-0.35, 0.34], [0.55, 0.56], [0.2, 0.56]]), 1);
  } else if (L.decal === 'checker') {
    for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) {
      if ((i + j) % 2) continue;
      sideShape(poly([[-1.6 + i * 0.4, 0.42 + j * 0.16], [-1.2 + i * 0.4, 0.42 + j * 0.16], [-1.2 + i * 0.4, 0.58 + j * 0.16], [-1.6 + i * 0.4, 0.58 + j * 0.16]]));
    }
  } else if (L.decal === 'stars') {
    for (const [x, y] of [[1.2, 0.55], [0.1, 0.62], [-0.9, 0.5], [-1.6, 0.62]]) {
      sideShape(poly([[x, y + 0.14], [x + 0.05, y + 0.05], [x + 0.14, y], [x + 0.05, y - 0.05], [x, y - 0.14], [x - 0.05, y - 0.05], [x - 0.14, y], [x - 0.05, y + 0.05]]));
    }
  } else if (L.decal === 'dots') {
    for (const [x, y] of [[1.3, 0.5], [0.5, 0.6], [-0.3, 0.5], [-1.1, 0.6], [-1.8, 0.5]]) {
      const c = [];
      for (let i = 0; i < 8; i++) c.push([x + Math.cos((i / 8) * TAU) * 0.13, y + Math.sin((i / 8) * TAU) * 0.13]);
      sideShape(poly(c));
    }
  }

  // Ailerons
  const rear = (B.lower[0][0] * -1) - 0.2;
  const plate = (w, d, y, z, rx = -0.12, mat = paint) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mat);
    m.position.set(0, y, z); m.rotation.x = rx; body.add(m);
  };
  const post = (x, h, z, y0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.28), dark);
    m.position.set(x, y0 + h / 2, z); body.add(m);
  };
  const fin = (x, y, z, h, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, d), trim);
    m.position.set(x, y, z); body.add(m);
  };
  const ty = B.trunkY;
  switch (L.spoiler) {
    case 'wing': plate(2.1, 0.55, ty + 0.42, rear - 0.25); post(-0.65, 0.45, rear - 0.25, ty - 0.02); post(0.65, 0.45, rear - 0.25, ty - 0.02); fin(-1.05, ty + 0.46, rear - 0.25, 0.3, 0.62); fin(1.05, ty + 0.46, rear - 0.25, 0.3, 0.62); break;
    case 'low': plate(1.9, 0.5, ty + 0.12, rear - 0.1, -0.05); post(-0.7, 0.14, rear - 0.1, ty - 0.02); post(0.7, 0.14, rear - 0.1, ty - 0.02); break;
    case 'duck': { const m = new THREE.Mesh(new THREE.BoxGeometry(B.w, 0.16, 0.5), paint); m.position.set(0, ty + 0.06, rear - 0.05); m.rotation.x = -0.35; body.add(m); break; }
    case 'gt': plate(2.2, 0.5, ty + 0.78, rear - 0.3, -0.1, trim); post(-0.7, 0.8, rear - 0.3, ty - 0.02); post(0.7, 0.8, rear - 0.3, ty - 0.02); fin(-1.1, ty + 0.78, rear - 0.3, 0.4, 0.58); fin(1.1, ty + 0.78, rear - 0.3, 0.4, 0.58); break;
    case 'double': plate(2.1, 0.5, ty + 0.4, rear - 0.25); plate(2.1, 0.5, ty + 0.75, rear - 0.2, -0.2, trim); post(-0.7, 0.8, rear - 0.25, ty - 0.02); post(0.7, 0.8, rear - 0.25, ty - 0.02); fin(-1.05, ty + 0.55, rear - 0.22, 0.6, 0.62); fin(1.05, ty + 0.55, rear - 0.22, 0.6, 0.62); break;
    case 'big': plate(2.5, 0.8, ty + 0.9, rear - 0.35, -0.15, trim); post(-0.9, 0.9, rear - 0.35, ty - 0.02); post(0.9, 0.9, rear - 0.35, ty - 0.02); fin(-1.25, ty + 0.95, rear - 0.35, 0.7, 0.9); fin(1.25, ty + 0.95, rear - 0.35, 0.7, 0.9); break;
    default: break;
  }

  // Ornements
  const roofY = Math.max(...B.cabin.map((p) => p[1]));
  const roofX = B.cabin.reduce((a, p) => a + p[0], 0) / B.cabin.length;
  const roofZ = -roofX;
  const gold = mk({ color: '#f2c14e', roughness: 0.3, metalness: 0.7 });
  const lamp = basic('#ffb02e');
  let beacon = null;
  switch (L.ornament) {
    case 'antenna': case 'flag': {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.8, 5), dark);
      r.position.set(0.7, roofY - 0.1 + 0.9, roofZ + 0.5); r.rotation.z = -0.05; body.add(r);
      if (L.ornament === 'flag') {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), decalMat);
        f.position.set(0.7 - 0.36, roofY + 1.5, roofZ + 0.5); f.rotation.y = Math.PI / 2; body.add(f);
      } else {
        const t = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), lamp);
        t.position.set(0.7, roofY + 1.62, roofZ + 0.5); body.add(t);
      }
      break;
    }
    case 'cone': {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 6), mk({ color: '#ff7a1c', roughness: 0.7 }));
      c.position.set(0, roofY + 0.3, roofZ); body.add(c);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 6), mk({ color: '#f4f1ea', roughness: 0.7 }));
      s.position.set(0, roofY + 0.28, roofZ); body.add(s);
      break;
    }
    case 'fin': {
      const f = new THREE.Mesh(extrudeProfile([[-0.9, roofY - 0.05], [0.7, roofY - 0.05], [-0.7, roofY + 0.75]], 0.07), trim);
      f.position.z = roofZ * 0.0; body.add(f);
      break;
    }
    case 'beacon': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, 8), dark);
      base.position.set(0, roofY + 0.06, roofZ); body.add(base);
      beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 8), lamp);
      beacon.position.set(0, roofY + 0.25, roofZ); body.add(beacon);
      break;
    }
    case 'horns':
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 5), mk({ color: '#f1e6d2', roughness: 0.6 }));
        h.position.set(s * 0.65, B.lower[2][1] + 0.55, -B.lower[2][0] + 0.7); h.rotation.set(-0.5, 0, -s * 0.5); body.add(h);
      }
      break;
    case 'crown':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 4), gold);
        c.position.set(Math.cos(a) * 0.34, roofY + 0.25, roofZ + Math.sin(a) * 0.34); body.add(c);
      }
      { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.12, 12), gold); r.position.set(0, roofY + 0.06, roofZ); body.add(r); }
      break;
    default: break;
  }

  // Feux
  const lightMat = ghost ? paint : new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false });
  const tailMat = ghost ? paint : new THREE.MeshBasicMaterial({ color: '#ff3355', toneMapped: false });
  if (!ghost) own.push(lightMat, tailMat);
  const nose = -B.lower[2][0];
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.08), lightMat);
    hl.position.set(s * 0.62, B.lower[2][1] + 0.1, nose); hl.rotation.x = -0.35; body.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.06), tailMat);
    tl.position.set(s * 0.62, ty - 0.18, rear + 0.0); body.add(tl);
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 6), dark);
    ex.rotation.x = Math.PI / 2; ex.position.set(s * 0.4, 0.36, rear + 0.02); body.add(ex);
  }

  // Flammes de boost
  const flameMat = ghost ? paint : new THREE.MeshBasicMaterial({ color: '#5ff2ff', toneMapped: false, transparent: true, opacity: 0.9 });
  if (!ghost) own.push(flameMat);
  const carFlames = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1, 6), flameMat);
    f.geometry.translate(0, -0.5, 0);
    f.rotation.x = -Math.PI / 2;
    f.position.set(s * 0.4, 0.36, rear + 0.14);
    f.visible = false;
    body.add(f);
    carFlames.push(f);
  }

  // Roues
  const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.4, 8);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(L.wheels === 'disc' ? 0.36 : 0.25, L.wheels === 'disc' ? 0.36 : 0.25, 0.42, L.wheels === 'disc' ? 8 : 5);
  rimGeo.rotateZ(Math.PI / 2);
  const neonMat = L.wheels === 'neon' && !ghost ? basic(ledDef.color || '#36e9ff') : null;
  const carWheels = [];
  for (const [x, z] of [[-1.02, -1.38], [1.02, -1.38], [-1.02, 1.4], [1.02, 1.4]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.44, z);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(tireGeo, rubber));
    spin.add(new THREE.Mesh(rimGeo, rimMat));
    if (L.wheels === 'spoke') {
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.62), rimMat);
        sp.rotation.x = (i / 4) * Math.PI; spin.add(sp);
      }
    }
    if (neonMat) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 4, 12), neonMat);
      r.rotation.y = Math.PI / 2; r.position.x = x > 0 ? 0.21 : -0.21; spin.add(r);
    }
    pivot.add(spin);
    carRoot.add(pivot);
    carWheels.push({ pivot, spin, front: z < 0 });
  }

  // LED sous la voiture
  const leds = [];
  const addUnderglow = (root, w, d, y = 0.07) => {
    if (!ledMat) return;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), ledMat);
    m.position.y = y; m.renderOrder = 2; root.add(m);
    leds.push(m);
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, d * 0.62), ledBar);
      bar.position.set(s * (w * 0.34), y + 0.14, 0); root.add(bar);
    }
  };
  addUnderglow(carRoot, 3.8, 6.2);

  // ---------------------------------------------------------------- Moto
  const bikeRoot = new THREE.Group();
  const bikeBody = new THREE.Group();
  bikeRoot.add(bikeBody);
  const rr = 0.5; // rayon des roues
  const frameBox = (w, h, d, x, y, z, mat, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.x = rx; bikeBody.add(m); return m;
  };
  // Réservoir, carénage, selle, garde-boue, bloc moteur
  bikeBody.add(Object.assign(new THREE.Mesh(extrudeProfile([[-1.3, 0.55], [0.9, 0.55], [1.15, 0.9], [0.3, 1.2], [-0.7, 1.12], [-1.1, 0.8]], 0.55), paint)));
  frameBox(0.5, 0.18, 1.1, 0, 1.18, 0.95, dark);                 // selle
  frameBox(0.46, 0.34, 0.9, 0, 0.45, 0.1, dark);                  // moteur
  frameBox(0.42, 0.14, 0.9, 0, 0.98, 1.65, paint, 0.25);          // garde-boue arrière
  const chopper = L.bike === 'chopper';
  if (chopper) {
    // Chopper : fourche longue et inclinée, guidon haut, selle basse et dosseret.
    frameBox(0.09, 1.7, 0.09, 0.22, 0.95, -1.35, trim, -0.62);
    frameBox(0.09, 1.7, 0.09, -0.22, 0.95, -1.35, trim, -0.62);
    frameBox(0.07, 0.8, 0.07, 0.42, 1.75, -0.7, dark, 0.2);
    frameBox(0.07, 0.8, 0.07, -0.42, 1.75, -0.7, dark, 0.2);
    frameBox(0.95, 0.07, 0.07, 0, 2.12, -0.62, dark);
    frameBox(0.08, 0.9, 0.08, 0, 1.55, 1.75, dark, 0.15);
    frameBox(0.5, 0.3, 0.08, 0, 2.0, 1.85, trim);
  } else {
    frameBox(0.1, 1.0, 0.1, 0.22, 0.75, -1.12, trim, -0.35);        // fourche
    frameBox(0.1, 1.0, 0.1, -0.22, 0.75, -1.12, trim, -0.35);
    frameBox(1.1, 0.07, 0.07, 0, 1.28, -0.95, dark);                // guidon
  }
  const bikeHead = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.2), lightMat);
  bikeHead.position.set(0, 0.98, -1.38); bikeHead.rotation.x = -0.3; bikeBody.add(bikeHead);
  const bikeTail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.06), tailMat);
  bikeTail.position.set(0, 1.0, 2.1); bikeBody.add(bikeTail);
  // Pilote
  const suit = mk({ color: L.color2, roughness: 0.7 });
  frameBox(0.46, 0.7, 0.36, 0, 1.75, 0.55, suit, -0.45);
  frameBox(0.16, 0.7, 0.16, 0.3, 1.5, -0.1, suit, -1.0);
  frameBox(0.16, 0.7, 0.16, -0.3, 1.5, -0.1, suit, -1.0);
  frameBox(0.16, 0.6, 0.16, 0.26, 0.95, 0.7, suit, 0.3);
  frameBox(0.16, 0.6, 0.16, -0.26, 0.95, 0.7, suit, 0.3);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 7, 5), paint);
  helmet.position.set(0, 2.25, 0.2); bikeBody.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), glass);
  visor.position.set(0, 2.25, -0.02); bikeBody.add(visor);
  // Décalque de base de la moto : bande sur le réservoir
  if (L.decal !== 'none') frameBox(0.1, 0.06, 1.5, 0, 1.0, 0.1, decalMat, 0.1).position.y = 1.19;
  // Ornement : gyrophare ou antenne
  if (L.ornament === 'crown') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 4), gold);
      c.position.set(Math.cos(a) * 0.2, 2.6, 0.2 + Math.sin(a) * 0.2); bikeBody.add(c);
    }
  } else if (L.ornament === 'horns') {
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 5), mk({ color: '#f1e6d2' }));
      h.position.set(s * 0.22, 2.55, 0.15); h.rotation.z = -s * 0.5; bikeBody.add(h);
    }
  } else if (L.ornament === 'antenna' || L.ornament === 'flag') {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.4, 5), dark);
    r.position.set(0.3, 1.5, 1.85); bikeBody.add(r);
    const t = L.ornament === 'flag' ? new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.34), decalMat) : new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), lamp);
    t.position.set(0.3, 2.1, L.ornament === 'flag' ? 1.55 : 1.85); t.rotation.y = Math.PI / 2; bikeBody.add(t);
  }
  const bikeFlames = [];
  for (const s of [-0.2, 0.2]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1, 6), flameMat);
    f.geometry.translate(0, -0.5, 0);
    f.rotation.x = -Math.PI / 2;
    f.position.set(s, 0.5, 2.1);
    f.visible = false;
    bikeBody.add(f);
    bikeFlames.push(f);
  }
  const bikeTire = new THREE.CylinderGeometry(rr, rr, 0.3, 10); bikeTire.rotateZ(Math.PI / 2);
  const bikeRim = new THREE.CylinderGeometry(0.3, 0.3, 0.32, 6); bikeRim.rotateZ(Math.PI / 2);
  const bikeWheels = [];
  for (const [z, front] of [[-1.35, true], [1.4, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, rr, z);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(bikeTire, rubber));
    spin.add(new THREE.Mesh(bikeRim, rimMat));
    if (L.wheels === 'spoke') for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.78), rimMat); sp.rotation.x = (i / 3) * Math.PI; spin.add(sp); }
    if (neonMat) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 4, 14), neonMat); r.rotation.y = Math.PI / 2; spin.add(r); }
    pivot.add(spin);
    bikeRoot.add(pivot);
    bikeWheels.push({ pivot, spin, front });
  }
  addUnderglow(bikeRoot, 1.7, 4.2);
  bikeRoot.visible = false;

  // ---------------------------------------------------------------- Bateau
  const boatRoot = new THREE.Group();
  const boatBody = new THREE.Group();
  boatRoot.add(boatBody);
  // Coque (profil latéral, x = avant), pont, pare-brise, moteur hors-bord.
  boatBody.add(new THREE.Mesh(extrudeProfile([[-2.4, 0.25], [1.2, 0.05], [2.7, 0.55], [2.55, 0.95], [-2.4, 0.95]], 2.2), paint));
  boatBody.add(new THREE.Mesh(extrudeProfile([[-2.3, 0.95], [2.4, 0.95], [2.3, 1.05], [-2.3, 1.05]], 2.0), dark));
  boatBody.add(new THREE.Mesh(extrudeProfile([[-0.4, 1.0], [0.9, 1.0], [0.45, 1.5], [-0.2, 1.5]], 1.7), glass));
  boatBody.add(new THREE.Mesh(extrudeProfile([[-2.4, 0.55], [2.6, 0.62], [2.62, 0.72], [-2.4, 0.66]], 2.24), trim));
  {
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.55), dark);
    motor.position.set(0, 1.25, 2.55); boatBody.add(motor);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.3, 0.7), paint);
    cap.position.set(0, 1.78, 2.55); boatBody.add(cap);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.7), dark);
    seat.position.set(0, 1.2, 0.9); boatBody.add(seat);
    const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), mk({ color: L.color2, roughness: 0.7 }));
    pilot.position.set(0, 1.9, 0.85); boatBody.add(pilot);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.36), mk({ color: L.color2, roughness: 0.7 }));
    torso.position.set(0, 1.5, 0.9); boatBody.add(torso);
    const bh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.06), lightMat);
    bh.position.set(0, 0.85, -2.62); boatBody.add(bh);
  }
  if (L.decal !== 'none') {
    const d = new THREE.Mesh(extrudeProfile([[-1.8, 0.7], [2.2, 0.75], [2.1, 0.85], [-1.8, 0.8]], 2.26), decalMat);
    boatBody.add(d);
  }
  const boatFlames = [];
  {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1, 6), flameMat);
    f.geometry.translate(0, -0.5, 0);
    f.rotation.x = -Math.PI / 2;
    f.position.set(0, 0.85, 2.85);
    f.visible = false;
    boatBody.add(f);
    boatFlames.push(f);
  }
  addUnderglow(boatRoot, 2.0, 4.6, 0.2);
  boatRoot.visible = false;

  // ---------------------------------------------------------------- Deltaplane
  // La même voiture, avec une aile delta fixée au-dessus par un mât.
  const wingRoot = new THREE.Group();
  {
    const sail = ghost ? paint : mk({ color: L.color2, roughness: 0.6, side: THREE.DoubleSide });
    const sail2 = ghost ? paint : mk({ color: L.color, roughness: 0.6, side: THREE.DoubleSide });
    const geo = new THREE.BufferGeometry();
    const nose = [0, 3.3, -2.0], lt = [-4.6, 3.0, 1.4], rt = [4.6, 3.0, 1.4], keel = [0, 3.15, 1.0];
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...nose, ...lt, ...keel, ...nose, ...keel, ...rt], 3));
    geo.computeVertexNormals();
    wingRoot.add(new THREE.Mesh(geo, sail));
    const stripe = new THREE.BufferGeometry();
    stripe.setAttribute('position', new THREE.Float32BufferAttribute([0, 3.32, -1.4, -1.2, 3.22, 0.2, 1.2, 3.22, 0.2], 3));
    stripe.computeVertexNormals();
    wingRoot.add(new THREE.Mesh(stripe, sail2));
    const bar = (a, b, r = 0.045) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 5), dark);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
      wingRoot.add(m);
    };
    bar(nose, lt); bar(nose, rt); bar(nose, keel);
    bar([0, 1.4, 0.2], [0, 3.15, 0.2], 0.07);          // mât
    bar([-0.6, 1.4, -0.4], [0, 3.15, 0.2]); bar([0.6, 1.4, -0.4], [0, 3.15, 0.2]);
    bar([-2.4, 3.1, 0.2], [2.4, 3.1, 0.2], 0.035);      // traverse
  }
  wingRoot.visible = false;
  carRoot.add(wingRoot);

  // ---------------------------------------------------------------- Assemblage
  const root = new THREE.Group();
  root.add(carRoot, bikeRoot, boatRoot);
  group.add(root);

  // Anneau de choc de la transformation
  const shockMat = new THREE.MeshBasicMaterial({ color: '#ffd7a0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  own.push(shockMat);
  const shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 24).rotateX(Math.PI / 2), shockMat);
  shock.visible = false; shock.position.y = 0.9;
  group.add(shock);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), shockMat.clone());
  flash.material.opacity = 0; flash.visible = false; flash.position.y = 1;
  own.push(flash.material);
  group.add(flash);

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !ghost && !leds.includes(o);
      o.receiveShadow = false;
    }
  });
  shock.castShadow = flash.castShadow = false;

  const show = (kind) => {
    carRoot.visible = kind === 'car' || kind === 'glider';
    wingRoot.visible = kind === 'glider';
    bikeRoot.visible = kind === 'moto';
    boatRoot.visible = kind === 'boat';
  };
  const api = {
    group,
    vehicle: 'car',
    anim: null,
    ledColor: ledDef.color || '#ffffff',
    get isMoto() { return this.vehicle === 'moto'; },
    get body() { return this.vehicle === 'moto' ? bikeBody : this.vehicle === 'boat' ? boatBody : body; },
    get wheels() { return this.vehicle === 'moto' ? bikeWheels : this.vehicle === 'boat' ? [] : carWheels; },
    get flames() { return this.vehicle === 'moto' ? bikeFlames : this.vehicle === 'boat' ? boatFlames : carFlames; },
    get wing() { return wingRoot; },
    // Change de véhicule : car, moto, boat, glider (avec animation sauf si instant).
    setVehicle(kind, instant = false) {
      kind = kind || 'car';
      if (kind === this.vehicle && !this.anim) return false;
      if (instant) {
        this.vehicle = kind; show(kind); this.anim = null;
        root.rotation.y = 0; root.scale.set(1, 1, 1);
        return true;
      }
      if (this.anim && this.anim.to === kind) return false;
      this.anim = { t: 0, to: kind, swapped: false };
      return true;
    },
    setMoto(on, instant = false) { return this.setVehicle(on ? 'moto' : 'car', instant); },
    update(dt, time = 0) {
      if (ledMat) {
        if (ledDef.rainbow) { ledMat.color.setHSL((time * 0.4) % 1, 1, 0.55); ledBar.color.copy(ledMat.color); }
        else if (ledDef.pulse) {
          const k = 0.5 + 0.5 * Math.sin(time * 5);
          ledMat.color.copy(PULSE_FROM).lerp(PULSE_TO, k); ledBar.color.copy(ledMat.color);
        }
        ledMat.opacity = ledDef.pulse ? 0.65 + 0.35 * Math.sin(time * 5) : 0.9;
      }
      if (beacon) beacon.material.color.setHSL(0.09, 1, 0.45 + 0.2 * Math.sin(time * 14));
      const a = this.anim;
      if (!a) return;
      a.t += dt;
      const T = Math.min(1, a.t / 0.85);
      const k = T < 0.5 ? 1 - T * 2 : (T - 0.5) * 2;       // 1 -> 0 -> 1
      const e = k * k * (3 - 2 * k);
      root.rotation.y = T * TAU * 1.5;
      root.scale.set(0.2 + 0.8 * e, 0.45 + 0.55 * e, 1 + (1 - e) * 0.7);
      if (T >= 0.5 && !a.swapped) {
        a.swapped = true; this.vehicle = a.to; show(a.to);
      }
      shock.visible = flash.visible = true;
      const s = 1 + T * 6;
      shock.scale.set(s, 1, s);
      shockMat.opacity = (1 - T) * 0.9;
      flash.scale.setScalar(1.2 + (1 - Math.abs(T - 0.5) * 2) * 2.2);
      flash.material.opacity = (1 - Math.abs(T - 0.5) * 2) * 0.5;
      if (T >= 1) {
        this.anim = null; shock.visible = flash.visible = false;
        root.rotation.y = 0; root.scale.set(1, 1, 1);
      }
    },
    setColor(hex) { if (!ghost) paint.color.set(hex); },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      for (const m of own) m.dispose();
      group.removeFromParent();
    },
  };
  api.setVehicle(opts.vehicle || (opts.moto ? 'moto' : 'car'), true);
  return api;
}
