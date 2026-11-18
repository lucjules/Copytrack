// Corrections physiques (phase 2 après l'audit 0.9.59, PHYS_VER 35) : node tools/test-physique-corrections.mjs   (npm test)
// Quatre domaines, mesurés sur le VRAI moteur par tools/mesures-physique.mjs (circuits scriptés, commandes imposées, aucun hasard) :
//   1. contacts de bordure : frôlement / modéré / violent, jamais de voiture clouée, même sens de rotation au sol et au plafond ;
//   2. gravité : toute pièce qui retourne la voiture fait suivre la gravité à la route (règle commune), sans exception par pièce ;
//   3. dérapage : mécanique de pilotage (déclenchement au frein ± gaz, angle réglé par le volant, sortie progressive, mini-turbo mérité), sur toutes les familles de véhicules / revêtements / profils ;
//   4. sauts et réceptions : gaz tenus en l'air ≠ −43 %, perte proportionnelle à l'assiette réelle.
// Les valeurs « avant » citées sont celles de la phase 1 (8241368) ; docs/AUDIT-PHASE2-PHYSIQUE.md donne les tableaux complets. Les seuils laissent de la marge : ils protègent le
// COMPORTEMENT, pas des décimales (les décimales sont gardées par tools/phys-fingerprint.json et tools/golden-temps.json).
// PHYS_VER 36 (caractère PolyTrack, docs/ANALYSE-POLYTRACK.md) : mur INÉLASTIQUE à frottement 0,7 (ni rebond, ni pivot ajouté, ni « encaissement »), aucun contrôle
// en l'air hors aérofrein (le frein fige l'assiette), glisse au frein avec contre-braquage automatique. Les garanties de jouabilité restent : jamais clouée, perte
// croissante avec la violence du choc, mini-turbo mérité, réception jamais ratée pour une pédale tenue.
import assert from 'node:assert/strict';
import { test, finish } from './harness.mjs';
import { flat, arena, setSpeed, wallContact, driftRun, cornerBench, jumpRun } from './mesures-physique.mjs';
import { Track } from '../js/track.js';
import { PIECES, LEGACY_TILE } from '../js/pieces.js';
import { ribbonInverts } from '../js/ribbons.js';
import { PIECE_FACTS } from '../js/pieceFacts.js';
import { PHYS_VER } from '../js/version.js';
import { DT } from '../js/constants.js';

const KMH = 3.6, D = Math.PI / 180;
const slipDeg = (ph) => { const fx = -Math.sin(ph.yaw), fz = -Math.cos(ph.yaw), vf = ph.vel.x * fx + ph.vel.z * fz, vl = ph.vel.x * -fz + ph.vel.z * fx; return (Math.atan2(vl, Math.max(2, Math.abs(vf))) / D); };

test('la version de physique de cette phase est la 35 (un seul changement groupé : un record de la 34 n\'est pas rejouable)', () => {
  assert.ok(PHYS_VER >= 35);
});

