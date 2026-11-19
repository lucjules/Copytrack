// Export des données du joueur (RGPD : droit d'accès et de portabilité, 0.12.4) : un fichier JSON lisible avec ce que cet appareil garde (stockage local
// du joueur en cours) et, s'il a une session en ligne, ce que le serveur garde à son nom, lu table par table avec SES droits (ce qu'il peut lire, rien de
// plus : les règles de la base s'appliquent). Aucun jeton de session n'entre dans le fichier. Module pur (testé sous Node : tools/test-legal.mjs).

// Tables lues, et le filtre qui désigne les lignes du joueur ({u} : son identifiant).
export const EXPORT_TABLES = [
  ['accounts', 'user_id=eq.{u}'], ['players', 'id=eq.{u}'], ['cloud_saves', 'user_id=eq.{u}'],
  ['scores', 'player=eq.{u}'], ['tracks', 'author=eq.{u}'], ['track_comments', 'author=eq.{u}'],
  ['follows', 'follower=eq.{u}'], ['friends', 'or=(a.eq.{u},b.eq.{u})'], ['duels', 'or=(challenger.eq.{u},opponent.eq.{u})'],
  ['tournament_players', 'player=eq.{u}'], ['ratings', 'player=eq.{u}'], ['season_divisions', 'player=eq.{u}'], ['division_history', 'player=eq.{u}'],
  ['playlists', 'owner=eq.{u}'], ['community_modes', 'owner=eq.{u}'],
];

const SECRET_KEY = /session|token|password|secret|vproof/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stockage local (clé -> texte) rendu lisible : les valeurs JSON sont décodées ; les clés qui ressemblent à un secret sont écartées.
export function readableLocal(dump = {}) {
  const out = {};
  for (const [k, v] of Object.entries(dump)) {
    if (SECRET_KEY.test(k) || typeof v !== 'string') continue;
    try { out[k] = JSON.parse(v); } catch { out[k] = v; }
  }
  return out;
}

// meta : { game, version, identity: { kind, username } } ; local : dumpAll() ; uid : identifiant en ligne ou null ; get(path) : lecture REST authentifiée.
export async function buildExport({ meta = {}, local = {}, uid = null, get = null, now = () => new Date() } = {}) {
  const out = { format: 'export-joueur-1', ...meta, exportedAt: now().toISOString(), device: readableLocal(local), server: null };
  if (!uid || !UUID.test(uid) || typeof get !== 'function') { out.server = { status: 'no-online-session' }; return out; }
  out.server = { status: 'ok', uid };
  for (const [table, filter] of EXPORT_TABLES) {
    try { out.server[table] = await get(`/rest/v1/${table}?select=*&${filter.replaceAll('{u}', uid)}`); }
    catch (e) { out.server[table] = { error: String((e && e.message) || e) }; }
  }
  return out;
}
