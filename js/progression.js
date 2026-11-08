// Progression du pilote (Copytrack Evolution, E14) : EXPÉRIENCE et NIVEAUX, LICENCES, DÉFIS DE MAÎTRISE, et cosmétiques débloqués par le niveau.
// Rien de tout cela ne touche à la course : aucun module de la physique ni de la vérification n'importe ce fichier, et un niveau ne débloque que des
// éléments visuels du garage (tools/test-progression.mjs le vérifie). L'expérience vient des COURSES TERMINÉES et des OBJECTIFS atteints, jamais du
// temps passé dans les menus ; les arrivées répétées sur le même circuit, le même jour, ne rapportent presque rien.
//
// Profil : xp (entier), licences { id: date de l'obtention }, mastery { cléCircuit: bits }, xpDay { day, keys } (premières arrivées du jour, local).
// Fusion cloud (mergeProgress) : expérience au maximum, licences réunies (la date la plus ancienne), maîtrise réunie (OU bit à bit).
import { profile, saveProfile } from './profile.js';

export const XP = {
  finishFirst: 20,            // première arrivée du jour sur un circuit
  finishRepeat: 2,            // les suivantes
  medal: [100, 60, 40, 20],   // chaque palier de médaille atteint pour la première fois (cristal, or, argent, bronze ; circuits de la carrière et défi du jour)
  goal: 30,                   // objectif bonus de la carrière
  daily: 40,                  // première arrivée du jour au défi du jour
  mutation: 30,               // première arrivée de la mutation du jour
  streakStep: 50,             // palier de série atteint
  lesson: 30,                 // leçon de l'Académie réussie (la première fois)
  drill: [0, 20, 30, 50],     // note d'exercice atteinte (bronze, argent, or ; la première fois)
  mastery: 40,                // défi de maîtrise réussi
};
export const MAX_LEVEL = 50;
// Expérience totale pour atteindre le niveau L (niveau 1 : 0 ; 2 : 100 ; 3 : 300 ; 5 : 1 000 ; 10 : 4 500 ; 20 : 19 000).
export const xpForLevel = (L) => 50 * L * (L - 1);
export function levelOf(xp) {
  const x = Math.max(0, Math.floor(+xp || 0));
  let L = 1;
  while (L < MAX_LEVEL && x >= xpForLevel(L + 1)) L++;
  const base = xpForLevel(L), next = L < MAX_LEVEL ? xpForLevel(L + 1) : null;
  return { level: L, xp: x, into: x - base, need: next == null ? 0 : next - base, max: L >= MAX_LEVEL };
}

// Récompenses de niveau : des éléments EXCLUSIFS du garage (ils ne s'achètent pas ; voir rewards.js, qui les donne).
export const LEVEL_REWARDS = [[5, 'led', 'mint'], [10, 'trail', 'violet'], [20, 'led', 'pale'], [30, 'trail', 'plasma']];

// ---- Défis de maîtrise : quatre par circuit de la carrière --------------------------------------------------------------------------------
export const MASTERY = [
  { bit: 1, id: 'or', icon: '🥇', label: 'Médaille d’or (ou cristal)' },
  { bit: 2, id: 'cristal', icon: '💎', label: 'Médaille de cristal' },
  { bit: 4, id: 'objectif', icon: '🎯', label: 'Objectif bonus' },
  { bit: 8, id: 'propre', icon: '✨', label: 'Arrivée sans choc ni réapparition' },
];
export const MASTERY_ALL = MASTERY.reduce((a, m) => a | m.bit, 0);
const bitCount = (b) => MASTERY.filter((m) => b & m.bit).length;
const masteryOfP = (p) => (p.mastery && typeof p.mastery === 'object' && !Array.isArray(p.mastery) ? p.mastery : {});
export const masteryBits = (key) => masteryOfP(profile())[key] | 0;
export const masteryCount = () => Object.values(masteryOfP(profile())).reduce((n, b) => n + bitCount(b | 0), 0);
// Bits mérités par une arrivée : tier (0 cristal … 3 bronze, -1 aucune), goal (objectif réussi, maintenant ou avant), clean (ni choc ni réapparition).
export const masteryFromRun = ({ tier = -1, goal = false, clean = false }) => (tier >= 0 && tier <= 1 ? 1 : 0) | (tier === 0 ? 2 : 0) | (goal ? 4 : 0) | (clean ? 8 : 0);

