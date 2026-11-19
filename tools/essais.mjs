// Après les essais humains (phase 4 de la 1.0, docs/ESSAIS.md) : médailles des 72 circuits calées sur les temps d'un PETIT groupe de testeurs, et résumé
// de leurs avis.
//   node tools/essais.mjs --temps runs.csv [--avis feedback.csv] [--pv 38] [--depuis 2026-11-20] [--seuil 0.6] [--md docs/RAPPORT-ESSAIS.md] [--ecrire] [--forcer]
//
// runs.csv (ou .json) : export de run_stats (colonnes install, track, outcome, time, phys_ver, created_at ; la requête est dans docs/ESSAIS.md).
// feedback.csv (ou .json) : export de la table feedback (étape SQL 19).
//
// Pourquoi un modèle commun : avec ~8 testeurs, chaque circuit n'a que quelques temps (pas de centile possible circuit par circuit, il en faut 20 :
// tools/telemetry-report.mjs). Mais tous les temps se comparent au temps du pilote automatique du MÊME circuit (tools/golden-temps.json) :
//   ln(meilleur temps du testeur p sur le circuit t / temps du pilote sur t) = mu + niveau du testeur p + difficulté propre du circuit t + bruit
// Les niveaux se lisent sur TOUS les circuits à la fois ; la difficulté propre d'un circuit est tirée vers 0 (« comme les autres, rapporté au pilote »)
// tant qu'il a peu de temps (K_CIRCUIT). La répartition « niveau + bruit » de tous les testeurs (chacun compte autant, quel que soit le nombre de circuits
// joués) donne les médailles de chaque circuit aux quantiles ESSAI_QUANTILES. Un circuit que personne n'a fini reçoit la difficulté moyenne (« extrapolé »).
// Le bronze ouvre les chapitres (4 médailles) : il est calé pour que presque tous les testeurs l'atteignent (90 %).
import { readFileSync, writeFileSync } from 'node:fs';
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { PHYS_VER } from '../js/version.js';
import { SCALES, CHOICES } from '../js/feedback.js';
import { writeMedals } from './medals.mjs';

export const ESSAI_QUANTILES = { cristal: 0.03, or: 0.15, argent: 0.5, bronze: 0.9 };
export const K_CIRCUIT = 3;              // poids (en nombre de testeurs) du « circuit moyen » dans la difficulté propre d'un circuit
export const K_JOUEUR = 1;               // idem pour le niveau d'un testeur (léger : un testeur a toujours plusieurs circuits)
export const MIN_ESSAI = { testeurs: 5, circuits: 3, temps: 40 };   // en dessous, --ecrire refuse (sauf --forcer) : trop peu pour régler 72 circuits
export const TOO_FAST = 0.6;             // un temps plus de 40 % plus rapide que le pilote : raccourci ou client truqué, écarté (comme telemetry-report ; --seuil)

// CSV avec guillemets (virgules, guillemets doublés et retours à la ligne dans un champ) : l'export du tableau de bord Supabase.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head = [], ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}
export const readRows = (file) => { const t = readFileSync(file, 'utf8'); if (/\.csv$/i.test(file)) return parseCsv(t); const d = JSON.parse(t); return Array.isArray(d) ? d : d.rows || []; };

const num = (v) => (v === '' || v == null ? null : +v);

