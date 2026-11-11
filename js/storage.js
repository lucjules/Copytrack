// Persistance locale (navigateur) : réglages, records + fantômes, circuits perso.
//
// Portée (« scope ») : un invité écrit dans « shardway.* » (les sauvegardes d'avant les comptes restent donc
// valables) ; chaque compte écrit dans « shardwayacct.<id du compte>.* ». Les deux familles de clés ne se
// recouvrent pas : la progression d'un compte et celle d'un invité ne se mélangent jamais sur un même navigateur.
// La portée se règle une fois, au lancement, avant que le jeu ne lise quoi que ce soit.
const GUEST_PREFIX = 'shardway.';
let PREFIX = GUEST_PREFIX;

export function setScope(accountId) {
  PREFIX = accountId ? 'shardwayacct.' + accountId + '.' : GUEST_PREFIX;
}
export const getScope = () => (PREFIX === GUEST_PREFIX ? '' : PREFIX.slice('shardwayacct.'.length, -1));

// Clés hors portée (identité du compte, marqueur de session invité) : lues avant de choisir la portée.
export function getGlobal(key, fallback = null) {
  try { const v = localStorage.getItem('copytrack.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function setGlobal(key, value) {
  try {
    if (value == null) localStorage.removeItem('copytrack.' + key); else localStorage.setItem('copytrack.' + key, JSON.stringify(value));
    return true;
  } catch { return false; }
}
export function getSessionFlag(key) { try { return sessionStorage.getItem('copytrack.' + key); } catch { return null; } }
export function setSessionFlag(key, value) {
  try { if (value == null) sessionStorage.removeItem('copytrack.' + key); else sessionStorage.setItem('copytrack.' + key, String(value)); } catch { /* sans importance */ }
}

// Appelé après chaque écriture réussie (sert à la synchronisation du compte).
let writeHook = null;
export function onWrite(fn) { writeHook = fn; }

function read(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v == null) return fallback;
    const parsed = JSON.parse(v);
    return parsed;
  } catch {
    return fallback;
  }
}

// lastWriteOk : la DERNIÈRE écriture a-t-elle réussi ? (stockage plein, navigation privée, quota : setItem lève une exception). Les appelants dont la donnée ne se
// refabrique pas (un circuit qu'on enregistre) s'en servent pour le dire au joueur au lieu d'annoncer un succès.
let lastWriteOk = true;
export const wroteOk = () => lastWriteOk;
function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    if (writeHook) writeHook(key);
    lastWriteOk = true;
    return true;
  } catch {
    lastWriteOk = false;
    return false;
  }
}

// Retire des clés de la portée courante (synchronisation du compte : ce que la fusion a écarté, voir account.js) ; la copie en mémoire des records suit.
export function removeKeys(keys) {
  for (const k of keys) {
    try { localStorage.removeItem(PREFIX + k); } catch { /* stockage indisponible */ }
    if (k.startsWith(REC)) memRec.delete(PREFIX + k.slice(REC.length));
  }
}

function listPrefixedKeys() {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  } catch {
    return [];
  }
}

// Accès bruts (profil, sauvegarde complète).
export function getJSON(key, fallback) { return read(key, fallback); }
export function setJSON(key, value) { return write(key, value); }

// Clés qui n'appartiennent qu'à CET appareil et ne doivent JAMAIS voyager dans un code joueur, une sauvegarde partagée ou une restauration : la session en ligne
// de l'invité (jeton d'accès et de renouvellement = son identité en ligne : classements, circuits publiés) et son profil en ligne. Un code joueur se copie, se
// poste, se confie ; s'il contenait la session, quiconque l'importerait deviendrait ce pilote (et l'importer chez soi écraserait sa propre identité en ligne).
export const DEVICE_ONLY_KEYS = ['online.session', 'online.player', 'vproof'];      // vproof : la course de vérification d'un circuit (js/authorProof.js), lourde et propre à l'appareil

// Toutes les données du jeu (clés « shardway.* », gardées pour ne perdre aucune sauvegarde) sous forme d'objet.
export function dumpAll({ shareable = false } = {}) {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) { const name = k.slice(PREFIX.length); if (!(shareable && DEVICE_ONLY_KEYS.includes(name))) out[name] = localStorage.getItem(k); }
    }
  } catch { /* stockage indisponible */ }
  return out;
}

export function restoreAll(data, keep = false) {
  try {
    if (!keep) {
      listPrefixedKeys().forEach((k) => localStorage.removeItem(k));
    }
    for (const [k, v] of Object.entries(data || {})) {
      if (typeof v === 'string') localStorage.setItem(PREFIX + k, v);
    }
    return true;
  } catch { return false; }
}

