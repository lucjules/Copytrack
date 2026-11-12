// Continuité physique d'un circuit (phase 1 après l'audit 0.9.59) : ce que le vérificateur d'extrémités (editorTools.checkTrack) ne voit pas.
// Module PUR (aucun rendu, aucune physique exécutée) : il LIT la géométrie des pièces (connect.js) et la matrice mesurée (pieceFacts.js).
//
// Chaque problème : { tile, level, code, msg, why, effect, fix } — `msg` est la phrase complète (où, pourquoi, conséquence, remède).
//   level 'error' : le circuit ne pourra très probablement pas être fini à cet endroit ;
//   level 'warn'  : comportement incohérent ou risqué, mais jouable ;
//   level 'info'  : conseil (ne compte pas dans la pastille de l'éditeur).
// Aucun niveau n'EMPÊCHE de construire, de tester ou de publier un circuit : un circuit créatif peut volontairement utiliser une configuration inhabituelle.
//
// Règles :
//   roll-mismatch    deux pièces qui se touchent n'ont pas le même roulis (sol contre mur, mur gauche contre mur droit, endroit contre envers…)
//   gravity          une route est abordée avec la mauvaise gravité (route retournée en gravité normale, ou l'inverse) : la voiture la traverse
//   near-miss        deux extrémités se frôlent sans se raccorder (écart de hauteur, de cap ou de position) : semble raccordé, ne l'est pas
//   piece-fact       la matrice de compatibilité (tools/matrice-pieces.mjs) a mesuré que cette pièce dans cette orientation ne se franchit à aucune vitesse
//   wall-speed       conseil : une route sur un mur exige plus de 108 km/h
//   slope-break      conseil : rupture de pente convexe entre deux pièces : la voiture décolle
import { LEVEL_H } from './constants.js';
import { PIECES, ORI_NAMES, isRibbon } from './pieces.js';
import { ribbonInverts } from './ribbons.js';
import { tileEnds, endsTouch, rollGap, ROLL_TOLERANCE, rollNameOf } from './connect.js';
import { PIECE_FACTS } from './pieceFacts.js';
import { transitionPath } from './orient.js';
import { SIDE_MIN_SPEED } from './physics/specs.js';

const KMH = 3.6;
const COL_OF_O = ['sol', 'murG', 'murD', 'incG', 'incD', 'surG', 'surD'];      // colonne de la matrice (pieceFacts.js) d'après tile.o
const pos = (t) => `case ${t.x}, ${t.z}, niveau ${String(t.l).replace('.', ',')}`;
const lab = (t) => PIECES[t.t].label;

// Nom d'orientation d'une extrémité (sol, plafond, mur gauche / droit) d'après sa normale et le sens de marche à cet endroit.
export function endOrientation(e) {
  const t = e.exit ? [e.dx, e.dy, e.dz] : [-e.dx, -e.dy, -e.dz];
  const n = [e.nx, e.ny, e.nz];
  return rollNameOf(n, t) || 'mur';
}

const ORI_AT = { sol: 'au sol', plafond: 'au plafond', 'mur gauche': 'sur un mur gauche', 'mur droit': 'sur un mur droit', mur: 'sur un mur', 'incliné gauche': 'incliné à 45° à gauche', 'incliné droit': 'incliné à 45° à droite', 'surplomb gauche': 'en surplomb à 135° à gauche', 'surplomb droit': 'en surplomb à 135° à droite' };

// Que faire entre deux orientations ? (les passages existants : pieces.js, ROLL_PASSAGES)
function bridgeAdvice(a, b) {
  const pair = [a, b].sort().join('|');
  if (pair === 'mur droit|mur gauche') return 'Il n\'existe pas de transition directe entre un mur gauche et un mur droit : repasse par le sol (transition mur → sol, puis sol → mur) ou par le plafond.';
  if (pair === 'plafond|sol') return 'Pour passer du sol au plafond, utilise une Vrille (la gravité suit la route), ou passe par un mur (transitions sol → mur → plafond).';
  // Phase 3 : le chemin de transitions est calculé (orient.js : transitionPath), pour toutes les orientations, 45° comprises.
  const ia = ORI_NAMES.indexOf(a), ib = ORI_NAMES.indexOf(b);
  const path = ia >= 0 && ib >= 0 ? transitionPath(ia, ib, true) : null;
  if (path && path.length) return `Intercale ${path.map((id) => `« ${PIECES[id].label} »`).join(' puis ')} (famille Transition ; Prolonger les pose tout seul).`;
  return 'Intercale une transition d\'orientation.';
}