// Meilleur temps de chaque testeur (install) sur chaque circuit intégré, à cette version de la physique.
// → { best: Map(install → Map(track → s)), dropped (nombre de temps écartés), droppedBy: Map(track → Set(install)) }
export function bestTimes(rows, { golden, pv = PHYS_VER, since = null, tooFast = TOO_FAST } = {}) {
  const best = new Map(), droppedBy = new Map();
  let dropped = 0;
  const t0 = since ? Date.parse(since) : null;
  for (const r of rows) {
    const install = String(r.install || ''), track = String(r.track || ''), time = num(r.time);
    if (!install || r.outcome !== 'finish' || !(time > 0) || !golden[track]) continue;
    if (num(r.phys_ver ?? r.pv) !== pv) continue;
    if (t0 && r.created_at && Date.parse(r.created_at) < t0) continue;
    if (time < golden[track] * tooFast) { dropped++; if (!droppedBy.has(track)) droppedBy.set(track, new Set()); droppedBy.get(track).add(install); continue; }
    if (!best.has(install)) best.set(install, new Map());
    const m = best.get(install);
    if (!m.has(track) || time < m.get(track)) m.set(track, time);
  }
  return { best, dropped, droppedBy };
}

// Le modèle, puis une seconde passe sans les temps isolés BIEN plus rapides que ce que le niveau du testeur et la difficulté du circuit prévoient
// (au moins OUTLIER_GAIN plus vite que prévu ET au-delà de OUTLIER écarts robustes : un raccourci trouvé par un seul testeur ne doit pas régler le
// cristal de tout le monde). Un temps lent n'est jamais écarté (un mauvais circuit pour un testeur, c'est normal).
// → le résultat de fitPooled, avec outliers : [{ p, t, time, ratio }]
export const OUTLIER = 5, OUTLIER_GAIN = 0.2;
export function fitRobust(best, golden, opts = {}) {
  const fit = fitPooled(best, golden, opts);
  const res = [];
  for (const [p, m] of best) for (const [t, time] of m) res.push({ p, t, time, r: Math.log(time / golden[t]) - fit.mu - fit.a.get(p) - fit.b.get(t) });
  if (res.length < 10) return { ...fit, outliers: [] };
  const sorted = res.map((x) => Math.abs(x.r)).sort((x, y) => x - y), mad = 1.4826 * sorted[Math.floor(sorted.length / 2)];
  const out = res.filter((x) => mad > 0 && x.r < -Math.max(OUTLIER * mad, -Math.log(1 - OUTLIER_GAIN)));
  if (!out.length) return { ...fit, outliers: [] };
  const kept = new Map([...best].map(([p, m]) => [p, new Map(m)]));
  for (const o of out) kept.get(o.p).delete(o.t);
  return { ...fitPooled(kept, golden, opts), outliers: out.map((o) => ({ p: o.p, t: o.t, time: o.time, ratio: o.time / golden[o.t] })) };
}

// Ajustement du modèle (moyennes alternées, avec retrait vers 0 des effets peu mesurés).
export function fitPooled(best, golden, { kTrack = K_CIRCUIT, kPlayer = K_JOUEUR, iters = 200 } = {}) {
  const obs = [];
  for (const [p, m] of best) for (const [t, time] of m) obs.push({ p, t, y: Math.log(time / golden[t]) });
  const a = new Map(), b = new Map(), nP = new Map(), nT = new Map();
  for (const o of obs) { nP.set(o.p, (nP.get(o.p) || 0) + 1); nT.set(o.t, (nT.get(o.t) || 0) + 1); a.set(o.p, 0); b.set(o.t, 0); }
  let mu = obs.length ? obs.reduce((s, o) => s + o.y, 0) / obs.length : 0;
  for (let it = 0; it < iters; it++) {
    const sa = new Map(), sb = new Map();
    for (const o of obs) sa.set(o.p, (sa.get(o.p) || 0) + o.y - mu - b.get(o.t));
    for (const [p, s] of sa) a.set(p, s / (nP.get(p) + kPlayer));
    for (const o of obs) sb.set(o.t, (sb.get(o.t) || 0) + o.y - mu - a.get(o.p));
    for (const [t, s] of sb) b.set(t, s / (nT.get(t) + kTrack));
    // mu : moyenne des testeurs (chacun compte autant), pour que « niveau 0 » soit le testeur moyen
    const per = new Map();
    for (const o of obs) { const e = per.get(o.p) || [0, 0]; e[0] += o.y - a.get(o.p) - b.get(o.t); e[1]++; per.set(o.p, e); }
    mu = per.size ? [...per.values()].reduce((s, [x, n]) => s + x / n, 0) / per.size : 0;
  }
  // répartition « niveau + bruit » : chaque temps, ramené au circuit moyen, pondéré par 1 / (circuits joués par son testeur)
  const spread = obs.map((o) => ({ v: o.y - mu - b.get(o.t), w: 1 / nP.get(o.p), p: o.p })).sort((x, y) => x.v - y.v);
  const res = obs.map((o) => o.y - mu - a.get(o.p) - b.get(o.t));
  const sigma = res.length > 1 ? Math.sqrt(res.reduce((s, x) => s + x * x, 0) / (res.length - 1)) : 0;
  return { mu, a, b, nP, nT, spread, sigma, n: obs.length };
}