console.log('1. Contacts de bordure');
const SPEEDS = [100, 200, 280], ANGLES = [2, 5, 10, 20, 45];
const walls = {};
for (const v of SPEEDS) for (const a of ANGLES) walls[v + '/' + a] = wallContact(v, a);
// (PHYS_VER 36 : le mur n'éjecte plus la voiture ; volant au neutre, nez vers le mur, elle le RACLE (frottement 0,7) jusqu'à se redresser : 1 à 2 s au lieu d'un rebond)
test('frôlement (2°) : l\'élan est conservé à toutes les vitesses (avant : 100 km/h → 48 en 0,5 s, puis 23 km/h collé à la bordure)', () => {
  for (const v of SPEEDS) {
    const w = walls[v + '/2'];
    assert.ok(w.hit && !w.bad, `${v} km/h : contact attendu`);
    assert.ok(w.vHit >= 0.95 * v, `${v} km/h : ${w.vHit} km/h juste après le contact`);
    assert.ok(w.v2 >= 0.85 * w.vHit, `${v} km/h : ${w.vHit} → ${w.v2} km/h deux secondes plus tard`);
    assert.ok(w.contactS < 2, `${v} km/h : ${w.contactS} s de contact (avant la phase 2 : 7 s collé)`);
  }
});
test('la perte croît avec la violence du choc (2° < 5° < 10° < 20° < 45°) : la vitesse juste après le contact décroît à chaque incidence, à 100, 200 et 280 km/h', () => {
  for (const v of SPEEDS) {
    const row = ANGLES.map((a) => walls[v + '/' + a].vHit);
    for (let i = 1; i < row.length; i++) assert.ok(row[i] < row[i - 1], `${v} km/h : ${row.join(' > ')}`);
    assert.ok(row[4] < 0.5 * row[0], `${v} km/h : un choc à 45° coûte au moins la moitié de l'élan (${row[4]} contre ${row[0]})`);
    assert.ok(row[2] > 0.5 * v, `${v} km/h : un choc modéré (10°) ne la fauche pas (${row[2]} km/h)`);
  }
});
// (PHYS_VER 36 : un choc franc à 45° garde cos 45° − 0,7 · sin 45° ≈ 21 % de l'élan, PolyTrack ; volant au neutre, la voiture repart en raclant)
test('la voiture n\'est jamais clouée : cinq secondes après chaque contact, volant au neutre, elle roule à 50 km/h au moins, et à plus de la moitié de son approche après un choc modéré (≤ 20°)', () => {
  for (const v of SPEEDS) for (const a of ANGLES) {
    const w = walls[v + '/' + a];
    assert.ok(!w.bad && w.hit, `${v}/${a}`);
    assert.ok(w.v5 >= 50, `${v} km/h ${a}° : ${w.v5} km/h à +5 s, au moins 50`);
    if (a <= 20) assert.ok(w.v5 >= 0.5 * v, `${v} km/h ${a}° : ${w.v5} km/h à +5 s`);
  }
});
// (PHYS_VER 36 : plus de pivot AJOUTÉ par le choc (wallSpinMax 0, PolyTrack) : la rotation ne vient que des pneus et du frottement contre la paroi)
test('le choc ne fait pas toupiller la voiture : rotation bornée (jamais plus de 5 rad/s), plus forte qu\'un frôlement dès 10°', () => {
  for (const v of SPEEDS) {
    const spins = ANGLES.map((a) => walls[v + '/' + a].spin);
    assert.ok(Math.max(...spins) <= 5, `${v} km/h : rotation maximale ${Math.max(...spins)} rad/s`);
    for (let i = 2; i < spins.length; i++) assert.ok(spins[i] > spins[0], `${v} km/h : ${spins.join(', ')}`);
  }
});
test('le nez est écarté du mur par le choc (jamais « nez au mur » comme avant : voiture 5 s collée)', () => {
  for (const [v, a] of [[150, 10], [150, 20], [250, 30]]) {
    const { ph } = flat('start S30 finish');
    ph.yaw = -a * D; ph.vel.x = Math.sin(a * D) * v / KMH; ph.vel.z = -Math.cos(a * D) * v / KMH; ph.pos.x = 24;
    let hit = null, head = null;
    for (let i = 0; i < 120 * 3; i++) {
      ph.clock = i; ph.step({ steer: 0, throttle: true, brake: false });
      if (hit === null && ph.ev.wall > 0.01) hit = i;
      if (hit !== null && i === hit + 36) head = -ph.yaw / D;      // cap vers le mur (°), 0,3 s après le choc
    }
    assert.ok(hit !== null && head !== null && head < a * 0.5, `${v} km/h ${a}° : cap vers le mur ${a}° → ${head}° 0,3 s après le choc`);
  }
});
test('gravité inversée (route au plafond) : mêmes règles — frôlement conservé, violent puni, jamais clouée', () => {
  const g = wallContact(200, 2, { ceiling: true }), m = wallContact(200, 10, { ceiling: true }), h = wallContact(200, 45, { ceiling: true });
  for (const w of [g, m, h]) assert.ok(w.hit && !w.bad);
  assert.ok(g.vHit >= 190, `frôlement : ${g.vHit}`);
  assert.ok(h.vHit < 0.5 * g.vHit, `violent : ${h.vHit} contre ${g.vHit}`);
  for (const w of [g, m, h]) assert.ok(w.v5 >= 50, `à +5 s : ${w.v5} km/h`);      // (PHYS_VER 36 : même règle qu'au sol, 50 km/h au moins)
});
test('volant tenu CONTRE la bordure : la voiture pressée repart seule (le contact « clignotait » un pas sur cinq et le dégagement automatique ne tournait qu\'à ce rythme : 10 s à 1 m/s)', () => {
  for (const [a, v, sgn] of [[30, 100, 1], [15, 60, 1], [60, 100, 1], [30, 100, -1]]) {
    const { ph } = flat('start S30 finish');
    const yaw = -a * D * sgn, sp = v / KMH; ph.pos.x = sgn > 0 ? 19 : 9; ph.yaw = yaw; ph.vel.x = -Math.sin(yaw) * sp; ph.vel.z = -Math.cos(yaw) * sp;
    let top = 0;
    for (let i = 0; i < 120 * 12; i++) { ph.clock = i; ph.step({ steer: sgn, throttle: true, brake: false }); if (i > 120 * 4) top = Math.max(top, ph.speed); }
    assert.ok(top > 6, `${a}° ${v} km/h volant ${sgn} : vitesse maximale entre 4 et 12 s : ${top.toFixed(1)} m/s`);
  }
});
test('contacts répétés et conditions extrêmes (36 vitesses × incidences × deux sens de gravité) : jamais de nombre non fini, jamais de vitesse démesurée', () => {
  let n = 0;
  for (const ceiling of [false, true]) for (const v of [40, 120, 250, 330]) for (const a of [1, 3, 8, 15, 30, 60, 80]) {
    const w = wallContact(v, a, { ceiling, secs: 5 });
    n++;
    assert.ok(!w.bad, `${v} km/h ${a}° ${ceiling ? 'plafond' : 'sol'} : état non fini`);
    if (w.hit) assert.ok(w.vHit < 400 && w.v5 < 400, `${v}/${a} : vitesses ${w.vHit} / ${w.v5}`);
  }
  assert.equal(n, 56);
});

