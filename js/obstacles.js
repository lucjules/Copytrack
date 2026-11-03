// Obstacles (0.9) : objets posés librement comme les décorations, mais qui comptent pour
// la physique. Leur mouvement ne dépend que du chrono de la course (pas fixe), donc il est
// identique en course, en replay, après un retour au checkpoint et dans la vérification
// en ligne. Ce module n'a aucune dépendance au rendu.
//
// Repère local d'un obstacle (avant rotation ry et échelle s) : x en travers de la route,
// y vers le haut (base de l'objet à y = 0), z le long de la route.

export const OBST = {
  spikes:    { label: 'Piques', type: 'spike', period: 0, hx: 4, hz: 1.5, hy: 1.0 },
  spikesPop: { label: 'Piques escamotables', type: 'spike', period: 3, hx: 4, hz: 1.5, hy: 1.0 },
  pendulum:  { label: 'Boule balancier', type: 'ball', period: 3.2, pivot: 13, arm: 10, r: 2.2, amp: 1.1 },
  hammer:    { label: 'Marteau tournant', type: 'ball', period: 2.8, pivot: 7, arm: 6, r: 2.0, spin: true },
  slider:    { label: 'Mur coulissant', type: 'box', period: 4, travel: 7, hx: 1.5, hy: 1.6, hz: 2.5 },
  sweeper:   { label: 'Balayeur', type: 'bar', period: 4, len: 9, r: 0.6, y: 1.2 },
  bumper:    { label: 'Bumper', type: 'post', period: 0, r: 1.8, h: 2.2, kick: 18 },
};
export const OBST_KINDS = Object.keys(OBST);
export const isObstacle = (k) => !!OBST[k];

const TAU = Math.PI * 2;

// Hauteur des piques escamotables (0 = rentrées, 1 = sorties) : 1,5 s dehors, 1,5 s dedans,
// avec des transitions rapides.
export function spikeLevel(def, t) {
  if (!def.period) return 1;
  const u = ((t / def.period) % 1 + 1) % 1;
  const ramp = 0.07;
  if (u < 0.5 - ramp) return 1;
  if (u < 0.5) return (0.5 - u) / ramp;
  if (u < 1 - ramp) return 0;
  return (u - (1 - ramp)) / ramp;
}

// État de l'obstacle d au temps t (s) dans SON repère local (avant rotation / échelle).
// out : { x, y, z, vx, vy, vz } centre de la partie mobile et sa vitesse ; a : angle (barre).
export function obstacleLocal(d, t, out) {
  const def = OBST[d.k];
  const ph = (d.ph || 0) * (def.period || 1);
  const tt = t + ph;
  out.x = 0; out.y = 0; out.z = 0; out.vx = 0; out.vy = 0; out.vz = 0; out.a = 0; out.on = 1;
  if (def.type === 'spike') {
    out.on = spikeLevel(def, tt);
  } else if (d.k === 'pendulum') {
    const w = TAU / def.period;
    const th = def.amp * Math.sin(w * tt), dth = def.amp * w * Math.cos(w * tt);
    out.x = Math.sin(th) * def.arm; out.y = def.pivot - Math.cos(th) * def.arm;
    out.vx = Math.cos(th) * def.arm * dth; out.vy = Math.sin(th) * def.arm * dth;
    out.a = th;
  } else if (d.k === 'hammer') {
    const w = TAU / def.period, th = w * tt;
    out.x = Math.sin(th) * def.arm; out.y = def.pivot - Math.cos(th) * def.arm;
    out.vx = Math.cos(th) * def.arm * w; out.vy = Math.sin(th) * def.arm * w;
    out.a = th;
  } else if (d.k === 'slider') {
    const w = TAU / def.period;
    out.x = def.travel * Math.sin(w * tt); out.y = def.hy; out.vx = def.travel * w * Math.cos(w * tt);
  } else if (d.k === 'sweeper') {
    const w = TAU / def.period;
    out.a = w * tt; out.y = def.y; out.w = w;
  }
  return out;
}

// Passage repère local -> monde (rotation ry autour de y, échelle s, position).
export function toWorld(d, lx, ly, lz, out) {
  const c = Math.cos(d.ry || 0), s = Math.sin(d.ry || 0), k = d.s || 1;
  out.x = d.x + (lx * c + lz * s) * k;
  out.y = d.y + ly * k;
  out.z = d.z + (-lx * s + lz * c) * k;
  return out;
}

export function toLocalObs(d, wx, wy, wz, out) {
  const c = Math.cos(d.ry || 0), s = Math.sin(d.ry || 0), k = d.s || 1;
  const dx = (wx - d.x) / k, dz = (wz - d.z) / k;
  out.x = dx * c - dz * s;
  out.y = (wy - d.y) / k;
  out.z = dx * s + dz * c;
  return out;
}

// Rayon englobant (m) pour un tri rapide.
export function obstacleRadius(d) {
  const def = OBST[d.k], k = d.s || 1;
  if (def.type === 'spike') return (Math.hypot(def.hx, def.hz) + 1) * k;
  if (def.type === 'ball') return (def.arm + def.r + 1) * k + 2;
  if (def.type === 'box') return (def.travel + Math.hypot(def.hx, def.hz) + 1) * k;
  if (def.type === 'bar') return (def.len + def.r + 1) * k;
  return (def.r + 1) * k;
}
