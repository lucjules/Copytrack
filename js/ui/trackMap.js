// Mini-carte d'un circuit, vue de dessus : un seul noyau de dessin pour les miniatures des cartes (editorTools.thumbnail) et la grande carte
// zoomable du Race Hub (createTrackMap). Marche pour TOUS les circuits, éditeur compris : elle dessine la ligne centrale de chaque pièce
// (centerlineWorld), pas track.path (qui n'existe que pour les circuits scriptés).
//
//   mapGeometry(track)                 ce qu'il y a à dessiner, en mètres (pur, sans DOM : testé sous Node)
//   fitView(bounds, w, h, pad)         échelle et décalage pour faire tenir le circuit dans w × h pixels
//   drawTrackMap(g, geom, view, opts)  dessine dans un contexte 2D (style 'thumb' : la miniature d'origine, au pixel près ; 'map' : la grande carte)
//   createTrackMap(canvas, track, o)   grande carte interactive : molette, glisser, pincer, double clic, clavier
import { CELL } from '../constants.js';
import { PIECES, SURFACES, forkBranchX, localToWorld, cpKind } from '../pieces.js';
import { centerlineWorld } from '../ribbons.js';
import { isObstacle } from '../obstacles.js';

// Revêtements montrés comme « zones » sur la grande carte (le reste garde la couleur du niveau).
export const ZONE_SURFACES = ['boost', 'ice', 'water', 'boat', 'moto', 'glider', 'bounce', 'magnet', 'drift', 'slow', 'wind', 'gravity', 'flip', 'conveyor', 'spring', 'glass', 'powder', 'reverse', 'cut', 'mud', 'sand'];
const zoneColor = (s) => (s && SURFACES[s] && SURFACES[s].c ? SURFACES[s].c[1] : '');

// ---- Géométrie (pure) ---------------------------------------------------------------------------------------------------------------
export function mapGeometry(track) {
  const bounds = track.bounds();
  const maxL = Math.max(1, ...track.tiles.map((t) => t.l));
  const sorted = [...track.tiles].sort((a, c) => a.l - c.l);       // les niveaux bas d'abord : un pont passe par-dessus
  const items = [];
  const markers = { start: null, finish: null, checkpoints: [], movers: [], obstacles: [] };
  const zones = new Set();
  for (const t of sorted) {
    const P = PIECES[t.t];
    const center = { x: (t.x + P.size / 2) * CELL, z: (t.z + P.size / 2) * CELL };
    if (P.kind === 'ring') {
      items.push({ type: 'ring', x: (t.x + 0.5) * CELL, z: (t.z + 0.5) * CELL, cp: !!cpKind(t), tile: t });
      if (cpKind(t)) markers.checkpoints.push({ ...center, tile: t, ring: true });
      continue;
    }
    if (P.kind === 'area') { items.push({ type: 'area', x: t.x * CELL, z: t.z * CELL, size: CELL, tile: t }); continue; }
    let lines;
    if (P.kind === 'fork') {
      const half = P.size * CELL / 2;
      lines = [0, 1].map((br) => Array.from({ length: 9 }, (_, i) => {
        const tt = i / 8;
        const p = localToWorld(t, forkBranchX(P, tt, br), half - 2 * half * tt);
        return [p.x, 0, p.z];
      }));
    } else lines = [centerlineWorld(t, 6)];
    const surf = [t.s || '', P.kind === 'fork' ? (t.s2 === '-' ? '' : t.s2 || t.s || '') : t.s || ''];
    for (const s of surf) if (ZONE_SURFACES.includes(s)) zones.add(s);
    items.push({ type: 'line', lines, k: t.l / maxL, tile: t, special: P.special || '', cp: !!cpKind(t), surf });
    if (P.special === 'start') markers.start = { ...center, tile: t };
    else if (P.special === 'finish') markers.finish = { ...center, tile: t };
    if (cpKind(t)) markers.checkpoints.push({ ...center, tile: t, ring: false });
    if (t.mv) markers.movers.push({ ...center, size: P.size * CELL, tile: t });
  }
  for (const d of track.decos) if (isObstacle(d.k)) markers.obstacles.push({ x: d.x, z: d.z, k: d.k });
  numberCheckpoints(markers.checkpoints, track.path);
  return { bounds, maxL, items, markers, zones: [...zones] };
}

// Numéros des checkpoints : seulement quand l'ordre est connu (circuits scriptés : leur ligne centrale track.path). Les checkpoints se prennent
// dans n'importe quel ordre (raceLogic.js) : sans ligne centrale, aucun numéro plutôt qu'un numéro inventé.
function numberCheckpoints(cps, path) {
  if (!path || path.length < 2 || !cps.length) return;
  for (const c of cps) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < path.length; i++) { const dx = path[i][0] - c.x, dz = path[i][2] - c.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    c.at = best;
  }
  [...cps].sort((a, b) => a.at - b.at).forEach((c, i) => { c.n = i + 1; });
}

