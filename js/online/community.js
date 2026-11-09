// Communauté 2 (Copytrack Evolution, E21) : le client des fonctions de supabase/etape13-communaute.sql. Commentaires, playlists, sélection,
// découverte au hasard, recommandations, statistiques de circuit (depuis run_stats), modes publiés. Tout passe par des fonctions de la base,
// qui vérifient les droits, le débit et la modération : ce module ne fait que les appeler et remettre en forme leurs réponses.
// Sans l'étape SQL 13 sur le serveur, chaque appel lève une OnlineError de code 'no-sql-step' (l'interface le dit).
import { online } from '../online.js';
import { sanitizeRules } from '../rules.js';
import { formatVariant, parseVariant, VARIANTS } from '../variants.js';

const UUID = /^[0-9a-f-]{36}$/;
const list = (r) => (Array.isArray(r) ? r : []);

// Lignes complètes de circuits (comme listTracks), dans l'ordre des identifiants donnés ; les circuits retirés ou masqués disparaissent.
export async function tracksByIds(ids) {
  const ok = [...new Set((ids || []).filter((id) => UUID.test(String(id))))];
  if (!ok.length) return [];
  const q = new URLSearchParams();
  const F = online.constructor.FIELDS;
  q.set('select', F + (online.hasDesc === false ? '' : ',description'));
  q.set('id', 'in.(' + ok.join(',') + ')');
  let rows;
  try { rows = await online.rest('/rest/v1/tracks?' + q.toString()); }
  catch (e) { if (!/description/.test(e.message || '')) throw e; online.hasDesc = false; q.set('select', F); rows = await online.rest('/rest/v1/tracks?' + q.toString()); }
  const by = new Map(list(rows).map((r) => [r.id, r]));
  return ok.filter((id) => by.has(id)).map((id) => by.get(id));
}

// ---- Commentaires ----
export const comments = (trackId, { limit = 30, offset = 0 } = {}) => online.rpc('track_comments_list', { t: trackId, lim: limit, off: offset }).then(list);
export async function addComment(trackId, text, playerName) {
  const msg = String(text || '').trim();
  if (!msg || msg.length > 280) throw new Error('Un commentaire fait de 1 à 280 caractères.');
  await online.ensurePlayer(playerName);
  return +(await online.rpc('comment_add', { t: trackId, msg }));
}
export const deleteComment = (id) => online.rpc('comment_delete', { c: id });
export const reportComment = (id) => online.rpc('comment_report', { c: id });

// ---- Playlists ----
export const playlists = ({ mine = false, limit = 30, offset = 0 } = {}) => online.rpc('playlists_list', { mine, lim: limit, off: offset }).then(list);
export async function savePlaylist({ id = null, name, isPublic = true, tracks = [] }, playerName) {
  await online.ensurePlayer(playerName);
  return +(await online.rpc('playlist_save', { pl: id, pname: String(name || '').trim().slice(0, 40), is_public: !!isPublic, items: tracks.filter((x) => UUID.test(String(x))).slice(0, 50) }));
}
export const deletePlaylist = (id) => online.rpc('playlist_delete', { pl: id });

// ---- Sélection, hasard, recommandations ----
export async function picks({ limit = 24, offset = 0 } = {}) {
  const q = new URLSearchParams();
  q.set('select', online.constructor.FIELDS + (online.hasDesc === false ? '' : ',description'));
  q.set('picked_at', 'not.is.null');
  q.set('order', 'picked_at.desc');
  q.set('limit', String(limit)); q.set('offset', String(offset));
  return list(await online.rest('/rest/v1/tracks?' + q.toString()));
}
export async function randomTrack(avoid = []) {
  const id = await online.rpc('random_track', { avoid: avoid.filter((x) => UUID.test(String(x))).slice(-50) });
  return typeof id === 'string' && UUID.test(id) ? online.trackById(id) : null;
}
export async function recommended(limit = 12) {
  const r = list(await online.rpc('recommended_tracks', { lim: limit }));
  return tracksByIds(r.map((x) => x.id));
}

// ---- Statistiques de circuit (run_stats) ----
// key : identifiant de statistiques (telemetry.js, trackIdOf). null : pas encore assez de joueurs (moins de 5).
export async function trackStats(key, physVer) {
  if (!key) return null;
  const r = list(await online.rpc('track_stats', { k: key, pv: physVer }));
  const s = r[0];
  if (!s || !(+s.players >= 5)) return null;
  return { players: +s.players, runs: +s.runs, finishes: +s.finishes, finishRate: +s.finish_rate, median: s.median_time == null ? null : +s.median_time, top: s.top_time == null ? null : +s.top_time, respawns: s.avg_respawns == null ? null : +s.avg_respawns, quitAt: s.quit_progress == null ? null : +s.quit_progress };
}

// ---- Modes publiés ----
// La catégorie de record (variante) qui porte les règles d'un mode : son classement. Les règles qu'aucune catégorie ne représente (voitures
// identiques, simple apparence) n'en font pas partie ; un mode sans règle de course se classe au classement officiel ('').
export function modeVariant(rules) {
  const r = sanitizeRules(rules), v = {};
  if (r.g0) v.g = String(r.g0);
  if (r.veh0) v.veh = r.veh0;
  if (r.v0 >= 0) v.v0 = String(r.v0);
  if (r.offroad >= 0) v.off = String(r.offroad);
  if (r.laps) v.lap = String(r.laps);
  if (r.obstacles === 'off') v.obs = '0';
  if (r.grip) v.gp = String(r.grip);
  if (r.pm) v.pm = r.pm;
  if (r.vm === 2) v.vm = '2';
  for (const [k, val] of Object.entries(v)) if (!VARIANTS[k].values.includes(val)) throw new Error('Ces règles ne correspondent à aucune catégorie de record : ce mode ne peut pas avoir de classement.');
  return formatVariant(v);
}
export function modeRulesOf(variant) {
  if (!variant) return {};
  const v = parseVariant(variant), r = {};
  if (v.g) r.g0 = +v.g;
  if (v.veh) r.veh0 = v.veh;
  if (v.v0 != null) r.v0 = +v.v0;
  if (v.off != null) r.offroad = +v.off;
  if (v.lap) r.laps = +v.lap;
  if (v.obs != null) r.obstacles = 'off';
  if (v.gp) r.grip = +v.gp;
  if (v.pm) r.pm = v.pm;
  if (v.vm) r.vm = 2;
  return sanitizeRules(r);
}
export const communityModes = ({ mine = false, limit = 30, offset = 0 } = {}) => online.rpc('modes_list', { mine, lim: limit, off: offset }).then(list);
export async function publishMode(mode, playerName) {
  const variant = modeVariant(mode.rules);
  await online.ensurePlayer(playerName);
  return +(await online.rpc('mode_publish', { mname: mode.name, mdesc: mode.desc || '', mvariant: variant, mgoal: mode.goal || null }));
}
export const reportMode = (id) => online.rpc('mode_report', { m: id });
export const deleteCommunityMode = (id) => online.rpc('mode_delete', { m: id });
export const modePlayed = (id) => online.rpc('mode_played', { m: id }).catch(() => null);
