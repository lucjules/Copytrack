// Tests de MANIABILITÉ (bêta 0.9.11) : node tools/test-maniabilite.mjs   (npm test)
// Ce ne sont pas des tests « ça tourne » : ils mesurent si la voiture est agréable à conduire.
//  1. le véhicule seul : rayon de braquage, adhérence latérale, rapidité de la réponse, retour droit après un coup de volant, distance pour changer de voie ;
//  2. un pilote humain imparfait (réaction, volant qui tremble, braquage moins sec) sur les 66 circuits : contacts avec les bordures par minute et taux d'arrivée.
// Les seuils sont ceux de la 0.9.11 avec une marge ; la 0.9.10 donnait 1,1 contact par minute (26 circuits sur 66 avec au moins un contact) pour 178 arrivées sur 198.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';

const { virageStabilise, recuperation, changementDeVoie, pilotHumain, mesureHumain } = await import('./maniabilite.mjs');
const { CELL, ROAD_HALF, ROAD_W } = await import('../js/constants.js');
const { CAR } = await import('../js/physics.js');
const { BUILTIN_TRACKS } = await import('../js/tracks.js');

const V = { 72: 20, 144: 40, 216: 60, 288: 80 };    // km/h -> m/s

console.log('Le véhicule seul');
test('la route est large : 24 m (cases de 32 m), la voiture en fait 5 : on ne se cogne pas pour une trajectoire à 1 m près', () => {
  assert.equal(ROAD_W, 24);
  assert.equal(CELL, 32);
  assert.ok(ROAD_HALF >= 12);
});
test('virage à fond : plus de 2 g latéraux à toute vitesse, sans dépasser 3 g (assez d\'adhérence pour tourner, pas un rail)', () => {
  for (const [kmh, v] of Object.entries(V)) {
    const r = virageStabilise(v);
    assert.ok(r.g >= 2.0 && r.g <= 3.0, `${kmh} km/h : ${r.g} g`);
  }
});
test('rayon de braquage : ≤ 9 m à 72 km/h, ≤ 30 m à 144 km/h (moins qu\'une case), ≤ 65 m à 216 km/h', () => {
  assert.ok(virageStabilise(V[72]).rayon <= 9, 'rayon à 72 : ' + virageStabilise(V[72]).rayon);
  const r144 = virageStabilise(V[144]).rayon;
  assert.ok(r144 <= 30 && r144 < CELL, 'rayon à 144 : ' + r144);
  assert.ok(virageStabilise(V[216]).rayon <= 65, 'rayon à 216 : ' + virageStabilise(V[216]).rayon);
});
test('réponse au volant : 90 % de la rotation en moins de 0,3 s à 72 km/h et moins de 0,15 s au-dessus', () => {
  assert.ok(virageStabilise(V[72]).retard90 <= 0.3, 'à 72 : ' + virageStabilise(V[72]).retard90);
  for (const k of [144, 216, 288]) assert.ok(virageStabilise(V[k]).retard90 <= 0.15, `à ${k} : ${virageStabilise(V[k]).retard90}`);
});
test('sous-vireuse, donc stable : un coup de volant à fond lâché ramène droit en une demi-seconde, sans tête-à-queue, avec un dérapage ≤ 20 %', () => {
  assert.ok(CAR.frontShare < 0.5, 'frontShare ' + CAR.frontShare);
  for (const [kmh, v] of Object.entries(V)) {
    const r = recuperation(v);
    assert.ok(r.lacetResiduel < 0.05, `${kmh} km/h : lacet résiduel ${r.lacetResiduel} rad/s`);
    assert.ok(r.derapage <= 0.2, `${kmh} km/h : dérapage ${(r.derapage * 100).toFixed(1)} %`);
  }
});
test('changer de voie (une demi-route) : ≤ 1,2 case à 72 km/h, ≤ 2 à 144, ≤ 3,2 à 216, ≤ 5 à 288, toujours en moins de 2 s', () => {
  const max = { 72: 1.2, 144: 2, 216: 3.2, 288: 5 };
  for (const [kmh, v] of Object.entries(V)) {
    const r = changementDeVoie(v);
    assert.ok(r.distance, `${kmh} km/h : aucun changement de voie trouvé`);
    assert.ok(r.cases <= max[kmh], `${kmh} km/h : ${r.cases} cases`);
    assert.ok(r.temps <= 2, `${kmh} km/h : ${r.temps} s`);
  }
});

console.log('Un pilote humain imparfait sur les 66 circuits');
const sample = BUILTIN_TRACKS.filter((d) => ['eclats', 'canyon', 'lianes', 'neons', 'archipel', 'couronne', 'lagon', 'barriere'].includes(d.id));
test('le banc est déterministe : mêmes graines, mêmes chiffres', () => {
  const a = mesureHumain(sample[0], {}, [1, 2]), b = mesureHumain(sample[0], {}, [1, 2]);
  assert.deepEqual(a, b);
});
test('le pilote humain n\'est pas le pilote automatique : son tracé tremble (sinon le banc ne mesurerait rien)', () => {
  const h = pilotHumain({ graine: 7 });
  let n = 0, s = 0;
  const phys = { grounded: true, rib: null };
  const bot = { control: () => ({ throttle: true, brake: false, steer: 0 }) };
  for (let i = 0; i < 1200; i++) { const c = h.control(phys, bot); s += c.steer * c.steer; n++; }
  const rms = Math.sqrt(s / n);
  assert.ok(rms > 0.01 && rms < 0.3, 'écart-type du volant ' + rms.toFixed(3));
});
const all = BUILTIN_TRACKS.map((d) => mesureHumain(d));
test('moins d\'un contact par minute en moyenne (0,5 au plus) : on ne se cogne plus « toutes les 2 secondes »', () => {
  const moy = all.reduce((a, r) => a + r.contactsParMinute, 0) / all.length;
  assert.ok(moy <= 0.5, 'moyenne ' + moy.toFixed(2) + ' contacts/min');
});
test('aucun circuit à plus de 3 contacts par minute, et au plus 12 circuits avec un contact', () => {
  const pires = all.filter((r) => r.contactsParMinute > 3);
  assert.deepEqual(pires.map((r) => r.id + ' ' + r.contactsParMinute), []);
  const avec = all.filter((r) => r.contactsParMinute > 0);
  assert.ok(avec.length <= 12, avec.length + ' circuits avec contact : ' + avec.map((r) => r.id).join(' '));
});
test('au moins 90 % des parcours sont finis sans réapparition par ce pilote imparfait (trois graines par circuit)', () => {
  const fin = all.reduce((a, r) => a + +r.finis.split('/')[0], 0), tot = all.length * 3;
  assert.ok(fin / tot >= 0.9, `${fin}/${tot}`);
});
test('les sprints et les speedways, les plus rapides, restent sans contact (hors un accident isolé)', () => {
  const rapides = BUILTIN_TRACKS.filter((d) => d.profil === 'sprint' || d.profil === 'speedway').map((d) => d.id);
  const touches = all.filter((r) => rapides.includes(r.id) && r.contactsParMinute > 1);
  assert.ok(touches.length <= 1, 'circuits rapides à plus d\'1 contact/min : ' + touches.map((r) => r.id + ' ' + r.contactsParMinute).join(', '));
});

await finish('Tous les tests de maniabilité passent.');
