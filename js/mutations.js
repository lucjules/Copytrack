// Défi du jour 2 (Copytrack Evolution, E13) : la MUTATION du jour et les SÉRIES de jours.
//
// La mutation est une CATÉGORIE de record du défi (une variante, variants.js : sa propre clé « daily-AAAA-MM-JJ~v1.… », son propre classement),
// choisie d'après la date : le défi du jour lui-même ne change pas, ni pour les défis passés ni pour ceux de l'empreinte de la physique. Le serveur
// la vérifie comme toute catégorie (il applique la variante au défi qu'il régénère). Une mutation ne rend aucune voiture plus rapide : elle change
// la piste pour tout le monde (adhérence, vent, gravité, véhicule de départ) ; le brouillard est purement visuel (ambiance, hors signature).
// Une mutation est retenue seulement si le pilote automatique finit le défi muté ; sinon on essaie la suivante, dans un ordre fixé par la date.
//
// Série : nombre de jours consécutifs avec un défi du jour terminé (le défi ou sa mutation), calculé depuis profile.dailyDays.
import { dailyChallenge, dayKey, rng, botTime } from './daily.js';
import { applyVariant, formatVariant, variantKey, WIND_DIRS } from './variants.js';

export const MUTATIONS = {
  verglas: { label: 'Verglas', icon: '🧊', desc: 'Adhérence de toute la piste à 60 %.', v: () => ({ gp: '60' }) },
  vent: { label: 'Vent de travers', icon: '🌬️', desc: 'Un vent de 25 % souffle sur toute la piste.', v: (r) => ({ wd: WIND_DIRS[Math.floor(r() * WIND_DIRS.length)] }) },
  moto: { label: 'Moto imposée', icon: '🏍️', desc: 'Départ en moto.', v: () => ({ veh: 'moto' }) },
  lune: { label: 'Gravité légère', icon: '🌙', desc: 'Gravité à 70 % : les sauts durent plus longtemps.', v: () => ({ g: '70' }) },
  brouillard: { label: 'Verglas dans le brouillard', icon: '🌫️', desc: 'Adhérence à 80 % et brouillard épais.', v: () => ({ gp: '80' }), ambiance: { fog: 'thick' } },
  motolune: { label: 'Moto sur la Lune', icon: '🚀', desc: 'Départ en moto et gravité à 70 %.', v: () => ({ veh: 'moto', g: '70' }) },
  plomb: { label: 'Gravité lourde', icon: '🪨', desc: 'Gravité à 130 % : les sauts retombent vite.', v: () => ({ g: '130' }) },
};
// Jour de la semaine (UTC, 0 = dimanche) -> mutation proposée en premier.
export const WEEK = ['plomb', 'verglas', 'vent', 'moto', 'lune', 'brouillard', 'motolune'];

const cache = new Map();
// La mutation du jour : { day, id, label, icon, desc, v, variant, key, ambiance, time } ou null (défi absent, ou aucune mutation faisable).
export function dailyMutation(day = dayKey()) {
  if (cache.has(day)) return cache.get(day);
  const c = dailyChallenge(day);
  let out = null;
  if (c) {
    const r = rng(day + '#mutation');
    const w = new Date(Date.parse(day + 'T00:00:00Z')).getUTCDay();
    for (let k = 0; k < WEEK.length && !out; k++) {
      const id = WEEK[(w + k) % WEEK.length], M = MUTATIONS[id], v = M.v(r);
      let track, key;
      try { track = applyVariant(c.track, v); key = variantKey(c.key, v); } catch { continue; }
      // Le pilote automatique doit finir le défi muté ; sur une piste moins adhérente, il vise moins d'adhérence lui aussi.
      const t = botTime(track, 0.8 * Math.min(1, (track.grip || 100) / 100));
      if (t == null) continue;
      out = { day, id, label: M.label, icon: M.icon, desc: M.desc, v, variant: formatVariant(v), key, ambiance: M.ambiance || null, time: Math.round(t * 10) / 10 };
    }
  }
  cache.set(day, out);
  return out;
}
// Le jour d'une clé du défi (classique ou muté) ; '' si ce n'en est pas une.
export const dayOfKey = (key) => { const m = /^daily-(\d{4}-\d{2}-\d{2})(?:~|$)/.exec(String(key || '')); return m ? m[1] : ''; };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayNum = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / 86400000);
// Série : { current, best, today } — current compte les jours consécutifs jusqu'à aujourd'hui (ou jusqu'à hier si le défi du jour n'est pas encore fait :
// la série est encore vivante), best la plus longue série de la liste.
export function streakOf(days, today = dayKey()) {
  const nums = [...new Set((Array.isArray(days) ? days : []).filter((d) => DAY.test(d)).map(dayNum))].filter(Number.isFinite).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const n of nums) { run = prev != null && n === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = n; }
  const S = new Set(nums), t = dayNum(today);
  let k = S.has(t) ? t : S.has(t - 1) ? t - 1 : null, current = 0;
  while (k != null && S.has(k)) { current++; k--; }
  return { current, best, today: S.has(t) };
}
