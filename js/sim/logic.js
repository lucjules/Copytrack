// Logique du circuit (Copytrack Evolution, E10) : des règles ÉVÉNEMENT → CONDITIONS → ACTIONS exécutées DANS la simulation, donc identiques en course,
// dans les fantômes, les replays et la vérification serveur (ce module est dans la fermeture de js/verify.js : aucune horloge, aucun hasard, aucune
// trigonométrie). Elles agissent sur les GROUPES de pièces et de décorations (E9) : montrer, cacher (une pièce cachée n'a plus de collision, comme
// une dalle de verre brisée), basculer ; et sur la gravité, des compteurs, et des effets visuels ou sonores (sans effet sur la course).
//
// Format (champ `lg` du circuit, voir track.js) :
//   { v: 1, off: [g…] (groupes cachés au départ), vars: n (0 à 4 compteurs), rules: [{ on, if, do, once }] }
//   on  : ['start'] | ['cp', n] (n-ième checkpoint passé ; 0 : n'importe lequel) | ['lap', n] | ['time', pas] | ['zone', g] (la voiture entre
//         sur une pièce du groupe g) | ['veh', 'car' | 'moto' | 'boat' | 'glider'] (devient ce véhicule)
//   if  : [['cps', op, n] | ['lap', op, n] | ['var', i, op, n] | ['veh', v] | ['shown', g] | ['hidden', g]]   (toutes vraies ; op : == != >= <= > <)
//   do  : [['show', g] | ['hide', g] | ['toggle', g] | ['grav', pct] | ['var', i, '=' | '+' | '-', n] | ['fx', action, valeur]]
//   once: la règle ne se déclenche qu'une fois par essai (un retour au checkpoint revient à l'état de ce checkpoint, déclenchements compris).
// Bornes : 32 règles, 8 conditions et 8 actions par règle, groupes 1 à 63, 4 compteurs (-999 à 999), gravité 15 à 250 %.
import { sanitizeScript } from '../scripts.js';

export const LOGIC_MAX = { rules: 32, conds: 8, acts: 8, vars: 4 };
export const LOGIC_EVENTS = ['start', 'cp', 'lap', 'time', 'zone', 'veh'];
export const LOGIC_CONDS = ['cps', 'lap', 'var', 'veh', 'shown', 'hidden'];
export const LOGIC_ACTS = ['show', 'hide', 'toggle', 'grav', 'var', 'fx'];
export const LOGIC_OPS = ['==', '!=', '>=', '<=', '>', '<'];
const VEHS = ['car', 'moto', 'boat', 'glider'];
const int = (v, lo, hi) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
const grp = (v) => int(v, 1, 63);

function cleanEvent(o) {
  if (!Array.isArray(o) || !LOGIC_EVENTS.includes(o[0])) return null;
  switch (o[0]) {
    case 'start': return ['start'];
    case 'cp': return ['cp', int(o[1], 0, 999)];
    case 'lap': return ['lap', int(o[1], 1, 99)];
    case 'time': return ['time', int(o[1], 1, 120 * 900)];
    case 'zone': return ['zone', grp(o[1])];
    case 'veh': return VEHS.includes(o[1]) ? ['veh', o[1]] : null;
    default: return null;
  }
}
function cleanCond(c) {
  if (!Array.isArray(c) || !LOGIC_CONDS.includes(c[0])) return null;
  const op = (x) => (LOGIC_OPS.includes(x) ? x : '==');
  switch (c[0]) {
    case 'cps': return ['cps', op(c[1]), int(c[2], 0, 999)];
    case 'lap': return ['lap', op(c[1]), int(c[2], 1, 99)];
    case 'var': return ['var', int(c[1], 0, LOGIC_MAX.vars - 1), op(c[2]), int(c[3], -999, 999)];
    case 'veh': return VEHS.includes(c[1]) ? ['veh', c[1]] : null;
    case 'shown': case 'hidden': return [c[0], grp(c[1])];
    default: return null;
  }
}
function cleanAct(a) {
  if (!Array.isArray(a) || !LOGIC_ACTS.includes(a[0])) return null;
  switch (a[0]) {
    case 'show': case 'hide': case 'toggle': return [a[0], grp(a[1])];
    case 'grav': return ['grav', int(a[1], 15, 250)];
    case 'var': return ['var', int(a[1], 0, LOGIC_MAX.vars - 1), ['=', '+', '-'].includes(a[2]) ? a[2] : '=', int(a[3], -999, 999)];
    case 'fx': { const s = sanitizeScript({ x: 0, z: 0, a: a[1], v: a[2] }); return s ? ['fx', s.a, s.v] : null; }
    default: return null;
  }
}

