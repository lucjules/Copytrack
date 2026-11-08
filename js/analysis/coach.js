// Coach (Copytrack Evolution, E7) : des conseils LOCALISÉS (un secteur, un endroit) et JUSTIFIÉS par les mesures de deux courses projetées sur
// la même référence (analysis/reference.js). On ne conseille que là où du temps a été perdu : une course identique à la référence ne reçoit
// aucun conseil. Module pur, testé sous Node (tools/test-coach.mjs) ; le texte est en français (la clé de la traduction, comme partout).
//
//   coach(mine, ref, { count, minLoss }) -> [{ id, sector, s, loss, text, vars }]   du plus coûteux au moins coûteux
//     id : 'respawn' | 'wall' | 'late-brake' | 'early-brake' | 'slow-corner' | 'air' | 'wide-line' | 'sector'
//   mine, ref : RunTrace alignées (alignTrace) sur la MÊME référence. ref peut venir d'un fantôme en ligne (positions seules) : les conseils de
//   freinage demandent les commandes des deux courses, les autres non.
import { sectors } from './sectors.js';
import { timeAtS } from './reference.js';
import { brakingPoints } from './sectors.js';

const KMH = 3.6;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

export const COACH_TEXT = {
  respawn: 'Secteur {k} : le retour au checkpoint t’a coûté {loss} s. Ralentis avant ce passage : il vaut mieux le passer lentement que de le refaire.',
  wall: 'Secteur {k} : {n} choc{s} contre le mur ({loss} s perdues). Prends le virage plus large en entrée et freine avant.',
  'late-brake': 'Secteur {k} : tu freines {d} m plus tard que la référence et tu en ressors à {v} km/h au lieu de {vr}. Freine plus tôt, ressors plus vite ({loss} s perdues).',
  'early-brake': 'Secteur {k} : tu freines {d} m plus tôt que la référence ({loss} s perdues). Retarde le freinage : la référence passe à {vr} km/h.',
  'slow-corner': 'Secteur {k} : ta vitesse la plus basse est {v} km/h, la référence garde {vr} km/h ({loss} s perdues). Entre moins vite pour ressortir plus vite, ou glisse plus court.',
  air: 'Secteur {k} : {a} s en l’air contre {ar} s pour la référence ({loss} s perdues). Moins de vitesse au tremplin ou le nez plus bas : on n’accélère pas en vol.',
  'wide-line': 'Secteur {k} : ta trajectoire s’écarte de {d} m en moyenne de celle de la référence ({loss} s perdues). Coupe plus près de la corde.',
  sector: 'Secteur {k} : {loss} s perdues sans cause nette (vitesse maxi {v} km/h contre {vr}). Regarde ce passage dans le Replay Theater.',
};

const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] == null ? '' : String(v[k])));

function evIn(tr, kind, s0, s1) {
  let n = 0;
  for (const e of tr.events) if (e.k === kind && e.i < tr.n && tr.sm[e.i] >= s0 && tr.sm[e.i] < s1) n++;
  return n;
}
function airIn(tr, s0, s1) {
  if (!tr.air) return 0;
  let a = 0;
  const dt = tr.n > 1 ? tr.t[1] - tr.t[0] : 0;
  for (let i = 0; i < tr.n; i++) if (tr.sm[i] >= s0 && tr.sm[i] < s1 && tr.air[i]) a += dt;
  return a;
}
function meanOff(tr, s0, s1) {
  let sum = 0, n = 0;
  for (let i = 0; i < tr.n; i++) if (tr.sm[i] >= s0 && tr.sm[i] < s1 && tr.off) { sum += tr.off[i]; n++; }
  return n ? sum / n : 0;
}

