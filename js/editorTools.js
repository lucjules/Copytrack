// Outils de l'éditeur (v1.5) : sélection de zone et presse-papiers, vérificateur de
// circuit, miniatures vues de dessus. Aucun rendu 3D ici : seulement des données.
import { CELL, LEVEL_H, MAX_LEVEL, SURF_PHYS } from './constants.js';
import { PIECES, forkBranchX, localToWorld, baseY, cpKind } from './pieces.js';
import { Track } from './track.js';
import { centerlineWorld } from './ribbons.js';
import { mapGeometry, fitView, drawTrackMap } from './ui/trackMap.js';

// ---- Pot de peinture : zones VIDES fermées -----------------------------------------------------------------------
// Algorithme (0.9.2). Une « zone vide » est un ensemble de cases libres, reliées par leurs 4 côtés, au niveau de pose. Elle est
// « fermée » si aucune de ses cases ne mène à l'extérieur du circuit :
//  1. case libre = aucune pièce (hors anneaux flottants) dont les niveaux [a, b] recoupent ceux de la pièce à poser [lo, hi] ;
//  2. boîte englobante de TOUTES les cases occupées (à n'importe quel niveau), agrandie d'une case : toute case de la couronne
//     extérieure est libre à coup sûr, et rejoindre cette couronne revient à rejoindre l'infini ;
//  3. parcours en largeur ITÉRATIF depuis la case visée (file + index de lecture, pas de récursion : aucun dépassement de pile) ;
//  4. dès qu'une case de la couronne est atteinte → zone ouverte ; au-delà de `max` cases → zone refusée (trop grande).
// Deux pièces qui ne se touchent que par un coin ferment la zone (la connexité de la zone est en 4-voisins, celle du mur en 8).
// Retourne { ok: true, cells: [[x, z], …] } triées par (z, x), ou { ok: false, why: 'occupied' | 'open' | 'big' | 'empty' }.
export function enclosedRegion(track, cx, cz, lo, hi, { max = 600 } = {}) {
  const blocked = (x, z) => {
    for (const t of track.tilesAt(x, z)) {
      if (PIECES[t.t].kind === 'ring') continue;
      const [a, b] = Track.range(t);
      if (a <= hi && lo <= b) return true;
    }
    return false;
  };
  if (!track.tiles.length) return { ok: false, why: 'empty' };
  if (blocked(cx, cz)) return { ok: false, why: 'occupied' };
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const t of track.tiles) {
    for (const [x, z] of Track.cellsOf(t)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  }
  x0--; z0--; x1++; z1++;                                         // couronne extérieure
  if (cx < x0 || cx > x1 || cz < z0 || cz > z1) return { ok: false, why: 'open' };
  const W = z1 - z0 + 1, id = (x, z) => (x - x0) * W + (z - z0);
  const seen = new Set([id(cx, cz)]), queue = [[cx, cz]];
  for (let head = 0; head < queue.length; head++) {
    const [x, z] = queue[head];
    if (x === x0 || x === x1 || z === z0 || z === z1) return { ok: false, why: 'open' };
    if (queue.length > max) return { ok: false, why: 'big' };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = id(nx, nz);
      if (seen.has(k) || blocked(nx, nz)) continue;
      seen.add(k); queue.push([nx, nz]);
    }
  }
  queue.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  return { ok: true, cells: queue };
}

// Pavage d'une zone avec des pièces de côté `n` (n×n cases) : parcours dans l'ordre (z, x), une pièce à chaque case libre dont le
// carré n×n tient entièrement dans la zone. Renvoie les coins (x, z) des carrés et le nombre de cases laissées vides.
export function tileRegion(cells, n = 1) {
  const free = new Set(cells.map(([x, z]) => x + ',' + z));
  const spots = [];
  for (const [x, z] of cells) {
    if (!free.has(x + ',' + z)) continue;
    let fits = true;
    for (let i = 0; i < n && fits; i++) for (let j = 0; j < n; j++) if (!free.has((x + i) + ',' + (z + j))) { fits = false; break; }
    if (!fits) continue;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) free.delete((x + i) + ',' + (z + j));
    spots.push([x, z]);
  }
  return { spots, left: free.size };
}

