// Qualité graphique : profils (Ultra → Potato), détection automatique (benchmark invisible sur l'animation du menu),
// gestionnaire qui applique un profil au WebGLRenderer et à la scène, et filet de sécurité en course.
//
// Le benchmark ne dessine rien de spécial : il écoute les images de l'animation de fond du menu. Pour ne pas être trompé :
//  - l'écran est cadencé (60, 120, 144 Hz) : on ne mesure donc pas « combien d'images l'écran peut afficher » mais si le profil
//    TENU soutient ~60 i/s ; on teste les profils du plus beau au plus léger et on garde le premier qui y arrive ;
//  - on démarre à un profil plausible d'après la machine (GPU logiciel → Potato, carte gamer → Ultra, mobile → Moyenne…) ;
//  - chaque étape commence par un échauffement ignoré (compilation des shaders, réallocation des ombres, chargement) ;
//  - une image de plus de 250 ms (chargement, onglet masqué, fenêtre déplacée) n'est jamais comptée : elle relance l'étape ;
//  - la mesure se fait sur la MÉDIANE et le 90e centile des durées d'image, pas sur la moyenne (un à-coup ne fausse rien).
import * as THREE from './vendor/three.module.min.js';

export const PROFILE_ORDER = ['ultra', 'high', 'medium', 'low', 'potato'];

// shadow : taille de la carte d'ombres (0 = aucune ombre) ; decor : 'full' | 'reduced' | 'none' (décor autour du circuit ET décorations
// du créateur, hors obstacles) ; mat : matériaux 'standard' | 'lambert' | 'basic' ; sky : 'full' (shader) | 'flat' (aplat de couleur).
export const PROFILES = {
  ultra: {
    name: 'ultra', label: 'Ultra', pixelRatio: { min: 1.5, max: 2 }, shadow: 4096, shadowType: 'pcfsoft', env: 0.55, tone: 'neutral', exposure: 1.05,
    terrainSeg: 190, decor: 'full', mat: 'standard', sky: 'full', hills: 1, fogScale: 1, far: 5000, particles: 1,
  },
  high: {
    name: 'high', label: 'Haute', pixelRatio: { min: 1, max: 2 }, shadow: 2048, shadowType: 'pcfsoft', env: 0, tone: 'none', exposure: 1,
    terrainSeg: 110, decor: 'full', mat: 'standard', sky: 'full', hills: 1, fogScale: 1, far: 5000, particles: 1,
  },
  medium: {
    name: 'medium', label: 'Moyenne', pixelRatio: { min: 0.75, max: 1.25 }, shadow: 1024, shadowType: 'pcf', env: 0, tone: 'none', exposure: 1,
    terrainSeg: 90, decor: 'full', mat: 'standard', sky: 'full', hills: 1, fogScale: 1, far: 5000, particles: 0.8,
  },
  low: {
    name: 'low', label: 'Basse', pixelRatio: { min: 0.6, max: 1 }, shadow: 0, shadowType: 'pcf', env: 0, tone: 'none', exposure: 1,
    terrainSeg: 70, decor: 'reduced', mat: 'lambert', sky: 'full', hills: 1, fogScale: 0.8, far: 3000, particles: 0.5,
  },
  potato: {
    name: 'potato', label: 'Potato', pixelRatio: { min: 0.5, max: 0.65 }, shadow: 0, shadowType: 'pcf', env: 0, tone: 'none', exposure: 1,
    terrainSeg: 24, decor: 'none', mat: 'basic', sky: 'flat', hills: 0, fogScale: 0.45, far: 1400, particles: 0.25,
  },
};

export const PROFILE_LABELS = Object.fromEntries(Object.entries(PROFILES).map(([k, p]) => [k, p.label]));
export const BENCH_VERSION = 1;          // à incrémenter si les profils changent : la détection est refaite