// Index spatial des extrémités : { clé de case de 8 m → [extrémités] }.
function spatial(ends) {
  const G = new Map(), K = (x, z) => Math.floor(x / 8) * 100003 + Math.floor(z / 8);
  for (const e of ends) { const k = K(e.x, e.z); (G.get(k) || G.set(k, []).get(k)).push(e); }
  return {
    near(e, r) {
      const out = [];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const l = G.get(K(e.x + dx * 8 * Math.max(1, r / 8), e.z + dz * 8 * Math.max(1, r / 8)));
        if (l) for (const f of l) if (f !== e && !out.includes(f)) out.push(f);
      }
      return out;
    },
  };
}

export function continuityIssues(track) {
  const issues = [];
  const tiles = track.tiles;
  if (!tiles.length) return issues;
  const endsOf = new Map(tiles.map((t) => [t, tileEnds(t)]));
  const all = [];
  for (const l of endsOf.values()) all.push(...l);
  const sp = spatial(all);
  const seen = new Set();
  const add = (i) => { const k = i.code + '|' + (i.other ? '' : i.tile ? i.tile.x + ',' + i.tile.z + ',' + i.tile.l : '') + '|' + (i.key || ''); if (seen.has(k)) return; seen.add(k); issues.push(i); };
  // Voisins qui se touchent (même critère que checkTrack).
  const touching = (e) => sp.near(e, 8).filter((f) => f.tile !== e.tile && endsTouch(e, f));

  // ---- roll-mismatch ---------------------------------------------------------------------------------------------------
  for (const e of all) {
    for (const f of touching(e)) {
      if (rollGap(e, f) < ROLL_TOLERANCE) continue;
      const a = endOrientation(e), b = endOrientation(f);
      const key = [pos(e.tile), pos(f.tile)].sort().join('/');
      const gap = rollGap(e, f);
      add({
        tile: e.tile, other: f.tile, key, level: gap > 2.4 || (a !== 'mur' && b !== 'mur') ? 'error' : 'warn', code: 'roll-mismatch',
        why: `${lab(e.tile)} (${pos(e.tile)}) est ${ORI_AT[a]} alors que ${lab(f.tile)} (${pos(f.tile)}), qui la touche, est ${ORI_AT[b]} : la route n'a pas le même roulis des deux côtés du raccord.`,
        effect: 'La voiture ne peut pas passer d\'une pièce à l\'autre : elle se détache et tombe.',
        fix: bridgeAdvice(a, b),
      });
    }
  }

  // ---- gravity : la gravité le long du circuit, propagée depuis le départ à travers les raccords qui se touchent ----------------
  // (Phase 2 : la règle « invert » de la phase 1 est supprimée. La gravité suit la route de TOUTE pièce qui la retourne (ribbons.js, ribbonInverts) : une vrille ou une transition posée à
  // l'envers n'a plus besoin du revêtement « Inversion de gravité » ; une sortie à l'envers sans inversion de gravité ne peut plus arriver.)
  const start = track.startTile;
  const flipsByNormal = (t) => isRibbon(t) && (t.s === 'flip' || ribbonInverts(t));       // la gravité suit la route : revêtement Inversion, ou pièce qui retourne la voiture (règle commune du moteur, ribbons.js)
  const groundPlate = (t) => t.s === 'flip' && !isRibbon(t);
  if (start) {
    const seenState = new Set();
    const stack = [];
    const sEnds = endsOf.get(start);
    const g0 = start.v || track.flip0 ? -1 : 1;       // comme placeAtStart : un départ posé à l'envers, ou la règle « gravité inversée au départ »
    for (const e of sEnds) if (e.exit) for (const f of touching(e)) stack.push({ f, g: g0 });
    while (stack.length) {
      const { f, g } = stack.pop();
      const t = f.tile, tk = pos(t) + '|' + t.t + '|' + (f.entry ? 'e' : 'x') + '|' + g;
      if (seenState.has(tk)) continue;
      seenState.add(tk);
      const ends = endsOf.get(t);
      let need = 0;
      if (Math.abs(f.ny) > 0.7) need = f.ny > 0 ? 1 : -1;
      if (need && need !== g && !flipsByNormal(t) && !groundPlate(t)) {
        const toCeil = need < 0;
        add({
          tile: t, level: 'error', code: 'gravity',
          why: toCeil
            ? `${lab(t)} (${pos(t)}) est posée à l'envers (au plafond), mais la voiture arrive dessus en gravité NORMALE.`
            : `${lab(t)} (${pos(t)}) est une route à l'endroit, mais la voiture arrive dessus en gravité INVERSÉE (retournée par une pièce précédente).`,
          effect: 'La voiture traverse cette route comme si elle n\'existait pas (une route n\'est solide que pour la bonne gravité).',
          fix: toCeil ? 'Retourne la voiture avant cette pièce : revêtement « Inversion de gravité » sur la pièce qui la retourne, ou transition vers le plafond.' : 'Remets la gravité à l\'endroit avant cette pièce (revêtement « Inversion de gravité » sur la pièce qui ramène la voiture au sol).',
        });
        continue;
      }
      for (const o of ends) {
        // Sortie(s) de la pièce vue depuis l'extrémité par laquelle on y est entré (sens de marche ou contresens).
        if (o === f || !(f.entry ? o.exit : o.entry)) continue;
        if (groundPlate(t)) continue;                                // la voiture quitte la route (coup vers le haut) : on ne sait plus rien après une plaque au sol
        let gOut = g;
        if (flipsByNormal(t)) gOut = o.ny >= -0.05 ? 1 : -1;
        for (const nf of touching(o)) if (rollGap(o, nf) < ROLL_TOLERANCE) stack.push({ f: nf, g: gOut });       // (un raccord de roulis incompatible est déjà signalé : on ne propage pas)
      }
    }
  }

  // ---- near-miss : deux extrémités libres qui se frôlent --------------------------------------------------------------------------
  const free = all.filter((e) => touching(e).length === 0 && !(PIECES[e.tile.t].special === 'start' && e.entry) && !(PIECES[e.tile.t].special === 'finish' && e.exit));
  for (const e of free) {
    let best = null;
    for (const f of sp.near(e, 16)) {
      if (f.tile === e.tile || touching(f).length) continue;
      const d = Math.hypot(e.x - f.x, e.y - f.y, e.z - f.z);
      if (d > 14) continue;
      const dirDot = e.dx * f.dx + e.dy * f.dy + e.dz * f.dz;
      if (dirDot > -0.5) continue;                                // pas face à face : une autre route, pas un raccord manqué
      if (!best || d < best.d) best = { f, d, dirDot };
    }
    if (!best) continue;
    const { f, d, dirDot } = best;
    const dh = Math.abs(e.y - f.y), dxz = Math.hypot(e.x - f.x, e.z - f.z);
    const parts = [];
    if (dh > 0.3) parts.push(`${String(Math.round((dh / LEVEL_H) * 10) / 10).replace('.', ',')} niveau d'écart en hauteur`);
    if (dxz > 1) parts.push(`${dxz.toFixed(1).replace('.', ',')} m d'écart sur le sol`);
    if (dirDot > -0.99) parts.push(`caps différents de ${Math.round((Math.acos(Math.max(-1, Math.min(1, -dirDot))) * 180) / Math.PI)}°`);
    if (!parts.length) parts.push(`${d.toFixed(1).replace('.', ',')} m d'écart`);
    const key = [pos(e.tile), pos(f.tile)].sort().join('/');
    add({
      tile: e.tile, other: f.tile, key, level: 'warn', code: 'near-miss',
      why: `${lab(e.tile)} (${pos(e.tile)}) et ${lab(f.tile)} (${pos(f.tile)}) se font face mais ne se raccordent pas : ${parts.join(', ')}.`,
      effect: 'Les deux routes paraissent reliées à l\'écran, mais la voiture fait un saut au lieu de rouler : elle risque de tomber ou de perdre sa vitesse.',
      fix: dh > 0.3 ? 'Monte ou descends l\'une des deux pièces pour les mettre à la même hauteur (touches E / C), ou intercale une pente.' : 'Décale ou tourne l\'une des pièces pour que les deux bouts coïncident (touche R pour pivoter).',
    });
  }

  // ---- piece-fact : ce que la matrice de compatibilité a mesuré ---------------------------------------------------------------------
  for (const t of tiles) {
    const col = t.v ? 'plafond' : COL_OF_O[t.o | 0];
    const code = PIECE_FACTS[t.t] && PIECE_FACTS[t.t][col];
    if (!code) continue;
    // La matrice a mesuré la pièce SANS revêtement : une pièce qui se retourne avec « Inversion de gravité » n'est pas concernée, et ce qui est déjà expliqué
    // plus précisément par une règle de gravité n'est pas répété.
    if (t.s === 'flip' || issues.some((i) => i.tile === t && (i.code === 'gravity'))) continue;
    if (code === 'CHUTE') {
      add({
        tile: t, level: 'warn', code: 'piece-fact', key: col,
        why: `${lab(t)} (${pos(t)}) posée ${{ sol: 'au sol', plafond: 'à l\'envers', murG: 'sur un mur gauche', murD: 'sur un mur droit', incG: 'inclinée à 45° à gauche', incD: 'inclinée à 45° à droite', surG: 'en surplomb à gauche', surD: 'en surplomb à droite' }[col]} : dans l'essai de compatibilité, le pilote automatique ne la franchit à aucune vitesse (80, 150 ni 250 km/h).`,
        effect: 'Cette combinaison fait sortir la voiture de la route (essai isolé : au milieu d\'un vrai circuit, un autre enchaînement peut la sauver).',
        fix: 'Change d\'orientation ou de pièce, ou essaie la zone avec « ▶ Ici » avant de continuer. La matrice complète est dans docs/MATRICE-PIECES.md.',
      });
    }
  }

  // ---- wall-speed : une fois par suite de pièces sur un mur ---------------------------------------------------------------------------
  // (Phase 3 : un roulis de 45° n'est pas un mur : la voiture reste plaquée par la pente ; seuls ±90° et au-delà exigent la vitesse de mur.)
  const wallish = (t) => t.o === 1 || t.o === 2 || t.o >= 5 || !!(PIECES[t.t].roll && PIECES[t.t].roll.some((i) => [1, 2, 3, 6, 7].includes(i)));
  for (const t of tiles) {
    if (!wallish(t)) continue;
    const ends = endsOf.get(t);
    const before = ends.some((e) => e.entry && touching(e).some((f) => wallish(f.tile)));
    if (before) continue;
    add({
      tile: t, level: 'info', code: 'wall-speed',
      why: `Début d'une route sur un mur (${lab(t)}, ${pos(t)}).`,
      effect: `Sous ${Math.round(SIDE_MIN_SPEED * KMH)} km/h la voiture n'est plus plaquée au mur : elle glisse puis décroche (message « Trop lent »).`,
      fix: 'Prévois une ligne droite d\'élan ou un accélérateur avant la transition, et évite les virages serrés ou les montées raides qui font perdre de la vitesse sur le mur.',
    });
  }

  // ---- slope-break : rupture de pente convexe entre deux pièces qui se touchent ----------------------------------------------------------
  for (const e of all) {
    if (!e.exit) continue;
    for (const f of touching(e)) {
      if (rollGap(e, f) >= ROLL_TOLERANCE) continue;
      if (isRibbon(e.tile) || isRibbon(f.tile)) continue;
      if (PIECES[e.tile.t].special || PIECES[f.tile.t].special) continue;
      const ae = Math.asin(Math.max(-1, Math.min(1, e.tile.v ? -e.dy : e.dy))), af = Math.asin(Math.max(-1, Math.min(1, f.tile.v ? f.dy : -f.dy)));
      // Pente (montée > 0) de la route dans le sens de marche : à la sortie de e, puis à l'entrée de f. Convexe : la pente diminue.
      const drop = ae - af;
      if (drop < 0.09) continue;
      const deg = Math.round((drop * 180) / Math.PI);
      const vmin = 0.6 / Math.sin(drop);                          // vitesse de décollage : la route doit « tomber » de plus de 0,6 m/s (CAR.launch, voir docs/AUDIT-EXPERIENCE-0.9.59.md §3.2)
      const air120 = ((2 * (120 / KMH) * Math.sin(drop)) / 19).toFixed(1).replace('.', ',');
      add({
        tile: f.tile, other: e.tile, key: pos(e.tile), level: 'info', code: 'slope-break',
        why: `Rupture de pente de ${deg}° entre ${lab(e.tile)} (${pos(e.tile)}) et ${lab(f.tile)} (${pos(f.tile)}) : la route « tombe » sous la voiture.`,
        effect: `Dès ${Math.max(1, Math.round(vmin * KMH))} km/h la voiture décolle ; à 120 km/h elle reste environ ${air120} s en l'air.`,
        fix: 'Si ce n\'est pas voulu, utilise une pièce de la famille « Courbe » (fin de montée, début de descente, en S) : son profil adouci se raccorde sans cassure.',
      });
    }
  }
  return issues;
}

