// Éditeur de circuits : pièces sur grille, niveaux, rotation, revêtements réglables,
// options (envers, sans bordures, tunnel), décorations libres, vérification, historique.
import * as THREE from './vendor/three.module.min.js';
import { CELL, LEVEL_H, ROAD_TOP, MAX_LEVEL, DIRS, MAX_DECOS } from './constants.js';
import { PIECES, SURFACES, SURFACE_ORDER, surfaceAllowed, flagAllowed } from './pieces.js';
import { Track, DECORS } from './track.js';
import { TrackView, buildTileMesh, SURFACE_STYLE, tint } from './trackMesh.js';
import { buildDecoMesh, safeUrl } from './decos.js';
import { DECO_CATS, DECO_LABELS, DECO_COLORS } from './decoData.js';
import { setEditorDraft, saveMyTrack, newId, formatTime } from './storage.js';

export const PALETTE_ORDER = [
  { id: 'straight', key: 'Digit1', k: '1' },
  { id: 'curve', key: 'Digit2', k: '2' },
  { id: 'bigcurve', key: 'Digit3', k: '3' },
  { id: 'slope', key: 'Digit4', k: '4' },
  { id: 'steep', key: 'Digit5', k: '5' },
  { id: 'loop', key: 'Digit6', k: '6' },
  { id: 'loopL', key: 'Digit7', k: '7' },
  { id: 'loopBig', key: 'KeyU', k: 'U' },
  { id: 'loopBigL', key: '', k: '' },
  { id: 'loopDouble', key: 'KeyI', k: 'I' },
  { id: 'loopDoubleL', key: '', k: '' },
  { id: 'twist', key: 'KeyV', k: 'V' },
  { id: 'ramp90', key: 'KeyL', k: 'L' },
  { id: 'wall', key: 'KeyK', k: 'K' },
  { id: 'crest90', key: 'KeyJ', k: 'J' },
  { id: 'checkpoint', key: 'Digit8', k: '8' },
  { id: 'start', key: 'Digit9', k: '9' },
  { id: 'finish', key: 'Digit0', k: '0' },
  { id: 'platform', key: 'KeyP', k: 'P' },
  { id: 'erase', key: '', k: 'X' },
];

const MIRROR = { loop: 'loopL', loopL: 'loop', loopBig: 'loopBigL', loopBigL: 'loopBig', loopDouble: 'loopDoubleL', loopDoubleL: 'loopDouble' };
const MODS = [
  { id: 'mod:v', flag: 'v', label: 'À l\'envers', hint: 'Route au plafond (sur du plat, la voiture tombe)' },
  { id: 'mod:nb', flag: 'nb', label: 'Sans bordures', hint: 'Plus de rebord : on peut tomber' },
  { id: 'mod:tn', flag: 'tn', label: 'Tunnel', hint: 'Voûte autour de la route' },
];
const SNAPS = [{ id: 0, label: 'Libre' }, { id: 1, label: '1 m' }, { id: 4, label: '4 m' }, { id: 12, label: 'Demi-case' }, { id: CELL, label: 'Case' }];

