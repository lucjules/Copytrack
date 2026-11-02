// Outils de l'éditeur (v1.5) : sélection de zone et presse-papiers, vérificateur de
// circuit, miniatures vues de dessus. Aucun rendu 3D ici : seulement des données.
import { CELL, LEVEL_H, MAX_LEVEL } from './constants.js';
import { PIECES, forkBranchX, localToWorld, baseY } from './pieces.js';
import { Track } from './track.js';
import { centerlineWorld } from './ribbons.js';

// ---- Sélection -----------------------------------------------------------------
export function normRect(a, b) {
  return { x0: Math.min(a.cx, b.cx), z0: Math.min(a.cz, b.cz), x1: Math.max(a.cx, b.cx), z1: Math.max(a.cz, b.cz) };
}

const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

// Pièces entièrement contenues dans le rectangle (toutes hauteurs).
export function tilesInRect(track, r) {
  return track.tiles.filter((t) => Track.cellsOf(t).every(([x, z]) => inRect(r, x, z)));
}

export function decosInRect(track, r) {
  return track.decos.filter((d) => inRect(r, Math.floor(d.x / CELL), Math.floor(d.z / CELL)));
}

// Copie : coordonnées relatives au coin du rectangle, niveaux relatifs au plus bas.
export function copyRect(track, r) {
  const tiles = tilesInRect(track, r);
  const decos = decosInRect(track, r);
  if (!tiles.length && !decos.length) return null;
  const baseL = tiles.length ? Math.min(...tiles.map((t) => t.l)) : 0;
  return {
    w: r.x1 - r.x0 + 1, h: r.z1 - r.z0 + 1,
    tiles: tiles.map((t) => ({ ...t, x: t.x - r.x0, z: t.z - r.z0, l: t.l - baseL })),
    decos: decos.map((d) => ({ ...d, x: d.x - r.x0 * CELL, z: d.z - r.z0 * CELL, y: d.y - baseL * LEVEL_H })),
  };
}

// Rotation d'un quart de tour (le nord devient l'est), puis recalage sur (0, 0).
export function rotateClip(clip) {
  const tiles = clip.tiles.map((t) => {
    const s = PIECES[t.t].size;
    return { ...t, x: -t.z - s, z: t.x, r: (t.r + 1) & 3 };
  });
  const decos = clip.decos.map((d) => ({ ...d, x: -d.z, z: d.x, ry: (d.ry || 0) - Math.PI / 2 }));
  const mx = Math.min(...tiles.map((t) => t.x), ...decos.map((d) => Math.floor(d.x / CELL)));
  const mz = Math.min(...tiles.map((t) => t.z), ...decos.map((d) => Math.floor(d.z / CELL)));
  return {
    w: clip.h, h: clip.w,
    tiles: tiles.map((t) => ({ ...t, x: t.x - mx, z: t.z - mz })),
    decos: decos.map((d) => ({ ...d, x: d.x - mx * CELL, z: d.z - mz * CELL })),
  };
}

// Pièces du presse-papiers placées en (cx, cz) au niveau donné.
export function placedClip(clip, cx, cz, level) {
  return {
    tiles: clip.tiles.map((t) => ({ ...t, x: t.x + cx, z: t.z + cz, l: t.l + level })),
    decos: clip.decos.map((d) => ({ ...d, x: d.x + cx * CELL, z: d.z + cz * CELL, y: d.y + level * LEVEL_H })),
  };
}

// Collage : remplace ce qui gêne. Un seul départ par circuit.
export function pasteClip(track, clip, cx, cz, level) {
  const P = placedClip(clip, cx, cz, level);
  let skipped = 0, added = 0;
  const hasStart = !!track.startTile;
  for (const t of P.tiles) {
    if (t.l < 0 || t.l > MAX_LEVEL || (t.t === 'start' && hasStart)) { skipped++; continue; }
    for (const c of track.conflicts(Track.normalize(t))) track.remove(c);
    track.add(t);
    added++;
  }
  for (const d of P.decos) if (track.addDeco(d)) added++;
  return { added, skipped };
}

// Monte / descend un groupe de pièces (et décorations). Annule tout si ça coince.
export function shiftLevel(track, tiles, decos, d) {
  if (tiles.some((t) => t.l + d < 0 || t.l + d > MAX_LEVEL)) return false;
  const moved = tiles.map((t) => ({ ...t, l: t.l + d }));
  for (const t of tiles) track.remove(t);
  const blocked = moved.some((t) => track.conflicts(Track.normalize(t)).length);
  if (blocked) { for (const t of tiles) track.add(t); return false; }
  for (const t of moved) track.add(t);
  for (const o of decos) { o.y += d * LEVEL_H; }
  if (decos.length) track.version++;
  return true;
}

