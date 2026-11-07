// Championnat multijoueur (« manche ») : plusieurs circuits à la suite, des points par place, un classement général. Logique pure, sans réseau ni rendu :
// le salon (room.js) y range les résultats ; chaque joueur reçoit les mêmes temps, donc calcule le même classement.
//
// Barème (comme en Formule 1, 8 places) : 10, 8, 6, 5, 4, 3, 2, 1 ; pas de point pour qui n'a pas fini la manche (abandon, déconnexion, temps écoulé).
// Égalités au général : plus de victoires, puis meilleure somme des places, puis ordre alphabétique de l'identifiant (stable chez tous).

export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
export const MAX_ROUNDS = 10;
export const pointsFor = (position) => POINTS[position] || 0;      // position : 0 pour le premier

// Sélections de circuits proposées à l'hôte. builtins : [{ key, def: { name, difficulty, decor } }] (circuits intégrés).
export const POOLS = { all: 'Tous les circuits', easy: 'Faciles (★ à ★★)', medium: 'Moyens (★★★)', hard: 'Difficiles (★★★★ et plus)', theme: 'Un thème au hasard' };
export function poolFor(builtins, kind, { rounds = 3, random = Math.random } = {}) {
  let list = builtins.map((b) => ({ key: b.key, name: b.def.name, difficulty: b.def.difficulty, decor: b.def.decor }));
  if (kind === 'easy') list = list.filter((x) => x.difficulty <= 2);
  else if (kind === 'medium') list = list.filter((x) => x.difficulty === 3);
  else if (kind === 'hard') list = list.filter((x) => x.difficulty >= 4);
  else if (kind === 'theme') {
    const by = new Map();
    for (const x of list) (by.get(x.decor) || by.set(x.decor, []).get(x.decor)).push(x);
    const ok = [...by.values()].filter((v) => v.length >= rounds);
    if (ok.length) list = ok[Math.floor(random() * ok.length)];
  }
  return list;
}

// Choix des circuits d'un championnat : `rounds` circuits DIFFÉRENTS tirés dans `pool` ([{ key, name, difficulty }]), rangés du plus facile au plus dur
// (une montée en puissance). chapter : ne tirer que dans un chapitre de la carrière (pool déjà filtré par l'appelant). random : () => [0, 1[.
export function buildPlaylist(pool, { rounds = 3, random = Math.random } = {}) {
  const n = Math.max(1, Math.min(MAX_ROUNDS, rounds | 0, pool.length));
  const bag = pool.map((p, i) => ({ ...p, i }));
  const picked = [];
  while (picked.length < n && bag.length) picked.push(...bag.splice(Math.floor(random() * bag.length), 1));
  picked.sort((a, b) => (a.difficulty || 0) - (b.difficulty || 0) || a.i - b.i);
  return picked.map(({ key, name, sig }) => ({ id: key, name: name || '', sig: sig || '' }));
}

export class Championship {
  // rounds : [{ id, name, sig }] ; collisions : les voitures se poussent-elles ?
  constructor({ id = '', rounds = [], collisions = false } = {}) {
    this.id = String(id).slice(0, 40);
    this.rounds = rounds.slice(0, MAX_ROUNDS).map((r) => ({ id: String(r.id).slice(0, 60), name: String(r.name || '').slice(0, 40), sig: String(r.sig || '').slice(0, 40) }));
    this.collisions = !!collisions;
    this.results = [];                  // une entrée par manche terminée : { n, order: [ids], times: { id: pas | null }, points: { id: points } }
    this.names = new Map();
  }

  get total() { return this.rounds.length; }
  get played() { return this.results.length; }
  get finished() { return this.results.length >= this.rounds.length; }
  get nextRound() { return this.finished ? null : this.rounds[this.results.length]; }

  setName(id, name) { this.names.set(id, String(name || '?').slice(0, 20)); }

  // Range une manche. times : { id: pas de course | null } pour chaque participant (roster : ses identifiants). Ne fait rien si cette manche est déjà rangée
  // ou n'est pas la suivante (un message qui arrive deux fois, ou dans le désordre, ne fausse rien).
  scoreRound(n, times, roster = Object.keys(times)) {
    if (n !== this.results.length || n >= this.rounds.length) return null;
    const ids = [...new Set(roster)];
    const t = (id) => { const v = times[id]; return Number.isFinite(v) && v > 0 ? v : null; };
    const finishers = ids.filter((id) => t(id) != null).sort((a, b) => t(a) - t(b) || (a < b ? -1 : 1));
    const dnf = ids.filter((id) => t(id) == null).sort();
    const order = [...finishers, ...dnf];
    const points = {}, cleanTimes = {};
    order.forEach((id, i) => { points[id] = i < finishers.length ? pointsFor(i) : 0; cleanTimes[id] = t(id); });
    const r = { n, order, times: cleanTimes, points };
    this.results.push(r);
    return r;
  }

  // Classement général : [{ id, name, points, wins, places, rounds }] du premier au dernier.
  standings() {
    const rows = new Map();
    const row = (id) => rows.get(id) || rows.set(id, { id, name: this.names.get(id) || '?', points: 0, wins: 0, places: 0, rounds: 0 }).get(id);
    for (const id of this.names.keys()) row(id);
    for (const r of this.results) {
      r.order.forEach((id, i) => {
        const x = row(id);
        x.points += r.points[id] || 0; x.rounds++;
        x.places += r.times[id] != null ? i + 1 : r.order.length + 1;        // pas fini : pire que le dernier
        if (i === 0 && r.times[id] != null) x.wins++;
      });
    }
    return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.places - b.places || (a.id < b.id ? -1 : 1));
  }

  // Version compacte pour un arrivant en cours de championnat.
  toJSON() { return { id: this.id, rounds: this.rounds, collisions: this.collisions, results: this.results, names: Object.fromEntries(this.names) }; }
  static from(d) {
    const c = new Championship({ id: d && d.id, rounds: (d && d.rounds) || [], collisions: d && d.collisions });
    if (d && d.names && typeof d.names === 'object') for (const [id, n] of Object.entries(d.names).slice(0, 16)) c.setName(String(id).slice(0, 60), n);
    for (const r of (d && Array.isArray(d.results) ? d.results : []).slice(0, c.rounds.length)) c.scoreRound(r.n, r.times || {}, r.order || Object.keys(r.times || {}));
    return c;
  }
}

// Classement EN DIRECT d'une manche. entries : [{ id, name, finished (pas de course ou null), prog (0 à 1) }] ; les arrivés d'abord (par temps), puis par progression décroissante.
export function liveOrder(entries) {
  const key = (e) => (e.finished != null && e.finished > 0 ? [0, e.finished] : [1, -(Number.isFinite(e.prog) ? e.prog : 0)]);
  return [...entries].sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || (a.id < b.id ? -1 : 1); });
}