export function fitView(b, w, h, pad = 6) {
  const sx = (w - 2 * pad) / Math.max(1, b.maxX - b.minX), sz = (h - 2 * pad) / Math.max(1, b.maxZ - b.minZ);
  const s = Math.min(sx, sz);
  return { s, ox: (w - (b.maxX - b.minX) * s) / 2, oz: (h - (b.maxZ - b.minZ) * s) / 2, minX: b.minX, minZ: b.minZ, w, h };
}

// ---- Dessin -------------------------------------------------------------------------------------------------------------------------
const levelColor = (k) => `hsl(${250 - k * 200}, 70%, ${55 + k * 15}%)`;

// Style 'thumb' : exactement la miniature d'avant ce module (mêmes passes, mêmes couleurs, mêmes épaisseurs). Style 'map' : couleurs des zones,
// repères (départ, arrivée, checkpoints, pièces mobiles, obstacles), épaisseurs bornées pour rester lisible de près comme de loin.
export function drawTrackMap(g, geom, view, { style = 'thumb', bg = '#16122b', zones = true, markers = true } = {}) {
  const { s, ox, oz, minX, minZ } = view;
  const X = (x) => ox + (x - minX) * s, Z = (z) => oz + (z - minZ) * s;
  const map = style === 'map';
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, view.w, view.h); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  const wShadow = map ? Math.max(5, Math.min(18 * s + 2, 60)) : Math.max(5, 18 * s + 2);
  const wRoad = map ? Math.max(3.2, Math.min(18 * s, 56)) : Math.max(3.2, 18 * s);
  for (const pass of [0, 1]) {
    for (const it of geom.items) {
      if (it.type === 'ring') {
        if (pass) { g.strokeStyle = it.cp ? '#ffbf3c' : '#36e9ff'; g.lineWidth = map ? Math.max(1.5, 3 * s) : 1.5; g.beginPath(); g.arc(X(it.x), Z(it.z), map ? Math.max(3, 6 * s) : 3, 0, 7); g.stroke(); }
        continue;
      }
      if (it.type === 'area') {
        if (!pass) { g.fillStyle = '#4d5276'; g.fillRect(X(it.x), Z(it.z), it.size * s, it.size * s); }
        continue;
      }
      it.lines.forEach((pts, br) => {
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[2])) : g.moveTo(X(p[0]), Z(p[2]))));
        if (!pass) { g.strokeStyle = '#0b0918'; g.lineWidth = wShadow; }
        else {
          const sf = map ? it.surf[br] : it.tile.s;
          g.strokeStyle = sf === 'water' ? '#3fa7ff' : it.special === 'start' ? '#2fd3b5' : it.special === 'finish' ? '#ff4f9a' : it.cp ? '#ffbf3c'
            : map && zones && zoneColor(sf) ? zoneColor(sf) : levelColor(it.k);
          g.lineWidth = wRoad;
        }
        g.stroke();
      });
    }
  }
  if (map && markers) drawMarkers(g, geom.markers, X, Z, s);
}

function dot(g, x, y, r, fill, stroke = '#0b0918') {
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = stroke; g.stroke();
}

function drawMarkers(g, M, X, Z, s) {
  const r = Math.max(7, Math.min(14, 10 * s));
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const m of M.movers) {
    const half = (m.size / 2) * s;
    g.setLineDash([4, 3]); g.lineWidth = 2; g.strokeStyle = '#ff7ad9';
    g.strokeRect(X(m.x) - half, Z(m.z) - half, half * 2, half * 2);
    g.setLineDash([]);
  }
  for (const o of M.obstacles) {
    const x = X(o.x), y = Z(o.z), k = Math.max(3, Math.min(7, 4 * s));
    g.lineWidth = 2.5; g.strokeStyle = '#ff3b3b';
    g.beginPath(); g.moveTo(x - k, y - k); g.lineTo(x + k, y + k); g.moveTo(x + k, y - k); g.lineTo(x - k, y + k); g.stroke();
  }
  for (const c of M.checkpoints) {
    const x = X(c.x), y = Z(c.z);
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
    g.fillStyle = '#ffbf3c'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#0b0918'; g.stroke();
    if (c.n) { g.fillStyle = '#0b0918'; g.font = `700 ${Math.round(r)}px "Chakra Petch", sans-serif`; g.fillText(String(c.n), x, y + 0.5); }
  }
  if (M.finish) { dot(g, X(M.finish.x), Z(M.finish.z), r, '#ff4f9a'); g.fillStyle = '#0b0918'; g.font = `700 ${Math.round(r)}px sans-serif`; g.fillText('■', X(M.finish.x), Z(M.finish.z) + 0.5); }
  if (M.start) { dot(g, X(M.start.x), Z(M.start.z), r, '#2fd3b5'); g.fillStyle = '#0b0918'; g.font = `700 ${Math.round(r)}px sans-serif`; g.fillText('▶', X(M.start.x) + 1, Z(M.start.z) + 0.5); }
}