export const DEFAULT_SETTINGS = {
  volume: 0.7,
  quality: 'auto',         // auto | ultra | high | medium | low | potato | ultrapotato (voir quality.js)
  gfxProfile: '',          // dernier profil trouvé par la détection automatique
  gfxV: 0,                 // version des profils au moment de la détection
  gfxFps: 0,               // images par seconde mesurées à ce moment-là
  carColor: '#ffd23e',
  ghost: true,
  camera: 0,
  playerName: '',         // aucun pseudo par défaut : l'écran d'accueil le demande (voir welcome.js)
  touchMode: 'buttons',   // buttons | drag
  haptics: true,
  padDeadzone: 0.15,
  padSens: 1,
  // v1.5
  musicVolume: 0.45,
  fovAdd: 0,          // champ de vision en plus (degrés)
  speedFx: true,      // lignes de vitesse
  shakeAmt: 1,        // intensité des tremblements de caméra (0 à 1)
  colorblind: false,  // couleurs de revêtements adaptées + motifs renforcés
  uiScale: 1,         // taille de l'interface
  showFps: false,
  tutorialDone: false,
  ghostGold: true,
  ghostImported: true,
  onlineScores: true,
  ui: {},                 // thème et disposition de l'interface (uitheme.js)
  hudProfile: 'classic',  // profil du HUD : classic | competitive | training | minimal (hudProfile.js)
  training: null,         // HUD d'entraînement : { ref, w } (hudProfile.js : sanitizeTraining) ; null = réglages par défaut
  cameras: [],            // caméras de course personnalisées (camprefs.js)
  feel: 1,                // sensations de course : 0 (aucun effet ajouté) à 1,5 ; voir feel.js
  editorGuided: null,     // éditeur en mode guidé (l'essentiel) : null = non (joueur qui connaît déjà l'éditeur), true = oui (voir editor/palette.js)
  telemetry: null,        // statistiques anonymes (voir telemetry.js) : null = pas encore demandé, true = accepté, false = refusé
  aids: {},               // aides à la conduite (aids.js) : { autoGas, brakeAssist, steerAssist, antiSpin, smoothSteer } ; une course aidée est classée « assisté »
  steerCurve: 1,          // réponse du volant analogique (manette, pouce) : 1 linéaire à 2 très progressive (aids.js)
  reduceMotion: 'auto',   // animations : 'auto' (réglage du système), 'on' (réduites), 'off' (normales) ; voir a11y.js
};

export function loadSettings() {
  const saved = read('settings', {});
  return {
    ...DEFAULT_SETTINGS,
    ...(saved && typeof saved === 'object' ? saved : {}),
    keys: { ...((saved && saved.keys) || {}) },
    pad: { ...((saved && saved.pad) || {}) },
  };
}

export function saveSettings(s) {
  write('settings', s);
}

// ---- Records -------------------------------------------------------------
// v1.1 : pistes plus larges et physique revue => les records v1.0 (préfixe
// "rec.") ne sont plus comparables. On utilise "rec2." et on purge l'ancien.
// v1.5 : nouvelle physique (assiette en l'air, réceptions, mini-turbo) => "rec3.".
const REC = 'rec3.';

export function purgeOldRecords() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + 'rec.') || k.startsWith(PREFIX + 'rec2.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* stockage indisponible */ }
}

// ---- Fantômes importés (code SHG1) et défi du jour --------------------------------
export function getImportedGhost(trackKey) {
  return read('ghostImp.' + trackKey, null);
}

export function setImportedGhost(trackKey, g) {
  write('ghostImp.' + trackKey, g);
}

export function clearRecords() {
  for (const k of [...memRec.keys()]) if (k.startsWith(PREFIX)) memRec.delete(k);
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + 'rec') || k.startsWith(PREFIX + RUNS))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* stockage indisponible */ }
  // Pierre tombale : sans elle, la synchronisation du compte ramènerait les records effacés depuis le cloud.
  write('recReset', Date.now());
}

// Copie en mémoire des records de cette session : si le stockage du navigateur est plein ou refuse d'écrire, le menu affiche
// quand même le temps et les médailles qui viennent d'être gagnés (la progression ne dépend plus de la place disponible).
const memRec = new Map();
const slim = (rec) => ({ ...rec, ghost: null, inputs: null });