// Icônes (vue de dessus) des pièces et revêtements.
const svg = (inner) => `<svg viewBox="0 0 48 48">${inner}</svg>`;
const ROAD = '#3c4160', RAIL = '#ff6b57', LINE = '#efe6d6';
const straightBase = (road = ROAD, rail = RAIL) => `<rect x="10" y="2" width="28" height="44" fill="${road}"/><rect x="8" y="2" width="2" height="44" fill="${rail}"/><rect x="38" y="2" width="2" height="44" fill="${rail}"/>`;
const loopIcon = (mir, col, turns = 1, w = 9) => {
  const x0 = mir > 0 ? 14 : 34, x1 = mir > 0 ? 34 : 14;
  const r = turns > 1 ? `M${x0} 46V32a8 8 0 1 ${mir > 0 ? 1 : 0} 16 0a8 8 0 1 ${mir > 0 ? 1 : 0} -16 0` : `M${x0} 46V30a10 10 0 1 ${mir > 0 ? 1 : 0} ${mir > 0 ? 20 : -20} 0V2`;
  void x1;
  return svg(`<path d="${r}" stroke="${ROAD}" stroke-width="${w}" fill="none"/><path d="${r}" stroke="${col}" stroke-width="2" fill="none"/>`);
};
export const ICONS = {
  straight: svg(`${straightBase()}<path d="M24 6v8M24 20v8M24 34v8" stroke="${LINE}" stroke-width="2"/>`),
  curve: svg(`<path d="M10 48 A38 38 0 0 1 48 10 L48 38 A10 10 0 0 0 38 48Z" fill="${ROAD}"/><path d="M10 48 A38 38 0 0 1 48 10" stroke="${RAIL}" stroke-width="2.5" fill="none"/><path d="M38 48 A10 10 0 0 1 48 38" stroke="${RAIL}" stroke-width="2.5" fill="none"/>`),
  bigcurve: svg(`<path d="M4 48 A44 44 0 0 1 48 4 L48 22 A26 26 0 0 0 22 48Z" fill="${ROAD}"/><path d="M4 48 A44 44 0 0 1 48 4" stroke="${RAIL}" stroke-width="2.5" fill="none"/><path d="M22 48 A26 26 0 0 1 48 22" stroke="${RAIL}" stroke-width="2.5" fill="none"/>`),
  slope: svg(`${straightBase()}<path d="M24 36V12M16 20l8-8 8 8" stroke="${LINE}" stroke-width="3" fill="none"/>`),
  steep: svg(`${straightBase()}<path d="M16 26l8-8 8 8M16 38l8-8 8 8" stroke="#ffbf3c" stroke-width="3" fill="none"/>`),
  loop: loopIcon(1, '#36e9ff'),
  loopL: loopIcon(-1, '#ff5fd2'),
  loopBig: loopIcon(1, '#36e9ff', 1, 11),
  loopBigL: loopIcon(-1, '#ff5fd2', 1, 11),
  loopDouble: svg(`<path d="M12 46V34a7 7 0 1 1 14 0a7 7 0 1 1 -14 0 M26 34a7 7 0 1 1 14 0V2" stroke="${ROAD}" stroke-width="7" fill="none"/><path d="M12 46V34a7 7 0 1 1 14 0a7 7 0 1 1 -14 0 M26 34a7 7 0 1 1 14 0V2" stroke="#36e9ff" stroke-width="1.6" fill="none"/>`),
  loopDoubleL: svg(`<path d="M36 46V34a7 7 0 1 0 -14 0a7 7 0 1 0 14 0 M22 34a7 7 0 1 0 -14 0V2" stroke="${ROAD}" stroke-width="7" fill="none"/><path d="M36 46V34a7 7 0 1 0 -14 0a7 7 0 1 0 14 0 M22 34a7 7 0 1 0 -14 0V2" stroke="#ff5fd2" stroke-width="1.6" fill="none"/>`),
  twist: svg(`${straightBase()}<path d="M14 40C14 28 34 28 34 16M34 40C34 28 14 28 14 16" stroke="#ffbf3c" stroke-width="3" fill="none"/>`),
  ramp90: svg(`${straightBase()}<path d="M24 40V28q0-8 8-8M26 20l7-3-3 7" stroke="#36e9ff" stroke-width="3" fill="none"/>`),
  wall: svg(`<rect x="10" y="2" width="28" height="44" fill="#2c3150"/><path d="M24 40V8M17 16l7-8 7 8M17 30l7-8 7 8" stroke="#36e9ff" stroke-width="3" fill="none"/>`),
  crest90: svg(`${straightBase()}<path d="M24 40V26q0-8 8-8M26 18l7 3-3-7" stroke="#ffbf3c" stroke-width="3" fill="none"/>`),
  checkpoint: svg(`${straightBase()}<rect x="4" y="20" width="40" height="8" rx="2" fill="#ffbf3c"/>`),
  start: svg(`${straightBase()}<rect x="4" y="22" width="40" height="6" rx="2" fill="#2fd3b5"/><path d="M24 18V6M18 12l6-6 6 6" stroke="${LINE}" stroke-width="2.5" fill="none"/>`),
  finish: svg(`${straightBase()}<g fill="#f7f2ea"><rect x="10" y="20" width="4" height="4"/><rect x="18" y="20" width="4" height="4"/><rect x="26" y="20" width="4" height="4"/><rect x="34" y="20" width="4" height="4"/><rect x="14" y="24" width="4" height="4"/><rect x="22" y="24" width="4" height="4"/><rect x="30" y="24" width="4" height="4"/></g><rect x="4" y="16" width="40" height="3" fill="#ff4f9a"/>`),
  platform: svg(`<rect x="4" y="4" width="40" height="40" fill="#454a6a" stroke="#ffb84d" stroke-width="2"/><path d="M4 24h40M24 4v40" stroke="#5a6088" stroke-width="2"/>`),
  erase: svg(`<path d="M12 12l24 24M36 12L12 36" stroke="#ff5a6e" stroke-width="5" stroke-linecap="round"/>`),
  'surf:': svg(`${straightBase()}<path d="M24 8v32" stroke="${LINE}" stroke-width="2" stroke-dasharray="5 5"/>`),
  'surf:ice': svg(`${straightBase('#bfe4f2', '#7fd3ff')}<path d="M24 14v20M15 19l18 10M15 29l18-10" stroke="#4aa8d8" stroke-width="2.5"/>`),
  'surf:boost': svg(`${straightBase(ROAD, '#2fe0ff')}<path d="M15 18l9-7 9 7M15 30l9-7 9 7M15 42l9-7 9 7" stroke="#36e9ff" stroke-width="3" fill="none"/>`),
  'surf:bounce': svg(`${straightBase('#4a2d5c', '#ff5fd2')}<path d="M24 12l12 12-12 12-12-12z M24 18l6 6-6 6-6-6z" stroke="#ff5fd2" stroke-width="2.5" fill="none"/>`),
  'surf:sand': svg(`${straightBase('#c9a26b', '#9b6b45')}<path d="M12 14q6-4 12 0t12 0M12 24q6-4 12 0t12 0M12 34q6-4 12 0t12 0" stroke="#8a6440" stroke-width="2" fill="none"/>`),
  'surf:magnet': svg(`${straightBase('#2c2a4a', '#b48cff')}<path d="M16 10v14a8 8 0 0 0 16 0V10" stroke="#b48cff" stroke-width="4" fill="none"/><path d="M13 10h6M29 10h6" stroke="#f3e7d3" stroke-width="4"/>`),
  'surf:mud': svg(`${straightBase('#4a3426', '#6b4a32')}<circle cx="19" cy="16" r="4" fill="#2e1f14"/><circle cx="30" cy="26" r="5" fill="#2e1f14"/><circle cx="20" cy="36" r="3.5" fill="#2e1f14"/>`),
  'surf:drift': svg(`${straightBase('#3a2f3a', '#ff8c42')}<path d="M18 40Q14 26 24 14M30 40Q34 26 24 14" stroke="#ffb84d" stroke-width="2.5" fill="none"/>`),
  'surf:slow': svg(`${straightBase('#3b2a2f', '#ff6b57')}<path d="M12 14h24M12 24h24M12 34h24" stroke="#ffd23e" stroke-width="3" stroke-dasharray="4 3"/>`),
  'surf:wind': svg(`${straightBase('#2c3a52', '#bfefff')}<path d="M14 16h16l4-3M14 26h20M14 36h14l4 3" stroke="#bfefff" stroke-width="2.5" fill="none"/>`),
  'surf:gravity': svg(`${straightBase('#233a3a', '#a7ffe0')}<circle cx="24" cy="24" r="7" stroke="#a7ffe0" stroke-width="2.5" fill="none"/><path d="M24 6v8M20 10l4-4 4 4M24 42v-8M20 38l4 4 4-4" stroke="#a7ffe0" stroke-width="2.2" fill="none"/>`),
  'surf:moto': svg(`${straightBase('#3b2e22', '#ff9f1c')}<circle cx="17" cy="32" r="5" stroke="#ff9f1c" stroke-width="2.5" fill="none"/><circle cx="31" cy="32" r="5" stroke="#ff9f1c" stroke-width="2.5" fill="none"/><path d="M17 32l6-10h7l1 10M26 22l-2-5h-4" stroke="#ff9f1c" stroke-width="2.5" fill="none"/>`),
  'mod:v': svg(`${straightBase('#2b2d44', '#8f7cff')}<path d="M24 12v24M16 28l8 8 8-8" stroke="#ffbf3c" stroke-width="3" fill="none"/><path d="M8 8h32" stroke="#8f7cff" stroke-width="3"/>`),
  'mod:nb': svg(`<rect x="10" y="2" width="28" height="44" fill="${ROAD}"/><path d="M24 6v8M24 20v8M24 34v8" stroke="${LINE}" stroke-width="2"/><path d="M8 2v44M40 2v44" stroke="#ff5a6e" stroke-width="2" stroke-dasharray="3 3"/>`),
  'mod:tn': svg(`<path d="M6 44V22a18 18 0 0 1 36 0v22" stroke="#7fe9ff" stroke-width="3.5" fill="none"/><rect x="14" y="22" width="20" height="24" fill="${ROAD}"/>`),
};

