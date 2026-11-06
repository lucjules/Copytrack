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

// Retrouve le circuit correspondant à une clé de classement.
//   b-<id>-<empreinte>   circuit intégré (l'empreinte garantit la même version)
//   daily-AAAA-MM-JJ     défi du jour (régénéré à partir de la date)
//   u-<signature>        circuit de joueur (son code doit être fourni) ; la signature
//                        ignore le nom et la description, qu'on peut modifier après coup
export function trackForKey(key, code = '') {
  key = String(key || '');
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
    return { track, kind: 'user', name: track.name };
  }
  throw new Error('Clé de circuit invalide.');
}

// Rejoue les commandes ; renvoie le temps (s) si la course va jusqu'à l'arrivée, sinon null.
export function replayTime(track, inputs) {
  if (!inputs || inputs.length > MAX_INPUTS_CHARS) return null;
  let rep;
  try { rep = decodeInputs(inputs); } catch { return null; }      // illisible, ou trop long (refusé avant dépliage)
  if (!rep.length || rep.length > MAX_RUN_STEPS) return null;
  const g = new GhostRunner(track, { inputs });
  while (!g.done && g.k < MAX_RUN_STEPS) g.step();
  return g.logic.finished ? g.logic.time : null;
}

// Vérification complète : même version de physique, circuit reconnu, temps confirmé.
export function verifyRun({ trackKey, code, inputs, time, physVer }) {
  if (physVer !== PHYS_VER) return { ok: false, error: `Version du jeu différente (jeu ${physVer}, serveur ${PHYS_VER}).`, versionMismatch: true };
  let t;
  try { t = trackForKey(trackKey, code); } catch (e) { return { ok: false, error: e.message }; }
  const sim = replayTime(t.track, inputs);
  if (sim == null) return { ok: false, error: 'La course rejouée n’atteint pas l’arrivée.' };
  if (Math.abs(sim - time) > 0.0005) return { ok: false, error: 'Le temps ne correspond pas à la course rejouée.' };
  return { ok: true, time: sim, name: t.name, kind: t.kind };
}