// ---- Pot de peinture : zone connectée de pièces -------------------------------------------------------------------
// Pièces reliées à `start` par un côté partagé (écart de niveau <= maxDl) qui satisfont `matches`. Parcours en largeur ITÉRATIF (file + index de
// lecture) qui ne fait que COLLECTER : rien n'est modifié ici (c'est ce qui sert aussi à la prévisualisation). Borné : au-delà de `max` pièces la zone est
// déclarée tronquée et l'outil refuse de l'appliquer (jamais de remplissage partiel d'une zone qu'on ne voit pas en entier).
export const FILL_MAX_TILES = 8000;      // au-dessus du maximum publiable (5 000 pièces) : on peut remplir tout un circuit, jamais une zone sans fin
const FILL_NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function fillZone(track, start, matches, { maxDl = 2, max = FILL_MAX_TILES } = {}) {
  const visited = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const t = queue[head];
    for (const [cx, cz] of Track.cellsOf(t)) {                      // une pièce 2×2 occupe plusieurs cases
      for (const [dx, dz] of FILL_NEIGHBOURS) {
        for (const n of track.tilesAt(cx + dx, cz + dz)) {
          if (visited.has(n) || !matches(n) || Math.abs(n.l - t.l) > maxDl) continue;
          if (queue.length >= max) return { tiles: queue, truncated: true };
          visited.add(n);
          queue.push(n);
        }
      }
    }
  }
  return { tiles: queue, truncated: false };
}

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
export function copyRect(track, r, ok = null) {
  const tiles = tilesInRect(track, r).filter((t) => !ok || ok(t));
  const decos = decosInRect(track, r).filter((d) => !ok || ok(d));
  if (!tiles.length && !decos.length) return null;
  const baseL = tiles.length ? Math.min(...tiles.map((t) => t.l)) : 0;
  return {
    w: r.x1 - r.x0 + 1, h: r.z1 - r.z0 + 1,
    tiles: tiles.map((t) => ({ ...t, x: t.x - r.x0, z: t.z - r.z0, l: t.l - baseL })),
    decos: decos.map((d) => ({ ...d, x: d.x - r.x0 * CELL, z: d.z - r.z0 * CELL, y: d.y - baseL * LEVEL_H })),
  };
}

