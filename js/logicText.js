// Logique du circuit en phrases, et ses vérifications (éditeur de logique, E11). Module pur, testé sous Node (tools/test-logique.mjs).
//   describeRule(rule, track)       « Quand le checkpoint 1 est passé, si le compteur 1 ≥ 2 : montrer « Porte ». (une fois) »
//   checkLogic(track, lg)           [{ level: 'error' | 'warn', msg, rule }] : ce qui empêcherait de finir, ou une règle qui ne ferait rien
//   scriptsToLogic(track)           les déclencheurs de cases (lot 12) en règles de logique, chaque case devenant un groupe (voir l'éditeur)
import { PIECES, cpKind } from './pieces.js';
import { SCRIPT_ACTIONS } from './scripts.js';
import { sanitizeLogic, LOGIC_MAX } from './sim/logic.js';
import { getLang, translate } from './i18n.js';

// Les phrases sont construites morceau par morceau, dans la langue du joueur, à partir de la petite table ci-dessous (et non du dictionnaire de la page :
// des modèles aussi généraux que « {e} : {a}. » y attraperaient d'autres phrases). En français, le texte est celui qu'on lit dans l'éditeur.
export const VEH_LABEL = { car: 'voiture', moto: 'moto', boat: 'bateau', glider: 'deltaplane' };
const OP = { '==': '=', '!=': '≠', '>=': '≥', '<=': '≤', '>': '>', '<': '<' };
const P = {
  fr: {
    veh: VEH_LABEL, group: (n) => `Groupe ${n}`, sec: (s) => s.toFixed(1).replace('.', ','),
    start: 'Au départ', cp: (n) => `Quand le checkpoint n° ${n} est passé`, cpAny: 'À chaque checkpoint passé', lap: (n) => `Au début du tour ${n}`,
    time: (s) => `À ${s} s de course`, zone: (g) => `Quand la voiture entre sur ${g}`, vehEv: (v) => `Quand la voiture passe en ${v}`,
    cps: (op, n) => `checkpoints passés ${op} ${n}`, lapC: (op, n) => `tour ${op} ${n}`, varC: (i, op, n) => `compteur ${i} ${op} ${n}`, vehC: (v) => `en ${v}`,
    shown: (g) => `${g} visible`, hidden: (g) => `${g} caché`,
    show: (g) => `montrer ${g}`, hide: (g) => `cacher ${g}`, toggle: (g) => `basculer ${g}`, grav: (n) => `gravité à ${n} %`, varSet: (i, n) => `compteur ${i} = ${n}`, varAdd: (i, op, n) => `compteur ${i} ${op} ${n}`,
    rule: (e, c, a) => (c ? `${e}, si ${c} : ${a}.` : `${e} : ${a}.`), and: ' et ', once: '(une fois)',
    start_: 'le départ', finish_: 'l’arrivée', cp_: 'un checkpoint',
    offBad: (g, w) => `${g} est caché au départ et aucune règle ne le montre : il contient ${w}, la course ne peut pas finir.`,
    offEmpty: (g) => `${g} est caché au départ mais ne contient rien.`,
    cpNever: (n, c, k) => `Règle ${n} : le circuit n’a que ${c} passage${c > 1 ? 's' : ''} de checkpoint, le n° ${k} n’arrivera jamais.`,
    lapNever: (n, l) => `Règle ${n} : le circuit n’a que ${l} tour${l > 1 ? 's' : ''}.`,
    zoneEmpty: (n, g) => `Règle ${n} : ${g} ne contient aucune pièce, la voiture n’y entrera jamais.`,
    groupEmpty: (n, g) => `Règle ${n} : ${g} ne contient rien.`,
    varMissing: (n, k, v) => `Règle ${n} : le compteur ${k} n’existe pas (${v} compteur${v > 1 ? 's' : ''}).`,
  },
  en: {
    veh: { car: 'car', moto: 'motorbike', boat: 'boat', glider: 'hang-glider' }, group: (n) => `Group ${n}`, sec: (s) => s.toFixed(1),
    start: 'At the start', cp: (n) => `When checkpoint no. ${n} is passed`, cpAny: 'At every checkpoint passed', lap: (n) => `At the start of lap ${n}`,
    time: (s) => `At ${s} s of race time`, zone: (g) => `When the car enters ${g}`, vehEv: (v) => `When the car turns into a ${v}`,
    cps: (op, n) => `checkpoints passed ${op} ${n}`, lapC: (op, n) => `lap ${op} ${n}`, varC: (i, op, n) => `counter ${i} ${op} ${n}`, vehC: (v) => `as a ${v}`,
    shown: (g) => `${g} visible`, hidden: (g) => `${g} hidden`,
    show: (g) => `show ${g}`, hide: (g) => `hide ${g}`, toggle: (g) => `toggle ${g}`, grav: (n) => `gravity at ${n} %`, varSet: (i, n) => `counter ${i} = ${n}`, varAdd: (i, op, n) => `counter ${i} ${op} ${n}`,
    rule: (e, c, a) => (c ? `${e}, if ${c}: ${a}.` : `${e}: ${a}.`), and: ' and ', once: '(once)',
    start_: 'the start', finish_: 'the finish', cp_: 'a checkpoint',
    offBad: (g, w) => `${g} is hidden at the start and no rule shows it: it contains ${w}, the race cannot be finished.`,
    offEmpty: (g) => `${g} is hidden at the start but contains nothing.`,
    cpNever: (n, c, k) => `Rule ${n}: the track only has ${c} checkpoint pass${c > 1 ? 'es' : ''}, no. ${k} will never happen.`,
    lapNever: (n, l) => `Rule ${n}: the track only has ${l} lap${l > 1 ? 's' : ''}.`,
    zoneEmpty: (n, g) => `Rule ${n}: ${g} contains no piece, the car will never enter it.`,
    groupEmpty: (n, g) => `Rule ${n}: ${g} contains nothing.`,
    varMissing: (n, k, v) => `Rule ${n}: counter ${k} does not exist (${v} counter${v > 1 ? 's' : ''}).`,
  },
};
const L = () => P[getLang()] || P.fr;
const gname = (track, g) => `« ${(track && track.groups && track.groups[g]) || L().group(g)} »`;
const fxLabel = (a, v) => {
  const A = SCRIPT_ACTIONS.find((x) => x[0] === a);
  if (!A) return a;
  const ch = Array.isArray(A[2]) ? A[2].find(([k]) => k === v) : null;
  const what = translate(A[1]).toLowerCase();
  return a === 'msg' ? `${what} « ${v} »` : `${what}${ch ? ' : ' + translate(ch[1]).toLowerCase() : v ? ' : ' + v : ''}`;
};