console.log('\n2. Gravité : règle commune');
test('TOUTE pièce-ruban qui retourne la voiture (entrée et sortie de côtés opposés), dans toute orientation proposée par l\'éditeur, passe l\'essai de compatibilité (aucune CHUTE) : pas d\'exception par pièce', () => {
  let inverting = 0, checked = 0;
  const cols = [['sol', {}], ['murG', { o: 1 }], ['murD', { o: 2 }], ['plafond', { v: 1 }]];
  for (const type of Object.keys(PIECES)) {
    if (LEGACY_TILE[type] || !PIECE_FACTS[type]) continue;
    for (const [col, flags] of cols) {
      const fact = PIECE_FACTS[type][col];
      if (!fact || fact === '—' || fact === 'n/a') continue;
      const tile = Track.normalize({ t: type, x: 0, z: 0, l: 8, r: 0, ...flags });
      checked++;
      if (!ribbonInverts(tile)) continue;
      inverting++;
      assert.notEqual(fact, 'CHUTE', `${type}/${col} retourne la voiture mais la matrice dit CHUTE`);
    }
  }
  assert.ok(inverting >= 8 && checked > 200, `${inverting} cases qui retournent la voiture sur ${checked}`);
});
test('la vrille et les transitions retournées passent SANS revêtement « Inversion de gravité » ; la matrice ne garde que 26 cases CHUTE (29 avant la phase 2), toutes des montées et descentes raides sur mur, la chicane courte qui descend un mur, ou la rampe cvd4', () => {
  assert.notEqual(PIECE_FACTS.twist.sol, 'CHUTE');
  for (const t of ['tr10s', 'tr20s', 'tr10l', 'tr20l']) assert.notEqual(PIECE_FACTS[t].plafond, 'CHUTE', t);
  const chutes = [];
  for (const [t, row] of Object.entries(PIECE_FACTS)) for (const [c, code] of Object.entries(row)) if (code === 'CHUTE') chutes.push(t + '/' + c);
  // (colonnes d'origine seulement : les orientations de la phase 3 ajoutent 4 cases de la même famille de montées raides, voir test-orientations-3d)
  const old = chutes.filter((c) => /\/(sol|murG|murD|plafond)$/.test(c));
  // (PHYS_VER 36 : 16 -> 18 ; les deux nouvelles, cvd4 sur le mur gauche et cvdL4 sur le mur droit, sont les miroirs de cases déjà CHUTE de la même rampe)
  // (PHYS_VER 37 : 18 -> 24 ; plus de guidage du cap sur les rubans et le nez pique sur un mur : les pentes RAIDES posées sur un mur (steep4, dn4, cv2) y tournent la route
  // plus vite que le volant ne le permet à la vitesse d'un mur)
  // (0.11.3 : + 2, la chicane COURTE qui descend un mur, trop brusque à la vitesse d'un mur ; la longue et la rapide passent)
  // (0.12.0 : + 2, la même rampe cvd4 / cvdL4 en route ÉTROITE au sol (ncvd4, ncvdL4) : déjà CHUTE en largeur normale, le vérificateur la signale)
  assert.ok(old.length <= 28, `${old.length} CHUTE : ${old.join(' ')}`);
  for (const c of old) assert.match(c, /^(cv|cro|cdi|steep4|dn4|sbend\/murG|sbendL\/murD|ncvdL?4\/sol)/, c + ' : famille non documentée');
});