// Aide au moment de choisir une pièce (palette de l'éditeur) : ce qu'il faut savoir AVANT de la poser, d'après sa géométrie et la matrice mesurée. '' si rien à dire.
export function pieceHint(type, opts = {}) {
  const P = PIECES[type];
  if (!P || P.kind === 'ring' || P.kind === 'area') return '';
  const hints = [];

  if (opts.o === 1 || opts.o === 2 || opts.o >= 5 || P.roll) hints.push(`Route sur un mur : la voiture doit rouler à plus de ${Math.round(SIDE_MIN_SPEED * KMH)} km/h.`);
  const col = opts.v ? 'plafond' : COL_OF_O[opts.o | 0] || 'sol';
  if (PIECE_FACTS[type] && PIECE_FACTS[type][col] === 'CHUTE' && !hints.length) hints.push(`${P.label} ${col === 'sol' ? '' : 'dans cette orientation '}ne passe à aucune vitesse dans l'essai de compatibilité (docs/MATRICE-PIECES.md).`);
  return hints.join(' ');
}

// Libellé complet d'un problème (pastille, bulle, journal) : où, pourquoi, conséquence, remède.
export const issueText = (i) => (i.why ? `${i.why} ${i.effect} ${i.fix}` : i.msg);
export const issueLevelOrder = { error: 0, warn: 1, info: 2 };
