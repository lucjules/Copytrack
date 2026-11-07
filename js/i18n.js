// Internationalisation (français / anglais) : noyau, sans aucune dépendance au navigateur (testé sous Node).
//
// Principe « gettext » : le FRANÇAIS est la langue source et sert de clé. Le code, le HTML et les données du jeu restent écrits en
// français ; en anglais, le texte réellement affiché est traduit au dernier moment par le traducteur DOM (i18n/dom.js), qui s'appuie
// sur ce noyau. Conséquences voulues :
//   - le français n'est jamais touché (aucun dictionnaire chargé, aucune écriture dans le DOM) ;
//   - un texte absent du dictionnaire reste en français : un trou de traduction est une phrase française, jamais un écran cassé ;
//   - pas de refonte des ~25 000 lignes : les textes dynamiques (« 12 pièces · 3 tours ») se traduisent par des modèles à trous.
//
// Dictionnaire (i18n/en.js) : { clé française: traduction }.
//   - clé exacte         : 'Jouer': 'Play'
//   - modèle à trous     : 'Tour {n}/{total}': 'Lap {n}/{total}'     (le texte affiché « Tour 2/3 » est reconnu et ses valeurs reprises)
//   - {x:t} dans la clé  : la valeur captée est elle-même traduite (« Défi du jour : {name:t} », « Garde » devient « Guard »)
//   - {x:w} dans la clé  : la valeur est un seul mot court (nombre, temps, symbole) : empêche un modèle comme « Montée {n} » d'avaler toute une phrase
//   - valeur fonction    : '{n} essais': (v) => `${v.n} ${v.n === '1' ? 'try' : 'tries'}`      (v = valeurs captées, en texte)
//   - clé HTML           : '<b>Rien</b> ne part.': '<b>Nothing</b> leaves.'   (paragraphes à balises : voir i18n/dom.js)
// Les espaces autour du texte sont conservés ; les blancs internes sont réduits à un espace dans la clé comme dans le texte lu.

export const LANGS = ['fr', 'en'];
export const LANG_NAMES = { fr: 'Français', en: 'English' };
export const SOURCE_LANG = 'fr';

let lang = SOURCE_LANG;
const exact = new Map();            // clé normalisée -> valeur (chaîne ou fonction)
const patterns = [];                // modèles à trous, du plus spécifique au plus général
const patternKeys = new Set();
const cache = new Map();            // texte lu -> texte traduit (vidé à chaque changement de langue ou de dictionnaire)
const listeners = new Set();
const CACHE_MAX = 4000;

const LETTER = /[A-Za-zÀ-ÿŒœ]/;
export const norm = (s) => s.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- langue
// Choix de la langue au premier lancement. Un joueur qui a déjà des données sur cet appareil reste en français (on ne change pas
// sa langue sans qu'il l'ait demandé) ; un nouvel appareil suit la langue du navigateur : français si elle l'est, anglais sinon.
export function detectLang({ saved, navigatorLanguages = [], fresh = false } = {}) {
  if (LANGS.includes(saved)) return saved;
  const first = String(navigatorLanguages[0] || '').toLowerCase();
  if (fresh && first && !first.startsWith('fr')) return 'en';
  return SOURCE_LANG;
}

export const getLang = () => lang;
export const locale = () => (lang === 'en' ? 'en-GB' : 'fr-FR');

export function setLang(l) {
  const next = LANGS.includes(l) ? l : SOURCE_LANG;
  if (next === lang) return false;
  lang = next;
  cache.clear();
  for (const fn of listeners) fn(lang);
  return true;
}
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---------------------------------------------------------------- dictionnaire
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HOLE = /\{(\w+)(?::([tw]+))?\}/g;
const HOLE_ANY = /\{\w+(?::[tw]+)?\}/;

// Ajoute des entrées { clé: valeur } (appelable plusieurs fois : le dictionnaire est découpé par domaine). Renvoie le nombre d'entrées.
export function register(entries) {
  let n = 0;
  for (const [rawKey, value] of Object.entries(entries)) {
    const key = norm(rawKey);
    exact.set(key, value);
    n++;
    if (!HOLE_ANY.test(key)) continue;
    if (!key.replace(new RegExp(HOLE_ANY.source, 'g'), '').trim()) throw new Error('Modèle sans texte fixe : ' + rawKey);
    const names = [], translate = new Set();
    let src = '', last = 0, m;
    HOLE.lastIndex = 0;
    while ((m = HOLE.exec(key))) {
      src += escapeRe(key.slice(last, m.index)) + (m[2] && m[2].includes('w') ? '(\\S{0,16})' : '([\\s\\S]*?)');
      last = m.index + m[0].length;
      names.push(m[1]);
      if (m[2] && m[2].includes('t')) translate.add(m[1]);
    }
    src += escapeRe(key.slice(last));
    const firstHole = key.search(HOLE_ANY);
    const lastHole = key.lastIndexOf('}');
    patternKeys.add(key);
    const idx = patterns.findIndex((p) => p.key === key);
    const entry = {
      key, value, names, translate, re: new RegExp('^' + src + '$'),
      prefix: key.slice(0, firstHole), suffix: key.slice(lastHole + 1),
      literal: key.replace(new RegExp(HOLE_ANY.source, 'g'), '').length,
      weak: /^\{\w+:t\}.*\{\w+:t\}$/.test(key),        // simple composition « {a:t} (…) : {b:t} » : traduit les morceaux, ne prouve pas qu'un texte soit couvert        // plus il y a de texte fixe, plus le modèle est précis
    };
    if (idx >= 0) patterns[idx] = entry; else patterns.push(entry);
  }
  patterns.sort((a, b) => b.literal - a.literal);
  cache.clear();
  return n;
}

