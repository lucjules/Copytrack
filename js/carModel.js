// Modèle 3D de la voiture (buggy low-poly original), construit par code.
import * as THREE from './vendor/three.module.min.js';

export const CAR_COLORS = ['#ffd23e', '#ff5a5f', '#3ec1ff', '#7cf06b', '#c77dff', '#ff8c42', '#f4f1ea', '#2f3247'];

function extrudeProfile(points, width) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1 });
  g.rotateY(Math.PI / 2);
  g.translate(-width / 2, 0, 0);
  return g;
}

export function createCar(color = CAR_COLORS[0], opts = {}) {
  const ghost = !!opts.ghost;
  const group = new THREE.Group();
  const mk = (params) => (ghost
    ? new THREE.MeshBasicMaterial({ color: opts.ghostColor || '#bfe9ff', transparent: true, opacity: 0.32, depthWrite: false })
    : new THREE.MeshStandardMaterial({ flatShading: true, ...params }));

  const paint = mk({ color, roughness: 0.45, metalness: 0.15 });
  const trim = mk({ color: '#23242f', roughness: 0.8 });
  const glass = mk({ color: '#1b2444', roughness: 0.15, metalness: 0.4 });
  const rubber = mk({ color: '#17171f', roughness: 0.95 });
  const rim = mk({ color: '#c9ccd8', roughness: 0.35, metalness: 0.6 });

  const body = new THREE.Group();
  group.add(body);

  // Caisse principale (profil latéral extrudé). x du profil = avant.
  const lower = new THREE.Mesh(extrudeProfile([
    [-2.15, 0.32], [1.75, 0.28], [2.28, 0.38], [2.22, 0.56], [1.2, 0.8],
    [-1.2, 0.86], [-2.2, 0.8],
  ], 1.95), paint);
  body.add(lower);

  // Bas de caisse sombre
  const skirt = new THREE.Mesh(extrudeProfile([
    [-2.05, 0.22], [1.7, 0.22], [1.75, 0.36], [-2.1, 0.4],
  ], 2.05), trim);
  body.add(skirt);

  // Cockpit
  const cabin = new THREE.Mesh(extrudeProfile([
    [-1.35, 0.84], [1.05, 0.8], [0.2, 1.38], [-0.95, 1.34],
  ], 1.42), glass);
  body.add(cabin);

  // Bande centrale décorative
  const stripe = new THREE.Mesh(extrudeProfile([
    [-2.21, 0.8], [-1.2, 0.861], [1.2, 0.801], [2.23, 0.56], [2.24, 0.6], [1.2, 0.84], [-1.2, 0.9], [-2.21, 0.84],
  ], 0.42), trim);
  body.add(stripe);

  // Aileron arrière
  const wing = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.55), paint);
  plate.position.set(0, 1.28, 1.95);
  plate.rotation.x = -0.12;
  wing.add(plate);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.28), trim);
    post.position.set(s * 0.65, 1.04, 1.95);
    wing.add(post);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.62), trim);
    fin.position.set(s * 1.05, 1.32, 1.95);
    wing.add(fin);
  }
  body.add(wing);

  // Feux
  const lightMat = ghost ? paint : new THREE.MeshBasicMaterial({ color: '#fff4d6', toneMapped: false });
  const tailMat = ghost ? paint : new THREE.MeshBasicMaterial({ color: '#ff3355', toneMapped: false });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.08), lightMat);
    hl.position.set(s * 0.62, 0.5, -2.24);
    hl.rotation.x = -0.35;
    body.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.06), tailMat);
    tl.position.set(s * 0.62, 0.68, 2.18);
    body.add(tl);
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 6), trim);
    ex.rotation.x = Math.PI / 2;
    ex.position.set(s * 0.4, 0.36, 2.2);
    body.add(ex);
  }

  // Flammes de boost
  const flameMat = ghost ? paint : new THREE.MeshBasicMaterial({ color: '#5ff2ff', toneMapped: false, transparent: true, opacity: 0.9 });
  const flames = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1, 6), flameMat);
    f.geometry.translate(0, -0.5, 0);
    f.rotation.x = -Math.PI / 2;
    f.position.set(s * 0.4, 0.36, 2.32);
    f.visible = false;
    body.add(f);
    flames.push(f);
  }

  // Roues
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.4, 8);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.42, 5);
  rimGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-1.02, -1.38], [1.02, -1.38], [-1.02, 1.4], [1.02, 1.4]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.44, z);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(tireGeo, rubber));
    spin.add(new THREE.Mesh(rimGeo, rim));
    pivot.add(spin);
    group.add(pivot);
    wheels.push({ pivot, spin, front: z < 0 });
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !ghost;
      o.receiveShadow = false;
    }
  });

  return {
    group,
    body,
    wheels,
    flames,
    setColor(hex) { if (!ghost) paint.color.set(hex); },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      group.removeFromParent();
    },
  };
}
