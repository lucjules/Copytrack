// Audit du rendu (phase 0) : la matrice de TOUS les cas à construire. Rien n'est tiré au hasard : chaque pièce, chaque orientation permise,
// chaque revêtement. Les sondes (sondes.mjs) et la machine à captures (captures.mjs) parcourent cette liste.
//   node tools/audit-rendu/cas.mjs        affiche la taille de la matrice
import { PIECES, PIECE_ORDER, LEGACY_TILE, SURFACE_ORDER, MAX_O, O_TO_ORI, ORI_NAMES, flagAllowed } from '../../js/pieces.js';
import { Track } from '../../js/track.js';

// Pièces auditées : toutes celles de la palette (les codes hérités se lisent encore, mais se dessinent comme leur remplaçante).
export const PIECE_IDS = PIECE_ORDER.filter((t) => PIECES[t] && !LEGACY_TILE[t]);

// Orientations : à l'endroit, à l'envers (v), puis les roulis o = 1..MAX_O (mur gauche, mur droit, 45°, 135°).
export const ORIENTATIONS = [{ key: 'sol', opts: {} }, { key: 'plafond', opts: { v: 1 } }]
  .concat(Array.from({ length: MAX_O }, (_, i) => ({ key: 'o' + (i + 1), opts: { o: i + 1 } })));
export const orientLabel = (key) => (key === 'sol' ? 'à l’endroit' : key === 'plafond' ? 'à l’envers' : ORI_NAMES[O_TO_ORI[+key.slice(1)]] || key);

export function orientationAllowed(t, opts) {
  if (opts.v) return flagAllowed(t, 'v');
  if (opts.o) return flagAllowed(t, 'o', null, opts.o);
  return true;
}

// Pièce posée en (x, z), au niveau le plus bas que l'éditeur accepte à partir de `from` (0 par défaut), ou null si aucun.
export function placeLowest(t, opts = {}, x = 0, z = 0, from = 0) {
  for (let l = from; l <= 14; l += 0.5) {
    const tile = Track.normalize({ t, x, z, l, r: 0, ...opts });
    if (Track.inBounds(tile)) return tile;
  }
  return null;
}

// Toutes les combinaisons pièce × orientation permises, posées au niveau le plus bas permis.
export function pieceCases({ ids = PIECE_IDS, level = null } = {}) {
  const out = [];
  for (const t of ids) {
    for (const O of ORIENTATIONS) {
      if (!orientationAllowed(t, O.opts)) continue;
      const tile = level == null ? placeLowest(t, O.opts) : Track.normalize({ t, x: 0, z: 0, l: level, r: 0, ...O.opts });
      if (!tile || (level != null && !Track.inBounds(tile))) continue;
      // L'éditeur peut refuser silencieusement une option (normalize la retire) : on ne garde que les cas réellement posables.
      if ((O.opts.v | 0) !== (tile.v | 0) || (O.opts.o | 0) !== (tile.o | 0)) continue;
      out.push({ t, orient: O.key, opts: O.opts, tile });
    }
  }
  return out;
}

// Revêtements (sans le revêtement normal) avec un réglage représentatif : par défaut, plus les deux bouts quand le réglage change le sens.
export function surfaceVariants() {
  const out = [];
  for (const s of SURFACE_ORDER) {
    if (!s) continue;
    out.push({ s });
    if (s === 'conveyor') out.push({ s, p: 21 }, { s, p: 101 });      // −160 km/h (recule) et 0 km/h
    if (s === 'wind' || s === 'spring') out.push({ s, p: 40 });       // poussée de l'autre côté
    if (s === 'gravity') out.push({ s, p: 200 });                     // gravité forte (flèches vers le bas)
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pc = pieceCases();
  const byOrient = {};
  for (const c of pc) byOrient[c.orient] = (byOrient[c.orient] || 0) + 1;
  const sv = surfaceVariants();
  console.log(`${PIECE_IDS.length} pièces ; ${pc.length} combinaisons pièce × orientation permises`);
  console.log('par orientation : ' + Object.entries(byOrient).map(([k, n]) => `${orientLabel(k)} ${n}`).join(', '));
  console.log(`${sv.length} variantes de revêtement → ${pc.length * sv.length} cas pièce × orientation × revêtement`);
}