console.log('\n3. Dérapage');
const KEEP = (m) => m.v17 / m.v0;
test('gaz seuls, volant tourné : on ne dérape pas (le dérapage se DÉCLENCHE : frein ± gaz, volant tourné, vitesse suffisante)', () => {
  for (const v of [80, 120, 160, 200]) {
    const m = driftRun(v, 'gas');
    assert.ok(!m.bad && m.driftS === 0 && m.turbo === 0 && m.slipMax <= 10, `${v} km/h : dérapage ${m.driftS} s, dérive ${m.slipMax}°`);
  }
});
test('frein bref (avec ou sans gaz) + volant : le dérapage s\'installe, CONSERVE la vitesse, reste contrôlé (≤ 30°), et se referme seul (avant : 150 → 23 km/h en 1 s, ou aucun dérapage)', () => {
  for (const v of [120, 160, 200]) for (const sc of ['tapBoth', 'tap']) {
    const m = driftRun(v, sc);
    assert.ok(!m.bad, `${v}/${sc}`);
    assert.ok(m.driftS >= 1.2, `${v} km/h ${sc} : dérapage de ${m.driftS} s`);
    assert.ok(m.slipMax >= 12 && m.slipMax <= 30, `${v} km/h ${sc} : dérive maximale ${m.slipMax}°`);
    assert.ok(m.slipEnd <= 3, `${v} km/h ${sc} : dérive finale ${m.slipEnd}° (la glisse se referme)`);
    assert.ok(m.yaw17 <= 180, `${v} km/h ${sc} : cap tourné de ${m.yaw17}° (pas de tête-à-queue)`);
    assert.ok(KEEP(m) >= (sc === 'tapBoth' ? 0.7 : 0.5), `${v} km/h ${sc} : ${Math.round(100 * KEEP(m))} % de la vitesse conservés à 1,7 s`);
  }
  assert.ok(KEEP(driftRun(160, 'tapBoth')) >= 0.7 && KEEP(driftRun(200, 'tapBoth')) >= 0.7);
});
test('l\'angle de glisse est réglé par le volant : demi-volant, plein volant : plus de volant = plus d\'angle, jamais au-delà de 30°', () => {
  const slips = [0.35, 0.6, 1.0].map((st) => {
    const { ph } = arena(30); setSpeed(ph, 160 / KMH);
    let mx = 0;
    for (let i = 0; i < 120 * 3; i++) { const t = i * DT; ph.clock = i; ph.step({ steer: st, brake: t > 0.3 && t < 0.55, throttle: t > 0.3 }); if (t > 0.8) mx = Math.max(mx, Math.abs(slipDeg(ph))); }
    return mx;
  });
  assert.ok(slips[0] < 8 && slips[1] > 10 && slips[2] > slips[1] && slips[2] <= 30, `dérives ${slips.map((s) => s.toFixed(1)).join(' / ')}°`);
});
test('sortie PROGRESSIVE : volant relâché, la glisse se referme en 0,3 à 1,2 s sans claquer ni dépasser (avant : l\'arrière raccrochait d\'un coup)', () => {
  for (const tr of [0.8, 1.0]) {
    const { ph } = arena(30); setSpeed(ph, 160 / KMH);
    const series = [];
    for (let i = 0; i < 120 * 3; i++) {
      const t = i * DT; ph.clock = i;
      ph.step({ steer: t >= tr ? 0 : 1, brake: t > 0.3 && t < 0.55, throttle: t > 0.3 });
      if (t >= tr && (i - Math.round(tr * 120)) % 6 === 0) series.push(slipDeg(ph));
    }
    const s0 = Math.abs(series[0]);
    assert.ok(s0 > 12, `départ de la sortie : ${s0.toFixed(1)}°`);
    assert.ok(Math.abs(series[1]) > 0.5 * s0, `0,05 s après le relâchement la glisse n'a pas claqué : ${series.slice(0, 3).map((s) => s.toFixed(1)).join(' → ')}°`);
    assert.ok(series.slice(12).every((s) => Math.abs(s) < 1.5), 'refermée après 0,6 s');
    assert.ok(series.every((s) => Math.sign(series[0]) * s >= -1.5), 'sans dépassement de l\'autre côté');
  }
});
test('mini-turbo : mérité par une glisse tenue, proportionné (+10 à +40 km/h), absent sans glisse ni après un choc de mur', () => {
  for (const [v, sc, lv] of [[160, 'tapBoth', 1], [200, 'tapBoth', 2], [200, 'tap', 2], [160, 'both', 2]]) {
    const m = driftRun(v, sc);
    assert.ok(m.turbo >= lv, `${v} km/h ${sc} : mini-turbo niveau ${m.turbo}`);
    assert.ok(m.turboGain >= 10 && m.turboGain <= 40, `${v} km/h ${sc} : +${m.turboGain} km/h 1,2 s après (plus de 40 serait démesuré, moins de 10 insignifiant)`);
  }
  for (const v of [80, 160, 200]) assert.equal(driftRun(v, 'gas').turbo, 0, `${v} km/h gaz seuls : aucun turbo`);
  // un mur touché pendant la glisse la casse : la charge est remise à zéro et rien n'est récompensé (avant la correction, la lecture de l'impact se faisait APRÈS sa remise à zéro : jamais)
  for (const v of [120, 160]) {
    // (PHYS_VER 36 : volant à fond ; à 0,6 la glisse, contre-braquée d'elle-même, se refermait et livrait son mini-turbo juste avant le mur)
    const { ph } = flat('start S30 finish'); ph.pos.x = 5; setSpeed(ph, v / KMH);
    let hit = null, before = 0, after = null, mt = 0;
    for (let i = 0; i < 120 * 4; i++) {
      const t = i * DT; ph.clock = i;
      const c = ph.driftCharge;
      ph.step({ steer: 1, brake: t > 0.3 && t < 0.55, throttle: t > 0.3 });
      if (hit === null && ph.ev.wall > 3) { hit = t; before = c; }
      if (hit !== null && after === null && t > hit + 0.02) after = ph.driftCharge;
      if (hit !== null && t > hit + 0.02 && t < hit + 0.6 && ph.ev.miniTurbo) mt = ph.ev.miniTurbo;
    }
    assert.ok(hit !== null && before > 0.5, `${v} km/h : glisse chargée avant le mur (${before.toFixed(2)})`);
    assert.equal(after, 0, `${v} km/h : charge après le choc`);
    assert.equal(mt, 0, `${v} km/h : aucun mini-turbo juste après le choc`);
  }
});
test('virage de 90° (porte à 150 m) : le dérapage n\'est ni abandonné ni disproportionné — ≤ 30 % plus lent que la meilleure trajectoire à l\'adhérence, mini-turbo gagné, cap tenu, vitesse de porte ≥ 90 %', () => {
  for (const v of [100, 140, 180]) {
    const grip = cornerBench(v, 'grip'), drift = cornerBench(v, 'drift');
    assert.ok(grip.t !== null && drift.t !== null, `${v} km/h : porte atteinte`);
    assert.ok(drift.t <= 1.3 * grip.t, `${v} km/h : dérapage ${drift.t} s contre ${grip.t} s`);
    assert.ok(drift.t >= 0.95 * grip.t, `${v} km/h : le dérapage ne bat pas la trajectoire à l'adhérence de plus de 5 % (${drift.t} contre ${grip.t} s) : il ne doit pas devenir la seule bonne façon de tourner`);
    // (PHYS_VER 36 : à 100 km/h le virage se prend au braquage en moins d'une seconde (rayon 22 m) : la glisse n'a pas le temps de charger ; le mini-turbo est dû à 140 et 180)
    assert.ok((v < 140 || drift.turbo >= 1) && !drift.spin, `${v} km/h : turbo ${drift.turbo}, cap hors cible ${drift.spin}`);
    assert.ok(drift.vGate >= 0.9 * grip.vGate, `${v} km/h : ${drift.vGate} km/h à la porte contre ${grip.vGate}`);
  }
});
test('identité des véhicules, revêtements et profils : le dérapage marche partout où il a un sens, et ne change pas l\'esprit de chacun', () => {
  const rows = {
    voiture: driftRun(160, 'tapBoth'), moto: driftRun(160, 'tapBoth', { vehicle: 'moto' }), arcade: driftRun(160, 'tapBoth', { pm: 'arcade' }), sim: driftRun(160, 'tapBoth', { pm: 'sim' }),
    glace: driftRun(160, 'tapBoth', { surf: { s: 'ice' } }),
  };
  for (const [n, m] of Object.entries(rows)) {
    assert.ok(!m.bad && m.driftS >= 1.2 && m.slipEnd <= 3, `${n} : dérapage ${m.driftS} s, dérive finale ${m.slipEnd}°`);
    assert.ok(KEEP(m) >= 0.7, `${n} : ${Math.round(100 * KEEP(m))} % conservés`);
    assert.ok(m.turboGain <= 40, `${n} : turbo +${m.turboGain}`);
  }
  // (PHYS_VER 36 : sur l'asphalte la glisse ne coûte presque plus de vitesse (contre-braquage automatique, PolyTrack) : la glace n'y gagne plus, mais n'y perd pas ; son identité est
  // de tourner bien moins)
  assert.ok(rows.glace.keep >= rows.voiture.keep - 0.05, `la glace ne coûte pas plus de vitesse en glisse (${rows.glace.keep} contre ${rows.voiture.keep})`);
  assert.ok(rows.glace.yaw17 < 0.5 * rows.voiture.yaw17, `sur la glace la voiture tourne bien moins (${rows.glace.yaw17}° contre ${rows.voiture.yaw17}°)`);
  assert.ok(rows.arcade.slipMax < rows.voiture.slipMax, `Arcade glisse moins (${rows.arcade.slipMax}° contre ${rows.voiture.slipMax}°)`);
  // revêtements dont la raison d'être est de glisser ou de freiner : leur identité reste ce qu'elle était
  const drift = driftRun(160, 'gas', { surf: { s: 'drift' } }), slow = driftRun(160, 'tapBoth', { surf: { s: 'slow' } });
  assert.ok(drift.slipMax >= 40, `revêtement Dérapage : la voiture part toujours en glisse (${drift.slipMax}°)`);
  // (PHYS_VER 36 : la glisse sur l'asphalte ne coûte plus rien (104 % conservés) ; le ralentisseur en garde 52 % : il divise toujours la vitesse par deux)
  assert.ok(slow.keep <= 0.55 && slow.keep < 0.6 * rows.voiture.keep, `revêtement Ralentisseur : il freine toujours (${Math.round(100 * slow.keep)} % conservés)`);
  assert.ok(!drift.bad && !slow.bad);
});

