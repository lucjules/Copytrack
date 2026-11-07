// Rapport des statistiques de jeu anonymes : difficulté réelle des circuits et médailles proposées sur de vrais joueurs.
//   node tools/telemetry-report.mjs runs.json [--pv 26] [--ecrire-humains docs/temps-humains.json] [--md docs/RAPPORT-TELEMETRIE.md]
//
// runs.json (ou .csv) : export de la table run_stats (Supabase > Table editor > Export, ou
//   select * from run_stats where phys_ver = 26 ;) avec les colonnes install, track, outcome, time, progress, respawns, attempt, phys_ver, medal.
// Pour chaque circuit : joueurs, taux d'arrivée, essais avant la première arrivée, temps (centiles des MEILLEURS temps, un par joueur), endroit où l'on abandonne,
// médailles proposées (centiles 3 / 12 / 40 / 75 %, voir proposeFromSample dans medals.mjs) et alertes (trop dur, trop facile, Or hors de portée, mur).
// Les temps impossibles (plus de 40 % plus rapides que le pilote automatique) sont écartés : un client truqué ne règle pas les médailles.
// Pour recaler : --ecrire-humains écrit le fichier des meilleurs temps, puis  node tools/medals.mjs --humain docs/temps-humains.json --ecrire
import { readFileSync, writeFileSync } from 'node:fs';
import { BUILTIN_TRACKS } from '../js/tracks.js';
import { quantile, proposeFromSample, MIN_SAMPLE } from './medals.mjs';

export function parseRows(text, name = 'runs.json') {
  if (name.endsWith('.csv')) {
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return lines.filter(Boolean).map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.replace(/^"|"$/g, '')])));
  }
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : data.rows || [];
}

const num = (v) => (v === '' || v == null ? null : +v);

// rows : lignes de run_stats ; defs : circuits intégrés ({ id, medals }) ; golden : { id: temps du pilote automatique } (pour écarter les temps impossibles).
export function analyse(rows, { defs = BUILTIN_TRACKS, golden = {}, pv = null, minSample = MIN_SAMPLE } = {}) {
  const clean = rows.map((r) => ({ install: String(r.install), track: String(r.track), outcome: r.outcome, time: num(r.time), progress: num(r.progress), respawns: num(r.respawns) || 0, attempt: num(r.attempt) || 1, pv: num(r.phys_ver ?? r.pv) }))
    .filter((r) => r.install && r.track && (r.outcome === 'finish' || r.outcome === 'quit') && r.time > 0);
  const version = pv ?? Math.max(...clean.map((r) => r.pv || 0), 0);
  const byTrack = new Map();
  for (const r of clean) { if (r.pv !== version) continue; if (!byTrack.has(r.track)) byTrack.set(r.track, []); byTrack.get(r.track).push(r); }
  const out = [];
  for (const [track, list] of [...byTrack].sort(([a], [b]) => a.localeCompare(b))) {
    const def = defs.find((d) => d.id === track) || null, bot = golden[track] || (def && def.medals && def.medals.or) || null;
    const installs = new Set(list.map((r) => r.install));
    let dropped = 0;
    const best = new Map(), firstFinish = new Map();
    for (const r of list.filter((x) => x.outcome === 'finish')) {
      if (bot && r.time < bot * 0.6) { dropped++; continue; }
      if (!best.has(r.install) || r.time < best.get(r.install)) best.set(r.install, r.time);
      if (!firstFinish.has(r.install) || r.attempt < firstFinish.get(r.install)) firstFinish.set(r.install, r.attempt);
    }
    const times = [...best.values()].sort((a, b) => a - b);
    const quits = list.filter((r) => r.outcome === 'quit' && r.progress != null);
    const hist = [0, 0, 0, 0, 0];
    for (const q of quits) hist[Math.min(4, Math.floor(q.progress * 5))]++;
    const attempts = [...firstFinish.values()].sort((a, b) => a - b);
    const row = {
      track, installs: installs.size, finishers: times.length, completion: installs.size ? times.length / installs.size : 0, dropped,
      attemptsMedian: attempts.length ? quantile(attempts, 0.5) : null,
      p: times.length ? { p3: quantile(times, 0.03), p12: quantile(times, 0.12), p40: quantile(times, 0.4), p50: quantile(times, 0.5), p75: quantile(times, 0.75) } : null,
      quitHist: hist, quits: quits.length, bot, current: def ? def.medals : null,
      proposed: times.length >= minSample ? proposeFromSample(times) : null, times, alerts: [],
    };
    if (installs.size >= 10 && row.completion < 0.35) row.alerts.push(`trop dur : ${(row.completion * 100).toFixed(0)} % des joueurs finissent`);
    if (installs.size >= 10 && row.completion > 0.95 && row.attemptsMedian <= 1) row.alerts.push('trop facile : tout le monde finit du premier coup');
    if (row.current && times.length >= minSample) {
      const reachedOr = times.filter((t) => t <= row.current.or + 1e-6).length / times.length;
      if (reachedOr < 0.03) row.alerts.push(`Or hors de portée : ${(reachedOr * 100).toFixed(1)} % des finisseurs l'atteignent`);
      if (reachedOr > 0.4) row.alerts.push(`Or trop facile : ${(reachedOr * 100).toFixed(0)} % des finisseurs l'atteignent`);
    }
    if (quits.length >= 10) { const k = hist.indexOf(Math.max(...hist)); if (hist[k] / quits.length > 0.4) row.alerts.push(`mur vers ${k * 20}-${k * 20 + 20} % du circuit : ${(hist[k] / quits.length * 100).toFixed(0)} % des abandons`); }
    out.push(row);
  }
  return { version, tracks: out };
}

const f1 = (x) => (x == null ? '—' : x.toFixed(1));
export function toMarkdown(rep) {
  const L = [`# Rapport des statistiques de jeu (physique ${rep.version})`, '',
    '| Circuit | Joueurs | Finissent | Essais (méd.) | p3 | p12 | p40 | p75 | Médailles écrites (C/O/A/B) | Proposées | Alertes |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |'];
  const med = (m) => (m ? `${m.cristal}/${m.or}/${m.argent}/${m.bronze}` : '—');
  for (const t of rep.tracks) L.push(`| ${t.track} | ${t.installs} | ${(t.completion * 100).toFixed(0)} % | ${t.attemptsMedian ?? '—'} | ${f1(t.p && t.p.p3)} | ${f1(t.p && t.p.p12)} | ${f1(t.p && t.p.p40)} | ${f1(t.p && t.p.p75)} | ${med(t.current)} | ${med(t.proposed)} | ${t.alerts.join(' ; ') || '—'} |`);
  return L.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('telemetry-report.mjs')) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { console.log('usage : node tools/telemetry-report.mjs runs.json [--pv N] [--ecrire-humains fichier.json] [--md rapport.md]'); process.exit(1); }
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const rep = analyse(parseRows(readFileSync(file, 'utf8'), file), { pv: opt('--pv') ? +opt('--pv') : null });
  const md = toMarkdown(rep);
  console.log(md);
  if (opt('--md')) writeFileSync(opt('--md'), md);
  if (opt('--ecrire-humains')) {
    const humains = Object.fromEntries(rep.tracks.filter((t) => t.track !== 'daily').map((t) => [t.track, t.times.map((x) => Math.round(x * 100) / 100)]));
    writeFileSync(opt('--ecrire-humains'), JSON.stringify(humains, null, 1) + '\n');
    console.log(`Meilleurs temps (un par joueur) écrits dans ${opt('--ecrire-humains')} : node tools/medals.mjs --humain ${opt('--ecrire-humains')} --ecrire`);
  }
}
