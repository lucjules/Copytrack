// Banc d'essai du rendu (audit, phase 0) : dessine des pièces avec le VRAI moteur du jeu (TrackView, Scenery, profils de qualité), sans menus ni course,
// et renvoie des images prises sous des angles fixes. Piloté par tools/audit-rendu/captures.mjs (Chromium sans écran).
import * as THREE from '../../js/vendor/three.module.min.js';
import { Track } from '../../js/track.js';
import { TrackView, createTrackMaterials } from '../../js/trackMesh.js';
import { Scenery } from '../../js/scenery.js';
import { QualityManager } from '../../js/quality.js';
import { renderOptions } from '../../js/renderOptions.js';

const canvas = document.getElementById('c');
const realNow = () => window.__realNow();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 5000);
const materials = createTrackMaterials();
const scenery = new Scenery(scene, 'high');
let view = null;
const quality = new QualityManager({
  renderer, scene, camera, scenery, particles: null, resize: () => {}, views: () => (view ? [view] : []),
  setDecoHidden: (v) => { renderOptions.hideDecos = !!v; }, setLights: (b) => { renderOptions.lightBudget = b || { point: 0, spot: 0 }; },
});
quality.apply('high');
renderer.setPixelRatio(1);

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

window.banc = {
  // Pose un circuit (liste de pièces au format du jeu) dans un décor ; renvoie sa boîte englobante (pièces seules, sans le terrain).
  load(tiles, { decor = 'desert', ambiance = null, quality: q = 'high', seed = 'banc', decos = [] } = {}) {
    const t0 = realNow();
    if (view) { scenery.trackGroup.remove(view.group); view.dispose(); view = null; }
    if (q !== quality.name) quality.apply(q);
    renderer.setPixelRatio(1);
    const track = new Track('Banc', tiles);
    track.decor = decor;
    if (ambiance) Object.assign(track.ambiance, ambiance);
    for (const d of decos) track.addDeco(d);
    view = new TrackView(track, materials);
    scenery.trackGroup.add(view.group);
    scenery.setTrack(track, seed, { decor: true });
    const box = new THREE.Box3().setFromObject(view.group);
    return { min: box.min.toArray(), max: box.max.toArray(), ms: realNow() - t0 };
  },
  // Une image : œil, cible, champ de vision, taille, instant (ms, pour les revêtements animés et les pièces mobiles).
  shoot({ eye, at, fov = 50, w = 480, h = 270, t = 0, q = 0.86 }) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = fov; camera.updateProjectionMatrix();
    camera.position.copy(V(eye)); camera.lookAt(V(at));
    // Une demi-seconde jouée avant la photo (météo qui s'estompe sous un abri, cycle du jour) : 6 pas de 100 ms jusqu'à l'instant t.
    for (let k = 5; k >= 0; k--) { window.__T = t - k * 100; scenery.update(V(at), camera, 120); }
    if (view) { view.updateMoving(t / 1000); view.updateLights(camera.position, t / 1000); }
    renderer.render(scene, camera);
    return canvas.toDataURL('image/jpeg', q);
  },
  info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
  // Coût d'une modification dans l'éditeur : on change le revêtement d'une pièce au milieu du circuit et on reconstruit (ms, tronçons refaits).
  rebuildCost() {
    if (!view || !view.track.tiles.length) return null;
    const tile = view.track.tiles[Math.floor(view.track.tiles.length / 2)], before = view.chunkBuilds;
    const old = tile.s;
    tile.s = old === 'ice' ? '' : 'ice'; view.track.version++;
    const t0 = realNow(); view.rebuild(); const ms = realNow() - t0;
    tile.s = old; view.track.version++; view.rebuild();
    return { ms, chunks: view.chunkBuilds - before - 0 };
  },
};
window.bancReady = true;