export function describeEvent(on, track) {
  const p = L();
  switch (on[0]) {
    case 'start': return p.start;
    case 'cp': return on[1] ? p.cp(on[1]) : p.cpAny;
    case 'lap': return p.lap(on[1]);
    case 'time': return p.time(p.sec(on[1] / 120));
    case 'zone': return p.zone(gname(track, on[1]));
    case 'veh': return p.vehEv(p.veh[on[1]] || on[1]);
    default: return '?';
  }
}
export function describeCond(c, track) {
  const p = L();
  switch (c[0]) {
    case 'cps': return p.cps(OP[c[1]], c[2]);
    case 'lap': return p.lapC(OP[c[1]], c[2]);
    case 'var': return p.varC(c[1] + 1, OP[c[2]], c[3]);
    case 'veh': return p.vehC(p.veh[c[1]] || c[1]);
    case 'shown': return p.shown(gname(track, c[1]));
    case 'hidden': return p.hidden(gname(track, c[1]));
    default: return '?';
  }
}
export function describeAct(a, track) {
  const p = L();
  switch (a[0]) {
    case 'show': return p.show(gname(track, a[1]));
    case 'hide': return p.hide(gname(track, a[1]));
    case 'toggle': return p.toggle(gname(track, a[1]));
    case 'grav': return p.grav(a[1]);
    case 'var': return a[2] === '=' ? p.varSet(a[1] + 1, a[3]) : p.varAdd(a[1] + 1, a[2] === '+' ? '+' : '−', a[3]);
    case 'fx': return fxLabel(a[1], a[2]);
    default: return '?';
  }
}
export function describeRule(r, track) {
  const p = L(), s = p.rule(describeEvent(r.on, track), r.if.map((x) => describeCond(x, track)).join(p.and), r.do.map((x) => describeAct(x, track)).join(', '));
  return r.once ? s + ' ' + p.once : s;
}

