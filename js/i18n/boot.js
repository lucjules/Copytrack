// Démarrage de l'internationalisation : choix de la langue, chargement du dictionnaire, traducteur DOM, sélecteurs de langue.
//
// La langue est un réglage de l'APPAREIL (clé hors portée « copytrack.lang ») : elle doit être connue avant l'écran d'accueil, c'est-à-dire
// avant que le jeu sache quel joueur (invité ou compte) lit quels réglages.
import { getGlobal, setGlobal } from '../storage.js';
import { LANGS, LANG_NAMES, detectLang, setLang, register, getLang, SOURCE_LANG } from '../i18n.js';
import { installDomTranslator } from './dom.js';

// Un dictionnaire par langue, chargé à la demande : le français (langue source) n'en charge aucun.
const DICTIONARIES = { en: () => import('./en.js') };
const loaded = new Set();
let translator = null;

async function loadDictionary(lang) {
  if (lang === SOURCE_LANG || loaded.has(lang) || !DICTIONARIES[lang]) return;
  const mod = await DICTIONARIES[lang]();
  register(mod.default);
  loaded.add(lang);
}

// Aucune donnée du jeu sur cet appareil : premier lancement.
function isFreshDevice() {
  try { return !Object.keys(localStorage).some((k) => (k.startsWith('shardway') || k.startsWith('copytrack.')) && k !== 'copytrack.lang'); } catch { return false; }
}

// Change la langue (dictionnaire, <html lang>, traduction de la page, mémorisation). Renvoie la langue effectivement appliquée.
export async function switchLanguage(lang, { persist = true } = {}) {
  const next = LANGS.includes(lang) ? lang : SOURCE_LANG;
  try { await loadDictionary(next); } catch (err) { console.warn('Dictionnaire indisponible, retour au français', err); return switchLanguage(SOURCE_LANG, { persist }); }
  if (!translator) translator = installDomTranslator(document);
  setLang(next);
  document.documentElement.lang = next;
  if (persist) setGlobal('lang', next);
  syncControls();
  return getLang();
}

export async function initI18n() {
  const saved = getGlobal('lang', null);
  const nav = typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) : [];
  const lang = detectLang({ saved, navigatorLanguages: nav, fresh: saved == null && isFreshDevice() });
  await switchLanguage(lang, { persist: saved == null });
  bindLanguageControls(document);
  return lang;
}

// Sélecteurs de langue : <select id="opt-lang"> (Options) et boutons [data-lang] (écran d'accueil).
function syncControls() {
  const sel = document.getElementById('opt-lang');
  if (sel) sel.value = getLang();
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
}

export function bindLanguageControls(root) {
  const sel = root.getElementById ? root.getElementById('opt-lang') : root.querySelector('#opt-lang');
  if (sel && !sel.dataset.bound) {
    sel.dataset.bound = '1';
    sel.replaceChildren(...LANGS.map((l) => Object.assign(document.createElement('option'), { value: l, textContent: LANG_NAMES[l] })));
    sel.addEventListener('change', () => { switchLanguage(sel.value); });
  }
  root.querySelectorAll('[data-lang]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => { switchLanguage(b.dataset.lang); });
  });
  syncControls();
}
