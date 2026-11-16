// Les nouveautés des étapes 1 à 5 (0.9.68 à 0.9.72) présentes dans un circuit, rangées par famille : sert à la règle des circuits refaits
// (tools/test-etape6.mjs : au moins 4 nouveautés de 2 familles par circuit du chapitre 1, toutes les familles sur le chapitre) et à l'atelier.
import { PIECES } from '../js/pieces.js';
import { isSolid } from '../js/solids.js';

const TILE_FAMILY = (t) => {
  const P = PIECES[t.t];
  if (P.kind === 'sbend') return 'chicane';
  if (P.kind === 'junction') return 'carrefour';
  if (P.hw) return 'largeur';
  if (P.loopTop || P.tubeArc) return 'looping-tube';
  if (P.kind === 'area' && t.t !== 'platform') return 'plaque';
  return null;
};
const SIGNS = new Set(['board_left', 'board_right', 'board_up', 'board_down', 'board_warn', 'board_no', 'sign_down', 'sign_uturn']);
const BEAMS = new Set(['pillar', 'pillarBase', 'pillarThin', 'beam', 'beamL', 'beamT', 'beamX', 'beamPost', 'gantry']);

export const FAMILIES_NEW = ['chicane', 'panneau', 'portique', 'pilier-poutre', 'mur-bloc', 'plaque', 'largeur', 'carrefour', 'looping-tube'];

// [{ family, what }] : une entrée par pièce ou décoration nouvelle (une pièce qui porte une option nouvelle compte aussi).
export function newElements(tr) {
  const out = [];
  for (const t of tr.tiles) {
    const f = TILE_FAMILY(t);
    if (f) out.push({ family: f, what: t.t });
    if (t.gs) out.push({ family: 'portique', what: t.t + '*' + t.gs });
    if (t.eb) out.push({ family: 'plaque', what: t.t + ' bordures ' + t.eb });
  }
  for (const d of tr.decos) {
    if (SIGNS.has(d.k)) out.push({ family: 'panneau', what: d.k });
    else if (BEAMS.has(d.k)) out.push({ family: 'pilier-poutre', what: d.k });
    else if (isSolid(d.k)) out.push({ family: 'mur-bloc', what: d.k });
  }
  return out;
}
export const familiesOf = (tr) => new Set(newElements(tr).map((e) => e.family));