export const profileOf = (name) => PROFILES[name] || PROFILES.high;
export const stepDown = (name) => PROFILE_ORDER[Math.min(PROFILE_ORDER.length - 1, Math.max(0, PROFILE_ORDER.indexOf(name)) + 1)];

// Pixel ratio réel d'un profil sur cet écran (dpr = window.devicePixelRatio).
export const pixelRatioFor = (profile, dpr = 1) => Math.max(profile.pixelRatio.min, Math.min(dpr, profile.pixelRatio.max));

// L'antialiasing se choisit à la création du contexte WebGL (il ne se change plus ensuite) : coupé pour les machines modestes.
export function wantAntialias(settings) {
  const p = settings.quality === 'auto' ? settings.gfxProfile : settings.quality;
  return p !== 'low' && p !== 'potato';
}

// ---- Indices matériels : par quel profil commencer le test ----------------------------------------------------------------
export function hardwareHints(info = {}) {
  const r = String(info.renderer || '');
  const ua = String(info.ua || '');
  const mobile = !!info.touch && (/Android|iPhone|iPad|Mobile/i.test(ua) || (info.width || 9999) < 900);
  const software = /swiftshader|llvmpipe|softpipe|software|microsoft basic|basic render/i.test(r);
  const strong = /nvidia|geforce|rtx|gtx|radeon (rx|pro)|rx \d{3,4}|apple m\d|arc a\d/i.test(r);
  const weak = /intel.*(hd|uhd|graphics)|mali|adreno [1-5]\d\d|powervr|vivante|videocore/i.test(r);
  const cores = info.cores || 4, mem = info.memory || 4;
  let start = 'high';
  if (software) start = 'potato';
  else if (mobile) start = weak || cores <= 4 || mem <= 3 ? 'low' : 'medium';
  else if (strong && cores >= 6) start = 'ultra';
  else if (weak) start = cores <= 2 || mem <= 2 ? 'low' : 'medium';
  else if (cores <= 2 || mem <= 2) start = 'medium';
  return { start, mobile, software, strong, weak };
}

// ---- Statistiques de durées d'image (ms) -------------------------------------------------------------------------------------
export function frameStats(dts) {
  const n = dts.length;
  if (!n) return { n: 0, median: Infinity, p90: Infinity, fps: 0, p90fps: 0 };
  const s = [...dts].sort((a, b) => a - b);
  const q = (f) => s[Math.min(n - 1, Math.floor(f * n))];
  const median = q(0.5), p90 = q(0.9);
  return { n, median, p90, fps: 1000 / median, p90fps: 1000 / p90 };
}

// ---- Benchmark invisible -------------------------------------------------------------------------------------------------------
// Machine à états pure (aucun accès au DOM ni à WebGL) : on lui donne l'horodatage de chaque image de l'animation du menu.
//   apply(profil)  : applique un profil (appelé à chaque étape) ;  done(résultat) : appelé une fois, à la fin.
export class Benchmark {
  constructor({ start = 'high', ladder = PROFILE_ORDER, apply, done, warmup = 1200, firstWarmup = 2200, measure = 2500, minFrames = 30, needFps = 55, needP90 = 40, hitch = 250, maxRestarts = 10 } = {}) {
    this.ladder = ladder;
    this.i = Math.max(0, ladder.indexOf(start));
    this.applyFn = apply || (() => {});
    this.doneFn = done || (() => {});
    Object.assign(this, { warmup, firstWarmup, measure, minFrames, needFps, needP90, hitch, maxRestarts });
    this.steps = [];
    this.finished = false;
    this.result = null;
    this.restarts = 0;
    this._begin(true);
  }

  get profile() { return this.ladder[this.i]; }

  _begin(first = false) {
    this.phase = 'warm';
    this.warmFor = first ? this.firstWarmup : this.warmup;
    this.phaseStart = null;
    this.last = null;
    this.dts = [];
    this.applyFn(this.profile);
  }

