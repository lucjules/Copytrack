// Laboratoire de comparaison (Copytrack Evolution, E20) : rejoue les MÊMES commandes (une course enregistrée) sous deux réglages physiques et
// mesure l'écart avec l'analyse d'E4 (trace rejouée au bit près, référence de parcours, secteurs, écart de temps le long du circuit). Le circuit
// n'est jamais modifié : chaque réglage s'applique à une copie. Module pur, testé sous Node (tools/test-vehicles2.mjs).
//
// Les commandes ont été jouées pour un réglage : sous un autre, la voiture ne passe plus au même endroit et les commandes finissent par ne plus
// convenir (sortie de piste, retour au checkpoint). Le laboratoire le montre : il dit où l'écart apparaît et jusqu'où chaque course est allée.
import { traceFromInputs } from './trace.js';
import { makeReference, alignTrace } from './reference.js';
import { sectors, compareSectors, delta } from './sectors.js';
import { RAIN_SEED } from '../variants.js';

// Réglages proposés : null = le circuit tel quel.
export const LAB_SETUPS = [
  { id: 'track', label: 'Le circuit tel quel', p: null },
  { id: 'classic', label: 'Classique, véhicules v1', p: { pm: '', vm: 1 } },
  { id: 'v2', label: 'Classique, véhicules v2', p: { pm: '', vm: 2 } },
  { id: 'arcade', label: 'Profil Arcade', p: { pm: 'arcade' } },
  { id: 'sim', label: 'Profil Simulation', p: { pm: 'sim' } },
  { id: 'grip80', label: 'Adhérence 80 %', p: { grip: 80 } },
  { id: 'rain', label: 'Sous la pluie (60 %)', p: { rain: 60, envSeed: RAIN_SEED, envVary: false } },
];
export const labSetup = (id) => LAB_SETUPS.find((s) => s.id === id) || LAB_SETUPS[0];

// La copie du circuit sous un réglage (ou le circuit lui-même pour « tel quel »).
export function labTrack(track, setup) {
  if (!setup || !setup.p) return track;
  const t = track.clone();
  if (track.path) t.path = track.path;          // ligne centrale du circuit intégré (référence de parcours) : clone() ne la copie pas
  t.setParams(setup.p);
  return t;
}

// Compare deux réglages (ids de LAB_SETUPS) pour les commandes `inputs`. Renvoie null sans référence de parcours possible.
export function labCompare(track, inputs, idA, idB, { count = 12 } = {}) {
  const sa = labSetup(idA), sb = labSetup(idB);
  const run = (s) => {
    const t = labTrack(track, s);
    return { setup: s, signature: t.signature(), trace: traceFromInputs(t, inputs) };
  };
  const A = run(sa), B = run(sb);
  const ref = makeReference(track, A.trace);
  if (!ref) return null;
  const out = { ref, same: A.signature === B.signature };
  for (const [k, R] of [['A', A], ['B', B]]) {
    alignTrace(R.trace, ref);
    R.sectors = sectors(R.trace, { count });
    R.finished = R.trace.finished; R.time = R.trace.time;
    R.reached = R.trace.n ? Math.min(1, R.trace.sm[R.trace.n - 1] / ref.length) : 0;
    out[k] = R;
  }
  out.cmp = compareSectors(A.sectors, B.sectors);
  out.delta = delta(A.trace, B.trace, { step: Math.max(5, ref.length / 160) });
  const first = out.cmp.find((c) => Math.abs(c.diff) > 0.005);
  out.firstDiff = first ? first.k : 0;                 // premier secteur où les deux courses diffèrent (0 : nulle part)
  return out;
}
