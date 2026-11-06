// Banc d'essai de MANIABILITÉ : node tools/maniabilite.mjs [--circuits] [--json]
//
// Deux familles de mesures, parce qu'« un circuit finissable » ne dit pas « une voiture agréable » :
//  1. le véhicule seul (modèle de pneus de physics.js, sans route) : rayon de braquage selon la vitesse, retard de la réponse au volant,
//     distance nécessaire pour changer de voie, tenue de cap après un coup de volant, vitesse maximale de slalom ;
//  2. un pilote HUMAIN imparfait sur les vrais circuits : le pilote automatique, mais avec un temps de réaction (il agit sur ce qu'il voyait
//     il y a ~0,15 s), un volant qui tremble et un jugement approximatif des freinages. On compte les contacts avec les bordures par minute :
//     c'est la mesure de « je me cogne toutes les 2 secondes ».
import { CarPhysics, CAR } from '../js/physics.js';
import { scriptTrack } from '../js/track.js';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { DT, CELL, ROAD_HALF } from '../js/constants.js';
import { runTrack } from './lab.mjs';

// ---- 1. Le véhicule seul ------------------------------------------------------------------------------------------------------------------
// Intègre le modèle (mêmes fonctions que la physique : _steerAngle, _tires, rampe du volant) sur un plan sans route, à vitesse longitudinale tenue.
function bicycle(speed, script, T = 4) {
  const ph = new CarPhysics(scriptTrack('banc', 'start S2 finish', {}));
  ph.vehicle = 'car';
  const K = ph.k, n = Math.round(T / DT);
  // Repère monde (comme physics.js : la vitesse est reprojetée sur les axes de la voiture à chaque pas, puis les axes tournent).
  // yaw > 0 : la voiture tourne vers la droite ; cap initial = +z (avant). x = décalage latéral vers la droite, z = avancée.
  let yaw = 0, wx = 0, wz = speed, w = 0, x = 0, z = 0, steer = 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i * DT, target = script(t, { x, z, yaw, w });
    const back = Math.abs(target) < Math.abs(steer) || target * steer < 0;
    const sr = (back ? K.steerOut : K.steerIn) * DT;
    steer += Math.max(-sr, Math.min(sr, target - steer));
    ph.steer = steer; ph.driftT = 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);   // avant, droite
    const vf = wx * fx + wz * fz, vr = wx * rx + wz * rz;
    const r = ph._tires(Math.max(vf, 1), vr, w, 0, 1, DT);
    w = r.w;
    const nvx = fx * r.vx + rx * r.vy, nvz = fz * r.vx + rz * r.vy;
    const k = speed / Math.hypot(nvx, nvz);                                                 // le moteur tient la vitesse
    wx = nvx * k; wz = nvz * k;
    yaw += w * DT;
    x += wx * DT; z += wz * DT;
    out.push({ t, x, z, yaw, w, vy: r.vy });
  }
  return out;
}

export function virageStabilise(speed) {
  const o = bicycle(speed, () => 1, 5), e = o[o.length - 1];
  const wss = e.w, alat = speed * wss;
  const t90 = o.find((p) => Math.abs(p.w) >= 0.9 * Math.abs(wss));
  return { v: speed, rayon: +(speed / Math.abs(wss)).toFixed(1), alat: +alat.toFixed(1), g: +(alat / CAR.gravity).toFixed(2), retard90: t90 ? +t90.t.toFixed(2) : null };
}

// Stabilité : coup de volant à fond pendant 0,4 s puis lâché. Une voiture saine revient droit (la vitesse de lacet retombe en moins d'une demi-seconde, le
// dérapage reste limité) ; une voiture survireuse part en tête-à-queue. Renvoie le lacet maximal, le lacet résiduel 0,5 s après le lâcher et le dérapage maximal.
export function recuperation(speed) {
  const o = bicycle(speed, (t) => (t < 0.4 ? 1 : 0), 2.5);
  const wmax = Math.max(...o.map((p) => Math.abs(p.w)));
  const fin = o.find((p) => p.t >= 0.9) || o[o.length - 1];
  const derap = Math.max(...o.map((p) => Math.abs(p.vy))) / speed;
  return { v: speed, lacetMax: +wmax.toFixed(2), lacetResiduel: +Math.abs(fin.w).toFixed(3), derapage: +derap.toFixed(3) };
}

// Changement de voie : le pilote suit (poursuite pure, comme le pilote automatique) un chemin qui se décale de `decalage` mètres en D mètres
// (lissé). On cherche le plus petit D pour lequel il reste à moins de 1,5 m du chemin : plus c'est court, plus la voiture est agile.
export function changementDeVoie(speed, decalage = ROAD_HALF) {
  const off = (z, D) => { const u = Math.max(0, Math.min(1, z / D)); return decalage * u * u * (3 - 2 * u); };
  for (let D = 20; D <= 600; D += 4) {
    let dev = 0;
    const o = bicycle(speed, (t, st) => {
      const L = 6 + 0.25 * speed, tx = off(st.z + L, D), alpha = Math.atan2(tx - st.x, L) - st.yaw;
      dev = Math.max(dev, Math.abs(off(st.z, D) - st.x));
      return Math.max(-1, Math.min(1, alpha * 2.6 - st.w * 0.25));
    }, (D + 80) / speed);
    const e = o[o.length - 1];
    if (dev < 1.5 && Math.abs(e.x - decalage) < 1.5 && Math.abs(e.yaw) < 0.06) return { v: speed, distance: D, cases: +(D / CELL).toFixed(1), temps: +(D / speed).toFixed(2) };
  }
  return { v: speed, distance: null };
}