// Vérifications (sans rouler) : ce qui rend l'arrivée impossible, et ce qui ne ferait rien.
export function checkLogic(track, lg) {
  const Lg = sanitizeLogic(lg), out = [];
  if (!Lg) return out;
  const members = new Map();
  for (const t of track.tiles) if (t.g) members.set(t.g, (members.get(t.g) || 0) + 1);
  for (const d of track.decos) if (d.g) members.set(d.g, (members.get(d.g) || 0) + 1);
  const shown = new Set();
  for (const r of Lg.rules) for (const a of r.do) if (a[0] === 'show' || a[0] === 'toggle') shown.add(a[1]);
  // Arrivée ou checkpoint caché au départ et jamais montré : la course ne peut pas finir.
  for (const g of Lg.off) {
    const bad = track.tiles.filter((x) => x.g === g && (cpKind(x) || PIECES[x.t].special === 'finish' || PIECES[x.t].special === 'start'));
    if (bad.length && !shown.has(g)) {
      const sp = PIECES[bad[0].t].special, p = L(), what = sp === 'start' ? p.start_ : sp === 'finish' ? p.finish_ : p.cp_;
      out.push({ level: 'error', rule: -1, msg: p.offBad(gname(track, g), what) });
    }
    if (!members.get(g)) out.push({ level: 'warn', rule: -1, msg: L().offEmpty(gname(track, g)) });
  }
  const cps = track.tiles.filter((t) => cpKind(t)).length * Math.max(1, track.laps || 1);
  Lg.rules.forEach((r, i) => {
    const n = i + 1, laps = Math.max(1, track.laps || 1);
    if (r.on[0] === 'cp' && r.on[1] > cps) out.push({ level: 'warn', rule: i, msg: L().cpNever(n, cps, r.on[1]) });
    if (r.on[0] === 'lap' && r.on[1] > laps) out.push({ level: 'warn', rule: i, msg: L().lapNever(n, laps) });
    if (r.on[0] === 'zone' && !track.tiles.some((x) => x.g === r.on[1])) out.push({ level: 'warn', rule: i, msg: L().zoneEmpty(n, gname(track, r.on[1])) });
    for (const a of r.do) if (['show', 'hide', 'toggle'].includes(a[0]) && !members.get(a[1])) out.push({ level: 'warn', rule: i, msg: L().groupEmpty(n, gname(track, a[1])) });
    for (const c of [...r.if.filter((x) => x[0] === 'var').map((x) => x[1]), ...r.do.filter((x) => x[0] === 'var').map((x) => x[1])]) {
      if (c >= Lg.vars) out.push({ level: 'warn', rule: i, msg: L().varMissing(n, c + 1, Lg.vars) });
    }
  });
  return out;
}

// Déclencheurs de cases (lot 12) -> règles « quand la voiture entre sur ce groupe : effet ». Chaque case devient un groupe libre (les pièces de la case
// y sont rangées) : renvoie { lg, assign: [[tile, g]], names: [[g, nom]] } à appliquer par l'éditeur, ou null s'il n'y a rien à convertir ou plus de
// groupe libre. Les cases sans pièce (un déclencheur en l'air) sont laissées : elles n'ont pas de « zone ».
export function scriptsToLogic(track) {
  const scripts = track.scripts || [];
  if (!scripts.length) return null;
  const used = new Set(track.usedGroups ? track.usedGroups() : []);
  for (const [g] of track.groupNames ? track.groupNames() : []) used.add(g);
  const free = []; for (let g = 1; g <= 63; g++) if (!used.has(g)) free.push(g);
  const byCell = new Map();
  for (const s of scripts) { const k = s.x + ',' + s.z; if (!byCell.has(k)) byCell.set(k, []); byCell.get(k).push(s); }
  const lg = sanitizeLogic(track.lg) || { v: 1, off: [], vars: 0, rules: [] };
  const assign = [], names = [];
  for (const [k, list] of byCell) {
    const [x, z] = k.split(',').map(Number), tiles = track.tilesAt(x, z).filter((t) => !t.g);
    if (!tiles.length || !free.length || lg.rules.length >= LOGIC_MAX.rules) continue;
    const g = free.shift();
    for (const t of tiles) assign.push([t, g]);
    names.push([g, `Case ${x},${z}`]);
    lg.rules.push({ on: ['zone', g], if: [], do: list.slice(0, LOGIC_MAX.acts).map((s) => ['fx', s.a, s.v]), once: true });
  }
  if (!assign.length) return null;
  return { lg, assign, names };
}
