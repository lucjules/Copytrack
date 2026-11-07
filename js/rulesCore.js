// Règles de partie : le noyau sans dépendance (validation et application au circuit). Il est dans la fermeture de la vérification serveur
// (js/verify.js, via variants.js : les variantes de records sont des règles) : il n'importe que obstacles.js, jamais le profil ni le stockage.
// rules.js le ré-exporte (son interface ne change pas). Module pur, testé sous Node.
import { isObstacle } from './obstacles.js';

export const VEHICLE_CHOICES = [['', 'Celui du circuit'], ['car', 'Voiture'], ['moto', 'Moto'], ['boat', 'Bateau'], ['glider', 'Deltaplane']];
export const GRAVITY_CHOICES = [[0, 'Celle du circuit'], [40, 'Lunaire (40 %)'], [70, 'Légère (70 %)'], [130, 'Lourde (130 %)'], [180, 'Écrasante (180 %)']];
export const DEFAULT_RULES = Object.freeze({ laps: 0, g0: 0, veh0: '', v0: -1, offroad: -1, obstacles: '', sameCars: 0 });
const VEHICLES = VEHICLE_CHOICES.map(([k]) => k).filter(Boolean);
const int = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

export function sanitizeRules(r) {
  const o = r && typeof r === 'object' ? r : {};
  return {
    laps: o.laps ? int(o.laps, 1, 5, 0) : 0,                                   // 0 : tel que le circuit (seuls les circuits fermés peuvent changer de nombre de tours)
    g0: o.g0 ? int(o.g0, 15, 250, 0) : 0,                                      // gravité de départ, en % (0 : inchangée)
    veh0: VEHICLES.includes(o.veh0) ? o.veh0 : '',
    v0: o.v0 >= 0 ? int(o.v0, 0, 300, -1) : -1,                                 // vitesse de départ en km/h (-1 : inchangée)
    offroad: o.offroad === 1 || o.offroad === true ? 1 : o.offroad === 0 || o.offroad === false ? 0 : -1,
    obstacles: o.obstacles === 'off' ? 'off' : '',
    sameCars: o.sameCars ? 1 : 0,                                              // toutes les voitures du salon ont la même apparence (visuel seul)
  };
}
export const isDefaultRules = (r) => JSON.stringify(sanitizeRules(r)) === JSON.stringify(DEFAULT_RULES);

// Renvoie le circuit à jouer : une COPIE transformée (l'original n'est jamais modifié), ou le circuit lui-même si aucune règle ne s'applique.
export function applyRules(track, rules) {
  const r = sanitizeRules(rules);
  if (isDefaultRules(r)) return track;
  const t = track.clone();
  if (track.path) t.path = track.path;            // ligne centrale du circuit intégré (classement en direct) : clone() ne la copie pas
  const p = {};
  if (r.g0) p.g0 = r.g0;
  if (r.veh0) p.veh0 = r.veh0;
  if (r.v0 >= 0) p.v0 = r.v0;
  if (r.offroad >= 0) p.offroad = r.offroad;
  t.setParams(p);
  if (r.laps && t.laps > 1) {
    if (t.path) {                                   // la ligne centrale répète un tour : on la refait pour le nouveau nombre de tours (voir tracks.js)
      const L = Math.round((t.path.length - 1) / t.laps) + 1, one = t.path.slice(0, L), pilot = t.path.pilot;
      const path = one.slice();
      for (let k = 1; k < r.laps; k++) path.push(...one.slice(1));
      if (pilot) path.pilot = pilot;
      t.path = path;
    }
    t.laps = r.laps;
  }
  if (r.obstacles === 'off') for (const d of t.decos.slice()) if (isObstacle(d.k)) t.removeDeco(d);
  return t;
}