  // active : l'écran du menu est visible et rien ne le masque (pas de course, de fenêtre, onglet visible).
  frame(now, active = true) {
    if (this.finished) return;
    if (!active) { this.last = null; this.phaseStart = null; return; }        // en pause : le temps ne compte pas
    if (this.last == null) { this.last = now; if (this.phaseStart == null) this.phaseStart = now; return; }
    const dt = now - this.last;
    this.last = now;
    if (dt > this.hitch && this.restarts < this.maxRestarts) {                // chargement, onglet masqué… : étape relancée
      this.restarts++; this.phase = this.phase === 'measure' ? 'warm' : this.phase; this.phaseStart = now; this.dts = []; this.warmFor = this.warmup;
      return;
    }
    if (this.phase === 'warm') {
      if (now - this.phaseStart >= this.warmFor) { this.phase = 'measure'; this.phaseStart = now; this.dts = []; }
      return;
    }
    this.dts.push(dt);
    const el = now - this.phaseStart;
    if ((el >= this.measure && this.dts.length >= this.minFrames) || el >= this.measure * 3) this._evaluate();
  }

  _evaluate() {
    const st = frameStats(this.dts);
    const pass = st.n >= this.minFrames && st.fps >= this.needFps && st.p90fps >= this.needP90;
    this.steps.push({ profile: this.profile, fps: Math.round(st.fps), p90fps: Math.round(st.p90fps), pass });
    if (pass || this.i >= this.ladder.length - 1) {
      this.finished = true;
      this.result = { profile: this.profile, fps: Math.round(st.fps), steps: this.steps, passed: pass };
      this.doneFn(this.result);
      return;
    }
    this.i++;
    this.restarts = 0;
    this._begin(false);
  }

  // Interrompue (le joueur lance une course) : on se rabat sur un profil plus sûr que celui qui était testé, sans conclure.
  abort() {
    if (this.finished) return null;
    this.finished = true;
    const safe = this.ladder[Math.min(this.ladder.length - 1, this.i + 1)];
    this.applyFn(safe);
    return safe;
  }
}

// ---- Matériaux : conversion Standard → Lambert / Basic ---------------------------------------------------------------------
const convCache = new WeakMap();
function convertMaterial(orig, mode) {
  let e = convCache.get(orig);
  if (!e) { e = {}; convCache.set(orig, e); }
  if (e[mode]) return e[mode];
  const common = { transparent: orig.transparent, opacity: orig.opacity, side: orig.side, depthWrite: orig.depthWrite, fog: orig.fog, vertexColors: orig.vertexColors, map: orig.map };
  let m;
  if (mode === 'lambert') {
    m = new THREE.MeshLambertMaterial({ ...common, color: orig.color.clone(), emissive: orig.emissive.clone(), emissiveIntensity: orig.emissiveIntensity, emissiveMap: orig.emissiveMap, flatShading: orig.flatShading });
  } else {
    m = new THREE.MeshBasicMaterial({ ...common });
  }
  e[mode] = m;
  syncMaterial(orig, m, mode);
  return m;
}
// Recopie les couleurs (qui peuvent changer en cours de route : voiture repeinte, lueurs animées) vers la copie.
function syncMaterial(orig, conv, mode) {
  if (mode === 'lambert') {
    conv.color.copy(orig.color); conv.emissive.copy(orig.emissive); conv.emissiveIntensity = orig.emissiveIntensity;
  } else {
    // Sans éclairage : une pièce lumineuse garde sa lueur comme couleur, les autres leur couleur propre (ou leurs sommets colorés).
    const glow = orig.emissive && orig.emissive.getHex() !== 0 && orig.emissiveIntensity > 0 && !orig.vertexColors;
    if (glow) conv.color.copy(orig.emissive).multiplyScalar(Math.min(1, orig.emissiveIntensity)); else conv.color.copy(orig.color);
  }
}

