// Bilan des évènements d'une course (analysis/trace.js) : chocs, réapparitions, réceptions, mini-turbos, temps en l'air. Module pur.
export function summarize(trace) {
  const c = { walls: 0, respawns: 0, perfect: 0, badLandings: 0, turbos: 0, airTime: 0, vmax: 0, cps: 0 };
  for (const e of trace.events) {
    if (e.k === 'wall') c.walls++;
    else if (e.k === 'respawn') c.respawns++;
    else if (e.k === 'land') { if (e.q === 2) c.perfect++; else if (e.q === 0) c.badLandings++; }
    else if (e.k === 'turbo') c.turbos++;
    else if (e.k === 'cp') c.cps = Math.max(c.cps, e.q);
  }
  const dt = trace.n > 1 ? trace.t[1] - trace.t[0] : 0;
  for (let i = 0; i < trace.n; i++) { if (trace.air && trace.air[i]) c.airTime += dt; if (trace.v[i] > c.vmax) c.vmax = trace.v[i]; }
  return c;
}

// Évènements entre deux distances (un secteur) : la trace doit être alignée (sm).
export function eventsBetween(trace, s0, s1, kinds = null) {
  return trace.events.filter((e) => (!kinds || kinds.includes(e.k)) && e.i < trace.n && trace.sm[e.i] >= s0 && trace.sm[e.i] < s1);
}