// ---- 2. Un pilote humain imparfait --------------------------------------------------------------------------------------------------------
// reaction : retard (s) entre ce que le pilote « voit » et ce qu'il fait ; gain : un humain braque moins sec que le pilote automatique (sa loi de commande
// oscille dès que le retard dépasse ~0,1 s : c'est une limite du pilote, pas de la voiture) ; tremblement : écart-type du bruit de volant ; jugement : erreur relative sur
// la vitesse à laquelle il se met à freiner. Générateur pseudo-aléatoire déterministe (le banc doit donner les mêmes chiffres à chaque exécution).
export function pilotHumain({ reaction = 0.1, tremblement = 0.18, jugement = 0.12, graine = 1, gain = 0.8 } = {}) {
  let s = graine >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const delayN = Math.max(0, Math.round(reaction / DT)), buf = [];
  let noise = 0;
  const bias = 1 + jugement * gauss() * 0.5;
  return {
    control(phys, bot) {
      const c = bot.control(phys);
      noise += (-noise / 0.3 + 4.2 * tremblement * gauss() * Math.sqrt(1 / 0.3)) * DT;   // bruit corrélé, écart-type ≈ tremblement
      buf.push({ throttle: c.throttle, brake: c.brake, steer: c.steer });
      const d = buf.length > delayN ? buf.shift() : buf[0];
      // jugement : un freinage « tardif » (le pilote freine moins longtemps) ou « précoce »
      const brake = d.brake && rnd() < Math.min(1, bias);
      // En l'air la main ne bouge pas : le lacet aérien (physics.js, airSteer) intègre le moindre volant, un tremblement y ferait dériver la voiture de 20 m.
      const air = !phys.grounded && !phys.rib;
      return { throttle: d.throttle && !brake, brake, steer: Math.max(-1, Math.min(1, d.steer * gain + noise * (air ? 0.15 : 1))), drift: false };
    },
  };
}

export function mesureHumain(def, opts = {}, graines = [1, 2, 3]) {
  let t = 0, contacts = 0, durs = 0, fini = 0;
  for (const g of graines) {
    const S = runTrack(buildBuiltin(def), { driver: pilotHumain({ ...opts, graine: g * 7919 }) });
    contacts += S.contacts; durs += S.time; if (S.ok && S.respawns === 0) fini++; t++;
  }
  return { id: def.id, contactsParMinute: +((contacts / durs) * 60).toFixed(1), tempsMoyen: +(durs / t).toFixed(1), finis: fini + '/' + t };
}

if (process.argv[1] && /[\\/]maniabilite\.mjs$/.test(process.argv[1])) {
  const json = process.argv.includes('--json'), rows = { virage: [], voie: [] };
  for (const v of [20, 40, 60, 80]) { rows.virage.push(virageStabilise(v)); rows.voie.push(changementDeVoie(v)); }
  if (!json) {
    console.log(`Véhicule seul (case = ${CELL} m, demi-route = ${ROAD_HALF} m)`);
    for (const r of rows.virage) console.log(`  ${String(Math.round(r.v * 3.6)).padStart(3)} km/h  volant à fond : rayon ${String(r.rayon).padStart(5)} m · ${r.g} g latéral · réponse à 90 % en ${r.retard90} s`);
    for (const v of [20, 40, 60, 80]) { const r = recuperation(v); console.log(`  ${String(Math.round(v * 3.6)).padStart(3)} km/h  coup de volant à fond 0,4 s puis lâché : lacet max ${r.lacetMax} rad/s, 0,5 s après ${r.lacetResiduel} rad/s, dérapage max ${(r.derapage * 100).toFixed(1)} %`); }
    for (const r of rows.voie) console.log(`  ${String(Math.round(r.v * 3.6)).padStart(3)} km/h  changer de voie (${ROAD_HALF} m) : ${r.distance ?? '—'} m = ${r.cases ?? '—'} cases en ${r.temps ?? '—'} s`);
  }
  if (process.argv.includes('--circuits') || json) {
    const res = BUILTIN_TRACKS.map((d) => mesureHumain(d));
    const tot = res.reduce((a, r) => a + r.contactsParMinute, 0) / res.length;
    if (json) console.log(JSON.stringify({ ...rows, humain: res, moyenne: +tot.toFixed(1) }));
    else {
      console.log('\nPilote humain imparfait (réaction 0,10 s, volant qui tremble) : contacts avec les bordures par minute');
      for (const r of res) console.log(`  ${r.id.padEnd(14)} ${String(r.contactsParMinute).padStart(5)} /min  (${r.tempsMoyen} s, finis ${r.finis})`);
      console.log(`  MOYENNE ${tot.toFixed(1)} contacts / minute`);
    }
  }
}