// Applique le mode de matériaux à tous les maillages de la scène (réversible : l'original est gardé dans userData).
export function swapMaterials(root, mode) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const cur = o.userData._origMat || o.material;
    const arr = Array.isArray(cur);
    const first = arr ? cur[0] : cur;
    if (!first || !first.isMeshStandardMaterial || first.isMeshPhysicalMaterial) return;
    if (mode === 'standard') {
      if (o.userData._origMat) { o.material = o.userData._origMat; delete o.userData._origMat; o.userData._qm = 'standard'; }
      return;
    }
    if (!o.userData._origMat) o.userData._origMat = o.material;
    const swap = (m) => (m.isMeshStandardMaterial ? convertMaterial(m, mode) : m);
    const next = arr ? cur.map(swap) : swap(cur);
    if (o.userData._qm === mode) {
      // déjà converti : on ne fait que suivre les couleurs de l'original
      const pairs = arr ? cur.map((m, i) => [m, next[i]]) : [[cur, next]];
      for (const [a, b] of pairs) if (a !== b && a.isMeshStandardMaterial) syncMaterial(a, b, mode);
      return;
    }
    o.material = next;
    o.userData._qm = mode;
  });
}

const TONE = { none: THREE.NoToneMapping, neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping };

// ---- Gestionnaire --------------------------------------------------------------------------------------------------------------
// Modifie le WebGLRenderer et la scène (Scenery, TrackView) selon un profil. N'a pas besoin de l'application entière :
//   { renderer, scene, camera, scenery, resize(), views() -> TrackView[], setDecoHidden(bool) }.
export class QualityManager {
  constructor(host) {
    this.host = host;
    this.name = '';
    this.profile = null;
    this._sweep = 0;
    this._win = { t: 0, n: 0 };
    this._cool = 0;
  }

  apply(name) {
    const p = profileOf(name);
    const h = this.host, prev = this.profile;
    this.name = p.name; this.profile = p;
    const r = h.renderer;
    r.setPixelRatio(pixelRatioFor(p, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
    r.shadowMap.enabled = p.shadow > 0;
    r.shadowMap.type = p.shadowType === 'pcfsoft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.toneMapping = TONE[p.tone] ?? THREE.NoToneMapping;
    r.toneMappingExposure = p.exposure;
    h.camera.far = p.far;
    h.camera.updateProjectionMatrix();
    h.scenery.renderer = r;
    h.scenery.setQuality(p);
    if (h.particles) h.particles.setScale?.(p.particles);
    // Décorations du créateur (hors obstacles) : masquées en Potato ; les vues déjà construites sont refaites.
    const hide = p.decor === 'none';
    if ((prev ? prev.decor === 'none' : false) !== hide) { h.setDecoHidden?.(hide); for (const v of h.views?.() || []) v.rebuild(); }
    swapMaterials(h.scene, p.mat);
    this._recompile();
    h.resize?.();
    this._win = { t: 0, n: 0 };
    return p;
  }

  _recompile() {
    this.host.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
  }

  // À appeler à chaque image : les maillages créés depuis (nouveau circuit, voiture…) prennent le bon matériau.
  tick() {
    if (!this.profile || this.profile.mat === 'standard') return;
    if ((this._sweep = (this._sweep + 1) % 20) === 0) swapMaterials(this.host.scene, this.profile.mat);
  }

  // Filet de sécurité en course (profil automatique seulement) : si la fenêtre de 5 s tient moins de 42 i/s, on descend d'un profil.
  // dt en secondes. Renvoie le nouveau profil, ou null.
  watch(dt, racing, enabled) {
    if (this._cool > 0) this._cool -= dt;
    if (!enabled || !racing || dt > 0.25 || document.visibilityState === 'hidden') { if (!racing) this._win = { t: 0, n: 0 }; return null; }
    this._win.t += dt; this._win.n++;
    if (this._win.t < 5) return null;
    const fps = this._win.n / this._win.t;
    this._win = { t: 0, n: 0 };
    if (fps >= 42 || this._cool > 0 || this.name === 'potato') return null;
    this._cool = 10;
    const next = stepDown(this.name);
    this.apply(next);
    return next;
  }
}
