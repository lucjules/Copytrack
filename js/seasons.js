// Saisons hebdomadaires (Copytrack Evolution, E15) : la saison N dure une semaine, du lundi 00:00 UTC au lundi suivant (la saison 1 commence le
// 9 novembre 2026, comme supabase/etape11-saisons.sql : un test compare les deux). Ses trois circuits, tirés de la carrière d'après le numéro, sont
// les mêmes pour tout le monde ; leurs temps sont des catégories de record « b-…~v1.sea-N » (variants.js), que le serveur n'accepte que pendant la
// semaine N (verify.js). Les points et les divisions se calculent en base, depuis les temps vérifiés (aucun point n'est déclaré par le jeu).
// Ce module est dans la fermeture de la vérification serveur : pur, sans profil ni stockage.
import { BUILTIN_TRACKS } from './tracks.js';
import { rng } from './daily.js';

export const SEASON_EPOCH = Date.UTC(2026, 10, 9);          // lundi 9 novembre 2026, 00:00 UTC
export const SEASON_MS = 7 * 86400000;
export const SEASON_TRACKS = 3;
export const SEASON_GRACE_MS = 10 * 60000;                   // une course finie juste après minuit (lundi) compte encore pour la saison qui vient de finir

// Numéro de la saison à l'instant t (ms) ; 0 avant la saison 1.
export const seasonOf = (t = Date.now()) => (t < SEASON_EPOCH ? 0 : Math.floor((t - SEASON_EPOCH) / SEASON_MS) + 1);
export const seasonBounds = (n) => ({ starts: SEASON_EPOCH + (n - 1) * SEASON_MS, ends: SEASON_EPOCH + n * SEASON_MS });

// Les circuits de la saison n : trois circuits distincts de la carrière (hors chapitre bonus de l'Atelier), tirés d'après le numéro.
export function seasonTracks(n) {
  const pool = BUILTIN_TRACKS.filter((d) => d.decor !== 'atelier');
  const r = rng('season#' + n), out = [];
  while (out.length < SEASON_TRACKS) {
    const d = pool[Math.floor(r() * pool.length)];
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

// Une course de la saison n peut-elle être acceptée à l'instant t ? '' si oui, sinon la raison.
export function seasonOpen(n, t = Date.now()) {
  const { starts, ends } = seasonBounds(n);
  if (!(n >= 1) || t < starts) return 'Cette saison n’a pas encore commencé.';
  if (t >= ends + SEASON_GRACE_MS) return 'Cette saison est terminée : les temps ne comptent plus.';
  return '';
}

export const DIVISIONS = ['', 'Élite', 'Expert', 'Confirmé', 'Amateur', 'Débutant'];