// ---- Vérificateur ----------------------------------------------------------------
// Extrémités d'une pièce : position, hauteur, direction sortante.
function endpoints(tile) {
  const P = PIECES[tile.t];
  if (P.kind === 'ring' || P.kind === 'area') return [];
  if (P.kind === 'fork') {
    const half = P.size * (CELL / 2), y = baseY(tile);
    const mk = (branch, t, out) => {
      const lx = forkBranchX(P, t, branch), lz = half - 2 * half * t;
      const w = localToWorld(tile, lx, lz);
      const d = localToWorld(tile, lx, lz + (out ? -1 : 1));
      return { x: w.x, y, z: w.z, dx: d.x - w.x, dy: 0, dz: d.z - w.z, tile };
    };
    return [mk(0, 0, false), mk(0, 1, true), mk(1, 1, true)];
  }
  const pts = centerlineWorld(tile, 6);
  if (pts.length < 2) return [];
  const a = pts[0], a2 = pts[1], b = pts[pts.length - 1], b2 = pts[pts.length - 2];
  // Direction sortante en 3D (un mur vertical sort vers le haut).
  const dir = (p, q) => {
    const v = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const l = Math.hypot(...v) || 1;
    return v.map((c) => c / l);
  };
  const [ax, ay, az] = dir(a, a2), [bx, by, bz] = dir(b, b2);
  return [
    { x: a[0], y: a[1], z: a[2], dx: ax, dy: ay, dz: az, tile, entry: true },
    { x: b[0], y: b[1], z: b[2], dx: bx, dy: by, dz: bz, tile, exit: true },
  ];
}

function platformAt(track, x, z, y) {
  for (const t of track.tilesAt(Math.floor(x / CELL), Math.floor(z / CELL))) {
    if (PIECES[t.t].kind === 'area' && Math.abs(baseY(t) - y) < 1.2) return t;
  }
  return null;
}

export function checkTrack(track) {
  const issues = [];
  const eps = [];
  for (const t of track.tiles) for (const e of endpoints(t)) eps.push(e);
  // Union-find pour la connexité.
  const parent = new Map(track.tiles.map((t) => [t, t]));
  const find = (t) => { while (parent.get(t) !== t) t = parent.get(t); return t; };
  const join = (a, b) => parent.set(find(a), find(b));
  const free = [];
  for (const e of eps) {
    let ok = false;
    for (const f of eps) {
      if (f.tile === e.tile) continue;
      if (Math.hypot(e.x - f.x, e.y - f.y, e.z - f.z) < 2 && e.dx * f.dx + e.dy * f.dy + e.dz * f.dz < -0.5) { ok = true; join(e.tile, f.tile); }
    }
    const pl = platformAt(track, e.x + e.dx * 2, e.z + e.dz * 2, e.y);
    if (pl) { ok = true; join(e.tile, pl); }
    if (!ok) free.push(e);
  }
  // Plateformes voisines : reliées entre elles.
  for (const t of track.tiles) {
    if (PIECES[t.t].kind !== 'area') continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = platformAt(track, (t.x + dx + 0.5) * CELL, (t.z + dz + 0.5) * CELL, baseY(t));
      if (n) join(t, n);
    }
  }
  const glider = track.tiles.some((t) => t.s === 'glider');
  // Gravité réduite : les sauts portent plus loin.
  const lowG = Math.min(1, ...track.tiles.filter((t) => t.s === 'gravity').map((t) => (t.p || 40) / 100));
  const maxJump = (glider ? 14 : 9) / Math.max(0.35, lowG);
  for (const e of free) {
    const sp = PIECES[e.tile.t].special;
    if ((sp === 'start' && e.entry) || (sp === 'finish' && e.exit)) continue;
    // Une extrémité libre peut être un saut : on cherche un point d'arrivée en face.
    let land = null, dist = 0;
    const hl = Math.hypot(e.dx, e.dz);
    if (hl < 0.3) { issues.push({ tile: e.tile, level: 'error', msg: `${PIECES[e.tile.t].label} : une extrémité n'est reliée à rien.` }); continue; }
    const ex = e.dx / hl, ez = e.dz / hl;
    for (const f of free) {
      if (f === e || f.tile === e.tile) continue;
      const fl = Math.hypot(f.dx, f.dz) || 1;
      if (ex * f.dx / fl + ez * f.dz / fl > -0.7) continue;
      const vx = f.x - e.x, vz = f.z - e.z;
      const along = vx * ex + vz * ez, side = Math.abs(vx * ez - vz * ex);
      if (along < 1 || along > CELL * maxJump || side > 5) continue;
      if (f.y > e.y + LEVEL_H * 1.2) continue;
      if (!land || along < dist) { land = f; dist = along; }
    }
    if (land) {
      join(e.tile, land.tile);
      const cells = Math.round(dist / CELL);
      const ramp = ['steep', 'slope', 'gentle', 'crest90'].includes(e.tile.t) || e.tile.s === 'bounce' || e.tile.s === 'boost';
      if (cells >= 6 / Math.max(0.35, lowG) && !glider) issues.push({ tile: e.tile, level: 'warn', msg: `Saut de ${cells} cases : très long sans deltaplane.` });
      else if (!ramp && cells >= 2 && land.y >= e.y - 1) issues.push({ tile: e.tile, level: 'warn', msg: `Saut de ${cells} cases sans tremplin : la voiture risque de tomber.` });
      if (land.y > e.y + 0.6) issues.push({ tile: land.tile, level: 'warn', msg: 'Arrivée de saut plus haute que le départ.' });
      // Les éventuels anneaux sur le trajet sont « sur la route ».
      for (const t of track.tiles) {
        if (PIECES[t.t].kind !== 'ring') continue;
        const cx = (t.x + 0.5) * CELL - e.x, cz = (t.z + 0.5) * CELL - e.z;
        const along = cx * ex + cz * ez, side = Math.abs(cx * ez - cz * ex);
        if (along > 0 && along < dist && side < CELL / 2) join(t, e.tile);
      }
    } else {
      issues.push({ tile: e.tile, level: 'error', msg: `${PIECES[e.tile.t].label} : une extrémité n'est reliée à rien.` });
    }
  }
  const start = track.startTile;
  if (start) {
    const root = find(start);
    for (const t of track.tiles) {
      const sp = PIECES[t.t].special;
      if ((sp === 'checkpoint' || sp === 'finish') && find(t) !== root) {
        issues.push({ tile: t, level: 'error', msg: `${PIECES[t.t].label} inaccessible depuis le départ.` });
      }
    }
  }
  for (const e of track.validate()) issues.push({ tile: null, level: 'error', msg: e });
  return issues;
}

