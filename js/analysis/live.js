// Suivi en direct contre une course de référence (HUD d'entraînement) : à chaque image, la position de la voiture est projetée sur la référence
// de parcours (recherche fenêtrée : quelques dizaines de segments), et l'écart est le chrono moins le temps de la référence à cette distance.
// Les mini-secteurs se bouclent au passage de leurs limites. Module pur (testé sous Node) : rien n'est lu dans la course, tout est donné.
//
//   const lt = createLiveTracker(refTrace, { count })     refTrace : RunTrace alignée (alignTrace) ; sa référence est refTrace.ref
//   lt.update(x, y, z, t) -> { s, delta, done }          done : secteur bouclé à ce pas ({ k, mine, ref, diff }) ou null
//   lt.relocate(x, y, z, t)                               après un retour au checkpoint (projection sur toute la référence)
//   lt.reset()                                            nouvel essai
import { project, projectGlobal, timeAtS } from './reference.js';

export function createLiveTracker(refTrace, { count = 12 } = {}) {
  const ref = refTrace.ref, L = ref.length;
  const bounds = [], refT = [];
  for (let k = 1; k <= count; k++) {
    const s = (L * k) / count;
    bounds.push(s);
    const t = k === count && refTrace.finished ? refTrace.time : timeAtS(refTrace, s);
    refT.push(t);
  }
  const o = { s: 0, j: 0, d: 0 };
  const st = { j: 0, sector: 0, t0: 0 };
  const res = { s: 0, delta: null, done: null, sector: 0, off: 0 };
  const api = {
    count, bounds, refT, length: L,
    reset() { st.j = 0; st.sector = 0; st.t0 = 0; res.s = 0; res.delta = null; res.done = null; },
    relocate(x, y, z, t) {
      projectGlobal(ref, x, y, z, o);
      st.j = o.j;
      let k = 0;
      while (k < count && bounds[k] <= o.s) k++;
      st.sector = k; st.t0 = t;
      res.s = o.s;
    },
    update(x, y, z, t) {
      project(ref, x, y, z, st.j, o);
      st.j = o.j;
      res.s = o.s; res.off = o.d; res.done = null;
      const tr = timeAtS(refTrace, o.s);
      res.delta = tr == null ? null : t - tr;
      // Secteur bouclé : la voiture a dépassé sa limite (une projection qui recule ne le reboucle pas).
      if (st.sector < count - 1 && o.s >= bounds[st.sector]) {
        const k = st.sector, ref0 = k ? refT[k - 1] : 0;
        const mine = t - st.t0, r = refT[k] != null && ref0 != null ? refT[k] - ref0 : null;
        res.done = { k: k + 1, mine, ref: r, diff: r == null ? null : mine - r };
        st.sector++; st.t0 = t;
      }
      res.sector = st.sector;
      return res;
    },
    // Dernier secteur : il se boucle à l'arrivée (le temps exact de la course, pas une projection).
    finish(t) {
      if (st.sector !== count - 1) return null;
      const ref0 = refT[count - 2] != null ? refT[count - 2] : 0, r = refT[count - 1] != null ? refT[count - 1] - ref0 : null;
      const mine = t - st.t0;
      st.sector = count;
      return { k: count, mine, ref: r, diff: r == null ? null : mine - r };
    },
  };
  return api;
}
