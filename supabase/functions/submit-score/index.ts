// Copytrack : fonction serveur « submit-score » (Supabase Edge Function).
// FICHIER GÉNÉRÉ par tools/build-function.mjs à partir de server.ts et du code du jeu :
// ne pas modifier à la main. À coller tel quel dans Supabase (Edge Functions).
// deno-lint-ignore-file
// @ts-nocheck
// js/constants.js
var CELL = 32;
var HALF = CELL / 2;
var LEVEL_H = 6.4;
var ROAD_W = 24;
var ROAD_HALF = ROAD_W / 2;
var RAIL_W = 0.6;
var RAIL_H = 1.1;
var SLAB_T = 0.9;
var ROAD_TOP = 0.4;
var MAX_LEVEL = 60;
var SURF_PHYS = {
  wind: 54,
  belt: 200 / 3.6,
  spring: 56,
  bounce: 14,
  gravity: 25,
  maxSpeed: 95,
  boostSpeed: 112
};
var MAX_DECOS = 500;
var WORLD_SCALE = CELL / 24;
var LOOP_R = 12 * WORLD_SCALE;
var LOOP_LANE = HALF;
var DT = 1 / 120;
var MAX_RUN_SECONDS = 600;
var MAX_RUN_STEPS = Math.round(MAX_RUN_SECONDS / DT);
var MAX_TRACK_CODE_CHARS = 4e5;
var MAX_INPUTS_CHARS = 4e5;
var OFF_TRACK_RESPAWN_S = 0.5;
var VEHICLES = [
  "car",
  "moto",
  "boat",
  "glider"
];
var DIRS = [
  [
    0,
    -1
  ],
  [
    1,
    0
  ],
  [
    0,
    1
  ],
  [
    -1,
    0
  ]
];

// js/dmath.js
var sqrt = Math.sqrt;
var floor = Math.floor;
var isNaN_ = Number.isNaN;
var PI = 3.141592653589793;
var HALF_PI = 1.5707963267948966;
var TWO_OVER_PI = 0.6366197723675814;
var PIO2_1 = 1.5707963267341256;
var PIO2_2 = 6077100506303966e-26;
var PIO2_3 = 20222662487111665e-37;
function ksin(r) {
  const z = r * r;
  return r * (1 + z * (-1 / 6 + z * (1 / 120 + z * (-1 / 5040 + z * (1 / 362880 + z * (-1 / 39916800 + z * (1 / 6227020800 + z * (-1 / 1307674368e3 + z * (1 / 355687428096e3)))))))));
}
function kcos(r) {
  const z = r * r;
  return 1 + z * (-1 / 2 + z * (1 / 24 + z * (-1 / 720 + z * (1 / 40320 + z * (-1 / 3628800 + z * (1 / 479001600 + z * (-1 / 87178291200 + z * (1 / 20922789888e3 + z * (-1 / 6402373705728e3)))))))));
}
var reducedR = 0;
function reduce(x) {
  if (!(x > -1e6 && x < 1e6)) {
    reducedR = NaN;
    return 0;
  }
  const n = Math.round(x * TWO_OVER_PI);
  reducedR = x - n * PIO2_1 - n * PIO2_2 - n * PIO2_3;
  return n & 3;
}
function dsin(x) {
  const q = reduce(x), r = reducedR;
  return q === 0 ? ksin(r) : q === 1 ? kcos(r) : q === 2 ? -ksin(r) : -kcos(r);
}
function dcos(x) {
  const q = reduce(x), r = reducedR;
  return q === 0 ? kcos(r) : q === 1 ? -ksin(r) : q === 2 ? -kcos(r) : ksin(r);
}
function dtan(x) {
  const q = reduce(x), r = reducedR;
  return (q & 1) === 0 ? ksin(r) / kcos(r) : -kcos(r) / ksin(r);
}
function datan(x) {
  if (isNaN_(x)) return NaN;
  const neg = x < 0;
  let t = neg ? -x : x;
  const inv = t > 1;
  if (inv) t = 1 / t;
  t = t / (1 + sqrt(1 + t * t));
  t = t / (1 + sqrt(1 + t * t));
  t = t / (1 + sqrt(1 + t * t));
  const z = t * t;
  let s = t * (1 + z * (-1 / 3 + z * (1 / 5 + z * (-1 / 7 + z * (1 / 9 + z * (-1 / 11 + z * (1 / 13 + z * (-1 / 15 + z * (1 / 17)))))))));
  s *= 8;
  if (inv) s = HALF_PI - s;
  return neg ? -s : s;
}
function datan2(y, x) {
  if (isNaN_(x) || isNaN_(y)) return NaN;
  if (x > 0) return datan(y / x);
  if (x < 0) {
    const a = datan(y / x);
    return y >= 0 ? a + PI : a - PI;
  }
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}
function dasin(x) {
  if (!(x >= -1 && x <= 1)) return NaN;
  return datan2(x, sqrt((1 - x) * (1 + x)));
}
function dacos(x) {
  if (!(x >= -1 && x <= 1)) return NaN;
  return datan2(sqrt((1 - x) * (1 + x)), x);
}
var POW2 = new Float64Array(2100);
{
  let p = 1;
  for (let k = 0; k <= 1023; k++) {
    POW2[k + 1074] = p;
    p *= 2;
  }
  p = 1;
  for (let k = 0; k >= -1074; k--) {
    POW2[k + 1074] = p;
    p *= 0.5;
  }
}
var LN2_HI = 0.6931471803691238;
var LN2_LO = 19082149292705877e-26;
var INV_LN2 = 1.4426950408889634;
function dexp(x) {
  if (isNaN_(x)) return NaN;
  if (x > 709.7) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  const s = 1 + r * (1 + r * (1 / 2 + r * (1 / 6 + r * (1 / 24 + r * (1 / 120 + r * (1 / 720 + r * (1 / 5040 + r * (1 / 40320 + r * (1 / 362880 + r * (1 / 3628800 + r * (1 / 39916800 + r * (1 / 479001600 + r * (1 / 6227020800)))))))))))));
  const k1 = k < -1e3 ? k + 100 : k;
  return k1 === k ? s * POW2[k + 1074] : s * POW2[k1 + 1074] * POW2[-100 + 1074];
}
var view = new DataView(new ArrayBuffer(8));
function dlog(x) {
  if (isNaN_(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0;
  if (x < 22250738585072014e-324) {
    x *= POW2[54 + 1074];
    e = -54;
  }
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  e += (hi >>> 20 & 2047) - 1023;
  view.setUint32(0, hi & 1048575 | 1072693248);
  let m = view.getFloat64(0);
  if (m > 1.4142135623730951) {
    m *= 0.5;
    e += 1;
  }
  const s = (m - 1) / (m + 1), z = s * s;
  const p = s * (2 + z * (2 / 3 + z * (2 / 5 + z * (2 / 7 + z * (2 / 9 + z * (2 / 11 + z * (2 / 13 + z * (2 / 15 + z * (2 / 17 + z * (2 / 19 + z * (2 / 21)))))))))));
  return e * LN2_HI + (p + e * LN2_LO);
}
function dpow(x, y) {
  if (y === 0) return 1;
  if (isNaN_(x) || isNaN_(y)) return NaN;
  if (y === 1) return x;
  if (y === 2) return x * x;
  if (y === 0.5) return sqrt(x);
  if (x === 1) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (y === floor(y) && y >= -64 && y <= 64) {
    let r = 1, b = x, n = y < 0 ? -y : y;
    while (n > 0) {
      if (n & 1) r *= b;
      b *= b;
      n >>= 1;
    }
    return y < 0 ? 1 / r : r;
  }
  if (x < 0) {
    if (floor(y) !== y) return NaN;
    const r = dexp(y * dlog(-x));
    return y % 2 !== 0 ? -r : r;
  }
  return dexp(y * dlog(x));
}
var hypot2 = (a, b) => sqrt(a * a + b * b);
var hypot3 = (a, b, c) => sqrt(a * a + b * b + c * c);

// js/pieces.js
var K = WORLD_SCALE;
var PIECES = {
  straight: {
    label: "Ligne droite",
    kind: "line",
    size: 1,
    rise: 0
  },
  curve: {
    label: "Virage serr\xE9",
    kind: "arc",
    size: 1,
    rise: 0
  },
  bigcurve: {
    label: "Grand virage",
    kind: "arc",
    size: 2,
    rise: 0
  },
  slope: {
    label: "Pente",
    kind: "line",
    size: 1,
    rise: 1
  },
  steep: {
    label: "Tremplin",
    kind: "line",
    size: 1,
    rise: 2
  },
  checkpoint: {
    label: "Checkpoint",
    kind: "line",
    size: 1,
    rise: 0,
    special: "checkpoint",
    clearance: 1
  },
  start: {
    label: "D\xE9part",
    kind: "line",
    size: 1,
    rise: 0,
    special: "start",
    clearance: 1
  },
  finish: {
    label: "Arriv\xE9e",
    kind: "line",
    size: 1,
    rise: 0,
    special: "finish",
    clearance: 1
  },
  platform: {
    label: "Plateforme",
    kind: "area",
    size: 1,
    rise: 0
  },
  loop: {
    label: "Looping \u21B1",
    kind: "loop",
    size: 2,
    rise: 0,
    clearance: 5,
    mirror: 1,
    R: LOOP_R,
    lane: LOOP_LANE,
    turns: 1
  },
  loopL: {
    label: "Looping \u21B0",
    kind: "loop",
    size: 2,
    rise: 0,
    clearance: 5,
    mirror: -1,
    R: LOOP_R,
    lane: LOOP_LANE,
    turns: 1
  },
  loopBig: {
    label: "Grand looping \u21B1",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 7,
    mirror: 1,
    R: 18 * K,
    lane: CELL,
    turns: 1
  },
  loopBigL: {
    label: "Grand looping \u21B0",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 7,
    mirror: -1,
    R: 18 * K,
    lane: CELL,
    turns: 1
  },
  loopDouble: {
    label: "Double looping \u21B1",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 5,
    mirror: 1,
    R: 12 * K,
    lane: CELL,
    turns: 2
  },
  loopDoubleL: {
    label: "Double looping \u21B0",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 5,
    mirror: -1,
    R: 12 * K,
    lane: CELL,
    turns: 2
  },
  // Vrille : demi-tour de roulis sur 2 cases (comme le tire-bouchon : la route est dans la colonne de gauche de l'empreinte 2×2).
  // La route balance jusqu'à ±9 m autour de son axe : elle réserve 2 niveaux au-dessus d'elle.
  twist: {
    label: "Vrille",
    kind: "ribbon",
    size: 2,
    rise: 0,
    clearance: 2
  },
  ramp90: {
    label: "Mont\xE9e en L",
    kind: "ribbon",
    size: 1,
    rise: 1
  },
  wall: {
    label: "Mur vertical",
    kind: "ribbon",
    size: 1,
    rise: 0
  },
  crest90: {
    label: "Sommet du L",
    kind: "ribbon",
    size: 1,
    rise: 1
  },
  // v1.5
  bank: {
    label: "Virage relev\xE9",
    kind: "ribbon",
    size: 2,
    rise: 0,
    clearance: 2,
    arc: true,
    bank: 0.42
  },
  bankBig: {
    label: "Tr\xE8s grand virage relev\xE9",
    kind: "ribbon",
    size: 3,
    rise: 0,
    clearance: 2,
    arc: true,
    bank: 0.5
  },
  tube: {
    label: "Tube",
    kind: "ribbon",
    size: 2,
    rise: 0,
    clearance: 4
  },
  // 0.7 : tube modulaire (entrée, sections à enchaîner, sortie = entrée retournée).
  tubeIn: {
    label: "Entr\xE9e de tube",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 4
  },
  tubeMid: {
    label: "Section de tube",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 4,
    tubeSurf: true
  },
  cork: {
    label: "Tire-bouchon \u21BB",
    kind: "ribbon",
    size: 2,
    rise: 0,
    clearance: 4,
    mirror: 1
  },
  corkL: {
    label: "Tire-bouchon \u21BA",
    kind: "ribbon",
    size: 2,
    rise: 0,
    clearance: 4,
    mirror: -1
  },
  fork: {
    label: "Bifurcation \u2442\u2192",
    kind: "fork",
    size: 2,
    rise: 0,
    mirror: 1
  },
  forkL: {
    label: "Bifurcation \u2190\u2442",
    kind: "fork",
    size: 2,
    rise: 0,
    mirror: -1
  },
  ring: {
    label: "Anneau turbo",
    kind: "ring",
    size: 1,
    rise: 0,
    clearance: 2
  },
  cpRing: {
    label: "Checkpoint a\xE9rien",
    kind: "ring",
    size: 1,
    rise: 0,
    clearance: 2,
    special: "checkpoint"
  },
  cpCurve: {
    label: "Checkpoint en virage",
    kind: "arc",
    size: 1,
    rise: 0,
    clearance: 1,
    special: "checkpoint"
  },
  gentle: {
    label: "Pente douce (\xBD niveau)",
    kind: "line",
    size: 1,
    rise: 0.5
  },
  // Phase 2 : nouvelles pièces (ajoutées en fin de PIECE_ORDER, les anciens codes restent lisibles).
  steep4: {
    label: "Ligne droite \xB7 inclinaison 4",
    kind: "line",
    size: 1,
    rise: 4
  },
  hugecurve: {
    label: "Tr\xE8s grand virage plat",
    kind: "arc",
    size: 3,
    rise: 0
  },
  // « Courbe » : un tremplin courbé (virage montant). Serré = 1 case, grand = 2×2.
  cv05: {
    label: "Courbe serr\xE9e \xB7 inclinaison \xBD",
    kind: "arc",
    size: 1,
    rise: 0.5
  },
  cv1: {
    label: "Courbe serr\xE9e \xB7 inclinaison 1",
    kind: "arc",
    size: 1,
    rise: 1
  },
  cv2: {
    label: "Courbe serr\xE9e \xB7 inclinaison 2",
    kind: "arc",
    size: 1,
    rise: 2
  },
  cv4: {
    label: "Courbe serr\xE9e \xB7 inclinaison 4",
    kind: "arc",
    size: 1,
    rise: 4
  },
  cvBig05: {
    label: "Grande courbe \xB7 inclinaison \xBD",
    kind: "arc",
    size: 2,
    rise: 0.5
  },
  cvBig1: {
    label: "Grande courbe \xB7 inclinaison 1",
    kind: "arc",
    size: 2,
    rise: 1
  },
  cvBig2: {
    label: "Grande courbe \xB7 inclinaison 2",
    kind: "arc",
    size: 2,
    rise: 2
  },
  cvBig4: {
    label: "Grande courbe \xB7 inclinaison 4",
    kind: "arc",
    size: 2,
    rise: 4
  },
  // Versions gauche : une rampe courbe n'est pas symétrique (parcourue à l'envers elle descend), il faut donc un miroir.
  cvL05: {
    label: "Courbe serr\xE9e \u21B0 \xB7 inclinaison \xBD",
    kind: "arc",
    size: 1,
    rise: 0.5,
    mirror: -1
  },
  cvL1: {
    label: "Courbe serr\xE9e \u21B0 \xB7 inclinaison 1",
    kind: "arc",
    size: 1,
    rise: 1,
    mirror: -1
  },
  cvL2: {
    label: "Courbe serr\xE9e \u21B0 \xB7 inclinaison 2",
    kind: "arc",
    size: 1,
    rise: 2,
    mirror: -1
  },
  cvL4: {
    label: "Courbe serr\xE9e \u21B0 \xB7 inclinaison 4",
    kind: "arc",
    size: 1,
    rise: 4,
    mirror: -1
  },
  cvBigL05: {
    label: "Grande courbe \u21B0 \xB7 inclinaison \xBD",
    kind: "arc",
    size: 2,
    rise: 0.5,
    mirror: -1
  },
  cvBigL1: {
    label: "Grande courbe \u21B0 \xB7 inclinaison 1",
    kind: "arc",
    size: 2,
    rise: 1,
    mirror: -1
  },
  cvBigL2: {
    label: "Grande courbe \u21B0 \xB7 inclinaison 2",
    kind: "arc",
    size: 2,
    rise: 2,
    mirror: -1
  },
  cvBigL4: {
    label: "Grande courbe \u21B0 \xB7 inclinaison 4",
    kind: "arc",
    size: 2,
    rise: 4,
    mirror: -1
  },
  // Loopings à 2 et 3 boucles : le décalage latéral total (lane) est choisi pour garder ≥ 24 m entre deux tours.
  loopBigDouble: {
    label: "Grand looping \xD72 \u21B1",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 7,
    mirror: 1,
    R: 18 * K,
    lane: CELL,
    turns: 2
  },
  loopBigDoubleL: {
    label: "Grand looping \xD72 \u21B0",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 7,
    mirror: -1,
    R: 18 * K,
    lane: CELL,
    turns: 2
  },
  loopTriple: {
    label: "Triple looping \u21B1",
    kind: "loop",
    size: 4,
    rise: 0,
    clearance: 5,
    mirror: 1,
    R: 12 * K,
    lane: 1.5 * CELL,
    turns: 3
  },
  loopTripleL: {
    label: "Triple looping \u21B0",
    kind: "loop",
    size: 4,
    rise: 0,
    clearance: 5,
    mirror: -1,
    R: 12 * K,
    lane: 1.5 * CELL,
    turns: 3
  },
  loopBigTriple: {
    label: "Grand looping \xD73 \u21B1",
    kind: "loop",
    size: 4,
    rise: 0,
    clearance: 7,
    mirror: 1,
    R: 18 * K,
    lane: 1.5 * CELL,
    turns: 3
  },
  loopBigTripleL: {
    label: "Grand looping \xD73 \u21B0",
    kind: "loop",
    size: 4,
    rise: 0,
    clearance: 7,
    mirror: -1,
    R: 18 * K,
    lane: 1.5 * CELL,
    turns: 3
  },
  // « Courbe » (0.9.2) : une rampe dont le profil se courbe PROGRESSIVEMENT vers le haut. Plate à l'entrée (elle se raccorde à une route
  // plate sans cassure), de plus en plus raide ensuite : h(t) = rise · t² (Bézier quadratique, point de contrôle au ras du sol à l'entrée).
  // Pente en sortie = 2·rise / longueur ; parcourue à l'envers, elle descend et s'aplatit à l'arrivée (atterrissage en douceur).
  crv05: {
    label: "Courbe \xB7 inclinaison \xBD",
    kind: "line",
    size: 1,
    rise: 0.5,
    curv: 1
  },
  crv1: {
    label: "Courbe \xB7 inclinaison 1",
    kind: "line",
    size: 1,
    rise: 1,
    curv: 1
  },
  crv2: {
    label: "Courbe \xB7 inclinaison 2",
    kind: "line",
    size: 1,
    rise: 2,
    curv: 1
  },
  crv4: {
    label: "Courbe \xB7 inclinaison 4",
    kind: "line",
    size: 1,
    rise: 4,
    curv: 1
  },
  // Anciennes pièces à 90° (0.9.2) : elles ne sont plus posées (Track.normalize les convertit en pièce + orientation, voir LEGACY_TILE) ; leurs
  // définitions ne servent qu'à garder leur numéro dans PIECE_ORDER. `below` : niveaux réservés SOUS la pièce (la moitié basse du plan descend de 9 m).
  rollL: {
    label: "Transition c\xF4t\xE9 \u21B0",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 2,
    below: 2,
    noRails: true
  },
  rollR: {
    label: "Transition c\xF4t\xE9 \u21B1",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 2,
    below: 2,
    noRails: true
  },
  sideL: {
    label: "Ligne droite c\xF4t\xE9 \u21B0",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 2,
    below: 2,
    noRails: true
  },
  sideR: {
    label: "Ligne droite c\xF4t\xE9 \u21B1",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 2,
    below: 2,
    noRails: true
  }
};
var V_PROFILES = {
  l: {
    H: (t) => t,
    D: () => 1
  },
  i: {
    H: (t) => t * t,
    D: (t) => 2 * t
  },
  o: {
    H: (t) => 2 * t - t * t,
    D: (t) => 2 - 2 * t
  },
  s: {
    H: (t) => t * t * (3 - 2 * t),
    D: (t) => 6 * t * (1 - t)
  }
};
var profOf = (p) => p.prof || (p.curv ? "i" : "l");
var profH = (p, t) => V_PROFILES[profOf(p)].H(t);
var profD = (p, t) => V_PROFILES[profOf(p)].D(t);
var RISES = [
  0.5,
  1,
  2,
  4
];
var rtag = (r) => r === 0.5 ? "05" : String(r);
var rtxt = (r) => r === 0.5 ? "\xBD" : String(r);
var GEN_IDS = [];
var gen = (id, def) => {
  PIECES[id] = def;
  GEN_IDS.push(id);
};
for (const r of RISES) gen("dn" + rtag(r), {
  label: `Pente descendante ${rtxt(r)}`,
  kind: "line",
  size: 1,
  rise: -r
});
for (const r of RISES) gen("cro" + rtag(r), {
  label: `Courbe \xB7 fin de mont\xE9e ${rtxt(r)}`,
  kind: "line",
  size: 1,
  rise: r,
  prof: "o"
});
for (const r of RISES) gen("cdi" + rtag(r), {
  label: `Courbe \xB7 d\xE9but de descente ${rtxt(r)}`,
  kind: "line",
  size: 1,
  rise: -r,
  prof: "i"
});
for (const r of RISES) gen("cdo" + rtag(r), {
  label: `Courbe \xB7 fin de descente ${rtxt(r)}`,
  kind: "line",
  size: 1,
  rise: -r,
  prof: "o"
});
for (const r of [
  0.5,
  1
]) gen("crs" + rtag(r), {
  label: `Courbe en S \xB7 mont\xE9e ${rtxt(r)}`,
  kind: "line",
  size: 1,
  rise: r,
  prof: "s"
});
for (const r of [
  0.5,
  1
]) gen("cds" + rtag(r), {
  label: `Courbe en S \xB7 descente ${rtxt(r)}`,
  kind: "line",
  size: 1,
  rise: -r,
  prof: "s"
});
for (const [pre, size, mir, lab] of [
  [
    "cvd",
    1,
    1,
    "serr\xE9"
  ],
  [
    "cvdBig",
    2,
    1,
    "grand"
  ],
  [
    "cvdL",
    1,
    -1,
    "serr\xE9 \u21B0"
  ],
  [
    "cvdBigL",
    2,
    -1,
    "grand \u21B0"
  ]
]) {
  for (const r of RISES) gen(pre + rtag(r), {
    label: `Virage descendant ${lab} \xB7 ${rtxt(r)}`,
    kind: "arc",
    size,
    rise: -r,
    ...mir < 0 ? {
      mirror: -1
    } : {}
  });
}
var oriAngle = (code, other = 0) => code === 1 ? Math.PI / 2 : code === 2 ? -Math.PI / 2 : code === 3 ? other === 2 ? -Math.PI : Math.PI : 0;
var ROLL_PASSAGES = [
  "01",
  "10",
  "02",
  "20",
  "13",
  "31",
  "23",
  "32"
];
var ORI_NAME = [
  "sol",
  "mur gauche",
  "mur droit",
  "plafond"
];
for (const long of [
  false,
  true
]) {
  for (const pas of ROLL_PASSAGES) {
    const a = +pas[0], b = +pas[1];
    gen(`tr${pas}${long ? "l" : "s"}`, {
      label: `Transition ${ORI_NAME[a]} \u2192 ${ORI_NAME[b]}${long ? " (douce 2\xD72)" : ""}`,
      kind: "ribbon",
      size: long ? 2 : 1,
      rise: 0,
      clearance: 2,
      below: 2,
      roll: [
        a,
        b
      ],
      rollLong: long,
      noRails: true,
      // Entre un mur et le plafond, la gravité suit la route (comme un revêtement « Inversion de gravité ») : sans cela la voiture
      // tomberait du plafond, ou resterait en gravité inversée en revenant sur le mur.
      ...a === 3 || b === 3 ? {
        autoFlip: true
      } : {}
    });
  }
}
var LEGACY_TILE = {
  rollL: {
    t: "tr02s"
  },
  rollR: {
    t: "tr01s"
  },
  sideL: {
    t: "straight",
    o: 2
  },
  sideR: {
    t: "straight",
    o: 1
  }
};
var RING_R = 7;
var RING_Y = 6;
var LEGACY_SURFACE = {
  boost: "boost",
  ice: "ice"
};
var LEGACY_PIECE = {
  halfpipe: "straight"
};
var PIECE_ORDER = [
  "straight",
  "curve",
  "bigcurve",
  "slope",
  "steep",
  "boost",
  "checkpoint",
  "start",
  "finish",
  "platform",
  "ice",
  "loop",
  "loopL",
  "loopBig",
  "loopBigL",
  "loopDouble",
  "loopDoubleL",
  "twist",
  "ramp90",
  "wall",
  "crest90",
  "bank",
  "bankBig",
  "halfpipe",
  "tube",
  "cork",
  "corkL",
  "fork",
  "forkL",
  "ring",
  "cpRing",
  "cpCurve",
  "gentle",
  "tubeIn",
  "tubeMid",
  // Phase 2 (à la suite : ne jamais réordonner)
  "steep4",
  "hugecurve",
  "cv05",
  "cv1",
  "cv2",
  "cv4",
  "cvBig05",
  "cvBig1",
  "cvBig2",
  "cvBig4",
  "loopBigDouble",
  "loopBigDoubleL",
  "loopTriple",
  "loopTripleL",
  "loopBigTriple",
  "loopBigTripleL",
  "cvL05",
  "cvL1",
  "cvL2",
  "cvL4",
  "cvBigL05",
  "cvBigL1",
  "cvBigL2",
  "cvBigL4",
  // 0.9.2 (à la suite : ne jamais réordonner)
  "crv05",
  "crv1",
  "crv2",
  "crv4",
  "rollL",
  "rollR",
  "sideL",
  "sideR",
  // 0.9.3 (à la suite : ne jamais réordonner ; l'ordre est celui de GEN_IDS, vérifié par les tests)
  ...GEN_IDS
];
var SURFACES = {
  "": {
    label: "Normal"
  },
  ice: {
    label: "Verglas",
    param: "Glisse",
    def: 100,
    min: 25,
    max: 200,
    c: [
      "#d7f1fb",
      "#a7e0f5",
      "#6cc8f0"
    ]
  },
  boost: {
    label: "Acc\xE9l\xE9rateur",
    param: "Puissance",
    def: 100,
    min: 5,
    max: 200,
    inv: true,
    c: [
      "#3a7bff",
      "#36e9ff",
      "#fff25a"
    ]
  },
  bounce: {
    label: "Rebond",
    param: "Hauteur",
    def: 100,
    min: 30,
    max: 200,
    flat: true,
    c: [
      "#a05fff",
      "#ff5fd2",
      "#ff9f5f"
    ]
  },
  // 0.9 : plus de réglage, l'aimant colle toujours au maximum.
  magnet: {
    label: "Aimant",
    c: [
      "#b48cff",
      "#b48cff",
      "#b48cff"
    ]
  },
  drift: {
    label: "D\xE9rive",
    param: "Glisse",
    def: 100,
    min: 30,
    max: 200,
    c: [
      "#ffb84d",
      "#ff8c42",
      "#ff5a3c"
    ]
  },
  slow: {
    label: "Ralentisseur",
    param: "Freinage",
    def: 100,
    min: 30,
    max: 300,
    inv: true,
    c: [
      "#ffc84d",
      "#ff6b57",
      "#c4172e"
    ]
  },
  wind: {
    label: "Vent lat\xE9ral",
    param: "\u2190 Force \u2192",
    def: 150,
    min: 1,
    max: 200,
    c: [
      "#7fe9ff",
      "#bfefff",
      "#ffffff"
    ]
  },
  gravity: {
    label: "Gravit\xE9",
    param: "Gravit\xE9",
    def: 40,
    min: 15,
    max: 250,
    c: [
      "#7dffb2",
      "#a7ffe0",
      "#b06bff"
    ]
  },
  moto: {
    label: "Plaque moto",
    c: [
      "#ff9f1c",
      "#ff9f1c",
      "#ff9f1c"
    ]
  },
  // v1.5
  water: {
    label: "Eau",
    flat: true,
    c: [
      "#3fa7ff",
      "#3fa7ff",
      "#3fa7ff"
    ]
  },
  boat: {
    label: "Plaque bateau",
    flat: true,
    c: [
      "#3fd0ff",
      "#3fd0ff",
      "#3fd0ff"
    ]
  },
  glider: {
    label: "Plaque deltaplane",
    c: [
      "#f5f5f5",
      "#f5f5f5",
      "#f5f5f5"
    ]
  },
  // 0.9 : inverse le sens de la gravité (une 2e plaque la remet à l'endroit).
  flip: {
    label: "Inversion de gravit\xE9",
    c: [
      "#ff4fd8",
      "#ff4fd8",
      "#ff4fd8"
    ]
  },
  // Phase 3 : réglage de -200 à +200 km/h (p = 1 → -200, p = 101 → 0, p = 201 → +200 ; 2 km/h par cran).
  conveyor: {
    label: "Tapis roulant",
    param: "\u2193 Vitesse \u2191",
    def: 150,
    min: 1,
    max: 201,
    c: [
      "#ffd23e",
      "#ffd23e",
      "#ffd23e"
    ]
  },
  spring: {
    label: "Ressort lat\xE9ral",
    param: "\u2190 Force \u2192",
    def: 150,
    min: 1,
    max: 200,
    c: [
      "#5dff8a",
      "#5dff8a",
      "#5dff8a"
    ]
  },
  // Phase 3 : plus de vitesse mini. La dalle cède après `p` centièmes de seconde de contact cumulé (150 = 1,5 s), puis n'a plus de collision.
  glass: {
    label: "Verre fragile",
    param: "R\xE9siste",
    def: 150,
    min: 30,
    max: 500,
    inv: true,
    c: [
      "#d9f4ff",
      "#a8e4ff",
      "#6fcfff"
    ]
  },
  powder: {
    label: "Poudreuse",
    param: "\xC9paisseur",
    def: 100,
    min: 30,
    max: 250,
    inv: true,
    c: [
      "#ffffff",
      "#e4f1ff",
      "#bcd9ff"
    ]
  },
  reverse: {
    label: "Volant invers\xE9",
    c: [
      "#c05fff",
      "#c05fff",
      "#c05fff"
    ]
  },
  cut: {
    label: "Moteur coup\xE9",
    c: [
      "#ff3b3b",
      "#ff3b3b",
      "#ff3b3b"
    ]
  }
};
var SURFACE_CODES = [
  "",
  "ice",
  "boost",
  "bounce",
  "sand",
  "magnet",
  "mud",
  "drift",
  "slow",
  "wind",
  "gravity",
  "moto",
  "water",
  "boat",
  "glider",
  "flip",
  "conveyor",
  "tread",
  "spring",
  "glass",
  "powder",
  "reverse",
  "invert",
  "cut"
];
var SURFACE_ALIAS = {
  tread: "conveyor",
  invert: "reverse"
};
var PLATES = {
  moto: "moto",
  boat: "boat",
  glider: "glider"
};
function tileParam(tile) {
  const S4 = SURFACES[tile.s];
  if (!S4 || S4.def == null) return 100;
  return tile.p || S4.def;
}
var beltSpeed = (p) => (p - 101) / 100 * SURF_PHYS.belt;
var glassSeconds = (p) => p / 100;
var TUNNEL_TOP = ROAD_HALF + RAIL_W + 0.9;
function isRibbonKind(type) {
  const k = PIECES[type].kind;
  return k === "ribbon" || k === "loop";
}
function isSideTile(tile) {
  const p = PIECES[tile.t];
  return !!(tile.o || p.roll);
}
var isOriented = (tile) => !!tile.o && (PIECES[tile.t].kind === "line" || PIECES[tile.t].kind === "arc");
function isFloor(tile) {
  const k = PIECES[tile.t].kind;
  return !tile.v && !tile.o && k !== "ribbon" && k !== "ring";
}
function isCeilingFloor(tile) {
  const k = PIECES[tile.t].kind;
  return !!tile.v && !tile.o && k !== "ribbon" && k !== "ring";
}
function isRibbon(tile) {
  return isRibbonKind(tile.t) || isOriented(tile);
}
var hasNoRails = (tile) => !!(tile.nb || tile.o || PIECES[tile.t].noRails);
var OPTION_CONFLICTS = {
  v: [
    "o",
    "tn",
    "mv",
    "tb"
  ],
  o: [
    "v",
    "tn",
    "mv",
    "cp",
    "tb"
  ],
  tn: [
    "v",
    "o",
    "cp",
    "tb"
  ],
  mv: [
    "v",
    "o",
    "cp",
    "tb"
  ],
  cp: [
    "o",
    "tn",
    "mv",
    "tb"
  ],
  tb: [
    "v",
    "o",
    "tn",
    "mv",
    "cp"
  ]
};
var hasConflict = (flag, tile) => !!tile && OPTION_CONFLICTS[flag].some((f) => tile[f]);
function clearConflicts(opts2, flag) {
  for (const f of OPTION_CONFLICTS[flag] || []) {
    opts2[f] = 0;
    if (f === "mv" && "ms" in opts2) {
      opts2.ms = 0;
      opts2.ma = 0;
    }
  }
  if (flag === "v" && opts2.cp === 2) opts2.cp = 0;
  if (flag === "cp" && opts2.cp === 2) opts2.v = 0;
  return opts2;
}
function flagAllowed(type, flag, tile = null, val = 0) {
  const p = PIECES[type];
  if (!p) return false;
  const lineLike = p.kind === "line" || p.kind === "arc";
  if (flag === "v") return true;
  if (flag === "th") return p.kind !== "ring";
  if (p.kind === "ring" || p.kind === "fork") return false;
  if (flag === "o") return lineLike && !p.special && !p.noRails && !hasConflict("o", tile);
  if (flag === "nb") return !p.noRails && (lineLike && !p.special || p.kind === "ribbon" && !type.startsWith("tube"));
  if (flag === "tn") return lineLike && !p.special && !hasConflict("tn", tile);
  if (flag === "mv") return (lineLike || p.kind === "area") && !p.special && !hasConflict("mv", tile);
  if (flag === "cp") {
    if (!((lineLike || p.kind === "area") && !p.special && !p.rise) || hasConflict("cp", tile)) return false;
    if (val === 2) return p.kind === "line" && !(tile && tile.v);
    return true;
  }
  if (flag === "tb") return p.kind === "line" && !p.special && !p.rise && !hasConflict("tb", tile);
  return false;
}
function cpKind(tile) {
  const P = PIECES[tile.t];
  if (P.special === "checkpoint") return P.kind === "ring" ? "ring" : "gate";
  if (tile.cp === 2 && P.kind === "line") return "ring";
  if (tile.cp === 1 && (P.kind === "line" || P.kind === "arc")) return "gate";
  if (tile.cp === 1 && P.kind === "area") return "pad";
  return null;
}
var MOVER = {
  1: {
    label: "Ascenseur",
    period: 6,
    speed: {
      def: 100,
      min: 25,
      max: 300
    },
    amp: {
      def: 2,
      min: 0.5,
      max: 8,
      step: 0.5,
      unit: " niv."
    }
  },
  2: {
    label: "Glissi\xE8re",
    period: 5,
    speed: {
      def: 100,
      min: 25,
      max: 300
    },
    amp: {
      def: 1,
      min: 0.5,
      max: 3,
      step: 0.5,
      unit: " case(s)"
    }
  },
  3: {
    label: "Rotation",
    period: 12,
    speed: {
      def: 100,
      min: -300,
      max: 300
    },
    amp: {
      def: 360,
      min: 45,
      max: 360,
      step: 45,
      unit: "\xB0"
    }
  }
};
function moverParams(tile, out = {}) {
  const M = MOVER[tile.mv];
  out.speed = M ? tile.ms || M.speed.def : 0;
  out.amp = M ? tile.ma || M.amp.def : 0;
  return out;
}
function clampMover(mv, ms, ma) {
  const M = MOVER[mv];
  if (!M) return {
    ms: 0,
    ma: 0
  };
  let s = Math.round(+ms || 0), a = Math.round((+ma || 0) * 2) / 2;
  if (s) {
    const lo = M.speed.min < 0 ? -M.speed.max : M.speed.min;
    s = Math.max(lo, Math.min(M.speed.max, s));
    if (M.speed.min < 0 && Math.abs(s) < 25) s = s < 0 ? -25 : 25;
    if (s === M.speed.def) s = 0;
  }
  if (a) {
    a = Math.max(M.amp.min, Math.min(M.amp.max, a));
    if (a === M.amp.def) a = 0;
  }
  return {
    ms: s,
    ma: a
  };
}
var THEMES = [
  {
    id: 0,
    label: "Classique"
  },
  {
    id: 1,
    label: "Herbe"
  },
  {
    id: 2,
    label: "Sable"
  },
  {
    id: 3,
    label: "Roche"
  }
];
function surfaceAllowed(type, s, o = 0) {
  if (!s) return true;
  const p = PIECES[type];
  const S4 = SURFACES[s];
  if (!p || !S4) return false;
  return surfaceRule(p, S4, s, o) === "";
}
function surfaceRule(p, S4, s, o = 0) {
  if (p.kind === "ring") return "pas de route dans un anneau";
  const curved = p.kind === "loop" || p.kind === "ribbon" || !!o;
  if (S4.flat && (p.rise || curved)) return "seulement sur du plat";
  if (s === "water" && (p.special === "finish" || p.kind === "fork")) return "pas sur l\u2019arriv\xE9e ni une bifurcation";
  return "";
}
function baseY(tile) {
  return tile.l * LEVEL_H + ROAD_TOP;
}
function tileCenter(tile, out = {}) {
  const h = PIECES[tile.t].size * HALF;
  out.x = tile.x * CELL + h;
  out.z = tile.z * CELL + h;
  return out;
}
var C = {
  x: 0,
  z: 0
};
function toLocal(tile, wx, wz, out) {
  tileCenter(tile, C);
  return toLocalVec(tile.r, wx - C.x, wz - C.z, out);
}
function toLocalVec(r, dx, dz, out) {
  switch (r & 3) {
    case 0:
      out.lx = dx;
      out.lz = dz;
      break;
    case 1:
      out.lx = dz;
      out.lz = -dx;
      break;
    case 2:
      out.lx = -dx;
      out.lz = -dz;
      break;
    default:
      out.lx = -dz;
      out.lz = dx;
  }
  return out;
}
function rotVec(r, lx, lz, out) {
  switch (r & 3) {
    case 0:
      out.x = lx;
      out.z = lz;
      break;
    case 1:
      out.x = -lz;
      out.z = lx;
      break;
    case 2:
      out.x = -lx;
      out.z = -lz;
      break;
    default:
      out.x = lz;
      out.z = -lx;
  }
  return out;
}
function localToWorld(tile, lx, lz, out = {}) {
  tileCenter(tile, C);
  const cx = C.x, cz = C.z;
  rotVec(tile.r, lx, lz, out);
  out.x += cx;
  out.z += cz;
  return out;
}
function arcParams(p) {
  if (p.size === 1) return {
    cx: HALF,
    cz: HALF,
    R: HALF
  };
  if (p.size === 3) return {
    cx: CELL * 1.5,
    cz: CELL * 1.5,
    R: CELL * 2.5
  };
  return {
    cx: CELL,
    cz: CELL,
    R: CELL * 1.5
  };
}
function sampleLocal(tile, lx, lz, out) {
  const p = PIECES[tile.t];
  const half = p.size * HALF;
  out.inFootprint = lx >= -half && lx <= half && lz >= -half && lz <= half;
  const base = baseY(tile);
  out.nx = 0;
  out.ny = 1;
  out.nz = 0;
  out.h = base;
  out.gx = 1;
  out.gz = 0;
  if (p.kind === "line") {
    const len = 2 * half;
    const rise = p.rise * LEVEL_H;
    let t = (half - lz) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.d = lx;
    out.h = base + rise * profH(p, t);
    const k = rise * profD(p, t) / len;
    const inv = 1 / Math.sqrt(1 + k * k);
    out.ny = inv;
    out.nz = k * inv;
    out.along = t;
  } else if (p.kind === "arc") {
    const a = arcParams(p);
    const mir = p.mirror < 0 ? -1 : 1;
    const dx = mir * lx - a.cx, dz = lz - a.cz;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    out.d = dist - a.R;
    out.gx = mir * dx / dist;
    out.gz = dz / dist;
    let ang = datan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;
    out.along = (ang - Math.PI) / (Math.PI / 2);
    if (p.rise) {
      const t = out.along < 0 ? 0 : out.along > 1 ? 1 : out.along;
      const rise = p.rise * LEVEL_H;
      out.h = base + rise * t;
      const k = rise / (Math.PI / 2 * dist);
      const inv = 1 / Math.sqrt(1 + k * k);
      const tx = -dsin(ang), tz = dcos(ang);
      out.nx = -mir * k * tx * inv;
      out.ny = inv;
      out.nz = -k * tz * inv;
    }
  } else if (p.kind === "fork") {
    forkSample(p, lx, lz, out);
  } else if (p.kind === "loop") {
    const lane = lz >= 0 ? -p.mirror * p.lane : p.mirror * p.lane;
    out.d = lx - lane;
    out.along = (half - lz) / (2 * half);
  } else {
    out.d = 0;
    out.along = (half - lz) / (2 * half);
  }
  return out;
}
var smoothF = (t) => t * t * (3 - 2 * t);
function forkBranchX(p, t, branch) {
  const x0 = -p.mirror * HALF;
  return branch === 0 ? x0 : x0 + p.mirror * CELL * smoothF(t);
}
function forkSep(t) {
  return CELL * smoothF(t);
}
function forkSample(p, lx, lz, out) {
  const half = p.size * HALF;
  let t = (half - lz) / (2 * half);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.along = t;
  const xa = forkBranchX(p, t, 0), xb = forkBranchX(p, t, 1);
  const slope = p.mirror * CELL * 6 * t * (1 - t) / (2 * half);
  const cb = 1 / Math.sqrt(1 + slope * slope);
  const da = lx - xa, db = (lx - xb) * cb;
  const sep = forkSep(t);
  const between = (lx - xa) * (lx - xb) < 0;
  if (between && sep < 2 * ROAD_HALF + 0.05) {
    out.d = 0;
    out.gx = 1;
    out.gz = 0;
  } else if (Math.abs(da) <= Math.abs(db)) {
    out.d = da;
    out.gx = 1;
    out.gz = 0;
  } else {
    out.d = db;
    out.gx = cb;
    out.gz = slope * cb;
  }
  out.branch = Math.abs(da) <= ROAD_HALF ? 0 : 1;
}

// js/ribbons.js
var smooth = (u) => u * u * (3 - 2 * u);
var ramp = (u, w) => u < w ? smooth(u / w) : u > 1 - w ? smooth((1 - u) / w) : 1;
var cache = /* @__PURE__ */ new WeakMap();
function ribbonOf(tile, raw = false) {
  const ori = tile.o | 0;
  let c = cache.get(tile);
  if (c === void 0 || c.t !== tile.t || c.l !== tile.l || c.o !== ori) {
    c = {
      t: tile.t,
      l: tile.l,
      o: ori,
      plain: void 0,
      flipped: void 0
    };
    cache.set(tile, c);
  }
  if (!tile.v || raw) {
    if (c.plain === void 0) c.plain = build(tile);
    return c.plain;
  }
  if (c.flipped === void 0) {
    const inner = ribbonOf(tile, true), base = baseY(tile);
    c.flipped = inner && {
      ...inner,
      pos(u, o) {
        inner.pos(u, o);
        o.y = 2 * base - o.y;
        o.ny = -o.ny;
      }
    };
  }
  return c.flipped;
}
function floorCenter(tile, u, out) {
  const P = PIECES[tile.t], base = baseY(tile), half = P.size * HALF;
  let dx, dy, dz;
  if (P.kind === "arc") {
    const a = arcParams(P), mir = P.mirror < 0 ? -1 : 1, ang = Math.PI + Math.PI / 2 * u;
    out.x = mir * (a.cx + a.R * dcos(ang));
    out.z = a.cz + a.R * dsin(ang);
    out.y = base + P.rise * LEVEL_H * u;
    dx = -mir * a.R * dsin(ang) * (Math.PI / 2);
    dz = a.R * dcos(ang) * (Math.PI / 2);
    dy = P.rise * LEVEL_H;
  } else {
    out.x = 0;
    out.z = half - 2 * half * u;
    out.y = base + P.rise * LEVEL_H * profH(P, u);
    dx = 0;
    dz = -2 * half;
    dy = P.rise * LEVEL_H * profD(P, u);
  }
  const l = hypot3(dx, dy, dz) || 1;
  out.tx = dx / l;
  out.ty = dy / l;
  out.tz = dz / l;
  return out;
}
function rolledNormal(t, psi, o) {
  let ux = -t.tx * t.ty, uy = 1 - t.ty * t.ty, uz = -t.tz * t.ty;
  const l = hypot3(ux, uy, uz) || 1;
  ux /= l;
  uy /= l;
  uz /= l;
  const rx = t.ty * uz - t.tz * uy, ry = t.tz * ux - t.tx * uz, rz = t.tx * uy - t.ty * ux;
  const c = dcos(psi), s = dsin(psi);
  o.nx = c * ux + s * rx;
  o.ny = c * uy + s * ry;
  o.nz = c * uz + s * rz;
}
function buildRolled(tile) {
  const P = PIECES[tile.t];
  const psi = tile.o === 1 ? Math.PI / 2 : -Math.PI / 2;
  const C4 = {};
  const half = P.size * HALF;
  const len = P.kind === "arc" ? hypot2(Math.PI / 2 * arcParams(P).R, P.rise * LEVEL_H) : hypot2(2 * half, P.rise * LEVEL_H);
  return {
    minU: 0.5,
    len: len * 1.2,
    pos(u, o) {
      floorCenter(tile, u, C4);
      o.x = C4.x;
      o.y = C4.y;
      o.z = C4.z;
      rolledNormal(C4, psi, o);
    }
  };
}
function build(tile) {
  const P = PIECES[tile.t];
  const base = baseY(tile);
  const half = P.size * HALF;
  const R90 = 2 * LEVEL_H;
  if (isOriented(tile)) return buildRolled(tile);
  if (P.kind === "loop") {
    const total = Math.PI * 2 * P.turns;
    const { R, lane, mirror: m } = P;
    return {
      minU: P.turns === 1 ? 0.1 : 0.04,
      pos(u, o) {
        const th = total * u, c = dcos(th), s = dsin(th);
        o.x = m * lane * (2 * smooth(u) - 1);
        o.y = base + R - R * c;
        o.z = -R * s;
        o.nx = 0;
        o.ny = c;
        o.nz = s;
      },
      len: total * R + 2 * lane
    };
  }
  if (P.kind === "ribbon") {
    if (P.arc) {
      const a = arcParams(P);
      return {
        pos(u, o) {
          const ang = Math.PI + Math.PI / 2 * u;
          const b = P.bank * dsin(Math.PI * u);
          const ca = dcos(ang), sa = dsin(ang);
          o.x = a.cx + a.R * ca;
          o.z = a.cz + a.R * sa;
          o.y = base + ROAD_HALF * dsin(b);
          o.nx = -ca * dsin(b);
          o.ny = dcos(b);
          o.nz = -sa * dsin(b);
        },
        len: Math.PI / 2 * a.R
      };
    }
    if (tile.t === "tube") {
      const kcMax = 1 / 8;
      return {
        tubeR: 8,
        pos(u, o) {
          o.x = -HALF;
          o.y = base;
          o.z = half - 2 * half * u;
          o.nx = 0;
          o.ny = 1;
          o.nz = 0;
          const k = ramp(u, 0.2);
          o.kc = kcMax * k;
          o.wrap = k >= 0.999;
          o.hw = o.wrap ? Math.PI / kcMax : ROAD_HALF;
        },
        len: 2 * half
      };
    }
    if (tile.t === "tubeIn" || tile.t === "tubeMid") {
      const kcMax = 1 / 8, entry = tile.t === "tubeIn";
      return {
        tubeR: 8,
        pos(u, o) {
          o.x = 0;
          o.y = base;
          o.z = half - 2 * half * u;
          o.nx = 0;
          o.ny = 1;
          o.nz = 0;
          const k = entry ? u >= 0.82 ? 1 : smooth(u / 0.82) : 1;
          o.kc = kcMax * k;
          o.wrap = k >= 0.999;
          o.hw = o.wrap ? Math.PI / kcMax : ROAD_HALF;
        },
        len: 2 * half
      };
    }
    if (P.roll) {
      const [a, b] = P.roll, long = !!P.rollLong;
      const psa = oriAngle(a, b), psb = oriAngle(b, a);
      return {
        minU: 0.5,
        pos(u, o) {
          const psi = psa + (psb - psa) * smooth(u);
          o.x = long ? -HALF : 0;
          o.y = base;
          o.z = half - 2 * half * u;
          o.nx = dsin(psi);
          o.ny = dcos(psi);
          o.nz = 0;
        },
        len: long ? 2 * half : 2 * half * 1.6
      };
    }
    if (tile.t === "cork" || tile.t === "corkL") {
      const Rh = 8, m = P.mirror;
      return {
        minU: 0.06,
        pos(u, o) {
          const th = Math.PI * 2 * smooth(u);
          const s = dsin(th), c = dcos(th);
          o.x = -HALF + m * Rh * s;
          o.y = base + Rh * (1 - c);
          o.z = half - 2 * half * u;
          o.nx = -m * s;
          o.ny = c;
          o.nz = 0;
        },
        len: hypot2(2 * half, 2 * Math.PI * Rh)
      };
    }
    if (tile.t === "twist") {
      return {
        minU: 0.5,
        pos(u, o) {
          const f = Math.PI * smooth(u);
          o.x = -HALF;
          o.y = base;
          o.z = half - 2 * half * u;
          o.nx = dsin(f);
          o.ny = dcos(f);
          o.nz = 0;
        },
        len: 2 * half
      };
    }
    if (tile.t === "ramp90") {
      const Lf2 = 2 * half - R90, La2 = R90 * Math.PI / 2, tot2 = Lf2 + La2;
      return {
        pos(u, o) {
          const s = u * tot2;
          if (s <= Lf2) {
            o.x = 0;
            o.y = base;
            o.z = half - s;
            o.nx = 0;
            o.ny = 1;
            o.nz = 0;
          } else {
            const a = (s - Lf2) / R90;
            o.x = 0;
            o.z = -half + R90 - R90 * dsin(a);
            o.y = base + R90 - R90 * dcos(a);
            o.nx = 0;
            o.ny = dcos(a);
            o.nz = dsin(a);
          }
        },
        len: tot2
      };
    }
    if (tile.t === "wall") {
      return {
        pos(u, o) {
          o.x = 0;
          o.y = base + LEVEL_H * u;
          o.z = half;
          o.nx = 0;
          o.ny = 0;
          o.nz = 1;
        },
        len: LEVEL_H
      };
    }
    const La = R90 * Math.PI / 2, Lf = 2 * half - R90, tot = La + Lf;
    const cz = half - R90;
    return {
      lipU: La / tot,
      pos(u, o) {
        const s = u * tot;
        o.x = 0;
        if (s <= La) {
          const a = s / R90;
          o.z = cz + R90 * dcos(a);
          o.y = base + R90 * dsin(a);
          o.nx = 0;
          o.ny = dsin(a);
          o.nz = dcos(a);
        } else {
          o.z = cz - (s - La);
          o.y = base + R90;
          o.nx = 0;
          o.ny = 1;
          o.nz = 0;
        }
      },
      len: tot
    };
  }
  return null;
}
var A = {};
var B = {};
var C2 = {};
function frameLocal(rib, u, F) {
  const e = 2e-3;
  const u0 = Math.max(0, u - e), u1 = Math.min(1, u + e);
  A.kc = 0;
  A.hw = 0;
  A.wrap = false;
  rib.pos(u, A);
  rib.pos(u0, B);
  rib.pos(u1, C2);
  let tx = C2.x - B.x, ty = C2.y - B.y, tz = C2.z - B.z;
  const l = hypot3(tx, ty, tz) || 1e-9;
  F.ds = l / (u1 - u0);
  tx /= l;
  ty /= l;
  tz /= l;
  let nx = A.nx, ny = A.ny, nz = A.nz;
  const d = nx * tx + ny * ty + nz * tz;
  nx -= tx * d;
  ny -= ty * d;
  nz -= tz * d;
  const nl = hypot3(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  F.px = A.x;
  F.py = A.y;
  F.pz = A.z;
  F.tx = tx;
  F.ty = ty;
  F.tz = tz;
  F.nx = nx;
  F.ny = ny;
  F.nz = nz;
  F.rx = ty * nz - tz * ny;
  F.ry = tz * nx - tx * nz;
  F.rz = tx * ny - ty * nx;
  F.kc = A.kc || 0;
  F.hw = A.hw || ROAD_HALF;
  F.wrap = !!A.wrap;
  return F;
}
function centerlineLocal(tile, n) {
  const p = PIECES[tile.t];
  const half = p.size * HALF;
  const base = baseY(tile);
  const pts = [];
  const sampleRibbon = (count, flag = 1) => {
    const rib = ribbonOf(tile, true);
    const o = {};
    for (let i = 0; i <= count; i++) {
      rib.pos(i / count, o);
      pts.push([
        o.x,
        o.y,
        o.z,
        flag
      ]);
    }
  };
  if (p.kind === "loop") {
    const m = p.mirror;
    for (let i = 0; i < 4; i++) pts.push([
      -m * p.lane,
      base,
      half - half * i / 4,
      0
    ]);
    sampleRibbon(32 * p.turns);
    for (let i = 1; i <= 4; i++) pts.push([
      m * p.lane,
      base,
      -(half * i) / 4,
      0
    ]);
  } else if (p.kind === "ribbon") {
    const rib = ribbonOf(tile, true);
    sampleRibbon(Math.max(8, Math.round(rib.len / 3)), p.arc ? 2 : 1);
  } else if (p.kind === "arc") {
    const a = arcParams(p);
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI + Math.PI / 2 * (i / n);
      pts.push([
        (p.mirror < 0 ? -1 : 1) * (a.cx + a.R * dcos(ang)),
        base + p.rise * LEVEL_H * (i / n),
        a.cz + a.R * dsin(ang),
        0
      ]);
    }
  } else {
    const rise = p.rise * LEVEL_H;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([
        0,
        base + rise * profH(p, t),
        half - 2 * half * t,
        0
      ]);
    }
  }
  if (tile.v) for (const q of pts) q[1] = 2 * base - q[1];
  return pts;
}
function centerlineWorld(tile, n, reverse = false) {
  const out = centerlineLocal(tile, n).map(([lx, y, lz, f]) => {
    const w = localToWorld(tile, lx, lz);
    return [
      w.x,
      y,
      w.z,
      f
    ];
  });
  return reverse ? out.reverse() : out;
}

// js/obstacles.js
var OBST = {
  spikes: {
    label: "Piques",
    type: "spike",
    period: 0,
    hx: 4,
    hz: 1.5,
    hy: 1
  },
  spikesPop: {
    label: "Piques escamotables",
    type: "spike",
    period: 3,
    hx: 4,
    hz: 1.5,
    hy: 1
  },
  pendulum: {
    label: "Boule balancier",
    type: "ball",
    period: 3.2,
    pivot: 13,
    arm: 10,
    r: 2.2,
    amp: 1.1
  },
  hammer: {
    label: "Marteau tournant",
    type: "ball",
    period: 2.8,
    pivot: 7,
    arm: 6,
    r: 2,
    spin: true
  },
  slider: {
    label: "Mur coulissant",
    type: "box",
    period: 4,
    travel: 7,
    hx: 1.5,
    hy: 1.6,
    hz: 2.5
  },
  sweeper: {
    label: "Balayeur",
    type: "bar",
    period: 4,
    len: 9,
    r: 0.6,
    y: 1.2
  },
  bumper: {
    label: "Bumper",
    type: "post",
    period: 0,
    r: 1.8,
    h: 2.2,
    kick: 18
  }
};
var isObstacle = (k) => !!OBST[k];
var OBSTACLE_CELL = 20;
var obstacleKey = (ix, iz) => ix * 1048576 + iz;
function buildObstacleGrid(list) {
  const grid = /* @__PURE__ */ new Map();
  for (const d of list) {
    if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.z)) continue;
    const k = obstacleKey(Math.floor(d.x / OBSTACLE_CELL), Math.floor(d.z / OBSTACLE_CELL));
    const bucket = grid.get(k);
    if (bucket) bucket.push(d);
    else grid.set(k, [
      d
    ]);
  }
  return grid;
}
var TAU = Math.PI * 2;
function spikeLevel(def, t) {
  if (!def.period) return 1;
  const u = (t / def.period % 1 + 1) % 1;
  const ramp2 = 0.07;
  if (u < 0.5 - ramp2) return 1;
  if (u < 0.5) return (0.5 - u) / ramp2;
  if (u < 1 - ramp2) return 0;
  return (u - (1 - ramp2)) / ramp2;
}
function obstacleLocal(d, t, out) {
  const def = OBST[d.k];
  const ph = (d.ph || 0) * (def.period || 1);
  const tt = t + ph;
  out.x = 0;
  out.y = 0;
  out.z = 0;
  out.vx = 0;
  out.vy = 0;
  out.vz = 0;
  out.a = 0;
  out.w = 0;
  out.on = 1;
  if (def.type === "spike") {
    out.on = spikeLevel(def, tt);
  } else if (d.k === "pendulum") {
    const w = TAU / def.period;
    const th = def.amp * dsin(w * tt), dth = def.amp * w * dcos(w * tt);
    out.x = dsin(th) * def.arm;
    out.y = def.pivot - dcos(th) * def.arm;
    out.vx = dcos(th) * def.arm * dth;
    out.vy = dsin(th) * def.arm * dth;
    out.a = th;
  } else if (d.k === "hammer") {
    const w = TAU / def.period, th = w * tt;
    out.x = dsin(th) * def.arm;
    out.y = def.pivot - dcos(th) * def.arm;
    out.vx = dcos(th) * def.arm * w;
    out.vy = dsin(th) * def.arm * w;
    out.a = th;
  } else if (d.k === "slider") {
    const w = TAU / def.period;
    out.x = def.travel * dsin(w * tt);
    out.y = def.hy;
    out.vx = def.travel * w * dcos(w * tt);
  } else if (d.k === "sweeper") {
    const w = TAU / def.period;
    out.a = w * tt;
    out.y = def.y;
    out.w = w;
  }
  return out;
}
function toLocalObs(d, wx, wy, wz, out) {
  const c = dcos(d.ry || 0), s = dsin(d.ry || 0), k = d.s || 1;
  const dx = (wx - d.x) / k, dz = (wz - d.z) / k;
  out.x = dx * c - dz * s;
  out.y = (wy - d.y) / k;
  out.z = dx * s + dz * c;
  return out;
}
function obstacleRadius(d) {
  const def = OBST[d.k], k = d.s || 1;
  if (def.type === "spike") return (hypot2(def.hx, def.hz) + 1) * k;
  if (def.type === "ball") return (def.arm + def.r + 1) * k + 2;
  if (def.type === "box") return (def.travel + hypot2(def.hx, def.hz) + 1) * k;
  if (def.type === "bar") return (def.len + def.r + 1) * k;
  return (def.r + 1) * k;
}

// js/decoPackData.js
var PACK = [
  [
    "beach",
    "Plage et \xE9t\xE9",
    [
      [
        "parasol",
        "Parasol",
        "\u26F1"
      ],
      [
        "beachChair",
        "Chaise de plage",
        "\u{1FA91}"
      ],
      [
        "sandCastle",
        "Ch\xE2teau de sable",
        "\u{1F3F0}"
      ],
      [
        "surfboard",
        "Planche de surf",
        "\u{1F3C4}"
      ],
      [
        "lifeguard",
        "Tour de sauveteur",
        "\u{1F6DF}"
      ],
      [
        "beachBall",
        "Ballon de plage",
        "\u{1F3D0}"
      ],
      [
        "towel",
        "Serviette",
        "\u{1F7E6}"
      ],
      [
        "coconutPalm",
        "Cocotier",
        "\u{1F965}"
      ],
      [
        "sunLounger",
        "Bain de soleil",
        "\u{1F3D6}"
      ],
      [
        "starfish",
        "\xC9toile de mer",
        "\u2B50"
      ],
      [
        "bigCrab",
        "Crabe g\xE9ant",
        "\u{1F980}"
      ],
      [
        "lighthouse",
        "Phare",
        "\u{1F5FC}"
      ],
      [
        "beachHut",
        "Cabane de plage",
        "\u{1F6D6}"
      ],
      [
        "buoy",
        "Bou\xE9e",
        "\u{1F534}"
      ],
      [
        "volleyNet",
        "Filet de volley",
        "\u{1F3D0}"
      ],
      [
        "iceCreamCart",
        "Charrette \xE0 glaces",
        "\u{1F366}"
      ],
      [
        "bigSun",
        "Soleil",
        "\u2600"
      ],
      [
        "kayak",
        "Kayak",
        "\u{1F6F6}"
      ],
      [
        "sandalPair",
        "Tongs",
        "\u{1FA74}"
      ]
    ]
  ],
  [
    "valentine",
    "Saint-Valentin",
    [
      [
        "heartBig",
        "Grand c\u0153ur",
        "\u2764"
      ],
      [
        "heartArch",
        "Arche en c\u0153ur",
        "\u{1F49E}"
      ],
      [
        "roseBouquet",
        "Bouquet de roses",
        "\u{1F490}"
      ],
      [
        "rose",
        "Rose",
        "\u{1F339}"
      ],
      [
        "cupidArrow",
        "Fl\xE8che de Cupidon",
        "\u{1F498}"
      ],
      [
        "loveLetter",
        "Lettre d\u2019amour",
        "\u{1F48C}"
      ],
      [
        "chocolateBox",
        "Bo\xEEte de chocolats",
        "\u{1F36B}"
      ],
      [
        "teddy",
        "Ours en peluche",
        "\u{1F9F8}"
      ],
      [
        "heartBalloons",
        "Ballons en c\u0153ur",
        "\u{1F388}"
      ],
      [
        "ringBox",
        "\xC9crin \xE0 bague",
        "\u{1F48D}"
      ],
      [
        "heartTree",
        "Arbre \xE0 c\u0153urs",
        "\u{1F497}"
      ],
      [
        "loveBench",
        "Banc des amoureux",
        "\u{1FA91}"
      ]
    ]
  ],
  [
    "newyear",
    "Nouvel An",
    [
      [
        "fireworkTower",
        "Feu d\u2019artifice",
        "\u{1F386}"
      ],
      [
        "champagne",
        "Bouteille de champagne",
        "\u{1F37E}"
      ],
      [
        "bigClock",
        "Horloge du compte \xE0 rebours",
        "\u{1F55B}"
      ],
      [
        "confettiCannon",
        "Canon \xE0 confettis",
        "\u{1F38A}"
      ],
      [
        "partyHat",
        "Chapeau de f\xEAte",
        "\u{1F973}"
      ],
      [
        "discoBall",
        "Boule \xE0 facettes",
        "\u{1FAA9}"
      ],
      [
        "balloonArch",
        "Arche de ballons",
        "\u{1F388}"
      ],
      [
        "streamerPole",
        "M\xE2t \xE0 serpentins",
        "\u{1F38F}"
      ],
      [
        "sparkler",
        "Cierge magique",
        "\u{1F387}"
      ],
      [
        "starGarland",
        "Guirlande d\u2019\xE9toiles",
        "\u2728"
      ],
      [
        "redLantern",
        "Lanterne rouge",
        "\u{1F3EE}"
      ],
      [
        "newYearArch",
        "Arche du Nouvel An",
        "\u{1F389}"
      ]
    ]
  ],
  [
    "xmas",
    "No\xEBl",
    [
      [
        "giftStack",
        "Pile de cadeaux",
        "\u{1F381}"
      ],
      [
        "snowflake",
        "Flocon g\xE9ant",
        "\u2744"
      ],
      [
        "stocking",
        "Chaussette de No\xEBl",
        "\u{1F9E6}"
      ],
      [
        "lightString",
        "Guirlande lumineuse",
        "\u{1F4A1}"
      ],
      [
        "snowPine",
        "Sapin enneig\xE9",
        "\u{1F332}"
      ],
      [
        "igloo",
        "Igloo",
        "\u{1F6D6}"
      ],
      [
        "nutcracker",
        "Casse-noisette",
        "\u{1F482}"
      ],
      [
        "snowGlobe",
        "Boule \xE0 neige",
        "\u{1F52E}"
      ],
      [
        "santaChimney",
        "Chemin\xE9e du P\xE8re No\xEBl",
        "\u{1F3E0}"
      ],
      [
        "elf",
        "Lutin",
        "\u{1F9DD}"
      ],
      [
        "bell",
        "Cloche",
        "\u{1F514}"
      ],
      [
        "holly",
        "Houx",
        "\u{1F340}"
      ]
    ]
  ],
  [
    "halloween",
    "Halloween",
    [
      [
        "coffin",
        "Cercueil",
        "\u26B0"
      ],
      [
        "scarecrow",
        "\xC9pouvantail",
        "\u{1F383}"
      ],
      [
        "spiderWeb",
        "Toile d\u2019araign\xE9e",
        "\u{1F578}"
      ],
      [
        "spider",
        "Araign\xE9e g\xE9ante",
        "\u{1F577}"
      ],
      [
        "candyBucket",
        "Seau de bonbons",
        "\u{1F36C}"
      ],
      [
        "crystalBall",
        "Boule de cristal",
        "\u{1F52E}"
      ],
      [
        "hangingGhost",
        "Fant\xF4me suspendu",
        "\u{1F47B}"
      ],
      [
        "graveFence",
        "Grille de cimeti\xE8re",
        "\u26D3"
      ],
      [
        "broom",
        "Balai de sorci\xE8re",
        "\u{1F9F9}"
      ],
      [
        "mummy",
        "Momie",
        "\u{1F9DF}"
      ],
      [
        "skeleton",
        "Squelette",
        "\u{1F480}"
      ],
      [
        "blackCat",
        "Chat noir",
        "\u{1F408}\u200D\u2B1B"
      ]
    ]
  ],
  [
    "spring",
    "Printemps et P\xE2ques",
    [
      [
        "easterEgg",
        "\u0152uf de P\xE2ques",
        "\u{1F95A}"
      ],
      [
        "bunny",
        "Lapin",
        "\u{1F430}"
      ],
      [
        "eggBasket",
        "Panier d\u2019\u0153ufs",
        "\u{1F9FA}"
      ],
      [
        "tulip",
        "Tulipe",
        "\u{1F337}"
      ],
      [
        "daisy",
        "Marguerite",
        "\u{1F33C}"
      ],
      [
        "beehive",
        "Ruche",
        "\u{1F41D}"
      ],
      [
        "butterfly",
        "Papillon",
        "\u{1F98B}"
      ],
      [
        "birdhouse",
        "Nichoir",
        "\u{1F426}"
      ],
      [
        "lamb",
        "Agneau",
        "\u{1F411}"
      ],
      [
        "rainbow",
        "Arc-en-ciel",
        "\u{1F308}"
      ],
      [
        "cherryTree",
        "Cerisier en fleurs",
        "\u{1F338}"
      ],
      [
        "picnic",
        "Pique-nique",
        "\u{1F9FA}"
      ]
    ]
  ],
  [
    "autumn",
    "Automne",
    [
      [
        "mapleTree",
        "\xC9rable",
        "\u{1F341}"
      ],
      [
        "leafPile",
        "Tas de feuilles",
        "\u{1F342}"
      ],
      [
        "hayBale",
        "Botte de foin",
        "\u{1F33E}"
      ],
      [
        "appleTree",
        "Pommier",
        "\u{1F34E}"
      ],
      [
        "acorn",
        "Gland g\xE9ant",
        "\u{1F330}"
      ],
      [
        "harvestCart",
        "Charrette de r\xE9colte",
        "\u{1F6D2}"
      ],
      [
        "redMushroom",
        "Amanite",
        "\u{1F344}"
      ],
      [
        "pumpkinPatch",
        "Champ de citrouilles",
        "\u{1F383}"
      ],
      [
        "woodpile",
        "Tas de b\xFBches",
        "\u{1FAB5}"
      ],
      [
        "fallBirch",
        "Bouleau dor\xE9",
        "\u{1F333}"
      ]
    ]
  ],
  [
    "winter",
    "Neige et glace",
    [
      [
        "iceSpike",
        "Pointe de glace",
        "\u{1F9CA}"
      ],
      [
        "iceCastle",
        "Ch\xE2teau de glace",
        "\u{1F3F0}"
      ],
      [
        "snowdrift",
        "Cong\xE8re",
        "\u26C4"
      ],
      [
        "skiPole",
        "Remonte-pente",
        "\u{1F3BF}"
      ],
      [
        "sled",
        "Luge",
        "\u{1F6F7}"
      ],
      [
        "frozenLamp",
        "Lampe gel\xE9e",
        "\u{1F4A1}"
      ],
      [
        "iceCube",
        "Bloc de glace",
        "\u{1F9CA}"
      ],
      [
        "polarBear",
        "Ours polaire",
        "\u{1F43B}\u200D\u2744"
      ],
      [
        "penguin",
        "Pingouin",
        "\u{1F427}"
      ],
      [
        "iceArch",
        "Arche de glace",
        "\u{1F309}"
      ]
    ]
  ],
  [
    "fair",
    "F\xEAte foraine",
    [
      [
        "ferrisWheel",
        "Grande roue",
        "\u{1F3A1}"
      ],
      [
        "carousel",
        "Man\xE8ge",
        "\u{1F3A0}"
      ],
      [
        "circusTent",
        "Chapiteau",
        "\u{1F3AA}"
      ],
      [
        "popcornStand",
        "Stand de pop-corn",
        "\u{1F37F}"
      ],
      [
        "cottonCandy",
        "Barbe \xE0 papa",
        "\u{1F36D}"
      ],
      [
        "strengthTester",
        "Jeu du marteau",
        "\u{1F528}"
      ],
      [
        "balloonStand",
        "Stand de ballons",
        "\u{1F388}"
      ],
      [
        "clownHead",
        "T\xEAte de clown",
        "\u{1F921}"
      ],
      [
        "ticketBooth",
        "Guichet",
        "\u{1F39F}"
      ],
      [
        "dropTower",
        "Tour de chute",
        "\u{1F5FC}"
      ],
      [
        "swingRide",
        "Chaises volantes",
        "\u{1F3A0}"
      ],
      [
        "hotDogStand",
        "Stand de hot-dogs",
        "\u{1F32D}"
      ],
      [
        "funHouse",
        "Palais des glaces",
        "\u{1FA9E}"
      ],
      [
        "coaster",
        "Rail de montagnes russes",
        "\u{1F3A2}"
      ]
    ]
  ],
  [
    "city",
    "Ville",
    [
      [
        "skyscraper",
        "Gratte-ciel",
        "\u{1F3D9}"
      ],
      [
        "apartment",
        "Immeuble",
        "\u{1F3E2}"
      ],
      [
        "shop",
        "Boutique",
        "\u{1F3EA}"
      ],
      [
        "busStop",
        "Abribus",
        "\u{1F68F}"
      ],
      [
        "mailbox",
        "Bo\xEEte aux lettres",
        "\u{1F4EE}"
      ],
      [
        "hydrant",
        "Bouche d\u2019incendie",
        "\u{1F9EF}"
      ],
      [
        "trafficLight",
        "Feu tricolore",
        "\u{1F6A6}"
      ],
      [
        "bench",
        "Banc",
        "\u{1FA91}"
      ],
      [
        "fountain",
        "Fontaine",
        "\u26F2"
      ],
      [
        "phoneBooth",
        "Cabine t\xE9l\xE9phonique",
        "\u260E"
      ],
      [
        "billboard",
        "Panneau publicitaire",
        "\u{1FAA7}"
      ],
      [
        "parkingMeter",
        "Horodateur",
        "\u{1F17F}"
      ],
      [
        "gasPump",
        "Pompe \xE0 essence",
        "\u26FD"
      ],
      [
        "cityTree",
        "Arbre de rue",
        "\u{1F333}"
      ]
    ]
  ],
  [
    "farm",
    "Ferme",
    [
      [
        "barn",
        "Grange",
        "\u{1F3DA}"
      ],
      [
        "silo",
        "Silo",
        "\u{1F33E}"
      ],
      [
        "tractor",
        "Tracteur",
        "\u{1F69C}"
      ],
      [
        "woodFence",
        "Barri\xE8re en bois",
        "\u{1FAB5}"
      ],
      [
        "cow",
        "Vache",
        "\u{1F404}"
      ],
      [
        "pig",
        "Cochon",
        "\u{1F416}"
      ],
      [
        "sheep",
        "Mouton",
        "\u{1F411}"
      ],
      [
        "well",
        "Puits",
        "\u{1FAA3}"
      ],
      [
        "hayStack",
        "Meule de foin",
        "\u{1F33E}"
      ],
      [
        "chickenCoop",
        "Poulailler",
        "\u{1F414}"
      ],
      [
        "farmWindmill",
        "Moulin de ferme",
        "\u{1F32C}"
      ]
    ]
  ],
  [
    "castle",
    "Ch\xE2teau",
    [
      [
        "castleTower",
        "Tour de ch\xE2teau",
        "\u{1F3F0}"
      ],
      [
        "castleWall",
        "Rempart",
        "\u{1F9F1}"
      ],
      [
        "castleGate",
        "Porte fortifi\xE9e",
        "\u{1F6AA}"
      ],
      [
        "bannerPole",
        "\xC9tendard",
        "\u{1F6A9}"
      ],
      [
        "catapult",
        "Catapulte",
        "\u{1F3F9}"
      ],
      [
        "knightStatue",
        "Statue de chevalier",
        "\u{1F6E1}"
      ],
      [
        "shield",
        "Bouclier",
        "\u{1F6E1}"
      ],
      [
        "dragon",
        "Dragon",
        "\u{1F409}"
      ],
      [
        "drawbridge",
        "Pont-levis",
        "\u{1F309}"
      ],
      [
        "campfire",
        "Feu de camp",
        "\u{1F525}"
      ],
      [
        "tent",
        "Tente",
        "\u26FA"
      ],
      [
        "crown",
        "Couronne royale",
        "\u{1F451}"
      ]
    ]
  ],
  [
    "wild",
    "Pirates et western",
    [
      [
        "shipWreck",
        "\xC9pave de bateau",
        "\u{1F6A2}"
      ],
      [
        "cannon",
        "Canon",
        "\u{1F4A3}"
      ],
      [
        "skullFlag",
        "Pavillon pirate",
        "\u{1F3F4}\u200D\u2620"
      ],
      [
        "treasureX",
        "Marque du tr\xE9sor",
        "\u274C"
      ],
      [
        "saloon",
        "Saloon",
        "\u{1F37A}"
      ],
      [
        "bigCactus",
        "Grand cactus",
        "\u{1F335}"
      ],
      [
        "wagon",
        "Chariot",
        "\u{1F6FB}"
      ],
      [
        "tipi",
        "Tipi",
        "\u26FA"
      ],
      [
        "totem",
        "Totem",
        "\u{1F5FF}"
      ],
      [
        "tumbleweed",
        "Boule de ronces",
        "\u{1F33F}"
      ]
    ]
  ],
  [
    "japan",
    "Japon",
    [
      [
        "torii",
        "Torii",
        "\u26E9"
      ],
      [
        "pagoda",
        "Pagode",
        "\u{1F3EF}"
      ],
      [
        "paperLantern",
        "Lanterne en papier",
        "\u{1F3EE}"
      ],
      [
        "bonsai",
        "Bonsa\xEF",
        "\u{1FAB4}"
      ],
      [
        "sakura",
        "Cerisier japonais",
        "\u{1F338}"
      ],
      [
        "bamboo",
        "Bambous",
        "\u{1F38B}"
      ],
      [
        "zenStone",
        "Pierres zen",
        "\u{1FAA8}"
      ],
      [
        "shrine",
        "Petit sanctuaire",
        "\u26E9"
      ],
      [
        "koiNobori",
        "Ko\xEF-nobori",
        "\u{1F38F}"
      ]
    ]
  ],
  [
    "sport",
    "Sport",
    [
      [
        "goal",
        "But de football",
        "\u{1F945}"
      ],
      [
        "basketHoop",
        "Panier de basket",
        "\u{1F3C0}"
      ],
      [
        "tennisNet",
        "Filet de tennis",
        "\u{1F3BE}"
      ],
      [
        "giantBall",
        "Ballon g\xE9ant",
        "\u26BD"
      ],
      [
        "podium",
        "Podium",
        "\u{1F3C6}"
      ],
      [
        "finishArch",
        "Arche d\u2019arriv\xE9e",
        "\u{1F3C1}"
      ],
      [
        "startGantry",
        "Portique de d\xE9part",
        "\u{1F6A6}"
      ],
      [
        "trophy",
        "Troph\xE9e",
        "\u{1F3C6}"
      ],
      [
        "archeryTarget",
        "Cible de tir \xE0 l\u2019arc",
        "\u{1F3AF}"
      ],
      [
        "rugbyPost",
        "Poteaux de rugby",
        "\u{1F3C9}"
      ]
    ]
  ],
  [
    "jungle",
    "Jungle",
    [
      [
        "bigLeaf",
        "Grande feuille",
        "\u{1F343}"
      ],
      [
        "vines",
        "Lianes",
        "\u{1F33F}"
      ],
      [
        "tikiTotem",
        "Totem tiki",
        "\u{1F5FF}"
      ],
      [
        "jungleTree",
        "Arbre de jungle",
        "\u{1F334}"
      ],
      [
        "jungleHut",
        "Hutte",
        "\u{1F6D6}"
      ],
      [
        "parrot",
        "Perroquet",
        "\u{1F99C}"
      ],
      [
        "fern",
        "Foug\xE8re",
        "\u{1F33F}"
      ],
      [
        "waterfallRock",
        "Cascade",
        "\u{1F4A7}"
      ],
      [
        "giantFlower",
        "Fleur g\xE9ante",
        "\u{1F33A}"
      ]
    ]
  ],
  [
    "candy",
    "Bonbons",
    [
      [
        "lollipop",
        "Sucette",
        "\u{1F36D}"
      ],
      [
        "cupcake",
        "Cupcake",
        "\u{1F9C1}"
      ],
      [
        "donut",
        "Donut",
        "\u{1F369}"
      ],
      [
        "iceCreamCone",
        "Cornet de glace",
        "\u{1F366}"
      ],
      [
        "candyTree",
        "Arbre en bonbons",
        "\u{1F36C}"
      ],
      [
        "chocolateWall",
        "Mur de chocolat",
        "\u{1F36B}"
      ],
      [
        "cookie",
        "Cookie",
        "\u{1F36A}"
      ],
      [
        "gumdrop",
        "Gomme",
        "\u{1F36C}"
      ],
      [
        "candyHouse",
        "Maison de bonbons",
        "\u{1F3E0}"
      ],
      [
        "macaron",
        "Macaron",
        "\u{1F9C1}"
      ]
    ]
  ],
  [
    "party",
    "Musique et f\xEAte",
    [
      [
        "speaker",
        "Enceinte",
        "\u{1F50A}"
      ],
      [
        "stage",
        "Sc\xE8ne",
        "\u{1F3A4}"
      ],
      [
        "bigGuitar",
        "Guitare g\xE9ante",
        "\u{1F3B8}"
      ],
      [
        "drumKit",
        "Batterie",
        "\u{1F941}"
      ],
      [
        "piano",
        "Piano",
        "\u{1F3B9}"
      ],
      [
        "microphone",
        "Micro",
        "\u{1F399}"
      ],
      [
        "neonSign",
        "Enseigne n\xE9on",
        "\u{1F4A1}"
      ],
      [
        "lightTruss",
        "Portique de lumi\xE8res",
        "\u{1F526}"
      ],
      [
        "birthdayCake",
        "G\xE2teau d\u2019anniversaire",
        "\u{1F382}"
      ],
      [
        "balloonBunch",
        "Bouquet de ballons",
        "\u{1F388}"
      ]
    ]
  ]
];
var PACK_IDS = PACK.flatMap(([, , items]) => items.map((i) => i[0]));

// js/decoData.js
var DECO_ORDER = [
  "sign_left",
  "sign_right",
  "sign_up",
  "sign_stop",
  "sign_speed",
  "sign_warn",
  "banner",
  "cube",
  "sphere",
  "cylinder",
  "cone",
  "pyramid",
  "arch",
  "wall",
  "wallLow",
  "roofFlat",
  "roofGable",
  "dome",
  "pine",
  "palm",
  "tree",
  "bush",
  "rock",
  "cactus",
  "crystal",
  "mushroom",
  "flower",
  "plaque",
  "shard",
  // 0.9 : obstacles (physiques)
  "spikes",
  "spikesPop",
  "pendulum",
  "hammer",
  "slider",
  "sweeper",
  "bumper",
  "stalagmite",
  "cavePillar",
  "crystalCluster",
  "glowMushroom",
  "minecart",
  "lantern",
  "cloud",
  "balloon",
  "floatIsle",
  "windmill",
  "airship",
  "skyTower",
  "coral",
  "seaweed",
  "fishSchool",
  "shell",
  "anchor",
  "jellyfish",
  "treasure",
  "gear",
  "pipe",
  "chimney",
  "crate",
  "barrel",
  "crane",
  "warnLight",
  "satellite",
  "asteroid",
  "antenna",
  "rocket",
  "planetMini",
  "trafficCone",
  "tireStack",
  "flagPole",
  "grandstand",
  // 0.9.2 : lumières (vraies lumières, de la couleur de l'objet), véhicules, Noël, Halloween
  "searchlight",
  "spotlight",
  "lanternPost",
  "lanternHang",
  "streetLamp",
  "plane",
  "biplane",
  "helicopter",
  "bus",
  "truck",
  "locomotive",
  "sedan",
  "ufo",
  "sailboat",
  "xmasTree",
  "snowman",
  "gift",
  "candyCane",
  "xmasStar",
  "wreath",
  "sleigh",
  "reindeer",
  "gingerHouse",
  "pumpkin",
  "ghost",
  "tombstone",
  "bats",
  "witchHat",
  "cauldron",
  "spookyTree",
  "hauntedHouse",
  "skull",
  // 0.9.3 : pack de ~200 décorations (plage, Saint-Valentin, Nouvel An, fête foraine, ville, ferme, château, Japon, sport, jungle…)
  ...PACK_IDS,
  // 0.9.24 : pièce décorative personnalisée (customDeco.js), à la fin : l'ordre existant ne change jamais.
  "custom"
];
var BASE = [
  [
    "signs",
    "Panneaux",
    [
      [
        "sign_left",
        "Fl\xE8che gauche",
        "\u2B05"
      ],
      [
        "sign_right",
        "Fl\xE8che droite",
        "\u27A1"
      ],
      [
        "sign_up",
        "Tout droit",
        "\u2B06"
      ],
      [
        "sign_stop",
        "Stop",
        "\u26D4"
      ],
      [
        "sign_speed",
        "Limite",
        "\u{1F17F}"
      ],
      [
        "sign_warn",
        "Danger",
        "\u26A0"
      ],
      [
        "banner",
        "Banderole",
        "\u{1F6A9}"
      ]
    ]
  ],
  [
    "shapes",
    "Formes",
    [
      [
        "cube",
        "Cube",
        "\u2B1B"
      ],
      [
        "sphere",
        "Sph\xE8re",
        "\u26AA"
      ],
      [
        "cylinder",
        "Cylindre",
        "\u{1F6E2}"
      ],
      [
        "cone",
        "C\xF4ne",
        "\u{1F53A}"
      ],
      [
        "pyramid",
        "Pyramide",
        "\u{1F53B}"
      ],
      [
        "arch",
        "Arche",
        "\u{1F309}"
      ]
    ]
  ],
  [
    "build",
    "Murs et toits",
    [
      [
        "wall",
        "Mur",
        "\u{1F9F1}"
      ],
      [
        "wallLow",
        "Muret",
        "\u25AC"
      ],
      [
        "roofFlat",
        "Toit plat",
        "\u2B1C"
      ],
      [
        "roofGable",
        "Toit en pente",
        "\u{1F3E0}"
      ],
      [
        "dome",
        "D\xF4me",
        "\u{1F6D6}"
      ]
    ]
  ],
  [
    "nature",
    "Nature",
    [
      [
        "pine",
        "Sapin",
        "\u{1F332}"
      ],
      [
        "palm",
        "Palmier",
        "\u{1F334}"
      ],
      [
        "tree",
        "Arbre",
        "\u{1F333}"
      ],
      [
        "bush",
        "Buisson",
        "\u{1F33F}"
      ],
      [
        "rock",
        "Rocher",
        "\u{1FAA8}"
      ],
      [
        "cactus",
        "Cactus",
        "\u{1F335}"
      ],
      [
        "crystal",
        "Cristal",
        "\u{1F48E}"
      ],
      [
        "mushroom",
        "Champignon",
        "\u{1F344}"
      ],
      [
        "flower",
        "Fleur",
        "\u{1F338}"
      ]
    ]
  ],
  [
    "image",
    "Image",
    [
      [
        "plaque",
        "Plaque image",
        "\u{1F5BC}"
      ]
    ]
  ],
  [
    "cave",
    "Souterrain",
    [
      [
        "stalagmite",
        "Stalagmite",
        "\u{1F5FB}"
      ],
      [
        "cavePillar",
        "Pilier de grotte",
        "\u{1F3DB}"
      ],
      [
        "crystalCluster",
        "Amas de cristaux",
        "\u{1F4A0}"
      ],
      [
        "glowMushroom",
        "Champignon lumineux",
        "\u{1F344}"
      ],
      [
        "minecart",
        "Wagonnet",
        "\u{1F6D2}"
      ],
      [
        "lantern",
        "Lanterne",
        "\u{1F3EE}"
      ]
    ]
  ],
  [
    "sky",
    "Nuages",
    [
      [
        "cloud",
        "Nuage",
        "\u2601"
      ],
      [
        "balloon",
        "Montgolfi\xE8re",
        "\u{1F388}"
      ],
      [
        "floatIsle",
        "\xCEle flottante",
        "\u{1F3DD}"
      ],
      [
        "windmill",
        "\xC9olienne",
        "\u{1F32C}"
      ],
      [
        "airship",
        "Dirigeable",
        "\u{1F6F8}"
      ],
      [
        "skyTower",
        "Tour c\xE9leste",
        "\u{1F5FC}"
      ]
    ]
  ],
  [
    "sea",
    "Fonds marins",
    [
      [
        "coral",
        "Corail",
        "\u{1FAB8}"
      ],
      [
        "seaweed",
        "Algues",
        "\u{1F33F}"
      ],
      [
        "fishSchool",
        "Banc de poissons",
        "\u{1F41F}"
      ],
      [
        "shell",
        "Coquillage",
        "\u{1F41A}"
      ],
      [
        "anchor",
        "Ancre",
        "\u2693"
      ],
      [
        "jellyfish",
        "M\xE9duse",
        "\u{1FABC}"
      ],
      [
        "treasure",
        "Coffre au tr\xE9sor",
        "\u{1F4B0}"
      ]
    ]
  ],
  [
    "factory",
    "Usine",
    [
      [
        "gear",
        "Engrenage",
        "\u2699"
      ],
      [
        "pipe",
        "Tuyau",
        "\u{1F527}"
      ],
      [
        "chimney",
        "Chemin\xE9e",
        "\u{1F3ED}"
      ],
      [
        "crate",
        "Caisses",
        "\u{1F4E6}"
      ],
      [
        "barrel",
        "Barils",
        "\u{1F6E2}"
      ],
      [
        "crane",
        "Grue",
        "\u{1F3D7}"
      ],
      [
        "warnLight",
        "Gyrophare",
        "\u{1F6A8}"
      ]
    ]
  ],
  [
    "space",
    "Espace",
    [
      [
        "satellite",
        "Satellite",
        "\u{1F6F0}"
      ],
      [
        "asteroid",
        "Ast\xE9ro\xEFde",
        "\u2604"
      ],
      [
        "antenna",
        "Antenne",
        "\u{1F4E1}"
      ],
      [
        "rocket",
        "Fus\xE9e",
        "\u{1F680}"
      ],
      [
        "planetMini",
        "Plan\xE8te miniature",
        "\u{1FA90}"
      ]
    ]
  ],
  [
    "race",
    "Circuit",
    [
      [
        "trafficCone",
        "Plot",
        "\u{1F6A7}"
      ],
      [
        "tireStack",
        "Pile de pneus",
        "\u2B55"
      ],
      [
        "flagPole",
        "Drapeau \xE0 damier",
        "\u{1F3C1}"
      ],
      [
        "grandstand",
        "Tribune",
        "\u{1F3DF}"
      ]
    ]
  ],
  [
    "lights",
    "Lumi\xE8res",
    [
      [
        "searchlight",
        "Projecteur tournant",
        "\u{1F526}"
      ],
      [
        "spotlight",
        "Projecteur",
        "\u{1F4A1}"
      ],
      [
        "lanternPost",
        "Lanterne sur pied",
        "\u{1F3EE}"
      ],
      [
        "lanternHang",
        "Lanterne suspendue",
        "\u{1F3EE}"
      ],
      [
        "streetLamp",
        "Lampadaire",
        "\u{1F6E3}"
      ]
    ]
  ],
  [
    "vehicles",
    "V\xE9hicules",
    [
      [
        "plane",
        "Avion de ligne",
        "\u2708"
      ],
      [
        "biplane",
        "Avion \xE0 h\xE9lice",
        "\u{1F6E9}"
      ],
      [
        "helicopter",
        "H\xE9licopt\xE8re",
        "\u{1F681}"
      ],
      [
        "bus",
        "Bus",
        "\u{1F68C}"
      ],
      [
        "truck",
        "Camion",
        "\u{1F69A}"
      ],
      [
        "locomotive",
        "Locomotive",
        "\u{1F682}"
      ],
      [
        "sedan",
        "Voiture",
        "\u{1F697}"
      ],
      [
        "ufo",
        "Soucoupe",
        "\u{1F6F8}"
      ],
      [
        "sailboat",
        "Voilier",
        "\u26F5"
      ]
    ]
  ],
  [
    "xmas",
    "No\xEBl",
    [
      [
        "xmasTree",
        "Sapin de No\xEBl",
        "\u{1F384}"
      ],
      [
        "snowman",
        "Bonhomme de neige",
        "\u26C4"
      ],
      [
        "gift",
        "Cadeau",
        "\u{1F381}"
      ],
      [
        "candyCane",
        "Sucre d\u2019orge",
        "\u{1F36D}"
      ],
      [
        "xmasStar",
        "\xC9toile",
        "\u2B50"
      ],
      [
        "wreath",
        "Couronne",
        "\u{1F38D}"
      ],
      [
        "sleigh",
        "Tra\xEEneau",
        "\u{1F6F7}"
      ],
      [
        "reindeer",
        "Renne",
        "\u{1F98C}"
      ],
      [
        "gingerHouse",
        "Maison en pain d\u2019\xE9pices",
        "\u{1F36A}"
      ]
    ]
  ],
  [
    "halloween",
    "Halloween",
    [
      [
        "pumpkin",
        "Citrouille",
        "\u{1F383}"
      ],
      [
        "ghost",
        "Fant\xF4me",
        "\u{1F47B}"
      ],
      [
        "tombstone",
        "Pierre tombale",
        "\u{1FAA6}"
      ],
      [
        "bats",
        "Chauves-souris",
        "\u{1F987}"
      ],
      [
        "witchHat",
        "Chapeau de sorci\xE8re",
        "\u{1F9D9}"
      ],
      [
        "cauldron",
        "Chaudron",
        "\u{1FAD5}"
      ],
      [
        "spookyTree",
        "Arbre mort",
        "\u{1F333}"
      ],
      [
        "hauntedHouse",
        "Maison hant\xE9e",
        "\u{1F3DA}"
      ],
      [
        "skull",
        "Cr\xE2ne",
        "\u{1F480}"
      ]
    ]
  ],
  [
    "obstacles",
    "Obstacles",
    [
      [
        "spikes",
        "Piques",
        "\u{1F531}"
      ],
      [
        "spikesPop",
        "Piques escamotables",
        "\u23EB"
      ],
      [
        "pendulum",
        "Boule balancier",
        "\u{1F534}"
      ],
      [
        "hammer",
        "Marteau tournant",
        "\u{1F528}"
      ],
      [
        "slider",
        "Mur coulissant",
        "\u2194"
      ],
      [
        "sweeper",
        "Balayeur",
        "\u{1F300}"
      ],
      [
        "bumper",
        "Bumper",
        "\u{1F7E3}"
      ]
    ]
  ],
  [
    "secret",
    "Secrets",
    [
      [
        "shard",
        "\xC9clat secret",
        "\u2726"
      ]
    ],
    {
      hidden: true
    }
  ],
  [
    "custom",
    "Mes pi\xE8ces",
    [
      [
        "custom",
        "Pi\xE8ce perso",
        "\u2726"
      ]
    ],
    {
      hidden: true
    }
  ]
];
var DECO_CATS = {};
var DECO_LABELS = {};
var DECO_ICONS = {};
for (const [key2, title, items, opts2 = {}] of [
  ...BASE,
  ...PACK
]) {
  if (!opts2.hidden && !DECO_CATS[key2]) DECO_CATS[key2] = {
    label: title,
    kinds: []
  };
  for (const [id, name, icon] of items) {
    if (!opts2.hidden) DECO_CATS[key2].kinds.push(id);
    DECO_LABELS[id] = name;
    DECO_ICONS[id] = icon;
  }
}

// js/customDeco.js
var MAX_DECO_PARTS = 12;
var MAX_CUSTOM_DECOS = 10;
var DECO_SHAPES = [
  "box",
  "sphere",
  "cyl",
  "cone",
  "wedge",
  "ring"
];
var HEX = /^#[0-9a-f]{6}$/i;
var num = (v, lo, hi, def, step) => {
  let n = Number(v);
  if (!Number.isFinite(n)) n = def;
  n = Math.min(hi, Math.max(lo, n));
  return Number((Math.round(n / step) * step).toFixed(3));
};
function sanitizeDecoPart(p) {
  if (!p || typeof p !== "object" || !DECO_SHAPES.includes(p.s)) return null;
  return {
    s: p.s,
    x: num(p.x, -8, 8, 0, 0.1),
    y: num(p.y, 0, 12, 1, 0.1),
    z: num(p.z, -8, 8, 0, 0.1),
    sx: num(p.sx, 0.1, 8, 1, 0.1),
    sy: num(p.sy, 0.1, 10, 1, 0.1),
    sz: num(p.sz, 0.1, 8, 1, 0.1),
    ry: num(p.ry, 0, 345, 0, 15),
    c: typeof p.c === "string" && HEX.test(p.c) ? p.c.toLowerCase() : "#c0c6e0",
    g: p.g ? 1 : 0
  };
}
var sanitizeDecoParts = (list) => Array.isArray(list) ? list.slice(0, MAX_DECO_PARTS).map(sanitizeDecoPart).filter(Boolean) : [];
var packDecoParts = (parts) => sanitizeDecoParts(parts).map((p) => [
  DECO_SHAPES.indexOf(p.s),
  p.x,
  p.y,
  p.z,
  p.sx,
  p.sy,
  p.sz,
  p.ry / 15,
  p.c.slice(1),
  p.g
]);
var unpackDecoParts = (arr) => sanitizeDecoParts(Array.isArray(arr) ? arr.slice(0, MAX_DECO_PARTS).map((a) => Array.isArray(a) ? {
  s: DECO_SHAPES[a[0]],
  x: a[1],
  y: a[2],
  z: a[3],
  sx: a[4],
  sy: a[5],
  sz: a[6],
  ry: (+a[7] || 0) * 15,
  c: "#" + a[8],
  g: a[9]
} : null) : []);

// js/themes.js
var DECORS = {
  desert: {
    label: "D\xE9sert cr\xE9puscule",
    chip: "#ff8c5a"
  },
  polar: {
    label: "Nuit polaire",
    chip: "#7fe9ff",
    darkGround: true
  },
  jungle: {
    label: "Jungle n\xE9on",
    chip: "#2dffb0",
    darkGround: true
  },
  city: {
    label: "Ville futuriste",
    chip: "#ff3d8a",
    darkGround: true
  },
  isles: {
    label: "Archipel tropical",
    chip: "#ffd66b"
  },
  volcano: {
    label: "Volcan",
    chip: "#ff5a2a"
  },
  orbit: {
    label: "Station orbitale",
    chip: "#b9a6ff"
  },
  caves: {
    label: "Canyon de cristal",
    chip: "#b48cff"
  },
  sky: {
    label: "Ville dans les nuages",
    chip: "#9fd8ff"
  },
  reef: {
    label: "Fonds marins",
    chip: "#2fd3b5"
  },
  factory: {
    label: "Usine m\xE9canique",
    chip: "#ffb070"
  },
  atelier: {
    label: "Atelier des m\xE9canismes",
    chip: "#ffd23e"
  }
};
var DEFAULT_DECOR = "desert";
var CAREER_ORDER = [
  "desert",
  "jungle",
  "isles",
  "city",
  "polar",
  "volcano",
  "orbit",
  "reef",
  "factory",
  "sky",
  "caves",
  "atelier"
];
var DAILY_DECORS = Object.keys(DECORS).slice(0, 11);

// js/ambiance.js
var SKY_CHOICES = [
  [
    "",
    "Selon le d\xE9cor"
  ],
  [
    "dawn",
    "Aube"
  ],
  [
    "day",
    "Plein jour"
  ],
  [
    "sunset",
    "Coucher de soleil"
  ],
  [
    "night",
    "Nuit"
  ]
];
var FOG_CHOICES = [
  [
    "",
    "Selon le d\xE9cor"
  ],
  [
    "clear",
    "D\xE9gag\xE9"
  ],
  [
    "misty",
    "Brumeux"
  ],
  [
    "thick",
    "\xC9pais"
  ]
];
var MUSIC_CHOICES = [
  [
    "",
    "Chill de course"
  ],
  [
    "menu",
    "Groove du menu"
  ],
  [
    "none",
    "Aucune"
  ]
];
var SKIES = SKY_CHOICES.map(([k]) => k).filter(Boolean);
var FOGS = FOG_CHOICES.map(([k]) => k).filter(Boolean);
var MUSICS = MUSIC_CHOICES.map(([k]) => k).filter(Boolean);
var WEATHER_CHOICES = [
  [
    "",
    "Aucune"
  ],
  [
    "rain",
    "Pluie"
  ],
  [
    "snow",
    "Neige"
  ],
  [
    "embers",
    "Braises"
  ],
  [
    "dust",
    "Poussi\xE8re"
  ],
  [
    "petals",
    "P\xE9tales"
  ]
];
var CYCLE_CHOICES = [
  [
    "",
    "Heure fixe"
  ],
  [
    "slow",
    "Journ\xE9e lente (2 min)"
  ],
  [
    "fast",
    "Journ\xE9e rapide (50 s)"
  ]
];
var WEATHERS = WEATHER_CHOICES.map(([k]) => k).filter(Boolean);
var CYCLES = CYCLE_CHOICES.map(([k]) => k).filter(Boolean);
var HEXC = /^#[0-9a-f]{6}$/i;
var DEFAULT_AMBIANCE = Object.freeze({
  sky: "",
  fog: "",
  music: "",
  weather: "",
  sunAz: -1,
  tint: "",
  gtint: "",
  fogC: "",
  cycle: ""
});
var isDefaultAmbiance = (a) => !a || !a.sky && !a.fog && !a.music && !a.weather && !(a.sunAz >= 0) && !a.tint && !a.gtint && !a.fogC && !a.cycle;
function cleanAmbiance(a) {
  const o = a && typeof a === "object" ? a : {};
  const az = Number(o.sunAz);
  return {
    sky: SKIES.includes(o.sky) ? o.sky : "",
    fog: FOGS.includes(o.fog) ? o.fog : "",
    music: MUSICS.includes(o.music) ? o.music : "",
    weather: WEATHERS.includes(o.weather) ? o.weather : "",
    sunAz: Number.isFinite(az) && az >= 0 ? Math.round(Math.min(345, az) / 15) * 15 : -1,
    tint: HEXC.test(o.tint || "") ? o.tint.toLowerCase() : "",
    gtint: HEXC.test(o.gtint || "") ? o.gtint.toLowerCase() : "",
    fogC: HEXC.test(o.fogC || "") ? o.fogC.toLowerCase() : "",
    cycle: CYCLES.includes(o.cycle) ? o.cycle : ""
  };
}
function ambianceToArray(a) {
  if (isDefaultAmbiance(a)) return null;
  const base = [
    a.sky || "",
    a.fog || "",
    a.music || ""
  ];
  if (!a.weather && !(a.sunAz >= 0) && !a.tint && !a.gtint && !a.fogC && !a.cycle) return base;
  return [
    ...base,
    a.weather || "",
    a.sunAz >= 0 ? a.sunAz : -1,
    a.tint ? a.tint.slice(1) : "",
    a.gtint ? a.gtint.slice(1) : "",
    a.fogC ? a.fogC.slice(1) : "",
    a.cycle || ""
  ];
}
var ambianceFromArray = (arr) => Array.isArray(arr) ? cleanAmbiance({
  sky: arr[0],
  fog: arr[1],
  music: arr[2],
  weather: arr[3],
  sunAz: arr[4],
  tint: arr[5] ? "#" + arr[5] : "",
  gtint: arr[6] ? "#" + arr[6] : "",
  fogC: arr[7] ? "#" + arr[7] : "",
  cycle: arr[8]
}) : {
  ...DEFAULT_AMBIANCE
};

// js/scripts.js
var MAX_SCRIPTS = 16;
var SCRIPT_SOUNDS = [
  [
    "ding",
    "Ding"
  ],
  [
    "whoosh",
    "Souffle"
  ],
  [
    "horn",
    "Klaxon"
  ],
  [
    "boost",
    "Turbo"
  ],
  [
    "bounce",
    "Rebond"
  ]
];
var opts = (list, none) => list.filter(([k]) => k || none);
var SCRIPT_ACTIONS = [
  [
    "msg",
    "Afficher un message",
    null
  ],
  [
    "sky",
    "Changer le moment de la journ\xE9e",
    opts(SKY_CHOICES, true)
  ],
  [
    "weather",
    "Changer la m\xE9t\xE9o",
    opts(WEATHER_CHOICES, true)
  ],
  [
    "fog",
    "Changer la brume",
    opts(FOG_CHOICES, true)
  ],
  [
    "music",
    "Changer la musique",
    [
      [
        "",
        "Chill de course"
      ],
      [
        "menu",
        "Groove du menu"
      ],
      [
        "none",
        "Silence"
      ]
    ]
  ],
  [
    "burst",
    "Lancer un \xE9clat de couleur",
    "color"
  ],
  [
    "shake",
    "Secouer la cam\xE9ra",
    [
      [
        "1",
        "L\xE9g\xE8rement"
      ],
      [
        "2",
        "Fort"
      ]
    ]
  ],
  [
    "sound",
    "Jouer un son",
    SCRIPT_SOUNDS
  ]
];
var IDS = SCRIPT_ACTIONS.map(([id]) => id);
var choicesOf = (id) => {
  const c = SCRIPT_ACTIONS.find((a) => a[0] === id)[2];
  return Array.isArray(c) ? c.map(([k]) => k) : null;
};
var HEX2 = /^#[0-9a-f]{6}$/i;
var cell = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(-500, Math.min(500, n)) : 0;
};
function sanitizeScript(s) {
  if (!s || typeof s !== "object" || !IDS.includes(s.a)) return null;
  const ch = choicesOf(s.a);
  let v = String(s.v == null ? "" : s.v);
  if (s.a === "msg") v = v.replace(/[^\p{L}\p{N} _'’.,!?:;()+\-×÷%/]/gu, "").trim().slice(0, 40);
  else if (s.a === "burst") v = HEX2.test(v) ? v.toLowerCase() : "#ffd23e";
  else if (!ch.includes(v)) v = ch[0] === void 0 ? "" : s.a === "shake" || s.a === "sound" ? ch[0] : "";
  if (s.a === "msg" && !v) return null;
  return {
    x: cell(s.x),
    z: cell(s.z),
    a: s.a,
    v
  };
}
var sanitizeScripts = (list) => Array.isArray(list) ? list.slice(0, MAX_SCRIPTS).map(sanitizeScript).filter(Boolean) : [];
var scriptsToArray = (list) => {
  const l = sanitizeScripts(list);
  return l.length ? l.map((s) => [
    s.x,
    s.z,
    IDS.indexOf(s.a),
    s.v
  ]) : null;
};
var scriptsFromArray = (arr) => sanitizeScripts(Array.isArray(arr) ? arr.slice(0, MAX_SCRIPTS).map((a) => Array.isArray(a) ? {
  x: a[0],
  z: a[1],
  a: IDS[a[2]],
  v: a[3]
} : null) : []);

// js/track/shared.js
var WATER_DROP = 0.35;
var boatDrop = (along) => WATER_DROP * (1 - Math.max(0, Math.min(1, along || 0)));
var COLOR_KEYS = [
  "road",
  "line",
  "rail"
];
var HEX3 = /^#[0-9a-f]{6}$/i;
function cleanColors(c) {
  if (!c || typeof c !== "object") return null;
  const out = {};
  for (const k of COLOR_KEYS) if (typeof c[k] === "string" && HEX3.test(c[k])) out[k] = c[k].toLowerCase();
  return Object.keys(out).length ? out : null;
}
var W = {
  x: 0,
  z: 0
};
var W2 = {
  x: 0,
  z: 0
};
var MP = {};

// js/track/surfaces.js
var L = {
  lx: 0,
  lz: 0
};
var S = {};
var MO = {};
var surfaceMethods = {
  // Gravité inversée : surface « au plafond » la plus proche au-dessus de (x, y - step, z),
  // venant des pièces posées à l'envers (géométrie retournée autour de leur niveau).
  // Sans plafond, h vaut +∞ (la voiture continue de « tomber » vers le haut).
  ceilingSurfaceAt(x, y, z, out, step = 1.6, broken = null) {
    out.h = Infinity;
    out.nx = 0;
    out.ny = -1;
    out.nz = 0;
    out.tile = null;
    out.type = "none";
    out.mod = "";
    out.p = 0;
    out.lx = 0;
    out.lz = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (const tile of this.tilesAt(cx, cz)) {
      if (!isCeilingFloor(tile)) continue;
      if (broken && broken.has(tile)) continue;
      toLocal(tile, x, z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint) continue;
      if (PIECES[tile.t].kind !== "area" && Math.abs(S.d) > ROAD_HALF) continue;
      const base = baseY(tile);
      const h = 2 * base - S.h;
      if (h < y - step || h >= out.h) continue;
      out.h = h;
      rotVec(tile.r, S.nx, S.nz, W);
      out.nx = W.x;
      out.ny = -S.ny;
      out.nz = W.z;
      out.tile = tile;
      out.type = "road";
      out.mod = tile.s || "";
      out.p = tile.p || 0;
      out.lx = L.lx;
      out.lz = L.lz;
      if (tile.s === "water") out.h += WATER_DROP;
      else if (tile.s === "boat" && (PIECES[tile.t].kind === "line" || PIECES[tile.t].kind === "arc")) out.h += boatDrop(S.along);
    }
    return out;
  },
  // Surface roulable la plus haute sous (x, y + step, z). Le sol est à y = 0.
  // Les pièces mobiles (ascenseur, glissière, rotation) sont prises à leur position au chrono `time` (s) de la course : le circuit n'a
  // pas d'horloge propre, plusieurs voitures (la sienne, un fantôme, un adversaire) l'interrogent chacune à son propre chrono.
  // broken : pièces de verre déjà brisées dans CETTE course (propre à chaque voiture, voir CarPhysics) : sans collision.
  surfaceAt(x, y, z, out, step = 1.6, broken = null, time = 0) {
    out.h = 0;
    out.nx = 0;
    out.ny = 1;
    out.nz = 0;
    out.tile = null;
    out.type = "ground";
    out.mod = "";
    out.p = 0;
    out.lx = 0;
    out.lz = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -Infinity;
    const cell2 = this.tilesAt(cx, cz);
    for (let i = 0; i < cell2.length; i++) {
      const tile = cell2[i];
      if (tile.mv || !isFloor(tile) || broken && broken.has(tile)) continue;
      best = this._floorTry(tile, x, z, 0, y, step, best, out);
    }
    if (this.hasMovers) {
      for (let i = 0; i < cell2.length; i++) {
        const tile = cell2[i];
        if (!tile.mv || !isFloor(tile) || broken && broken.has(tile)) continue;
        this.moverOffset(tile, time, MO);
        if (MO.a) {
          this.moverLocal(MO, x, z, W2);
          best = this._floorTry(tile, W2.x, W2.z, MO.y, y, step, best, out, MO.a);
        } else best = this._floorTry(tile, x - MO.x, z - MO.z, MO.y, y, step, best, out);
      }
    }
    return out;
  },
  _floorTry(tile, x, z, oy, y, step, best, out, a = 0) {
    toLocal(tile, x, z, L);
    sampleLocal(tile, L.lx, L.lz, S);
    if (!S.inFootprint) return best;
    const p = PIECES[tile.t];
    if (p.kind !== "area" && Math.abs(S.d) > ROAD_HALF) return best;
    const h = S.h + oy;
    if (h > y + step || h <= best) return best;
    out.h = h;
    rotVec(tile.r, S.nx, S.nz, W);
    out.nx = W.x;
    out.ny = S.ny;
    out.nz = W.z;
    if (a) {
      const c = dcos(a), sn = dsin(a);
      out.nx = c * W.x + sn * W.z;
      out.nz = -sn * W.x + c * W.z;
    }
    out.tile = tile;
    out.type = "road";
    let sf = tile.s, sp = tile.p;
    if (p.kind === "fork" && S.branch === 1 && tile.s2) {
      sf = tile.s2 === "-" ? "" : tile.s2;
      sp = tile.s2 === "-" ? 0 : tile.p2;
    }
    out.mod = sf || "";
    out.p = sp || 0;
    out.lx = L.lx;
    out.lz = L.lz;
    if (sf === "water") out.h -= WATER_DROP;
    else if (sf === "boat" && (p.kind === "line" || p.kind === "arc")) out.h -= boatDrop(S.along);
    return out.h;
  },
  // Pièces en mouvement : 1 = ascenseur (monte puis redescend), 2 = glissière (se décale sur son côté droit et revient),
  // 3 = rotation (tourne autour de son centre, tour complet ou va-et-vient). Vitesse et amplitude réglables (voir MOVER).
  // Le mouvement ne dépend que du chrono de la course. out : décalage (x, y, z) et vitesse (vx, vy, vz) ;
  // pour une rotation : a (angle, rad), w (vitesse angulaire, rad/s) et le pivot (cx, cz).
  moverOffset(tile, t, out) {
    const M = MOVER[tile.mv];
    const mp = moverParams(tile, MP);
    const sp = mp.speed / 100, P = M.period / Math.abs(sp), w = Math.PI * 2 / P;
    const k = (1 - dcos(w * t)) / 2, dk = dsin(w * t) * w / 2;
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.vx = 0;
    out.vy = 0;
    out.vz = 0;
    out.a = 0;
    out.w = 0;
    out.cx = 0;
    out.cz = 0;
    if (tile.mv === 1) {
      out.y = mp.amp * LEVEL_H * k;
      out.vy = mp.amp * LEVEL_H * dk;
    } else if (tile.mv === 2) {
      rotVec(tile.r, 1, 0, W2);
      out.x = W2.x * CELL * mp.amp * k;
      out.z = W2.z * CELL * mp.amp * k;
      out.vx = W2.x * CELL * mp.amp * dk;
      out.vz = W2.z * CELL * mp.amp * dk;
    } else if (tile.mv === 3) {
      const c = tileCenter(tile, W2);
      out.cx = c.x;
      out.cz = c.z;
      const sg = sp < 0 ? -1 : 1;
      if (mp.amp >= 360) {
        out.a = sg * w * t;
        out.w = sg * w;
      } else {
        const A2 = mp.amp * Math.PI / 180;
        out.a = sg * A2 * k;
        out.w = sg * A2 * dk;
      }
    }
    return out;
  },
  // Monde -> repère de la pièce mobile « au repos » (annule le décalage et la rotation) : sert à interroger sa géométrie.
  moverLocal(o, x, z, out) {
    x -= o.x;
    z -= o.z;
    if (o.a) {
      const dx = x - o.cx, dz = z - o.cz, c = dcos(o.a), s = dsin(o.a);
      x = o.cx + c * dx - s * dz;
      z = o.cz + s * dx + c * dz;
    }
    out.x = x;
    out.z = z;
    return out;
  },
  // Dessous de dalle (ou toit de tunnel) le plus bas au-dessus de yMin : sert à la caméra.
  ceilingAt(x, z, yMin) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (const tile of this.tilesAt(cx, cz)) {
      const kind = PIECES[tile.t].kind;
      if (kind === "loop" || kind === "ribbon" || tile.v || tile.o) continue;
      toLocal(tile, x, z, L);
      sampleLocal(tile, L.lx, L.lz, S);
      if (!S.inFootprint) continue;
      if (kind !== "area" && Math.abs(S.d) > ROAD_HALF + RAIL_W + 0.5) continue;
      const under = tile.tn ? S.h + ROAD_HALF + RAIL_W + 0.9 : S.h - SLAB_T;
      if (under > yMin && under < best) best = under;
    }
    return best;
  }
};

// js/track/edit.js
var editMethods = {
  // Revêtement (avec paramètre en %). Renvoie true si quelque chose a changé.
  setSurface(tile, s, p = 0) {
    if (!surfaceAllowed(tile.t, s, tile.o)) return false;
    const S22 = SURFACES[s];
    const np = S22 && S22.def != null ? Math.max(S22.min, Math.min(S22.max, p || S22.def)) : 0;
    if (tile.s === s && (tile.p || 0) === np) return false;
    tile.s = s;
    tile.p = np;
    this.version++;
    return true;
  },
  // Bascule un drapeau (v : à l'envers, nb : sans bordures, tn : tunnel, mv : mouvement 1/2/3, cp : checkpoint 1/2, th : thème).
  toggleFlag(tile, flag, val = 1) {
    if (flag === "o") {
      const target = val | 0;
      if (target && !flagAllowed(tile.t, "o", null, target)) return false;
      const cand = {
        ...tile
      };
      if (!target || tile.o === target) {
        cand.o = 0;
        if (!target) cand.v = 0;
      } else {
        cand.o = target;
        clearConflicts(cand, "o");
      }
      return this._reshape(tile, cand);
    }
    if (!flagAllowed(tile.t, flag, tile, val)) return false;
    if (flag === "th") {
      const th = tile.th === val ? 0 : val;
      if (!THEMES.some((h) => h.id === th)) return false;
      tile.th = th;
      this.version++;
      return true;
    }
    if (flag === "mv" || flag === "cp" || flag === "tb" || flag === "v") {
      const cand = {
        ...tile
      };
      if (flag === "mv") {
        cand.mv = tile.mv === val ? 0 : val;
        cand.ms = 0;
        cand.ma = 0;
      } else if (flag === "cp") {
        cand.cp = tile.cp === val ? 0 : val;
      } else if (flag === "tb") {
        cand.tb = tile.tb ? 0 : 1;
      } else if (tile.v) cand.v = 0;
      else {
        cand.v = 1;
        clearConflicts(cand, "v");
      }
      return this._reshape(tile, cand);
    }
    tile[flag] = tile[flag] ? 0 : 1;
    this.version++;
    return true;
  },
  // Remplace `tile` par `cand` (normalisée : options devenues impossibles retirées, revêtement incompatible effacé) si la place et les niveaux
  // le permettent ; sinon rien ne change. Même objet : la sélection de l'inspecteur reste valable.
  _reshape(tile, cand) {
    const n = Track.normalize(cand);
    this.remove(tile);
    if (this.conflicts(n).length || !Track.inBounds(n)) {
      this._insert(tile);
      return false;
    }
    Object.assign(tile, n);
    this._insert(tile);
    return true;
  },
  // Réglage d'une pièce mobile (vitesse en %, amplitude). Change les cases / niveaux balayés : vérifie la place.
  setMover(tile, ms, ma) {
    if (!tile.mv) return false;
    const m = clampMover(tile.mv, ms === void 0 ? tile.ms : ms, ma === void 0 ? tile.ma : ma);
    if (m.ms === (tile.ms || 0) && m.ma === (tile.ma || 0)) return true;
    const cand = {
      ...tile,
      ms: m.ms,
      ma: m.ma
    };
    this.remove(tile);
    if (this.conflicts(cand).length || !Track.inBounds(cand)) {
      this._insert(tile);
      return false;
    }
    tile.ms = m.ms;
    tile.ma = m.ma;
    this._insert(tile);
    return true;
  },
  // Couleurs personnalisées { road, line, rail } (null / {} : couleurs d'origine).
  setColors(tile, col) {
    tile.col = cleanColors(col);
    this.version++;
    return true;
  },
  // 2e revêtement d'une bifurcation (voie déportée).
  setSurface2(tile, s, p = 0) {
    if (PIECES[tile.t].kind !== "fork") return false;
    if (s && s !== "-" && !surfaceAllowed(tile.t, s, tile.o)) return false;
    const S22 = SURFACES[s];
    const np = S22 && S22.def != null ? Math.max(S22.min, Math.min(S22.max, p || S22.def)) : 0;
    if ((tile.s2 || "") === s && (tile.p2 || 0) === np) return false;
    tile.s2 = s;
    tile.p2 = np;
    this.version++;
    return true;
  },
  addDeco(d) {
    if (this.decos.length >= MAX_DECOS) return null;
    const deco = {
      k: d.k,
      x: +d.x,
      y: +d.y,
      z: +d.z,
      ry: +d.ry || 0,
      s: Math.max(0.2, Math.min(20, +d.s || 1)),
      c: d.c | 0,
      u: d.u ? String(d.u).slice(0, 400) : ""
    };
    const g = Math.max(0, Math.min(63, d.g | 0));
    if (g) deco.g = g;
    if (isObstacle(deco.k)) {
      deco.ph = Math.max(0, Math.min(0.95, Math.round((+d.ph || 0) * 20) / 20));
      deco.s = Math.max(0.5, Math.min(2.5, deco.s));
    }
    if (!DECO_ORDER.includes(deco.k)) return null;
    if (typeof d.cc === "string" && HEX3.test(d.cc)) deco.cc = d.cc.toLowerCase();
    if (deco.k === "custom") {
      deco.cp = sanitizeDecoParts(d.cp);
      if (!deco.cp.length || this.decos.filter((o) => o.k === "custom").length >= MAX_CUSTOM_DECOS) return null;
    }
    this.decos.push(deco);
    this.version++;
    return deco;
  },
  removeDeco(d) {
    const i = this.decos.indexOf(d);
    if (i < 0) return;
    this.decos.splice(i, 1);
    this.version++;
  }
};

// js/sim/logic.js
var LOGIC_MAX = {
  rules: 32,
  conds: 8,
  acts: 8,
  vars: 4
};
var LOGIC_EVENTS = [
  "start",
  "cp",
  "lap",
  "time",
  "zone",
  "veh"
];
var LOGIC_CONDS = [
  "cps",
  "lap",
  "var",
  "veh",
  "shown",
  "hidden"
];
var LOGIC_ACTS = [
  "show",
  "hide",
  "toggle",
  "grav",
  "var",
  "fx"
];
var LOGIC_OPS = [
  "==",
  "!=",
  ">=",
  "<=",
  ">",
  "<"
];
var VEHS = [
  "car",
  "moto",
  "boat",
  "glider"
];
var int = (v, lo, hi) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};
var grp = (v) => int(v, 1, 63);
function cleanEvent(o) {
  if (!Array.isArray(o) || !LOGIC_EVENTS.includes(o[0])) return null;
  switch (o[0]) {
    case "start":
      return [
        "start"
      ];
    case "cp":
      return [
        "cp",
        int(o[1], 0, 999)
      ];
    case "lap":
      return [
        "lap",
        int(o[1], 1, 99)
      ];
    case "time":
      return [
        "time",
        int(o[1], 1, 120 * 900)
      ];
    case "zone":
      return [
        "zone",
        grp(o[1])
      ];
    case "veh":
      return VEHS.includes(o[1]) ? [
        "veh",
        o[1]
      ] : null;
    default:
      return null;
  }
}
function cleanCond(c) {
  if (!Array.isArray(c) || !LOGIC_CONDS.includes(c[0])) return null;
  const op = (x) => LOGIC_OPS.includes(x) ? x : "==";
  switch (c[0]) {
    case "cps":
      return [
        "cps",
        op(c[1]),
        int(c[2], 0, 999)
      ];
    case "lap":
      return [
        "lap",
        op(c[1]),
        int(c[2], 1, 99)
      ];
    case "var":
      return [
        "var",
        int(c[1], 0, LOGIC_MAX.vars - 1),
        op(c[2]),
        int(c[3], -999, 999)
      ];
    case "veh":
      return VEHS.includes(c[1]) ? [
        "veh",
        c[1]
      ] : null;
    case "shown":
    case "hidden":
      return [
        c[0],
        grp(c[1])
      ];
    default:
      return null;
  }
}
function cleanAct(a) {
  if (!Array.isArray(a) || !LOGIC_ACTS.includes(a[0])) return null;
  switch (a[0]) {
    case "show":
    case "hide":
    case "toggle":
      return [
        a[0],
        grp(a[1])
      ];
    case "grav":
      return [
        "grav",
        int(a[1], 15, 250)
      ];
    case "var":
      return [
        "var",
        int(a[1], 0, LOGIC_MAX.vars - 1),
        [
          "=",
          "+",
          "-"
        ].includes(a[2]) ? a[2] : "=",
        int(a[3], -999, 999)
      ];
    case "fx": {
      const s = sanitizeScript({
        x: 0,
        z: 0,
        a: a[1],
        v: a[2]
      });
      return s ? [
        "fx",
        s.a,
        s.v
      ] : null;
    }
    default:
      return null;
  }
}
function sanitizeLogic(lg) {
  if (!lg || typeof lg !== "object" || !Array.isArray(lg.rules)) return null;
  const rules = [];
  for (const r of lg.rules.slice(0, LOGIC_MAX.rules)) {
    if (!r || typeof r !== "object") continue;
    const on = cleanEvent(r.on);
    const acts = (Array.isArray(r.do) ? r.do : []).slice(0, LOGIC_MAX.acts).map(cleanAct).filter(Boolean);
    if (!on || !acts.length) continue;
    const conds = (Array.isArray(r.if) ? r.if : []).slice(0, LOGIC_MAX.conds).map(cleanCond).filter(Boolean);
    rules.push({
      on,
      if: conds,
      do: acts,
      once: !!r.once
    });
  }
  if (!rules.length) return null;
  const off = [
    ...new Set((Array.isArray(lg.off) ? lg.off : []).map(grp))
  ].sort((a, b) => a - b);
  return {
    v: 1,
    off,
    vars: int(lg.vars, 0, LOGIC_MAX.vars),
    rules
  };
}
var logicToArray = (lg) => {
  const L4 = sanitizeLogic(lg);
  return L4 ? [
    L4.off,
    L4.vars,
    L4.rules.map((r) => [
      r.on,
      r.if,
      r.do,
      r.once ? 1 : 0
    ])
  ] : null;
};
var logicFromArray = (a) => Array.isArray(a) ? sanitizeLogic({
  off: a[0],
  vars: a[1],
  rules: (Array.isArray(a[2]) ? a[2] : []).map((r) => Array.isArray(r) ? {
    on: r[0],
    if: r[1],
    do: r[2],
    once: !!r[3]
  } : null)
}) : null;
var logicSig = (lg) => {
  const a = logicToArray(lg);
  return a ? JSON.stringify(a) : "";
};
var cmp = (a, op, b) => op === "==" ? a === b : op === "!=" ? a !== b : op === ">=" ? a >= b : op === "<=" ? a <= b : op === ">" ? a > b : a < b;
function createLogic(track, phys, race) {
  const L4 = sanitizeLogic(track.lg);
  if (!L4) return null;
  const tilesOf = /* @__PURE__ */ new Map(), decosOf = /* @__PURE__ */ new Map();
  for (const t of track.tiles) if (t.g) {
    if (!tilesOf.has(t.g)) tilesOf.set(t.g, []);
    tilesOf.get(t.g).push(t);
  }
  for (const d of track.decos) if (d.g) {
    if (!decosOf.has(d.g)) decosOf.set(d.g, []);
    decosOf.get(d.g).push(d);
  }
  const hiddenTiles = /* @__PURE__ */ new Set(), hiddenDecos = /* @__PURE__ */ new Set();
  const st = {
    hidden: /* @__PURE__ */ new Set(),
    vars: new Int16Array(LOGIC_MAX.vars),
    fired: new Uint8Array(L4.rules.length),
    zone: 0,
    veh: "",
    started: false,
    ver: 0
  };
  const fx = [];
  const log = [];
  let debug = false;
  const apply = () => {
    hiddenTiles.clear();
    hiddenDecos.clear();
    for (const g of st.hidden) {
      for (const t of tilesOf.get(g) || []) hiddenTiles.add(t);
      for (const d of decosOf.get(g) || []) hiddenDecos.add(d);
    }
    st.ver++;
  };
  phys.setLogicExclusion(hiddenTiles, hiddenDecos);
  race.excluded = hiddenTiles;
  const condOk = (c) => {
    switch (c[0]) {
      case "cps":
        return cmp(race.splits.length, c[1], c[2]);
      case "lap":
        return cmp(race.lap, c[1], c[2]);
      case "var":
        return cmp(st.vars[c[1]], c[2], c[3]);
      case "veh":
        return phys.vehicle === c[1];
      case "shown":
        return !st.hidden.has(c[1]);
      case "hidden":
        return st.hidden.has(c[1]);
      default:
        return false;
    }
  };
  const run = (r, i) => {
    if (r.once && st.fired[i]) return;
    for (const c of r.if) if (!condOk(c)) return;
    st.fired[i] = 1;
    if (debug && log.length < 32) log.push(i);
    let vis = false;
    for (const a of r.do) {
      switch (a[0]) {
        case "show":
          if (st.hidden.delete(a[1])) vis = true;
          break;
        case "hide":
          if (!st.hidden.has(a[1])) {
            st.hidden.add(a[1]);
            vis = true;
          }
          break;
        case "toggle":
          if (!st.hidden.delete(a[1])) st.hidden.add(a[1]);
          vis = true;
          break;
        case "grav":
          phys.gravMul = a[1] / 100;
          break;
        case "var": {
          const v = a[2] === "=" ? a[3] : a[2] === "+" ? st.vars[a[1]] + a[3] : st.vars[a[1]] - a[3];
          st.vars[a[1]] = Math.max(-999, Math.min(999, v));
          break;
        }
        case "fx":
          if (fx.length < 64) fx.push({
            a: a[1],
            v: a[2]
          });
          break;
        // (seule la course en direct les lit : fantômes et serveur les laissent)
        default:
          break;
      }
    }
    if (vis) apply();
  };
  const fire = (kind, test) => {
    L4.rules.forEach((r, i) => {
      if (r.on[0] === kind && test(r.on)) run(r, i);
    });
  };
  return {
    logic: L4,
    state: st,
    fx,
    log,
    hiddenTiles,
    hiddenDecos,
    setDebug(v) {
      debug = !!v;
    },
    reset() {
      st.hidden = new Set(L4.off);
      st.vars.fill(0);
      st.fired.fill(0);
      st.zone = 0;
      st.veh = "";
      st.started = false;
      fx.length = 0;
      log.length = 0;
      apply();
    },
    snapshot() {
      return {
        hidden: [
          ...st.hidden
        ],
        vars: [
          ...st.vars
        ],
        fired: [
          ...st.fired
        ],
        zone: st.zone,
        veh: st.veh,
        started: st.started
      };
    },
    restore(s) {
      st.hidden = new Set(s.hidden);
      st.vars.set(s.vars);
      st.fired.set(s.fired);
      st.zone = s.zone;
      st.veh = s.veh;
      st.started = s.started;
      apply();
    },
    // Après les règles de course d'un pas (Simulation.score) : ev = l'évènement de course de ce pas (checkpoint, tour, arrivée) ou null.
    onStep(ev) {
      if (race.finished && !(ev && ev.type === "finish")) return;
      if (!st.started) {
        st.started = true;
        st.veh = phys.vehicle;
        fire("start", () => true);
      }
      if (ev && ev.type === "checkpoint") fire("cp", (on) => on[1] === 0 || on[1] === ev.index);
      if (ev && ev.type === "lap") fire("lap", (on) => on[1] === race.lap);
      fire("time", (on) => on[1] === race.steps);
      const zt = phys.rib ? phys.rib.tile : phys.surfTile;
      const z = zt && zt.g ? zt.g : 0;
      if (z !== st.zone) {
        st.zone = z;
        if (z) fire("zone", (on) => on[1] === z);
      }
      if (phys.vehicle !== st.veh) {
        st.veh = phys.vehicle;
        fire("veh", (on) => on[1] === st.veh);
      }
    }
  };
}

// js/mathutil.js
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// js/physics/specs.js
var CAR = {
  accel: 11,
  accelCurve: 1.5,
  maxSpeed: SURF_PHYS.maxSpeed,
  boostSpeed: SURF_PHYS.boostSpeed,
  boostAccel: 10,
  boostTime: 1.2,
  brake: 52,
  reverseAccel: 15,
  reverseMax: 15,
  roll: 0.6,
  drag: 9e-4,
  coast: 2,
  // Châssis (modèle bicyclette)
  a: 1.35,
  b: 1.4,
  yawK: 1.9,
  corner: 230,
  latGrip: 80,
  frontShare: 0.42,
  steerMax: 0.65,
  steerAlat: 52,
  driftRear: 0.65,
  driftSteer: 1.3,
  driftMin: 12,
  driftBrake: 0.75,
  yawDamp: 0.6,
  steerIn: 8,
  steerOut: 13,
  gravity: SURF_PHYS.gravity,
  snap: 0.7,
  step: 1.6,
  magnetRange: 4,
  magnetAcc: 80,
  launch: 0.6,
  airPitchAcc: 4.2,
  airPitchDamp: 2.6,
  airPitchUpK: 1.6,
  airSteer: 1.4,
  airSteerMax: 0.45,
  landOk: 0.38,
  mtTime1: 0.7,
  mtTime2: 1.5,
  flipKick: 7,
  lipHopMin: 2,
  lipHopMax: 4,
  lipHopK: 600,
  bounce: SURF_PHYS.bounce,
  wind: SURF_PHYS.wind,
  spring: SURF_PHYS.spring,
  springHop: 11,
  cutTime: 1,
  shockE: 0.5,
  shockKick: 6,
  // 0.9.4 : un mur se paie. Choc = rebond + perte de vitesse proportionnelle à l'impact + coup de volant forcé + moteur et adhérence
  // réduits un instant (la voiture « encaisse »), et frottement continu tant qu'on racle.
  wallE: 0.35,
  wallLoss: 0.05,
  wallLossMax: 0.65,
  wallScrape: 2,
  wallSpin: 0.14,
  wallSpinMax: 2.5,
  wallStun: 0.04,
  stunTraction: 0.3,
  stunGrip: 0.6,
  radius: 1,
  probe: 1.25,
  height: 1.3
};
var MOTO = {
  ...CAR,
  accel: 10,
  maxSpeed: 90,
  brake: 44,
  a: 1.15,
  b: 1.2,
  yawK: 1.25,
  latGrip: 78,
  frontShare: 0.45,
  steerMax: 0.75,
  steerAlat: 66,
  driftRear: 0.76,
  driftSteer: 1.15,
  steerIn: 9,
  steerOut: 14,
  airPitchAcc: 5.2
};
var BOAT = {
  ...CAR,
  accel: 8,
  maxSpeed: 85,
  brake: 32,
  latGrip: 58,
  frontShare: 0.41,
  steerMax: 0.55,
  steerAlat: 48,
  yawK: 2.1,
  yawDamp: 0.9,
  driftRear: 0.7
};
var GLIDER = {
  ...CAR,
  accel: 8,
  maxSpeed: 90,
  airPitchAcc: 3.4
};
var SPECS = {
  car: CAR,
  moto: MOTO,
  boat: BOAT,
  glider: GLIDER
};
var GLIDE = {
  lift: 0.021,
  liftMaxG: 1.6,
  drag: 9e-4,
  induced: 0.03,
  trim: 0.08,
  up: 0.34,
  down: -0.16,
  turn: 1.7,
  turnSpeed: 9,
  turnRamp: 7
};
var SIDE_AERO = 0.03;
var SIDE_HOLD = 25 / (30 * 30);
var SIDE_MIN_SPEED = 30;
var SIDE_GRACE = 0.3;
var COEF = {
  grip: 1,
  traction: 1,
  vmaxK: 1,
  extraDrag: 0,
  rearK: 1
};
function surfaceCoeffs(mod, f, out = COEF) {
  out.grip = 1;
  out.traction = 1;
  out.vmaxK = 1;
  out.extraDrag = 0;
  out.rearK = 1;
  switch (mod) {
    case "ice":
      out.grip = clamp(0.2 / f, 0.05, 0.85);
      out.traction = 0.45;
      break;
    case "magnet":
      out.grip = 1.6;
      break;
    // Dérive : l'arrière n'accroche presque plus (l'avant, si) : au moindre coup de volant la voiture part en glisse.
    case "drift":
      out.rearK = clamp(0.95 - 0.42 * f, 0.2, 0.85);
      break;
    case "slow":
      out.extraDrag = 14 * f;
      break;
    // Poudreuse : on s'enfonce un peu, l'adhérence est molle et le moteur patine.
    case "powder":
      out.grip = clamp(0.62 / Math.sqrt(f), 0.3, 0.9);
      out.traction = 0.75;
      out.vmaxK = clamp(1 - 0.28 * f, 0.4, 1);
      out.extraDrag = 2.5 * f;
      break;
    default:
      break;
  }
  return out;
}

// js/physics/profiles.js
var PROFILE_IDS = [
  "arcade",
  "sim"
];
var MUL = {
  arcade: {
    latGrip: 1.15,
    yawDamp: 1.45,
    steerOut: 1.3,
    brake: 1.08,
    airPitchAcc: 1.2,
    corner: 1.1
  },
  sim: {
    latGrip: 0.93,
    yawDamp: 0.75,
    corner: 0.82,
    brake: 0.9,
    steerAlat: 0.9
  }
};
var REAR = {
  arcade: (r) => Math.min(0.92, r + 0.12),
  sim: (r) => r
};
var cache2 = /* @__PURE__ */ new Map();
function specsOf(profile) {
  if (!MUL[profile]) return null;
  if (cache2.has(profile)) return cache2.get(profile);
  const out = {};
  for (const [veh, K3] of Object.entries(SPECS)) {
    const k = {
      ...K3
    };
    for (const [f, m] of Object.entries(MUL[profile])) k[f] = K3[f] * m;
    k.driftRear = REAR[profile](K3.driftRear);
    out[veh] = Object.freeze(k);
  }
  cache2.set(profile, Object.freeze(out));
  return cache2.get(profile);
}
var v2Of = (track) => !!track && (track.vm === 2 || track.pm === "sim");

// js/track.js
var MAX_GROUP = 63;
var EMPTY = Object.freeze([]);
var key = (x, z) => x + 4096 << 13 | z + 4096;
var clampInt = (v, lo, hi, fallback) => Math.max(lo, Math.min(hi, Math.round(+v || fallback)));
var RULES = [
  {
    key: "offroad",
    def: 0,
    clean: (v) => v ? 1 : 0,
    code: "or",
    sig: (v) => v ? "#O" : ""
  },
  {
    key: "v0",
    def: 0,
    clean: (v) => clampInt(v, 0, 300, 0),
    code: "v0",
    sig: (v) => v ? "#V" + v : ""
  },
  {
    key: "g0",
    def: 100,
    clean: (v) => clampInt(v, 15, 250, 100),
    code: "g0",
    sig: (v) => v !== 100 ? "#G" + v : ""
  },
  {
    key: "veh0",
    def: "car",
    clean: (v) => VEHICLES.includes(v) ? v : "car",
    code: "ve",
    sig: (v) => v !== "car" ? "#E" + v : ""
  },
  {
    key: "flip0",
    def: false,
    clean: (v) => !!v,
    code: "ig",
    sig: (v) => v ? "#I" : "",
    v4: true
  },
  // Paramètres de simulation (Copytrack Evolution, E8 ; sim/params.js) : à leur valeur par défaut, rien ne change (ni la course, ni la signature, ni le code).
  {
    key: "grip",
    def: 100,
    clean: (v) => clampInt(v, 25, 150, 100),
    code: "gp",
    sig: (v) => v !== 100 ? "#P" + v : "",
    v4: true
  },
  {
    key: "wind",
    def: 0,
    clean: (v) => clampInt(v, 0, 100, 0),
    code: "wd",
    sig: (v) => v ? "#W" + v : "",
    v4: true
  },
  {
    key: "windDir",
    def: 0,
    clean: (v) => (Math.round((+v || 0) / 15) * 15 % 360 + 360) % 360,
    code: "wa",
    sig: (v) => v ? "#A" + v : "",
    v4: true
  },
  // Environnements déterministes (Copytrack Evolution, E19 ; sim/env.js) : absents par défaut, ils n'entrent ni dans la course, ni dans la signature.
  {
    key: "rain",
    def: 0,
    clean: (v) => clampInt(v, 0, 100, 0),
    code: "rn",
    sig: (v) => v ? "#R" + v : "",
    v4: true
  },
  {
    key: "frost",
    def: 0,
    clean: (v) => clampInt(v, 0, 100, 0),
    code: "fr",
    sig: (v) => v ? "#F" + v : "",
    v4: true
  },
  {
    key: "gust",
    def: 0,
    clean: (v) => clampInt(v, 0, 100, 0),
    code: "gu",
    sig: (v) => v ? "#U" + v : "",
    v4: true
  },
  {
    key: "envSeed",
    def: 0,
    clean: (v) => clampInt(v, 0, 999, 0),
    code: "es",
    sig: (v) => v ? "#S" + v : "",
    v4: true
  },
  {
    key: "envVary",
    def: false,
    clean: (v) => !!v,
    code: "ev",
    sig: (v) => v ? "#Y" : "",
    v4: true
  },
  // Véhicules v2 et profils physiques (Copytrack Evolution, E20 ; physics/profiles.js, physics/vehicles/) : absents par défaut, rien ne change.
  {
    key: "vm",
    def: 1,
    clean: (v) => +v === 2 ? 2 : 1,
    code: "vm",
    sig: (v) => v === 2 ? "#M2" : "",
    v4: true
  },
  {
    key: "pm",
    def: "",
    clean: (v) => PROFILE_IDS.includes(v) ? v : "",
    code: "pm",
    sig: (v) => v ? "#Q" + v : "",
    v4: true
  }
];
var Track = class _Track {
  constructor(name = "Nouveau circuit", tiles = []) {
    this.name = name;
    this.author = "";
    this.decor = DEFAULT_DECOR;
    this.tiles = [];
    this.decos = [];
    this.index = /* @__PURE__ */ new Map();
    this.version = 0;
    this.laps = 1;
    this.desc = "";
    this.scripts = [];
    this.ambiance = {
      ...DEFAULT_AMBIANCE
    };
    this.groups = {};
    this.lg = null;
    this.resetRules();
    this.vt = 0;
    this.vh = "";
    for (const t of tiles) this.add(t);
  }
  static cellsOf(t) {
    const s = PIECES[t.t].size;
    const out = [];
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) out.push([
      t.x + i,
      t.z + j
    ]);
    if (t.mv === 2) {
      rotVec(t.r, 1, 0, W2);
      const n = Math.max(1, Math.ceil(moverParams(t, MP).amp / s - 1e-9));
      for (let k = 1; k <= n; k++) {
        const dx = Math.round(W2.x) * s * k, dz = Math.round(W2.z) * s * k;
        for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) out.push([
          t.x + i + dx,
          t.z + j + dz
        ]);
      }
    }
    if (t.mv === 3) {
      for (let i = -1; i <= s; i++) for (let j = -1; j <= s; j++) if (i < 0 || j < 0 || i >= s || j >= s) out.push([
        t.x + i,
        t.z + j
      ]);
    }
    return out;
  }
  // Plage de niveaux occupée (inclusive). Portiques et loopings réservent de la hauteur.
  // 0.9.3 : `rise` est signé (une pente descendante occupe les niveaux en dessous de son niveau d'entrée) ; une route sur un mur
  // (orientation o) réserve 2 niveaux au-dessus et au-dessous (le plan vertical mesure 18 m de haut, centré sur l'axe de la route).
  static range(t) {
    const p = PIECES[t.t];
    const up = Math.max(0, p.rise || 0), down = Math.min(0, p.rise || 0);
    const h = up + Math.max(p.clearance || 0, t.cp === 2 || t.tb ? 2 : t.cp === 1 ? 1 : 0, t.o ? 2 : 0);
    const below = Math.max(p.below || 0, t.o ? 2 : 0);
    if (t.v) return [
      t.l - h,
      t.l - down + below
    ];
    return [
      t.l + down - below,
      t.l + h + (t.mv === 1 ? Math.ceil(moverParams(t, MP).amp) : 0)
    ];
  }
  // Convertit une pièce (éventuellement au format v1.0 / v1.1) en pièce v1.2 / Phase 2.
  // Champs optionnels de la Phase 2 : cp (checkpoint 1 portique / 2 anneau), th (thème), ms / ma (vitesse et amplitude du
  // mouvement, 0 = valeur par défaut), col (couleurs personnalisées), s2 / p2 (2e revêtement d'une bifurcation).
  static normalize(t) {
    let type = t.t, s = SURFACE_ALIAS[t.s] || t.s || "";
    if (LEGACY_SURFACE[type]) {
      s = LEGACY_SURFACE[type];
      type = "straight";
    }
    if (LEGACY_PIECE[type]) type = LEGACY_PIECE[type];
    let ori = t.o | 0;
    const lg = LEGACY_TILE[type];
    if (lg) {
      type = lg.t;
      if (lg.o) ori = lg.o;
    }
    if (!PIECES[type]) throw new Error("Pi\xE8ce inconnue : " + type);
    const tile = {
      t: type,
      x: t.x | 0,
      z: t.z | 0,
      l: Math.max(0, Math.min(MAX_LEVEL, Math.round((+t.l || 0) * 2) / 2)),
      r: t.r & 3,
      s: "",
      p: 0,
      v: 0,
      o: 0,
      nb: 0,
      tn: 0,
      mv: 0,
      cp: 0,
      tb: 0,
      th: 0,
      ms: 0,
      ma: 0,
      col: null,
      s2: "",
      p2: 0,
      g: Math.max(0, Math.min(MAX_GROUP, t.g | 0))
    };
    tile.v = t.v && flagAllowed(type, "v") ? 1 : 0;
    tile.o = (ori === 1 || ori === 2) && !tile.v && flagAllowed(type, "o", tile, ori) ? ori : 0;
    tile.nb = PIECES[type].noRails || t.nb && flagAllowed(type, "nb") ? 1 : 0;
    tile.tn = t.tn && flagAllowed(type, "tn", tile) ? 1 : 0;
    tile.mv = t.mv && flagAllowed(type, "mv", tile) ? (t.mv | 0) & 3 : 0;
    if (tile.mv) {
      const m = clampMover(tile.mv, t.ms, t.ma);
      tile.ms = m.ms;
      tile.ma = m.ma;
    }
    tile.cp = t.cp && flagAllowed(type, "cp", tile, t.cp | 0) ? t.cp | 0 : 0;
    tile.tb = t.tb && flagAllowed(type, "tb", tile) ? 1 : 0;
    tile.th = THEMES.some((h) => h.id === (t.th | 0)) && flagAllowed(type, "th") ? t.th | 0 : 0;
    tile.col = cleanColors(t.col);
    if (surfaceAllowed(type, s, tile.o)) {
      tile.s = s;
      const S22 = SURFACES[s];
      if (S22 && S22.def != null) tile.p = Math.max(S22.min, Math.min(S22.max, t.p || S22.def));
    }
    if (PIECES[type].kind === "fork" && t.s2 && (t.s2 === "-" || surfaceAllowed(type, t.s2, tile.o))) {
      tile.s2 = t.s2 === "-" ? "-" : SURFACE_ALIAS[t.s2] || t.s2;
      const S32 = SURFACES[tile.s2];
      if (S32 && S32.def != null) tile.p2 = Math.max(S32.min, Math.min(S32.max, t.p2 || S32.def));
    }
    return tile;
  }
  tilesAt(x, z) {
    return this.index.get(key(x, z)) || EMPTY;
  }
  // Une pièce (notamment à l'envers) ne doit pas descendre sous le sol ni dépasser le plafond.
  static inBounds(t) {
    const [lo, hi] = _Track.range(t);
    return lo >= (t.v ? 1 : 0) && hi <= MAX_LEVEL + 6;
  }
  // Pièces gênées par t. Phase 3 : un anneau flottant (pièce « anneau » : turbo ou ancien checkpoint aérien) peut être posé
  // sur des cases déjà occupées par une autre pièce, et inversement ; deux anneaux ne se superposent pas.
  conflicts(t) {
    const [lo, hi] = _Track.range(t);
    const ring = PIECES[t.t].kind === "ring";
    const set = /* @__PURE__ */ new Set();
    for (const [x, z] of _Track.cellsOf(t)) {
      for (const o of this.tilesAt(x, z)) {
        if (o === t) continue;
        if ((ring || PIECES[o.t].kind === "ring") && !(ring && PIECES[o.t].kind === "ring")) continue;
        const [a, b] = _Track.range(o);
        if (a <= hi && lo <= b) set.add(o);
      }
    }
    return [
      ...set
    ];
  }
  add(t) {
    return this._insert(_Track.normalize(t));
  }
  _insert(tile) {
    this.tiles.push(tile);
    for (const [x, z] of _Track.cellsOf(tile)) {
      const k = key(x, z);
      let arr = this.index.get(k);
      if (!arr) this.index.set(k, arr = []);
      arr.push(tile);
    }
    this.version++;
    return tile;
  }
  remove(tile) {
    const i = this.tiles.indexOf(tile);
    if (i < 0) return;
    this.tiles.splice(i, 1);
    for (const [x, z] of _Track.cellsOf(tile)) {
      const k = key(x, z);
      const arr = this.index.get(k);
      if (!arr) continue;
      const j = arr.indexOf(tile);
      if (j >= 0) arr.splice(j, 1);
      if (!arr.length) this.index.delete(k);
    }
    this.version++;
  }
  // Obstacles physiques (décorations particulières), mis en cache par version.
  get obstacles() {
    if (this._obsV !== this.version) {
      this._obs = this.decos.filter((d) => isObstacle(d.k));
      this._obsV = this.version;
    }
    return this._obs;
  }
  // Index spatial des obstacles (voir obstacles.js), reconstruit quand le circuit change : partagé par toutes les voitures.
  get obstacleGrid() {
    if (this._ogV !== this.version) {
      this._og = buildObstacleGrid(this.obstacles);
      this._ogV = this.version;
    }
    return this._og;
  }
  clear() {
    this.tiles = [];
    this.decos = [];
    this.index.clear();
    this.vt = 0;
    this.vh = "";
    this.laps = 1;
    this.desc = "";
    this.ambiance = {
      ...DEFAULT_AMBIANCE
    };
    this.scripts = [];
    this.groups = {};
    this.lg = null;
    this.resetRules();
    this.version++;
  }
  get startTile() {
    return this.tiles.find((t) => t.t === "start") || null;
  }
  count(type) {
    let n = 0;
    for (const t of this.tiles) if (t.t === type) n++;
    return n;
  }
  // test : lancement d'un essai depuis l'éditeur ; l'arrivée n'est alors pas obligatoire (on roule librement).
  validate({ test = false } = {}) {
    const errors = [];
    const starts = this.count("start");
    if (starts === 0) errors.push("Il faut une pi\xE8ce \xAB D\xE9part \xBB.");
    if (starts > 1) errors.push("Il ne peut y avoir qu\u2019un seul d\xE9part.");
    if (!test && this.count("finish") === 0) errors.push("Il faut au moins une pi\xE8ce \xAB Arriv\xE9e \xBB.");
    return errors;
  }
  bounds() {
    if (!this.tiles.length) return {
      minX: -CELL * 2,
      maxX: CELL * 2,
      minZ: -CELL * 2,
      maxZ: CELL * 2,
      maxY: 0
    };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxL = 0;
    for (const t of this.tiles) {
      const s = PIECES[t.t].size;
      minX = Math.min(minX, t.x * CELL);
      minZ = Math.min(minZ, t.z * CELL);
      maxX = Math.max(maxX, (t.x + s) * CELL);
      maxZ = Math.max(maxZ, (t.z + s) * CELL);
      maxL = Math.max(maxL, _Track.range(t)[1]);
    }
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      maxY: maxL * LEVEL_H
    };
  }
  // Le circuit a-t-il des pièces mobiles ? (mis en cache par version : évite de balayer la case une seconde fois pour rien)
  get hasMovers() {
    if (this._mvV !== this.version) {
      this._hasMv = this.tiles.some((t) => t.mv);
      this._mvV = this.version;
    }
    return this._hasMv;
  }
  // Règles de course remises à leurs valeurs par défaut.
  resetRules() {
    for (const r of RULES) this[r.key] = r.def;
  }
  // Les règles de course actuelles : { offroad, v0, g0, veh0, flip0 }.
  rulesState() {
    return Object.fromEntries(RULES.map((r) => [
      r.key,
      this[r.key]
    ]));
  }
  // Paramètres du niveau, bornés : la description et les règles de course (les champs absents ou `undefined` restent inchangés ;
  // accepte aussi un autre circuit, dont on lit les mêmes champs).
  setParams(p = {}) {
    if (p.desc !== void 0) this.desc = String(p.desc || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (p.ambiance !== void 0) this.ambiance = cleanAmbiance(p.ambiance);
    if (p.scripts !== void 0) this.scripts = sanitizeScripts(p.scripts);
    for (const r of RULES) if (p[r.key] !== void 0) this[r.key] = r.clean(p[r.key]);
  }
  // Signature du contenu (pièces, décorations, règles de course), utilisée pour la
  // vérification et comme clé des classements en ligne. Le nom, la description et l'auteur
  // n'en font pas partie : on peut les modifier sans perdre la vérification ni les temps.
  signature() {
    const parts = this.tiles.map((t) => `${t.t}:${t.x}:${t.z}:${t.l}:${t.r}:${t.s}:${t.p}:${t.v}${t.nb}${t.tn}${t.mv ? "m" + t.mv : ""}${tileExtras(t)}`).sort().join("|");
    const d = this.decos.map((o) => `${o.k}:${o.x.toFixed(1)}:${o.z.toFixed(1)}:${o.s}${isObstacle(o.k) ? `:${o.y.toFixed(1)}:${o.ry.toFixed(2)}:${o.ph || 0}` : ""}`).join("|");
    const rules = RULES.map((r) => r.sig(this[r.key])).join("");
    return hashString(this.decor + "#" + parts + "#" + d + (this.laps > 1 ? "#L" + this.laps : "") + rules + this._logicSig());
  }
  // Logique du circuit : elle change la course, donc la signature ; avec elle, l'appartenance des pièces et décorations aux groupes aussi (une
  // règle « cache le groupe 2 » n'a pas le même effet selon ce qu'il contient). Sans logique : rien (les signatures d'avant ne bougent pas).
  _logicSig() {
    const L4 = logicSig(this.lg);
    if (!L4) return "";
    const m = this.tiles.filter((t) => t.g).map((t) => `${t.x}:${t.z}:${t.l}:${t.g}`).sort().join(",") + "/" + this.decos.map((o, i) => o.g ? `${i}:${o.g}` : "").filter(Boolean).join(",");
    return "#LG" + hashString(L4 + "|" + m);
  }
  setLogic(lg) {
    this.lg = sanitizeLogic(lg);
    this.version++;
  }
  // Clé de classement d'un circuit de joueur : stable si on renomme le circuit.
  get userKey() {
    return "u-" + this.signature();
  }
  get verified() {
    return this.vt > 0 && this.vh === this.signature();
  }
  setVerified(time) {
    this.vt = Math.round(time * 1e3) / 1e3;
    this.vh = this.signature();
  }
  // Médailles déduites du temps de l'auteur (0.9) : cristal = son temps, les autres plus lentes.
  get derivedMedals() {
    if (!this.verified) return null;
    const t = this.vt, r2 = (x) => Math.ceil(x * 100 - 1e-6) / 100;
    return {
      cristal: r2(t),
      or: r2(t * 1.08),
      argent: r2(t * 1.2),
      bronze: r2(t * 1.4)
    };
  }
  clone() {
    const t = new _Track(this.name, this.tiles);
    t.author = this.author;
    t.decor = this.decor;
    t.decos = this.decos.map((d) => ({
      ...d
    }));
    t.vt = this.vt;
    t.vh = this.vh;
    t.laps = this.laps;
    t.desc = this.desc;
    t.ambiance = {
      ...this.ambiance
    };
    t.scripts = this.scripts.map((s) => ({
      ...s
    }));
    t.groups = {
      ...this.groups
    };
    t.lg = this.lg ? JSON.parse(JSON.stringify(this.lg)) : null;
    for (const r of RULES) t[r.key] = this[r.key];
    return t;
  }
  // ---- Groupes (calques de l'éditeur ; la logique du circuit s'en sert, E10) -----------------------------------------------------------------
  setGroupName(g, name) {
    g = g | 0;
    if (g < 1 || g > MAX_GROUP) return;
    const n = String(name == null ? "" : name).replace(/[^\p{L}\p{N} _'’.!?-]/gu, "").trim().slice(0, 24);
    if (n) this.groups[g] = n;
    else delete this.groups[g];
  }
  groupNames() {
    return Object.keys(this.groups).map(Number).filter((g) => g >= 1 && g <= MAX_GROUP).sort((a, b) => a - b).map((g) => [
      g,
      this.groups[g]
    ]);
  }
  // Numéros de groupe utilisés par des pièces ou des décorations (triés).
  usedGroups() {
    const s = /* @__PURE__ */ new Set();
    for (const t of this.tiles) if (t.g) s.add(t.g);
    for (const d of this.decos) if (d.g) s.add(d.g);
    return [
      ...s
    ].sort((a, b) => a - b);
  }
  // ---- Sérialisation -----------------------------------------------------
  encode() {
    const arr = [];
    const extras = [];
    this.tiles.forEach((t, idx) => {
      arr.push(PIECE_ORDER.indexOf(t.t), t.x, t.z, t.l, t.r, Math.max(0, SURFACE_CODES.indexOf(t.s || "")), t.p || 0, (t.v ? 1 : 0) | (t.nb ? 2 : 0) | (t.tn ? 4 : 0) | (t.mv | 0) << 3);
      const e = {
        i: idx
      };
      if (t.cp) e.cp = t.cp;
      if (t.o) e.o = t.o;
      if (t.tb) e.tb = 1;
      if (t.th) e.th = t.th;
      if (t.ms) e.ms = t.ms;
      if (t.ma) e.ma = t.ma;
      if (t.s2) {
        e.s2 = t.s2 === "-" ? -1 : Math.max(0, SURFACE_CODES.indexOf(t.s2));
        if (t.p2) e.p2 = t.p2;
      }
      if (t.col) e.col = Object.fromEntries(COLOR_KEYS.filter((k) => t.col[k]).map((k) => [
        k,
        t.col[k].slice(1)
      ]));
      if (t.g) e.g = t.g;
      if (Object.keys(e).length > 1) extras.push(e);
    });
    const decos = this.decos.map((d) => [
      DECO_ORDER.indexOf(d.k),
      +d.x.toFixed(2),
      +d.y.toFixed(2),
      +d.z.toFixed(2),
      +d.ry.toFixed(3),
      +d.s.toFixed(2),
      d.c,
      d.u || 0,
      // (groupe : 12e valeur ; les précédentes sont alors toutes écrites)
      ...d.g ? [
        d.ph || 0,
        d.cc ? d.cc.slice(1) : "",
        d.cp && d.cp.length ? packDecoParts(d.cp) : 0,
        d.g
      ] : d.cp && d.cp.length ? [
        d.ph || 0,
        d.cc ? d.cc.slice(1) : "",
        packDecoParts(d.cp)
      ] : [
        ...d.ph || d.cc ? [
          d.ph || 0
        ] : [],
        ...d.cc ? [
          d.cc.slice(1)
        ] : []
      ]
    ]);
    const data = {
      v: extras.length || this.decos.some((d) => d.cc || d.cp || d.g) || this.groupNames().length || this.lg || RULES.some((r) => r.v4 && this[r.key] !== r.def) ? 4 : 3,
      n: this.name,
      a: this.author || "",
      d: this.decor,
      t: arr
    };
    if (extras.length) data.e = extras;
    if (decos.length) data.o = decos;
    if (this.laps > 1) data.lp = this.laps;
    if (this.desc) data.ds = this.desc;
    const am = ambianceToArray(this.ambiance);
    if (am) data.am = am;
    const sc = scriptsToArray(this.scripts);
    if (sc) data.sc = sc;
    const gn = this.groupNames();
    if (gn.length) data.gn = gn;
    const lg = logicToArray(this.lg);
    if (lg) data.lg = lg;
    for (const r of RULES) if (this[r.key] !== r.def) data[r.code] = this[r.key] === true ? 1 : this[r.key];
    if (this.verified) {
      data.vt = this.vt;
      data.vh = this.vh;
    }
    return "SHW3:" + b64encode(JSON.stringify(data));
  }
  // Accepte les codes v1.0 (SHW1), v1.1 (SHW2) et v1.2 (SHW3), bruts ou dans un lien.
  static decode(code) {
    let s = String(code || "").trim();
    const hash = s.indexOf("#t=");
    if (hash >= 0) s = s.slice(hash + 3);
    s = decodeURIComponent(s);
    if (/^SHW\d:/.test(s)) s = s.slice(5);
    const data = JSON.parse(b64decode(s));
    const stride = data && data.v >= 3 ? 8 : data && data.v >= 2 ? 6 : 5;
    if (!data || !Array.isArray(data.t) || data.t.length % stride) throw new Error("Code de circuit invalide");
    const tr = new _Track(String(data.n || "Circuit import\xE9").slice(0, 40));
    tr.author = String(data.a || "").slice(0, 30);
    tr.decor = DECORS[data.d] ? data.d : DEFAULT_DECOR;
    const extras = /* @__PURE__ */ new Map();
    if (Array.isArray(data.e)) {
      for (const e of data.e) if (e && Number.isInteger(e.i)) extras.set(e.i, e);
    }
    for (let i = 0; i < data.t.length; i += stride) {
      const type = PIECE_ORDER[data.t[i]];
      if (!type) continue;
      const tile = {
        t: type,
        x: data.t[i + 1],
        z: data.t[i + 2],
        l: data.t[i + 3],
        r: data.t[i + 4],
        s: ""
      };
      const ex = extras.get(i / stride);
      if (ex) {
        tile.cp = ex.cp | 0;
        tile.o = ex.o | 0;
        tile.tb = ex.tb | 0;
        tile.th = ex.th | 0;
        tile.ms = ex.ms | 0;
        tile.ma = +ex.ma || 0;
        tile.g = ex.g | 0;
        if (ex.s2) {
          tile.s2 = ex.s2 === -1 ? "-" : SURFACE_CODES[ex.s2] || "";
          tile.p2 = ex.p2 | 0;
        }
        if (ex.col && typeof ex.col === "object") tile.col = Object.fromEntries(COLOR_KEYS.filter((k) => typeof ex.col[k] === "string").map((k) => [
          k,
          "#" + ex.col[k]
        ]));
      }
      if (stride >= 6) tile.s = SURFACE_CODES[data.t[i + 5]] || "";
      if (stride >= 8) {
        tile.p = data.t[i + 6];
        const f = data.t[i + 7] | 0;
        tile.v = f & 1;
        tile.nb = f >> 1 & 1;
        tile.tn = f >> 2 & 1;
        tile.mv = f >> 3 & 3;
      }
      if (tr.conflicts(_Track.normalize(tile)).length) continue;
      tr.add(tile);
    }
    if (Array.isArray(data.o)) {
      for (const o of data.o.slice(0, MAX_DECOS)) {
        const k = DECO_ORDER[o[0]];
        if (!k) continue;
        const u = typeof o[7] === "string" && /^https?:\/\//i.test(o[7]) ? o[7] : "";
        tr.addDeco({
          k,
          x: o[1],
          y: o[2],
          z: o[3],
          ry: o[4],
          s: o[5],
          c: o[6],
          u,
          ph: +o[8] || 0,
          cc: typeof o[9] === "string" && o[9] ? "#" + o[9] : "",
          cp: k === "custom" ? unpackDecoParts(o[10]) : void 0,
          g: o[11] | 0
        });
      }
    }
    tr.laps = Math.max(1, Math.min(9, data.lp | 0 || 1));
    tr.setParams({
      desc: data.ds,
      ambiance: ambianceFromArray(data.am),
      scripts: scriptsFromArray(data.sc),
      ...Object.fromEntries(RULES.map((r) => [
        r.key,
        data[r.code]
      ]))
    });
    if (Array.isArray(data.gn)) {
      for (const e of data.gn.slice(0, MAX_GROUP)) if (Array.isArray(e)) tr.setGroupName(e[0], e[1]);
    }
    tr.lg = logicFromArray(data.lg);
    if (data.vt > 0 && data.vh) {
      tr.vt = +data.vt;
      tr.vh = String(data.vh);
    }
    return tr;
  }
};
Object.assign(Track.prototype, surfaceMethods, editMethods);
function tileExtras(t) {
  let e = "";
  if (t.cp) e += "c" + t.cp;
  if (t.tb) e += "b";
  if (t.o) e += "o" + t.o;
  if (t.mv && (t.ms || t.ma)) e += `s${t.ms || 0}a${t.ma || 0}`;
  if (t.s2) e += `f${t.s2}:${t.p2 || 0}`;
  return e;
}
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64decode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
var SURF_CODE = {
  i: "ice",
  b: "boost",
  j: "bounce",
  m: "magnet",
  d: "drift",
  x: "slow",
  w: "wind",
  g: "gravity",
  o: "moto",
  a: "water",
  n: "boat",
  e: "glider",
  f: "flip",
  t: "conveyor",
  r: "spring",
  v: "glass",
  p: "powder",
  y: "reverse",
  c: "cut"
};
function scriptTrack(name, script, opts2 = {}) {
  const tr = new Track(name);
  tr.decor = opts2.decor || DEFAULT_DECOR;
  let x = opts2.x || 0, z = opts2.z || 0, h = opts2.h || 0, l = opts2.l || 0;
  const path = [];
  let cur = {
    s: "",
    p: 0,
    v: 0,
    nb: 0,
    tn: 0
  };
  let moverTok = 0;
  const place = (t, px, pz, lv, r, reverse = false, noPath = false, curOver = null) => {
    const tile = {
      t,
      x: px,
      z: pz,
      l: lv,
      r: r & 3,
      ...curOver || cur
    };
    const mp = cur.mv && opts2.movers ? opts2.movers[cur.mvTok - 1] : null;
    if (mp) {
      tile.ms = mp.ms || 0;
      tile.ma = mp.ma || 0;
    }
    if (cur.s && !surfaceAllowed(t, cur.s, cur.o | 0)) throw new Error(`${name} : rev\xEAtement ${cur.s} interdit sur ${t}`);
    for (const f of [
      "v",
      "nb",
      "tn",
      "mv"
    ]) if (cur[f] && !flagAllowed(t, f, tile)) throw new Error(`${name} : drapeau ${f} interdit sur ${t}`);
    if (cur.o && !flagAllowed(t, "o", tile, cur.o)) throw new Error(`${name} : orientation ${cur.o} interdite sur ${t}`);
    const c = tr.conflicts(Track.normalize(tile));
    if (c.length) throw new Error(`${name} : conflit en (${px}, ${pz}) niveau ${lv} [${t}]`);
    if (!Track.inBounds(Track.normalize(tile))) throw new Error(`${name} : ${t} sort des niveaux en (${px}, ${pz})`);
    const added = tr.add(tile);
    if (noPath) return added;
    const pts = centerlineWorld(added, PIECES[t].size === 2 ? 12 : 6, reverse);
    if (path.length) pts.shift();
    path.push(...pts);
    return added;
  };
  const straight2 = (type) => {
    const c = rot(h, 0.5, -0.5);
    place(type, Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
    adv(h, 2);
  };
  const twist2 = (rev) => {
    const r = rev ? h + 2 : h;
    const e = rot(r, -0.5, rev ? -0.5 : 0.5);
    place("twist", Math.round(x + 0.5 - e.x - 1), Math.round(z + 0.5 - e.z - 1), l, r, rev);
    adv(h, 2);
  };
  const fork = (n, side, surf) => {
    const right = rot(h, side, 0);
    const bx = x + right.x, bz = z + right.z;
    const t1 = side > 0 ? "fork" : "forkL", t2 = side > 0 ? "forkL" : "fork";
    const plain = {
      s: "",
      p: 0,
      v: 0,
      nb: 0,
      tn: 0
    };
    const fwd = rot(h, 0, -1);
    const step = (k) => [
      fwd.x * k,
      fwd.z * k
    ];
    const block = (k) => {
      const cells = [];
      for (const [cx, cz] of [
        [
          x,
          z
        ],
        [
          bx,
          bz
        ]
      ]) for (const kk of [
        k,
        k + 1
      ]) cells.push([
        cx + fwd.x * kk,
        cz + fwd.z * kk
      ]);
      return [
        Math.min(...cells.map((c) => c[0])),
        Math.min(...cells.map((c) => c[1]))
      ];
    };
    const [fx0, fz0] = block(0);
    const fT = place(t1, fx0, fz0, l, h, false, true, plain);
    const lanesStart = 2;
    for (let i = 0; i < n; i++) {
      const [ox, oz] = step(lanesStart + i);
      place("straight", x + ox, z + oz, l, h, false, true, plain);
      place("straight", bx + ox, bz + oz, l, h, false, true, surf);
    }
    const jA = block(lanesStart + n);
    const jT = place(t2, jA[0], jA[1], l, h + 2, false, true, plain);
    const pushPts = (pts) => {
      if (path.length) pts.shift();
      path.push(...pts);
    };
    pushPts(forkPath(fT, 1, false));
    for (let i = 0; i <= n; i++) {
      const [ox, oz] = step(lanesStart + i);
      const c0 = {
        x: (bx + ox + 0.5) * CELL,
        z: (bz + oz + 0.5) * CELL
      };
      const back = rot(h, 0, 0.5);
      path.push([
        c0.x + back.x * CELL,
        l * LEVEL_H + 0.4,
        c0.z + back.z * CELL,
        0
      ]);
    }
    pushPts(forkPath(jT, 1, true));
    adv(h, lanesStart + n + 2);
  };
  const adv = (dir, n = 1) => {
    x += DIRS[dir][0] * n;
    z += DIRS[dir][1] * n;
  };
  const rot = (r, lx, lz) => rotVec(r, lx, lz, {
    x: 0,
    z: 0
  });
  const bigPiece = (type, mirror, size, laneCells) => {
    const e = rot(h, -mirror * laneCells, (size - 1) / 2);
    const ax = Math.round(x + 0.5 - e.x - size / 2), az = Math.round(z + 0.5 - e.z - size / 2);
    place(type, ax, az, l, h);
    const d = rot(h, 2 * mirror * laneCells, -size);
    x += d.x;
    z += d.z;
  };
  for (const tok of script.trim().split(/\s+/)) {
    const gm = /^\[([A-Za-z0-9]+)\](-?\d*)(?:\.([a-z])(\d*))?([\^_#~=%<>]*)$/.exec(tok);
    const m = gm ? [
      tok,
      "@" + gm[1],
      gm[2],
      gm[3],
      gm[4],
      gm[5]
    ] : /^([A-Za-z]+)(-?\d*)(?:\.([a-z])(\d*))?([\^_#~=%<>]*)$/.exec(tok);
    if (!m) throw new Error("Instruction invalide : " + tok);
    let op = m[1];
    const n = m[2] ? parseInt(m[2], 10) : 1;
    cur = {
      s: "",
      p: 0,
      v: m[5].includes("^") ? 1 : 0,
      nb: m[5].includes("_") ? 1 : 0,
      tn: m[5].includes("#") ? 1 : 0,
      mv: m[5].includes("~") ? 1 : m[5].includes("=") ? 2 : m[5].includes("%") ? 3 : 0,
      o: m[5].includes("<") ? 1 : m[5].includes(">") ? 2 : 0
    };
    cur.mvTok = cur.mv ? ++moverTok : 0;
    if (m[3]) {
      cur.s = SURF_CODE[m[3]];
      if (!cur.s) throw new Error("Rev\xEAtement inconnu : " + tok);
      cur.p = m[4] ? parseInt(m[4], 10) : 0;
    }
    if (op === "B") {
      op = "S";
      cur.s = "boost";
    }
    if (op === "I") {
      op = "S";
      cur.s = "ice";
    }
    if (op[0] === "@") {
      const id = op.slice(1), P = PIECES[id];
      if (!P) throw new Error("Pi\xE8ce inconnue : " + id);
      for (let i = 0; i < n; i++) {
        const sg = P.mirror < 0 ? -1 : 1, rise = P.rise || 0;
        if (P.kind === "arc" && P.size === 2) {
          const c = rot(h, 0.5 * sg, -0.5);
          place(id, Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
          const nx = rot(h, 2 * sg, -1);
          x += nx.x;
          z += nx.z;
          h = h + (sg > 0 ? 1 : 3) & 3;
        } else if (P.kind === "arc") {
          place(id, x, z, l, h);
          h = h + (sg > 0 ? 1 : 3) & 3;
          adv(h);
        } else if (P.size === 2) straight2(id);
        else {
          place(id, x, z, l, h);
          adv(h);
        }
        l += rise;
      }
      continue;
    }
    const simple = {
      S: "straight",
      C: "checkpoint",
      P: "platform",
      start: "start",
      finish: "finish"
    };
    if (simple[op]) {
      for (let i = 0; i < n; i++) {
        place(simple[op], x, z, l, h);
        adv(h);
      }
      continue;
    }
    switch (op) {
      case "R":
        place("curve", x, z, l, h);
        h = h + 1 & 3;
        adv(h);
        break;
      case "L":
        place("curve", x, z, l, h + 1, true);
        h = h + 3 & 3;
        adv(h);
        break;
      case "RR": {
        const c = rot(h, 0.5, -0.5);
        place("bigcurve", Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
        const nx = rot(h, 2, -1);
        x += nx.x;
        z += nx.z;
        h = h + 1 & 3;
        break;
      }
      case "LL": {
        const r = h + 1 & 3;
        const c = rot(r, -0.5, 0.5);
        place("bigcurve", Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, r, true);
        const nx = rot(r, -1, 2);
        x += nx.x;
        z += nx.z;
        h = h + 3 & 3;
        break;
      }
      case "O":
        bigPiece("loop", 1, 2, 0.5);
        break;
      case "OL":
        bigPiece("loopL", -1, 2, 0.5);
        break;
      case "OB":
        bigPiece("loopBig", 1, 3, 1);
        break;
      case "OBL":
        bigPiece("loopBigL", -1, 3, 1);
        break;
      case "OD":
        bigPiece("loopDouble", 1, 3, 1);
        break;
      case "ODL":
        bigPiece("loopDoubleL", -1, 3, 1);
        break;
      // Vrille (2 cases de long) : TW de l'endroit vers l'envers, TWB (sens inverse) de l'envers vers l'endroit.
      case "TW":
        twist2(false);
        break;
      case "TWB":
        twist2(true);
        break;
      case "QU":
        place("ramp90", x, z, l, h);
        adv(h);
        l += 2;
        break;
      case "WA":
        for (let i = 0; i < n; i++) {
          place("wall", x, z, l, h);
          l += 1;
        }
        break;
      case "CR":
        place("crest90", x, z, l, h);
        adv(h);
        l += 2;
        break;
      // Au plafond (^), une pente est retournée sous son niveau : elle descend dans son sens normal.
      case "U":
        for (let i = 0; i < n; i++) {
          if (cur.v) {
            l += 1;
            place("slope", x, z, l, h + 2, true);
          } else {
            place("slope", x, z, l, h);
            l += 1;
          }
          adv(h);
        }
        break;
      case "UU":
        if (cur.v) {
          l += 2;
          place("steep", x, z, l, h + 2, true);
        } else {
          place("steep", x, z, l, h);
          l += 2;
        }
        adv(h);
        break;
      case "D":
        for (let i = 0; i < n; i++) {
          if (cur.v) {
            place("slope", x, z, l, h);
            l -= 1;
          } else {
            l -= 1;
            place("slope", x, z, l, h + 2, true);
          }
          adv(h);
        }
        break;
      case "DD":
        if (cur.v) {
          place("steep", x, z, l, h);
          l -= 2;
        } else {
          l -= 2;
          place("steep", x, z, l, h + 2, true);
        }
        adv(h);
        break;
      case "G":
        adv(h, n);
        break;
      // ---- v1.5
      case "BR": {
        const c = rot(h, 0.5, -0.5);
        place("bank", Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
        const nx = rot(h, 2, -1);
        x += nx.x;
        z += nx.z;
        h = h + 1 & 3;
        break;
      }
      case "BL": {
        const r = h + 1 & 3;
        const c = rot(r, -0.5, 0.5);
        place("bank", Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, r, true);
        const nx = rot(r, -1, 2);
        x += nx.x;
        z += nx.z;
        h = h + 3 & 3;
        break;
      }
      case "BRR":
      case "BLL": {
        const sgn = op === "BRR" ? 1 : -1;
        const fwd = rot(h, 0, -1), side = rot(h, sgn, 0);
        const cells = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push([
          x + side.x * i + fwd.x * j,
          z + side.z * i + fwd.z * j
        ]);
        const ax = Math.min(...cells.map((c) => c[0])), az = Math.min(...cells.map((c) => c[1]));
        if (sgn > 0) place("bankBig", ax, az, l, h);
        else place("bankBig", ax, az, l, h + 1, true);
        x += fwd.x * 2 + side.x * 3;
        z += fwd.z * 2 + side.z * 3;
        h = h + (sgn > 0 ? 1 : 3) & 3;
        break;
      }
      // ---- Phase 2
      case "HR":
      case "HL": {
        const sgn = op === "HR" ? 1 : -1;
        const fwd = rot(h, 0, -1), side = rot(h, sgn, 0);
        const cells = [];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push([
          x + side.x * i + fwd.x * j,
          z + side.z * i + fwd.z * j
        ]);
        const ax = Math.min(...cells.map((c) => c[0])), az = Math.min(...cells.map((c) => c[1]));
        if (sgn > 0) place("hugecurve", ax, az, l, h);
        else place("hugecurve", ax, az, l, h + 1, true);
        x += fwd.x * 2 + side.x * 3;
        z += fwd.z * 2 + side.z * 3;
        h = h + (sgn > 0 ? 1 : 3) & 3;
        break;
      }
      case "UX":
        place("steep4", x, z, l, h);
        l += 4;
        adv(h);
        break;
      case "DX":
        l -= 4;
        place("steep4", x, z, l, h + 2, true);
        adv(h);
        break;
      case "CVR":
      case "CVL": {
        const k = [
          "05",
          "1",
          "2",
          "4"
        ][n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3];
        place(op === "CVR" ? "cv" + k : "cvL" + k, x, z, l, h);
        l += k === "05" ? 0.5 : +k;
        h = h + (op === "CVR" ? 1 : 3) & 3;
        adv(h);
        break;
      }
      case "CBR":
      case "CBL": {
        const k = [
          "05",
          "1",
          "2",
          "4"
        ][n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3];
        const sg = op === "CBR" ? 1 : -1;
        const c = rot(h, 0.5 * sg, -0.5);
        place(sg > 0 ? "cvBig" + k : "cvBigL" + k, Math.round(x + 0.5 + c.x - 1), Math.round(z + 0.5 + c.z - 1), l, h);
        const nx = rot(h, 2 * sg, -1);
        x += nx.x;
        z += nx.z;
        h = h + (sg > 0 ? 1 : 3) & 3;
        l += k === "05" ? 0.5 : +k;
        break;
      }
      case "OT":
        bigPiece("loopTriple", 1, 4, 1.5);
        break;
      case "OTL":
        bigPiece("loopTripleL", -1, 4, 1.5);
        break;
      case "OBT":
        bigPiece("loopBigTriple", 1, 4, 1.5);
        break;
      case "OBTL":
        bigPiece("loopBigTripleL", -1, 4, 1.5);
        break;
      case "OBD":
        bigPiece("loopBigDouble", 1, 3, 1);
        break;
      case "OBDL":
        bigPiece("loopBigDoubleL", -1, 3, 1);
        break;
      case "TB":
        straight2("tube");
        break;
      case "TI":
        place("tubeIn", x, z, l, h);
        adv(h);
        break;
      case "TM":
        for (let i = 0; i < n; i++) {
          place("tubeMid", x, z, l, h);
          adv(h);
        }
        break;
      case "TO":
        place("tubeIn", x, z, l, h + 2, true);
        adv(h);
        break;
      case "CK":
        straight2("cork");
        break;
      case "CKL":
        straight2("corkL");
        break;
      case "KR":
        place("cpCurve", x, z, l, h);
        h = h + 1 & 3;
        adv(h);
        break;
      case "KL":
        place("cpCurve", x, z, l, h + 1, true);
        h = h + 3 & 3;
        adv(h);
        break;
      case "GU":
        for (let i = 0; i < n; i++) {
          place("gentle", x, z, l, h);
          l += 0.5;
          adv(h);
        }
        break;
      case "GD":
        for (let i = 0; i < n; i++) {
          l -= 0.5;
          place("gentle", x, z, l, h + 2, true);
          adv(h);
        }
        break;
      case "GR":
      case "GC": {
        const mid = Math.floor((n - 1) / 2);
        const rz = rot(h, 0, -mid);
        place(op === "GR" ? "ring" : "cpRing", x + rz.x, z + rz.z, l, h, false, true, {
          s: "",
          p: 0,
          v: 0,
          nb: 0,
          tn: 0
        });
        adv(h, n);
        break;
      }
      case "Y":
        fork(n, 1, {
          ...cur
        });
        break;
      case "YL":
        fork(n, -1, {
          ...cur
        });
        break;
      case "V":
        l += n;
        break;
      default:
        throw new Error("Instruction inconnue : " + op);
    }
  }
  for (const d of opts2.decos || []) tr.addDeco(d);
  tr.path = path;
  tr.turtle = {
    x,
    z,
    h,
    l
  };
  return tr;
}
function forkPath(tile, branch, reverse) {
  const P = PIECES[tile.t];
  const half = P.size * (CELL / 2);
  const y = tile.l * LEVEL_H + 0.4;
  const out = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const lx = forkBranchX(P, t, branch), lz = half - 2 * half * t;
    const w = {
      x: 0,
      z: 0
    };
    rotVec(tile.r, lx, lz, w);
    const cx = tile.x * CELL + half, cz = tile.z * CELL + half;
    out.push([
      w.x + cx,
      y,
      w.z + cz,
      0
    ]);
  }
  return reverse ? out.reverse() : out;
}

// js/tracks.js
var BUILTIN_TRACKS = [
  {
    // Chapitre 1 · 1/6 — SPRINT d'initiation. Ouverture : deux boosters puis un premier wall-ride (transitions douces 2×2).
    // Presque tout droit : le chrono se joue sur la vitesse de pointe et sur la trajectoire dans les deux très grands virages plats.
    id: "eclats",
    name: "Premiers \xC9clats",
    decor: "desert",
    difficulty: 1,
    profil: "sprint",
    appris: "D\xE9part : deux boosters \u2192 premier wall-ride (transitions douces 2\xD72). Au programme : vitesse de pointe, trajectoire dans les tr\xE8s grands virages plats, courbes progressives.",
    goal: {
      id: "under",
      t: 22.5
    },
    opts: {
      l: 2
    },
    pilot: {
      vCap: 66
    },
    script: "start B2 [tr01l] S4< [tr10l] S B S [crs1] S [cds1] HR S3 B C S HL S3 B2 finish",
    medals: {
      cristal: 20.3,
      or: 21.3,
      argent: 24.5,
      bronze: 28.8
    }
  },
  {
    // Chapitre 3 · 1/6 — SPRINT (moto). Ouverture : départ EN MOTO (veh0), lancé par une descente de 7 niveaux au lieu d'un booster. Puis deux
    // sauts en chapelet avec un anneau turbo chacun, un très grand virage plat et un dernier booster. Presque tout droit.
    id: "lagon",
    name: "Lagon Turquoise",
    decor: "isles",
    difficulty: 1,
    profil: "sprint",
    appris: "D\xE9part : en moto, lanc\xE9 par une descente de 7 niveaux (sans booster). Au programme : deux sauts en chapelet avec un anneau turbo chacun, tr\xE8s grand virage plat.",
    goal: {
      id: "rings",
      n: 2
    },
    opts: {
      l: 8
    },
    params: {
      veh0: "moto"
    },
    pilot: {
      vCap: 66
    },
    script: "start [cdi1] [dn2] [dn2] [cdo2] B S [crv1] UU GR2 DD [cdo1] B2 S [crv1] UU GR2 DD [cdo1] S B C S3 HL S2 B2 finish",
    medals: {
      cristal: 21.3,
      or: 22.4,
      argent: 25.8,
      bronze: 30.3
    }
  },
  {
    // Chapitre 5 · 1/6 — SPRINT (glace). Ouverture : DÉPART SUR LA GLACE (deux cases de verglas, trois boosters, deux cases de verglas) : la voiture patine, les boosters la lancent sur une
    // glace où l'on ne freine plus. Puis une vague douce, deux très grands virages plats (droite, gauche) et une descente finale. Presque tout droit.
    id: "aurore",
    name: "Aurore Naissante",
    decor: "polar",
    difficulty: 1,
    profil: "sprint",
    appris: "D\xE9part : sur la glace : verglas, trois boosters, verglas. Au programme : vague douce, deux tr\xE8s grands virages plats, descente finale.",
    goal: {
      id: "under",
      t: 24.5
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    script: "start I2 B3 I2 S [crs1] S2 [cds1] B HR S3 B C S2 HL S2 B [cdi1] [dn2] [cdo1] S B2 finish",
    medals: {
      cristal: 22,
      or: 23.2,
      argent: 26.7,
      bronze: 31.3
    }
  },
  {
    // Chapitre 2 · 1/6 — SPRINT. Ouverture : trois boosters → rampe de lancement avec un anneau turbo dans le saut. Puis une vague douce,
    // un pont de lianes sans bordures à plus de 230 km/h (la trajectoire ne pardonne rien), un S de virages relevés et un très grand virage
    // plat pour finir. Trois virages en tout, aucun serré.
    id: "lianes",
    name: "Lianes N\xE9on",
    decor: "jungle",
    difficulty: 2,
    profil: "sprint",
    appris: "D\xE9part : trois boosters \u2192 rampe de lancement avec anneau turbo dans le saut. Au programme : vagues douces, pont de lianes sans bordures \xE0 plus de 230 km/h, S de virages relev\xE9s, tr\xE8s grand virage plat.",
    goal: {
      id: "rings",
      n: 1
    },
    opts: {
      l: 3
    },
    pilot: {
      vCap: 66
    },
    script: "start B3 UU GR2 DD [cdo1] B2 S [crs1] S2 [cds1] B S2_ B_ S2_ BR S2 B BL S2 B C S3 HL S B2 finish",
    medals: {
      cristal: 23.8,
      or: 25.1,
      argent: 28.8,
      bronze: 33.9
    }
  },
  {
    // Chapitre 4 · 1/6 — SPEEDWAY. Ouverture : DÉPART SUR UN TAPIS ROULANT à +200 km/h (trois cases) : la voiture est lancée à près de 290 km/h sans un seul booster. Quatre
    // virages relevés 3×3 en S, un wall-ride de quatre cases sur le mur droit (la façade d'une tour) et des boosters en sortie de virage : 88 % du tour au-dessus de 240 km/h.
    id: "neons",
    name: "N\xE9ons Express",
    decor: "city",
    difficulty: 2,
    profil: "speedway",
    appris: "D\xE9part : tapis roulant \xE0 +200 km/h (trois cases) : pr\xE8s de 290 km/h sans booster. Au programme : quatre virages relev\xE9s, wall-ride sur la fa\xE7ade d\u2019une tour, 88 % au-dessus de 240 km/h.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 4
    },
    pilot: {
      vCap: 70
    },
    script: "start S3.t201 S BRR S2 B BLL S2 C B [tr02l] S4> [tr20l] BRR S2 B BLL S2 B2 finish",
    medals: {
      cristal: 20,
      or: 21.1,
      argent: 24.2,
      bronze: 28.4
    }
  },
  {
    // Chapitre 6 · 1/6 — SPRINT (collines). Ouverture : deux boosters puis UNE LONGUE COLLINE DOUCE (trois cases qui montent d'un demi-niveau, trois qui redescendent). Puis une vague en S,
    // un S de virages relevés 2×2, un seul très grand virage plat et une descente finale de 4 niveaux. Presque tout droit.
    id: "braises",
    name: "Braises",
    decor: "volcano",
    difficulty: 2,
    profil: "sprint",
    appris: "D\xE9part : deux boosters \u2192 colline douce. Au programme : vague en S, S relev\xE9 2\xD72, un tr\xE8s grand virage plat.",
    goal: {
      id: "under",
      t: 24
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    script: "start B2 GU3 GD3 B S [crs1] S2 [cds1] B BR S BL S B C S2 HL S2 B [cdi1] [dn2] [cdo1] S B2 finish",
    medals: {
      cristal: 21.7,
      or: 22.8,
      argent: 26.2,
      bronze: 30.8
    }
  },
  {
    // Chapitre 1 · 2/6 — SPEEDWAY. Ouverture : un booster puis directement un très grand virage relevé. Aucun virage serré : quatre virages
    // relevés 3×3, un wall-ride de 6 cases sur la paroi du canyon (mur droit) à plus de 240 km/h, une descente douce et des boosters
    // pour rester au-dessus de 240 km/h sur plus de la moitié du tour (60 %).
    id: "canyon",
    name: "Canyon Corail",
    decor: "desert",
    difficulty: 2,
    profil: "speedway",
    appris: "D\xE9part : un booster \u2192 directement un tr\xE8s grand virage relev\xE9. Au programme : virages relev\xE9s 3\xD73 \xE0 plus de 240 km/h, wall-ride de 6 cases sur la paroi du canyon, descente douce.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 8
    },
    pilot: {
      vCap: 70
    },
    script: "start B BRR B3 S2 [tr02l] S6> [tr20l] C S BRR S [cdi1] [dn2] [cdo1] S C B S BRR S3 B BLL S BRR S2 B2 finish",
    medals: {
      cristal: 27.8,
      or: 29.2,
      argent: 33.6,
      bronze: 39.4
    }
  },
  {
    // Chapitre 7 · 1/6 — SPRINT (amarrage). Ouverture : un booster puis UN TUBE de trois cases. Après le tube, un saut en BASSE GRAVITÉ (plaque à 40 %) : la voiture flotte sur plus de dix cases,
    // traverse un anneau turbo et se pose sur un quai de dix cases, cinq niveaux plus bas. Puis un très grand virage plat et une descente finale de 4 niveaux. Presque tout droit.
    id: "quai",
    name: "Quai d\u2019Amarrage",
    decor: "orbit",
    difficulty: 2,
    profil: "sprint",
    appris: "D\xE9part : un booster \u2192 tube. Au programme : saut en basse gravit\xE9 (40 %) avec anneau turbo, tr\xE8s grand virage plat.",
    goal: {
      id: "rings",
      n: 1
    },
    opts: {
      l: 14
    },
    pilot: {
      vCap: 66
    },
    script: "start B TI TM TO B S.g40 [crs1] UU GR2 G5 V-5 S10 S.g100 B C S HR S B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 23.5,
      or: 24.7,
      argent: 28.5,
      bronze: 33.4
    }
  },
  {
    // Chapitre 1 · 3/6 — ACROBATIQUE. Ouverture : chute libre immédiate, depuis l'arrêt (la voiture quitte la plateforme de départ, à 66 m, et
    // se réceptionne sur une descente à 38°). Puis trois sauts de plus en plus grands (bosse, grand tremplin à 38°, dernier saut avec anneau
    // turbo) et un petit saut sur un mur. Réceptions en longues pentes descendantes ; chaque checkpoint est suivi de deux boosters
    // avant la rampe : on peut repartir À L'ARRÊT de n'importe quel checkpoint (la réapparition remet la voiture à l'arrêt) et réussir le saut.
    id: "tremplins",
    name: "Tremplins du Cr\xE9puscule",
    decor: "desert",
    difficulty: 2,
    profil: "acrobatique",
    appris: "D\xE9part : chute libre imm\xE9diate depuis 66 m (la voiture quitte la plateforme de d\xE9part, \xE0 l\u2019arr\xEAt). Au programme : rampes progressives et \xE0 38\xB0, r\xE9ceptions sur longues pentes, checkpoint a\xE9rien, saut sur un mur.",
    goal: {
      id: "perfect",
      n: 2
    },
    opts: {
      l: 16
    },
    pilot: {
      vCap: 60
    },
    script: "start V-5 [dn4] [cdo2] S C B2 S [crv1] UU G2 DD [cdo1] S3 CBR1 S [tr01s] S2< [tr10s] S LL S C B2 S2 [crv2] UX G2 DX DX [cdo2] S3 C B2 S UU GR2 DD [cdo1] S2 finish",
    medals: {
      cristal: 35,
      or: 36.9,
      argent: 42.4,
      bronze: 49.8
    }
  },
  {
    // Chapitre 4 · 3/6 — ROLLERCOASTER (boucles). Ouverture : trois boosters puis DEUX LOOPINGS qui s'enchaînent en S (droite puis gauche). Ensuite deux wall-rides de quatre cases
    // (mur gauche, mur droit) séparés par un virage relevé, un grand looping et un plongeon de 8 niveaux : trois loopings, 15 niveaux de dénivelé.
    id: "hyper",
    name: "Hyperboucle",
    decor: "city",
    difficulty: 3,
    profil: "rollercoaster",
    appris: "D\xE9part : trois boosters \u2192 deux loopings qui s\u2019encha\xEEnent en S. Au programme : trois loopings, deux wall-rides, plongeon de 8 niveaux.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 12
    },
    pilot: {
      vCap: 66
    },
    script: "start B3 O OL S2 B3 [tr01s] S4< [tr10s] S BR S2 B [tr02s] S4> [tr20s] S C B OB S2 B [cdi2] DX [cdo2] S B2 finish",
    medals: {
      cristal: 29.9,
      or: 31.5,
      argent: 36.2,
      bronze: 42.5
    }
  },
  {
    // Chapitre 2 · 2/6 — SPEEDWAY. Ouverture : départ en tube, propulsé par trois boosters, qui débouche directement sur un virage relevé 3×3.
    // Une succession de S relevés (droite / gauche), deux vagues douces, un wall-ride de 5 cases sur le mur gauche (l'autre côté que le canyon
    // du chapitre 1) et un tube à pleine vitesse. Aucun virage serré, plus de 240 km/h pendant plus d'un tiers du tour (35 %).
    id: "canopee",
    name: "Canop\xE9e",
    decor: "jungle",
    difficulty: 3,
    profil: "speedway",
    appris: "D\xE9part : en tube propuls\xE9, qui d\xE9bouche sur un virage relev\xE9 3\xD73. Au programme : S relev\xE9s, wall-ride de 5 cases sur le mur gauche, tube \xE0 pleine vitesse, 35 % du temps au-dessus de 240 km/h.",
    goal: {
      id: "under",
      t: 36
    },
    opts: {
      l: 5
    },
    pilot: {
      vCap: 70
    },
    script: "start TI TM3.b TO BRR S B BLL S [crs1] S2 [cds1] S [tr01l] S5< [tr10l] C B BRR S [crs1] S [cds1] B BLL S2 TB BRR S B BLL S2 B2 finish",
    medals: {
      cristal: 32.6,
      or: 34.3,
      argent: 39.4,
      bronze: 46.3
    }
  },
  {
    // Chapitre 2 · 3/6 — ACROBATIQUE (rebonds). Ouverture : deux boosters → rebond géant (palier 2 niveaux plus haut). Quatre champignons en
    // escalier en zigzag (+8 niveaux), puis un long plongeon. Un checkpoint avant chaque rebond, suivi de deux boosters : on repart de chacun
    // à l'arrêt. La portée d'un rebond est proportionnelle à la vitesse (et non à son carré) : le circuit est finissable à ±40 % de vitesse.
    id: "spores",
    name: "Spores",
    decor: "jungle",
    difficulty: 3,
    profil: "acrobatique",
    appris: "D\xE9part : deux boosters \u2192 rebond g\xE9ant (palier 2 niveaux plus haut). Au programme : quatre champignons en escalier en zigzag (+8 niveaux), plongeon final ; la port\xE9e d\u2019un rebond est proportionnelle \xE0 la vitesse, le circuit est tr\xE8s tol\xE9rant.",
    goal: {
      id: "perfect",
      n: 4
    },
    opts: {
      l: 2
    },
    script: "start B2 S.j200 G1 V2 S3 RR C B2 S.j200 G1 V2 S3 LL C B2 S.j200 G1 V2 S3 RR C B2 S.j200 G1 V2 S3 LL S B [cdi2] DX [cdo2] B [crs1] S [cds1] B2 finish",
    medals: {
      cristal: 33.3,
      or: 35.1,
      argent: 40.3,
      bronze: 47.4
    }
  },
  {
    // Chapitre 3 · 2/6 — TECHNIQUE (bateau). Ouverture : départ SUR L'EAU (plaque bateau juste après la ligne, slalom R L R L dans un chenal).
    // Le bateau glisse et freine peu : les épingles se font en voiture, entre deux chenaux, avec un petit saut sur un mur. L'arrivée se franchit
    // en bateau (objectif bonus), le chenal final sortant directement sur la ligne.
    id: "recif",
    name: "R\xE9cif",
    decor: "isles",
    difficulty: 3,
    profil: "technique",
    appris: "D\xE9part : sur l\u2019eau (plaque bateau, slalom R L R L dans un chenal). Au programme : \xE9pingles en voiture entre deux chenaux, petit saut sur un mur, arriv\xE9e franchie en bateau (objectif bonus).",
    goal: {
      id: "vehicle",
      v: "boat"
    },
    opts: {
      l: 4
    },
    script: "start S.n S2.a R.a L.a R.a L.a S.a S.n B2 S [tr01s] S2< [tr10s] S3 R R B S2 L S L B S3 [cvd05] [cvdL05] B S C S.n S2.a R.a L.a R.a L.a S2.a finish",
    medals: {
      cristal: 34.6,
      or: 36.4,
      argent: 41.8,
      bronze: 49.1
    }
  },
  {
    // Chapitre 3 · 3/6 — ACROBATIQUE (deltaplane). Ouverture : trois boosters, plaque deltaplane et vol de cinq cases au-dessus de la mer. Puis
    // deux sauts de voiture avec anneau turbo, séparés par la montée du phare (hélice de quatre grandes courbes inclinées, +8 niveaux) et un
    // plongeon. La piste qui suit un vol plané est longue : selon l'élan, le deltaplane se pose plus ou moins loin.
    id: "phare",
    name: "Phare",
    decor: "isles",
    difficulty: 3,
    profil: "acrobatique",
    appris: "D\xE9part : trois boosters \u2192 d\xE9collage en deltaplane. Au programme : vol de cinq cases, mont\xE9e du phare (+8 niveaux), deux sauts de voiture avec anneau turbo.",
    goal: {
      id: "rings",
      n: 2
    },
    opts: {
      l: 4
    },
    script: "start B3 S.e UU GR4 DD S5 S.e S C B2 S [crv1] UU GR1 DD [cdo1] S2 CBR2 CBR2 CBR2 CBR2 S C B [cdi2] DX [cdo2] B S2 [crv1] UU GR1 DD [cdo1] S2 B finish",
    medals: {
      cristal: 39.2,
      or: 41.2,
      argent: 47.4,
      bronze: 55.7
    }
  },
  {
    // Chapitre 2 · 4/6 — TECHNIQUE (moto). Ouverture : bifurcation dès le départ ; la voie de droite porte la plaque moto (c'est elle qu'il faut
    // prendre pour finir en moto). Douze virages serrés en slaloms (R L R L), une descente en lacets, un petit saut sur un mur et un
    // booster à chaque relance. Deux autres plaques : la voiture au milieu, la moto de nouveau avant l'arrivée.
    id: "serpent",
    name: "Serpent",
    decor: "jungle",
    difficulty: 3,
    profil: "technique",
    appris: "D\xE9part : bifurcation d\xE8s le d\xE9part : la voie de droite porte la plaque moto. Au programme : douze virages serr\xE9s en slaloms (R L R L), descente en lacets, petit saut sur un mur, moto \u2192 voiture \u2192 moto.",
    goal: {
      id: "vehicle",
      v: "moto"
    },
    opts: {
      l: 8
    },
    script: "start Y2.o B S [cvd05] [cvdL05] [cvd05] [cvdL05] B S S.o S [tr01s] S2< [tr10s] S R L R L B S2 C S.o S R L R L B S2 B finish",
    medals: {
      cristal: 29.3,
      or: 30.8,
      argent: 35.4,
      bronze: 41.6
    }
  },
  {
    // Chapitre 6 · 2/6 — SPEEDWAY (coulée de lave). Ouverture : un booster puis un S de virages relevés 2×2 (droite, gauche) dès les premières cases, avant les virages relevés 3×3.
    // Six virages relevés en tout, un wall-ride de quatre cases (mur droit) et un plongeon de 4 niveaux qui relance la voiture : 36 % du tour au-dessus de 240 km/h, aucun freinage.
    id: "coulee",
    name: "Coul\xE9e Ardente",
    decor: "volcano",
    difficulty: 3,
    profil: "speedway",
    appris: "D\xE9part : un booster \u2192 S de virages relev\xE9s 2\xD72. Au programme : six virages relev\xE9s, wall-ride, plongeon, 4 % de freinage.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 12
    },
    pilot: {
      vCap: 70
    },
    script: "start B BR S BL S BRR S B [tr02l] S4> [tr20l] BLL S2 C B [cdi1] [dn2] [cdo1] BRR S BLL B2 finish",
    medals: {
      cristal: 23.6,
      or: 24.8,
      argent: 28.5,
      bronze: 33.5
    }
  },
  {
    // Chapitre 7 · 2/6 — TECHNIQUE (navette, moto). Ouverture : DÉPART EN MOTO (plaque moto sur la case qui suit la ligne de départ) puis un slalom R L R L immédiat. Huit virages serrés,
    // une chicane sur un mur, une descente de 4 niveaux et un booster à chaque relance ; il n'y a plus de plaque ensuite : l'arrivée se franchit en moto (objectif bonus).
    id: "navette",
    name: "Navette",
    decor: "orbit",
    difficulty: 3,
    profil: "technique",
    appris: "D\xE9part : en moto (plaque), slalom R L R L imm\xE9diat. Au programme : huit virages serr\xE9s, chicane, arriv\xE9e en moto (objectif bonus).",
    goal: {
      id: "vehicle",
      v: "moto"
    },
    opts: {
      l: 8
    },
    script: "start S.o B R L R L B S2 C B S R S L B S2 [tr01s] S2< [tr10s] S R B S L B S [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 25.3,
      or: 26.6,
      argent: 30.6,
      bronze: 36
    }
  },
  {
    // Chapitre 4 · 2/6 — SPRINT. Ouverture : départ SANS BORDURES (deux boosters, six cases à plus de 200 km/h sans la moindre barrière : la trajectoire se joue dès la première seconde).
    // Puis une vague douce, un tunnel de quatre cases pris à pleine vitesse, un seul très grand virage plat et une descente finale. Presque tout droit.
    id: "boulevard",
    name: "Boulevard Sans Fin",
    decor: "city",
    difficulty: 2,
    profil: "sprint",
    appris: "D\xE9part : sans bordures (six cases). Au programme : vague douce, tunnel de quatre cases, un seul tr\xE8s grand virage plat.",
    goal: {
      id: "under",
      t: 21.5
    },
    opts: {
      l: 4
    },
    pilot: {
      vCap: 66
    },
    script: "start B2_ S3_ B_ S [crs1] S2 [cds1] B S B2# S2# C B S3 HR S2 B [cdi1] [dn2] [cdo1] S B2 finish",
    medals: {
      cristal: 19.5,
      or: 20.6,
      argent: 23.6,
      bronze: 27.7
    }
  },
  {
    // Chapitre 1 · 4/6 — ROLLERCOASTER (spirale ; placé avant Lac Gelé pour que deux Rollercoasters ne se suivent pas). Ouverture : trois boosters puis directement un grand looping. Hélice montante de quatre
    // grandes courbes inclinées (16 niveaux, 78 m), point de contrôle au sommet, plongeon de 16 niveaux à 38° et slalom de wall-rides
    // gauche / droite en bas. Le plongeon passe à plus de 240 km/h : les murs se prennent avec une grande marge.
    id: "spirale",
    name: "Spirale Prismatique",
    decor: "desert",
    difficulty: 3,
    profil: "rollercoaster",
    appris: "D\xE9part : trois boosters \u2192 directement un grand looping. Au programme : h\xE9lice montante de 16 niveaux (quatre grandes courbes inclin\xE9es), plongeon de 16 niveaux \xE0 38\xB0, slalom de wall-rides gauche / droite.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 2
    },
    script: "start B3 OB S B CBR4 CBR4 CBR4 CBR4 S C [cdi2] DX DX DX [cdo2] B S [tr01s] S2< [tr10s] S [tr02s] S3> [tr20s] S2 B2 finish",
    medals: {
      cristal: 32.7,
      or: 34.4,
      argent: 39.6,
      bronze: 46.5
    }
  },
  {
    // Chapitre 1 · 4/6 — TECHNIQUE. Ouverture : une épingle descendante dès le départ. Onze virages serrés, des freinages forts avant chaque
    // épingle et un booster à chaque sortie pour exploiter la courbe d'accélération ; de la glace avant les épingles (on ne freine plus
    // dessus), une chicane sur un mur et un checkpoint dans un virage.
    id: "verglas",
    name: "Lac Gel\xE9",
    decor: "desert",
    difficulty: 3,
    profil: "technique",
    appris: "D\xE9part : \xE9pingle descendante d\xE8s le d\xE9part. Au programme : 11 virages serr\xE9s, un booster \xE0 chaque relance, glace avant les \xE9pingles, chicane sur un mur.",
    goal: {
      id: "turbo",
      n: 2
    },
    opts: {
      l: 5
    },
    script: "start [cvd1] [cvd1] B S3 L I B S R L S B S2 R S R B S2 [tr01s] S2< [tr10s] S3 L S L B I S3 KR S R S2 B finish",
    medals: {
      cristal: 32.9,
      or: 34.7,
      argent: 39.9,
      bronze: 46.8
    }
  },
  {
    // Chapitre 5 · 2/6 — ACROBATIQUE (terrasses). Ouverture : un carreau de verglas, deux boosters puis un REBOND qui envoie la voiture sur une terrasse 2 niveaux plus bas. Quatre rebonds de
    // plus en plus puissants (100, 150, 200, 200 %) et de plus en plus longs (vides de 2, 3, 4 et 4 cases) font descendre la voiture de banquise en banquise (8 niveaux), puis un wall-ride et un
    // plongeon de 10 niveaux. À l'inverse de Spores, qui monte en escalier, la Banquise descend. Un checkpoint avant chaque rebond, suivi de deux boosters (on repart de chacun à l'arrêt).
    id: "banquise",
    name: "Banquise Rebondissante",
    decor: "polar",
    difficulty: 3,
    profil: "acrobatique",
    appris: "D\xE9part : verglas, deux boosters, rebond vers une terrasse plus basse. Au programme : quatre rebonds de plus en plus puissants et longs : la Banquise descend de terrasse en terrasse (Spores monte).",
    goal: {
      id: "under",
      t: 31.5
    },
    opts: {
      l: 28
    },
    pilot: {
      vCap: 60
    },
    script: "start I B2 S.j100 G1 V-2 S3.i C B2 S.j150 G2 V-2 S3.i C B2 S.j200 G2 V-2 S3.i C B2 S.j200 G2 V-2 S2.i [tr01s] S3< [tr10s] S2 [cdi2] DX [cdo2] S2 B finish",
    medals: {
      cristal: 28.8,
      or: 30.3,
      argent: 34.8,
      bronze: 40.9
    }
  },
  {
    // Chapitre 2 · 5/6 — ROLLERCOASTER (tonneaux). Ouverture : départ AU PLAFOND (la course commence en gravité inversée, comme des racines qui
    // pendent). Deux tonneaux complets autour de l'axe de la route (plafond → mur gauche → sol → mur droit → plafond), un plongeon de
    // 8 niveaux, un virage relevé, de la boue et du vent, puis un double looping. Les checkpoints sont suivis de boosters.
    id: "racines",
    name: "Racines Boueuses",
    decor: "jungle",
    difficulty: 3,
    profil: "rollercoaster",
    appris: "D\xE9part : au plafond (la course commence en gravit\xE9 invers\xE9e). Au programme : deux tonneaux complets (plafond \u2192 mur gauche \u2192 sol \u2192 mur droit \u2192 plafond), plongeon, virage relev\xE9, boue et vent, double looping.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 10
    },
    script: "start^ B3^ [tr31s] S< [tr10s] [tr02s] S> [tr23s] S^ [tr31s] S< [tr10s] S C B [cdi2] DX [cdo2] S BLL S S.d S.w100 S C B3 OD S2 B finish",
    medals: {
      cristal: 27.7,
      or: 29.2,
      argent: 33.6,
      bronze: 39.4
    }
  },
  {
    // Chapitre 5 · 3/6 — TECHNIQUE (glace et aimants). Ouverture : un TOBOGGAN de 10 niveaux dès le départ, qui débouche sur une glace puis une épingle : il faut avoir freiné à temps.
    // Huit virages serrés, de la glace avant les épingles (on ne freine plus dessus, trois cases de route normale après), une chicane sur un mur et des aimants sur la bosse centrale
    // (la voiture reste collée au sol au lieu de décoller). Un booster à chaque relance.
    id: "glacier",
    name: "Glacier Magn\xE9tique",
    decor: "polar",
    difficulty: 4,
    profil: "technique",
    appris: "D\xE9part : toboggan de 10 niveaux d\xE8s le d\xE9part. Au programme : huit virages serr\xE9s, glace avant les \xE9pingles, aimants sur la bosse centrale.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 12
    },
    script: "start [cdi2] DX [cdo2] S2 I S2 R B S2 L B S I S2 R S L C B S [tr01s] S2< [tr10s] S2 R B S.m [crs1].m S [cds1].m L B S I S2 R S2 L B S2 finish",
    medals: {
      cristal: 35.8,
      or: 37.7,
      argent: 43.3,
      bronze: 50.9
    }
  },
  {
    // Chapitre 4 · 4/6 — TECHNIQUE (métro aérien). Ouverture : un booster puis une MONTÉE EN LACETS (deux courbes montantes serrées : on grimpe jusqu'à la ligne aérienne). Treize virages
    // serrés en tout : slalom sans bordures sur le viaduc, épingles, chicane sur un mur, slalom sous un tunnel ; un booster à chaque relance, près d'un quart du temps au freinage.
    id: "metro",
    name: "M\xE9tro A\xE9rien",
    decor: "city",
    difficulty: 4,
    profil: "technique",
    appris: "D\xE9part : mont\xE9e en lacets : deux courbes montantes serr\xE9es. Au programme : 13 virages serr\xE9s : slalom sans bordures sur le viaduc, \xE9pingles, chicane sur un mur, slalom sous un tunnel.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 2
    },
    script: "start B CVR2 CVR2 S B R_ L_ R_ L_ S B C B S2 R S R B S [tr01s] S2< [tr10s] S B L S R# L# R# L# S2# B [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 30.8,
      or: 32.4,
      argent: 37.3,
      bronze: 43.8
    }
  },
  {
    // Chapitre 6 · 3/6 — TECHNIQUE (basalte). Ouverture : DÉPART SUR UNE PLAQUE DE DÉRIVE (deux cases où l'arrière n'accroche presque plus : le moindre coup de volant fait glisser la voiture),
    // suivie d'un booster. Huit virages serrés dont trois pris sur des dalles de dérive, une chicane sur un mur, une descente de 4 niveaux ; un booster à chaque relance.
    id: "basalte",
    name: "Champs de Basalte",
    decor: "volcano",
    difficulty: 4,
    profil: "technique",
    appris: "D\xE9part : sur une plaque de d\xE9rive (l\u2019arri\xE8re n\u2019accroche presque plus). Au programme : huit virages serr\xE9s dont trois sur d\xE9rive, chicane sur un mur.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 6
    },
    script: "start S2.d B S2 R S L S B R.d L.d S2 C B S [tr01s] S2< [tr10s] S2 R S2.d L B S2 R.d S L B S [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 30.4,
      or: 32,
      argent: 36.7,
      bronze: 43.1
    }
  },
  {
    // Chapitre 2 · 6/6 — TECHNIQUE (tunnels). Ouverture : départ dans un tunnel, avec une épingle immédiate. Douze virages serrés (épingles dans
    // un tube, hélice descendante de quatre virages, slalom R L R L sous un tunnel), un tube pris à pleine vitesse et un booster à
    // chaque relance : freiner fort, relancer fort.
    id: "temple",
    name: "Temple",
    decor: "jungle",
    difficulty: 4,
    profil: "technique",
    appris: "D\xE9part : dans un tunnel, \xE9pingle imm\xE9diate. Au programme : douze virages serr\xE9s (\xE9pingles dans un tube, h\xE9lice descendante, slalom sous un tunnel), un booster \xE0 chaque relance.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 8
    },
    script: "start S# R# R# B# S2# B S3 TI TM2 TO S R R B S2 [cdi1] [dn2] [cdo1] S C S [cvd05] [cvd05] [cvd05] [cvd05] S2 B S R# L# R# L# S2# B finish",
    medals: {
      cristal: 30.8,
      or: 32.4,
      argent: 37.3,
      bronze: 43.8
    }
  },
  {
    // Chapitre 4 · 5/6 — ACROBATIQUE (toits). Ouverture : trois boosters puis un PETIT LOOPING (2×2), pris juste avant la première rampe : la boucle donne l'élan du premier saut de toit.
    // Trois sauts de toit en toit (rampe de 6 niveaux, rampe douce, rampe de 6 niveaux) avec un petit wall-ride sur une façade entre les deux derniers. Chaque checkpoint est suivi de deux boosters et placé loin de la réception précédente.
    id: "tours",
    name: "Tours Jumelles",
    decor: "city",
    difficulty: 4,
    profil: "acrobatique",
    appris: "D\xE9part : trois boosters, petit looping, puis rampe de toit. Au programme : trois sauts de toit en toit, wall-ride sur une fa\xE7ade, r\xE9ception de 10 niveaux.",
    goal: {
      id: "under",
      t: 37.5
    },
    opts: {
      l: 16
    },
    pilot: {
      vCap: 60
    },
    script: "start B3 O S2 B2 [crv2] UX G2 DX DX [cdo2] S3 C B2 [crv1] UU G2 DD [cdo1] S [tr01s] S2< [tr10s] S C B2 [crv2] UX G2 DX DX [cdo2] S5 finish",
    medals: {
      cristal: 34,
      or: 35.7,
      argent: 41.1,
      bronze: 48.3
    }
  },
  {
    // Chapitre 7 · 3/6 — ROLLERCOASTER (ceinture d'astéroïdes). Ouverture : un TIRE-BOUCHON à gauche pris à l'élan (une case, aucun booster) puis trois boosters et directement un grand DOUBLE looping
    // (3×3, version large). Ensuite le checkpoint, un slalom de wall-rides gauche / droite, un tube de deux sections à pleine vitesse et un plongeon de 8 niveaux : 15 niveaux de dénivelé.
    id: "ceinture",
    name: "Ceinture d\u2019Ast\xE9ro\xEFdes",
    decor: "orbit",
    difficulty: 4,
    profil: "rollercoaster",
    appris: "D\xE9part : tire-bouchon \xE0 l\u2019\xE9lan \u2192 trois boosters \u2192 grand double looping. Au programme : slalom de wall-rides, tube, plongeon.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 10
    },
    pilot: {
      vCap: 66
    },
    script: "start S CKL S B3 OBDL S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B TI TM2 TO S B [cdi2] DX [cdo2] S B2 finish",
    medals: {
      cristal: 27.7,
      or: 29.2,
      argent: 33.6,
      bronze: 39.4
    }
  },
  {
    // Chapitre 5 · 4/6 — ROLLERCOASTER (hélices). Ouverture : un TIRE-BOUCHON dès le départ (deux cases d'élan, aucun booster). Puis une première hélice montante de quatre grandes courbes
    // inclinées (16 niveaux), une seconde, descendante et tournant dans l'autre sens (8 niveaux), un double looping et un slalom de wall-rides gauche / droite.
    id: "helice",
    name: "Double H\xE9lice",
    decor: "polar",
    difficulty: 4,
    profil: "rollercoaster",
    appris: "D\xE9part : tire-bouchon pris \xE0 l\u2019\xE9lan, sans booster. Au programme : h\xE9lice montante (16 niveaux) puis descendante dans l\u2019autre sens, double looping, wall-rides.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 2
    },
    pilot: {
      vCap: 66
    },
    script: "start S2 CK S B2 CBR4 CBR4 CBR4 CBR4 S C [cvdBigL2] [cvdBigL2] [cvdBigL2] [cvdBigL2] S B OD S [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 finish",
    medals: {
      cristal: 37.1,
      or: 39.1,
      argent: 44.9,
      bronze: 52.7
    }
  },
  {
    // Chapitre 6 · 4/6 — ROLLERCOASTER (cheminée). Ouverture : trois boosters → un TUBE de deux sections qui débouche directement sur la cheminée, une montée verticale de quatre niveaux
    // (quart de cercle, mur, sommet). Checkpoint au sommet, plongeon de 8 niveaux, grand looping et slalom de wall-rides gauche / droite.
    id: "cheminee",
    name: "Chemin\xE9e du Volcan",
    decor: "volcano",
    difficulty: 4,
    profil: "rollercoaster",
    appris: "D\xE9part : trois boosters \u2192 tube \u2192 mont\xE9e verticale de quatre niveaux. Au programme : plongeon de 8 niveaux, grand looping, slalom de wall-rides.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 2
    },
    pilot: {
      vCap: 66
    },
    script: "start B3 TI TM2 TO QU WA4 CR S C [cdi2] DX [cdo2] B OB S2 B [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 finish",
    medals: {
      cristal: 23.6,
      or: 24.9,
      argent: 28.6,
      bronze: 33.6
    }
  },
  {
    // Chapitre 3 · 4/6 — ROLLERCOASTER (tourbillons). Ouverture : quatre boosters puis directement un grand looping TRIPLE (4×4, 7 niveaux de haut). Ensuite un slalom de
    // wall-rides gauche / droite, un grand double looping et un plongeon de 8 niveaux : plus de 15 niveaux de dénivelé et deux murs.
    id: "vrille",
    name: "Tourbillon Tropical",
    decor: "isles",
    difficulty: 4,
    profil: "rollercoaster",
    appris: "D\xE9part : quatre boosters \u2192 looping triple (4\xD74). Au programme : slalom de wall-rides gauche / droite, grand double looping, plongeon de 8 niveaux : 15 niveaux de d\xE9nivel\xE9.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 8
    },
    pilot: {
      vCap: 66
    },
    script: "start B4 OBT S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B OBDL S C B2 [cdi2] DX [cdo2] S B2 finish",
    medals: {
      cristal: 32.9,
      or: 34.7,
      argent: 39.9,
      bronze: 46.8
    }
  },
  {
    // Chapitre 1 · 5/6 — ROLLERCOASTER. Ouverture : trois boosters puis une montée verticale (montée en L, mur de 3, sommet). Chute depuis le
    // sommet, un virage relevé, un slalom de wall-rides gauche / droite, un grand looping, puis une arche mur → plafond → mur.
    // Verticalité : 9 niveaux (45 m) ; plus de 18 cases sur un mur.
    id: "grandtour",
    name: "Le Grand Tour",
    decor: "desert",
    difficulty: 4,
    profil: "rollercoaster",
    appris: "D\xE9part : trois boosters \u2192 mont\xE9e verticale (mont\xE9e en L, mur, sommet). Au programme : chute, slalom de wall-rides gauche / droite, grand looping, arche mur \u2192 plafond \u2192 mur.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 3
    },
    script: "start B3 QU WA3 CR S [cdi2] DX [cdo2] B BRR S [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 OB S C S [tr01s] S2< [tr13s] S2^ [tr31s] S2< [tr10s] S B2 finish",
    medals: {
      cristal: 34,
      or: 35.7,
      argent: 41.1,
      bronze: 48.3
    }
  },
  {
    // Chapitre 7 · 4/6 — SPEEDWAY (circuit fermé, 3 tours). Ouverture : deux boosters puis UN TUBE COURT (2×2) pris à pleine vitesse, directement suivi du premier virage relevé. Quatre virages
    // relevés 3×3 forment l'anneau, avec un wall-ride de deux cases sur le mur gauche (côté intérieur de l'anneau). Sur trois tours, 58 % du temps au-dessus de 240 km/h.
    id: "grandanneau",
    name: "Grand Anneau",
    decor: "orbit",
    difficulty: 4,
    profil: "speedway",
    appris: "D\xE9part : deux boosters \u2192 tube court ; circuit ferm\xE9, 3 tours. Au programme : quatre virages relev\xE9s, wall-ride, 58 % au-dessus de 240 km/h.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 70
    },
    laps: 3,
    script: "start B2 TB S2 BRR B S2 C S2 B BRR S [tr01l] S2< [tr10l] S BRR S B S2 B S2 BRR finish",
    medals: {
      cristal: 64,
      or: 67.3,
      argent: 77.4,
      bronze: 90.9
    }
  },
  {
    // Chapitre 3 · 5/6 — ACROBATIQUE (gravité lunaire). Ouverture : la plaque de départ règle la gravité à 50 % ; la voiture quitte la plateforme au pas, flotte de 6 niveaux et se
    // réceptionne sur une pente à 4 niveaux. Trois grands sauts de cinq cases (la portée est doublée par la basse gravité) avec de longues réceptions ; chaque rampe est précédée d'un
    // checkpoint et de deux boosters (on repart de chacun à l'arrêt).
    id: "lunaire",
    name: "Sauts Lunaires",
    decor: "isles",
    difficulty: 4,
    profil: "acrobatique",
    appris: "D\xE9part : la plaque de d\xE9part r\xE8gle la gravit\xE9 \xE0 50 % : la voiture flotte de 6 niveaux. Au programme : trois sauts de cinq cases en basse gravit\xE9, longues r\xE9ceptions.",
    goal: {
      id: "perfect",
      n: 2
    },
    opts: {
      l: 28
    },
    script: "start S.g50 G2 V-6 [dn4] [cdo2] S C B2 S [crv1] UU G3 DD [cdo1] [crs1] S2 [cds1] C B2 S [crv1] UU G3 DD [cdo1] [crs1] S2 [cds1] C B2 S [crv1] UU G3 DD [cdo1] S5 finish",
    medals: {
      cristal: 37.4,
      or: 39.3,
      argent: 45.2,
      bronze: 53.1
    }
  },
  {
    // Chapitre 5 · 5/6 — SPEEDWAY. Ouverture : DIRECTEMENT DANS UN TRÈS GRAND VIRAGE RELEVÉ, sans un seul booster : la voiture l'aborde au pas et les boosters la relancent à la sortie.
    // Six virages relevés 3×3 en couronne (droite, gauche, droite…), un wall-ride de quatre cases (mur droit) et des boosters en sortie de virage : 60 % du tour au-dessus de 240 km/h.
    id: "couronne",
    name: "Couronne Bor\xE9ale",
    decor: "polar",
    difficulty: 5,
    profil: "speedway",
    appris: "D\xE9part : directement dans un tr\xE8s grand virage relev\xE9, sans booster. Au programme : six virages relev\xE9s en couronne, wall-ride, 60 % du tour au-dessus de 240 km/h.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 70
    },
    script: "start BRR B3 S BLL S2 B BRR C S [tr02l] S4> [tr20l] BLL B S2 BRR B S BLL B2 finish",
    medals: {
      cristal: 25.6,
      or: 27,
      argent: 31,
      bronze: 36.4
    }
  },
  {
    // Chapitre 6 · 5/6 — SPEEDWAY (circuit fermé, 2 tours). Ouverture : deux boosters puis UNE MONTÉE DOUCE de quatre cases (2 niveaux) vers la crête du cratère. Quatre virages relevés 3×3
    // forment l'anneau, avec un wall-ride de quatre cases sur la paroi (mur droit) et la descente douce du retour. Sur deux tours, 64 % du temps au-dessus de 240 km/h.
    id: "caldeira",
    name: "Caldeira",
    decor: "volcano",
    difficulty: 5,
    profil: "speedway",
    appris: "D\xE9part : deux boosters \u2192 mont\xE9e douce vers la cr\xEAte ; circuit ferm\xE9, 2 tours. Au programme : quatre virages relev\xE9s en anneau, wall-ride, 64 % du temps au-dessus de 240 km/h.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 70
    },
    laps: 2,
    script: "start B2 GU4 S BRR B S [tr02l] S4> [tr20l] BRR B S2 C GD4 S BRR S B S2 B S2 B S2 BRR finish",
    medals: {
      cristal: 50.8,
      or: 53.4,
      argent: 61.4,
      bronze: 72.1
    }
  },
  {
    // Chapitre 5 · 6/6 — TECHNIQUE (tempête). Ouverture : départ dans la POUDREUSE (deux cases de neige épaisse qui freinent la voiture, puis un booster). Neuf virages serrés, du vent
    // latéral avant les épingles, de la neige épaisse en sortie de virage, une chicane sur un mur et une descente finale de 4 niveaux ; un booster à chaque relance.
    id: "blizzard",
    name: "Blizzard",
    decor: "polar",
    difficulty: 5,
    profil: "technique",
    appris: "D\xE9part : dans la poudreuse. Au programme : neuf virages serr\xE9s, vent avant les \xE9pingles, neige \xE9paisse en sortie.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 8
    },
    script: "start S2.p B S2 R S.w150 L S B S2.p R S L B C B S3.w120 R S R S B S2 [tr01s] S2< [tr10s] S L B S.p R S L B S [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 35.2,
      or: 37.1,
      argent: 42.6,
      bronze: 50.1
    }
  },
  {
    // Chapitre 4 · 6/6 — ROLLERCOASTER (viaduc). Ouverture : trois boosters → LIFT HILL, une montée de 16 niveaux (80 m) en deux rampes à forte pente. Au sommet un checkpoint, puis un
    // plongeon de 12 niveaux, un grand looping et un slalom de wall-rides gauche / droite. Le plongeon passe à plus de 240 km/h : les murs se prennent avec une grande marge.
    id: "viaduc",
    name: "Viaduc Vertical",
    decor: "city",
    difficulty: 5,
    profil: "rollercoaster",
    appris: "D\xE9part : trois boosters \u2192 lift hill de 16 niveaux. Au programme : plongeon de 12 niveaux, grand looping, slalom de wall-rides.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 2
    },
    pilot: {
      vCap: 66
    },
    script: "start B3 [crv4] UX.b UX.b [cro4] S5 C S2 [cdi2] DX DX [cdo2] B OB S2 B [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 finish",
    medals: {
      cristal: 30.1,
      or: 31.6,
      argent: 36.4,
      bronze: 42.7
    }
  },
  {
    // Chapitre 3 · 6/6 — SPEEDWAY. Ouverture : AUCUN booster, une pente douce de six cases (3 niveaux) lance la voiture dans un très grand virage relevé. Cinq virages relevés 3×3,
    // un wall-ride de quatre cases sur la falaise (mur droit), un plongeon de quatre niveaux et des boosters placés en sortie de virage : plus de la moitié du tour (61 %) au-dessus de 240 km/h,
    // moins de 8 % de freinage.
    id: "archipel",
    name: "Grand Archipel",
    decor: "isles",
    difficulty: 5,
    profil: "speedway",
    appris: "D\xE9part : aucun booster : une pente douce de six cases lance dans un tr\xE8s grand virage relev\xE9. Au programme : cinq virages relev\xE9s, wall-ride de quatre cases, plongeon, 61 % du tour au-dessus de 240 km/h.",
    goal: {
      id: "under",
      t: 30
    },
    opts: {
      l: 8
    },
    pilot: {
      vCap: 70
    },
    script: "start GD6 BRR S B BLL S2 C B [tr02l] S4> [tr20l] BRR S [cdi1] [dn2] [cdo1] B BLL S2 B BRR S2 B2 finish",
    medals: {
      cristal: 27,
      or: 28.5,
      argent: 32.7,
      bronze: 38.4
    }
  },
  {
    // Chapitre 7 · 5/6 — ACROBATIQUE (apesanteur). Ouverture : deux boosters puis une plaque de gravité à 20 % : la voiture quitte la rampe et flotte sur plus de vingt cases. Trois sauts de
    // 8 à 10 secondes en l'air chacun, 28 niveaux de dénivelé en tout. Entre les sauts : checkpoint et boosters, un wall-ride gauche puis un wall-ride droit. Chaque saut se réceptionne sur une
    // longue descente, très tolérante à la vitesse.
    id: "apesanteur",
    name: "Apesanteur",
    decor: "orbit",
    difficulty: 5,
    profil: "acrobatique",
    appris: "D\xE9part : deux boosters \u2192 plaque de gravit\xE9 20 %. Au programme : trois vols de 8 \xE0 10 s en l\u2019air (28 niveaux de d\xE9nivel\xE9), wall-rides.",
    goal: {
      id: "under",
      t: 57
    },
    opts: {
      l: 44
    },
    pilot: {
      vCap: 60
    },
    script: "start B2 S.g20 [crv1] UU G8 D D D D D D D D S3 C B2 [crv1] UU G8 D D D D D D D D S [tr01s] S2< [tr10s] S [tr02s] S2> [tr20s] S C B2 [crv1] UU G8 D D D D D D D D S5 finish",
    medals: {
      cristal: 51.8,
      or: 54.6,
      argent: 62.7,
      bronze: 73.6
    }
  },
  {
    // Chapitre 6 · 6/6 — ACROBATIQUE (éruptions). Ouverture : trois boosters → une rampe à forte pente SANS virage d'entrée : un saut de cinq cases qui retombe dix niveaux plus bas. Quatre
    // éruptions en tout (rampe forte, rampe douce avec anneau turbo, wall-ride entre les deux, rampe forte, rampe douce), chaque checkpoint suivi de deux boosters et placé loin de la réception
    // précédente.
    id: "eruption",
    name: "\xC9ruption",
    decor: "volcano",
    difficulty: 5,
    profil: "acrobatique",
    appris: "D\xE9part : trois boosters \u2192 rampe sans virage d\u2019entr\xE9e : saut de cinq cases, r\xE9ception 10 niveaux plus bas. Au programme : quatre \xE9ruptions, anneau turbo, wall-ride.",
    goal: {
      id: "under",
      t: 38.5
    },
    opts: {
      l: 16
    },
    pilot: {
      vCap: 60
    },
    script: "start B3 UX G2 DX DX [cdo2] S3 C B2 [crv1] UU GR2 DD [cdo1] S [tr01s] S2< [tr10s] S C B2 [crv2] UX G2 DX DX [cdo2] S3 C B2 [crv1] UU G2 DD [cdo1] S5 finish",
    medals: {
      cristal: 34.9,
      or: 36.7,
      argent: 42.2,
      bronze: 49.6
    }
  },
  {
    // Chapitre 7 · 6/6 — TECHNIQUE (station). Ouverture : DÉPART SUR UNE PLATEFORME d'amarrage (deux cases de plateforme, large et plate), un booster puis une première épingle.
    // Neuf virages serrés (épingles et un slalom R L R L), une chicane sur un mur, une descente finale de 4 niveaux ; près de 30 % du temps au freinage et un booster à chaque relance.
    id: "zenith",
    name: "Station Z\xE9nith",
    decor: "orbit",
    difficulty: 5,
    profil: "technique",
    appris: "D\xE9part : sur une plateforme d\u2019amarrage. Au programme : neuf virages serr\xE9s, chicane sur un mur.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 6
    },
    script: "start P2 B S R B S L S R B S2 C B S L R L R B S2 [tr01s] S2< [tr10s] S3 L B S R B [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 29.5,
      or: 31,
      argent: 35.7,
      bronze: 41.9
    }
  },
  // ==== 0.9 : quatre nouveaux thèmes (6 circuits chacun) ============================
  // ---- Fonds marins : courants (tapis roulants), eau et bateau, bulles de verre ----
  {
    // Chapitre 8 · 1/6 — SPRINT (courants). Ouverture : deux boosters, puis un CONTRE-COURANT (deux cases de tapis roulant à contresens, −122 km/h) qui freine la voiture, aussitôt suivi d'un courant
    // favorable (+138 km/h, deux cases) qui la relance. Puis une vague douce, un très grand virage plat, un tapis de trois cases, un dernier virage et une descente de 4 niveaux. Les tapis sont loin des virages.
    id: "courant",
    name: "Courant Chaud",
    decor: "reef",
    difficulty: 2,
    profil: "sprint",
    appris: "D\xE9part : deux boosters \u2192 contre-courant (\u2212122 km/h) puis courant favorable (+138 km/h). Au programme : vague, tr\xE8s grand virage plat, tapis de trois cases.",
    goal: {
      id: "under",
      t: 22.5
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    script: "start B2 S2.t40 S2.t170 S [crs1] S2 [cds1] B HR S3.t137 B C S2 HL S2 B [cdi1] [dn2] [cdo1] S B2 finish",
    medals: {
      cristal: 20.5,
      or: 21.6,
      argent: 24.8,
      bronze: 29.1
    }
  },
  {
    // Chapitre 8 · 2/6 — TECHNIQUE (corail). Ouverture : un booster, puis un COURANT FAVORABLE (+72 km/h sur deux cases) qui lance la voiture vers un premier virage serré. Huit virages serrés,
    // une dalle de verre fragile en sortie de virage, une chicane sur un mur et une descente de 4 niveaux ; un booster à chaque relance.
    id: "corail",
    name: "Jardin de Corail",
    decor: "reef",
    difficulty: 3,
    profil: "technique",
    appris: "D\xE9part : un booster \u2192 courant favorable vers une premi\xE8re \xE9pingle. Au programme : huit virages serr\xE9s, dalle de verre fragile, chicane.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 6
    },
    script: "start B S2.t137 S2 R S L S R S L B C B S R S2.v S L B S2 [tr01s] S2< [tr10s] S R B S L B S [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 29.5,
      or: 31,
      argent: 35.7,
      bronze: 41.9
    }
  },
  {
    // Chapitre 8 · 3/6 — ROLLERCOASTER (épave). Ouverture : trois boosters puis directement un WALL-RIDE sur le mur droit (le flanc de la coque, trois cases à plus de 200 km/h). Puis le
    // checkpoint, un double looping, un second wall-ride sur le mur gauche et un plongeon de 8 niveaux.
    id: "epave",
    name: "\xC9pave Engloutie",
    decor: "reef",
    difficulty: 3,
    profil: "rollercoaster",
    appris: "D\xE9part : trois boosters \u2192 wall-ride sur le flanc de la coque. Au programme : double looping, second wall-ride, plongeon de 8 niveaux.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 12
    },
    pilot: {
      vCap: 66
    },
    script: "start B3 [tr02s] S3> [tr20s] S C B2 OD S2 B [tr01s] S3< [tr10s] S B [cdi2] DX [cdo2] S B2 finish",
    medals: {
      cristal: 20.5,
      or: 21.5,
      argent: 24.8,
      bronze: 29.1
    }
  },
  {
    // Chapitre 8 · 4/6 — ACROBATIQUE (gravité lourde). Ouverture : cinq boosters puis une plaque de GRAVITÉ À 130 % (la pression des profondeurs) : la voiture flotte moins, elle tombe plus vite (à 200 %, plus aucune rampe ne se franchissait : les pentes freinent trop).
    // Rampes raides mais vides très courts (1 ou 2 cases) : quatre sauts brefs de moins de deux secondes, réceptions violentes sur des pentes à forte inclinaison, un wall-ride avant le dernier saut.
    // Chaque checkpoint est suivi de deux boosters ; la gravité lourde reste active jusqu'à l'arrivée.
    id: "meduses",
    name: "M\xE9duses \xC9lectriques",
    decor: "reef",
    difficulty: 4,
    profil: "acrobatique",
    appris: "D\xE9part : cinq boosters \u2192 plaque de gravit\xE9 130 % (la pression des profondeurs). Au programme : quatre sauts brefs, r\xE9ceptions violentes, wall-ride.",
    goal: {
      id: "under",
      t: 43
    },
    opts: {
      l: 24
    },
    pilot: {
      vCap: 66
    },
    script: "start B5 S.g130 S2 [crv2] UX G1 DX DX [cdo2] S3 C B3 [crv2] UX G1 DX DX [cdo2] S3 C B3 [crv1] UU G1 DD [cdo1] S [tr01s] S2< [tr10s] S3 C B3 [crv2] UX G1 DX DX [cdo2] S5 finish",
    medals: {
      cristal: 39.1,
      or: 41.1,
      argent: 47.3,
      bronze: 55.5
    }
  },
  {
    // Chapitre 8 · 5/6 — ROLLERCOASTER (abysses). Ouverture : un booster puis un PLONGEON de 12 niveaux (deux rampes à forte pente) qui débouche directement sur un grand looping au fond.
    // Puis un slalom de wall-rides gauche / droite et la remontée en hélice (deux grandes courbes inclinées, 8 niveaux).
    id: "abysses",
    name: "Abysses",
    decor: "reef",
    difficulty: 4,
    profil: "rollercoaster",
    appris: "D\xE9part : un booster \u2192 plongeon de 12 niveaux \u2192 grand looping au fond. Au programme : slalom de wall-rides, remont\xE9e en h\xE9lice.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 22
    },
    pilot: {
      vCap: 66
    },
    script: "start B [cdi2] DX DX [cdo2] OB S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 CBR4 CBR4 S B finish",
    medals: {
      cristal: 23.2,
      or: 24.5,
      argent: 28.1,
      bronze: 33
    }
  },
  {
    // Chapitre 8 · 6/6 — SPEEDWAY (barrière). Ouverture : deux boosters puis un PONT DE VERRE (trois dalles fragiles, sans danger à grande vitesse) qui débouche sur un virage relevé 3×3.
    // Cinq virages relevés, un wall-ride de quatre cases (mur droit) et un courant favorable de deux cases entre deux virages : 62 % du tour au-dessus de 240 km/h.
    id: "barriere",
    name: "Grande Barri\xE8re",
    decor: "reef",
    difficulty: 5,
    profil: "speedway",
    appris: "D\xE9part : deux boosters \u2192 pont de verre \u2192 virage relev\xE9. Au programme : cinq virages relev\xE9s, wall-ride, courant favorable, 62 % au-dessus de 240 km/h.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 70
    },
    script: "start B2 S3.v BRR S B BLL S2 C B [tr02l] S4> [tr20l] BRR S2.t137 BLL B S BRR S B2 finish",
    medals: {
      cristal: 22.9,
      or: 24.1,
      argent: 27.7,
      bronze: 32.6
    }
  },
  // ---- Usine mécanique : obstacles, tapis, moteur coupé, ascenseurs ----
  {
    // Chapitre 9 · 1/6 — SPRINT (chaîne). Ouverture : trois boosters puis TROIS CASES À MOTEUR COUPÉ : la voiture file sur son élan sans pouvoir accélérer, avant de reprendre un booster et un tapis roulant
    // (+72 km/h). Puis une vague douce, deux très grands virages plats (droite, gauche) et une descente finale de 4 niveaux. Un bumper et des piques sur les bords de la route.
    id: "chaine",
    name: "Cha\xEEne de Montage",
    decor: "factory",
    difficulty: 2,
    profil: "sprint",
    appris: "D\xE9part : trois boosters \u2192 trois cases \xE0 moteur coup\xE9. Au programme : tapis roulant, vague, deux tr\xE8s grands virages plats ; bumper et piques sur les bords.",
    goal: {
      id: "under",
      t: 22
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    obst: [
      {
        k: "bumper",
        at: 0.3,
        side: 7.5,
        s: 0.8
      },
      {
        k: "spikes",
        at: 0.6,
        side: -7.5,
        s: 0.7
      }
    ],
    script: "start B3 S3.c B S2.t137 S [crs1] S2 [cds1] B HR S2 B C S HL S2 B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 20.1,
      or: 21.2,
      argent: 24.4,
      bronze: 28.6
    }
  },
  {
    // Chapitre 9 · 2/6 — TECHNIQUE (laminoir). Ouverture : BIFURCATION dès le départ : la voie de droite porte un booster (c'est la voie rapide, celle que suit le pilote), l'autre reste neutre.
    // Huit virages serrés (slaloms, épingles), une dalle ralentisseur entre deux épingles, une chicane sur un mur, une descente de 4 niveaux ; un booster à chaque relance. Un bumper et des piques sur les bords.
    id: "laminoir",
    name: "Laminoir",
    decor: "factory",
    difficulty: 3,
    profil: "technique",
    appris: "D\xE9part : bifurcation : la voie de droite porte un booster. Au programme : huit virages serr\xE9s, ralentisseur, chicane ; bumper et piques.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 6
    },
    obst: [
      {
        k: "bumper",
        at: 0.3,
        side: -7.5,
        s: 0.8
      },
      {
        k: "spikes",
        at: 0.8,
        side: 7.5,
        s: 0.7
      }
    ],
    script: "start Y2.b B S R S L S R S L B C B S R S2.x S L B S2 [tr01s] S2< [tr10s] S R B S L B S [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 34.5,
      or: 36.3,
      argent: 41.7,
      bronze: 49
    }
  },
  {
    // Chapitre 9 · 3/6 — ROLLERCOASTER (rouages). Ouverture : deux boosters puis directement une HÉLICE montante (quatre grandes courbes inclinées : 8 niveaux, comme le pas d'une vis). Ensuite le checkpoint,
    // un looping TRIPLE (4×4, petit format), un slalom de wall-rides gauche / droite et un plongeon de 8 niveaux. Des piques escamotables sur le bord de la route.
    id: "engrenages",
    name: "Engrenages",
    decor: "factory",
    difficulty: 3,
    profil: "rollercoaster",
    appris: "D\xE9part : deux boosters \u2192 h\xE9lice montante de 8 niveaux. Au programme : looping triple, wall-rides, plongeon ; piques escamotables.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 10
    },
    pilot: {
      vCap: 66
    },
    obst: [
      {
        k: "spikesPop",
        at: 0.45,
        side: 6.5,
        s: 0.75
      }
    ],
    script: "start B2 CBR2 CBR2 CBR2 CBR2 S C B2 OTL S2 B [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B [cdi2] DX [cdo2] S B2 finish",
    medals: {
      cristal: 29.9,
      or: 31.5,
      argent: 36.2,
      bronze: 42.5
    }
  },
  {
    // Chapitre 9 · 4/6 — SPEEDWAY (fonderie). Ouverture : trois boosters puis UN TUNNEL de quatre cases pris à plus de 240 km/h, directement suivi d'un très grand virage relevé. Cinq virages relevés 3×3,
    // un wall-ride de quatre cases (mur droit), deux cases à moteur coupé entre deux virages (la voiture file sur son élan) et deux bumpers sur les bords.
    id: "fonderie",
    name: "Fonderie",
    decor: "factory",
    difficulty: 4,
    profil: "speedway",
    appris: "D\xE9part : trois boosters \u2192 tunnel de quatre cases \u2192 virage relev\xE9. Au programme : cinq virages relev\xE9s, wall-ride, deux cases \xE0 moteur coup\xE9, bumpers.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 70
    },
    obst: [
      {
        k: "bumper",
        at: 0.35,
        side: -7.5,
        s: 0.8
      },
      {
        k: "bumper",
        at: 0.75,
        side: 7.5,
        s: 0.8
      }
    ],
    script: "start B3 S4# BRR S B BLL S2 C B [tr02l] S4> [tr20l] BRR S2.c BLL B S BRR S B2 finish",
    medals: {
      cristal: 24.9,
      or: 26.2,
      argent: 30.1,
      bronze: 35.4
    }
  },
  {
    // Chapitre 9 · 5/6 — ACROBATIQUE (pistons). Ouverture : deux boosters puis UN TAPIS DE QUATRE PISTONS (quatre rebonds à 150 % qui s'enchaînent sans que la voiture touche le sol plus d'un instant).
    // Puis une rampe raide, un rebond vers une terrasse 2 niveaux plus bas, un wall-ride et une rampe douce. Chaque checkpoint est suivi de deux boosters. Piques escamotables et bumper sur les bords.
    id: "presse",
    name: "Presse Hydraulique",
    decor: "factory",
    difficulty: 4,
    profil: "acrobatique",
    appris: "D\xE9part : deux boosters \u2192 tapis de quatre pistons (rebonds en cha\xEEne). Au programme : rampe raide, rebond vers une terrasse, wall-ride, rampe douce.",
    goal: {
      id: "under",
      t: 35
    },
    opts: {
      l: 20
    },
    pilot: {
      vCap: 60
    },
    obst: [
      {
        k: "spikesPop",
        at: 0.2,
        side: -6.5,
        s: 0.75
      },
      {
        k: "bumper",
        at: 0.6,
        side: 7.5,
        s: 0.8
      }
    ],
    script: "start B2 S4.j150 S3 C B2 [crv2] UX G2 DX DX [cdo2] S3 C B2 S.j150 G2 V-2 S3 [tr01s] S2< [tr10s] S C B2 [crv1] UU G2 DD [cdo1] S5 finish",
    medals: {
      cristal: 31.8,
      or: 33.5,
      argent: 38.5,
      bronze: 45.2
    }
  },
  {
    // Chapitre 9 · 6/6 — TECHNIQUE (usine folle). Ouverture : deux boosters puis DEUX DALLES RALENTISSEUR (freinage forcé) juste avant le slalom R L R L. Neuf virages serrés, une zone moteur coupé, une chicane
    // sur un mur, une descente de 4 niveaux et un booster à chaque relance. Un marteau tournant au milieu de la route (à passer au bon moment) et, sur les bords, des piques et un bumper.
    id: "usinefolle",
    name: "Usine Folle",
    decor: "factory",
    difficulty: 5,
    profil: "technique",
    appris: "D\xE9part : deux boosters \u2192 deux dalles ralentisseur juste avant le slalom. Au programme : neuf virages serr\xE9s, moteur coup\xE9, chicane ; marteau, piques, bumper.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 8
    },
    obst: [
      {
        k: "hammer",
        at: 0.35,
        side: 0,
        s: 1
      },
      {
        k: "spikes",
        at: 0.5,
        side: 7.5,
        s: 0.7
      },
      {
        k: "bumper",
        at: 0.9,
        side: -7.5,
        s: 0.8
      }
    ],
    script: "start B2 S2.x R L R L B S2 C B S R S L B S2.c S2 [tr01s] S2< [tr10s] S R B S L B S R B [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 29.7,
      or: 31.2,
      argent: 35.9,
      bronze: 42.2
    }
  },
  // ---- Ville dans les nuages : vent, deltaplane, gravité faible, sauts ----
  {
    // Chapitre 10 · 1/6 — SPRINT (premier envol). Ouverture : trois boosters puis TROIS CASES DE VENT LATÉRAL : le vent pousse la voiture de côté et la trajectoire se corrige dès le départ.
    // Puis une vague en S, deux très grands virages plats (droite, gauche) et une descente finale de 4 niveaux. Presque tout droit.
    id: "envol",
    name: "Premier Envol",
    decor: "sky",
    difficulty: 2,
    profil: "sprint",
    appris: "D\xE9part : trois boosters \u2192 vent lat\xE9ral. Au programme : vague en S, deux tr\xE8s grands virages plats, descente.",
    goal: {
      id: "under",
      t: 21
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    script: "start B3 S3.w150 S [crs1] S2 [cds1] B HR S2 B C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 19.3,
      or: 20.3,
      argent: 23.3,
      bronze: 27.4
    }
  },
  {
    // Chapitre 10 · 2/6 — ACROBATIQUE (îles suspendues). Ouverture : trois boosters puis une rampe SANS BORDURES (les îles sont des plateformes sans barrière) : la voiture passe un anneau turbo et se pose
    // sur une île plus basse. Trois sauts (rampe douce avec anneau, rampe forte, rampe douce avec anneau) avec un petit wall-ride entre les deux derniers. Chaque checkpoint est suivi de deux boosters.
    id: "suspendues",
    name: "\xCEles Suspendues",
    decor: "sky",
    difficulty: 3,
    profil: "acrobatique",
    appris: "D\xE9part : trois boosters \u2192 rampe sans bordures (les \xEEles n\u2019ont pas de barri\xE8re). Au programme : trois sauts avec anneaux turbo, wall-ride.",
    goal: {
      id: "under",
      t: 31.5
    },
    opts: {
      l: 20
    },
    pilot: {
      vCap: 60
    },
    script: "start B3_ [crv1]_ UU_ GR2 DD_ [cdo1]_ S3_ C B2_ [crv2]_ UX_ G2 DX_ DX_ [cdo2]_ S3_ C B2_ [tr01s] S2< [tr10s] B_ S_ [crv1]_ UU_ GR2 DD_ [cdo1]_ S5_ finish",
    medals: {
      cristal: 28.4,
      or: 29.9,
      argent: 34.4,
      bronze: 40.4
    }
  },
  {
    // Chapitre 10 · 3/6 — TECHNIQUE (rafales). Ouverture : deux boosters puis DEUX CASES DE VENT LATÉRAL FORT (180 %) avant le premier virage serré : la voiture arrive de travers. Neuf virages serrés,
    // du vent à chaque relance (150 %, 120 %), une chicane sur un mur, une descente de 4 niveaux ; un booster à chaque relance.
    id: "rafales",
    name: "Rafales",
    decor: "sky",
    difficulty: 4,
    profil: "technique",
    appris: "D\xE9part : deux boosters \u2192 vent fort (180 %) juste avant la premi\xE8re \xE9pingle. Au programme : neuf virages serr\xE9s, du vent \xE0 chaque relance.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 6
    },
    script: "start B2 S2.w180 S R S L S R B S2 C B S.w150 S2 R S L B S2.w120 S R S L B S [tr01s] S2< [tr10s] S3 R B S2 L B S [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 35.5,
      or: 37.3,
      argent: 42.9,
      bronze: 50.4
    }
  },
  {
    // Chapitre 10 · 4/6 — ROLLERCOASTER (montgolfières, gravité réduite). Ouverture : trois boosters, une plaque de gravité à 40 % puis directement un grand looping (la boucle se prend plus facilement,
    // mais la voiture flotte). Ensuite un slalom de wall-rides gauche / droite et un plongeon de 8 niveaux ; une plaque à 100 % rétablit la pesanteur avant l'arrivée.
    id: "montgolfieres",
    name: "Montgolfi\xE8res",
    decor: "sky",
    difficulty: 4,
    profil: "rollercoaster",
    appris: "D\xE9part : trois boosters \u2192 plaque de gravit\xE9 40 % \u2192 grand looping. Au programme : slalom de wall-rides, plongeon, pesanteur r\xE9tablie avant l\u2019arriv\xE9e.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 10
    },
    pilot: {
      vCap: 66
    },
    script: "start B3 S.g40 OB S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B [cdi2] DX [cdo2] S.g100 B2 finish",
    medals: {
      cristal: 19.8,
      or: 20.9,
      argent: 24,
      bronze: 28.2
    }
  },
  {
    // Chapitre 10 · 5/6 — SPEEDWAY (pont des vents). Ouverture : deux boosters puis du VENT LATÉRAL sur un pont SANS BORDURES, directement suivi d'un très grand virage relevé lui aussi sans bordure.
    // Quatre virages relevés, un wall-ride de quatre cases (mur droit) et un second coup de vent : tout le tour est sans barrière, 60 % du temps au-dessus de 240 km/h.
    id: "pontvents",
    name: "Pont des Vents",
    decor: "sky",
    difficulty: 5,
    profil: "speedway",
    appris: "D\xE9part : deux boosters \u2192 vent sur un pont sans bordures \u2192 virage relev\xE9 sans bordure. Au programme : quatre virages relev\xE9s, wall-ride, 60 % au-dessus de 240 km/h.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 70
    },
    script: "start B2_ S2.w150_ BRR_ S_ B_ BLL_ S2_ C B_ [tr02l] S4> [tr20l] BRR_ S2.w100_ B_ BLL_ S_ B2 finish",
    medals: {
      cristal: 20.8,
      or: 21.9,
      argent: 25.2,
      bronze: 29.6
    }
  },
  {
    // Chapitre 10 · 6/6 — ACROBATIQUE (cité céleste). Ouverture : DÉPART EN DELTAPLANE depuis le bord du toit (plaque deltaplane juste après la ligne, chute de 6 niveaux) : la voiture plane vers une
    // avenue de 10 cases, où une seconde plaque la rend à la voiture. Puis une rampe raide, un wall-ride sur une façade et une rampe douce avec anneau turbo. Les checkpoints sont suivis de deux boosters.
    id: "cite",
    name: "Cit\xE9 C\xE9leste",
    decor: "sky",
    difficulty: 5,
    profil: "acrobatique",
    appris: "D\xE9part : en deltaplane : plaque sur la ligne, chute de 6 niveaux. Au programme : avenue de 10 cases, rampe raide, wall-ride, rampe douce avec anneau.",
    goal: {
      id: "under",
      t: 42
    },
    opts: {
      l: 40
    },
    pilot: {
      vCap: 60
    },
    script: "start S.e G2 V-6 [dn4] [cdo2] S10 S.e S2 C B2 [crv2] UX G2 DX DX [cdo2] S3 C B2 [tr01s] S2< [tr10s] S C B2 [crv1] UU GR2 DD [cdo1] S5 finish",
    medals: {
      cristal: 38.4,
      or: 40.4,
      argent: 46.4,
      bronze: 54.5
    }
  },
  // ---- Canyon de cristal : gravité inversée, plafonds, verre, volant inversé ----
  {
    // Chapitre 11 · 1/6 — SPRINT (galerie). Ouverture : deux boosters puis TROIS CASES DE VOLANT INVERSÉ (plaque violette) : en ligne droite, le piège est de corriger dans le mauvais sens.
    // Puis une vague en S, deux très grands virages plats (droite, gauche) et une descente finale de 4 niveaux. Presque tout droit.
    id: "galerie",
    name: "Galerie de Cristal",
    decor: "caves",
    difficulty: 2,
    profil: "sprint",
    appris: "D\xE9part : deux boosters \u2192 volant invers\xE9 (trois cases en ligne droite). Au programme : vague en S, deux tr\xE8s grands virages plats, descente.",
    goal: {
      id: "under",
      t: 21.5
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    script: "start B2 S3.y S2 [crs1] S2 [cds1] B HR S2 B C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 19.4,
      or: 20.4,
      argent: 23.4,
      bronze: 27.5
    }
  },
  {
    // Chapitre 11 · 2/6 — TECHNIQUE (plafond renversé). Ouverture : un booster puis directement une VRILLE : la route se retourne et l'on roule au plafond, en gravité inversée. Quatre virages serrés
    // au plafond (R L R L) avec un checkpoint, vrille de retour, puis quatre autres virages serrés au sol, une chicane sur un mur et une descente de 4 niveaux. Un booster à chaque relance.
    id: "plafond",
    name: "Plafond Renvers\xE9",
    decor: "caves",
    difficulty: 4,
    profil: "technique",
    appris: "D\xE9part : un booster \u2192 vrille : la route se retourne, gravit\xE9 invers\xE9e. Au programme : huit virages serr\xE9s dont quatre au plafond.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 8
    },
    script: "start B TW.f S2^ B^ R^ S^ L^ S2^ R^ S^ L^ C^ B^ S2^ TWB.f S2 B R S L B S2 [tr01s] S2< [tr10s] S3 R B S L B S [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 33.4,
      or: 35.1,
      argent: 40.4,
      bronze: 47.4
    }
  },
  {
    // Chapitre 11 · 3/6 — ACROBATIQUE (cristal fêlé, inversions de gravité). Ouverture : deux boosters puis une PLAQUE D'INVERSION DE GRAVITÉ : la voiture « tombe » vers le plafond, 8 niveaux plus haut,
    // et s'y réceptionne ; une seconde plaque la renvoie au sol. Trois allers-retours (8, 8 et 10 niveaux), une dalle de verre fragile au plafond, un wall-ride final et une descente de 4 niveaux.
    id: "cristalfele",
    name: "Cristal F\xEAl\xE9",
    decor: "caves",
    difficulty: 4,
    profil: "acrobatique",
    appris: "D\xE9part : deux boosters \u2192 inversion de gravit\xE9 : la voiture \xAB tombe \xBB au plafond, 8 niveaux plus haut. Au programme : trois allers-retours sol / plafond, verre fragile au plafond.",
    goal: {
      id: "under",
      t: 35.5
    },
    opts: {
      l: 8
    },
    pilot: {
      vCap: 60
    },
    script: "start B2 S.f V8 S4^ C^ B2^ S.f^ V-8 S4 C B2 S.f V8 S2.v^ S2^ B2^ S.f^ V-8 S4 C B2 S.f V10 S4^ B2^ S.f^ V-10 S5 [tr01s] S2< [tr10s] S [cdi1] [dn2] [cdo1] S2 finish",
    medals: {
      cristal: 32.2,
      or: 33.9,
      argent: 39,
      bronze: 45.8
    }
  },
  {
    // Chapitre 11 · 4/6 — SPEEDWAY (miroir). Ouverture : trois boosters puis un S de deux très grands virages relevés en miroir (gauche puis droite). La suite reprend le dessin à l'envers (droite
    // puis gauche), après un wall-ride de quatre cases (mur droit) ; trois dalles de verre fragile (sans danger à grande vitesse) et un dernier S. Six virages relevés, 44 % du tour au-dessus de 240 km/h.
    id: "miroir",
    name: "Miroir",
    decor: "caves",
    difficulty: 4,
    profil: "speedway",
    appris: "D\xE9part : trois boosters \u2192 S de deux tr\xE8s grands virages relev\xE9s en miroir. Au programme : six virages relev\xE9s, wall-ride, trois dalles de verre.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 70
    },
    script: "start B3 BLL S BRR S2 C B [tr02l] S4> [tr20l] BRR S BLL S B2 S3.v B BLL S BRR S B2 finish",
    medals: {
      cristal: 26.4,
      or: 27.8,
      argent: 31.9,
      bronze: 37.5
    }
  },
  {
    // Chapitre 11 · 5/6 — ROLLERCOASTER (vrilles). Ouverture : un booster puis un PLONGEON de 4 niveaux qui débouche directement sur une VRILLE : la route se retourne et l'on roule au plafond (gravité inversée)
    // pendant une descente et une remontée, avant une seconde vrille qui remet la route à l'endroit. Ensuite un double looping tournant à gauche, un slalom de wall-rides gauche / droite et l'arrivée.
    id: "vrilles",
    name: "Vrilles Souterraines",
    decor: "caves",
    difficulty: 5,
    profil: "rollercoaster",
    appris: "D\xE9part : plongeon de 4 niveaux directement dans une vrille. Au programme : parcours au plafond, double looping, slalom de wall-rides gauche / droite.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 10
    },
    pilot: {
      vCap: 66
    },
    script: "start B [cdi1] [dn2] [cdo1] TW.f S2^ D^ S2^ B^ S2^ U^ S^ TWB.f S2 B ODL S2 C B2 [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S B2 finish",
    medals: {
      cristal: 26,
      or: 27.4,
      argent: 31.5,
      bronze: 37
    }
  },
  {
    // Chapitre 11 · 6/6 — TECHNIQUE (cœur de la montagne). Ouverture : un booster puis DEUX DALLES DE VERRE FRAGILE (5 s de résistance) aussitôt suivies d'un slalom R L R L. Huit virages serrés,
    // une chicane sur un mur, une descente de 4 niveaux et un booster à chaque relance : le dernier circuit de la carrière.
    id: "coeur",
    name: "C\u0153ur de la Montagne",
    decor: "caves",
    difficulty: 5,
    profil: "technique",
    appris: "D\xE9part : un booster \u2192 deux dalles de verre fragile (5 s de r\xE9sistance) \u2192 slalom. Au programme : huit virages serr\xE9s, chicane sur un mur : le dernier circuit.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 6
    },
    script: "start B S2.v500 S R L R L B S2 C B S R S L B S2 [tr01s] S2< [tr10s] S3 R B S L B S [cdi1] [dn2] [cdo1] S B finish",
    medals: {
      cristal: 27.4,
      or: 28.8,
      argent: 33.2,
      bronze: 38.9
    }
  },
  // ---- Atelier des mécanismes (chapitre BONUS, 12e) : obstacles puis pièces mobiles, un à un ----
  {
    // Chapitre 12 (Atelier, bonus) · 1/6 — MÉCANISME : bumpers et piques fixes sur les bords : ils ne gênent que si l’on coupe les virages.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: "garde",
    name: "Garde-Fous",
    decor: "atelier",
    difficulty: 1,
    profil: "atelier",
    meca: [
      "bumper",
      "spikes"
    ],
    appris: "D\xE9part : quatre boosters \u2192 vague. Au programme : les premiers obstacles, bumpers (ils repoussent) et piques fixes, sur les bords : rester sur la route les \xE9vite, couper un virage les r\xE9veille.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    obst: [
      {
        k: "bumper",
        at: 0.3,
        side: -7.5,
        s: 0.8
      },
      {
        k: "spikes",
        at: 0.55,
        side: 7.5,
        s: 0.7
      },
      {
        k: "bumper",
        at: 0.8,
        side: 7.5,
        s: 0.8
      }
    ],
    script: "start B4 [cds1] S [crs1] S2 B HR S2 C S HL S B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 17,
      or: 17.9,
      argent: 20.5,
      bronze: 24.1
    }
  },
  {
    // Chapitre 12 (Atelier, bonus) · 2/6 — MÉCANISME : piques escamotables en travers de la route : on passe quand elles sont rentrées.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: "cadence",
    name: "En Cadence",
    decor: "atelier",
    difficulty: 1,
    profil: "atelier",
    meca: [
      "spikesPop"
    ],
    appris: "D\xE9part : trois boosters \u2192 trois cases. Au programme : des piques escamotables en travers de la route (trois secondes de cycle, une et demie dehors) : on passe quand elles sont rentr\xE9es.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    obst: [
      {
        k: "spikesPop",
        at: 0.1,
        side: 0,
        s: 1.1,
        ph: 0.438
      },
      {
        k: "spikesPop",
        at: 0.25,
        side: 0,
        s: 1.1,
        ph: 0
      }
    ],
    script: "start B3 S3 [crs1] S B HR S2 C S2 HL S B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 16.8,
      or: 17.7,
      argent: 20.4,
      bronze: 23.9
    }
  },
  {
    // Chapitre 12 (Atelier, bonus) · 3/6 — MÉCANISME : une boule balancier puis un mur coulissant : il faut lire leur rythme.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: "pendule",
    name: "Le Pendule",
    decor: "atelier",
    difficulty: 2,
    profil: "atelier",
    meca: [
      "pendulum",
      "slider"
    ],
    appris: "D\xE9part : deux boosters \u2192 vague. Au programme : une boule balancier qui balaie la route, puis un mur coulissant : on lit leur rythme et on passe dans le vide.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    obst: [
      {
        k: "pendulum",
        at: 0.1,
        side: 0,
        s: 1,
        ph: 0
      },
      {
        k: "slider",
        at: 0.6,
        side: 0,
        s: 1,
        ph: 0.75
      }
    ],
    script: "start B2 [crs1] S2 [cds1] S2 HR S B C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 17.4,
      or: 18.3,
      argent: 21.1,
      bronze: 24.7
    }
  },
  {
    // Chapitre 12 (Atelier, bonus) · 4/6 — MÉCANISME : un marteau tournant puis un balayeur : des obstacles qui tournent.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: "rotors",
    name: "Rotors",
    decor: "atelier",
    difficulty: 2,
    profil: "atelier",
    meca: [
      "hammer",
      "sweeper"
    ],
    appris: "D\xE9part : trois cases \u2192 trois boosters. Au programme : un marteau tournant au milieu de la route, puis un balayeur : des obstacles qui tournent, on entre juste apr\xE8s leur passage.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    obst: [
      {
        k: "hammer",
        at: 0.1,
        side: 0,
        s: 1,
        ph: 0.438
      },
      {
        k: "sweeper",
        at: 0.3,
        side: 0,
        s: 1,
        ph: 0
      }
    ],
    script: "start S3 B3 [cds1] S [crs1] S2 HR S B C S2 HL S B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 18.8,
      or: 19.7,
      argent: 22.7,
      bronze: 26.7
    }
  },
  {
    // Chapitre 12 (Atelier, bonus) · 5/6 — MÉCANISME : un ascenseur et une glissière : la route elle-même bouge.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: "montecharge",
    name: "Monte-Charge",
    decor: "atelier",
    difficulty: 3,
    profil: "atelier",
    meca: [
      "lift",
      "slide"
    ],
    appris: "D\xE9part : cinq boosters \u2192 vague. Au programme : la route bouge, un ascenseur (la dalle monte puis redescend) et une glissi\xE8re (elle se d\xE9cale sur le c\xF4t\xE9), comme dans l\u2019\xE9diteur.",
    goal: {
      id: "nowall"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    movers: [
      {
        ms: 100,
        ma: 1
      },
      {
        ms: 100,
        ma: 1
      }
    ],
    script: "start B5 S [crs1] S2~ B HR S2= C S HL S B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 16.8,
      or: 17.7,
      argent: 20.4,
      bronze: 23.9
    }
  },
  {
    // Chapitre 12 (Atelier, bonus) · 6/6 — MÉCANISME : marteau, balancier et mur coulissant à la suite : tout le chapitre d’un coup.
    // Placé par recherche (tools/lab.mjs) : le pilote passe sans choc à 90, 100 et 110 % de sa vitesse ; les phases des obstacles laissent une fenêtre de passage large.
    id: "grandatelier",
    name: "Le Grand Atelier",
    decor: "atelier",
    difficulty: 3,
    profil: "atelier",
    meca: [
      "hammer",
      "pendulum",
      "slider"
    ],
    appris: "D\xE9part : deux boosters \u2192 deux cases. Au programme : le tour d\u2019horizon, un marteau, un balancier puis un mur coulissant \xE0 la suite : les m\xE9canismes des circuits d\u2019avant reviennent d\u2019un coup.",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 6
    },
    pilot: {
      vCap: 66
    },
    obst: [
      {
        k: "hammer",
        at: 0.1,
        side: 0,
        s: 1,
        ph: 0.938
      },
      {
        k: "pendulum",
        at: 0.35,
        side: 0,
        s: 1,
        ph: 0.313
      },
      {
        k: "slider",
        at: 0.6,
        side: 0,
        s: 1,
        ph: 0.188
      }
    ],
    script: "start B2 S2 [cds1] S2 [crs1] S B HR S2 C S2 HL S2 B [cdi1] [dn2] [cdo1] B2 finish",
    medals: {
      cristal: 18,
      or: 19,
      argent: 21.8,
      bronze: 25.6
    }
  }
];
BUILTIN_TRACKS.sort((a, b) => CAREER_ORDER.indexOf(a.decor) - CAREER_ORDER.indexOf(b.decor) || a.difficulty - b.difficulty);
function buildBuiltin(def) {
  const t = scriptTrack(def.name, def.script, {
    ...def.opts || {},
    decor: def.decor || "desert",
    ...def.movers ? {
      movers: def.movers
    } : {}
  });
  t.author = "Copytrack";
  if (def.params) t.setParams(def.params);
  if (def.laps > 1) {
    t.laps = def.laps;
    const one = t.path.slice();
    for (let k = 1; k < def.laps; k++) t.path.push(...one.slice(1));
  }
  if (def.pilot && t.path) t.path.pilot = def.pilot;
  if (def.obst && t.path && t.path.length > 10) {
    const P = t.path, n = def.laps > 1 ? Math.floor(P.length / def.laps) : P.length;
    for (const o of def.obst) {
      const i = Math.min(n - 2, Math.floor(n * o.at));
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dz = b[2] - a[2], l = hypot2(dx, dz) || 1;
      const q = (v, st) => Math.round(v / st) * st;
      const ry = q(datan2(dx / l, dz / l), Math.PI / 8);
      t.addDeco({
        k: o.k,
        x: q(a[0] + -dz / l * (o.side || 0), 0.5),
        y: q(a[1], 0.1),
        z: q(a[2] + dx / l * (o.side || 0), 0.5),
        ry: +ry.toFixed(4),
        s: o.s || 1,
        c: 0,
        ph: o.ph || 0
      });
    }
  }
  return t;
}

// js/sim/params.js
var WIND_MAX = 0.5;
var DEFAULT_PARAMS = Object.freeze({
  grip: 1,
  windOn: false,
  windX: 0,
  windZ: 0
});
function paramsOf(track) {
  const g = track && track.grip != null ? track.grip : 100, w = track && track.wind ? track.wind : 0;
  if (g === 100 && !w) return DEFAULT_PARAMS;
  const a = (track.windDir || 0) * Math.PI / 180, k = w / 100 * CAR.wind * WIND_MAX;
  return Object.freeze({
    grip: g / 100,
    windOn: k > 0,
    windX: k * dsin(a),
    windZ: -k * dcos(a)
  });
}

// js/sim/env.js
var PUDDLE_GRIP = 0.5;
var RAIN_GRIP = 0.15;
var FROST_GRIP = 0.35;
var PATCH_RATE = 0.4;
function h01(seed, a, b, c, salt) {
  let x = Math.imul(seed + 40503, 2246822507) ^ Math.imul(a + 7, 3266489909) ^ Math.imul(b + 13, 668265263) ^ Math.imul(c + 101, 374761393) ^ Math.imul(salt + 1, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 739982445);
  x ^= x >>> 12;
  x = Math.imul(x, 695872825);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
var cellKey = (cx, cz) => cx + 4096 << 13 | cz + 4096;
function patchesOf(track, rain, frost, seed) {
  const cells = /* @__PURE__ */ new Map(), list = [];
  for (const t of track.tiles) {
    const P = PIECES[t.t];
    if (!P || P.kind !== "line" || P.rise || P.size !== 1 || t.o || t.v || t.s || t.mv) continue;
    for (const [kind, amount, salt] of [
      [
        "puddle",
        rain,
        1
      ],
      [
        "frost",
        frost,
        2
      ]
    ]) {
      if (!amount || h01(seed, t.x, t.z, t.l, salt) >= amount / 100 * PATCH_RATE) continue;
      const c = tileCenter(t), along = (h01(seed, t.x, t.z, t.l, salt + 10) - 0.5) * (CELL - 12), side = (h01(seed, t.x, t.z, t.l, salt + 20) - 0.5) * (ROAD_HALF * 2 - 7);
      const r = 2.6 + h01(seed, t.x, t.z, t.l, salt + 30) * 2.4;
      const alongX = t.r % 2 === 1;
      const p = {
        kind,
        x: c.x + (alongX ? along : side),
        z: c.z + (alongX ? side : along),
        y: baseY(t),
        r,
        r2: r * r
      };
      list.push(p);
      const k = cellKey(t.x, t.z);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(p);
      break;
    }
  }
  return {
    cells,
    list
  };
}
function envOf(track) {
  const rain = (track && track.rain) | 0, frost = (track && track.frost) | 0, gust = (track && track.gust) | 0;
  if (!rain && !frost && !gust) return null;
  const seed = track.envSeed | 0 || 0, vary = !!track.envVary;
  const { cells, list } = patchesOf(track, rain, frost, seed);
  const ph1 = h01(seed, 1, 2, 3, 40) * 6.283, ph2 = h01(seed, 4, 5, 6, 41) * 6.283, ph3 = h01(seed, 7, 8, 9, 42) * 6.283;
  const a = (track.windDir || 0) * Math.PI / 180, gk = gust / 100 * CAR.wind * WIND_MAX * 1.6, gx = dsin(a), gz = -dcos(a);
  const out = {
    x: 0,
    z: 0
  };
  return Object.freeze({
    rain,
    frost,
    gust,
    vary,
    seed,
    patches: list,
    // Intensité de la pluie (0 à 1) au pas `step` : constante, ou qui forcit et faiblit (période d'environ deux minutes) si les conditions varient.
    rainAt(step) {
      return rain ? rain / 100 * (vary ? 0.55 + 0.45 * dsin(step * DT * 0.05 + ph3) : 1) : 0;
    },
    // Multiplicateur d'adhérence au sol, à la position (x, y, z) de la voiture, au pas `step`.
    gripAt(x, y, z, step) {
      let k = 1;
      const w = this.rainAt(step);
      if (w) k *= 1 - RAIN_GRIP * w;
      const ps = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (ps) {
        for (const p of ps) {
          const dx = x - p.x, dz = z - p.z, dy = y - p.y;
          if (dx * dx + dz * dz < p.r2 && dy < 2.5 && dy > -2.5) k *= p.kind === "frost" ? FROST_GRIP : 1 - PUDDLE_GRIP * w;
        }
      }
      return k;
    },
    // Dans quelle plaque est la voiture ? (effets : éclaboussures, crissement) ; null sinon.
    patchAt(x, y, z) {
      const ps = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (ps) for (const p of ps) {
        const dx = x - p.x, dz = z - p.z, dy = y - p.y;
        if (dx * dx + dz * dz < p.r2 && dy < 2.5 && dy > -2.5) return p;
      }
      return null;
    },
    // Rafale au pas `step` : accélération dans le monde (m/s²), dans la direction du vent du circuit ; jamais à contre-sens.
    gustAt(step) {
      if (!gust) {
        out.x = 0;
        out.z = 0;
        return out;
      }
      const t = step * DT, s = 0.6 * dsin(t * 0.9 + ph1) + 0.4 * dsin(t * 2.3 + ph2), k = s > 0 ? s * gk : 0;
      out.x = gx * k;
      out.z = gz * k;
      return out;
    }
  });
}

// js/physics/vehicles/moto2.js
var MAX_LEAN = 0.95;
var LEAN_RATE = 2.4;
var LAG_COST = 0.3;
var TRANSFER = 0.35;
var WHEELIE_SPEED = 14;
function moto2Ground(phys, inp, vf, g, dt) {
  const latA = phys.omega * vf;
  const target = clamp(datan(latA / Math.max(1, g)), -MAX_LEAN, MAX_LEAN);
  const step = LEAN_RATE * dt;
  phys.lean += clamp(target - phys.lean, -step, step);
  const lag = Math.abs(target - phys.lean);
  let grip = 1 - LAG_COST * clamp(lag / 0.5, 0, 1);
  const leanK = Math.abs(phys.lean) / MAX_LEAN;
  if (inp.brake && vf > 2) grip *= 1 - 0.22 * leanK;
  let tr = clamp(-phys.mAx / Math.max(1, g) * TRANSFER, -0.25, 0.3);
  if (inp.throttle && !inp.brake && vf > 0 && vf < WHEELIE_SPEED && phys.mAx > 3) tr = Math.min(tr, -0.22);
  phys.v2F = clamp(1 + 2.2 * tr, 0.35, 1.6);
  phys.v2R = clamp(1 - 1.7 * tr, 0.45, 1.5);
  return grip;
}
function moto2Idle(phys, dt) {
  phys.lean -= clamp(phys.lean, -LEAN_RATE * dt, LEAN_RATE * dt);
  phys.v2F = 1;
  phys.v2R = 1;
}

// js/physics/vehicles/boat2.js
var WAVE_A = 0.55;
var K1 = 0.085;
var W1 = 1.6;
var K2 = 0.12;
var W22 = 1.15;
var CURRENT = 2.6;
var SLOPE_K = 0.75;
var C3 = {
  x: 0,
  z: 0
};
function waveAt(x, z, t) {
  return WAVE_A * (0.6 * dsin(x * K1 + t * W1) + 0.4 * dsin(z * K2 - t * W22 + x * 0.03));
}
var OUT = {
  dvf: 0,
  dvr: 0,
  grip: 1
};
function boat2Water(phys, tile, fx, fz, rx, rz, g, dt) {
  const p = phys.pos, t = phys.time;
  const sx = WAVE_A * 0.6 * K1 * dcos(p.x * K1 + t * W1) + WAVE_A * 0.4 * 0.03 * dcos(p.z * K2 - t * W22 + p.x * 0.03);
  const sz = WAVE_A * 0.4 * K2 * dcos(p.z * K2 - t * W22 + p.x * 0.03);
  const h = waveAt(p.x, p.z, t);
  const rise = (h - phys.heave) / dt;
  phys.heave = h;
  OUT.dvf = -g * SLOPE_K * (sx * fx + sz * fz) * dt;
  OUT.dvr = -g * SLOPE_K * (sx * rx + sz * rz) * dt;
  OUT.grip = rise > 0.4 ? Math.max(0.75, 1 - (rise - 0.4) * 0.12) : 1;
  if (tile) {
    rotVec(tile.r, 0, -1, C3);
    OUT.dvf += CURRENT * (C3.x * fx + C3.z * fz) * dt;
    OUT.dvr += CURRENT * (C3.x * rx + C3.z * rz) * dt;
  }
  return OUT;
}

// js/physics/vehicles/glider2.js
var THERMAL_RATE = 0.1;
var THERMAL_ACC = 7;
var THERMAL_R = 14;
var THERMAL_TOP = 26 * LEVEL_H;
var ALT0 = 18 * LEVEL_H;
var ALT_SPAN = 40 * LEVEL_H;
var ALT_MIN_K = 0.45;
var BIG = CELL * 2;
function hash01(seed, a, b, salt) {
  let x = Math.imul(seed + 9541, 2654435761) ^ Math.imul(a + 3, 2246822507) ^ Math.imul(b + 5, 3266489909) ^ Math.imul(salt + 11, 668265263);
  x ^= x >>> 15;
  x = Math.imul(x, 739982445);
  x ^= x >>> 12;
  x = Math.imul(x, 695872825);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
function thermalOf(seed, cx, cz) {
  if (hash01(seed, cx, cz, 1) >= THERMAL_RATE) return null;
  return {
    x: (cx + 0.25 + hash01(seed, cx, cz, 2) * 0.5) * BIG,
    z: (cz + 0.25 + hash01(seed, cx, cz, 3) * 0.5) * BIG
  };
}
function thermalLift(seed, x, y, z) {
  if (y > THERMAL_TOP) return 0;
  const cx = Math.floor(x / BIG), cz = Math.floor(z / BIG);
  let a = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const th = thermalOf(seed, cx + i, cz + j);
      if (!th) continue;
      const dx = x - th.x, dz = z - th.z, d2 = dx * dx + dz * dz;
      if (d2 < THERMAL_R * THERMAL_R) a += THERMAL_ACC * (1 - Math.sqrt(d2) / THERMAL_R);
    }
  }
  return a * (1 - y / THERMAL_TOP * 0.5);
}
function altitudeK(y) {
  if (y <= ALT0) return 1;
  return Math.max(ALT_MIN_K, 1 - (y - ALT0) / ALT_SPAN * (1 - ALT_MIN_K));
}

// js/physics/walls.js
var L1 = {
  lx: 0,
  lz: 0
};
var L2 = {
  lx: 0,
  lz: 0
};
var S1 = {};
var S2 = {};
var W12 = {
  x: 0,
  z: 0
};
var MOV = {};
var MQ1 = {};
var MQ2 = {};
var HIT = {
  dx: 0,
  dz: 0,
  nx: 0,
  nz: 0
};
var wallMethods = {
  _bounds() {
    const p = this.pos, v = this.vel;
    if (p.x < this.bx0) {
      p.x = this.bx0;
      if (v.x < 0) v.x = 0;
    }
    if (p.x > this.bx1) {
      p.x = this.bx1;
      if (v.x > 0) v.x = 0;
    }
    if (p.z < this.bz0) {
      p.z = this.bz0;
      if (v.z < 0) v.z = 0;
    }
    if (p.z > this.bz1) {
      p.z = this.bz1;
      if (v.z > 0) v.z = 0;
    }
  },
  // Bordures : la voiture glisse le long du mur, perd un peu de vitesse au choc,
  // et le choc freine sa rotation. Pas de réalignement automatique.
  // Toit d'un tunnel : une voiture qui saute à l'intérieur n'en sort pas par le haut (les parois la retiennent déjà sur les côtés).
  // Seule une voiture déjà dessous est retenue : celle qui survole le tunnel passe au-dessus.
  _tunnelRoof() {
    if (this.gSign < 0) return;
    const p = this.pos, q = this.prev, v = this.vel;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile.tn || tile.v || this.excl.has(tile) || !isFloor(tile)) continue;
      toLocal(tile, p.x, p.z, L1);
      sampleLocal(tile, L1.lx, L1.lz, S1);
      if (!S1.inFootprint || Math.abs(S1.d) > ROAD_HALF + RAIL_W) continue;
      const roof = S1.h + TUNNEL_TOP;
      if (p.y + CAR.height > roof && q.y + CAR.height <= roof + 0.05) {
        p.y = roof - CAR.height;
        if (v.y > 0) v.y = -v.y * 0.2;
      }
    }
  },
  // Dalles pleines (gravité normale, véhicule en l'air) : le dessous et la tranche d'une dalle arrêtent la voiture.
  // Sans cela, un deltaplane (ou un saut) qui arrive sous une rampe ou contre la face d'une plate-forme la traversait, ou était
  // téléporté dessus par l'aide de montée. Trois cas selon la position au pas précédent :
  //   au-dessus de la dalle  : réception normale (rien à faire) ;
  //   en dessous             : la voiture est plaquée sous la dalle (comme le toit d'un tunnel) ;
  //   hors de l'emprise      : choc de face, la voiture reste devant la tranche.
  _slabs() {
    if (this.gSign < 0 || this.grounded || this.rib) return;
    const p = this.pos, q = this.prev, v = this.vel, H = CAR.height;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.mv || tile.v || this.excl.has(tile) || !isFloor(tile) || PIECES[tile.t].kind === "loop") continue;
      const area = PIECES[tile.t].kind === "area";
      toLocal(tile, p.x, p.z, L1);
      sampleLocal(tile, L1.lx, L1.lz, S1);
      if (!S1.inFootprint || !area && Math.abs(S1.d) > ROAD_HALF) continue;
      const hP = S1.h;
      if (!(p.y < hP - 0.3 && p.y + H > hP - SLAB_T)) continue;
      toLocal(tile, q.x, q.z, L2);
      sampleLocal(tile, L2.lx, L2.lz, S2);
      const qIn = S2.inFootprint && (area || Math.abs(S2.d) <= ROAD_HALF);
      if (qIn) {
        const hQ = S2.h;
        if (q.y >= hQ - 0.3) continue;
        if (q.y + H <= hQ - SLAB_T + 0.3) {
          p.y = hP - SLAB_T - H;
          if (v.y > 0) v.y = -v.y * 0.2;
          this.ev.wall = Math.max(this.ev.wall, 2);
        }
        continue;
      }
      if (p.y >= hP - CAR.step) {
        p.y = hP + 0.02;
        continue;
      }
      const dx = p.x - q.x, dz = p.z - q.z, dl = hypot2(dx, dz);
      p.x = q.x;
      p.z = q.z;
      if (dl > 1e-6) {
        const nx = dx / dl, nz = dz / dl, vn = v.x * nx + v.z * nz;
        if (vn > 0) {
          v.x -= nx * vn * 1.2;
          v.z -= nz * vn * 1.2;
          this.ev.wall = Math.max(this.ev.wall, vn);
        }
      }
    }
  },
  _walls() {
    const p = this.pos, v = this.vel;
    const fx = -dsin(this.yaw), fz = -dcos(this.yaw);
    const pfx = -dsin(this.prevYaw), pfz = -dcos(this.prevYaw);
    let hit = 0, touch = false, sx = 0, sz = 0;
    for (let k = -1; k <= 1; k += 2) {
      const off = CAR.probe * k;
      for (let iter = 0; iter < 2; iter++) {
        const c = this._probe(p.x + fx * off, p.z + fz * off, this.prev.x + pfx * off, this.prev.z + pfz * off, p.y);
        if (!c) break;
        touch = true;
        p.x += c.dx;
        p.z += c.dz;
        const vn = v.x * c.nx + v.z * c.nz;
        if (vn < 0) {
          v.x -= c.nx * vn * (1 + CAR.wallE);
          v.z -= c.nz * vn * (1 + CAR.wallE);
          if (-vn > hit) {
            hit = -vn;
            sx = c.nx;
            sz = c.nz;
          }
        }
      }
    }
    if (touch) {
      const k = Math.max(0, 1 - CAR.wallScrape * DT);
      v.x *= k;
      v.y *= k;
      v.z *= k;
    }
    if (hit > 0) {
      const loss = Math.min(CAR.wallLossMax, hit * CAR.wallLoss);
      v.x *= 1 - loss;
      v.y *= 1 - loss;
      v.z *= 1 - loss;
      this.ev.wall = hit;
      if (hit > 1.5) {
        const side = sx * fz - sz * fx;
        this.omega += (side >= 0 ? 1 : -1) * this._upSign() * Math.min(CAR.wallSpinMax, hit * CAR.wallSpin);
        this.stunT = Math.max(this.stunT, Math.min(0.8, 0.1 + hit * CAR.wallStun));
      }
    }
  },
  _probe(x, z, px, pz, y) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const tiles = this.track.tilesAt(cx, cz);
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.mv || this.excl.has(tile)) continue;
      if (this._probeTile(tile, x, z, px, pz, y, 0)) return HIT;
    }
    if (!this.track.hasMovers) return null;
    const time = this.time;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile.mv || this.excl.has(tile)) continue;
      const o = this.track.moverOffset(tile, time, MOV);
      if (o.a) {
        const q = this.track.moverLocal(o, x, z, MQ1), q2 = this.track.moverLocal(o, px, pz, MQ2);
        if (this._probeTile(tile, q.x, q.z, q2.x, q2.z, y - o.y, 0)) {
          const c = dcos(o.a), sn = dsin(o.a), dx = HIT.dx, dz = HIT.dz, nx = HIT.nx, nz = HIT.nz;
          HIT.dx = c * dx + sn * dz;
          HIT.dz = -sn * dx + c * dz;
          HIT.nx = c * nx + sn * nz;
          HIT.nz = -sn * nx + c * nz;
          return HIT;
        }
      } else if (this._probeTile(tile, x - o.x, z - o.z, px - o.x, pz - o.z, y - o.y, 0)) return HIT;
    }
    return null;
  },
  _probeTile(tile, x, z, px, pz, y) {
    const P = PIECES[tile.t];
    if (P.kind === "area" || tile.nb && !tile.tn || !(isFloor(tile) || isCeilingFloor(tile))) return false;
    toLocal(tile, x, z, L1);
    sampleLocal(tile, L1.lx, L1.lz, S1);
    if (!S1.inFootprint) return false;
    const H = CAR.height, gsg = this.gSign;
    const ylo = gsg > 0 ? y : y - H, yhi = gsg > 0 ? y + H : y;
    if (tile.v) {
      const hv = 2 * baseY(tile) - S1.h;
      if (ylo > hv + SLAB_T + 0.2 || yhi < hv - RAIL_H + 0.15) return false;
    } else if (ylo > S1.h + (tile.tn ? TUNNEL_TOP : RAIL_H) - 0.15 || yhi < S1.h - SLAB_T - 0.2) return false;
    const ad = Math.abs(S1.d), R = CAR.radius;
    const inner = ROAD_HALF, outer = ROAD_HALF + RAIL_W;
    if (ad + R <= inner || ad - R >= outer) return false;
    toLocal(tile, px, pz, L2);
    sampleLocal(tile, L2.lx, L2.lz, S2);
    const inside = Math.abs(S2.d) < (inner + outer) * 0.5;
    const sgn = S1.d >= 0 ? 1 : -1;
    const targetD = inside ? inner - R : outer + R;
    const push = (targetD - ad) * sgn;
    rotVec(tile.r, S1.gx, S1.gz, W12);
    HIT.dx = W12.x * push;
    HIT.dz = W12.z * push;
    const ns = inside ? -sgn : sgn;
    HIT.nx = W12.x * ns;
    HIT.nz = W12.z * ns;
    return true;
  }
};

// js/physics/obstacles.js
var OB = {};
var OL = {};
var fin = Number.isFinite;
var obstacleMethods = {
  // Le temps des obstacles est le chrono de la course (this.clock = pas de course, fixé
  // par l'appelant avant chaque pas) : même mouvement en replay et après un retour (R).
  // L'index spatial (cases de 20 m) appartient au circuit : il est construit une fois par version du circuit,
  // pas par voiture ni par pas. Les cases voisines sont parcourues dans le même ordre qu'avant (ix puis iz, puis ordre du circuit) :
  // l'ordre compte, chaque contact corrige la position avant le test du suivant.
  _obstacles() {
    const track = this.track;
    if (!track.obstacles.length || this.hazardGrace > 0) return;
    const grid = track.obstacleGrid;
    const t = (this.clock || 0) * DT;
    const p = this.pos, n0 = this.n;
    const gx = Math.floor((p.x + n0.x * 0.8) / OBSTACLE_CELL), gz = Math.floor((p.z + n0.z * 0.8) / OBSTACLE_CELL);
    for (let ix = gx - 3; ix <= gx + 3; ix++) {
      for (let iz = gz - 3; iz <= gz + 3; iz++) {
        const bucket = grid.get(obstacleKey(ix, iz));
        if (bucket === void 0) continue;
        for (let i = 0; i < bucket.length; i++) {
          if (this.hiddenDecos && this.hiddenDecos.has(bucket[i])) continue;
          if (this._obstacleContact(bucket[i], t)) return;
        }
      }
    }
  },
  // Contact de la voiture avec l'obstacle d au temps t (s). Renvoie true si le contact est létal (le pas se termine aussitôt).
  _obstacleContact(d, t) {
    const p = this.pos, v = this.vel, n0 = this.n;
    const cx = p.x + n0.x * 0.8, cy = p.y + n0.y * 0.8, cz = p.z + n0.z * 0.8;
    if (!d || !OBST[d.k] || !fin(d.x) || !fin(d.y) || !fin(d.z) || !fin(d.s || 1) || !fin(d.ry || 0)) return false;
    if (Math.abs(cx - d.x) > 40 || Math.abs(cz - d.z) > 40) return false;
    const rr = obstacleRadius(d) + 3;
    const ox = cx - d.x, oz = cz - d.z;
    if (ox * ox + oz * oz > rr * rr) return false;
    const def = OBST[d.k], k = d.s || 1, rc = 1.4 / k;
    if (!(k > 0) || !fin(rc)) return false;
    obstacleLocal(d, t, OB);
    toLocalObs(d, cx, cy, cz, OL);
    if (!(fin(OB.x) && fin(OB.y) && fin(OB.z) && fin(OB.vx) && fin(OB.vy) && fin(OB.vz) && fin(OB.on) && fin(OL.x) && fin(OL.y) && fin(OL.z))) return false;
    let nx = 0, ny = 0, nz = 0, pen = 0, ovx = 0, ovy = 0, ovz = 0;
    if (def.type === "spike") {
      if (OB.on < 0.4 || this.graceT > 0) return false;
      if (Math.abs(OL.x) < def.hx + rc * 0.6 && Math.abs(OL.z) < def.hz + rc * 0.6 && OL.y < def.hy * OB.on + rc && OL.y > -1.5) {
        this.ev.spike = true;
        this.ev.sink = true;
        return true;
      }
      return false;
    } else if (def.type === "ball") {
      const dx = OL.x - OB.x, dy = OL.y - OB.y, dz = OL.z;
      const dd = hypot3(dx, dy, dz);
      if (dd >= def.r + rc) return false;
      if (dd < 1e-6) {
        nx = 0;
        ny = 1;
        nz = 0;
        pen = def.r + rc;
      } else {
        nx = dx / dd;
        ny = dy / dd;
        nz = dz / dd;
        pen = def.r + rc - dd;
      }
      ovx = OB.vx;
      ovy = OB.vy;
    } else if (def.type === "box") {
      const qx = clamp(OL.x, OB.x - def.hx, OB.x + def.hx), qy = clamp(OL.y, 0, def.hy * 2), qz = clamp(OL.z, -def.hz, def.hz);
      const dx = OL.x - qx, dy = OL.y - qy, dz = OL.z - qz;
      const dd = hypot3(dx, dy, dz);
      if (dd >= rc) return false;
      if (dd < 1e-6) {
        const ex = def.hx - Math.abs(OL.x - OB.x);
        const ey0 = OL.y, ey1 = def.hy * 2 - OL.y;
        const ez = def.hz - Math.abs(OL.z);
        const face = Math.min(ex, ey0, ey1, ez);
        if (face === ey0 || face === ey1) {
          nx = 0;
          ny = ey0 <= ey1 ? -1 : 1;
          nz = 0;
        } else if (face === ez) {
          nx = 0;
          ny = 0;
          nz = OL.z >= 0 ? 1 : -1;
        } else {
          nx = OL.x >= OB.x ? 1 : -1;
          ny = 0;
          nz = 0;
        }
        pen = Math.max(0.01, rc + Math.max(0, face));
      } else {
        nx = dx / dd;
        ny = dy / dd;
        nz = dz / dd;
        pen = rc - dd;
      }
      ovx = OB.vx;
    } else if (def.type === "bar") {
      const ca = dcos(OB.a), sa = dsin(OB.a);
      const s = clamp(OL.x * ca + OL.z * sa, -def.len, def.len);
      const dx = OL.x - ca * s, dy = OL.y - def.y, dz = OL.z - sa * s;
      const dd = hypot3(dx, dy, dz);
      if (dd >= def.r + rc) return false;
      if (dd < 1e-6) {
        nx = -sa;
        ny = 0;
        nz = ca;
        pen = def.r + rc;
      } else {
        nx = dx / dd;
        ny = dy / dd;
        nz = dz / dd;
        pen = def.r + rc - dd;
      }
      ovx = -sa * s * OB.w;
      ovz = ca * s * OB.w;
    } else {
      if (OL.y > def.h + rc) return false;
      const dd = hypot2(OL.x, OL.z);
      if (dd >= def.r + rc) return false;
      if (dd < 1e-6) {
        nx = 1;
        nz = 0;
        pen = def.r + rc;
      } else {
        nx = OL.x / dd;
        nz = OL.z / dd;
        pen = def.r + rc - dd;
      }
    }
    const c = dcos(d.ry || 0), sn = dsin(d.ry || 0);
    const wx = nx * c + nz * sn, wz = -nx * sn + nz * c, wy = ny;
    const vwx = (ovx * c + ovz * sn) * k, vwz = (-ovx * sn + ovz * c) * k, vwy = ovy * k;
    if (!(fin(wx) && fin(wy) && fin(wz) && fin(vwx) && fin(vwy) && fin(vwz))) return false;
    const correction = Math.min(pen * k, 2.5);
    p.x += wx * correction;
    p.y += wy * correction;
    p.z += wz * correction;
    const vn = (v.x - vwx) * wx + (v.y - vwy) * wy + (v.z - vwz) * wz;
    let add = 0;
    if (vn < -0.05) {
      add = -(1 + CAR.shockE) * vn;
      if (def.type === "post") {
        add = Math.max(add, Math.max(0, def.kick - add));
      } else {
        add += CAR.shockKick;
      }
    }
    if (add > 0) {
      v.x += wx * add;
      v.y += wy * add;
      v.z += wz * add;
      this.omega += (wx * this.fwd.z - wz * this.fwd.x) * add * 0.04;
      if (wy * this.gSign > 0.45) this.grounded = false;
      this.ev.shock = Math.max(this.ev.shock, add);
    }
    return false;
  }
};

// js/physics/ribbon.js
var FL = {};
var CC = {
  x: 0,
  z: 0
};
var TMP = {
  x: 0,
  z: 0
};
var BASIS = {
  e1x: 0,
  e1y: 0,
  e1z: 0,
  e2x: 0,
  e2y: 0,
  e2z: 0
};
function frameWorld(tile, rib, u, F) {
  frameLocal(rib, u, FL);
  const c = tileCenter(tile, CC);
  const r = tile.r;
  rotVec(r, FL.px, FL.pz, TMP);
  F.px = TMP.x + c.x;
  F.pz = TMP.z + c.z;
  F.py = FL.py;
  rotVec(r, FL.tx, FL.tz, TMP);
  F.tx = TMP.x;
  F.tz = TMP.z;
  F.ty = FL.ty;
  rotVec(r, FL.nx, FL.nz, TMP);
  F.nx = TMP.x;
  F.nz = TMP.z;
  F.ny = FL.ny;
  rotVec(r, FL.rx, FL.rz, TMP);
  F.rx = TMP.x;
  F.rz = TMP.z;
  F.ry = FL.ry;
  F.ds = FL.ds;
  F.kc = FL.kc;
  F.hw = FL.hw;
  F.wrap = FL.wrap;
  return F;
}
var ribbonMethods = {
  // Sur un ruban, l'état est exprimé dans le plan de la route :
  //   e1 = sens de parcours, e2 = droite, n = normale.
  //   vs, vd : vitesse le long de e1 / e2 ; psi : cap de la voiture par rapport à e1.
  // Le résultat est un tampon partagé : valable jusqu'au prochain appel (chaque appelant l'utilise aussitôt).
  _basis(R, F) {
    const d = R.dir;
    BASIS.e1x = F.tx * d;
    BASIS.e1y = F.ty * d;
    BASIS.e1z = F.tz * d;
    BASIS.e2x = F.rx * d;
    BASIS.e2y = F.ry * d;
    BASIS.e2z = F.rz * d;
    return BASIS;
  },
  // Détecte le franchissement d'une extrémité de ruban (plan perpendiculaire à la route).
  _tryEnterRibbon() {
    const p = this.pos, q = this.prev, v = this.vel;
    if (this.speed < 3) return false;
    const c1x = Math.floor(p.x / CELL), c1z = Math.floor(p.z / CELL);
    const c2x = Math.floor(q.x / CELL), c2z = Math.floor(q.z / CELL);
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1 && c1x === c2x && c1z === c2z) break;
      const tiles = pass === 0 ? this.track.tilesAt(c1x, c1z) : this.track.tilesAt(c2x, c2z);
      for (const tile of tiles) {
        if (!isRibbon(tile) || this.excl.has(tile)) continue;
        const rib = ribbonOf(tile);
        for (let end = 0; end < 2; end++) {
          const F = frameWorld(tile, rib, end, this.F);
          const sg = end === 0 ? 1 : -1;
          const tx = F.tx * sg, ty = F.ty * sg, tz = F.tz * sg;
          const dc = (p.x - F.px) * tx + (p.y - F.py) * ty + (p.z - F.pz) * tz;
          const dp = (q.x - F.px) * tx + (q.y - F.py) * ty + (q.z - F.pz) * tz;
          if (!(dp < 0 && dc >= 0)) continue;
          const dl = (p.x - F.px) * F.rx + (p.y - F.py) * F.ry + (p.z - F.pz) * F.rz;
          const dn = (p.x - F.px) * F.nx + (p.y - F.py) * F.ny + (p.z - F.pz) * F.nz;
          if (Math.abs(dl) > ROAD_HALF + 0.6 || dn < -1.4 || dn > 3.2) continue;
          const vs = v.x * tx + v.y * ty + v.z * tz;
          if (vs < 2.5) continue;
          if (this.grounded && this.n.x * F.nx + this.n.y * F.ny + this.n.z * F.nz < 0.35) continue;
          const R = {
            tile,
            rib,
            u: clamp(end === 0 ? dc / F.ds : 1 - dc / F.ds, 0, 1),
            dir: sg,
            dl: clamp(dl, -ROAD_HALF + 1, ROAD_HALF - 1),
            vs: 0,
            vd: 0,
            psi: 0
          };
          const B2 = this._basis(R, F);
          R.vs = v.x * B2.e1x + v.y * B2.e1y + v.z * B2.e1z;
          R.vd = v.x * B2.e2x + v.y * B2.e2y + v.z * B2.e2z;
          const h = this.fwd;
          R.psi = datan2(h.x * B2.e2x + h.y * B2.e2y + h.z * B2.e2z, h.x * B2.e1x + h.y * B2.e1y + h.z * B2.e1z);
          this.rib = R;
          this.ev.loopIn = true;
          this._ribPlace(R);
          return true;
        }
      }
    }
    return false;
  },
  // Atterrissage en plein milieu d'un ruban (retombée sur le haut d'un L, au fond d'un looping...).
  _tryLandRibbon() {
    const p = this.pos, q = this.prev, v = this.vel;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (const tile of tiles) {
      if (!isRibbon(tile) || this.excl.has(tile)) continue;
      const rib = ribbonOf(tile);
      let bu = -1, bd = Infinity;
      for (let i = 0; i <= 32; i++) {
        const F2 = frameWorld(tile, rib, i / 32, this.F);
        const dx = p.x - F2.px, dy = p.y - F2.py, dz = p.z - F2.pz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) {
          bd = d;
          bu = i / 32;
        }
      }
      let u = bu;
      for (let it = 0; it < 4; it++) {
        const F2 = frameWorld(tile, rib, u, this.F);
        const dt = (p.x - F2.px) * F2.tx + (p.y - F2.py) * F2.ty + (p.z - F2.pz) * F2.tz;
        u = clamp(u + dt / F2.ds, 0, 1);
      }
      if (u <= 2e-3 || u >= 0.998) continue;
      const F = frameWorld(tile, rib, u, this.F);
      const dl = (p.x - F.px) * F.rx + (p.y - F.py) * F.ry + (p.z - F.pz) * F.rz;
      if (F.kc > 1e-4) this._cross({
        dl
      }, F);
      else {
        F.qx = F.px;
        F.qy = F.py;
        F.qz = F.pz;
      }
      if (F.ny * this.gSign < 0.2) continue;
      const dn = (p.x - F.qx) * F.nx + (p.y - F.qy) * F.ny + (p.z - F.qz) * F.nz;
      const dq = (q.x - F.qx) * F.nx + (q.y - F.qy) * F.ny + (q.z - F.qz) * F.nz;
      const vn = v.x * F.nx + v.y * F.ny + v.z * F.nz;
      if (!(dn <= 0.05 && dq >= -0.3 && dn > -1.5 && vn < 0)) continue;
      if (Math.abs(dl) > ROAD_HALF + (hasNoRails(tile) ? 0 : 0.3)) continue;
      const vt = v.x * F.tx + v.y * F.ty + v.z * F.tz;
      const R = {
        tile,
        rib,
        u,
        dir: vt >= 0 ? 1 : -1,
        dl: 0,
        vs: 0,
        vd: 0,
        psi: 0
      };
      R.dl = clamp(dl * R.dir, -ROAD_HALF + 1, ROAD_HALF - 1) * R.dir;
      const B2 = this._basis(R, F);
      R.vs = v.x * B2.e1x + v.y * B2.e1y + v.z * B2.e1z;
      R.vd = v.x * B2.e2x + v.y * B2.e2y + v.z * B2.e2z;
      const h = this.fwd;
      R.psi = datan2(h.x * B2.e2x + h.y * B2.e2y + h.z * B2.e2z, h.x * B2.e1x + h.y * B2.e1y + h.z * B2.e1z);
      this.ev.land = -vn;
      const kq = this._landing(F.nx, F.ny, F.nz);
      R.vs *= kq;
      R.vd *= kq;
      this.rib = R;
      this._ribPlace(R);
      return true;
    }
    return false;
  },
  // Section courbe (tube) : repère de la route au point de la voiture.
  // Avec kc = courbure transversale et phi = kc * dl, la chaussée remonte de chaque côté :
  // position = centre + r sin(phi)/kc + n (1 - cos(phi))/kc, normale tournée de phi.
  // Remplit F.qx/qy/qz (point de contact) et remplace n et r par leurs valeurs locales.
  _cross(R, F) {
    const kc = F.kc || 0;
    if (F.wrap && kc > 0) {
      const C4 = 2 * Math.PI / kc;
      R.dl = ((R.dl + C4 / 2) % C4 + C4) % C4 - C4 / 2;
    }
    let X = R.dl, Y = 0, c = 1, s = 0;
    if (kc > 1e-5) {
      const phi = kc * R.dl;
      c = dcos(phi);
      s = dsin(phi);
      X = s / kc;
      Y = (1 - c) / kc;
    }
    F.qx = F.px + F.rx * X + F.nx * Y;
    F.qy = F.py + F.ry * X + F.ny * Y;
    F.qz = F.pz + F.rz * X + F.nz * Y;
    if (s !== 0) {
      const nx = F.nx * c - F.rx * s, ny = F.ny * c - F.ry * s, nz = F.nz * c - F.rz * s;
      const rx = F.rx * c + F.nx * s, ry = F.ry * c + F.ny * s, rz = F.rz * c + F.nz * s;
      F.nx = nx;
      F.ny = ny;
      F.nz = nz;
      F.rx = rx;
      F.ry = ry;
      F.rz = rz;
    }
    F.cc = c;
    F.cs = s;
    return F;
  },
  _ribStep(inp) {
    const R = this.rib, dt = DT, tile = R.tile, rib = R.rib;
    const F = frameWorld(tile, rib, R.u, this.F);
    const dU = 6e-3;
    const u0 = Math.max(0, R.u - dU), u1 = Math.min(1, R.u + dU);
    const A0 = frameWorld(tile, rib, u0, this.F0), A2 = frameWorld(tile, rib, u1, this.F2);
    const k = 1 / (F.ds * (u1 - u0));
    const kg0 = ((A2.tx - A0.tx) * F.rx + (A2.ty - A0.ty) * F.ry + (A2.tz - A0.tz) * F.rz) * k;
    const kn0 = ((A2.tx - A0.tx) * F.nx + (A2.ty - A0.ty) * F.ny + (A2.tz - A0.tz) * F.nz) * k;
    this._cross(R, F);
    const kc = F.kc || 0;
    const kn = kn0 * F.cc - kg0 * F.cs, kg = kg0 * F.cc + kn0 * F.cs;
    const B2 = this._basis(R, F);
    if (tile.s === "flip" || PIECES[tile.t].autoFlip) {
      const ng = F.ny >= -0.05 ? 1 : -1;
      if (ng !== this.gSign) {
        this.gSign = ng;
        this.ev.flip = true;
      }
    }
    const g = this.g * this.gSign;
    const sidePiece = isSideTile(tile);
    const hold = sidePiece ? Math.min(1, SIDE_HOLD * R.vs * R.vs / Math.max(1, this.g)) : 0;
    R.vs -= g * B2.e1y * dt;
    R.vd -= g * B2.e2y * dt * (1 - hold);
    if (sidePiece && Math.abs(F.ny) < 0.7 && Math.abs(R.vs) < SIDE_MIN_SPEED) {
      R.lowT = (R.lowT || 0) + dt;
      if (R.lowT > SIDE_GRACE) {
        this.ev.wallOff = true;
        this._ribPlace(R);
        this._ribDetach();
        return;
      }
    } else if (R.lowT) R.lowT = Math.max(0, R.lowT - 2 * dt);
    R.psi -= R.dir * kg * R.vs * dt;
    const mod = tile.s, f = tileParam(tile) / 100;
    const C4 = surfaceCoeffs(mod, f);
    const extraDrag = C4.extraDrag, vmaxK = C4.vmaxK, rearK = C4.rearK;
    let gripK = C4.grip, tractK = C4.traction, beltE1 = 0;
    if (this.stunT > 0) {
      gripK *= CAR.stunGrip;
      tractK *= CAR.stunTraction;
    }
    const P = this.params;
    if (P.grip !== 1) gripK *= P.grip;
    if (P.windOn) {
      R.vs += (P.windX * B2.e1x + P.windZ * B2.e1z) * dt;
      R.vd += (P.windX * B2.e2x + P.windZ * B2.e2z) * dt;
    }
    const E = this.env;
    if (E) {
      const st = this.clock || 0;
      if (E.rain && mod !== "water") gripK *= 1 - RAIN_GRIP * E.rainAt(st);
      if (E.gust) {
        const g2 = E.gustAt(st);
        R.vs += (g2.x * B2.e1x + g2.z * B2.e1z) * dt;
        R.vd += (g2.x * B2.e2x + g2.z * B2.e2z) * dt;
      }
    }
    if (mod === "boost") this._boostPad(f);
    else if (mod === "gravity") this._gravityPad(f);
    else if (mod === "wind") {
      const a = (tileParam(tile) - 100) / 100 * CAR.wind;
      rotVec(tile.r, 1, 0, TMP);
      R.vs += (TMP.x * B2.e1x + TMP.z * B2.e1z) * a * dt;
      R.vd += (TMP.x * B2.e2x + TMP.z * B2.e2z) * a * dt;
    } else if (mod === "conveyor") beltE1 = beltSpeed(tileParam(tile)) * R.dir;
    else if (mod === "spring" && this.plateLock !== "spring") {
      this.plateLock = "spring";
      this.ev.spring = true;
      R.vd += (tileParam(tile) - 100) / 100 * CAR.spring * R.dir;
    } else if (PLATES[mod]) this._transformPlate(mod);
    else this._timedMods(mod);
    if (!PLATES[mod] && mod !== "spring" && mod !== "flip") this.plateLock = "";
    R.vs += beltE1 - this.beltS;
    this.beltS = beltE1;
    let press = R.vs * R.vs * kn + R.vd * R.vd * kc + g * F.ny;
    if (sidePiece) press += SIDE_AERO * R.vs * R.vs * Math.sqrt(Math.max(0, 1 - F.ny * F.ny));
    const gAbs = this.g;
    const lPiece = tile.t === "wall" || tile.t === "ramp90" || tile.t === "crest90" || !!sidePiece;
    const guided = tile.t === "twist";
    const load = lPiece ? clamp(press / gAbs, 0, 1.6) : press > 0 || guided ? 1 : 0;
    this.press = press;
    R.vs -= beltE1;
    const c = dcos(R.psi), s = dsin(R.psi);
    let vx = R.vs * c + R.vd * s, vy = -R.vs * s + R.vd * c;
    const ax = (this._longitudinal(vx, inp, this.k.maxSpeed * vmaxK, Math.min(1, load) * tractK, extraDrag, dt, Math.min(1, load)) - vx) / dt;
    this.rearK = rearK;
    const t = this._tires(vx, vy, this.omega, ax, load * gripK, dt);
    this.rearK = 1;
    vx = t.vx;
    vy = t.vy;
    this.omega = t.w;
    R.vs = vx * c - vy * s + beltE1;
    R.vd = vx * s + vy * c;
    if (this._glassCheck(mod === "glass", tile, dt)) {
      this._ribPlace(R);
      this._ribDetach();
      return;
    }
    if (this.ev.sink) {
      this._ribPlace(R);
      return;
    }
    R.psi += this.omega * dt;
    this.yawRate = -this.omega;
    this.fwdSpeed = vx;
    this.slip = Math.abs(vy);
    R.dl += R.dir * R.vd * dt;
    const hw = F.hw || ROAD_HALF;
    if (F.wrap) {
    } else if (hasNoRails(tile) || Math.abs(R.dl) > hw + 1.5) {
      if (Math.abs(R.dl) > hw + 0.3) {
        this._ribPlace(R);
        this._ribDetach();
        return;
      }
    } else {
      const lim = hw - CAR.radius - 0.2;
      if (Math.abs(R.dl) > lim) {
        const side = Math.sign(R.dl) * R.dir;
        const into = R.vd * side;
        R.vs *= Math.max(0, 1 - CAR.wallScrape * dt);
        if (into > 0) {
          if (into > 2) this.ev.wall = into;
          R.vs *= 1 - Math.min(CAR.wallLossMax, into * CAR.wallLoss);
          R.vd -= side * into * (1 + CAR.wallE);
          if (into > 1.5) {
            R.psi += -side * Math.min(CAR.wallSpinMax, into * CAR.wallSpin) * 0.3;
            this.stunT = Math.max(this.stunT, Math.min(0.8, 0.1 + into * CAR.wallStun));
          }
        }
        R.dl = clamp(R.dl, -lim, lim);
      }
    }
    const uBefore = R.u;
    R.u += R.dir * R.vs * dt / F.ds;
    if (R.u > 1 || R.u < 0) {
      this._ribEnd(R.u > 1 ? 1 : 0);
      return;
    }
    const mu = rib.minU || 0;
    if (tile.t === "crest90" && R.dir === 1) {
      if (uBefore < rib.lipU && R.u >= rib.lipU && R.vs > 3) {
        this._ribPlace(R);
        const hop = clamp(R.vs * R.vs / CAR.lipHopK, CAR.lipHopMin, CAR.lipHopMax);
        this.vel.y += Math.sqrt(2 * this.g * hop) * this.gSign;
        this._ribDetach();
        return;
      }
    } else if (press < -0.6 && R.u > mu && R.u < 1 - mu && mod !== "magnet") {
      this._ribPlace(R);
      this._ribDetach();
      return;
    }
    this._ribPlace(R);
  },
  // Place la voiture sur le ruban (position, vitesse, orientation monde).
  _ribPlace(R) {
    const F = this._cross(R, frameWorld(R.tile, R.rib, R.u, this.F));
    const B2 = this._basis(R, F);
    const p = this.pos, v = this.vel;
    p.x = F.qx;
    p.y = F.qy;
    p.z = F.qz;
    v.x = B2.e1x * R.vs + B2.e2x * R.vd;
    v.y = B2.e1y * R.vs + B2.e2y * R.vd;
    v.z = B2.e1z * R.vs + B2.e2z * R.vd;
    this.n.x = F.nx;
    this.n.y = F.ny;
    this.n.z = F.nz;
    const c = dcos(R.psi), s = dsin(R.psi);
    this.fwd.x = B2.e1x * c + B2.e2x * s;
    this.fwd.y = B2.e1y * c + B2.e2y * s;
    this.fwd.z = B2.e1z * c + B2.e2z * s;
    if (hypot2(this.fwd.x, this.fwd.z) > 0.3) this.yaw = datan2(-this.fwd.x, -this.fwd.z);
    this.grounded = true;
    this.surfType = "road";
    this.surfMod = R.tile.s || "";
  },
  _ribDetach() {
    this.pitch = dasin(clamp(this.fwd.y, -1, 1));
    this.pitchRate = 0;
    this.airTime = 0;
    const t = this.rib && this.rib.tile;
    this.fallWhy = this.ev.wallOff ? "wall" : t && PIECES[t.t].kind === "loop" ? "loop" : t && t.t === "twist" ? "twist" : t && t.v ? "inv" : "crest";
    this.rib = null;
    this.grounded = false;
    this.ev.loopFall = true;
  },
  // Fin de ruban : passe au ruban suivant s'il est raccordé, sinon retour au sol.
  _ribEnd(endU) {
    const R = this.rib;
    R.u = endU;
    this._ribPlace(R);
    const F = frameWorld(R.tile, R.rib, endU, this.F);
    const d = endU === 1 ? 1 : -1;
    const fx = F.tx * d, fy = F.ty * d, fz = F.tz * d;
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    const next = this._matchRibbon(R.tile, F, fx, fy, fz);
    if (next) {
      const N = {
        tile: next.tile,
        rib: next.rib,
        u: next.end,
        dir: next.end === 0 ? 1 : -1,
        dl: 0,
        vs: 0,
        vd: 0,
        psi: R.psi
      };
      const F2 = frameWorld(next.tile, next.rib, next.end, this.F2);
      const v = this.vel;
      if (F.kc > 1e-4 && F2.kc > 1e-4) {
        N.dl = R.dl * Math.sign(F.rx * F2.rx + F.ry * F2.ry + F.rz * F2.rz || 1);
      } else {
        N.dl = clamp((px - F2.px) * F2.rx + (py - F2.py) * F2.ry + (pz - F2.pz) * F2.rz, -ROAD_HALF + 1, ROAD_HALF - 1);
      }
      this._cross(N, F2);
      const B2 = this._basis(N, F2);
      N.vs = v.x * B2.e1x + v.y * B2.e1y + v.z * B2.e1z;
      N.vd = v.x * B2.e2x + v.y * B2.e2y + v.z * B2.e2z;
      const h2 = this.fwd;
      N.psi = datan2(h2.x * B2.e2x + h2.y * B2.e2y + h2.z * B2.e2z, h2.x * B2.e1x + h2.y * B2.e1y + h2.z * B2.e1z);
      this.rib = N;
      this._ribPlace(N);
      return;
    }
    this.rib = null;
    this.ev.loopOut = true;
    const h = this.fwd;
    if (hypot2(h.x, h.z) > 0.2) this.yaw = datan2(-h.x, -h.z);
    this.prevYaw = this.yaw;
    const gsx = this.gSign;
    if (this.n.y * gsx > 0.6 && F.ny * gsx > 0.6) {
      this.grounded = true;
      this.vel.y = gsx > 0 ? Math.min(this.vel.y, 0) : Math.max(this.vel.y, 0);
      this.n.x = 0;
      this.n.y = gsx;
      this.n.z = 0;
    } else {
      this.grounded = false;
    }
    this._updateFwd();
  },
  _matchRibbon(curTile, F, fx, fy, fz) {
    const seen = /* @__PURE__ */ new Set();
    const px = F.px, py = F.py, pz = F.pz;
    const cells = /* @__PURE__ */ new Set();
    for (const off of [
      0,
      1.5
    ]) {
      for (const dx of [
        -0.6,
        0,
        0.6
      ]) {
        for (const dz of [
          -0.6,
          0,
          0.6
        ]) {
          cells.add(Math.floor((px + fx * off + dx) / CELL) + "," + Math.floor((pz + fz * off + dz) / CELL));
        }
      }
    }
    for (const c of cells) {
      const [cx, cz] = c.split(",").map(Number);
      for (const tile of this.track.tilesAt(cx, cz)) {
        if (tile === curTile || seen.has(tile) || !isRibbon(tile) || this.excl.has(tile)) continue;
        seen.add(tile);
        const rib = ribbonOf(tile);
        for (let end = 0; end < 2; end++) {
          const G = frameWorld(tile, rib, end, this.F3);
          const dist = hypot3(G.px - px, G.py - py, G.pz - pz);
          if (dist > 3.5) continue;
          const sg = end === 0 ? 1 : -1;
          if (G.tx * sg * fx + G.ty * sg * fy + G.tz * sg * fz < 0.7) continue;
          if (G.nx * F.nx + G.ny * F.ny + G.nz * F.nz < 0.6) continue;
          return {
            tile,
            rib,
            end
          };
        }
      }
    }
    return null;
  }
};

// js/physics.js
var L12 = {
  lx: 0,
  lz: 0
};
var L22 = {
  lx: 0,
  lz: 0
};
var S12 = {};
var W13 = {
  x: 0,
  z: 0
};
var BELT = {
  x: 0,
  z: 0
};
var MOV2 = {};
var TMP2 = {
  x: 0,
  z: 0
};
var BK = {
  vx: 0,
  vy: 0,
  w: 0
};
var CarPhysics = class {
  constructor(track) {
    this.track = track;
    this.params = paramsOf(track);
    this.env = envOf(track);
    this._specs = specsOf(track && track.pm);
    this.v2 = v2Of(track);
    this.lean = 0;
    this.mAx = 0;
    this.heave = 0;
    this.v2F = 0;
    this.v2R = 0;
    this.pos = {
      x: 0,
      y: 0,
      z: 0
    };
    this.prev = {
      x: 0,
      y: 0,
      z: 0
    };
    this.vel = {
      x: 0,
      y: 0,
      z: 0
    };
    this.n = {
      x: 0,
      y: 1,
      z: 0
    };
    this.fwd = {
      x: 0,
      y: 0,
      z: -1
    };
    this.surf = {};
    this.surfM = {};
    this.F = {};
    this.F0 = {};
    this.F2 = {};
    this.F3 = {};
    this.ev = {
      wall: 0,
      land: 0,
      boostHit: false,
      bounce: false,
      loopIn: false,
      loopOut: false,
      loopFall: false,
      transform: false,
      gravity: false,
      miniTurbo: 0,
      landQ: "",
      sink: false,
      ring: false,
      flip: false,
      glass: false,
      spring: false,
      reverse: false,
      cut: false,
      spike: false,
      shock: 0
    };
    this.rib = null;
    this.vehicle = "car";
    this.gravMul = 1;
    this.glassTime = /* @__PURE__ */ new Map();
    this.brokenVer = 0;
    this.broken = /* @__PURE__ */ new Set();
    this.excl = this.broken;
    this.hiddenDecos = null;
    this.setBounds();
    this.place(0, 0.4, 0, 0);
  }
  // Logique du circuit (sim/logic.js) : les pièces et décorations des groupes cachés n'ont plus de collision. Les ensembles sont tenus à jour par le
  // moteur de logique ; sans logique, rien de tout cela n'existe et this.excl reste l'ensemble du verre brisé (mêmes calculs qu'avant, au bit près).
  setLogicExclusion(tiles, decos) {
    const broken = () => this.broken;
    this.excl = {
      has: (t) => broken().has(t) || tiles.has(t)
    };
    this.hiddenDecos = decos;
  }
  get g() {
    return CAR.gravity * this.gravMul;
  }
  // Chrono de la course (s) : donne la position des pièces mobiles et des obstacles. this.clock = pas de course, fixé par l'appelant
  // avant chaque pas (même valeur en course, en replay, après un retour au checkpoint et dans la vérification en ligne).
  get time() {
    return (this.clock || 0) * DT;
  }
  // Réglages du véhicule actuel (voiture ou moto).
  get k() {
    const S4 = this._specs || SPECS;
    return S4[this.vehicle] || S4.car;
  }
  // Hors piste : sur le terrain, ou perdue dans le ciel en gravité inversée.
  get offTrack() {
    return this.grounded && this.surfType === "ground" && !this.track.offroad || this.lost;
  }
  get mode() {
    return this.rib ? "ribbon" : "ground";
  }
  setBounds() {
    const b = this.track.bounds();
    const m = CELL * 3;
    this.bx0 = b.minX - m;
    this.bx1 = b.maxX + m;
    this.skyY = b.maxY + 140;
    this.bz0 = b.minZ - m;
    this.bz1 = b.maxZ + m;
  }
  place(x, y, z, yaw, gs = 1) {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.prev.x = x;
    this.prev.y = y;
    this.prev.z = z;
    this.vel.x = 0;
    this.vel.y = 0;
    this.vel.z = 0;
    this.yaw = yaw;
    this.prevYaw = yaw;
    this.yawRate = 0;
    this.omega = 0;
    this.steer = 0;
    this.steerAngle = 0;
    this.boost = 0;
    this.boostF = 1;
    this.slip = 0;
    this.airTime = 0;
    this.fwdSpeed = 0;
    this.driftT = 0;
    this.bounceCD = 0;
    this.driftCharge = 0;
    this.stunT = 0;
    this.pitch = 0;
    this.pitchRate = 0;
    this.landQ = "";
    this.aoa = 0.08;
    this.glidePitch = 0;
    this.bankT = 0;
    if (this.v2) {
      this.lean = 0;
      this.mAx = 0;
      this.heave = 0;
      this.v2F = 1;
      this.v2R = 1;
    }
    this.rib = null;
    this.gravMul = 1;
    this.vehicle = "car";
    this.gSign = gs < 0 ? -1 : 1;
    this.lost = false;
    this._flipNow = false;
    this._springNow = false;
    this.cutT = 0;
    this.glassTime.clear();
    this.broken.clear();
    this.brokenVer++;
    this.graceT = 1.5;
    this.beltX = 0;
    this.beltZ = 0;
    this.beltS = 0;
    this.plateLock = "";
    this.sinkT = 0;
    this.hazardGrace = 0.8;
    const s = this.gSign > 0 ? this.track.surfaceAt(x, y + 0.5, z, this.surf, 3, this.excl, this.time) : this.track.ceilingSurfaceAt(x, y - 0.5, z, this.surf, 3, this.excl);
    if (this.gSign < 0) {
      this.n.x = 0;
      this.n.y = -1;
      this.n.z = 0;
      if (!Number.isFinite(s.h)) {
        s.h = y;
        s.type = "none";
      }
    }
    this.pos.y = s.h;
    this.prev.y = s.h;
    this.grounded = true;
    this._setGround(s, false);
    this._updateFwd();
  }
  get speed() {
    const v = this.vel;
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
  // Sens du « haut » local de la voiture : +1 toit vers le ciel, -1 retournée. Le volant fait tourner la voiture
  // AUTOUR de ce haut-là, pas autour du haut du monde (au plafond, la droite du pilote est la gauche du monde).
  // Au sol on le lit sur la normale du contact ; en l'air, c'est l'assiette, qui suit le sens de la gravité.
  _upSign() {
    if (this.grounded) {
      const ny = this.n.y;
      if (ny > 0.05) return 1;
      if (ny < -0.05) return -1;
    }
    return this.gSign;
  }
  _updateFwd() {
    if (this.rib) return;
    this.fwd.x = -dsin(this.yaw);
    this.fwd.y = 0;
    this.fwd.z = -dcos(this.yaw);
  }
  _setGround(s, triggers = true) {
    this.n.x = s.nx;
    this.n.y = s.ny;
    this.n.z = s.nz;
    this.surfType = s.type;
    this.surfMod = s.mod || "";
    this.surfTile = s.tile;
    this.surfPct = s.tile ? tileParam({
      s: s.mod || "",
      p: s.p
    }) : 100;
    this.surfP = this.surfPct / 100;
    this.surfLx = s.lx;
    this.surfLz = s.lz;
    if (!triggers || !s.tile) return;
    const mod = this.surfMod;
    if (this._timedMods(mod)) return;
    if (mod === "spring") {
      if (this.plateLock !== "spring") {
        this.plateLock = "spring";
        this.lockTile = s.tile;
        this._springNow = true;
        this.ev.spring = true;
      }
      return;
    }
    if (mod === "boost") this._boostPad(this.surfP);
    else if (mod === "gravity") this._gravityPad(this.surfP);
    else if (mod === "flip" && this.plateLock !== "flip") {
      this.plateLock = "flip";
      this.lockTile = s.tile;
      this.gSign = -this.gSign;
      this._flipNow = true;
      this.ev.flip = true;
      return;
    }
    if (mod === "flip") return;
    if (PLATES[mod]) this._transformPlate(mod);
    else this.plateLock = "";
  }
  // Pastilles et plaques : mêmes effets au sol (_setGround) et sur un ruban (_ribStep).
  _boostPad(f) {
    if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
    this.boost = CAR.boostTime;
    this.boostF = f;
  }
  _gravityPad(f) {
    if (Math.abs(f - this.gravMul) > 0.01) {
      this.gravMul = f;
      this.ev.gravity = true;
    }
  }
  // Plaques de transformation (moto, bateau, deltaplane) : une suite de plaques collées ne compte que pour UNE transformation ;
  // repasser sur la même plaque ramène la voiture.
  _transformPlate(mod) {
    if (this.plateLock === mod) return;
    this.plateLock = mod;
    this.vehicle = this.vehicle === PLATES[mod] ? "car" : PLATES[mod];
    this.ev.transform = true;
  }
  // Revêtements qui modifient les commandes (volant inversé, moteur coupé) : actifs tant
  // qu'on roule dessus, puis encore un court instant.
  _timedMods(mod) {
    if (mod === "reverse") {
      if (this.surfMod !== mod) this.ev.reverse = true;
      return true;
    }
    if (mod === "cut") {
      if (this.cutT <= 0) this.ev.cut = true;
      this.cutT = CAR.cutTime;
      return true;
    }
    return false;
  }
  // Sens et vitesse du tapis roulant au point (lx, lz) de la pièce (repère monde).
  _pct(tile) {
    return tile === this.surfTile ? this.surfPct : tileParam(tile);
  }
  _belt(tile, lx, lz, out) {
    sampleLocal(tile, lx, lz, S12);
    const sp = beltSpeed(this._pct(tile));
    rotVec(tile.r, S12.gz, -S12.gx, W13);
    out.x = W13.x * sp;
    out.z = W13.z * sp;
    return out;
  }
  // Verre fragile (Phase 3) : plus de condition de vitesse. Chaque dalle a un compte à rebours de contact CUMULÉ (réglage de la
  // pièce, en secondes). Quand il est écoulé, la dalle est brisée : elle n'a plus aucune collision (la voiture tombe) jusqu'au
  // prochain (re)départ, qui la restaure. Renvoie true à l'instant où la dalle cède.
  _glassCheck(on, tile, dt) {
    if (!on || !tile || this.graceT > 0 || this.broken.has(tile)) return false;
    const t = (this.glassTime.get(tile) || 0) + dt;
    this.glassTime.set(tile, t);
    if (t < glassSeconds(this._pct(tile))) return false;
    this.broken.add(tile);
    this.brokenVer++;
    this.ev.glass = true;
    this.ev.glassTile = tile;
    return true;
  }
  // ---------------------------------------------------------------- Pneus
  // Angle des roues avant selon la vitesse : à haute vitesse, un petit angle suffit.
  _steerAngle(speed, drift) {
    const K3 = this.k;
    const v2 = Math.max(1, speed * speed);
    const slipSat = K3.latGrip * K3.frontShare / K3.corner;
    let max = Math.min(K3.steerMax, datan((K3.a + K3.b) * K3.steerAlat / v2) + slipSat);
    max *= 1 + (K3.driftSteer - 1) * drift;
    return this.steer * max;
  }
  // Modèle bicyclette, repère voiture (x avant, y droite, w lacet > 0 = vers la droite).
  // ax : accélération longitudinale (moteur, freins) ; grip : multiplicateur d'adhérence.
  _tires(vx, vy, w, ax, grip, dt) {
    const drift = this.driftT, K3 = this.k;
    const delta = this._steerAngle(Math.abs(vx), drift);
    this.steerAngle = delta;
    const L4 = K3.a + K3.b;
    let maxF = K3.latGrip * grip * K3.frontShare;
    let maxR = K3.latGrip * grip * (1 - K3.frontShare) * (1 - (1 - K3.driftRear) * drift) * (this.rearK ?? 1);
    if (this.v2F) {
      maxF *= this.v2F;
      maxR *= this.v2R;
    }
    if (Math.abs(vx) < 1.5) {
      vx += ax * dt;
      const lateralDamp = clamp(0.35 + grip * 0.3, 0.35, 0.85);
      BK.vx = vx;
      BK.vy = vy * lateralDamp;
      BK.w = vx * dtan(delta) / L4 * clamp(grip, 0.2, 1);
      return BK;
    }
    const den = Math.max(Math.abs(vx), 6);
    const sgn = vx >= 0 ? 1 : -1;
    const af = datan2(vy + K3.a * w, den) - delta * sgn;
    const ar = datan2(vy - K3.b * w, den);
    const Ff = clamp(-K3.corner * af, -maxF, maxF);
    const Fr = clamp(-K3.corner * ar, -maxR, maxR);
    const cd = dcos(delta), sd = dsin(delta);
    vx += (ax - Ff * sd) * dt;
    vy += (Ff * cd + Fr) * dt;
    w += ((K3.a * Ff * cd - K3.b * Fr) / K3.yawK - w * K3.yawDamp) * dt;
    BK.vx = vx;
    BK.vy = vy;
    BK.w = w;
    return BK;
  }
  step(inp) {
    this._beginStep();
    inp = this._controls(inp);
    this._driftState(inp);
    if (this.v2 && (this.vehicle !== "moto" || !this.grounded || this.rib)) moto2Idle(this, DT);
    if (this.rib) {
      this._ribStep(inp);
      return;
    }
    if (this.grounded) {
      if (this._driveGround(inp)) return;
    } else this._flyAir(inp);
    if (this._collide()) return;
    this._roadContact();
  }
  // Début de pas : minuteries, évènements remis à zéro, position précédente.
  _beginStep() {
    const dt = DT, p = this.pos, ev = this.ev;
    if (this.graceT > 0) this.graceT -= dt;
    ev.wall = 0;
    ev.land = 0;
    ev.boostHit = false;
    ev.bounce = false;
    if (this.hazardGrace > 0) this.hazardGrace = Math.max(0, this.hazardGrace - dt);
    ev.loopIn = false;
    ev.loopOut = false;
    ev.loopFall = false;
    ev.transform = false;
    ev.gravity = false;
    ev.miniTurbo = 0;
    ev.landQ = "";
    ev.sink = false;
    ev.ring = false;
    ev.flip = false;
    ev.glass = false;
    ev.glassTile = null;
    ev.spring = false;
    ev.reverse = false;
    ev.cut = false;
    ev.spike = false;
    ev.shock = 0;
    ev.wallOff = false;
    this.prev.x = p.x;
    this.prev.y = p.y;
    this.prev.z = p.z;
    this.prevYaw = this.yaw;
  }
  // Commandes : volant inversé / moteur coupé, volant progressif, minuteries du boost, du rebond et du choc. Renvoie les commandes à appliquer.
  _controls(inp) {
    const dt = DT;
    const reverseActive = this.rib ? this.rib.tile.s === "reverse" : this.grounded && this.surfMod === "reverse";
    if (reverseActive) inp = {
      ...inp,
      steer: -(inp.steer || 0)
    };
    if (this.cutT > 0) {
      this.cutT -= dt;
      if (inp.throttle) inp = {
        ...inp,
        throttle: false
      };
    }
    const target = clamp(inp.steer || 0, -1, 1);
    const back = Math.abs(target) < Math.abs(this.steer) || target * this.steer < 0;
    const K3 = this.k;
    const sr = (back ? K3.steerOut : K3.steerIn) * dt;
    this.steer += clamp(target - this.steer, -sr, sr);
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt);
    if (this.bounceCD > 0) this.bounceCD -= dt;
    if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - dt);
    return inp;
  }
  // État de dérapage et mini-turbo.
  _driftState(inp) {
    const dt = DT, K3 = this.k, ev = this.ev;
    const turning = Math.abs(this.steer) > 0.5;
    if (inp.brake && !inp.throttle && turning && this.fwdSpeed > K3.driftMin && this.grounded) {
      this.driftT = Math.min(1, this.driftT + dt * 5);
    } else if (turning && this.driftT > 0 && this.fwdSpeed > K3.driftMin * 0.7) {
      this.driftT = Math.max(0, this.driftT - dt * 0.3);
    } else {
      this.driftT = Math.max(0, this.driftT - dt * 3.5);
    }
    if (this.driftT > 0.3 && this.grounded && this.slip > 0.04 * this.fwdSpeed && this.fwdSpeed > 10) {
      this.driftCharge += dt;
    } else if (this.driftT < 0.25) {
      if (this.driftCharge >= CAR.mtTime1 && this.grounded) {
        const lvl = this.driftCharge >= CAR.mtTime2 ? 2 : 1;
        const f = lvl === 2 ? 0.55 : 0.32;
        this.boostF = this.boost > 0 ? Math.max(this.boostF, f) : f;
        this.boost = Math.max(this.boost, lvl === 2 ? 0.8 : 0.55);
        ev.miniTurbo = lvl;
      }
      this.driftCharge = 0;
    }
  }
  // Voiture posée sur une route ou sur le terrain : dynamique dans le plan du sol, revêtement, tapis, pièces mobiles. Renvoie true si le pas se termine ici (noyade).
  _driveGround(inp) {
    const dt = DT, v = this.vel, K3 = this.k;
    let fx = -dsin(this.yaw), fy = 0, fz = -dcos(this.yaw);
    const n = this.n;
    const d = fx * n.x + fy * n.y + fz * n.z;
    fx -= n.x * d;
    fy -= n.y * d;
    fz -= n.z * d;
    let len = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx /= len;
    fy /= len;
    fz /= len;
    let rx = fy * n.z - fz * n.y, ry = fz * n.x - fx * n.z, rz = fx * n.y - fy * n.x;
    len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    rx /= len;
    ry /= len;
    rz /= len;
    let belt = this.surfMod === "conveyor" && this.surfTile ? this._belt(this.surfTile, this.surfLx, this.surfLz, BELT) : null;
    if (this.surfTile && this.surfTile.mv >= 2) {
      const o = this.track.moverOffset(this.surfTile, this.time, MOV2);
      if (!belt) {
        belt = BELT;
        BELT.x = 0;
        BELT.z = 0;
      }
      if (this.surfTile.mv === 2) {
        belt.x += o.vx;
        belt.z += o.vz;
      } else {
        belt.x += o.w * (this.pos.z - o.cz);
        belt.z -= o.w * (this.pos.x - o.cx);
        this.yaw += o.w * dt;
      }
    }
    if (belt) {
      v.x += belt.x - this.beltX;
      v.z += belt.z - this.beltZ;
      this.beltX = belt.x;
      this.beltZ = belt.z;
      v.x -= belt.x;
      v.z -= belt.z;
    } else {
      this.beltX = 0;
      this.beltZ = 0;
    }
    let vf = v.x * fx + v.y * fy + v.z * fz;
    let vr = v.x * rx + v.y * ry + v.z * rz;
    const g = this.g * this.gSign;
    vf -= g * fy * dt;
    vr -= g * ry * dt;
    const mod = this.surfMod, f = this.surfP;
    const ground = this.surfType === "ground";
    const C4 = surfaceCoeffs(ground ? "" : mod, f);
    let grip = C4.grip, traction = C4.traction, vmaxK = C4.vmaxK, extraDrag = C4.extraDrag;
    const rearK = C4.rearK;
    if (this.stunT > 0) {
      grip *= CAR.stunGrip;
      traction *= CAR.stunTraction;
    }
    if (ground) {
      grip = 0.55;
      traction = 0.7;
      vmaxK = 0.45;
      extraDrag = 5;
    } else if (mod === "water" || mod === "boat" && this.vehicle === "boat") {
      if (this.vehicle === "boat") {
        grip = 0.85;
        traction = 1;
        vmaxK = 1;
      } else {
        grip = 0.35;
        traction = 0.3;
        vmaxK = 0.3;
        extraDrag = 9;
        if (this.graceT <= 0 && Math.abs(vf) < 5) this.sinkT += dt;
        else this.sinkT = Math.max(0, this.sinkT - dt);
        if (this.sinkT > 1.2) {
          this.sinkT = 0;
          this.ev.sink = true;
        }
      }
    } else if (mod === "wind") {
      const a = (this._pct(this.surfTile) - 100) / 100 * CAR.wind;
      rotVec(this.surfTile.r, 1, 0, TMP2);
      vf += (TMP2.x * fx + TMP2.z * fz) * a * dt;
      vr += (TMP2.x * rx + TMP2.z * rz) * a * dt;
    }
    const wet = mod === "water" || mod === "boat";
    if (this.vehicle === "boat" && !wet) {
      grip = Math.min(grip, 0.8);
      traction *= 0.4;
      vmaxK = Math.min(vmaxK, 0.3);
      extraDrag += 7;
    }
    if (!wet) this.sinkT = 0;
    const P = this.params;
    if (P.grip !== 1) grip *= P.grip;
    if (P.windOn) {
      vf += (P.windX * fx + P.windZ * fz) * dt;
      vr += (P.windX * rx + P.windZ * rz) * dt;
    }
    const E = this.env;
    if (E) {
      const st = this.clock || 0;
      if (!wet) grip *= E.gripAt(this.pos.x, this.pos.y, this.pos.z, st);
      if (E.gust) {
        const g2 = E.gustAt(st);
        vf += (g2.x * fx + g2.z * fz) * dt;
        vr += (g2.x * rx + g2.z * rz) * dt;
      }
    }
    if (this.v2) {
      if (this.vehicle === "moto") grip *= moto2Ground(this, inp, vf, this.g, dt);
      if (this.vehicle === "boat" && wet) {
        const b = boat2Water(this, this.surfTile, fx, fz, rx, rz, this.g, dt);
        vf += b.dvf;
        vr += b.dvr;
        grip *= b.grip;
      } else this.heave = 0;
    }
    const ax = (this._longitudinal(vf, inp, K3.maxSpeed * vmaxK, traction, extraDrag, dt) - vf) / dt;
    if (this.v2) this.mAx = ax;
    this.rearK = rearK;
    const r = this._tires(vf, vr, this.omega, ax, grip, dt);
    this.rearK = 1;
    vf = r.vx;
    vr = r.vy;
    this.omega = r.w;
    const us = this._upSign();
    this.yaw -= this.omega * us * dt;
    this.yawRate = -this.omega * us;
    v.x = fx * vf + rx * vr;
    v.y = fy * vf + ry * vr;
    v.z = fz * vf + rz * vr;
    if (belt) {
      v.x += belt.x;
      v.z += belt.z;
    }
    if (this._glassCheck(mod === "glass", this.surfTile, dt)) this.grounded = false;
    if (this.ev.sink) return true;
    this.slip = Math.abs(vr);
    this.fwdSpeed = vf;
    this.airTime = 0;
    this.pitch = dasin(clamp(fy, -1, 1));
    this.pitchRate = 0;
    return false;
  }
  // En l'air : trajectoire balistique, rotation, tangage, vol plané.
  _flyAir(inp) {
    const dt = DT, v = this.vel, K3 = this.k;
    let fx = -dsin(this.yaw), fz = -dcos(this.yaw);
    if (this.vehicle === "glider") {
      this._glide(inp, dt);
      fx = -dsin(this.yaw);
      fz = -dcos(this.yaw);
    } else v.y -= this.g * this.gSign * dt;
    this.omega *= dexp(-1.5 * dt);
    if (this.vehicle !== "glider") this.omega = clamp(this.omega + this.steer * CAR.airSteer * dt, -CAR.airSteerMax, CAR.airSteerMax);
    const us = this._upSign();
    this.yaw -= this.omega * us * dt;
    this.yawRate = -this.omega * us;
    this.steerAngle = this._steerAngle(hypot2(v.x, v.z), this.driftT);
    const k = 1 - 6e-4 * this.speed * dt;
    v.x *= k;
    v.y *= k;
    v.z *= k;
    this.slip = 0;
    this.fwdSpeed = v.x * fx + v.z * fz;
    this.airTime += dt;
    const pin = this.vehicle === "glider" ? 0 : (inp.brake ? 1 : 0) - (inp.throttle ? 1 : 0);
    this.pitchRate += pin * this.gSign * K3.airPitchAcc * (pin > 0 ? CAR.airPitchUpK : 1) * dt;
    this.pitchRate *= dexp(-CAR.airPitchDamp * dt);
    if (this.vehicle === "glider") this.pitch = this.glidePitch;
    else this.pitch = clamp(this.pitch + this.pitchRate * dt, -1.4, 1.4);
  }
  // Déplacement puis collisions (anneaux, entrée de ruban, murs, toits, dalles, obstacles, limites). Renvoie true si le pas se termine ici.
  _collide() {
    const dt = DT, p = this.pos, v = this.vel;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    this._rings();
    if (this.ev.sink) return true;
    if (this._tryEnterRibbon()) return true;
    if (!this.grounded && this._tryLandRibbon()) return true;
    this._walls();
    this._tunnelRoof();
    this._slabs();
    this._obstacles();
    if (this.ev.sink) return true;
    this._bounds();
    return false;
  }
  // Contact avec la chaussée : adhérence, décollage, réception, revêtements à effet unique (rebond, inversion, ressort).
  _roadContact() {
    const dt = DT, p = this.pos, v = this.vel, ev = this.ev;
    const gs = this.gSign;
    const s = gs > 0 ? this.track.surfaceAt(p.x, p.y, p.z, this.surf, CAR.step, this.excl, this.time) : this.track.ceilingSurfaceAt(p.x, p.y, p.z, this.surf, CAR.step, this.excl);
    const gap = gs * (p.y - s.h);
    const vn = v.x * s.nx + v.y * s.ny + v.z * s.nz;
    const magnet = s.mod === "magnet";
    const launch = magnet ? Infinity : CAR.launch;
    const snap = magnet ? CAR.step : CAR.snap;
    if (!this.grounded) {
      const m = gs > 0 ? this.track.surfaceAt(p.x, p.y, p.z, this.surfM, CAR.magnetRange, this.excl, this.time) : this.track.ceilingSurfaceAt(p.x, p.y, p.z, this.surfM, CAR.magnetRange, this.excl);
      const mg = gs * (p.y - m.h);
      if (m.mod === "magnet" && mg > 0.02 && mg < CAR.magnetRange) {
        const a = CAR.magnetAcc * (1 - mg / CAR.magnetRange) * dt;
        v.x -= m.nx * a;
        v.y -= m.ny * a;
        v.z -= m.nz * a;
      }
    }
    const stick = vn < launch;
    if (this.grounded && gap < snap && gap > -CAR.step && stick) {
      p.y = s.h;
      const sp = this.speed;
      v.x -= s.nx * vn;
      v.y -= s.ny * vn;
      v.z -= s.nz * vn;
      const sp2 = this.speed;
      if (sp2 > 1e-4) {
        const k = sp / sp2;
        v.x *= k;
        v.y *= k;
        v.z *= k;
      }
      this._setGround(s);
    } else if (!this.grounded && gap <= 0.02 && gap > -CAR.step && vn <= 0.5) {
      p.y = s.h;
      if ((this.plateLock === "flip" || this.plateLock === "spring") && s.tile !== this.lockTile) this.plateLock = "";
      if (vn < 0) {
        v.x -= s.nx * vn;
        v.y -= s.ny * vn;
        v.z -= s.nz * vn;
        ev.land = -vn;
        const k = this._landing(s.nx, s.ny, s.nz);
        v.x *= k;
        v.y *= k;
        v.z *= k;
      }
      this.grounded = true;
      this._setGround(s);
    } else {
      this.grounded = false;
    }
    if (this.grounded && this.surfMod === "bounce" && this.bounceCD <= 0) {
      const n = this.n;
      const vn2 = v.x * n.x + v.y * n.y + v.z * n.z;
      const add = Math.max(0, CAR.bounce * this.surfP - vn2);
      v.x += n.x * add;
      v.y += n.y * add;
      v.z += n.z * add;
      this.grounded = false;
      this.bounceCD = 0.4;
      ev.bounce = true;
    }
    if (this._flipNow) {
      this._flipNow = false;
      const n = this.n;
      v.x += n.x * CAR.flipKick;
      v.y += n.y * CAR.flipKick;
      v.z += n.z * CAR.flipKick;
      this.grounded = false;
      this.pitch = dasin(clamp(this.fwd.y, -1, 1));
      this.airTime = 0;
    }
    if (this._springNow) {
      this._springNow = false;
      const t = this.surfTile;
      if (t) {
        sampleLocal(t, this.surfLx, this.surfLz, S12);
        rotVec(t.r, S12.gx, S12.gz, W13);
        const k = (this._pct(t) - 100) / 100 * CAR.spring;
        const n = this.n;
        v.x += W13.x * k + n.x * CAR.springHop;
        v.y += n.y * CAR.springHop;
        v.z += W13.z * k + n.z * CAR.springHop;
        this.grounded = false;
        this.pitch = dasin(clamp(this.fwd.y, -1, 1));
        this.airTime = 0;
      }
    }
    if (gs < 0 && !this.grounded && p.y > this.skyY) this.lost = true;
    this._updateFwd();
  }
  // Nouvelle vitesse longitudinale : moteur, freins, résistances.
  // load : part du poids qui appuie les roues sur la route (1 au sol, 0 sur un mur vertical).
  _longitudinal(vf, inp, vmax, traction, extraDrag, dt, load = 1) {
    const K3 = this.k;
    let a = 0;
    if (inp.throttle) {
      if (vf < -0.5) a += K3.brake * traction;
      else {
        const x = Math.max(0, vf / vmax);
        a += K3.accel * traction * (1 - dpow(x, CAR.accelCurve));
      }
    }
    if (inp.brake) {
      if (vf > 0.5) a -= K3.brake * traction * (1 - CAR.driftBrake * this.driftT);
      else if (!inp.throttle) {
        const x = Math.max(0, -vf) / CAR.reverseMax;
        a -= CAR.reverseAccel * traction * (1 - x * x);
      }
    }
    if (this.boost > 0) {
      const f = this.boostF;
      const vb = K3.maxSpeed + (CAR.boostSpeed - K3.maxSpeed) * f;
      const x = Math.max(0, vf) / vb;
      a += CAR.boostAccel * f * Math.max(0, 1 - x * x);
    }
    let res = CAR.roll * load + CAR.drag * vf * vf + extraDrag * load;
    if (!inp.throttle && !inp.brake) res += CAR.coast * load;
    res += 4 * this.driftT * load;
    const dvr = res * dt;
    if (Math.abs(vf) <= dvr) vf = 0;
    else vf -= Math.sign(vf) * dvr;
    return vf + a * dt;
  }
  // ---------------------------------------------------------------- Obstacles
  // ---------------------------------------------------------------- Rubans
  // Vol plané du deltaplane : portance perpendiculaire à la vitesse, traînée,
  // incidence pilotée (gaz = piquer, frein = cabrer), virage incliné au volant.
  _glide(inp, dt) {
    const v = this.vel, G = GLIDE;
    const hv = hypot2(v.x, v.z);
    const sp = Math.max(1e-3, hypot2(hv, v.y));
    const aoaT = inp.brake ? G.up : inp.throttle ? G.down : G.trim;
    this.aoa += (aoaT - this.aoa) * Math.min(1, dt * 3);
    let L4 = G.lift * sp * sp * Math.max(0, 0.6 + 4 * this.aoa);
    L4 = Math.min(L4, G.liftMaxG * this.g);
    if (this.v2) L4 *= altitudeK(this.pos.y);
    const D = G.drag * sp * sp + G.induced * L4;
    const dx = v.x / sp, dy = v.y / sp, dz = v.z / sp;
    const gu = this.gSign;
    let lx = -dx * dy * gu, ly = (1 - dy * dy) * gu, lz = -dz * dy * gu;
    const ll = hypot3(lx, ly, lz) || 1;
    lx /= ll;
    ly /= ll;
    lz /= ll;
    v.x += (L4 * lx - D * dx) * dt;
    v.y += (L4 * ly - D * dy - this.g * gu) * dt;
    v.z += (L4 * lz - D * dz) * dt;
    if (this.v2) {
      v.y += thermalLift(this.track.envSeed | 0, this.pos.x, this.pos.y, this.pos.z) * gu * dt;
      const P = this.params;
      if (P.windOn) {
        v.x += P.windX * dt;
        v.z += P.windZ * dt;
      }
      if (this.env && this.env.gust) {
        const w = this.env.gustAt(this.clock || 0);
        v.x += w.x * dt;
        v.z += w.z * dt;
      }
    }
    this.bankT = (this.bankT || 0) + (this.steer - (this.bankT || 0)) * Math.min(1, dt * G.turnRamp);
    const yr = this.bankT * G.turn * Math.min(1, hv / G.turnSpeed);
    const a = -yr * gu * dt, c = dcos(a), s = dsin(a);
    const vx = v.x * c + v.z * s, vz = v.z * c - v.x * s;
    v.x = vx;
    v.z = vz;
    this.yaw += a;
    this.omega = yr;
    const traj = datan2(v.y, Math.max(1e-3, hypot2(v.x, v.z)));
    this.glidePitch = traj + this.aoa;
  }
  // Anneaux turbo : traverser le disque donne une poussée.
  _rings() {
    const p = this.pos, q = this.prev;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (const tile of tiles) {
      if (tile.t !== "ring" && !tile.tb) continue;
      if (this.excl !== this.broken && this.excl.has(tile)) continue;
      toLocal(tile, p.x, p.z, L12);
      toLocal(tile, q.x, q.z, L22);
      if (L12.lz * L22.lz > 0 || L12.lz === L22.lz) continue;
      const k = L22.lz / (L22.lz - L12.lz);
      const lx = L22.lx + (L12.lx - L22.lx) * k, y = q.y + (p.y - q.y) * k;
      const cy = tile.l * LEVEL_H + ROAD_TOP + RING_Y;
      if (hypot2(lx, y - cy) > RING_R) continue;
      this.boost = Math.max(this.boost, 1.3);
      this.boostF = Math.max(this.boost > 0 ? this.boostF : 0, 0.9);
      this.ev.ring = true;
      this.ev.boostHit = true;
    }
  }
  // Qualité de la réception : nez aligné avec la route et voiture dans l'axe de sa
  // trajectoire = aucune perte ; nez planté ou réception de travers = perte de vitesse.
  // Renvoie le facteur appliqué à la vitesse.
  _landing(nx, ny, nz) {
    if (this.airTime < 0.35) return 1;
    const v = this.vel;
    const c = dcos(this.pitch), sn = dsin(this.pitch);
    const fx = -dsin(this.yaw) * c, fy = sn, fz = -dcos(this.yaw) * c;
    const mis = Math.abs(dasin(clamp(fx * nx + fy * ny + fz * nz, -1, 1)));
    const hv = hypot2(v.x, v.z);
    let side = 0;
    if (hv > 4) {
      const hx = -dsin(this.yaw), hz = -dcos(this.yaw);
      side = dacos(clamp((v.x * hx + v.z * hz) / hv, -1, 1));
      if (side > Math.PI / 2) side = Math.PI - side;
    }
    const loss = clamp((mis - CAR.landOk) * 0.45, 0, 0.35) + clamp((side - 0.35) * 0.3, 0, 0.2);
    if (mis < 0.12 && side < 0.15 && this.airTime > 0.6) this.ev.landQ = "perfect";
    else if (loss > 0.12) this.ev.landQ = "bad";
    else this.ev.landQ = "ok";
    this.landQ = this.ev.landQ;
    this.pitchRate = 0;
    return 1 - loss;
  }
};
Object.assign(CarPhysics.prototype, wallMethods, obstacleMethods, ribbonMethods);

// js/raceLogic.js
var L3 = {
  lx: 0,
  lz: 0
};
var S3 = {};
var RaceLogic = class {
  constructor(track, opts2 = {}) {
    this.track = track;
    this.laps = Math.max(1, track.laps || 1);
    this.partial = !!opts2.partial;
    this.cps = track.tiles.filter((t) => cpKind(t));
    this.startTile = track.startTile;
    this.reset();
  }
  spawnPoint() {
    const t = this.startTile;
    if (!t) return {
      x: CELL / 2,
      y: 0.4,
      z: CELL / 2,
      yaw: 0
    };
    const c = tileCenter(t);
    const back = 4;
    const fx = [
      0,
      1,
      0,
      -1
    ][t.r], fz = [
      -1,
      0,
      1,
      0
    ][t.r];
    return {
      x: c.x - fx * back,
      y: baseY(t),
      z: c.z - fz * back,
      yaw: -t.r * Math.PI / 2,
      gs: t.v || this.track.flip0 ? -1 : 1
    };
  }
  reset() {
    if (this.ext) this.ext.reset();
    this.lastGround = null;
    this.collected = /* @__PURE__ */ new Set();
    this.splits = [];
    this.finished = false;
    this.steps = 0;
    this.lap = 1;
    const T = this.track;
    this.respawn = {
      ...this.spawnPoint(),
      vehicle: T.veh0 || "car",
      grav: (T.g0 || 100) / 100,
      snap: this._snap()
    };
    this.inFinish = false;
  }
  // État de course au passage d'un checkpoint : y revenir remet le chrono à ce temps.
  _snap() {
    const s = {
      steps: this.steps,
      splits: this.splits.length,
      collected: [
        ...this.collected
      ],
      lap: this.lap
    };
    if (this.ext) s.ext = this.ext.snapshot();
    return s;
  }
  // Retour au dernier checkpoint passé (touche R ou réapparition automatique) :
  // le chrono, les temps intermédiaires et le tour reviennent à ce moment-là.
  // keepClock (multijoueur) : le chronomètre NE revient PAS en arrière, il continue de tourner : le retour au
  // checkpoint coûte donc tout le temps perdu (pénalité). Les checkpoints, le tour et les temps intermédiaires
  // reviennent, eux, à l'état du checkpoint.
  rewind({ keepClock = false } = {}) {
    const s = this.respawn.snap;
    if (s) {
      if (!keepClock) this.steps = s.steps;
      this.splits.length = Math.min(this.splits.length, s.splits);
      this.collected = new Set(s.collected);
      this.lap = s.lap;
      if (this.ext && s.ext) this.ext.restore(s.ext);
    }
    this.finished = false;
    this.inFinish = false;
    return this.respawn;
  }
  // Point de réapparition d'un checkpoint aérien : la dernière route roulable traversée
  // (mémorisée par la course), sinon l'anneau lui-même au niveau de sa base.
  _ringRespawn(tile, phys) {
    if (this.lastGround) {
      const g = this.lastGround;
      return {
        x: g.x,
        y: g.y,
        z: g.z,
        yaw: g.yaw
      };
    }
    const c = tileCenter(tile);
    return {
      x: c.x,
      y: baseY(tile),
      z: c.z,
      yaw: phys.yaw
    };
  }
  get time() {
    return this.steps * DT;
  }
  // À appeler après chaque pas physique pendant la course.
  update(phys) {
    if (this.finished) return null;
    this.steps++;
    const p = phys.pos;
    if (phys.grounded && !phys.rib && phys.surfType === "road" && this.steps % 30 === 0) {
      this.lastGround = {
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: phys.yaw,
        steps: this.steps
      };
    }
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    let event = null;
    let onFinish = false;
    for (const tile of this.track.tilesAt(cx, cz)) {
      if (this.excluded && this.excluded.has(tile)) continue;
      const P = PIECES[tile.t];
      const ck = cpKind(tile);
      const sp = ck ? "checkpoint" : P.special;
      if (sp !== "checkpoint" && sp !== "finish") continue;
      const h = baseY(tile);
      if (ck === "ring") {
        if (this.collected.has(tile)) continue;
        toLocal(tile, p.x, p.z, L3);
        const lz1 = L3.lz, lx1 = L3.lx;
        toLocal(tile, phys.prev.x, phys.prev.z, L3);
        if (lz1 * L3.lz > 0 || lz1 === L3.lz) continue;
        const k = L3.lz / (L3.lz - lz1);
        const lx = L3.lx + (lx1 - L3.lx) * k, y = phys.prev.y + (p.y - phys.prev.y) * k;
        if (hypot2(lx, y - (h + RING_Y)) > RING_R + 0.5) continue;
        const gl = this.lastGround;
        const snap = this._snap();
        snap.pre = true;
        if (gl) snap.steps = gl.steps;
        const rr = this._ringRespawn(tile, phys);
        this.collected.add(tile);
        this.splits.push(this.steps);
        this.respawn = {
          ...rr,
          vehicle: phys.vehicle,
          grav: phys.gravMul,
          gs: phys.gSign,
          snap
        };
        event = {
          type: "checkpoint",
          index: this.splits.length,
          steps: this.steps
        };
        continue;
      }
      if (tile.v ? p.y > h + 1.5 || p.y < h - LEVEL_H * 1.5 : p.y < h - 1.5 || p.y > h + LEVEL_H * 1.5) continue;
      toLocal(tile, p.x, p.z, L3);
      sampleLocal(tile, L3.lx, L3.lz, S3);
      if (!S3.inFootprint || Math.abs(S3.d) > ROAD_HALF + 1.5) continue;
      if (sp === "checkpoint" && !this.collected.has(tile)) {
        this.collected.add(tile);
        this.splits.push(this.steps);
        let c = tileCenter(tile);
        if (!P.special && P.kind === "arc") {
          const a = arcParams(P), ang = Math.PI * 1.25;
          c = localToWorld(tile, a.cx + a.R * dcos(ang), a.cz + a.R * dsin(ang));
        }
        let base = -tile.r * Math.PI / 2;
        if (!P.special && P.kind === "arc") base -= Math.PI / 4;
        let yaw = base;
        let da = phys.yaw - base;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > Math.PI / 2) yaw = base + Math.PI;
        this.respawn = {
          x: c.x,
          y: h,
          z: c.z,
          yaw,
          vehicle: phys.vehicle,
          grav: phys.gravMul,
          gs: phys.gSign,
          snap: this._snap()
        };
        event = {
          type: "checkpoint",
          index: this.splits.length,
          steps: this.steps
        };
      } else if (sp === "finish") {
        onFinish = true;
        if (this.inFinish) continue;
        if (this.partial || this.collected.size >= this.cps.length) {
          if (this.lap < this.laps && !this.partial) {
            this.lap++;
            this.collected.clear();
            this.splits.push(this.steps);
            this.respawn = {
              x: p.x,
              y: h,
              z: p.z,
              yaw: phys.yaw,
              vehicle: phys.vehicle,
              grav: phys.gravMul,
              gs: phys.gSign,
              snap: this._snap()
            };
            event = {
              type: "lap",
              lap: this.lap,
              laps: this.laps,
              index: this.splits.length,
              steps: this.steps
            };
          } else {
            this.finished = true;
            event = {
              type: "finish",
              steps: this.steps
            };
          }
        } else {
          event = {
            type: "missing",
            remaining: this.cps.length - this.collected.size
          };
        }
      }
    }
    this.inFinish = onFinish;
    return event;
  }
};
function placeAtStart(phys, logic, sp = logic.spawnPoint()) {
  const T = logic.track;
  phys.place(sp.x, sp.y, sp.z, sp.yaw, sp.gs || 1);
  phys.vehicle = T.veh0 || "car";
  phys.gravMul = (T.g0 || 100) / 100;
  const v0 = (T.v0 || 0) / 3.6;
  if (v0 > 0) {
    phys.vel.x = -dsin(sp.yaw) * v0;
    phys.vel.z = -dcos(sp.yaw) * v0;
    phys.fwdSpeed = v0;
  }
}

// js/simulation.js
function placeAtRespawn(phys, r) {
  phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
  phys.vehicle = r.vehicle || "car";
  phys.gravMul = r.grav || 1;
}
var Simulation = class {
  // partial : test depuis le curseur (pas besoin des checkpoints). offTrackLimit : temps hors piste (s) avant la réapparition automatique.
  constructor(track, { partial = false, offTrackLimit = OFF_TRACK_RESPAWN_S } = {}) {
    this.track = track;
    this.phys = new CarPhysics(track);
    this.logic = new RaceLogic(track, {
      partial
    });
    this.lgc = createLogic(track, this.phys, this.logic);
    if (this.lgc) this.logic.ext = this.lgc;
    this.offTrackLimit = offTrackLimit;
    this.groundT = 0;
    this.idle = 0;
    this.sank = false;
    this.lost = "";
  }
  // (Re)départ : règles remises à zéro, voiture au point de départ avec les paramètres du niveau. spawn : point de départ imposé
  // (test depuis le curseur de l'éditeur), qui sert aussi de point de retour.
  start(spawn = null) {
    const T = this.track;
    this.logic.reset();
    const sp = spawn || this.logic.spawnPoint();
    if (spawn) this.logic.respawn = {
      ...sp,
      vehicle: T.veh0 || "car",
      grav: (T.g0 || 100) / 100
    };
    placeAtStart(this.phys, this.logic, sp);
    this.groundT = 0;
    this.idle = 0;
    this.sank = false;
    this.lost = "";
    return sp;
  }
  // Retour au dernier checkpoint (touche R, hors piste, noyade). keepClock : le chrono continue de tourner (multijoueur).
  rewind({ keepClock = false } = {}) {
    const r = this.logic.rewind({
      keepClock
    });
    placeAtRespawn(this.phys, r);
    this.groundT = 0;
    this.sank = false;
    this.lost = "";
    return r;
  }
  // Phase 1 d'un pas : horloge de la course puis physique.
  drive(inp) {
    this.phys.clock = this.logic.steps + (this.logic.finished ? this.idle++ : 0);
    this.phys.step(inp);
    this.sank = this.phys.ev.sink;
  }
  // Phase 2 d'un pas : règles de course puis suivi du hors-piste. Renvoie l'évènement de course (checkpoint, tour, arrivée...) ou null.
  score() {
    const before = this.logic.respawn;
    const ev = this.logic.update(this.phys);
    if (this.lgc) {
      this.lgc.onStep(ev);
      const r = this.logic.respawn;
      if (r !== before && r.snap && !r.snap.pre) {
        r.snap.ext = this.lgc.snapshot();
        r.grav = this.phys.gravMul;
      }
    }
    if (this.phys.offTrack) this.groundT += DT;
    else this.groundT = 0;
    const crossed = !!ev && ev.type === "finish";
    this.lost = crossed ? "" : this.sank ? "sink" : this.groundT > this.offTrackLimit ? "offTrack" : "";
    return ev;
  }
  step(inp) {
    this.drive(inp);
    return this.score();
  }
};

// js/autopilot.js
var Autopilot = class {
  constructor(path, opts2 = {}) {
    this.path = path;
    this.idx = 0;
    this.latLimit = opts2.latLimit ?? CAR.latGrip * 0.62;
    this.brakeDecel = opts2.brakeDecel ?? 20;
    this.vCap = opts2.vCap ?? (path.pilot && path.pilot.vCap) ?? 52;
    const n = path.length;
    this.dist = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const a = path[i - 1], b = path[i];
      this.dist[i] = this.dist[i - 1] + hypot3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    this.radius = new Float32Array(n).fill(1e4);
    for (let i = 1; i < n - 1; i++) {
      const a = path[Math.max(0, i - 2)], b = path[i], c = path[Math.min(n - 1, i + 2)];
      if (a[3] === 1 || b[3] === 1 || c[3] === 1) continue;
      const h1 = datan2(b[2] - a[2], b[0] - a[0]);
      const h2 = datan2(c[2] - b[2], c[0] - b[0]);
      let dh = h2 - h1;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const len = hypot2(b[0] - a[0], b[2] - a[2]) * 0.5 + hypot2(c[0] - b[0], c[2] - b[2]) * 0.5;
      if (Math.abs(dh) > 1e-3 && len > 0.5) this.radius[i] = Math.max(2, len / Math.abs(dh)) * (b[3] === 2 ? 1.7 : 1);
    }
  }
  // Hauteur du chemin le plus proche plus loin devant (approximation du sol d'arrivée).
  _groundBelow(y) {
    let best = -Infinity;
    for (let k = this.idx; k < Math.min(this.path.length, this.idx + 60); k++) {
      const q = this.path[k];
      if (q[1] <= y + 0.5 && q[1] > best) best = q[1];
    }
    return best === -Infinity ? y : best;
  }
  // Pente (rad) du chemin à une distance donnée.
  _pathSlopeAt(d) {
    const path = this.path, n = path.length;
    let k = this.idx;
    while (k < n - 2 && this.dist[k] < d) k++;
    const a = path[Math.max(0, k - 2)], b = path[Math.min(n - 1, k + 2)];
    const h = hypot2(b[0] - a[0], b[2] - a[2]);
    return h > 0.5 ? datan2(b[1] - a[1], h) : 0;
  }
  reset(phys) {
    this.idx = 0;
    if (phys) this._progress(phys, 400);
  }
  _progress(phys, range = 40) {
    const p = phys.pos, path = this.path;
    let best = this.idx, bd = Infinity;
    const end = Math.min(path.length - 1, this.idx + range);
    for (let i = this.idx; i <= end; i++) {
      const q = path[i];
      const dx = q[0] - p.x, dz = q[2] - p.z, dy = (q[1] - p.y) * 3;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    this.idx = best;
  }
  // En gravité inversée (au plafond), la droite du pilote est la gauche du monde et
  // « nez en haut » vise le bas : on traduit les commandes calculées en repère monde.
  control(phys) {
    const c = this._control(phys);
    if (phys.rib) {
      if (phys.rib.tile.v) c.steer = -c.steer;
    } else if (phys.gSign < 0) {
      c.steer = -c.steer;
      if (!phys.grounded && phys.vehicle !== "glider") {
        const t = c.throttle;
        c.throttle = c.brake;
        c.brake = t;
      }
    }
    const reverseActive = phys.rib ? phys.rib.tile.s === "reverse" : phys.grounded && phys.surfMod === "reverse";
    if (reverseActive) c.steer = -c.steer;
    return c;
  }
  _control(phys) {
    this._progress(phys);
    if (phys.rib) {
      const R = phys.rib;
      const d2 = R.dir * R.dl;
      const vs = Math.max(8, Math.abs(R.vs));
      const psiDes = dasin(Math.max(-0.5, Math.min(0.5, -1.2 * d2 / vs)));
      const st2 = (psiDes - R.psi) * 6 - phys.omega * 0.35;
      return {
        throttle: true,
        brake: false,
        steer: Math.max(-1, Math.min(1, st2)),
        drift: false
      };
    }
    const path = this.path, p = phys.pos;
    if (!phys.grounded && phys.vehicle === "glider") {
      let j2 = this.idx;
      while (j2 < path.length - 1 && this.dist[j2] - this.dist[this.idx] < 30) j2++;
      const tq2 = path[j2];
      const fx2 = -dsin(phys.yaw), fz2 = -dcos(phys.yaw);
      const tx2 = tq2[0] - p.x, tz2 = tq2[2] - p.z;
      const ang2 = datan2(fx2 * tz2 - fz2 * tx2, fx2 * tx2 + fz2 * tz2);
      const hv = Math.max(8, hypot2(phys.vel.x, phys.vel.z));
      const wantVy = (tq2[1] + 3 - p.y) / (Math.max(10, hypot2(tx2, tz2)) / hv);
      let landK = -1;
      for (let k = this.idx + 1; k < path.length && k < this.idx + 80; k++) {
        if (hypot2(path[k][0] - path[k - 1][0], path[k][2] - path[k - 1][2]) > 30) {
          landK = k;
          break;
        }
      }
      let low, high;
      if (landK > 0 && landK > j2) {
        const rest = hypot2(path[landK][0] - p.x, path[landK][2] - p.z);
        const want = path[landK][1] + 3 + rest / 9;
        low = p.y < want;
        high = p.y > want + 4;
      } else {
        low = phys.vel.y < wantVy + 2;
        high = phys.vel.y > wantVy + 6;
      }
      const dive = phys.speed < 24 || high && phys.speed < 42;
      const pull = !dive && (low || phys.speed > 56);
      return {
        throttle: dive,
        brake: pull,
        steer: Math.max(-1, Math.min(1, ang2 * 2.2)),
        drift: false
      };
    }
    if (!phys.grounded) {
      const hv = hypot2(phys.vel.x, phys.vel.z);
      const tLand = Math.max(0.15, (phys.vel.y + Math.sqrt(Math.max(0, phys.vel.y * phys.vel.y + 2 * phys.g * Math.max(0, p.y - this._groundBelow(p.y))))) / phys.g);
      const ahead = this._pathSlopeAt(this.dist[this.idx] + hv * tLand);
      const err = phys.pitch - ahead + phys.pitchRate * 0.35;
      const steerAir = 0;
      return {
        throttle: err > 0.03,
        brake: err < -0.03,
        steer: steerAir,
        drift: false
      };
    }
    const v = Math.max(0, phys.fwdSpeed);
    const look = 8 + v * 0.32;
    let j = this.idx;
    while (j < path.length - 1 && this.dist[j] - this.dist[this.idx] < look && path[j + 1][3] !== 1) j++;
    if (path[j + 1] && path[j + 1][3] === 1 && j === this.idx) j++;
    const tq = path[j];
    const fx = -dsin(phys.yaw), fz = -dcos(phys.yaw);
    const tx = tq[0] - p.x, tz = tq[2] - p.z;
    const cross = fx * tz - fz * tx;
    const dot = fx * tx + fz * tz;
    const ang = datan2(cross, dot);
    const steer = Math.max(-1, Math.min(1, ang * 2.6 - (phys.omega || 0) * 0.25));
    let vTarget = this.vCap;
    const horizon = 15 + v * v / (2 * this.brakeDecel);
    for (let k = this.idx; k < path.length && this.dist[k] - this.dist[this.idx] < horizon; k++) {
      const vMax = Math.sqrt(this.latLimit * this.radius[k]);
      const dd = this.dist[k] - this.dist[this.idx];
      const allowed2 = Math.sqrt(vMax * vMax + 2 * this.brakeDecel * dd);
      if (allowed2 < vTarget) vTarget = allowed2;
    }
    const throttle = v < vTarget - 0.5;
    const brake = v > vTarget + 2.5;
    let st = steer;
    if (brake && Math.abs(st) > 0.45) st = Math.sign(st) * 0.45;
    return {
      throttle,
      brake,
      steer: st,
      drift: false
    };
  }
};

// js/daily.js
function dayKey(d = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function rng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
var BLOCKS = [
  [
    "S",
    5,
    0
  ],
  [
    "S2",
    5,
    0
  ],
  [
    "S3",
    2,
    0
  ],
  [
    "R",
    5,
    0
  ],
  [
    "L",
    5,
    0
  ],
  [
    "RR",
    3,
    0
  ],
  [
    "LL",
    3,
    0
  ],
  [
    "BR",
    1.2,
    0
  ],
  [
    "BL",
    1.2,
    0
  ],
  [
    "S.b",
    2.5,
    0
  ],
  [
    "S2.i",
    0.8,
    0
  ],
  [
    "S.d",
    0.6,
    0
  ],
  [
    "S.s",
    0.5,
    0
  ],
  [
    "S2.t",
    0.7,
    0
  ],
  [
    "S2.p",
    0.4,
    0
  ],
  [
    "S2.v",
    0.3,
    0
  ],
  [
    "U S",
    1.6,
    1
  ],
  [
    "D S",
    1.6,
    -1,
    1
  ],
  [
    "GU2 S",
    0.8,
    1
  ],
  [
    "GD2 S",
    0.8,
    -1,
    1
  ],
  [
    "S2 UU G2 DD S",
    1.2,
    0
  ],
  [
    "S UU GR2 DD S",
    0.6,
    0
  ],
  [
    "O S",
    0.9,
    0
  ],
  [
    "OL S",
    0.9,
    0
  ],
  [
    "CK S",
    0.5,
    0
  ],
  [
    "CKL S",
    0.5,
    0
  ],
  [
    "TB S",
    0.4,
    0
  ],
  [
    "TI TM2 TO S",
    0.5,
    0
  ],
  [
    "Y2.b S",
    0.7,
    0
  ],
  [
    "S.o S2 R S2 S.o",
    0.4,
    0
  ]
];
function pick(r, list) {
  const tot = list.reduce((a, b) => a + b[1], 0);
  let x = r() * tot;
  for (const b of list) {
    x -= b[1];
    if (x <= 0) return b;
  }
  return list[list.length - 1];
}
function tryBuild(tokens, decor) {
  try {
    return scriptTrack("D\xE9fi du jour", tokens.join(" "), {
      decor
    });
  } catch {
    return null;
  }
}
function botTime(track, latK = 0.8) {
  const sim = new Simulation(track, {
    offTrackLimit: 0.3
  });
  sim.start();
  const bot = new Autopilot(track.path, {
    latLimit: CAR.latGrip * latK,
    brakeDecel: 36
  });
  bot.reset(sim.phys);
  for (let i = 0; i < 120 * 120; i++) {
    const ev = sim.step(bot.control(sim.phys));
    if (ev && ev.type === "finish") return sim.logic.time;
    if (sim.lost) return null;
  }
  return null;
}
var cache3 = /* @__PURE__ */ new Map();
function dailyChallenge(day = dayKey()) {
  if (cache3.has(day)) return cache3.get(day);
  const decors = DAILY_DECORS;
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = rng(day + "#" + attempt);
    const decor = decors[Math.floor(r() * decors.length)];
    const tokens = [
      "start",
      "S2"
    ];
    let level = 0, sinceCp = 0, cps = 0;
    const target = 22 + Math.floor(r() * 8);
    let fails = 0;
    while (tokens.length < target && fails < 60) {
      const ok = BLOCKS.filter((b2) => (b2[3] || 0) <= level);
      const b = pick(r, ok);
      let tok = b[0];
      if (sinceCp >= 6 && cps < 3) tok = (r() < 0.3 ? r() < 0.5 ? "KR" : "KL" : "C") + " " + tok;
      const next = [
        ...tokens,
        tok
      ];
      if (tryBuild([
        ...next,
        "S",
        "finish"
      ], decor)) {
        tokens.push(tok);
        level += b[2];
        if (tok.startsWith("C ") || tok.startsWith("KR") || tok.startsWith("KL")) {
          sinceCp = 0;
          cps++;
        } else sinceCp++;
      } else fails++;
    }
    while (level > 0) {
      const t2 = [
        ...tokens,
        "D S"
      ];
      if (!tryBuild([
        ...t2,
        "finish"
      ], decor)) break;
      tokens.push("D S");
      level--;
    }
    const track = tryBuild([
      ...tokens,
      "S",
      "finish"
    ], decor);
    if (!track || track.tiles.length < 32) continue;
    const t80 = botTime(track, 0.8);
    if (t80 == null) continue;
    const t100 = botTime(track, 1) || t80 * 0.97;
    const r1 = (x) => Math.round(x * 10) / 10;
    const medals = {
      cristal: Math.floor(Math.min(t100, t80) * 0.97 * 10) / 10,
      or: r1(t80),
      argent: r1(t80 * 1.15),
      bronze: r1(t80 * 1.35)
    };
    track.name = `D\xE9fi du ${day.split("-").reverse().join("/")}`;
    const out = {
      day,
      track,
      medals,
      key: "daily-" + day,
      script: tokens.join(" ")
    };
    cache3.set(day, out);
    return out;
  }
  return null;
}

// js/version.js
var PHYS_VER = 26;

// js/ghostFormat.js
var GHOST_EVERY = 4;
var GHOST_STRIDE = 7;
var GHOST_VEHICLES = [
  "car",
  "moto",
  "boat",
  "glider"
];
function poseQuat(p, out = [
  0,
  0,
  0,
  1
]) {
  let ux = p.n.x, uy = p.n.y, uz = p.n.z;
  if (!p.grounded) {
    ux = 0;
    uy = 1;
    uz = 0;
  }
  let fx = p.fwd.x, fy = p.fwd.y, fz = p.fwd.z;
  const d = fx * ux + fy * uy + fz * uz;
  fx -= ux * d;
  fy -= uy * d;
  fz -= uz * d;
  if (fx * fx + fy * fy + fz * fz < 1e-6) {
    fx = -dsin(p.yaw);
    fy = 0;
    fz = -dcos(p.yaw);
  }
  let l = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  fx /= l;
  fy /= l;
  fz /= l;
  let rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
  l = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  rx /= l;
  ry /= l;
  rz /= l;
  const m11 = rx, m12 = ux, m13 = -fx, m21 = ry, m22 = uy, m23 = -fy, m31 = rz, m32 = uz, m33 = -fz;
  const tr = m11 + m22 + m33;
  let x, y, z, w;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s;
    x = (m32 - m23) * s;
    y = (m13 - m31) * s;
    z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    w = (m32 - m23) / s;
    x = 0.25 * s;
    y = (m12 + m21) / s;
    z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    w = (m13 - m31) / s;
    x = (m12 + m21) / s;
    y = 0.25 * s;
    z = (m23 + m32) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    w = (m21 - m12) / s;
    x = (m13 + m31) / s;
    y = (m23 + m32) / s;
    z = 0.25 * s;
  }
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
  return out;
}
function encodeFloats(arr) {
  if (!ArrayBuffer.isView(arr)) return "";
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = "";
  const CH = 32768;
  for (let i = 0; i < bytes.length; i += CH) {
    const slice = bytes.subarray(i, Math.min(i + CH, bytes.length));
    bin += String.fromCharCode.apply(null, slice);
  }
  return btoa(bin);
}

// js/replay.js
function decodeInputs(b64) {
  const bin = atob(b64);
  const steer = [], flags = [];
  let total = 0;
  for (let i = 0; i + 2 < bin.length; i += 3) total += bin.charCodeAt(i);
  if (total > MAX_RUN_STEPS) throw new Error("Enregistrement trop long.");
  for (let i = 0; i + 2 < bin.length; i += 3) {
    const n = bin.charCodeAt(i), s = bin.charCodeAt(i + 1) << 24 >> 24, f = bin.charCodeAt(i + 2);
    for (let k = 0; k < n; k++) {
      steer.push(s);
      flags.push(f);
    }
  }
  return {
    steer,
    flags,
    length: steer.length
  };
}
function inputAt(rep, k) {
  if (!rep || k >= rep.length) return {
    steer: 0,
    throttle: false,
    brake: true,
    drift: false,
    respawn: false
  };
  const f = rep.flags[k];
  return {
    steer: rep.steer[k] / 100,
    throttle: !!(f & 1),
    brake: !!(f & 2),
    drift: false,
    respawn: !!(f & 4)
  };
}
var HIST_STRIDE = 17;
var VEH_IDS = [
  "car",
  "moto",
  "boat",
  "glider"
];
var GhostRunner = class {
  // ghost : enregistre aussi le fantôme (une pose tous les GHOST_EVERY pas, comme la course en direct) : c'est ce que la fonction serveur range avec un record.
  constructor(track, { inputs = null, bot = false, latK = 0.8, ghost = false } = {}) {
    this.gRec = ghost ? [] : null;
    this.gVeh = [];
    this._q = [
      0,
      0,
      0,
      1
    ];
    this.sim = new Simulation(track);
    this.phys = this.sim.phys;
    this.logic = this.sim.logic;
    this.rep = inputs ? decodeInputs(inputs) : null;
    this.bot = bot && track.path ? new Autopilot(track.path, {
      latLimit: 56 * latK
    }) : null;
    this.hist = new Float32Array(HIST_STRIDE * 1024);
    this.reset();
  }
  reset() {
    this.sim.start();
    if (this.bot) this.bot.reset(this.phys);
    this.k = 0;
    this.done = false;
    this._record(0);
  }
  step() {
    if (this.done) return;
    const inp = this.bot ? this.bot.control(this.phys) : inputAt(this.rep, this.k);
    if (inp.respawn) {
      this.sim.rewind();
      this._gTrim();
    }
    const ev = this.sim.step(inp);
    if (this.gRec) this._gSample();
    if (this.sim.lost) {
      this.sim.rewind();
      this._gTrim();
    }
    if (ev && ev.type === "finish") this.done = true;
    if (this.rep && this.k >= this.rep.length + 240) this.done = true;
    this.k++;
    this._record(this.k);
  }
  // Fantôme enregistré (comme RaceSession) : un échantillon quand le chrono tombe sur un multiple de GHOST_EVERY ; un retour au checkpoint efface ce qui suit le checkpoint.
  _gSample() {
    const steps = this.logic.steps;
    if (steps % GHOST_EVERY !== 0) return;
    const p = this.phys, q = poseQuat(p, this._q);
    const vid = GHOST_VEHICLES.indexOf(p.vehicle), last = this.gVeh.length ? this.gVeh[this.gVeh.length - 1][1] : 0;
    if (vid !== last) this.gVeh.push([
      this.gRec.length / GHOST_STRIDE,
      vid
    ]);
    this.gRec.push(p.pos.x, p.pos.y, p.pos.z, q[0], q[1], q[2], q[3]);
  }
  _gTrim() {
    if (!this.gRec) return;
    this.gRec.length = Math.min(this.gRec.length, Math.floor(this.logic.steps / GHOST_EVERY) * GHOST_STRIDE);
    while (this.gVeh.length && this.gVeh[this.gVeh.length - 1][0] >= this.gRec.length / GHOST_STRIDE) this.gVeh.pop();
  }
  // Le fantôme enregistré : { data: Float32Array, veh } (nécessite l'option ghost).
  ghostResult() {
    return {
      data: new Float32Array(this.gRec),
      veh: this.gVeh.map((c) => c.slice())
    };
  }
  // Avance jusqu'au pas k (les lignes de l'historique jusque-là existent) ; renvoie false si le fantôme a terminé avant.
  seek(k) {
    while (this.k < k && !this.done) this.step();
    return k <= this.k;
  }
  _record(k) {
    if ((k + 1) * HIST_STRIDE > this.hist.length) {
      const h2 = new Float32Array(this.hist.length * 2);
      h2.set(this.hist);
      this.hist = h2;
    }
    const p = this.phys, h = this.hist, o = k * HIST_STRIDE;
    h[o] = p.pos.x;
    h[o + 1] = p.pos.y;
    h[o + 2] = p.pos.z;
    h[o + 3] = p.prev.x;
    h[o + 4] = p.prev.y;
    h[o + 5] = p.prev.z;
    h[o + 6] = p.n.x;
    h[o + 7] = p.n.y;
    h[o + 8] = p.n.z;
    h[o + 9] = p.fwd.x;
    h[o + 10] = p.fwd.y;
    h[o + 11] = p.fwd.z;
    h[o + 12] = p.yaw;
    h[o + 13] = p.grounded ? 1 : 0;
    h[o + 14] = VEH_IDS.indexOf(p.vehicle);
    h[o + 15] = this.done ? 1 : 0;
    h[o + 16] = 0;
  }
  // Ce qu'il faut pour dessiner la voiture après k pas (out : pos, prev, n, fwd, yaw, grounded, vehicle, done). Avance le fantôme si besoin.
  poseAt(k, out) {
    this.seek(k);
    const i = Math.min(k, this.k), h = this.hist, o = i * HIST_STRIDE;
    out.pos.x = h[o];
    out.pos.y = h[o + 1];
    out.pos.z = h[o + 2];
    out.prev.x = h[o + 3];
    out.prev.y = h[o + 4];
    out.prev.z = h[o + 5];
    out.n.x = h[o + 6];
    out.n.y = h[o + 7];
    out.n.z = h[o + 8];
    out.fwd.x = h[o + 9];
    out.fwd.y = h[o + 10];
    out.fwd.z = h[o + 11];
    out.yaw = h[o + 12];
    out.grounded = h[o + 13] === 1;
    out.vehicle = VEH_IDS[h[o + 14]] || "car";
    out.done = k > this.k || h[o + 15] === 1;
    return out;
  }
};

// js/rulesCore.js
var VEHICLE_CHOICES = [
  [
    "",
    "Celui du circuit"
  ],
  [
    "car",
    "Voiture"
  ],
  [
    "moto",
    "Moto"
  ],
  [
    "boat",
    "Bateau"
  ],
  [
    "glider",
    "Deltaplane"
  ]
];
var DEFAULT_RULES = Object.freeze({
  laps: 0,
  g0: 0,
  veh0: "",
  v0: -1,
  offroad: -1,
  obstacles: "",
  sameCars: 0
});
var VEHICLES2 = VEHICLE_CHOICES.map(([k]) => k).filter(Boolean);
var int2 = (v, lo, hi, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
function sanitizeRules(r) {
  const o = r && typeof r === "object" ? r : {};
  return {
    laps: o.laps ? int2(o.laps, 1, 5, 0) : 0,
    g0: o.g0 ? int2(o.g0, 15, 250, 0) : 0,
    veh0: VEHICLES2.includes(o.veh0) ? o.veh0 : "",
    v0: o.v0 >= 0 ? int2(o.v0, 0, 300, -1) : -1,
    offroad: o.offroad === 1 || o.offroad === true ? 1 : o.offroad === 0 || o.offroad === false ? 0 : -1,
    obstacles: o.obstacles === "off" ? "off" : "",
    sameCars: o.sameCars ? 1 : 0,
    ...extraRules(o)
  };
}
function extraRules(o) {
  const out = {};
  const grip = o.grip ? int2(o.grip, 25, 150, 0) : 0;
  if (grip && grip !== 100) out.grip = grip;
  const wind = o.wind ? int2(o.wind, 0, 100, 0) : 0;
  if (wind) {
    out.wind = wind;
    out.windDir = (Math.round(int2(o.windDir, -3600, 3600, 0) / 15) * 15 % 360 + 360) % 360;
  }
  for (const k of [
    "rain",
    "frost",
    "gust"
  ]) {
    const v = o[k] ? int2(o[k], 0, 100, 0) : 0;
    if (v) out[k] = v;
  }
  if (out.rain || out.frost || out.gust) {
    const seed = o.envSeed ? int2(o.envSeed, 0, 999, 0) : 0;
    if (seed) out.envSeed = seed;
    if (out.rain && o.envVary) out.envVary = true;
  }
  if (+o.vm === 2) out.vm = 2;
  if (o.pm === "arcade" || o.pm === "sim") out.pm = o.pm;
  return out;
}
function usesVehicles(track) {
  const V = [
    "moto",
    "boat",
    "glider"
  ];
  return V.includes(track.veh0) || track.tiles.some((t) => V.includes(t.s) || V.includes(t.s2));
}
var isDefaultRules = (r) => JSON.stringify(sanitizeRules(r)) === JSON.stringify(DEFAULT_RULES);
function applyRules(track, rules) {
  const r = sanitizeRules(rules);
  if (isDefaultRules(r)) return track;
  const t = track.clone();
  if (track.path) t.path = track.path;
  const p = {};
  if (r.g0) p.g0 = r.g0;
  if (r.veh0) p.veh0 = r.veh0;
  if (r.v0 >= 0) p.v0 = r.v0;
  if (r.offroad >= 0) p.offroad = r.offroad;
  if (r.grip) p.grip = r.grip;
  if (r.wind) {
    p.wind = r.wind;
    p.windDir = r.windDir;
  }
  if (r.pm) p.pm = r.pm;
  if (r.vm && usesVehicles(track)) p.vm = r.vm;
  if (r.rain || r.frost || r.gust) Object.assign(p, {
    rain: r.rain || 0,
    frost: r.frost || 0,
    gust: r.gust || 0,
    envSeed: r.envSeed || 0,
    envVary: !!r.envVary
  });
  t.setParams(p);
  if (r.laps && t.laps > 1) {
    if (t.path) {
      const L4 = Math.round((t.path.length - 1) / t.laps) + 1, one = t.path.slice(0, L4), pilot = t.path.pilot;
      const path = one.slice();
      for (let k = 1; k < r.laps; k++) path.push(...one.slice(1));
      if (pilot) path.pilot = pilot;
      t.path = path;
    }
    t.laps = r.laps;
  }
  if (r.obstacles === "off") {
    for (const d of t.decos.slice()) if (isObstacle(d.k)) t.removeDeco(d);
  }
  return t;
}

// js/variants.js
var VARIANT_VER = "v1";
var WIND_DIRS = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "so",
  "o",
  "no"
];
var RAIN_SEED = 17;
var VARIANTS = {
  as: {
    re: /^1$/,
    tag: true,
    rule: () => ({})
  },
  duel: {
    re: /^[1-9][0-9]{0,9}$/,
    tag: true,
    rule: () => ({})
  },
  g: {
    values: [
      "40",
      "70",
      "130",
      "180"
    ],
    rule: (v) => ({
      g0: +v
    })
  },
  gp: {
    values: [
      "60",
      "80"
    ],
    rule: (v) => ({
      grip: +v
    })
  },
  lap: {
    values: [
      "1",
      "2",
      "3",
      "4",
      "5"
    ],
    rule: (v) => ({
      laps: +v
    })
  },
  obs: {
    values: [
      "0"
    ],
    rule: () => ({
      obstacles: "off"
    })
  },
  off: {
    values: [
      "0",
      "1"
    ],
    rule: (v) => ({
      offroad: +v
    })
  },
  pm: {
    values: [
      "arcade",
      "sim"
    ],
    rule: (v) => ({
      pm: v
    })
  },
  rn: {
    values: [
      "60"
    ],
    rule: (v) => ({
      rain: +v,
      envSeed: RAIN_SEED
    })
  },
  sea: {
    re: /^[1-9][0-9]{0,3}$/,
    tag: true,
    rule: () => ({})
  },
  tour: {
    re: /^[1-9][0-9]{0,9}$/,
    tag: true,
    rule: () => ({})
  },
  v0: {
    values: [
      "0",
      "100",
      "200"
    ],
    rule: (v) => ({
      v0: +v
    })
  },
  veh: {
    values: [
      "car",
      "moto",
      "boat",
      "glider"
    ],
    rule: (v) => ({
      veh0: v
    })
  },
  vm: {
    values: [
      "2"
    ],
    rule: () => ({
      vm: 2
    })
  },
  wd: {
    values: WIND_DIRS,
    rule: (v) => ({
      wind: 25,
      windDir: WIND_DIRS.indexOf(v) * 45
    })
  }
};
var NAMES = Object.keys(VARIANTS).sort();
var allowed = (n, val) => VARIANTS[n].values ? VARIANTS[n].values.includes(val) : VARIANTS[n].re.test(val);
function rulesOfVariant(v) {
  const r = {};
  for (const n of NAMES) if (v[n] != null) Object.assign(r, VARIANTS[n].rule(String(v[n])));
  return r;
}
function formatVariant(v) {
  const parts = [];
  for (const n of Object.keys(v || {})) if (!Object.hasOwn(VARIANTS, n)) throw new Error("Cat\xE9gorie de record inconnue.");
  for (const n of NAMES) {
    if (v[n] == null) continue;
    const val = String(v[n]);
    if (!allowed(n, val)) throw new Error("Cat\xE9gorie de record inconnue.");
    parts.push(`${n}-${val}`);
  }
  return parts.length ? `${VARIANT_VER}.${parts.join(".")}` : "";
}
function parseVariant(s) {
  const str = String(s || "");
  const m = /^v1((?:\.[a-z0-9]+-[a-z0-9]+)+)$/.exec(str);
  if (!m) throw new Error("Cat\xE9gorie de record inconnue.");
  const v = {};
  for (const p of m[1].slice(1).split(".")) {
    const i = p.indexOf("-"), n = p.slice(0, i), val = p.slice(i + 1);
    if (!Object.hasOwn(VARIANTS, n) || Object.hasOwn(v, n) || !allowed(n, val)) throw new Error("Cat\xE9gorie de record inconnue.");
    v[n] = val;
  }
  if (formatVariant(v) !== str) throw new Error("Cat\xE9gorie de record inconnue.");
  return v;
}
function splitKey(key2) {
  const k = String(key2 || ""), i = k.indexOf("~");
  return i < 0 ? {
    base: k,
    variant: ""
  } : {
    base: k.slice(0, i),
    variant: k.slice(i + 1)
  };
}
function applyVariant(track, v) {
  const names = Object.keys(v || {}).filter((n) => v[n] != null);
  if (names.length && names.every((n) => VARIANTS[n] && VARIANTS[n].tag)) return track;
  const t = applyRules(track, rulesOfVariant(v));
  if (t === track || t.signature() === track.signature() && t.laps === track.laps) throw new Error("Cette cat\xE9gorie ne change rien sur ce circuit.");
  return t;
}

// js/seasons.js
var SEASON_EPOCH = Date.UTC(2026, 10, 9);
var SEASON_MS = 7 * 864e5;
var SEASON_TRACKS = 3;
var SEASON_GRACE_MS = 10 * 6e4;
var seasonBounds = (n) => ({
  starts: SEASON_EPOCH + (n - 1) * SEASON_MS,
  ends: SEASON_EPOCH + n * SEASON_MS
});
function seasonTracks(n) {
  const pool = BUILTIN_TRACKS.filter((d) => d.decor !== "atelier");
  const r = rng("season#" + n), out = [];
  while (out.length < SEASON_TRACKS) {
    const d = pool[Math.floor(r() * pool.length)];
    if (!out.includes(d)) out.push(d);
  }
  return out;
}
function seasonOpen(n, t = Date.now()) {
  const { starts, ends } = seasonBounds(n);
  if (!(n >= 1) || t < starts) return "Cette saison n\u2019a pas encore commenc\xE9.";
  if (t >= ends + SEASON_GRACE_MS) return "Cette saison est termin\xE9e : les temps ne comptent plus.";
  return "";
}

// js/verify.js
function trackForKey(key2, code = "") {
  key2 = String(key2 || "");
  const { base, variant } = splitKey(key2);
  if (key2.includes("~")) {
    const off = trackForKey(base, code);
    const v = parseVariant(variant);
    if (v.duel != null || v.tour != null) {
      if (Object.keys(v).length !== 1 || off.kind !== "builtin") throw new Error("Comp\xE9tition possible seulement sur un circuit de la carri\xE8re.");
      const kind = v.duel != null ? "duel" : "tour";
      return {
        ...off,
        name: `${off.name} \xB7 ${kind === "duel" ? "duel" : "tournoi"} ${v[kind]}`,
        variant: v,
        competition: {
          kind,
          id: +v[kind],
          base
        }
      };
    }
    if (v.sea != null) {
      const n = +v.sea;
      if (Object.keys(v).length !== 1 || off.kind !== "builtin" || !seasonTracks(n).some((d) => base.startsWith(`b-${d.id}-`))) throw new Error("Ce circuit ne fait pas partie de cette saison.");
      const closed = seasonOpen(n);
      if (closed) throw new Error(closed);
      return {
        ...off,
        name: `${off.name} \xB7 saison ${n}`,
        variant: v,
        season: n
      };
    }
    return {
      ...off,
      track: applyVariant(off.track, v),
      name: `${off.name} \xB7 ${variant}`,
      variant: v
    };
  }
  if (key2.startsWith("b-")) {
    const def = BUILTIN_TRACKS.find((d) => key2.startsWith(`b-${d.id}-`));
    if (!def) throw new Error("Circuit int\xE9gr\xE9 inconnu.");
    const track = buildBuiltin(def);
    if (`b-${def.id}-${hashString(track.encode())}` !== key2) throw new Error("Version du circuit diff\xE9rente : mets le jeu \xE0 jour.");
    return {
      track,
      kind: "builtin",
      name: def.name
    };
  }
  if (key2.startsWith("daily-")) {
    const day = key2.slice(6);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("D\xE9fi du jour introuvable.");
    const t = Date.parse(day + "T00:00:00Z");
    if (!Number.isFinite(t) || Math.abs(t - Date.now()) > 2.5 * 864e5) throw new Error("D\xE9fi du jour hors dates valides.");
    const c = dailyChallenge(day);
    if (!c || c.key !== key2) throw new Error("D\xE9fi du jour introuvable.");
    return {
      track: c.track,
      kind: "daily",
      name: c.track.name
    };
  }
  if (key2.startsWith("u-")) {
    const track = Track.decode(code);
    if (track.userKey !== key2) throw new Error("Le code du circuit ne correspond pas.");
    return {
      track,
      kind: "user",
      name: track.name
    };
  }
  throw new Error("Cl\xE9 de circuit invalide.");
}
function replayRun(track, inputs, { ghost = false } = {}) {
  if (!inputs || inputs.length > MAX_INPUTS_CHARS) return null;
  let rep;
  try {
    rep = decodeInputs(inputs);
  } catch {
    return null;
  }
  if (!rep.length || rep.length > MAX_RUN_STEPS) return null;
  const g = new GhostRunner(track, {
    inputs,
    ghost
  });
  while (!g.done && g.k < MAX_RUN_STEPS) g.step();
  if (!g.logic.finished) return null;
  const out = {
    time: g.logic.time,
    splits: g.logic.splits.slice()
  };
  if (ghost) {
    const r = g.ghostResult();
    out.ghost = encodeFloats(r.data);
    out.ghostVeh = r.veh;
  }
  return out;
}
function verifyRun({ trackKey, code, inputs, time, physVer, withGhost = false }) {
  if (physVer !== PHYS_VER) return {
    ok: false,
    error: `Version du jeu diff\xE9rente (jeu ${physVer}, serveur ${PHYS_VER}).`,
    versionMismatch: true
  };
  let t;
  try {
    t = trackForKey(trackKey, code);
  } catch (e) {
    return {
      ok: false,
      error: e.message
    };
  }
  const run = replayRun(t.track, inputs, {
    ghost: withGhost
  });
  if (run == null) return {
    ok: false,
    error: "La course rejou\xE9e n\u2019atteint pas l\u2019arriv\xE9e."
  };
  if (Math.abs(run.time - time) > 5e-4) return {
    ok: false,
    error: "Le temps ne correspond pas \xE0 la course rejou\xE9e."
  };
  return {
    ok: true,
    time: run.time,
    splits: run.splits,
    name: t.name,
    kind: t.kind,
    ...t.season ? {
      season: t.season
    } : {},
    ...t.competition ? {
      competition: t.competition
    } : {},
    ...withGhost ? {
      ghost: run.ghost,
      ghostVeh: run.ghostVeh
    } : {}
  };
}

// supabase/functions/submit-score/handler.js
var MAX_BODY_CHARS = MAX_INPUTS_CHARS + MAX_TRACK_CODE_CHARS + 4096;
var RATE_LIMIT = {
  max: 8,
  windowMs: 6e4
};
var MAX_GHOST_CHARS = 8e5;
function createHandler({ supabaseUrl, serviceKey, fetch: fetchImpl = globalThis.fetch, allowedOrigin = "*", now = Date.now, rateLimit = RATE_LIMIT, log = console.error }) {
  const cors = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra
    }
  });
  const db = (path, init = {}) => fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...init.headers ?? {}
    }
  });
  async function count(query) {
    const r = await db(`scores?${query}&select=player`, {
      headers: {
        Prefer: "count=exact",
        Range: "0-0"
      }
    });
    const range = r.headers.get("content-range") ?? "*/0";
    return parseInt(range.split("/")[1] ?? "0", 10) || 0;
  }
  const hits = /* @__PURE__ */ new Map();
  function tooFast(uid) {
    const t = now();
    const recent = (hits.get(uid) ?? []).filter((x) => t - x < rateLimit.windowMs);
    if (recent.length >= rateLimit.max) {
      hits.set(uid, recent);
      return Math.ceil((rateLimit.windowMs - (t - recent[0])) / 1e3);
    }
    recent.push(t);
    hits.set(uid, recent);
    if (hits.size > 5e3) {
      for (const [k, v] of hits) if (!v.some((x) => t - x < rateLimit.windowMs)) hits.delete(k);
    }
    return 0;
  }
  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response("ok", {
      headers: cors
    });
    if (req.method !== "POST") return json(405, {
      error: "M\xE9thode non autoris\xE9e."
    });
    try {
      if (!supabaseUrl || !serviceKey) return json(500, {
        error: "Fonction mal configur\xE9e (cl\xE9s Supabase absentes)."
      });
      const declared = Number(req.headers.get("content-length") ?? 0);
      if (declared > MAX_BODY_CHARS) return json(413, {
        error: "Requ\xEAte trop volumineuse."
      });
      const ures = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: req.headers.get("Authorization") ?? "",
          apikey: serviceKey
        }
      });
      if (!ures.ok) return json(401, {
        error: "Non connect\xE9."
      });
      const user = await ures.json();
      const uid = String(user.id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(uid)) return json(401, {
        error: "Non connect\xE9."
      });
      const wait = tooFast(uid);
      if (wait) return json(429, {
        error: `Trop de courses envoy\xE9es : r\xE9essaie dans ${wait} s.`
      }, {
        "Retry-After": String(wait)
      });
      const text = await req.text();
      if (text.length > MAX_BODY_CHARS) return json(413, {
        error: "Requ\xEAte trop volumineuse."
      });
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return json(400, {
          error: "Requ\xEAte invalide."
        });
      }
      const { trackKey, code = "", inputs, time, physVer } = body ?? {};
      if (typeof trackKey !== "string" || trackKey.length > 80 || typeof inputs !== "string" || typeof time !== "number" || !Number.isFinite(time) || !Number.isInteger(physVer)) {
        return json(400, {
          error: "Requ\xEAte invalide."
        });
      }
      if (typeof code !== "string" || code.length > MAX_TRACK_CODE_CHARS) return json(400, {
        error: "Code de circuit invalide."
      });
      const res = verifyRun({
        trackKey,
        code,
        inputs,
        time,
        physVer,
        withGhost: true
      });
      if (!res.ok || typeof res.time !== "number") return json(422, {
        error: res.error ?? "Course non confirm\xE9e.",
        ...res.versionMismatch ? {
          versionMismatch: true
        } : {}
      });
      const simTime = res.time;
      if (res.competition) {
        const { kind, id, base: base2 } = res.competition;
        const w = await db("rpc/competition_open", {
          method: "POST",
          body: JSON.stringify({
            kind,
            cid: id,
            p: uid,
            base: base2
          })
        });
        if (!w.ok) return json(422, {
          error: "Comp\xE9titions indisponibles sur ce serveur (\xE9tape SQL 12)."
        });
        const why = await w.json();
        if (why !== "") return json(422, {
          error: typeof why === "string" && why ? why : "Comp\xE9tition ferm\xE9e."
        });
      }
      const prof = await (await db(`players?id=eq.${uid}&select=id`)).json();
      if (!Array.isArray(prof) || !prof.length) return json(400, {
        error: "Profil pilote manquant."
      });
      const key2 = encodeURIComponent(trackKey);
      let prevRes = await db(`scores?track_key=eq.${key2}&player=eq.${uid}&select=time,phys_ver,has_ghost`);
      if (!prevRes.ok) prevRes = await db(`scores?track_key=eq.${key2}&player=eq.${uid}&select=time,phys_ver`);
      const prev = await prevRes.json();
      let best = simTime;
      let improved = true;
      if (Array.isArray(prev) && prev.length && prev[0].phys_ver === physVer && prev[0].time <= simTime) {
        best = prev[0].time;
        improved = false;
      }
      const ghost = typeof res.ghost === "string" && res.ghost.length <= MAX_GHOST_CHARS ? {
        ghost: res.ghost,
        ghost_veh: res.ghostVeh ?? []
      } : null;
      const backfill = !improved && ghost && prev[0].has_ghost === false && Math.abs(prev[0].time - simTime) < 1e-6;
      if (improved) {
        const row = {
          track_key: trackKey,
          player: uid,
          time: simTime,
          inputs,
          phys_ver: physVer,
          track_name: String(res.name ?? "").slice(0, 60),
          updated_at: new Date(now()).toISOString()
        };
        const splits = Array.isArray(res.splits) && res.splits.length <= 400 ? {
          splits: res.splits
        } : {};
        const post = (r) => db("scores", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=minimal"
          },
          body: JSON.stringify(r)
        });
        let up = await post({
          ...row,
          ...splits,
          ...ghost || {}
        });
        if (!up.ok && up.status === 400 && ghost && splits.splits) up = await post({
          ...row,
          ...ghost
        });
        if (!up.ok && up.status === 400 && (ghost || splits.splits)) up = await post(row);
        if (!up.ok) return json(500, {
          error: "Enregistrement impossible."
        });
      } else if (backfill) {
        await db(`scores?track_key=eq.${key2}&player=eq.${uid}`, {
          method: "PATCH",
          headers: {
            Prefer: "return=minimal"
          },
          body: JSON.stringify(ghost)
        });
      }
      if (!improved && Array.isArray(res.splits) && res.splits.length && res.splits.length <= 400 && Math.abs(prev[0].time - simTime) < 1e-6) {
        await db(`scores?track_key=eq.${key2}&player=eq.${uid}&splits=is.null`, {
          method: "PATCH",
          headers: {
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            splits: res.splits
          })
        });
      }
      const base = `track_key=eq.${key2}&phys_ver=eq.${physVer}`;
      const before = await count(`${base}&time=lt.${best}`);
      const total = await count(base);
      return json(200, {
        ok: true,
        improved,
        best,
        rank: before + 1,
        total
      });
    } catch (e) {
      log("submit-score :", e);
      return json(500, {
        error: "Erreur interne."
      });
    }
  };
}

// supabase/functions/submit-score/server.ts
Deno.serve(createHandler({
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  allowedOrigin: Deno.env.get("ALLOWED_ORIGIN") ?? "*"
}));
