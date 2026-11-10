// Vérification d'une course (classements en ligne). Module sans rendu ni navigateur :
// il est utilisé par la fonction serveur Supabase (supabase/functions/submit-score),
// qui le charge depuis le site du jeu. La physique étant déterministe, rejouer les
// commandes enregistrées redonne exactement la même course et le même temps.
import { Track, hashString } from './track.js';
import { BUILTIN_TRACKS, buildBuiltin } from './tracks.js';
import { dailyChallenge } from './daily.js';
import { GhostRunner, decodeInputs } from './replay.js';
import { PHYS_VER } from './version.js';
import { MAX_RUN_STEPS, MAX_INPUTS_CHARS } from './constants.js';
import { encodeFloats } from './ghostFormat.js';
import { splitKey, parseVariant, applyVariant } from './variants.js';
import { seasonOpen, seasonTracks } from './seasons.js';

// Retrouve le circuit correspondant à une clé de classement.
//   b-<id>-<empreinte>   circuit intégré (l'empreinte garantit la même version)
//   daily-AAAA-MM-JJ     défi du jour (régénéré à partir de la date)
//   u-<signature>        circuit de joueur (son code doit être fourni) ; la signature
//                        ignore le nom et la description, qu'on peut modifier après coup
//   <clé>~v1.…           variante de record (variants.js) : le circuit de la clé officielle, transformé par ses règles
//   b-…~v1.sea-N         saison hebdomadaire N (seasons.js) : acceptée seulement pendant sa semaine, sur ses trois circuits
//   b-…~v1.duel-N / tour-N  duel ou tournoi (E17) : le circuit officiel ; la fonction serveur vérifie en base la fenêtre et les participants
export function trackForKey(key, code = '') {
  key = String(key || '');
  const { base, variant } = splitKey(key);
  if (key.includes('~')) {                       // (une clé terminée par « ~ » est une variante vide : refusée par parseVariant)
    const off = trackForKey(base, code);
    const v = parseVariant(variant);
    if (v.duel != null || v.tour != null) {      // duel ou tournoi (E17) : seul, sur un circuit de la carrière ; la fenêtre et les participants sont en base (submit-score)
      if (Object.keys(v).length !== 1 || off.kind !== 'builtin') throw new Error('Compétition possible seulement sur un circuit de la carrière.');
      const kind = v.duel != null ? 'duel' : 'tour';
      return { ...off, name: `${off.name} · ${kind === 'duel' ? 'duel' : 'tournoi'} ${v[kind]}`, variant: v, competition: { kind, id: +v[kind], base } };
    }
    if (v.sea != null) {                         // saison hebdomadaire (E15) : seule, sur un circuit de la saison, pendant sa semaine
      const n = +v.sea;
      if (Object.keys(v).length !== 1 || off.kind !== 'builtin' || !seasonTracks(n).some((d) => base.startsWith(`b-${d.id}-`))) throw new Error('Ce circuit ne fait pas partie de cette saison.');
      const closed = seasonOpen(n);
      if (closed) throw new Error(closed);
      return { ...off, name: `${off.name} · saison ${n}`, variant: v, season: n };
    }
    return { ...off, track: applyVariant(off.track, v), name: `${off.name} · ${variant}`, variant: v };
  }
  if (key.startsWith('b-')) {
    const def = BUILTIN_TRACKS.find((d) => key.startsWith(`b-${d.id}-`));
    if (!def) throw new Error('Circuit intégré inconnu.');
    const track = buildBuiltin(def);
    if (`b-${def.id}-${hashString(track.encode())}` !== key) throw new Error('Version du circuit différente : mets le jeu à jour.');
    return { track, kind: 'builtin', name: def.name };
  }
  if (key.startsWith('daily-')) {
    const day = key.slice(6);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Défi du jour introuvable.');
    // Seuls hier, aujourd'hui et demain sont acceptés (décalages d'horloge) : pas de génération à la demande pour des dates arbitraires.
    const t = Date.parse(day + 'T00:00:00Z');
    if (!Number.isFinite(t) || Math.abs(t - Date.now()) > 2.5 * 86400000) throw new Error('Défi du jour hors dates valides.');
    const c = dailyChallenge(day);
    if (!c || c.key !== key) throw new Error('Défi du jour introuvable.');
    return { track: c.track, kind: 'daily', name: c.track.name };
  }
  if (key.startsWith('u-')) {
    const track = Track.decode(code);
    if (track.userKey !== key) throw new Error('Le code du circuit ne correspond pas.');
    return { track, kind: 'user', name: track.name, sigText: track.signatureText() };
  }
  throw new Error('Clé de circuit invalide.');
}

