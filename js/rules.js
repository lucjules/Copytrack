// Règles de partie et modes de jeu (lot 13). Une RÈGLE est un réglage de départ qu'un circuit sait déjà porter (gravité de départ, vitesse de départ, véhicule de départ, hors-piste, tours)
// ou une transformation du circuit (sans obstacles) : rien de nouveau dans la physique, aucune voiture ne change de performances. Un MODE réunit des règles, un objectif et un nom ;
// il se joue sur n'importe quel circuit, sans records ni classements (le circuit transformé n'est plus celui des classements), et se partage par un code « SHM1: ».
// Module pur (testé sous Node).
import { GOALS } from './career.js';
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

// Phrases lisibles des règles actives (liste vide : aucune).
export function describeRules(rules) {
  const r = sanitizeRules(rules), out = [];
  if (r.g0) out.push(`Gravité de départ ${r.g0} %`);
  if (r.veh0) out.push('Départ en ' + { car: 'voiture', moto: 'moto', boat: 'bateau', glider: 'deltaplane' }[r.veh0]);
  if (r.v0 >= 0) out.push(r.v0 ? `Vitesse de départ ${r.v0} km/h` : 'Départ arrêté');
  if (r.offroad === 1) out.push('Hors piste autorisé'); else if (r.offroad === 0) out.push('Hors piste interdit');
  if (r.laps) out.push(`${r.laps} tour${r.laps > 1 ? 's' : ''} (circuits fermés)`);
  if (r.obstacles === 'off') out.push('Sans obstacles');
  if (r.sameCars) out.push('Voitures identiques');
  return out;
}

// ---------------------------------------------------------------- modes
export function sanitizeGoal(g) {
  const o = g && typeof g === 'object' ? g : {};
  if (typeof o.id !== 'string' || !Object.hasOwn(GOALS, o.id)) return null;      // (hasOwn : « __proto__ » et « constructor » ne sont pas des objectifs)
  const out = { id: o.id };
  if (['perfect', 'turbo', 'rings'].includes(o.id)) out.n = int(o.n, 1, 9, 1);
  if (o.id === 'vehicle') out.v = ['moto', 'boat', 'glider', 'car'].includes(o.v) ? o.v : 'moto';
  if (o.id === 'under') out.t = int(o.t, 5, 900, 60);
  return out;
}
export const cleanModeName = (n) => String(n == null ? '' : n).replace(/[^\p{L}\p{N} _'’.!-]/gu, '').trim().slice(0, 24) || 'Mon mode';
export function sanitizeMode(m) {
  const o = m && typeof m === 'object' ? m : {};
  return { name: cleanModeName(o.name), desc: String(o.desc == null ? '' : o.desc).replace(/[^\p{L}\p{N} _'’.,!?:;()+-]/gu, '').trim().slice(0, 100), rules: sanitizeRules(o.rules), goal: sanitizeGoal(o.goal) };
}

const b64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const pad = t + '='.repeat((4 - (t.length % 4)) % 4); return typeof atob === 'function' ? decodeURIComponent(escape(atob(pad))) : Buffer.from(pad, 'base64').toString('utf8'); };
export const encodeMode = (m) => 'SHM1:' + b64(JSON.stringify(sanitizeMode(m)));
export function decodeMode(code) {
  const t = String(code || '').trim();
  if (!t.startsWith('SHM1:')) throw new Error('Ce n\'est pas un code de mode (il commence par SHM1:).');
  if (t.length > 2000) throw new Error('Code de mode trop long.');
  let o;
  try { o = JSON.parse(unb64(t.slice(5))); } catch { throw new Error('Code de mode invalide ou coupé.'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Code de mode invalide ou coupé.');
  return sanitizeMode(o);
}

// Modes fournis (jouables tout de suite).
export const BUILTIN_MODES = [
  { id: 'lune', name: 'Sauts lunaires', desc: 'Gravité réduite : tout est plus long.', rules: { g0: 40 }, goal: { id: 'norespawn' } },
  { id: 'plomb', name: 'Pieds de plomb', desc: 'Gravité lourde : les sauts retombent vite.', rules: { g0: 150 }, goal: { id: 'nowall' } },
  { id: 'libre', name: 'Route libre', desc: 'Hors piste autorisé, sans obstacles.', rules: { offroad: 1, obstacles: 'off' }, goal: null },
  { id: 'moto', name: 'Tout en moto', desc: 'Départ en moto : finis à moto.', rules: { veh0: 'moto' }, goal: { id: 'vehicle', v: 'moto' } },
  { id: 'lancee', name: 'Départ lancé', desc: 'Départ à 200 km/h.', rules: { v0: 200 }, goal: { id: 'perfect', n: 1 } },
  { id: 'marathon', name: 'Marathon', desc: 'Cinq tours sur les circuits fermés.', rules: { laps: 5 }, goal: { id: 'norespawn' } },
];
export const MAX_MODES = 20;