export function getRecord(trackKey) {
  const disk = read(REC + trackKey, null);
  const mem = memRec.get(PREFIX + trackKey);
  if (!disk) return mem || null;
  // La copie en mémoire de cette session ne l'emporte que si elle est de la même physique et meilleure, ou d'une physique plus récente : sinon une synchronisation qui
  // rapporte le record d'une physique plus récente (autre appareil) restait cachée derrière un meilleur temps d'une ancienne physique.
  if (!mem) return disk;
  const mp = +mem.pv || 0, dp = +disk.pv || 0;
  return mp === dp ? (mem.time < disk.time - 1e-9 ? mem : disk) : (mp > dp ? mem : disk);
}

// Écrit le record, quitte à perdre ce qui prend de la place : d'abord le fantôme, puis les commandes enregistrées, puis (si
// le stockage est vraiment plein) le fantôme et les commandes des AUTRES circuits, du plus ancien au plus récent. Le temps, lui,
// n'est jamais perdu. Renvoie true si le record est bien sur le disque.
// Meilleur temps JAMAIS réalisé sur ce circuit, toutes versions de la physique confondues (rec.bt) : c'est lui qui donne les médailles et les déblocages.
// Une mise à jour de la physique rend les anciens temps non comparables (le record est alors remplacé par la première arrivée sous la nouvelle
// physique, même plus lente) : sans cette mémoire, une médaille d'or gagnée avant la mise à jour pouvait redescendre en argent, et reverrouiller
// la suite de la carrière. Le temps du record (rec.time), lui, reste celui de la physique courante (classements, fantôme, replay).
export const medalTime = (rec) => (rec ? Math.min(rec.time, Number.isFinite(+rec.bt) && +rec.bt > 0 ? +rec.bt : rec.time) : null);
export function saveRecord(trackKey, rec) {
  const old = getRecord(trackKey);
  if (old) { const bt = Math.min(medalTime(old), medalTime(rec)); if (bt < rec.time - 1e-9) rec = { ...rec, bt }; }
  memRec.set(PREFIX + trackKey, slim(rec));
  const tiers = [rec, { ...rec, ghost: null }, slim(rec)];
  return makeRoom(() => tiers.some((t) => write(REC + trackKey, t)), PREFIX + REC + trackKey);
}

// Stockage plein : on libère de la place en retirant le fantôme et les commandes des records (du plus ancien au plus récent, sauf `except`), en réessayant après
// chacun. Les temps, eux, ne sont jamais perdus. Renvoie true dès que `tryWrite` réussit.
function makeRoom(tryWrite, except = '') {
  if (tryWrite()) return true;
  let keys;
  try { keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX + REC) && k !== except); } catch { return false; }
  const others = keys.map((k) => { try { return { k, v: JSON.parse(localStorage.getItem(k)) }; } catch { return null; } })
    .filter((o) => o && o.v && (o.v.ghost || o.v.inputs)).sort((a, b) => (a.v.date || 0) - (b.v.date || 0));
  for (const o of others) {
    try { localStorage.setItem(o.k, JSON.stringify(slim(o.v))); } catch { /* on continue */ }
    if (tryWrite()) return true;
  }
  return false;
}

// ---- Dernières courses d'un circuit (Race Hub, onglet Personnel) ---------------------------------------------------------------------------
// « runs.<clé> » : les RUNS_MAX dernières courses terminées, de la plus récente à la plus ancienne : { time, date } (ni fantôme ni commandes :
// le record garde les siennes). Synchronisé avec le compte (cloudsave.js : fusion par date).
const RUNS = 'runs.';
export const RUNS_MAX = 10;
export function cleanRuns(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((r) => r && Number.isFinite(+r.time) && +r.time > 0 && Number.isFinite(+r.date))
    .map((r) => ({ time: +r.time, date: +r.date }))
    .sort((a, b) => b.date - a.date)
    .filter((r) => { const k = r.date + ':' + r.time; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, RUNS_MAX);
}
export function listRuns(trackKey) { return cleanRuns(read(RUNS + trackKey, [])); }
export function pushRun(trackKey, run) {
  if (!trackKey) return false;
  return write(RUNS + trackKey, cleanRuns([{ time: run.time, date: run.date || Date.now() }, ...listRuns(trackKey)]));
}

// ---- Circuits personnels ---------------------------------------------------
export function listMyTracks() {
  const tracks = read('tracks', []);
  return Array.isArray(tracks) ? tracks : [];
}

export function saveMyTrack(entry) {
  const list = listMyTracks();
  const i = list.findIndex((t) => t.id === entry.id);
  entry.updated = Date.now();
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  // Un circuit ne se refabrique pas : si le stockage est plein, on fait de la place (fantômes des records) avant de renoncer. L'appelant vérifie wroteOk() :
  // avant 0.9.59 l'écriture ratée passait inaperçue et l'éditeur annonçait « Circuit enregistré » (circuit perdu à la fermeture de la page).
  makeRoom(() => write('tracks', list));
  return entry;
}

// ---- Prefabs de l'éditeur (bibliothèque locale : jusqu'à PREFAB_MAX ; elle ne se synchronise pas avec le compte, le partage se fait par le code « SHP1: ») ----
export const PREFAB_MAX = 40;
export function listPrefabs() {
  const l = read('prefabs', []);
  return Array.isArray(l) ? l.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.code === 'string' && p.code.startsWith('SHP1:')).slice(0, PREFAB_MAX) : [];
}
export function savePrefab({ id, name, code }) {
  const entry = { id: String(id).slice(0, 30), name: String(name).slice(0, 40) || 'Prefab', code: String(code), updated: Date.now() };
  const list = listPrefabs().filter((p) => p.id !== entry.id);
  list.unshift(entry);
  write('prefabs', list.slice(0, PREFAB_MAX));
  return entry;
}
export function deletePrefab(id) {
  write('prefabs', listPrefabs().filter((p) => p.id !== id));
}