export function resetDictionary() { exact.clear(); patterns.length = 0; patternKeys.clear(); cache.clear(); }
export const dictionarySize = () => exact.size;
export function* entries() { for (const [k, v] of exact) yield [k, v]; }

const fill = (template, vars) => template.replace(/\{(\w+)(?::[tw]+)?\}/g, (all, k) => (k in vars ? String(vars[k]) : all));
const render = (value, vars) => (typeof value === 'function' ? value(vars) : fill(value, vars));

// Traduction d'un texte déjà normalisé : clé exacte, sinon modèle à trous. null = pas de traduction.
function lookup(key, depth = 0, strict = false) {
  const hit = exact.get(key);
  if (hit !== undefined && !patternKeys.has(key)) return typeof hit === 'function' ? hit({}) : hit;
  for (const p of patterns) {
    if (strict && p.weak) continue;
    if (key.length < p.prefix.length + p.suffix.length) continue;
    if (p.prefix && !key.startsWith(p.prefix)) continue;
    if (p.suffix && !key.endsWith(p.suffix)) continue;
    const m = p.re.exec(key);
    if (!m) continue;
    const vars = {};
    p.names.forEach((name, i) => {
      let v = m[i + 1];
      if (p.translate.has(name) && depth < 2) v = translateValue(v, depth + 1);
      vars[name] = v;
    });
    return render(p.value, vars);
  }
  return null;
}

// Valeur captée d'un trou {x:t} : traduite en entier si possible, sinon par morceaux séparés par « / », « + », « · » ou une fin de phrase
// (« T / Entrée » -> « T / Enter » ; « Il faut une arrivée. Départ » -> les deux messages traduits).
function translateValue(v, depth) {
  const whole = lookup(norm(v), depth);
  if (whole != null) return whole;
  if (!/ [/+·] |[.!?] \S/.test(v)) return v;
  return v.split(/( [/+·] |(?<=[.!?]) )/).map((part, i) => (i % 2 ? part : (lookup(norm(part), depth) ?? part))).join('');
}

// Traduit un texte lu dans le DOM (ou une chaîne HTML). Les blancs de début et de fin sont conservés. Sans traduction : le texte tel quel.
export function translate(text) {
  if (lang === SOURCE_LANG || typeof text !== 'string' || !text || !LETTER.test(text)) return text;       // chrono, vitesse : rien à traduire
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  const core = m[2];
  let out = text;
  if (core && LETTER.test(core)) {
    const tr = lookup(norm(core));
    if (tr != null) out = m[1] + tr + m[3];
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(text, out);
  return out;
}

// Le texte (déjà normalisé ou non) a-t-il une entrée au dictionnaire, même identique au français ? (contrôles de couverture)
// Les modèles de pure composition (« {a:t} ({k}) : {b:t} ») ne comptent pas : ils traduisent les morceaux d'une infobulle,
// pas la phrase entière ; un texte qui ne passe que par eux n'est pas « couvert ».
export function hasTranslation(text) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(String(text));
  return !!m[2] && lookup(norm(m[2]), 0, true) != null;
}

// Pour le code qui écrit un texte hors du DOM (presse-papiers, partage, titre de page, fichier) :
//   t('Tour {n}/{total}', { n: 2, total: 3 })  ->  « Tour 2/3 » ou « Lap 2/3 ».
export function t(template, vars = {}) {
  if (lang === SOURCE_LANG) return fill(template, vars);
  const key = norm(template);
  const hit = exact.get(key);
  if (hit !== undefined) return render(hit, vars);
  return fill(template, vars);
}

// Pluriel anglais pour les valeurs de modèles : plural('3', 'try', 'tries').
export const plural = (n, one, many) => (Number(n) === 1 ? one : many);

// Un texte contient-il du français probable ? (contrôles de couverture : lettres accentuées ou mots-outils courants)
const FR_WORDS = /(^|[^A-Za-zÀ-ÿ])(le|la|les|un|une|des|du|de|et|ou|est|pas|pour|avec|sans|sur|dans|ton|ta|tes|toi|moi|ce|cette|qui|que|vous|tu|ne|se|au|aux|mon|mes|ici|tout|tous|toutes)([^A-Za-zÀ-ÿ]|$)/i;
export function looksFrench(text) {
  const s = String(text);
  return /[àâçéèêëîïôùûüœÀÂÇÉÈÊËÎÏÔÙÛÜŒ]/.test(s) || FR_WORDS.test(s);
}
