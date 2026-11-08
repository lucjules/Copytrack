// Variantes de records (Copytrack Evolution, E3) : des catégories de classement sur un même circuit (départ en moto, gravité lunaire, sans
// obstacles…), SÉPARÉES du record officiel. Une variante est un jeu de règles (rulesCore.js) appliqué à une copie du circuit : rien de neuf
// dans la physique. Elle voyage dans la clé de classement, sans aucune migration de la base :
//
//   clé      ::= cléOfficielle [ '~' variante ]                    (80 caractères au plus : contrainte de la table scores)
//   variante ::= 'v1' ( '.' nom '-' valeur )+                       noms triés, chacun une fois, valeurs prises dans une liste fermée
//                (sauf l'étiquette de saison « sea-N », un numéro : elle ne change pas le circuit, le serveur vérifie sa semaine, voir seasons.js)
//   exemples : b-eclats-k3f9a~v1.veh-moto     daily-2026-12-01~v1.g-40     u-1blo03c~v1.obs-0.veh-boat     daily-2026-12-07~v1.gp-60
//
// Ce module est dans la fermeture de la vérification serveur (verify.js) : le jeu et le serveur appliquent EXACTEMENT la même variante.
// Une variante sans effet sur le circuit (départ en voiture sur un circuit qui part déjà en voiture, tours sur un circuit ouvert…) est refusée :
// elle doublerait le classement officiel. Module pur, testé sous Node (tools/test-variants.mjs).
import { applyRules } from './rulesCore.js';

export const VARIANT_VER = 'v1';
export const WIND_DIRS = ['n', 'ne', 'e', 'se', 's', 'so', 'o', 'no'];        // vers où souffle le vent (le nord est en haut de l'éditeur)
export const MAX_KEY = 80;

// Nom -> valeurs permises (texte canonique) et règle correspondante. Ajouter une catégorie = une ligne (ordre alphabétique des noms).
export const VARIANTS = {
  g: { values: ['40', '70', '130', '180'], rule: (v) => ({ g0: +v }) },            // gravité de départ (%)
  gp: { values: ['60', '80'], rule: (v) => ({ grip: +v }) },                       // adhérence de tout le circuit (%) : verglas (E13)
  lap: { values: ['1', '2', '3', '4', '5'], rule: (v) => ({ laps: +v }) },         // nombre de tours (circuits fermés)
  obs: { values: ['0'], rule: () => ({ obstacles: 'off' }) },                       // sans obstacles
  off: { values: ['0', '1'], rule: (v) => ({ offroad: +v }) },                      // hors-piste interdit / permis
  sea: { re: /^[1-9][0-9]{0,3}$/, tag: true, rule: () => ({}) },                   // saison hebdomadaire N (seasons.js) : une étiquette, le circuit ne change pas (E15)
  v0: { values: ['0', '100', '200'], rule: (v) => ({ v0: +v }) },                   // vitesse de départ (km/h)
  veh: { values: ['car', 'moto', 'boat', 'glider'], rule: (v) => ({ veh0: v }) },  // véhicule de départ
  wd: { values: WIND_DIRS, rule: (v) => ({ wind: 25, windDir: WIND_DIRS.indexOf(v) * 45 }) },   // vent de 25 % vers une direction (n, ne, e… ; E13)
};
const NAMES = Object.keys(VARIANTS).sort();
// Valeur permise : dans la liste fermée de la catégorie, ou (étiquette de saison) un numéro sans zéro en tête.
const allowed = (n, val) => (VARIANTS[n].values ? VARIANTS[n].values.includes(val) : VARIANTS[n].re.test(val));

// Règles d'une variante ({ nom: valeur }).
export function rulesOfVariant(v) {
  const r = {};
  for (const n of NAMES) if (v[n] != null) Object.assign(r, VARIANTS[n].rule(String(v[n])));
  return r;
}

// Texte canonique ('' : pas de variante). Lève une erreur sur un nom ou une valeur inconnus.
export function formatVariant(v) {
  const parts = [];
  for (const n of Object.keys(v || {})) if (!Object.hasOwn(VARIANTS, n)) throw new Error('Catégorie de record inconnue.');
  for (const n of NAMES) {
    if (v[n] == null) continue;
    const val = String(v[n]);
    if (!allowed(n, val)) throw new Error('Catégorie de record inconnue.');
    parts.push(`${n}-${val}`);
  }
  return parts.length ? `${VARIANT_VER}.${parts.join('.')}` : '';
}

// Texte -> { nom: valeur }. Refuse tout ce qui n'est pas exactement la forme canonique (deux écritures d'une même variante feraient deux classements).
export function parseVariant(s) {
  const str = String(s || '');
  const m = /^v1((?:\.[a-z0-9]+-[a-z0-9]+)+)$/.exec(str);
  if (!m) throw new Error('Catégorie de record inconnue.');
  const v = {};
  for (const p of m[1].slice(1).split('.')) {
    const i = p.indexOf('-'), n = p.slice(0, i), val = p.slice(i + 1);
    if (!Object.hasOwn(VARIANTS, n) || Object.hasOwn(v, n) || !allowed(n, val)) throw new Error('Catégorie de record inconnue.');
    v[n] = val;
  }
  if (formatVariant(v) !== str) throw new Error('Catégorie de record inconnue.');
  return v;
}

// 'b-x-y~v1.veh-moto' -> { base: 'b-x-y', variant: 'v1.veh-moto' } ; sans « ~ » : variant ''.
export function splitKey(key) {
  const k = String(key || ''), i = k.indexOf('~');
  return i < 0 ? { base: k, variant: '' } : { base: k.slice(0, i), variant: k.slice(i + 1) };
}

export function variantKey(base, v) {
  const s = formatVariant(v);
  if (!s) return base;
  const key = `${base}~${s}`;
  if (key.length > MAX_KEY) throw new Error('Catégorie trop longue pour ce circuit.');
  return key;
}

// Le circuit de la variante : une COPIE (l'original n'est jamais touché). Lève une erreur si la variante ne change rien à la course.
// Une étiquette seule (saison) ne transforme rien : le circuit lui-même (la clé de classement, elle, est à part).
export function applyVariant(track, v) {
  const names = Object.keys(v || {}).filter((n) => v[n] != null);
  if (names.length && names.every((n) => VARIANTS[n] && VARIANTS[n].tag)) return track;
  const t = applyRules(track, rulesOfVariant(v));
  if (t === track || (t.signature() === track.signature() && t.laps === track.laps)) throw new Error('Cette catégorie ne change rien sur ce circuit.');
  return t;
}

// La variante a-t-elle un sens sur ce circuit ?
export function variantFits(track, v) {
  try { applyVariant(track, v); return true; } catch { return false; }
}
