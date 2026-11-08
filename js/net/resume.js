// Reconnexion au salon (Copytrack Evolution, E16, NET_VER 4). Une coupure (Wi-Fi qui saute, passage en 4G, onglet rechargé) ne fait plus sortir
// de la salle :
//   - le joueur coupé retente de rejoindre le même canal, avec le MÊME identifiant, pendant RESUME_MS (délais croissants RETRY_MS) ; sa course
//     continue chez lui pendant ce temps ;
//   - les autres lui gardent sa place RESUME_MS (« ⏳ reconnexion ») : il reste sur la grille, la manche ne se clôt pas sans lui (dans la limite
//     des délais habituels), son temps compte s'il arrive ;
//   - à son retour, chacun lui envoie « hello » ; l'hôte lui renvoie l'état complet (règles, circuit ou championnat avec les arrivées de la manche,
//     temps du mode libre) ; lui renvoie l'arrivée qu'il aurait annoncée pendant la coupure ;
//   - un hôte qui prend la suite d'un hôte parti l'annonce (« hostover ») et se marque hôte : l'ancien, s'il revient après coup, ne reprend pas
//     la main avec un état périmé.
// Un onglet rechargé retrouve sa place s'il revient dans les RESUME_MS : identifiant et jeton du salon sont gardés en sessionStorage.
export const RESUME_MS = 20000;
export const RETRY_MS = [800, 1500, 2500, 4000, 6000];        // tentatives successives (≈ 15 s en tout, sous RESUME_MS)

export const newToken = (rand = () => Math.random()) => Array.from({ length: 16 }, () => Math.floor(rand() * 16).toString(16)).join('');

// Mémoire de la place (sessionStorage par défaut ; store injectable pour les tests). Valable RESUME_MS après la dernière mise à jour.
const KEY = 'copytrack.mp.resume';
const defaultStore = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };
export function saveResume({ code, selfId, token }, store = defaultStore(), now = Date.now()) {
  try { if (store) store.setItem(KEY, JSON.stringify({ code, selfId, token, at: now })); } catch { /* stockage refusé : pas de reprise après rechargement */ }
}
export function loadResume(code, store = defaultStore(), now = Date.now()) {
  try {
    const r = store ? JSON.parse(store.getItem(KEY) || 'null') : null;
    return r && r.code === code && typeof r.selfId === 'string' && typeof r.token === 'string' && now - r.at < RESUME_MS ? r : null;
  } catch { return null; }
}
export function clearResume(store = defaultStore()) { try { if (store) store.removeItem(KEY); } catch { /* rien */ } }