// ---- Licences : des paliers de pilote, mesurés sur ce qui a été accompli (rien ne se verrouille sans elles) ---------------------------------
// ctx : { level, lessons, silver, gold, crystals, skillsMin, mastery } (rassemblé par app/rewards.js : médailles de la carrière, Académie…).
export const LICENCES = [
  { id: 'C', label: 'Licence C', req: [['level', 3, 'Niveau 3'], ['lessons', 6, 'Les 6 leçons de l’Académie']] },
  { id: 'B', label: 'Licence B', req: [['level', 8, 'Niveau 8'], ['silver', 12, '12 médailles d’argent ou mieux'], ['skillsMin', 1, 'Toutes les compétences au moins en bronze']] },
  { id: 'A', label: 'Licence A', req: [['level', 15, 'Niveau 15'], ['gold', 30, '30 médailles d’or ou mieux'], ['skillsMin', 2, 'Toutes les compétences au moins en argent']] },
  { id: 'S', label: 'Licence S', req: [['level', 25, 'Niveau 25'], ['crystals', 10, '10 médailles de cristal'], ['skillsMin', 3, 'Toutes les compétences en or'], ['mastery', 60, '60 défis de maîtrise']] },
];
export const licenceMet = (L, ctx) => L.req.every(([k, n]) => (ctx[k] || 0) >= n);
const licencesOfP = (p) => (p.licences && typeof p.licences === 'object' && !Array.isArray(p.licences) ? p.licences : {});
export const hasLicence = (id) => !!licencesOfP(profile())[id];
// Donne les licences méritées (dans l'ordre : une licence demande la précédente). Renvoie les nouvelles.
export function grantLicences(ctx, now = Date.now()) {
  const p = profile(), got = [];
  p.licences = licencesOfP(p);
  for (const L of LICENCES) {
    if (p.licences[L.id]) continue;
    if (!licenceMet(L, ctx)) break;
    p.licences[L.id] = now;
    got.push(L.id);
  }
  if (got.length) saveProfile();
  return got;
}

// ---- Expérience ------------------------------------------------------------------------------------------------------------------------
// Ajoute de l'expérience ; renvoie { gained, level, prevLevel }.
export function addXp(n) {
  const p = profile();
  ensureXp();
  const prev = levelOf(p.xp).level, add = Math.max(0, Math.floor(+n || 0));
  p.xp = Math.min(1e9, p.xp + add);
  saveProfile();
  return { gained: add, level: levelOf(p.xp).level, prevLevel: prev };
}

// Arrivée d'une course : { trackKey, tier, prevTier, medalXp (circuit dont les médailles comptent), goalNew, goalMet, clean, builtin, daily, mutation, steps,
// firstOk (false : circuit sans médailles, un circuit de joueur non vérifié : pas de bonus de première arrivée, pour qu'on ne fabrique pas de l'expérience) }.
// Renvoie { xp, parts: [[raison, xp]], mastery: nouveaux bits, level, prevLevel }.
export function awardRace(o, day = new Date().toISOString().slice(0, 10)) {
  const p = profile(), parts = [];
  ensureXp();
  // Première arrivée du jour sur ce circuit (les suivantes : presque rien).
  const xd = p.xpDay && p.xpDay.day === day && Array.isArray(p.xpDay.keys) ? p.xpDay : { day, keys: [] };
  const key = String(o.trackKey || '');
  if (key && o.firstOk !== false && !xd.keys.includes(key)) { xd.keys.push(key); if (xd.keys.length > 300) xd.keys.shift(); parts.push(['Première arrivée du jour sur ce circuit', XP.finishFirst]); }
  else parts.push(['Arrivée', XP.finishRepeat]);
  p.xpDay = xd;
  // Paliers de médaille atteints pour la première fois (carrière et défi du jour).
  if (o.medalXp && o.tier >= 0) {
    const from = o.prevTier == null || o.prevTier < 0 ? 4 : o.prevTier;
    let m = 0;
    for (let t = Math.min(3, from - 1); t >= o.tier; t--) m += XP.medal[t];
    if (m) parts.push(['Nouvelle médaille', m]);
  }
  if (o.goalNew) parts.push(['Objectif bonus', XP.goal]);
  if (o.daily) parts.push(['Défi du jour', XP.daily]);
  if (o.mutation) parts.push(['Mutation du jour', XP.mutation]);
  for (let i = 0; i < (o.steps || 0); i++) parts.push(['Palier de série', XP.streakStep]);
  // Défis de maîtrise (circuits de la carrière).
  let fresh = 0;
  if (o.builtin && key) {
    p.mastery = masteryOfP(p);
    const had = p.mastery[key] | 0, now = had | masteryFromRun({ tier: o.tier, goal: o.goalMet, clean: o.clean });
    fresh = now & ~had;
    if (fresh) { p.mastery[key] = now; parts.push([`Défi${bitCount(fresh) > 1 ? 's' : ''} de maîtrise`, XP.mastery * bitCount(fresh)]); }
  }
  const total = parts.reduce((a, [, x]) => a + x, 0);
  saveProfile();
  const r = addXp(total);
  return { xp: total, parts, mastery: fresh, level: r.level, prevLevel: r.prevLevel };
}