export function pieceLabel(id) {
  if (id === 'erase') return 'Gomme';
  if (id.startsWith('surf:')) return SURFACES[id.slice(5)].label;
  if (id.startsWith('mod:')) return MODS.find((m) => m.id === id).label;
  if (id.startsWith('deco:')) return DECO_LABELS[id.slice(5)];
  return PIECES[id].label;
}

function validTool(t) {
  if (!t) return false;
  return !!PIECES[t] || t === 'erase' || t.startsWith('surf:') || t.startsWith('mod:') || t.startsWith('deco:');
}

export class EditorSession {
  constructor(app, state = {}) {
    this.app = app;
    this.state = state;
    if (state.code) {
      try { this.track = Track.decode(state.code); } catch { this.track = new Track('Mon circuit'); }
    } else {
      this.track = new Track(state.name || 'Mon circuit');
      this.track.decor = state.decor || 'desert';
      this.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    }
    if (state.name) this.track.name = state.name;
    this.entryId = state.entryId || null;
    this.tool = validTool(state.tool) ? state.tool : 'straight';
    this.rot = state.rot || 0;
    this.level = state.level || 0;
    this.tab = 'pieces';
    this.showGrid = true;
    this.autoLevel = null;
    this.surfParam = {};
    this.deco = { cat: 'signs', color: 0, scale: 1, rot: 0, url: '', snap: 0 };

    this.view = new TrackView(this.track, app.materials);
    app.scenery.trackGroup.add(this.view.group);
    this._applyDecor();

    // Aperçus
    this.previewMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.62, depthWrite: false, emissive: '#000000', side: THREE.DoubleSide });
    this.previewGlow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    this.preview = new THREE.Group();
    app.scene.add(this.preview);
    this.previewKey = '';
    this.highlight = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.highlight.visible = false;
    app.scene.add(this.highlight);
    this.marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 1, 6),
      new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.6 }),
    );
    app.scene.add(this.marker);
    this.footprint = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.18, depthWrite: false }),
    );
    app.scene.add(this.footprint);
    this.grid = null;
    this.gridKey = '';

    const cam = state.cam || this._fitCamera();
    this.target = new THREE.Vector3(cam.tx, this.levelY(), cam.tz);
    this.dist = cam.dist; this.yaw = cam.yaw; this.pitch = cam.pitch;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(9, 9);
    this.hover = null;
    this.pointers = new Map();

    this.history = [this._snapshot()];
    this.hIndex = 0;

    this._bind();
    this._buildPalette();
    this._refreshUI();
    app.camera.fov = 55;
    app.camera.up.set(0, 1, 0);
    app.camera.updateProjectionMatrix();
  }

  _fitCamera() {
    const b = this.track.bounds();
    return {
      tx: (b.minX + b.maxX) / 2, tz: (b.minZ + b.maxZ) / 2,
      dist: Math.max(130, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 1.1), yaw: Math.PI * 0.25, pitch: 0.95,
    };
  }

  _applyDecor() {
    this.app.scenery.setTrack(this.track, 'editeur-' + this.track.decor, { decor: false, minHalf: CELL * 40 });
  }

  levelY(l = this.level) {
    return l * LEVEL_H + ROAD_TOP;
  }

  exportState() {
    return {
      code: this.track.encode(),
      entryId: this.entryId,
      name: this.track.name,
      tool: this.tool,
      rot: this.rot,
      level: this.level,
      cam: { tx: this.target.x, tz: this.target.z, dist: this.dist, yaw: this.yaw, pitch: this.pitch },
    };
  }

  // ---------------------------------------------------------------- UI
  _toolButton(parent, id, k, label = pieceLabel(id)) {
    const b = document.createElement('button');
    b.className = 'piece-btn';
    b.dataset.piece = id;
    b.title = label + (k ? ` (${k})` : '');
    const icon = ICONS[id] || `<span class="emo">${id.startsWith('deco:') ? DECO_ICON[id.slice(5)] || '◆' : '◆'}</span>`;
    b.innerHTML = `${k ? `<span class="k">${k}</span>` : ''}${icon}<span>${label}</span>`;
    b.addEventListener('click', () => { this.setTool(id); this.app.audio.click(); });
    parent.appendChild(b);
  }

  _buildPalette() {
    const pal = document.getElementById('ed-palette');
    pal.innerHTML = '';
    const tabs = document.createElement('div');
    tabs.className = 'pal-tabs';
    const panels = {};
    for (const [id, label] of [['pieces', 'Pièces'], ['surf', 'Revêtements'], ['mods', 'Options'], ['decos', 'Décors']]) {
      const b = document.createElement('button');
      b.className = 'pal-tab';
      b.dataset.tab = id;
      b.textContent = label;
      b.addEventListener('click', () => { this.setTab(id); this.app.audio.click(); });
      tabs.appendChild(b);
      const panel = document.createElement('div');
      panel.className = 'pal-panel';
      panel.dataset.panel = id;
      panels[id] = panel;
    }
    pal.appendChild(tabs);

    const rowP = document.createElement('div'); rowP.className = 'pal-row';
    for (const p of PALETTE_ORDER) this._toolButton(rowP, p.id, p.k);
    panels.pieces.appendChild(rowP);

    const rowS = document.createElement('div'); rowS.className = 'pal-row surf';
    for (const s of SURFACE_ORDER) this._toolButton(rowS, 'surf:' + s, '');
    panels.surf.appendChild(rowS);
    const par = document.createElement('div');
    par.className = 'pal-param';
    par.innerHTML = '<span id="ed-param-label">—</span><input type="range" id="ed-param" min="0" max="100" step="1"><b id="ed-param-val"></b><button class="btn" id="ed-param-reset" title="Valeur par défaut">↺</button>';
    panels.surf.appendChild(par);

    const rowM = document.createElement('div'); rowM.className = 'pal-row mods';
    for (const m of MODS) this._toolButton(rowM, m.id, '');
    panels.mods.appendChild(rowM);
    const hint = document.createElement('div');
    hint.className = 'pal-hint';
    hint.textContent = 'Choisis une option puis clique sur une pièce pour l\'activer ou la désactiver. Physique réelle : à l\'envers, rien ne retient la voiture sur une route plate, elle tombe. Seule la courbure d\'un looping, prise assez vite, la plaque contre la route.';
    panels.mods.appendChild(hint);

    const dTop = document.createElement('div');
    dTop.className = 'pal-deco-top';
    dTop.innerHTML = `<select id="ed-deco-cat">${Object.entries(DECO_CATS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('')}</select>
      <div class="swatches" id="ed-deco-colors"></div>
      <label class="inl">Taille <input type="range" id="ed-deco-scale" min="0.3" max="6" step="0.05"><b id="ed-deco-scale-val"></b></label>
      <button class="btn" id="ed-deco-snap" title="Accrochage (N)"></button>
      <input type="text" id="ed-deco-url" placeholder="URL de l'image (https://…)" maxlength="400">`;
    panels.decos.appendChild(dTop);
    const rowD = document.createElement('div'); rowD.className = 'pal-row decos'; rowD.id = 'ed-deco-row';
    panels.decos.appendChild(rowD);
    for (const p of Object.values(panels)) pal.appendChild(p);

    // Réglages des revêtements
    const range = document.getElementById('ed-param');
    range.oninput = () => { this.surfParam[this.tool.slice(5)] = +range.value; this._refreshParam(); };
    document.getElementById('ed-param-reset').onclick = () => { delete this.surfParam[this.tool.slice(5)]; this._refreshParam(); };
    // Réglages des décorations
    const cat = document.getElementById('ed-deco-cat');
    cat.onchange = () => { this.deco.cat = cat.value; this._buildDecoRow(); cat.blur(); };
    const sc = document.getElementById('ed-deco-scale');
    sc.value = this.deco.scale;
    sc.oninput = () => { this.deco.scale = +sc.value; this.previewKey = ''; this._refreshDeco(); };
    document.getElementById('ed-deco-snap').onclick = () => this.cycleSnap();
    const url = document.getElementById('ed-deco-url');
    url.oninput = () => { this.deco.url = url.value.trim(); this.previewKey = ''; };
    const colors = document.getElementById('ed-deco-colors');
    colors.innerHTML = '';
    for (let i = 0; i <= DECO_COLORS.length; i++) {
      const b = document.createElement('button');
      b.className = 'swatch' + (i === this.deco.color ? ' on' : '');
      b.dataset.c = i;
      b.title = i ? DECO_COLORS[i - 1] : 'Couleurs naturelles';
      b.style.background = i ? DECO_COLORS[i - 1] : 'conic-gradient(#ff6b57,#ffbf3c,#7cf06b,#3ec1ff,#c77dff,#ff6b57)';
      b.onclick = () => { this.deco.color = i; this.previewKey = ''; this._refreshDeco(); };
      colors.appendChild(b);
    }
    this._buildDecoRow();

    const name = document.getElementById('ed-name');
    name.value = this.track.name;
    name.oninput = () => { this.track.name = name.value.trim() || 'Sans titre'; this._changed(false); };
    const decor = document.getElementById('ed-decor');
    decor.innerHTML = Object.entries(DECORS).map(([id, d]) => `<option value="${id}">${d.label}</option>`).join('');
    decor.value = this.track.decor;
    decor.onchange = () => {
      this.track.decor = decor.value;
      this._applyDecor();
      this.gridKey = '';
      this._changed(false);
      decor.blur();
    };
    this.setTab(this.tool.startsWith('surf:') ? 'surf' : this.tool.startsWith('mod:') ? 'mods' : this.tool.startsWith('deco:') ? 'decos' : 'pieces');
  }

  _buildDecoRow() {
    const row = document.getElementById('ed-deco-row');
    row.innerHTML = '';
    for (const k of DECO_CATS[this.deco.cat].kinds) this._toolButton(row, 'deco:' + k, '');
    this._refreshUI();
  }

  setTab(id) {
    this.tab = id;
    document.querySelectorAll('#ed-palette .pal-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    document.querySelectorAll('#ed-palette .pal-panel').forEach((p) => { p.hidden = p.dataset.panel !== id; });
  }

  setTool(id) {
    this.tool = id;
    this.previewKey = '';
    if (id.startsWith('surf:')) this.setTab('surf');
    else if (id.startsWith('mod:')) this.setTab('mods');
    else if (id.startsWith('deco:')) {
      this.setTab('decos');
      const kind = id.slice(5);
      const cat = Object.entries(DECO_CATS).find(([, c]) => c.kinds.includes(kind));
      if (cat && cat[0] !== this.deco.cat) { this.deco.cat = cat[0]; document.getElementById('ed-deco-cat').value = cat[0]; this._buildDecoRow(); }
    } else this.setTab('pieces');
    this._refreshUI();
  }

  cyclePiece(d) {
    const ids = PALETTE_ORDER.map((p) => p.id).filter((id) => id !== 'erase');
    const i = ids.indexOf(this.tool);
    this.setTool(ids[(i + d + ids.length) % ids.length] || 'straight');
  }

  cycleSurface() {
    const ids = SURFACE_ORDER.map((s) => 'surf:' + s);
    const i = ids.indexOf(this.tool);
    this.setTool(ids[(i + 1) % ids.length]);
  }

  cycleSnap() {
    const i = SNAPS.findIndex((s) => s.id === this.deco.snap);
    this.deco.snap = SNAPS[(i + 1) % SNAPS.length].id;
    this._refreshDeco();
    this.app.ui.flash(`Accrochage : ${SNAPS.find((s) => s.id === this.deco.snap).label}`, 1.2);
  }

  mirror() {
    if (MIRROR[this.tool]) this.setTool(MIRROR[this.tool]);
  }

  _surfParamValue(s) {
    const S = SURFACES[s];
    return this.surfParam[s] || (S && S.def) || 0;
  }

  _refreshParam() {
    const s = this.tool.startsWith('surf:') ? this.tool.slice(5) : '';
    const S = SURFACES[s];
    const box = document.querySelector('.pal-param');
    if (!box) return;
    box.style.visibility = S && S.def != null ? 'visible' : 'hidden';
    if (!S || S.def == null) return;
    const r = document.getElementById('ed-param');
    r.min = S.min; r.max = S.max;
    r.value = this._surfParamValue(s);
    r.style.accentColor = tint(s, +r.value);
    document.getElementById('ed-param-label').textContent = S.param || 'Intensité';
    document.getElementById('ed-param-val').textContent = s === 'wind' ? (+r.value === 100 ? 'nul' : (+r.value > 100 ? '→ ' : '← ') + Math.abs(+r.value - 100) + ' %') : `${r.value} %`;
    this.previewKey = '';
  }

  _refreshDeco() {
    const k = this.tool.startsWith('deco:') ? this.tool.slice(5) : '';
    document.querySelectorAll('#ed-deco-colors .swatch').forEach((b) => b.classList.toggle('on', +b.dataset.c === this.deco.color));
    const sc = document.getElementById('ed-deco-scale');
    if (sc) sc.value = this.deco.scale;
    const v = document.getElementById('ed-deco-scale-val');
    if (v) v.textContent = '×' + this.deco.scale.toFixed(2);
    const sn = document.getElementById('ed-deco-snap');
    if (sn) sn.textContent = 'Accrochage : ' + SNAPS.find((s) => s.id === this.deco.snap).label;
    const url = document.getElementById('ed-deco-url');
    if (url) url.style.display = k === 'plaque' ? '' : 'none';
  }

  _refreshUI() {
    document.querySelectorAll('#ed-palette .piece-btn').forEach((b) => b.classList.toggle('on', b.dataset.piece === this.tool));
    document.getElementById('ed-level').textContent = `Niv. ${this.level}`;
    const t = this.track;
    const cps = t.count('checkpoint');
    const errs = t.validate();
    const isPiece = !!PIECES[this.tool];
    const detail = isPiece ? ` · ${this.rot * 90}°` : this.tool === 'erase' || this.tool.startsWith('surf:') || this.tool.startsWith('mod:') ? ' · clic sur une pièce' : ` · ${(this.deco.rot * 180 / Math.PI).toFixed(0)}°`;
    const ver = t.verified ? `<span class="ok">✔ Vérifié ${formatTime(t.vt)}</span>` : '<span class="warn">Non vérifié</span> (à finir avant de partager)';
    document.getElementById('ed-status').innerHTML =
      `<b>${pieceLabel(this.tool)}</b>${detail} · niveau ${this.level}<br>` +
      `${t.tiles.length} pièce${t.tiles.length > 1 ? 's' : ''} · ${cps} checkpoint${cps > 1 ? 's' : ''} · ${t.decos.length} déco${t.decos.length > 1 ? 's' : ''}<br>${ver}` +
      (errs.length ? `<br><span class="warn">⚠ ${errs.join(' ')}</span>` : '');
    this._refreshParam();
    this._refreshDeco();
  }

  // ---------------------------------------------------------------- Historique
  _snapshot() {
    return JSON.stringify({
      t: this.track.tiles.map((t) => [t.t, t.x, t.z, t.l, t.r, t.s || '', t.p || 0, t.v, t.nb, t.tn]),
      d: this.track.decos.map((o) => [o.k, o.x, o.y, o.z, o.ry, o.s, o.c, o.u]),
    });
  }

  _restore(snap) {
    const data = JSON.parse(snap);
    const { vt, vh } = this.track;
    this.track.clear();
    this.track.vt = vt; this.track.vh = vh;
    for (const [t, x, z, l, r, s, p, v, nb, tn] of data.t) this.track.add({ t, x, z, l, r, s, p, v, nb, tn });
    for (const [k, x, y, z, ry, sc, c, u] of data.d) this.track.addDeco({ k, x, y, z, ry, s: sc, c, u });
    this._changed(false);
    this.needsRebuild = true;
  }

  _commit() {
    const snap = this._snapshot();
    if (snap === this.history[this.hIndex]) return;
    this.history.length = this.hIndex + 1;
    this.history.push(snap);
    if (this.history.length > 200) this.history.shift();
    this.hIndex = this.history.length - 1;
  }

  undo() {
    if (this.hIndex <= 0) return;
    this.hIndex--;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  }

  redo() {
    if (this.hIndex >= this.history.length - 1) return;
    this.hIndex++;
    this._restore(this.history[this.hIndex]);
    this.app.audio.click();
  }

  _changed(rebuild = true) {
    if (rebuild) this.needsRebuild = true;
    this.previewKey = '';
    this._refreshUI();
    clearTimeout(this._draftT);
    this._draftT = setTimeout(() => setEditorDraft(this.exportState()), 400);
  }

  save() {
    const entry = saveMyTrack({ id: this.entryId || newId(), name: this.track.name, code: this.track.encode() });
    this.entryId = entry.id;
    setEditorDraft(this.exportState());
    this.app.ui.flash('Circuit enregistré dans « Mes circuits »');
  }

  newTrack() {
    this.track.clear();
    this.track.name = 'Mon circuit';
    this.track.add({ t: 'start', x: 0, z: 0, l: 0, r: 0 });
    document.getElementById('ed-name').value = this.track.name;
    this.entryId = null;
    this.level = 0;
    this.target.set(CELL / 2, this.levelY(), CELL / 2);
    this._commit();
    this._changed();
  }

  loadCode(code) {
    const t = Track.decode(code);
    this.track.clear();
    for (const tile of t.tiles) this.track.add(tile);
    for (const d of t.decos) this.track.addDeco(d);
    this.track.name = t.name;
    this.track.decor = t.decor;
    this.track.vt = t.vt; this.track.vh = t.vh;
    document.getElementById('ed-name').value = t.name;
    document.getElementById('ed-decor').value = t.decor;
    this._applyDecor();
    this.entryId = null;
    this.recenter();
    this._commit();
    this._changed();
  }

  recenter() {
    const c = this._fitCamera();
    this.target.set(c.tx, this.levelY(), c.tz);
    this.dist = c.dist;
  }

  toggleTopView() {
    if (this.pitch < 1.4) { this._prevPitch = this.pitch; this.pitch = 1.5; }
    else this.pitch = this._prevPitch || 0.95;
  }

  // ---------------------------------------------------------------- Entrées
  _bind() {
    const el = this.app.renderer.domElement;
    this._h = {
      down: (e) => this._onDown(e),
      move: (e) => this._onMove(e),
      up: (e) => this._onUp(e),
      wheel: (e) => {
        e.preventDefault();
        if (e.shiftKey) {
          const d = (e.deltaY || e.deltaX) < 0 ? 1 : -1;
          const now = performance.now();
          if (now - (this._wheelT || 0) > 90) { this.setLevel(this.level + d); this._wheelT = now; }
          return;
        }
        if (e.altKey && this.tool.startsWith('deco:')) {
          this.deco.scale = Math.max(0.3, Math.min(6, this.deco.scale * (e.deltaY < 0 ? 1.08 : 0.926)));
          this.previewKey = ''; this._refreshDeco();
          return;
        }
        this.dist = Math.max(25, Math.min(700, this.dist * Math.pow(1.0015, e.deltaY)));
      },
      ctx: (e) => e.preventDefault(),
      key: (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
        if (e.key === '?') { e.preventDefault(); this.app.editorHelp(); return; }
        if (!(e.ctrlKey || e.metaKey)) return;
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
        else if (k === 's') { e.preventDefault(); this.save(); }
      },
    };
    el.addEventListener('pointerdown', this._h.down);
    window.addEventListener('pointermove', this._h.move);
    window.addEventListener('pointerup', this._h.up);
    window.addEventListener('pointercancel', this._h.up);
    el.addEventListener('wheel', this._h.wheel, { passive: false });
    el.addEventListener('contextmenu', this._h.ctx);
    window.addEventListener('keydown', this._h.key);
  }

  _setNdc(e) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _onDown(e) {
    this.app.audio.unlock();
    this._setNdc(e);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType, moved: false });
    if (this.pointers.size === 2) this._pinch = null;
    if (e.pointerType === 'mouse' && e.button === 1) e.preventDefault();
    if (e.pointerType === 'mouse' && e.button === 0) {
      this._updateHover();
      if (e.altKey) this._pick();
      else { this.painting = true; this._act(); }
    }
  }

  _onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (e.target === this.app.renderer.domElement || p) this._setNdc(e);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) p.moved = true;

    if (p.type !== 'mouse') {
      if (this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (this._pinch) {
          this.dist = Math.max(25, Math.min(700, this.dist * (this._pinch.d / d)));
          this.yaw -= ang - this._pinch.ang;
          this._pan(dx * 0.5, dy * 0.5);
        }
        this._pinch = { d, ang };
      } else if (p.moved) {
        this._pan(dx, dy);
      }
      return;
    }
    if (p.button === 2 && p.moved) {
      this.yaw -= dx * 0.006;
      this.pitch = Math.max(0.2, Math.min(1.5, this.pitch + dy * 0.005));
    } else if (p.button === 1 && p.moved) {
      this._pan(dx, dy);
    } else if (p.button === 0 && this.painting && !this.tool.startsWith('deco:')) {
      this._updateHover();
      this._act(true);
    }
  }

  _onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this._pinch = null;
    if (p.type === 'mouse') {
      if (p.button === 2 && !p.moved) { this._updateHover(); this._erase(); }
      if (p.button === 1 && !p.moved) { this._updateHover(); this._pick(); }
      if (p.button === 0) {
        this.painting = false;
        this._lastPaint = null;
        this._commit();
      }
    } else if (!p.moved && this.pointers.size === 0) {
      this._setNdc(e);
      this._updateHover();
      this._act();
      this._commit();
    }
  }

  _pan(dx, dy) {
    const k = this.dist * 0.0018;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.target.x += -dx * k * rx + dy * k * fx;
    this.target.z += -dx * k * rz + dy * k * fz;
  }

  // ---------------------------------------------------------------- Actions
  _hoverTile() {
    if (!this.hover) return null;
    const tiles = this.track.tilesAt(this.hover.cx, this.hover.cz);
    if (!tiles.length) return null;
    for (const t of tiles) {
      const [lo, hi] = Track.range(t);
      if (this.level >= lo && this.level <= hi) return t;
    }
    return tiles.reduce((a, b) => (b.l > a.l ? b : a));
  }

  _candidate() {
    if (!this.hover || !PIECES[this.tool]) return null;
    const p = PIECES[this.tool];
    const sz = p.size;
    const ax = sz % 2 === 0 ? Math.round(this.hover.x / CELL - sz / 2) : this.hover.cx - (sz - 1) / 2;
    const az = sz % 2 === 0 ? Math.round(this.hover.z / CELL - sz / 2) : this.hover.cz - (sz - 1) / 2;
    return { t: this.tool, x: ax, z: az, l: this.level, r: this.rot, s: '' };
  }

  _act(painting = false) {
    const t = this.tool;
    if (t === 'erase') { this._erase(painting); return; }
    if (t.startsWith('surf:')) { this._paintSurface(painting); return; }
    if (t.startsWith('mod:')) { this._toggleMod(painting); return; }
    if (t.startsWith('deco:')) { this._placeDeco(); return; }
    const tile = this._candidate();
    if (!tile) return;
    const key = `${tile.x},${tile.z},${tile.l}`;
    if (painting && key === this._lastPaint) return;
    this._lastPaint = key;
    const conflicts = this.track.conflicts(tile);
    if (conflicts.length === 1) {
      const c = conflicts[0];
      if (c.t === tile.t && c.x === tile.x && c.z === tile.z && c.l === tile.l && c.r === tile.r) return;
    }
    for (const c of conflicts) this.track.remove(c);
    if (tile.t === 'start') for (const s of this.track.tiles.filter((x) => x.t === 'start')) this.track.remove(s);
    const added = this.track.add(tile);
    this.app.audio.place();
    this._prepareAutoLevel(added);
    this._changed();
    if (!painting) this._commit();
  }

  // Après une pente, le niveau suit tout seul quand on vise la case suivante.
  _prepareAutoLevel(tile) {
    const p = PIECES[tile.t];
    if (!p.rise) { this.autoLevel = null; return; }
    const [dx, dz] = DIRS[tile.r];
    this.autoLevel = new Map([
      [`${tile.x + dx},${tile.z + dz}`, tile.l + p.rise],
      [`${tile.x - dx},${tile.z - dz}`, tile.l],
    ]);
  }

  _paintSurface(painting) {
    const t = this._hoverTile();
    if (!t) return;
    const s = this.tool.slice(5);
    if (!surfaceAllowed(t.t, s, !!t.v)) {
      if (!painting) { this.app.ui.flash(`${SURFACES[s].label} : incompatible avec « ${PIECES[t.t].label}${t.v ? ' (envers)' : ''} »`); this.app.audio.error(); }
      return;
    }
    if (this.track.setSurface(t, s, SURFACES[s].def != null ? this._surfParamValue(s) : 0)) {
      this.app.audio.place();
      this._changed();
      if (!painting) this._commit();
    }
  }

  _toggleMod(painting) {
    const t = this._hoverTile();
    if (!t) return;
    const key = `${t.x},${t.z},${t.l}`;
    if (painting && key === this._lastPaint) return;
    this._lastPaint = key;
    const flag = MODS.find((m) => m.id === this.tool).flag;
    if (!flagAllowed(t.t, flag, t)) {
      this.app.ui.flash(`${pieceLabel(this.tool)} : impossible sur « ${PIECES[t.t].label} »`);
      this.app.audio.error();
      return;
    }
    if (this.track.toggleFlag(t, flag)) {
      this.app.audio.place();
      this._changed();
      if (!painting) this._commit();
    } else if (flag === 'tn') this.app.ui.flash('Tunnel impossible sur une route à l\'envers');
  }

  _snapPos(x, z) {
    const s = this.deco.snap;
    if (!s) return [x, z];
    const o = s === CELL || s === 12 ? s / 2 : 0;
    return [Math.round((x - o) / s) * s + o, Math.round((z - o) / s) * s + o];
  }

  _decoAt() {
    if (!this.hover) return null;
    const kind = this.tool.slice(5);
    const [x, z] = this._snapPos(this.hover.x, this.hover.z);
    return { k: kind, x, y: this.levelY(), z, ry: this.deco.rot, s: this.deco.scale, c: this.deco.color, u: kind === 'plaque' ? this.deco.url : '' };
  }

  _placeDeco() {
    const d = this._decoAt();
    if (!d) return;
    if (d.k === 'plaque' && !safeUrl(d.u)) {
      this.app.ui.flash('Colle d\'abord une URL d\'image https://… valide.');
      this.app.audio.error();
      return;
    }
    if (!this.track.addDeco(d)) { this.app.ui.flash(`Maximum de ${MAX_DECOS} décorations atteint.`); return; }
    this.app.audio.place();
    this._changed();
    this._commit();
  }

  _nearestDeco(maxD = 8) {
    if (!this.hover) return null;
    let best = null, bd = Infinity;
    for (const d of this.track.decos) {
      const dd = Math.hypot(d.x - this.hover.x, d.z - this.hover.z) - 1.5 * d.s;
      if (dd < bd && dd < maxD) { bd = dd; best = d; }
    }
    return best;
  }

  _erase(painting = false) {
    const decoMode = this.tool.startsWith('deco:');
    const t = decoMode ? null : this._hoverTile();
    if (t) {
      this.track.remove(t);
    } else {
      const d = this._nearestDeco();
      if (!d) return;
      this.track.removeDeco(d);
    }
    this.app.audio.erase();
    this._changed();
    if (!painting) this._commit();
  }

  _pick() {
    if (this.tool.startsWith('deco:')) {
      const d = this._nearestDeco();
      if (d) {
        this.deco.color = d.c; this.deco.scale = d.s; this.deco.rot = d.ry; this.deco.url = d.u || '';
        this.setTool('deco:' + d.k);
        this.app.ui.flash(`Pipette : ${DECO_LABELS[d.k]}`);
        return;
      }
    }
    const t = this._hoverTile();
    if (!t) return;
    this.tool = t.t; this.rot = t.r; this.level = t.l;
    this.autoLevel = null;
    this.previewKey = '';
    this.setTab('pieces');
    this._refreshUI();
    this.app.ui.flash(`Pipette : ${pieceLabel(t.t)}, niveau ${t.l}`);
  }

  rotate(d = 1) {
    if (this.tool.startsWith('deco:')) {
      this.deco.rot = (this.deco.rot + d * Math.PI / 12 + Math.PI * 2) % (Math.PI * 2);
    } else this.rot = (this.rot + d + 4) & 3;
    this.previewKey = '';
    this._refreshUI();
  }

  scaleDeco(f) {
    this.deco.scale = Math.max(0.3, Math.min(6, this.deco.scale * f));
    this.previewKey = '';
    this._refreshDeco();
  }

  setLevel(l, manual = true) {
    const nl = Math.max(0, Math.min(MAX_LEVEL, l));
    if (manual) this.autoLevel = null;
    if (nl === this.level) return;
    this.level = nl;
    this.previewKey = '';
    this._refreshUI();
  }

  test() {
    const errs = this.track.validate();
    if (errs.length) {
      this.app.ui.flash(errs.join(' '));
      this.app.audio.error();
      return;
    }
    this.app.testTrack(this.exportState());
  }

  // ---------------------------------------------------------------- Boucle
  _updateHover() {
    const cam = this.app.camera;
    this.raycaster.setFromCamera(this.ndc, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.levelY());
    const hit = new THREE.Vector3();
    if (Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1 || !this.raycaster.ray.intersectPlane(plane, hit)) {
      this.hover = null;
      return;
    }
    this.hover = { x: hit.x, z: hit.z, cx: Math.floor(hit.x / CELL), cz: Math.floor(hit.z / CELL) };
    if (this.autoLevel) {
      const l = this.autoLevel.get(`${this.hover.cx},${this.hover.cz}`);
      if (l != null && l !== this.level) {
        this.setLevel(l, false);
        this._updateHover();
      }
    }
  }

  _updateGrid() {
    const cx = Math.round(this.target.x / CELL / 8) * 8, cz = Math.round(this.target.z / CELL / 8) * 8;
    const key = `${cx},${cz},${this.level},${this.showGrid},${this.track.decor}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    if (this.grid) { this.grid.geometry.dispose(); this.grid.material.dispose(); this.grid.removeFromParent(); this.grid = null; }
    if (!this.showGrid) return;
    const n = 32;
    const pts = [], cols = [];
    const y = this.levelY() + 0.05;
    const dark = ['polar', 'jungle', 'city'].includes(this.track.decor);
    const c1 = new THREE.Color(dark ? '#5b6f9c' : '#2a1c4a'), c2 = new THREE.Color('#5ff2ff');
    for (let i = -n; i <= n; i++) {
      const c = (cx + i) % 5 === 0 ? c2 : c1;
      pts.push((cx + i) * CELL, y, (cz - n) * CELL, (cx + i) * CELL, y, (cz + n) * CELL);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    for (let j = -n; j <= n; j++) {
      const c = (cz + j) % 5 === 0 ? c2 : c1;
      pts.push((cx - n) * CELL, y, (cz + j) * CELL, (cx + n) * CELL, y, (cz + j) * CELL);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: this.level ? 0.6 : 0.45, depthWrite: false }));
    this.app.scene.add(this.grid);
  }

  _highlightTile(t, color) {
    const s = PIECES[t.t].size;
    const [lo, hi] = Track.range(t);
    const y0 = lo * LEVEL_H - 0.6, y1 = (hi + 1) * LEVEL_H;
    this.highlight.visible = true;
    this.highlight.material.color.set(color);
    this.highlight.position.set((t.x + s / 2) * CELL, (y0 + y1) / 2, (t.z + s / 2) * CELL);
    this.highlight.scale.set(s * CELL + 0.4, y1 - y0, s * CELL + 0.4);
  }

  _clearPreview() {
    for (const c of [...this.preview.children]) { c.traverse((o) => o.geometry && o.geometry.dispose()); this.preview.remove(c); }
  }

  _updatePreview() {
    const cand = this._candidate();
    this.highlight.visible = false;
    if (!this.hover) {
      this.preview.visible = false;
      this.marker.visible = false;
      this.footprint.visible = false;
      return;
    }
    const y = this.levelY();
    this.marker.visible = y > 1;
    this.marker.scale.set(1, y, 1);
    this.marker.position.set((this.hover.cx + 0.5) * CELL, y / 2, (this.hover.cz + 0.5) * CELL);
    this.footprint.visible = true;
    this.footprint.position.set((this.hover.cx + 0.5) * CELL, 0.06, (this.hover.cz + 0.5) * CELL);
    this.footprint.scale.set(CELL, 1, CELL);

    if (this.tool.startsWith('deco:')) {
      const d = this._decoAt();
      const key = `D${d.k},${d.x.toFixed(1)},${d.z.toFixed(1)},${d.y},${d.ry},${d.s},${d.c},${d.u}`;
      if (key !== this.previewKey) {
        this.previewKey = key;
        this._clearPreview();
        this.preview.add(buildDecoMesh(d, this.previewMat, this.previewGlow));
      }
      this.preview.visible = true;
      this.footprint.visible = false;
      return;
    }
    if (!cand) {
      this.preview.visible = false;
      if (this.tool === 'erase') {
        const t = this._hoverTile();
        if (t) this._highlightTile(t, '#ff3b5c');
        else {
          const d = this._nearestDeco();
          if (d) {
            this.highlight.visible = true;
            this.highlight.material.color.set('#ff3b5c');
            this.highlight.position.set(d.x, d.y + 2 * d.s, d.z);
            this.highlight.scale.set(4 * d.s, 4 * d.s, 4 * d.s);
          }
        }
        return;
      }
      const t = this._hoverTile();
      if (t) {
        if (this.tool.startsWith('surf:')) {
          const s = this.tool.slice(5);
          this._highlightTile(t, surfaceAllowed(t.t, s, !!t.v) ? (s ? tint(s, this._surfParamValue(s)) : '#ffffff') : '#ff3b5c');
        } else {
          const m = MODS.find((x) => x.id === this.tool);
          this._highlightTile(t, m && flagAllowed(t.t, m.flag, t) ? '#8f7cff' : '#ff3b5c');
        }
      }
      return;
    }
    const key = `${cand.t},${cand.x},${cand.z},${cand.l},${cand.r},${this.track.version}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    this._clearPreview();
    const conflicts = this.track.conflicts(cand);
    const same = conflicts.length === 1 && ['t', 'x', 'z', 'l', 'r'].every((k) => conflicts[0][k] === cand[k]);
    this.previewMat.emissive.set(conflicts.length && !same ? '#ff2244' : '#000000');
    this.previewMat.emissiveIntensity = 0.45;
    this.preview.add(buildTileMesh(Track.normalize(cand), this.previewMat, this.previewGlow));
    this.preview.visible = !same;
  }

  update(dt) {
    const input = this.app.input;
    if (this.app.ui.modalOpen) return this._render(dt);
    if (input.hit('Escape') || input.padEdges.delete('pause')) { this.app.leaveEditor(); return; }
    const shift = input.down('ShiftLeft', 'ShiftRight');
    if (input.act('ed.rotate')) this.rotate(shift ? -1 : 1);
    if (input.act('ed.levelUp')) this.setLevel(this.level + 1);
    if (input.act('ed.levelDown')) this.setLevel(this.level - 1);
    if (input.act('ed.nextPiece')) this.cyclePiece(shift ? -1 : 1);
    if (input.act('ed.surface')) this.cycleSurface();
    if (input.act('ed.mirror')) this.mirror();
    if (input.act('ed.snap')) this.cycleSnap();
    if (input.act('ed.scaleUp')) this.scaleDeco(1.1);
    if (input.act('ed.scaleDown')) this.scaleDeco(0.9);
    if (input.act('ed.erase')) this.setTool('erase');
    if (input.act('ed.recenter')) this.recenter();
    if (input.act('ed.topView')) this.toggleTopView();
    if (input.act('ed.grid')) { this.showGrid = !this.showGrid; this.app.ui.flash(this.showGrid ? 'Grille affichée' : 'Grille masquée', 1.2); }
    if (input.act('ed.help')) { this.app.editorHelp(); return; }
    if (input.act('ed.test')) { this.test(); return; }
    for (const p of PALETTE_ORDER) if (p.key && input.hit(p.key)) this.setTool(p.id);

    // Déplacement avec les touches de conduite
    if (!input.down('ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight')) {
      const sp = this.dist * 1.1 * dt;
      let mx = 0, mz = 0;
      if (input.held('accelerate')) mz += 1;
      if (input.held('brake')) mz -= 1;
      if (input.held('left')) mx -= 1;
      if (input.held('right')) mx += 1;
      const pad = input.padEditor();
      if (pad) { mx += pad.moveX; mz -= pad.moveZ; this.yaw -= pad.orbit * dt * 2; this.dist = Math.max(25, Math.min(700, this.dist * (1 + pad.zoom * dt * 1.5))); }
      if (mx || mz) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        this.target.x += (fx * mz + rx * mx) * sp;
        this.target.z += (fz * mz + rz * mx) * sp;
      }
      if (pad) this._padCursor(pad, dt);
    }
    this._render(dt);
  }

  // Curseur virtuel piloté à la manette.
  _padCursor(pad, dt) {
    if (pad.cx || pad.cy) {
      this.ndc.x = Math.max(-1, Math.min(1, (this.ndc.x > 5 ? 0 : this.ndc.x) + pad.cx * dt * 1.4));
      this.ndc.y = Math.max(-1, Math.min(1, (this.ndc.y > 5 ? 0 : this.ndc.y) - pad.cy * dt * 1.4));
      this.padCursor = true;
    }
    if (pad.place) { this._updateHover(); this._act(); this._commit(); }
    if (pad.erase) { this._updateHover(); this._erase(); }
    if (pad.pick) { this._updateHover(); this._pick(); }
  }

  _render(dt) {
    if (this.needsRebuild) {
      this.view.rebuild();
      this.needsRebuild = false;
    }
    const ty = this.levelY();
    this.target.y += (ty - this.target.y) * Math.min(1, dt * 8);
    const cam = this.app.camera;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    cam.lookAt(this.target);
    this._updateGrid();
    if (!this.pointers.size || this.painting) this._updateHover();
    this._updatePreview();
    this.app.scenery.update(this.target, cam, Math.min(300, this.dist * 1.4));
  }

  dispose() {
    const el = this.app.renderer.domElement;
    el.removeEventListener('pointerdown', this._h.down);
    window.removeEventListener('pointermove', this._h.move);
    window.removeEventListener('pointerup', this._h.up);
    window.removeEventListener('pointercancel', this._h.up);
    el.removeEventListener('wheel', this._h.wheel);
    el.removeEventListener('contextmenu', this._h.ctx);
    window.removeEventListener('keydown', this._h.key);
    clearTimeout(this._draftT);
    setEditorDraft(this.exportState());
    this.view.dispose();
    for (const o of [this.preview, this.highlight, this.marker, this.footprint, this.grid]) {
      if (!o) continue;
      o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
      o.removeFromParent();
    }
    this.previewMat.dispose();
    this.previewGlow.dispose();
  }
}

const DECO_ICON = {
  sign_left: '⬅', sign_right: '➡', sign_up: '⬆', sign_stop: '⛔', sign_speed: '🅿', sign_warn: '⚠', banner: '🚩',
  cube: '⬛', sphere: '⚪', cylinder: '🛢', cone: '🔺', pyramid: '🔻', arch: '🌉',
  wall: '🧱', wallLow: '▬', roofFlat: '⬜', roofGable: '🏠', dome: '🛖',
  pine: '🌲', palm: '🌴', tree: '🌳', bush: '🌿', rock: '🪨', cactus: '🌵', crystal: '💎', mushroom: '🍄', flower: '🌸',
  plaque: '🖼', shard: '✦',
};
void SURFACE_STYLE;
