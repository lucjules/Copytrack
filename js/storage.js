// Persistance locale (navigateur) : réglages, records + fantômes, circuits perso.
const PREFIX = 'shardway.';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Accès bruts (profil, sauvegarde complète).
export function getJSON(key, fallback) { return read(key, fallback); }
export function setJSON(key, value) { return write(key, value); }

// Toutes les données du jeu (clés « shardway.* ») sous forme d'objet.
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
      Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
    }
    for (const [k, v] of Object.entries(data)) if (typeof v === 'string') localStorage.setItem(PREFIX + k, v);
    return true;
  } catch { return false; }
}

export const DEFAULT_SETTINGS = {
  volume: 0.7,
  quality: 'high',
  carColor: '#ffd23e',
  ghost: true,
  camera: 0,
  playerName: 'Pilote',
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
};

export function loadSettings() {
  const saved = read('settings', {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    keys: { ...(saved.keys || {}) },
    pad: { ...(saved.pad || {}) },
  };
}

export function saveSettings(s) {
  write('settings', s);
}

// ---- Records -------------------------------------------------------------
// v1.1 : pistes plus larges et physique revue => les records v1.0 (préfixe
// "rec.") ne sont plus comparables. On utilise "rec2." et on purge l'ancien.
const REC = 'rec2.';

export function purgeOldRecords() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + 'rec.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* stockage indisponible */ }
}

export function clearRecords() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + 'rec'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* stockage indisponible */ }
}

export function getRecord(trackKey) {
  return read(REC + trackKey, null);
}

export function saveRecord(trackKey, rec) {
  if (!write(REC + trackKey, rec)) {
    // Quota dépassé : on garde le temps sans le fantôme.
    write(REC + trackKey, { ...rec, ghost: null });
  }
}

// ---- Circuits personnels ---------------------------------------------------
export function listMyTracks() {
  return read('tracks', []);
}

export function saveMyTrack(entry) {
  const list = listMyTracks();
  const i = list.findIndex((t) => t.id === entry.id);
  entry.updated = Date.now();
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  write('tracks', list);
  return entry;
}

export function deleteMyTrack(id) {
  write('tracks', listMyTracks().filter((t) => t.id !== id));
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

// ---- Fantômes : Float32Array <-> base64 -----------------------------------
export function encodeFloats(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

export function decodeFloats(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

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
