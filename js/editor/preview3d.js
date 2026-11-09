// Aperçu 3D d'une pièce perso (atelier « Mes pièces » de l'éditeur, E9) : les formes construites EXACTEMENT comme sur la piste (customDecoBuild.js,
// mêmes matières que le circuit), sur un petit canvas qui tourne lentement ; glisser pour tourner soi-même. Un seul rendu WebGL de plus, libéré
// à la fermeture de l'atelier (dispose).
import * as THREE from '../vendor/three.module.min.js';
import { GeoBuilder } from '../geo.js';
import { buildCustomParts } from '../customDecoBuild.js';
import { createTrackMaterials } from '../trackMesh.js';

export function createPartsPreview(canvas) {
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return null; }      // sans WebGL : les vues 2D suffisent
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.setSize(canvas.width, canvas.height, false);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(6, 12, 8); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0x2a2450 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const mats = createTrackMaterials();
  const holder = new THREE.Group(); scene.add(holder);
  let yaw = 0.6, drag = null, raf = 0, auto = true;
  const set = (parts) => {
    for (const m of [...holder.children]) { m.geometry.dispose(); holder.remove(m); }
    const gb = new GeoBuilder(), glow = new GeoBuilder();
    buildCustomParts(gb, glow, parts);
    if (!gb.empty) holder.add(new THREE.Mesh(gb.build(), mats.solid));
    if (!glow.empty) holder.add(new THREE.Mesh(glow.build(), mats.glow));
  };
  const frame = () => {
    if (auto && !drag) yaw += 0.006;
    cam.position.set(Math.sin(yaw) * 20, 9, Math.cos(yaw) * 20);
    cam.lookAt(0, 3, 0);
    renderer.render(scene, cam);
    raf = requestAnimationFrame(frame);
  };
  const down = (e) => { drag = e.clientX; auto = false; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); };
  const move = (e) => { if (drag == null) return; yaw -= (e.clientX - drag) * 0.012; drag = e.clientX; };
  const up = () => { drag = null; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
  raf = requestAnimationFrame(frame);
  return {
    set,
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      for (const m of [...holder.children]) m.geometry.dispose();
      ground.geometry.dispose(); ground.material.dispose();
      mats.solid.dispose(); mats.glow.dispose(); if (mats.fx) mats.fx.dispose();
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
    },
  };
}