export function coach(mine, ref, { count = 12, minLoss = 0.05 } = {}) {
  const A = sectors(mine, { count }), B = sectors(ref, { count });
  const out = [];
  const bpA = brakingPoints(mine), bpB = brakingPoints(ref);
  for (let k = 0; k < Math.min(A.length, B.length); k++) {
    const a = A[k], b = B[k], loss = a.dt - b.dt;
    if (!(loss > minLoss)) continue;                          // seulement là où du temps a été perdu
    const s0 = a.s0, s1 = a.s1, K = k + 1, tips = [];
    const base = { k: K, loss: r2(loss) };
    // 1. Incidents : un retour au checkpoint, des chocs (de loin les plus coûteux).
    const resp = evIn(mine, 'respawn', s0, s1) - evIn(ref, 'respawn', s0, s1);
    if (resp > 0) tips.push({ id: 'respawn', w: 3, vars: base });
    const walls = evIn(mine, 'wall', s0, s1) - evIn(ref, 'wall', s0, s1);
    // 2. Freinages : le point de freinage de la référence le plus proche de chacun des miens, dans ce secteur.
    let brakeTip = null;
    if (mine.brk && ref.brk) {
      for (const pa of bpA) {
        if (pa.s < s0 - 150 || pa.s >= s1) continue;                 // (un freinage peut faire perdre du temps jusqu'au secteur suivant)
        let best = null;
        for (const pb of bpB) if (Math.abs(pb.s - pa.s) < 60 && (!best || Math.abs(pb.s - pa.s) < Math.abs(best.s - pa.s))) best = pb;
        if (!best) continue;
        const d = pa.s - best.s;
        // Un freinage se montre là où il a lieu (la cause), même si le temps se perd un peu plus loin.
        const at = { k: Math.min(count, Math.floor((Math.min(pa.s, best.s) / mine.ref.length) * count) + 1), s: Math.min(pa.s, best.s) };
        if (d > 8 && (!brakeTip || d > brakeTip.vars.d)) brakeTip = { id: 'late-brake', w: 2.5, at, vars: { ...base, k: at.k, d: Math.round(d), v: Math.round(pa.v1 * KMH), vr: Math.round(best.v1 * KMH) } };
        else if (d < -8 && (!brakeTip || brakeTip.id === 'early-brake' && -d > brakeTip.vars.d)) brakeTip = { id: 'early-brake', w: 2, at, vars: { ...base, k: at.k, d: Math.round(-d), vr: Math.round(best.v0 * KMH) } };
      }
    }
    if (brakeTip) tips.push(brakeTip);
    if (walls > 0) tips.push({ id: 'wall', w: brakeTip && brakeTip.id === 'late-brake' ? 1.5 : 2.6, vars: { ...base, n: walls, s: walls > 1 ? 's' : '' } });
    // 3. Vitesse mini dans le secteur (virage pris trop lentement).
    if (b.vmin - a.vmin > 3) tips.push({ id: 'slow-corner', w: 1.8, vars: { ...base, v: Math.round(a.vmin * KMH), vr: Math.round(b.vmin * KMH) } });
    // 4. Temps en l'air.
    const air = airIn(mine, s0, s1), airR = airIn(ref, s0, s1);
    if (mine.air && ref.air && air - airR > 0.3) tips.push({ id: 'air', w: 1.6, vars: { ...base, a: r1(air), ar: r1(airR) } });
    // 5. Trajectoire : l'écart moyen à la ligne de référence, comparé à celui de la référence elle-même.
    const off = meanOff(mine, s0, s1) - meanOff(ref, s0, s1);
    if (off > 3) tips.push({ id: 'wide-line', w: 1.2, vars: { ...base, d: r1(off) } });
    if (!tips.length) tips.push({ id: 'sector', w: 0.5, vars: { ...base, v: Math.round(a.vmax * KMH), vr: Math.round(b.vmax * KMH) } });
    tips.sort((x, y) => y.w - x.w);
    const t = tips[0];
    // Endroit à montrer : où l'écart grandit le plus vite dans le secteur.
    let at = s0, worst = -Infinity, prev = null;
    for (let s = s0; s <= s1; s += Math.max(2, (s1 - s0) / 30)) {
      const ta = timeAtS(mine, s), tb = timeAtS(ref, s);
      if (ta == null || tb == null) continue;
      const g = ta - tb;
      if (prev != null && g - prev > worst) { worst = g - prev; at = s; }
      prev = g;
    }
    if (t.at) at = t.at.s;
    out.push({ id: t.id, sector: t.at ? t.at.k : K, s: at, s0, s1, loss, w: t.w, vars: t.vars, text: fill(COACH_TEXT[t.id], t.vars), others: tips.slice(1).map((x) => x.id) });
  }
  out.sort((x, y) => y.loss * (0.5 + y.w) - x.loss * (0.5 + x.w));
  return out;
}

export { fill as coachFill };