// Logique nettoyée (tout ce qui vient d'un code de circuit passe ici), ou null si elle ne contient aucune règle.
export function sanitizeLogic(lg) {
  if (!lg || typeof lg !== 'object' || !Array.isArray(lg.rules)) return null;
  const rules = [];
  for (const r of lg.rules.slice(0, LOGIC_MAX.rules)) {
    if (!r || typeof r !== 'object') continue;
    const on = cleanEvent(r.on);
    const acts = (Array.isArray(r.do) ? r.do : []).slice(0, LOGIC_MAX.acts).map(cleanAct).filter(Boolean);
    if (!on || !acts.length) continue;
    const conds = (Array.isArray(r.if) ? r.if : []).slice(0, LOGIC_MAX.conds).map(cleanCond).filter(Boolean);
    rules.push({ on, if: conds, do: acts, once: !!r.once });
  }
  if (!rules.length) return null;
  const off = [...new Set((Array.isArray(lg.off) ? lg.off : []).map(grp))].sort((a, b) => a - b);
  return { v: 1, off, vars: int(lg.vars, 0, LOGIC_MAX.vars), rules };
}

// Forme compacte du code de partage, et retour.
export const logicToArray = (lg) => { const L = sanitizeLogic(lg); return L ? [L.off, L.vars, L.rules.map((r) => [r.on, r.if, r.do, r.once ? 1 : 0])] : null; };
export const logicFromArray = (a) => (Array.isArray(a) ? sanitizeLogic({ off: a[0], vars: a[1], rules: (Array.isArray(a[2]) ? a[2] : []).map((r) => (Array.isArray(r) ? { on: r[0], if: r[1], do: r[2], once: !!r[3] } : null)) }) : null);
// Texte canonique pour la signature (la logique change la course : elle compte, comme les groupes de ce qu'elle touche).
export const logicSig = (lg) => { const a = logicToArray(lg); return a ? JSON.stringify(a) : ''; };

const cmp = (a, op, b) => (op === '==' ? a === b : op === '!=' ? a !== b : op === '>=' ? a >= b : op === '<=' ? a <= b : op === '>' ? a > b : a < b);