// Quantile pondéré : chaque valeur occupe le milieu de son poids sur l'axe 0..1, interpolation linéaire entre deux milieux.
export function weightedQuantile(sorted, q) {
  if (!sorted.length) return NaN;
  const W = sorted.reduce((s, x) => s + x.w, 0);
  let acc = 0;
  const c = sorted.map((x) => { const m = (acc + x.w / 2) / W; acc += x.w; return m; });
  if (q <= c[0]) return sorted[0].v;
  for (let i = 1; i < sorted.length; i++) if (q <= c[i]) return sorted[i - 1].v + ((sorted[i].v - sorted[i - 1].v) * (q - c[i - 1])) / (c[i] - c[i - 1]);
  return sorted[sorted.length - 1].v;
}

const r1 = (x) => Math.round(x * 10) / 10;

// Facteurs « temps de la médaille / temps du pilote » sur un circuit de difficulté moyenne : à reporter dans js/daily.js (circuit du jour, calculé
// sur le pilote à chaque jour). → { cristal, or, argent, bronze }
export function humanFactors(fit, quantiles = ESSAI_QUANTILES) {
  return Object.fromEntries(Object.entries(quantiles).map(([k, q]) => [k, Math.exp(fit.mu + weightedQuantile(fit.spread, q))]));
}

// Médailles proposées pour chaque circuit intégré. → [{ id, bot, n, extrapolated, factor, medals, current }]
export function proposePooled(fit, golden, defs = BUILTIN_TRACKS, quantiles = ESSAI_QUANTILES) {
  const Q = Object.fromEntries(Object.entries(quantiles).map(([k, q]) => [k, weightedQuantile(fit.spread, q)]));
  return defs.filter((d) => golden[d.id]).map((d) => {
    const bt = fit.b.get(d.id) || 0, out = {};
    let prev = 0;
    for (const k of Object.keys(quantiles)) { out[k] = Math.max(r1(golden[d.id] * Math.exp(fit.mu + bt + Q[k])), r1(prev + 0.1)); prev = out[k]; }
    return { id: d.id, bot: golden[d.id], n: fit.nT.get(d.id) || 0, extrapolated: !fit.nT.get(d.id), factor: Math.exp(fit.mu + bt), medals: out, current: d.medals, goal: d.goal };
  });
}

export function enoughData(best) {
  const testers = [...best.values()].filter((m) => m.size >= MIN_ESSAI.circuits).length;
  const temps = [...best.values()].reduce((s, m) => s + m.size, 0);
  return { ok: testers >= MIN_ESSAI.testeurs && temps >= MIN_ESSAI.temps, testers, temps };
}

// Part des testeurs qui atteignent chaque médaille (sur leurs meilleurs temps), avec les médailles données.
export function reach(best, medalsOf) {
  const tot = { cristal: 0, or: 0, argent: 0, bronze: 0, n: 0 };
  for (const m of best.values()) for (const [t, time] of m) {
    const M = medalsOf(t); if (!M) continue;
    tot.n++;
    for (const k of ['cristal', 'or', 'argent', 'bronze']) if (time <= M[k] + 1e-6) tot[k]++;
  }
  return tot;
}