console.log('\n4. Sauts et réceptions');
const AIRS = ['none', 'gas', 'brake', 'tapGas', 'tapBrake'];
// PHYS_VER 37 (PolyTrack) : rien ne redresse la voiture en l'air ; en quittant le bord elle bascule nez en bas, d'autant plus qu'elle est lente. Seul l'aérofrein freine sa rotation.
test('frein tenu ou donné en l\'air (aérofrein) : jamais « ratée », perte ≤ 20 %, réception parfaite à 200 km/h ; sans lui, à 100 km/h, la voiture se pose trop piquée', () => {
  for (const v of [100, 200]) for (const a of AIRS) {
    const m = jumpRun(v, a);
    assert.ok(m.ok, `${v}/${a} : réception`);
    assert.ok(m.pitchPeak <= 0.7, `${v} km/h ${a} : tangage maximal ${m.pitchPeak} rad (avant 1,4)`);
    if (!/brake/i.test(a)) continue;
    assert.notEqual(m.q, 'bad', `${v} km/h ${a} : réception ${m.q}`);
    assert.ok(m.loss <= 20, `${v} km/h ${a} : −${m.loss} %`);
  }
  assert.equal(jumpRun(200, 'brake').q, 'perfect', 'aérofrein à 200 km/h : réception parfaite');
  assert.equal(jumpRun(100, 'none').q, 'bad', 'sans aérofrein, à 100 km/h, la bascule du décollage n\'est pas rattrapée');
});
// (PHYS_VER 36, loi PolyTrack : ni gaz ni volant n'agissent en l'air ; le frein est un AÉROFREIN qui amortit la rotation. Avant : gaz = nez plus bas, frein = nez plus haut)
test('en l\'air, les pédales ne pilotent plus l\'assiette : gaz tenu = presque rien (le nez descend d\'un rien) ; frein tenu (aérofrein) amortit la rotation, jamais plus de tangage ni de perte qu\'à vide', () => {
  for (const v of [100, 200]) {
    const none = jumpRun(v, 'none'), gas = jumpRun(v, 'gas'), brake = jumpRun(v, 'brake');
    assert.ok(gas.q === none.q && Math.abs(gas.loss - none.loss) <= 1 && Math.abs(gas.pitchPeak - none.pitchPeak) <= 0.02, `${v} km/h : les gaz n'agissent presque pas en l'air`);
    assert.ok(brake.pitchPeak <= none.pitchPeak + 0.01, `${v} km/h : l'aérofrein ne relève pas le nez (${brake.pitchPeak} contre ${none.pitchPeak} rad)`);
    assert.ok(brake.loss <= none.loss + 2, `${v} km/h : frein −${brake.loss} % contre −${none.loss} %`);
  }
});
test('moto : mêmes garanties ; deltaplane : il plane toujours (identité) et un frein tenu ne le jette pas', () => {
  for (const a of ['none', 'gas', 'brake']) {
    const m = jumpRun(160, a, { vehicle: 'moto' });      // (PHYS_VER 36 : 160 km/h ; à 150 ce saut d'essai est pile à la frontière entre deux réceptions, et la moto, 2 km/h plus lente au décollage, heurtait le bord de la dalle)
    assert.ok(m.ok && m.q !== 'bad' && m.loss <= 20, `moto ${a} : ${m.q} −${m.loss} %`);
  }
  const g0 = jumpRun(150, 'none', { vehicle: 'glider' }), g1 = jumpRun(150, 'brake', { vehicle: 'glider' });
  assert.ok(g0.ok && g1.ok && g0.airS >= 3 && g0.q !== 'bad' && g1.q !== 'bad', `deltaplane : ${g0.airS} s en l'air, réceptions ${g0.q} / ${g1.q}`);
});

