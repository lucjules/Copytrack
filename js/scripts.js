// Scripts de circuit (lot 12) : des déclencheurs posés sur une case du circuit. Quand la voiture passe dessus, UN effet visuel ou sonore se produit
// (message, moment de la journée, météo, brume, musique, éclat, secousse, son). Hors signature (comme l'ambiance) : ni records, ni vérification, ni physique.
// Volontairement AUCUN effet sur la conduite (gravité, vitesse, obstacles…) : ce serait de la physique, donc une autre version de la physique pour tous.
// Module pur (testé sous Node) : validation, forme compacte, ensemble des cases.
import { SKY_CHOICES, FOG_CHOICES, WEATHER_CHOICES } from './ambiance.js';

export const MAX_SCRIPTS = 16;
export const SCRIPT_SOUNDS = [['ding', 'Ding'], ['whoosh', 'Souffle'], ['horn', 'Klaxon'], ['boost', 'Turbo'], ['bounce', 'Rebond']];
const opts = (list, none) => list.filter(([k]) => k || none);
// Actions : [identifiant, libellé, choix de la valeur (null : texte libre ; 'color' : couleur)]
export const SCRIPT_ACTIONS = [
  ['msg', 'Afficher un message', null],
  ['sky', 'Changer le moment de la journée', opts(SKY_CHOICES, true)],
  ['weather', 'Changer la météo', opts(WEATHER_CHOICES, true)],
  ['fog', 'Changer la brume', opts(FOG_CHOICES, true)],
  ['music', 'Changer la musique', [['', 'Chill de course'], ['menu', 'Groove du menu'], ['none', 'Silence']]],
  ['burst', 'Lancer un éclat de couleur', 'color'],
  ['shake', 'Secouer la caméra', [['1', 'Légèrement'], ['2', 'Fort']]],
  ['sound', 'Jouer un son', SCRIPT_SOUNDS],
];
const IDS = SCRIPT_ACTIONS.map(([id]) => id);
const choicesOf = (id) => { const c = SCRIPT_ACTIONS.find((a) => a[0] === id)[2]; return Array.isArray(c) ? c.map(([k]) => k) : null; };
const HEX = /^#[0-9a-f]{6}$/i;
const cell = (v) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.max(-500, Math.min(500, n)) : 0; };

export function sanitizeScript(s) {
  if (!s || typeof s !== 'object' || !IDS.includes(s.a)) return null;
  const ch = choicesOf(s.a);
  let v = String(s.v == null ? '' : s.v);
  if (s.a === 'msg') v = v.replace(/[^\p{L}\p{N} _'’.,!?:;()+\-×÷%/]/gu, '').trim().slice(0, 40);
  else if (s.a === 'burst') v = HEX.test(v) ? v.toLowerCase() : '#ffd23e';
  else if (!ch.includes(v)) v = ch[0] === undefined ? '' : (s.a === 'shake' || s.a === 'sound' ? ch[0] : '');
  if (s.a === 'msg' && !v) return null;
  return { x: cell(s.x), z: cell(s.z), a: s.a, v };
}
export const sanitizeScripts = (list) => (Array.isArray(list) ? list.slice(0, MAX_SCRIPTS).map(sanitizeScript).filter(Boolean) : []);

// Forme compacte du code du circuit (champ « sc ») : [[x, z, indice de l'action, valeur], …]
export const scriptsToArray = (list) => { const l = sanitizeScripts(list); return l.length ? l.map((s) => [s.x, s.z, IDS.indexOf(s.a), s.v]) : null; };
export const scriptsFromArray = (arr) => sanitizeScripts(Array.isArray(arr) ? arr.slice(0, MAX_SCRIPTS).map((a) => (Array.isArray(a) ? { x: a[0], z: a[1], a: IDS[a[2]], v: a[3] } : null)) : []);

// Pendant la course : quels déclencheurs la voiture vient-elle de toucher ? done : Set des indices déjà joués (chacun ne se joue qu'une fois par essai).
export function scriptsAt(list, cx, cz, done) {
  const hit = [];
  for (let i = 0; i < list.length; i++) if (!done.has(i) && list[i].x === cx && list[i].z === cz) { done.add(i); hit.push(list[i]); }
  return hit;
}