// Le moteur d'une course : créé par la Simulation (null sans logique). phys : la voiture (CarPhysics), race : ses règles (RaceLogic).
export function createLogic(track, phys, race) {
  const L = sanitizeLogic(track.lg);
  if (!L) return null;
  // Membres de chaque groupe (pièces et décorations), une fois pour toutes.
  const tilesOf = new Map(), decosOf = new Map();
  for (const t of track.tiles) if (t.g) { if (!tilesOf.has(t.g)) tilesOf.set(t.g, []); tilesOf.get(t.g).push(t); }
  for (const d of track.decos) if (d.g) { if (!decosOf.has(d.g)) decosOf.set(d.g, []); decosOf.get(d.g).push(d); }
  const hiddenTiles = new Set(), hiddenDecos = new Set();
  const st = { hidden: new Set(), vars: new Int16Array(LOGIC_MAX.vars), fired: new Uint8Array(L.rules.length), zone: 0, veh: '', started: false, ver: 0 };
  const fx = [];                             // effets visuels et sonores à jouer (la course en direct les lit ; ailleurs, ils sont ignorés)
  const apply = () => {
    hiddenTiles.clear(); hiddenDecos.clear();
    for (const g of st.hidden) { for (const t of tilesOf.get(g) || []) hiddenTiles.add(t); for (const d of decosOf.get(g) || []) hiddenDecos.add(d); }
    st.ver++;
  };
  // La physique et les règles de course ignorent ce qui est caché (même chemin que les dalles de verre brisées : voir CarPhysics.excl).
  phys.setLogicExclusion(hiddenTiles, hiddenDecos);
  race.excluded = hiddenTiles;

  const condOk = (c) => {
    switch (c[0]) {
      case 'cps': return cmp(race.splits.length, c[1], c[2]);
      case 'lap': return cmp(race.lap, c[1], c[2]);
      case 'var': return cmp(st.vars[c[1]], c[2], c[3]);
      case 'veh': return phys.vehicle === c[1];
      case 'shown': return !st.hidden.has(c[1]);
      case 'hidden': return st.hidden.has(c[1]);
      default: return false;
    }
  };
  const run = (r, i) => {
    if (r.once && st.fired[i]) return;
    for (const c of r.if) if (!condOk(c)) return;
    st.fired[i] = 1;
    let vis = false;
    for (const a of r.do) {
      switch (a[0]) {
        case 'show': if (st.hidden.delete(a[1])) vis = true; break;
        case 'hide': if (!st.hidden.has(a[1])) { st.hidden.add(a[1]); vis = true; } break;
        case 'toggle': if (!st.hidden.delete(a[1])) st.hidden.add(a[1]); vis = true; break;
        case 'grav': phys.gravMul = a[1] / 100; break;
        case 'var': { const v = a[2] === '=' ? a[3] : a[2] === '+' ? st.vars[a[1]] + a[3] : st.vars[a[1]] - a[3]; st.vars[a[1]] = Math.max(-999, Math.min(999, v)); break; }
        case 'fx': if (fx.length < 64) fx.push({ a: a[1], v: a[2] }); break;      // (seule la course en direct les lit : fantômes et serveur les laissent)
        default: break;
      }
    }
    if (vis) apply();
  };
  const fire = (kind, test) => { L.rules.forEach((r, i) => { if (r.on[0] === kind && test(r.on)) run(r, i); }); };

  return {
    logic: L, state: st, fx, hiddenTiles, hiddenDecos,
    reset() {
      st.hidden = new Set(L.off); st.vars.fill(0); st.fired.fill(0); st.zone = 0; st.veh = ''; st.started = false; fx.length = 0;
      apply();
    },
    snapshot() { return { hidden: [...st.hidden], vars: [...st.vars], fired: [...st.fired], zone: st.zone, veh: st.veh, started: st.started }; },
    restore(s) {
      st.hidden = new Set(s.hidden); st.vars.set(s.vars); st.fired.set(s.fired); st.zone = s.zone; st.veh = s.veh; st.started = s.started;
      apply();
    },
    // Après les règles de course d'un pas (Simulation.score) : ev = l'évènement de course de ce pas (checkpoint, tour, arrivée) ou null.
    onStep(ev) {
      if (race.finished && !(ev && ev.type === 'finish')) return;
      if (!st.started) { st.started = true; st.veh = phys.vehicle; fire('start', () => true); }
      if (ev && ev.type === 'checkpoint') fire('cp', (on) => on[1] === 0 || on[1] === ev.index);
      if (ev && ev.type === 'lap') fire('lap', (on) => on[1] === race.lap);
      fire('time', (on) => on[1] === race.steps);
      const zt = phys.rib ? phys.rib.tile : phys.surfTile;
      const z = zt && zt.g ? zt.g : 0;
      if (z !== st.zone) { st.zone = z; if (z) fire('zone', (on) => on[1] === z); }
      if (phys.vehicle !== st.veh) { st.veh = phys.vehicle; fire('veh', (on) => on[1] === st.veh); }
    },
  };
}