// Calques par-dessus la carte (trajectoires du Replay Theater, points) : { pts: [[x, z], …], color, width, dash } ou { x, z, color, r, label }.
function drawOverlays(g, list, X, Z) {
  for (const o of list) {
    if (o.pts && o.pts.length > 1) {
      g.beginPath();
      o.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1]))));
      g.setLineDash(o.dash || []); g.lineWidth = o.width || 2; g.strokeStyle = o.color || '#ffffff'; g.stroke(); g.setLineDash([]);
    } else if (Number.isFinite(o.x)) {
      dot(g, X(o.x), Z(o.z), o.r || 5, o.color || '#ffffff');
      if (o.label) { g.fillStyle = '#ffffff'; g.font = '700 11px sans-serif'; g.textAlign = 'left'; g.fillText(o.label, X(o.x) + (o.r || 5) + 3, Z(o.z)); }
    }
  }
}

// ---- Grande carte interactive -------------------------------------------------------------------------------------------------------
export const MAP_ZOOM_MIN = 1, MAP_ZOOM_MAX = 12;

export function createTrackMap(canvas, track, { zones = true, markers = true, bg = '#16122b' } = {}) {
  const geom = mapGeometry(track);
  const g = canvas.getContext('2d');
  let zoom = 1, cx = 0, cz = 0, overlays = [], cssW = 0, cssH = 0, base = null;
  const center = () => { const b = geom.bounds; cx = (b.minX + b.maxX) / 2; cz = (b.minZ + b.maxZ) / 2; };
  center();
  // Vue courante : celle qui fait tenir le circuit, agrandie de `zoom` autour du point (cx, cz).
  const view = () => {
    const s = base.s * zoom;
    return { s, ox: cssW / 2 - (cx - geom.bounds.minX) * s, oz: cssH / 2 - (cz - geom.bounds.minZ) * s, minX: geom.bounds.minX, minZ: geom.bounds.minZ, w: cssW, h: cssH };
  };
  function draw() {
    if (!cssW || !cssH) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = view();
    drawTrackMap(g, geom, v, { style: 'map', bg, zones, markers });
    if (overlays.length) drawOverlays(g, overlays, (x) => v.ox + (x - v.minX) * v.s, (z) => v.oz + (z - v.minZ) * v.s);
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.round(r.width)); cssH = Math.max(1, Math.round(r.height));
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    base = fitView(geom.bounds, cssW, cssH, 24);
    draw();
  }
  // Zoom autour d'un point de l'écran (px, py en pixels CSS) : ce point reste sous le curseur.
  function zoomAt(f, px = cssW / 2, py = cssH / 2) {
    const v = view();
    const wx = v.minX + (px - v.ox) / v.s, wz = v.minZ + (py - v.oz) / v.s;
    zoom = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, zoom * f));
    const s = base.s * zoom;
    cx = wx - (px - cssW / 2) / s; cz = wz - (py - cssH / 2) / s;
    if (zoom === 1) center();
    draw();
  }
  const pan = (dx, dy) => { const s = base.s * zoom; cx -= dx / s; cz -= dy / s; draw(); };
  const fit = () => { zoom = 1; center(); draw(); };

  const pts = new Map();
  let pinch = 0;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onWheel = (e) => { e.preventDefault(); const [x, y] = local(e); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, x, y); };
  const onDown = (e) => { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } };
  const onMove = (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), cur = local(e);
    pts.set(e.pointerId, cur);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0 && d > 0) zoomAt(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pinch = d;
    } else if (zoom > 1) pan(cur[0] - prev[0], cur[1] - prev[1]);
  };
  const onUp = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  const onKey = (e) => {
    const k = e.key;
    if (k === '+' || k === '=') zoomAt(1.25);
    else if (k === '-' || k === '_') zoomAt(1 / 1.25);
    else if (k === '0') fit();
    else if (zoom > 1 && k === 'ArrowLeft') pan(40, 0);
    else if (zoom > 1 && k === 'ArrowRight') pan(-40, 0);
    else if (zoom > 1 && k === 'ArrowUp') pan(0, 40);
    else if (zoom > 1 && k === 'ArrowDown') pan(0, -40);
    else return;
    e.preventDefault(); e.stopPropagation();
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('dblclick', fit);
  canvas.addEventListener('keydown', onKey);
  canvas.style.touchAction = 'none';
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);
  resize();
  return {
    geom,
    get zoom() { return zoom; },
    redraw: draw, resize, fit,
    zoomBy: (f) => zoomAt(f),
    setOverlays(list) { overlays = Array.isArray(list) ? list : []; draw(); },
    dispose() {
      if (ro) ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('dblclick', fit);
      canvas.removeEventListener('keydown', onKey);
    },
  };
}
