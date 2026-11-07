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

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    if (writeHook) writeHook(key);
    return true;
  } catch {
    return false;
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

// Toutes les données du jeu (clés « shardway.* », gardées pour ne perdre aucune sauvegarde) sous forme d'objet.
export function dumpAll() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = localStorage.getItem(k);
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
  cameras: [],            // caméras de course personnalisées (camprefs.js)
  feel: 1,                // sensations de course : 0 (aucun effet ajouté) à 1,5 ; voir feel.js
  editorGuided: null,     // éditeur en mode guidé (l'essentiel) : null = non (joueur qui connaît déjà l'éditeur), true = oui (voir editor/palette.js)
  telemetry: null,        // statistiques anonymes (voir telemetry.js) : null = pas encore demandé, true = accepté, false = refusé
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
      .filter((k) => k.startsWith(PREFIX + 'rec'))
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
  return mem && mem.time < disk.time - 1e-9 ? mem : disk;
}

// Écrit le record, quitte à perdre ce qui prend de la place : d'abord le fantôme, puis les commandes enregistrées, puis (si
// le stockage est vraiment plein) le fantôme et les commandes des AUTRES circuits, du plus ancien au plus récent. Le temps, lui,
// n'est jamais perdu. Renvoie true si le record est bien sur le disque.
export function saveRecord(trackKey, rec) {
  memRec.set(PREFIX + trackKey, slim(rec));
  const tiers = [rec, { ...rec, ghost: null }, slim(rec)];
  const tryWrite = () => tiers.some((t) => write(REC + trackKey, t));
  if (tryWrite()) return true;
  let keys;
  try { keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX + REC) && k !== PREFIX + REC + trackKey); } catch { return false; }
  const others = keys.map((k) => { try { return { k, v: JSON.parse(localStorage.getItem(k)) }; } catch { return null; } })
    .filter((o) => o && o.v && (o.v.ghost || o.v.inputs)).sort((a, b) => (a.v.date || 0) - (b.v.date || 0));
  for (const o of others) {
    try { localStorage.setItem(o.k, JSON.stringify(slim(o.v))); } catch { /* on continue */ }
    if (tryWrite()) return true;
  }
  return false;
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
  write('tracks', list);
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
  const s = Math.abs(sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const txt = String(m).padStart(2, '0') + ':' + r.toFixed(3).padStart(6, '0');
  if (sign) return (neg ? '-' : '+') + txt;
  return (neg ? '-' : '') + txt;
}