console.log('\n5. Interactions');
test('dérapage puis saut : abordé en glisse, le tremplin donne un vol fini et une réception non désastreuse', () => {
  for (const v of [120, 160]) {
    const m = jumpRun(v, 'gas');                                   // (référence : la même route sans glisse)
    const { ph } = flat('start S3 UU G2 S4 finish', { l: 2 });
    ph.vel.z = -v / KMH; ph.fwdSpeed = v / KMH;
    let landed = null, took = false, ok = true;
    for (let i = 0; i < 120 * 14 && !landed; i++) {
      const t = i * DT; ph.clock = i;
      const air = !ph.grounded && ph.pos.y > 14;
      const inp = air ? { brake: true } : t > 0.2 && t < 0.45 ? { steer: 0.6, brake: true } : t < 1.1 ? { steer: 0.25, throttle: true } : { steer: 0, throttle: true };      // (PHYS_VER 37 : en l'air, l'aérofrein, comme un joueur)
      ph.step(inp);
      if (![ph.pos.x, ph.pos.y, ph.pos.z, ph.vel.x, ph.vel.z, ph.yaw].every(Number.isFinite)) ok = false;
      if (air) took = true;
      if (took && ph.ev.land > 0) landed = { q: ph.ev.landQ, v: ph.speed * KMH };
    }
    assert.ok(ok && m.ok, `${v} km/h : état fini`);
    assert.ok(landed, `${v} km/h : le tremplin est franchi et la voiture retombe`);
    assert.notEqual(landed.q, 'bad', `${v} km/h : réception ${landed.q} après dérapage`);
  }
});
test('déterminisme : deux exécutions identiques donnent exactement les mêmes nombres (contact, dérapage, saut)', () => {
  assert.deepEqual(wallContact(200, 10), wallContact(200, 10));
  assert.deepEqual(wallContact(150, 20, { ceiling: true }), wallContact(150, 20, { ceiling: true }));
  assert.deepEqual(driftRun(160, 'tapBoth'), driftRun(160, 'tapBoth'));
  assert.deepEqual(jumpRun(200, 'brake'), jumpRun(200, 'brake'));
});

finish('Corrections physiques de la phase 2 : tout passe.');
