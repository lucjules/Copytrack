// Circuits favoris (Race Hub) : une référence par circuit, rangée dans le profil (donc dans la sauvegarde cloud du compte). Module pur, testé sous Node.
//
// Référence stable, jamais la clé de classement (qui change si un circuit intégré est retouché) :
//   b:<id>     circuit intégré (id de tracks.js)
//   m:<id>     circuit de « Mes circuits » (id de l'entrée locale)
//   c:<uuid>   circuit de la communauté (relu sur le serveur à l'ouverture)
// profile.favorites = [{ ref, name, at }] (le plus récent d'abord) ; profile.favDel = { ref: date } : pierres tombales, pour qu'un favori retiré
// sur un appareil ne revienne pas par la synchronisation (même principe que tracksDel).
export const FAV_MAX = 200;
const REF = /^(b:[a-z0-9_]{1,40}|m:[A-Za-z0-9_-]{1,40}|c:[0-9a-f-]{36})$/;
export const isFavRef = (ref) => typeof ref === 'string' && REF.test(ref);
const cleanName = (n) => String(n == null ? '' : n).replace(/[\u0000-\u001f]/g, '').slice(0, 40);

export function cleanFavorites(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((f) => f && isFavRef(f.ref) && !seen.has(f.ref) && seen.add(f.ref))
    .map((f) => ({ ref: f.ref, name: cleanName(f.name), at: Number.isFinite(+f.at) ? +f.at : 0 }))
    .sort((a, b) => b.at - a.at)
    .slice(0, FAV_MAX);
}

export const isFavorite = (p, ref) => cleanFavorites(p.favorites).some((f) => f.ref === ref);

// Ajoute ou retire ; renvoie le nouvel état (true = favori).
export function toggleFavorite(p, ref, name, now = Date.now()) {
  if (!isFavRef(ref)) return false;
  const list = cleanFavorites(p.favorites);
  const del = { ...(p.favDel && typeof p.favDel === 'object' ? p.favDel : {}) };
  if (list.some((f) => f.ref === ref)) {
    p.favorites = list.filter((f) => f.ref !== ref);
    del[ref] = now;
    p.favDel = del;
    return false;
  }
  delete del[ref];
  p.favDel = del;
  p.favorites = cleanFavorites([{ ref, name, at: now }, ...list]);
  return true;
}

// Fusion de deux profils (cloudsave.mergeProfile) : union, moins ce qui a été retiré APRÈS avoir été ajouté.
export function mergeFavorites(a, b) {
  const del = {};
  for (const src of [b && b.favDel, a && a.favDel]) if (src && typeof src === 'object') for (const [k, v] of Object.entries(src)) if (isFavRef(k) && Number.isFinite(+v)) del[k] = Math.max(del[k] || 0, +v);
  const by = new Map();
  for (const f of [...cleanFavorites(b && b.favorites), ...cleanFavorites(a && a.favorites)]) { const cur = by.get(f.ref); if (!cur || f.at > cur.at) by.set(f.ref, f); }
  const favorites = cleanFavorites([...by.values()].filter((f) => !(del[f.ref] != null && del[f.ref] >= f.at)));
  return { favorites, favDel: del };
}