// Rejoue les commandes ; renvoie { time } (s) si la course va jusqu'à l'arrivée, sinon null. ghost : fabrique aussi le fantôme de la course pendant le même rejeu
// ({ ghost, ghostVeh } : une pose tous les 4 pas en base64, et les changements de véhicule), pour les fantômes du haut des classements.
export function replayRun(track, inputs, { ghost = false } = {}) {
  if (!inputs || inputs.length > MAX_INPUTS_CHARS) return null;
  let rep;
  try { rep = decodeInputs(inputs); } catch { return null; }      // illisible, ou trop long (refusé avant dépliage)
  if (!rep.length || rep.length > MAX_RUN_STEPS) return null;
  const g = new GhostRunner(track, { inputs, ghost });
  while (!g.done && g.k < MAX_RUN_STEPS) g.step();
  if (!g.logic.finished) return null;
  const out = { time: g.logic.time, splits: g.logic.splits.slice() };      // temps intermédiaires (pas) : classements par secteur (E15)
  if (ghost) { const r = g.ghostResult(); out.ghost = encodeFloats(r.data); out.ghostVeh = r.veh; }
  return out;
}

export function replayTime(track, inputs) {
  const r = replayRun(track, inputs);
  return r ? r.time : null;
}

// Refus pour version de physique différente : le message dit les deux versions, et serverPhysVer permet au jeu d'expliquer quoi faire.
const versionError = (physVer) => ({ ok: false, error: `Version du jeu différente (jeu ${physVer}, serveur ${PHYS_VER}) : recharge le jeu pour le mettre à jour.`, versionMismatch: true, serverPhysVer: PHYS_VER });

// Vérification complète : même version de physique, circuit reconnu, temps confirmé.
export function verifyRun({ trackKey, code, inputs, time, physVer, withGhost = false }) {
  if (physVer !== PHYS_VER) return versionError(physVer);
  let t;
  try { t = trackForKey(trackKey, code); } catch (e) { return { ok: false, error: e.message }; }
  const run = replayRun(t.track, inputs, { ghost: withGhost });
  if (run == null) return { ok: false, error: 'La course rejouée n’atteint pas l’arrivée.' };
  if (Math.abs(run.time - time) > 0.0005) return { ok: false, error: 'Le temps ne correspond pas à la course rejouée.' };
  return { ok: true, time: run.time, splits: run.splits, name: t.name, kind: t.kind, ...(t.sigText ? { sigText: t.sigText } : {}), ...(t.season ? { season: t.season } : {}), ...(t.competition ? { competition: t.competition } : {}), ...(withGhost ? { ghost: run.ghost, ghostVeh: run.ghostVeh } : {}) };
}

// Publication d'un circuit (temps auteur VÉRIFIÉ) : le client envoie le code du circuit et la course de vérification de l'auteur ; le serveur rejoue cette
// course sur CE code. Le temps auteur retenu est celui du rejeu, jamais celui que le client affirme. Le code doit porter la marque « vérifié » (vt + vh = signature
// du contenu) avec un temps égal au rejeu à la milliseconde près (le jeu arrondit vt au millième).
export const AUTHOR_TIME_TOLERANCE = 0.001;
export function verifyPublish({ code, inputs, time, physVer }) {
  if (physVer !== PHYS_VER) return versionError(physVer);
  let track;
  try { track = Track.decode(String(code || '')); } catch (e) { return { ok: false, error: 'Code de circuit invalide : ' + e.message }; }
  if (!track.verified) return { ok: false, error: 'Circuit non vérifié : termine-le d’abord depuis l’éditeur (« ✔ Vérifier »).' };
  const run = replayRun(track, inputs);
  if (run == null) return { ok: false, error: 'La course de vérification rejouée n’atteint pas l’arrivée.' };
  if (Math.abs(run.time - time) > 0.0005) return { ok: false, error: 'Le temps ne correspond pas à la course rejouée.' };
  if (Math.abs(run.time - track.vt) > AUTHOR_TIME_TOLERANCE) return { ok: false, error: 'Le temps de l’auteur inscrit dans le circuit ne correspond pas à la course rejouée.' };
  return { ok: true, time: run.time, key: track.userKey, signature: track.signature(), sigText: track.signatureText(), name: track.name, decor: track.decor, pieces: track.tiles.length, laps: track.laps || 1 };
}