// ---- Pièces décoratives perso (bibliothèque locale, customDeco.js) : jusqu'à CDECO_MAX ; le partage se fait par le code « SHD1: » ----
export const CDECO_MAX = 30;
export function listCustomDecos() {
  const l = read('cdecos', []);
  return Array.isArray(l) ? l.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.parts)).slice(0, CDECO_MAX) : [];
}
export function saveCustomDeco({ id, name, parts }) {
  const entry = { id: String(id).slice(0, 30), name: String(name).slice(0, 24) || 'Ma pièce', parts, updated: Date.now() };
  const list = listCustomDecos().filter((p) => p.id !== entry.id);
  list.unshift(entry);
  write('cdecos', list.slice(0, CDECO_MAX));
  return entry;
}
export function deleteCustomDeco(id) { write('cdecos', listCustomDecos().filter((p) => p.id !== id)); }

// ---- Modes de jeu du joueur (rules.js) : jusqu'à MAX_MODES ; ils se partagent par le code « SHM1: » ----
export const MODES_MAX = 20;
export function listModes() {
  const l = read('modes', []);
  return Array.isArray(l) ? l.filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string' && m.rules && typeof m.rules === 'object').slice(0, MODES_MAX) : [];
}
export function saveMode(mode) {
  const entry = { id: String(mode.id).slice(0, 30), name: String(mode.name).slice(0, 24), desc: String(mode.desc || '').slice(0, 100), rules: mode.rules, goal: mode.goal || null, updated: Date.now() };
  const list = listModes().filter((m) => m.id !== entry.id);
  list.unshift(entry);
  write('modes', list.slice(0, MODES_MAX));
  return entry;
}
export function deleteMode(id) { write('modes', listModes().filter((m) => m.id !== id)); }

export function deleteMyTrack(id) {
  write('tracks', listMyTracks().filter((t) => t.id !== id));
  // Pierre tombale : sans elle, la synchronisation du compte ressusciterait le circuit depuis un autre appareil.
  const gone = read('tracksDel', {});
  write('tracksDel', { ...(gone && typeof gone === 'object' ? gone : {}), [id]: Date.now() });
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getEditorDraft() {
  return read('draft', null);
}

export function setEditorDraft(d) {
  write('draft', d);
}

// ---- Fantômes : Float32Array <-> base64 (le codec vit dans ghostFormat.js, partagé avec la fonction serveur) ----
export { encodeFloats, decodeFloats } from './ghostFormat.js';

export function formatTime(sec, sign = false) {
  if (sec == null || !isFinite(sec)) return '--:--.---';
  const neg = sec < 0;
  // Arrondi au millième AVANT de séparer minutes et secondes : 59,9996 s s'écrivait « 00:60.000 » (le chrono l'affichait une image à chaque passage de minute).
  const ms = Math.round(Math.abs(sec) * 1000);
  const m = Math.floor(ms / 60000);
  const txt = String(m).padStart(2, '0') + ':' + ((ms - m * 60000) / 1000).toFixed(3).padStart(6, '0');
  if (sign) return (neg ? '-' : '+') + txt;
  return (neg ? '-' : '') + txt;
}