// Rotation d'un quart de tour (le nord devient l'est), puis recalage sur (0, 0).
export function rotateClip(clip, keepRect = false) {
  const tiles = clip.tiles.map((t) => {
    const s = PIECES[t.t].size;
    return { ...t, x: -t.z - s, z: t.x, r: (t.r + 1) & 3 };
  });
  const turn = (a) => { let r = a - Math.PI / 2; if (r <= -Math.PI) r += Math.PI * 2; return r; };      // cap ramené dans ]-π, π] : quatre quarts de tour = le cap d'origine
  const decos = clip.decos.map((d) => ({ ...d, x: -d.z, z: d.x, ry: turn(d.ry || 0) }));
  // Presse-papiers : recalage sur l'enveloppe des pièces. Rotation en place (keepRect) : la zone entière (h × w cases) retombe sur (0, 0), d'où le décalage fixe.
  const mx = keepRect ? -clip.h : Math.min(...tiles.map((t) => t.x), ...decos.map((d) => Math.floor(d.x / CELL)));
  const mz = keepRect ? 0 : Math.min(...tiles.map((t) => t.z), ...decos.map((d) => Math.floor(d.z / CELL)));
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

// Duplication d'une zone (Ctrl+D) : la première place LIBRE pour une copie de toutes les pièces et décorations sélectionnées, sans rien écraser
// (contrairement au collage, qui remplace ce qui gêne). Essais dans l'ordre : à droite, en dessous, à gauche, au-dessus (en cases, d'une largeur ou
// d'une hauteur de zone), puis les mêmes décalages un niveau plus haut, puis un niveau plus bas. Le départ n'est jamais dupliqué (un seul par circuit).
// Renvoie { dx, dz, dl } ou null s'il n'y a aucune place. Ne modifie PAS le circuit.
export function findDuplicateSpot(track, rect, tiles) {
  const w = rect.x1 - rect.x0 + 1, h = rect.z1 - rect.z0 + 1;
  const src = tiles.filter((t) => t.t !== 'start');
  const flat = [[w, 0], [0, h], [-w, 0], [0, -h]];
  const tries = [];
  for (const dl of [0, 1, -1]) for (const [dx, dz] of flat) tries.push({ dx, dz, dl });
  for (const { dx, dz, dl } of tries) {
    const ok = src.every((t) => {
      const c = Track.normalize({ ...t, col: t.col ? { ...t.col } : null, x: t.x + dx, z: t.z + dz, l: t.l + dl });
      return t.l + dl >= 0 && t.l + dl <= MAX_LEVEL && Track.inBounds(c) && track.conflicts(c).length === 0;
    });
    if (ok) return { dx, dz, dl };
  }
  return null;
}

// Pose les copies à (dx, dz, dl) ; renvoie { tiles, decos } (les objets ajoutés). Une décoration refusée (trop nombreuses) est comptée dans `refused`.
export function duplicateSelection(track, tiles, decos, { dx, dz, dl }) {
  const out = { tiles: [], decos: [], refused: 0, skippedStart: 0 };
  for (const t of tiles) {
    if (t.t === 'start') { out.skippedStart++; continue; }
    const a = track.add({ ...t, col: t.col ? { ...t.col } : null, x: t.x + dx, z: t.z + dz, l: t.l + dl });
    if (a) out.tiles.push(a); else out.refused++;
  }
  for (const d of decos) {
    const a = track.addDeco({ ...d, x: d.x + dx * CELL, z: d.z + dz * CELL, y: d.y + dl * LEVEL_H, cp: d.cp ? d.cp.map((q) => ({ ...q })) : undefined });
    if (a) out.decos.push(a); else out.refused++;
  }
  return out;
}

// Transformations d'une sélection EN PLACE (déplacer, pivoter) : tout ou rien. Les pièces sélectionnées sont retirées, remises à leur nouvelle place,
// et si UNE seule gêne (pièce voisine, hors des niveaux ou des bornes du circuit) tout revient comme avant. Les déclencheurs de cases (scripts) posés
// dans la zone suivent les pièces ; les décorations aussi (obstacles compris : leur cap tourne avec la pièce, même convention que rotateClip).
// Renvoie true si la transformation a eu lieu.
const scriptsIn = (track, r) => (track.scripts || []).filter((s) => inRect(r, s.x, s.z));
function replaceTiles(track, tiles, moved) {
  // 1. Contrôle SANS toucher au circuit : chaque pièce à sa nouvelle place doit être dans les bornes et ne gêner aucune pièce qui reste.
  const sel = new Set(tiles);
  for (const t of moved) {
    const n = Track.normalize(t);
    if (!Track.inBounds(n) || t.l < 0 || t.l > MAX_LEVEL || track.conflicts(n).some((c) => !sel.has(c))) return false;
  }
  // 2. Application : l'ordre des pièces dans le circuit est conservé (le code partagé et la signature n'en changent pas pour rien).
  const order = track.tiles.slice(), repl = new Map();
  for (const t of tiles) track.remove(t);
  tiles.forEach((t, i) => repl.set(t, track.add(moved[i])));
  track.tiles = order.map((t) => repl.get(t) || t);
  return true;
}
export function moveSelection(track, rect, tiles, decos, dx, dz) {
  if (!dx && !dz) return false;
  if (!replaceTiles(track, tiles, tiles.map((t) => ({ ...t, x: t.x + dx, z: t.z + dz })))) return false;
  const sc = scriptsIn(track, rect);
  for (const o of decos) { o.x += dx * CELL; o.z += dz * CELL; }
  for (const s of sc) { s.x += dx; s.z += dz; }
  track.version++;
  return true;
}
export function rotateSelection(track, rect, tiles, decos) {
  const clip = { w: rect.x1 - rect.x0 + 1, h: rect.z1 - rect.z0 + 1, tiles: tiles.map((t) => ({ ...t, x: t.x - rect.x0, z: t.z - rect.z0 })), decos: decos.map((d) => ({ ...d, x: d.x - rect.x0 * CELL, z: d.z - rect.z0 * CELL })) };
  if (!clip.tiles.length && !clip.decos.length) return false;
  // Le coin haut-gauche du rectangle reste en place : rotateClip recale la zone sur (0, 0) (on rend donc à la zone son rectangle complet, pas seulement
  // l'enveloppe des pièces : une pièce au bord garde sa distance au bord).
  const R = rotateClip({ ...clip, tiles: clip.tiles.concat([]), decos: clip.decos.concat([]) }, true);
  const P = placedClip(R, rect.x0, rect.z0, 0);
  if (!replaceTiles(track, tiles, P.tiles)) return false;
  decos.forEach((d, i) => { Object.assign(d, { x: P.decos[i].x, z: P.decos[i].z, ry: P.decos[i].ry }); });
  const sc = scriptsIn(track, rect);
  for (const s of sc) { const rx = s.x - rect.x0, rz = s.z - rect.z0; s.x = rect.x0 + (clip.h - 1 - rz); s.z = rect.z0 + rx; }
  track.version++;
  return true;
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
      const flip = e.tile.s === 'flip' || f.tile.s === 'flip';   // la plaque de gravité inversée fait passer au niveau du dessus sur la même case
      // Une chute d'au moins un niveau peut se faire en bout de dalle, sans vide entre les deux pièces (le départ de Tremplins : la voiture quitte
      // la plateforme à l'arrêt et tombe sur la descente voisine, 5 niveaux plus bas) : 0.9.11.
      const drop = Math.abs(e.y - f.y) > LEVEL_H * 0.9;
      if (along < (flip || drop ? -0.5 : 1) || along > CELL * maxJump || side > 5) continue;
      // Une plaque de gravité inversée envoie la voiture d'un niveau à l'autre (sol ↔ plafond) : pas de limite de hauteur.
      // (Sauf pour une extrémité d'ENTRÉE : c'est la réception d'un saut, et le départ du saut peut être bien plus haut : chute libre.)
      // Un revêtement Rebond lance la voiture vers le haut : la réception peut être plus haute, jusqu'aux 85 % de la hauteur du rebond.
      const hop = e.tile.s === 'bounce' ? 0.85 * (SURF_PHYS.bounce * ((e.tile.p || 100) / 100)) ** 2 / (2 * SURF_PHYS.gravity) : LEVEL_H * 1.2;
      if (f.y > e.y + hop && !flip && !e.entry) continue;
      if (!land || along < dist) { land = f; dist = along; }
    }
    if (land) {
      join(e.tile, land.tile);
      if (e.entry && land.y > e.y + LEVEL_H * 1.2 && e.tile.s !== 'flip' && land.tile.s !== 'flip') continue;   // réception d'une chute : le départ du saut a déjà été examiné
      const cells = Math.round(dist / CELL);
      const ramp = (PIECES[e.tile.t].rise || 0) > 0 || e.tile.t === 'crest90' || e.tile.s === 'bounce' || e.tile.s === 'boost';   // toute pièce qui monte (pente, tremplin, inclinaison 4, courbe…) lance la voiture
      if (cells >= 6 / Math.max(0.35, lowG) && !glider) issues.push({ tile: e.tile, level: 'warn', msg: `Saut de ${cells} cases : très long sans deltaplane.` });
      else if (!ramp && cells >= 2 && land.y >= e.y - 1) issues.push({ tile: e.tile, level: 'warn', msg: `Saut de ${cells} cases sans tremplin : la voiture risque de tomber.` });
      if (land.y > e.y + 0.6 && e.tile.s !== 'flip' && land.tile.s !== 'flip' && e.tile.s !== 'bounce') issues.push({ tile: land.tile, level: 'warn', msg: 'Arrivée de saut plus haute que le départ.' });
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
      if ((cpKind(t) || sp === 'finish') && find(t) !== root) {
        issues.push({ tile: t, level: 'error', msg: `${PIECES[t.t].label} inaccessible depuis le départ.` });
      }
    }
  }
  for (const e of track.validate()) issues.push({ tile: null, level: 'error', msg: e });
  return issues;
}

// ---- Miniature vue de dessus ----------------------------------------------------
// Cache des miniatures (images en data:URL, de quelques Ko chacune) : borné, une liste de communauté ou de circuits peut en demander des centaines.
const THUMB_CACHE_MAX = 300;
const thumbCache = new Map();
export function thumbnail(track, key, w = 168, h = 104) {
  if (key && thumbCache.has(key)) return thumbCache.get(key);
  if (typeof document === 'undefined') return '';
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  drawTrackMap(cv.getContext('2d'), mapGeometry(track), fitView(track.bounds(), w, h, 6), { style: 'thumb' });      // noyau commun avec la grande carte (ui/trackMap.js)
  const url = cv.toDataURL('image/png');
  if (key) {
    if (thumbCache.size >= THUMB_CACHE_MAX) thumbCache.delete(thumbCache.keys().next().value);       // la plus ancienne
    thumbCache.set(key, url);
  }
  return url;
}