// Avis : moyenne de chaque note, répartition par expérience et appareil, textes libres.
export function summariseFeedback(rows, { version = null } = {}) {
  const list = rows.filter((r) => r && r.install && (!version || r.version === version))
    .map((r) => ({ ...r, ...Object.fromEntries(SCALES.map((s) => [s.key, num(r[s.key])])) }));
  // un seul avis par installation : le dernier (on peut renvoyer le formulaire)
  const last = new Map();
  for (const r of list.sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')))) last.set(r.install, r);
  const L = [...last.values()];
  const mean = (arr, k) => { const v = arr.map((r) => r[k]).filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const groups = { tous: L };
  for (const [v] of CHOICES.experience) groups[v] = L.filter((r) => r.experience === v);
  for (const [v] of CHOICES.device) groups[v] = L.filter((r) => r.device === v);
  const scales = SCALES.map((s) => {
    const g = Object.fromEntries(Object.entries(groups).map(([k, arr]) => [k, { n: arr.length, mean: mean(arr, s.key) }]));
    const m = g.tous.mean;
    let signal = null;
    if (m != null && s.type === 'equilibre' && L.length >= 3 && Math.abs(m) >= 0.5) signal = m < 0 ? s.ends[0] : s.ends[1];
    if (m != null && s.type === 'note' && L.length >= 3 && m < 3) signal = 'note basse';
    return { key: s.key, label: s.label, type: s.type, ends: s.ends, groups: g, signal };
  });
  const counts = Object.fromEntries(Object.keys(CHOICES).map((k) => [k, Object.fromEntries(CHOICES[k].map(([v]) => [v, L.filter((r) => r[k] === v).length]))]));
  const texts = L.filter((r) => r.tracks_note || r.comment).map((r) => ({ experience: r.experience, device: r.device, tracks: r.tracks_note || '', comment: r.comment || '', pseudo: r.pseudo || '' }));
  return { n: L.length, sent: list.length, scales, counts, texts, experienceOf: new Map(L.map((r) => [r.install, r.experience])) };
}

const pct = (a, n) => (n ? Math.round((a / n) * 100) + ' %' : '—');
const med = (m) => (m ? `${m.cristal} / ${m.or} / ${m.argent} / ${m.bronze}` : '—');
const sgn = (x) => (x == null ? '—' : (x > 0 ? '+' : '') + x.toFixed(1));

export function toMarkdown({ fit, proposals, best, dropped, droppedBy = new Map(), data, fb, pv, since, tooFast = TOO_FAST }) {
  const L = [`# Rapport des essais humains (physique ${pv}${since ? `, depuis le ${since}` : ''})`, ''];
  if (fit && !fit.n) L.push('## Temps', '', `Aucun meilleur temps sur un circuit de la carrière en physique ${pv}${since ? ' depuis cette date' : ''} (les circuits de joueurs et le circuit du jour ne règlent pas les médailles de la carrière).`, '');
  if (fit && fit.n) {
    const byId = new Map(proposals.map((p) => [p.id, p]));
    const before = reach(best, (t) => byId.get(t) && byId.get(t).current), after = reach(best, (t) => byId.get(t) && byId.get(t).medals);
    L.push('## Temps', '',
      `${data.testers} testeurs avec au moins ${MIN_ESSAI.circuits} circuits finis, ${data.temps} meilleurs temps (un par testeur et par circuit)${dropped ? `, ${dropped} temps impossibles écartés` : ''}. ` +
      `Un testeur moyen met **${(Math.exp(fit.mu) * 100).toFixed(0)} %** du temps du pilote automatique ; écart d'un circuit à l'autre pour un même testeur : ±${(fit.sigma * 100).toFixed(0)} %.`, '',
      '| Médaille atteinte (meilleurs temps des testeurs) | Médailles actuelles | Proposées |', '| --- | ---: | ---: |');
    for (const k of ['cristal', 'or', 'argent', 'bronze']) L.push(`| ${k} | ${pct(before[k], before.n)} | ${pct(after[k], after.n)} |`);
    L.push('', `Cible des médailles proposées : ${Object.entries(ESSAI_QUANTILES).map(([k, q]) => `${k} ${Math.round(q * 100)} %`).join(', ')} des testeurs (chacun compte autant).`, '');
    const F = humanFactors(fit);
    L.push(`Circuit du jour (\`js/daily.js\`, médailles calculées sur le pilote) : multiplier le temps du pilote par ${Object.entries(F).map(([k, v]) => `${k} ×${v.toFixed(2)}`).join(', ')} (aujourd'hui : cristal ×0,97, or ×1, argent ×1,15, bronze ×1,35).`, '');
    if (droppedBy.size || (fit.outliers && fit.outliers.length)) {
      L.push('### Temps écartés (raccourci possible : à regarder sur le circuit)', '');
      for (const [t, set] of [...droppedBy].sort((x, y) => y[1].size - x[1].size)) L.push(`- **${t}** : ${set.size} testeur(s) à moins de ${Math.round(tooFast * 100)} % du temps du pilote`);
      for (const o of fit.outliers || []) L.push(`- **${o.t}** : ${o.p.slice(0, 6)}… en ${o.time.toFixed(2)} s (${Math.round(o.ratio * 100)} % du pilote), bien plus vite que ses autres circuits`);
      if (dropped > 0.05 * (dropped + data.temps)) L.push('', `**${dropped} temps écartés sur ${dropped + data.temps}** : si ce ne sont pas des raccourcis, le seuil est trop strict pour ces testeurs (essayer \`--seuil 0.5\`).`);
      L.push('');
    }
    L.push('### Testeurs', '', '| Testeur | Expérience | Circuits finis | Niveau (temps / pilote) |', '| --- | --- | ---: | ---: |');
    for (const [p, m] of [...best].sort((x, y) => fit.a.get(x[0]) - fit.a.get(y[0]))) {
      if (!fit.a.has(p)) continue;
      L.push(`| ${p.slice(0, 6)}… | ${(fb && fb.experienceOf.get(p)) || '?'} | ${m.size} | ${(Math.exp(fit.mu + fit.a.get(p)) * 100).toFixed(0)} % |`);
    }
    L.push('', '### Circuits', '', '| Circuit | Testeurs | Pilote (s) | Difficulté propre | Actuelles (C / O / A / B) | Proposées | Objectif |', '| --- | ---: | ---: | ---: | --- | --- | --- |');
    for (const p of proposals) {
      const g = p.goal && p.goal.id === 'under' ? `moins de ${Math.round(((p.medals.or + p.medals.argent) / 2) * 2) / 2} s` : '';
      L.push(`| ${p.id} | ${p.n || 'extrapolé'} | ${p.bot.toFixed(1)} | ${p.n ? sgn((Math.exp(fit.b.get(p.id) || 0) - 1) * 100) + ' %' : '—'} | ${med(p.current)} | ${med(p.medals)} | ${g} |`);
    }
    L.push('');
  }
  if (fb) {
    L.push('## Avis', '', `${fb.n} testeurs ont répondu (${fb.sent} envois). ` + Object.entries(fb.counts).map(([k, c]) => `${k} : ${Object.entries(c).map(([v, n]) => `${v} ${n}`).join(', ')}`).join(' · '), '',
      '| Question | Tous | Débutants | Habitués | Ordinateur | Téléphone | Tablette | À retenir |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    const cell = (g, s) => (g.n ? (s.type === 'note' ? g.mean.toFixed(1) + ' / 5' : sgn(g.mean)) + ` (${g.n})` : '—');
    for (const s of fb.scales) L.push(`| ${s.label}${s.type === 'equilibre' ? ` (−2 ${s.ends[0].toLowerCase()} … +2 ${s.ends[1].toLowerCase()})` : ''} | ${['tous', 'debutant', 'habitue', 'ordinateur', 'telephone', 'tablette'].map((k) => cell(s.groups[k], s)).join(' | ')} | ${s.signal || ''} |`);
    if (fb.texts.length) {
      L.push('', '### Ce que les testeurs ont écrit', '');
      for (const t of fb.texts) L.push(`- _${t.experience}, ${t.device}${t.pseudo ? ', ' + t.pseudo : ''}_ — ${[t.tracks && 'Circuits : ' + t.tracks, t.comment].filter(Boolean).join(' · ').replace(/\|/g, '/')}`);
    }
    L.push('');
  }
  return L.join('\n');
}

if (process.argv[1] && /(^|[\\/])essais\.mjs$/.test(process.argv[1])) {
  const args = process.argv.slice(2), opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  if (!opt('--temps') && !opt('--avis')) { console.log('usage : node tools/essais.mjs --temps runs.csv [--avis feedback.csv] [--pv N] [--depuis AAAA-MM-JJ] [--seuil 0.6] [--md fichier.md] [--ecrire] [--forcer]'); process.exit(1); }
  const golden = JSON.parse(readFileSync(new URL('./golden-temps.json', import.meta.url), 'utf8'));
  const pv = opt('--pv') ? +opt('--pv') : PHYS_VER, since = opt('--depuis');
  const fb = opt('--avis') ? summariseFeedback(readRows(opt('--avis'))) : null;
  const tooFast = opt('--seuil') ? +opt('--seuil') : TOO_FAST;
  let fit = null, proposals = [], best = new Map(), dropped = 0, droppedBy = new Map(), data = null;
  if (opt('--temps')) {
    ({ best, dropped, droppedBy } = bestTimes(readRows(opt('--temps')), { golden, pv, since, tooFast }));
    data = enoughData(best);
    fit = fitRobust(best, golden);
    proposals = proposePooled(fit, golden);
  }
  const md = toMarkdown({ fit, proposals, best, dropped, droppedBy, data, fb, pv, since, tooFast });
  console.log(md);
  if (opt('--md')) writeFileSync(opt('--md'), md + '\n');
  if (args.includes('--ecrire')) {
    if (!fit || !fit.n) { console.log('Aucun temps : rien à écrire.'); process.exit(1); }
    // (après un changement de physique : le niveau humain mesuré en physique pv, appliqué aux temps ACTUELS du pilote, golden-temps.json ; à confirmer)
    if (pv !== PHYS_VER && !args.includes('--forcer')) { console.log(`Temps de la physique ${pv}, le jeu est en ${PHYS_VER} : rien n'est écrit. --forcer pour appliquer le niveau mesuré aux temps actuels du pilote.`); process.exit(1); }
    if (!data.ok && !args.includes('--forcer')) { console.log(`Trop peu de données pour régler 72 circuits (${data.testers} testeurs, ${data.temps} temps ; il faut ${MIN_ESSAI.testeurs} testeurs et ${MIN_ESSAI.temps} temps). --forcer pour écrire quand même.`); process.exit(1); }
    const path = new URL('../js/tracks.js', import.meta.url);
    let src = readFileSync(path, 'utf8');
    for (const p of proposals) src = writeMedals(src, BUILTIN_TRACKS.find((d) => d.id === p.id), p.medals);
    writeFileSync(path, src);
    console.log(`${proposals.length} circuits recalés sur les essais dans js/tracks.js (medalsBy: 'humain'). Ensuite : node tools/contract.mjs --builtin ; node tools/fiche-essai.mjs ; npm run sw ; npm run build:function ; npm test`);
  }
}