// ---- Miniature vue de dessus ----------------------------------------------------
const thumbCache = new Map();
export function thumbnail(track, key, w = 168, h = 104) {
  if (key && thumbCache.has(key)) return thumbCache.get(key);
  if (typeof document === 'undefined') return '';
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#16122b'; g.fillRect(0, 0, w, h);
  const b = track.bounds();
  const sx = (w - 12) / Math.max(1, b.maxX - b.minX), sz = (h - 12) / Math.max(1, b.maxZ - b.minZ);
  const s = Math.min(sx, sz);
  const ox = (w - (b.maxX - b.minX) * s) / 2, oz = (h - (b.maxZ - b.minZ) * s) / 2;
  const X = (x) => ox + (x - b.minX) * s, Z = (z) => oz + (z - b.minZ) * s;
  const maxL = Math.max(1, ...track.tiles.map((t) => t.l));
  const sorted = [...track.tiles].sort((a, c) => a.l - c.l);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (const t of sorted) {
      const P = PIECES[t.t];
      if (P.kind === 'ring') {
        if (pass) { g.strokeStyle = P.special ? '#ffbf3c' : '#36e9ff'; g.lineWidth = 1.5; g.beginPath(); g.arc(X((t.x + 0.5) * CELL), Z((t.z + 0.5) * CELL), 3, 0, 7); g.stroke(); }
        continue;
      }
      if (P.kind === 'area') {
        if (!pass) { g.fillStyle = '#4d5276'; g.fillRect(X(t.x * CELL), Z(t.z * CELL), CELL * s, CELL * s); }
        continue;
      }
      let lines;
      if (P.kind === 'fork') {
        const half = P.size * CELL / 2;
        lines = [0, 1].map((br) => Array.from({ length: 9 }, (_, i) => {
          const tt = i / 8;
          const p = localToWorld(t, forkBranchX(P, tt, br), half - 2 * half * tt);
          return [p.x, 0, p.z];
        }));
      } else lines = [centerlineWorld(t, 6)];
      const k = t.l / maxL;
      for (const pts of lines) {
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[2])) : g.moveTo(X(p[0]), Z(p[2]))));
        if (!pass) { g.strokeStyle = '#0b0918'; g.lineWidth = Math.max(3, 18 * s + 2); }
        else {
          g.strokeStyle = t.s === 'water' ? '#3fa7ff' : P.special === 'start' ? '#2fd3b5' : P.special === 'finish' ? '#ff4f9a' : P.special === 'checkpoint' ? '#ffbf3c' : `hsl(${250 - k * 200}, 70%, ${55 + k * 15}%)`;
          g.lineWidth = Math.max(1.6, 18 * s);
        }
        g.stroke();
      }
    }
  }
  const url = cv.toDataURL('image/png');
  if (key) thumbCache.set(key, url);
  return url;
}