// Expérience de départ (profil d'avant 0.9.36) : ce qui a déjà été accompli compte, comme si cela venait d'arriver, une seule fois. Les défis de
// maîtrise déjà acquis (or, cristal, objectif) sont déduits des médailles et des objectifs ; « sans choc » demande une nouvelle arrivée.
export function initialXp(p, builtinKeys = null) {
  let xp = 0;
  const medals = p.medals && typeof p.medals === 'object' ? p.medals : {};
  for (const [k, tier] of Object.entries(medals)) {
    if (!/^(b-|daily-)/.test(k) || !(tier >= 0 && tier <= 3)) continue;
    for (let t = 3; t >= tier; t--) xp += XP.medal[t];
  }
  xp += Object.keys(p.goals || {}).length * XP.goal;
  xp += Object.keys(p.academy || {}).length * XP.lesson;
  for (const e of Object.values(p.drills || {})) for (let g = 1; g <= Math.min(3, (e && e.lvl) | 0); g++) xp += XP.drill[g];
  xp += (Array.isArray(p.dailyDays) ? p.dailyDays.length : 0) * XP.daily;
  xp += (Array.isArray(p.mutDays) ? p.mutDays.length : 0) * XP.mutation;
  xp += Math.min(2000, ((p.stats && p.stats.races) | 0) * XP.finishRepeat);
  const mastery = {};
  for (const [k, tier] of Object.entries(medals)) {
    if (!k.startsWith('b-') || (builtinKeys && !builtinKeys.includes(k))) continue;
    const bits = masteryFromRun({ tier, goal: !!(p.goals || {})[k + '#goal'] });
    if (bits) mastery[k] = bits;
  }
  for (const k of Object.keys(p.goals || {})) { const tk = k.replace(/#goal$/, ''); if (tk.startsWith('b-') && (!builtinKeys || builtinKeys.includes(tk))) mastery[tk] = (mastery[tk] | 0) | 4; }
  for (const b of Object.values(mastery)) xp += bitCount(b) * XP.mastery;
  return { xp, mastery };
}
// Une seule fois : le profil reçoit son expérience de départ.
export function ensureXp(builtinKeys = null) {
  const p = profile();
  if (Number.isFinite(p.xp)) return false;
  const r = initialXp(p, builtinKeys);
  p.xp = r.xp;
  p.mastery = { ...r.mastery, ...masteryOfP(p) };
  saveProfile();
  return true;
}

// Fusion de deux profils (cloudsave.js).
export function mergeProgress(a, b) {
  const out = {};
  const xa = Number.isFinite(+a.xp) && a.xp != null ? +a.xp : null, xb = Number.isFinite(+b.xp) && b.xp != null ? +b.xp : null;
  if (xa != null || xb != null) out.xp = Math.max(xa || 0, xb || 0);
  const la = licencesOfP(a), lb = licencesOfP(b);
  if (Object.keys(la).length || Object.keys(lb).length) {
    out.licences = {};
    for (const L of LICENCES) {
      const d = [la[L.id], lb[L.id]].filter((x) => Number.isFinite(+x) && +x > 0).map(Number);
      if (d.length) out.licences[L.id] = Math.min(...d);
    }
  }
  const ma = masteryOfP(a), mb = masteryOfP(b);
  if (Object.keys(ma).length || Object.keys(mb).length) {
    out.mastery = {};
    for (const k of new Set([...Object.keys(ma), ...Object.keys(mb)])) out.mastery[k] = ((ma[k] | 0) | (mb[k] | 0)) & MASTERY_ALL;
  }
  return out;
}
