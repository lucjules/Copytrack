// Copytrack : fonction serveur « submit-score » (Supabase Edge Function).
// FICHIER GÉNÉRÉ par tools/build-function.mjs à partir de server.ts et du code du jeu :
// ne pas modifier à la main. À coller tel quel dans Supabase (Edge Functions).
// deno-lint-ignore-file
// @ts-nocheck
// js/constants.js
var CELL = 24;
var HALF = CELL / 2;
var LEVEL_H = 4.8;
var ROAD_W = 18;
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
var LOOP_R = 12;
var LOOP_LANE = HALF;
var DT = 1 / 120;
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

// js/pieces.js
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
    R: 18,
    lane: 24,
    turns: 1
  },
  loopBigL: {
    label: "Grand looping \u21B0",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 7,
    mirror: -1,
    R: 18,
    lane: 24,
    turns: 1
  },
  loopDouble: {
    label: "Double looping \u21B1",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 5,
    mirror: 1,
    R: 12,
    lane: 24,
    turns: 2
  },
  loopDoubleL: {
    label: "Double looping \u21B0",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 5,
    mirror: -1,
    R: 12,
    lane: 24,
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
    R: 18,
    lane: 24,
    turns: 2
  },
  loopBigDoubleL: {
    label: "Grand looping \xD72 \u21B0",
    kind: "loop",
    size: 3,
    rise: 0,
    clearance: 7,
    mirror: -1,
    R: 18,
    lane: 24,
    turns: 2
  },
  loopTriple: {
    label: "Triple looping \u21B1",
    kind: "loop",
    size: 4,
    rise: 0,
    clearance: 5,
    mirror: 1,
    R: 12,
    lane: 36,
    turns: 3
  },
  loopTripleL: {
    label: "Triple looping \u21B0",
    kind: "loop",
    size: 4,
    rise: 0,
    clearance: 5,
    mirror: -1,
    R: 12,
    lane: 36,
    turns: 3
  },
  loopBigTriple: {
    label: "Grand looping \xD73 \u21B1",
    kind: "loop",
    size: 4,
    rise: 0,
    clearance: 7,
    mirror: 1,
    R: 18,
    lane: 36,
    turns: 3
  },
  loopBigTripleL: {
    label: "Grand looping \xD73 \u21B0",
    kind: "loop",
    size: 4,
    rise: 0,
    clearance: 7,
    mirror: -1,
    R: 18,
    lane: 36,
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
  // Pièces à 90° (0.9.2) : la route bascule autour de son axe jusqu'à un plan VERTICAL (route « sur le côté »).
  // La gravité ne change pas : à vitesse insuffisante la voiture glisse le long du plan et tombe par le bord (pas de bordures).
  // `side` : 1 transition, 2 ligne droite (l'appui vient en partie de la vitesse, voir physics.js) ; `pivot` : côté du plan (-1 gauche, 1 droite) ;
  // `below` : niveaux réservés SOUS la pièce (la moitié basse du plan descend de 9 m : la pièce ne se pose donc pas au niveau 0 ou 1).
  rollL: {
    label: "Transition c\xF4t\xE9 \u21B0",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 2,
    below: 2,
    side: 1,
    pivot: -1,
    noRails: true
  },
  rollR: {
    label: "Transition c\xF4t\xE9 \u21B1",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 2,
    below: 2,
    side: 1,
    pivot: 1,
    noRails: true
  },
  sideL: {
    label: "Ligne droite c\xF4t\xE9 \u21B0",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 2,
    below: 2,
    side: 2,
    pivot: -1,
    noRails: true
  },
  sideR: {
    label: "Ligne droite c\xF4t\xE9 \u21B1",
    kind: "ribbon",
    size: 1,
    rise: 0,
    clearance: 2,
    below: 2,
    side: 2,
    pivot: 1,
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
  return !!(tile.o || p.side || p.roll);
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
function flagAllowed(type, flag, tile = null, val = 0) {
  const p = PIECES[type];
  if (!p) return false;
  const lineLike = p.kind === "line" || p.kind === "arc";
  if (flag === "v") return true;
  if (flag === "th") return p.kind !== "ring";
  if (p.kind === "ring" || p.kind === "fork") return false;
  if (flag === "o") return lineLike && !p.special && !p.noRails && !(tile && (tile.v || tile.tn || tile.cp || tile.tb || tile.mv));
  if (flag === "nb") return !p.noRails && (lineLike && !p.special || p.kind === "ribbon" && !type.startsWith("tube"));
  if (flag === "tn") return lineLike && !p.special && !(tile && (tile.v || tile.o || tile.cp || tile.tb));
  if (flag === "mv") return (lineLike || p.kind === "area") && !p.special && !(tile && (tile.v || tile.o || tile.cp || tile.tb));
  if (flag === "cp") {
    if (!((lineLike || p.kind === "area") && !p.special && !p.rise) || tile && (tile.mv || tile.tn || tile.tb || tile.o)) return false;
    if (val === 2) return p.kind === "line" && !(tile && tile.v);
    return true;
  }
  if (flag === "tb") return p.kind === "line" && !p.special && !p.rise && !(tile && (tile.v || tile.o || tile.mv || tile.tn || tile.cp));
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
function surfaceAllowed(type, s, v = false, o = 0) {
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
    let ang = Math.atan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;
    out.along = (ang - Math.PI) / (Math.PI / 2);
    if (p.rise) {
      const t = out.along < 0 ? 0 : out.along > 1 ? 1 : out.along;
      const rise = p.rise * LEVEL_H;
      out.h = base + rise * t;
      const k = rise / (Math.PI / 2 * dist);
      const inv = 1 / Math.sqrt(1 + k * k);
      const tx = -Math.sin(ang), tz = Math.cos(ang);
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
  const da = lx - xa, db2 = (lx - xb) * cb;
  const sep = forkSep(t);
  const between = (lx - xa) * (lx - xb) < 0;
  if (between && sep < 2 * 9 + 0.05) {
    out.d = 0;
    out.gx = 1;
    out.gz = 0;
  } else if (Math.abs(da) <= Math.abs(db2)) {
    out.d = da;
    out.gx = 1;
    out.gz = 0;
  } else {
    out.d = db2;
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
  const flip = !!tile.v && !raw;
  const key2 = tile.t + "|" + tile.l + "|" + (flip ? 1 : 0) + "|" + (tile.o | 0);
  const c = cache.get(tile);
  if (c && c.keys && c.keys[key2]) return c.keys[key2];
  let rib = build(tile);
  if (flip && rib) {
    const inner = rib, base = baseY(tile);
    rib = {
      ...inner,
      pos(u, o) {
        inner.pos(u, o);
        o.y = 2 * base - o.y;
        o.ny = -o.ny;
      }
    };
  }
  const entry = c && c.keys ? c : {
    keys: {}
  };
  entry.keys[key2] = rib;
  cache.set(tile, entry);
  return rib;
}
function floorCenter(tile, u, out) {
  const P = PIECES[tile.t], base = baseY(tile), half = P.size * HALF;
  let dx, dy, dz;
  if (P.kind === "arc") {
    const a = arcParams(P), mir = P.mirror < 0 ? -1 : 1, ang = Math.PI + Math.PI / 2 * u;
    out.x = mir * (a.cx + a.R * Math.cos(ang));
    out.z = a.cz + a.R * Math.sin(ang);
    out.y = base + P.rise * LEVEL_H * u;
    dx = -mir * a.R * Math.sin(ang) * (Math.PI / 2);
    dz = a.R * Math.cos(ang) * (Math.PI / 2);
    dy = P.rise * LEVEL_H;
  } else {
    out.x = 0;
    out.z = half - 2 * half * u;
    out.y = base + P.rise * LEVEL_H * profH(P, u);
    dx = 0;
    dz = -2 * half;
    dy = P.rise * LEVEL_H * profD(P, u);
  }
  const l = Math.hypot(dx, dy, dz) || 1;
  out.tx = dx / l;
  out.ty = dy / l;
  out.tz = dz / l;
  return out;
}
function rolledNormal(t, psi, o) {
  let ux = -t.tx * t.ty, uy = 1 - t.ty * t.ty, uz = -t.tz * t.ty;
  const l = Math.hypot(ux, uy, uz) || 1;
  ux /= l;
  uy /= l;
  uz /= l;
  const rx = t.ty * uz - t.tz * uy, ry = t.tz * ux - t.tx * uz, rz = t.tx * uy - t.ty * ux;
  const c = Math.cos(psi), s = Math.sin(psi);
  o.nx = c * ux + s * rx;
  o.ny = c * uy + s * ry;
  o.nz = c * uz + s * rz;
}
function buildRolled(tile) {
  const P = PIECES[tile.t];
  const psi = tile.o === 1 ? Math.PI / 2 : -Math.PI / 2;
  const C3 = {};
  const half = P.size * HALF;
  const len = P.kind === "arc" ? Math.hypot(Math.PI / 2 * arcParams(P).R, P.rise * LEVEL_H) : Math.hypot(2 * half, P.rise * LEVEL_H);
  return {
    minU: 0.5,
    len: len * 1.2,
    pos(u, o) {
      floorCenter(tile, u, C3);
      o.x = C3.x;
      o.y = C3.y;
      o.z = C3.z;
      rolledNormal(C3, psi, o);
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
        const th = total * u, c = Math.cos(th), s = Math.sin(th);
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
          const b = P.bank * Math.sin(Math.PI * u);
          const ca = Math.cos(ang), sa = Math.sin(ang);
          o.x = a.cx + a.R * ca;
          o.z = a.cz + a.R * sa;
          o.y = base + ROAD_HALF * Math.sin(b);
          o.nx = -ca * Math.sin(b);
          o.ny = Math.cos(b);
          o.nz = -sa * Math.sin(b);
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
          o.nx = Math.sin(psi);
          o.ny = Math.cos(psi);
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
          const s = Math.sin(th), c = Math.cos(th);
          o.x = -HALF + m * Rh * s;
          o.y = base + Rh * (1 - c);
          o.z = half - 2 * half * u;
          o.nx = -m * s;
          o.ny = c;
          o.nz = 0;
        },
        len: Math.hypot(2 * half, 2 * Math.PI * Rh)
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
          o.nx = Math.sin(f);
          o.ny = Math.cos(f);
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
            o.z = -half + R90 - R90 * Math.sin(a);
            o.y = base + R90 - R90 * Math.cos(a);
            o.nx = 0;
            o.ny = Math.cos(a);
            o.nz = Math.sin(a);
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
          o.z = cz + R90 * Math.cos(a);
          o.y = base + R90 * Math.sin(a);
          o.nx = 0;
          o.ny = Math.sin(a);
          o.nz = Math.cos(a);
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
  const l = Math.hypot(tx, ty, tz) || 1e-9;
  F.ds = l / (u1 - u0);
  tx /= l;
  ty /= l;
  tz /= l;
  let nx = A.nx, ny = A.ny, nz = A.nz;
  const d = nx * tx + ny * ty + nz * tz;
  nx -= tx * d;
  ny -= ty * d;
  nz -= tz * d;
  const nl = Math.hypot(nx, ny, nz) || 1;
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
  const sampleRibbon = (count2, flag = 1) => {
    const rib = ribbonOf(tile, true);
    const o = {};
    for (let i = 0; i <= count2; i++) {
      rib.pos(i / count2, o);
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
        (p.mirror < 0 ? -1 : 1) * (a.cx + a.R * Math.cos(ang)),
        base + p.rise * LEVEL_H * (i / n),
        a.cz + a.R * Math.sin(ang),
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
var OBST_KINDS = Object.keys(OBST);
var isObstacle = (k) => !!OBST[k];
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
  out.on = 1;
  if (def.type === "spike") {
    out.on = spikeLevel(def, tt);
  } else if (d.k === "pendulum") {
    const w = TAU / def.period;
    const th = def.amp * Math.sin(w * tt), dth = def.amp * w * Math.cos(w * tt);
    out.x = Math.sin(th) * def.arm;
    out.y = def.pivot - Math.cos(th) * def.arm;
    out.vx = Math.cos(th) * def.arm * dth;
    out.vy = Math.sin(th) * def.arm * dth;
    out.a = th;
  } else if (d.k === "hammer") {
    const w = TAU / def.period, th = w * tt;
    out.x = Math.sin(th) * def.arm;
    out.y = def.pivot - Math.cos(th) * def.arm;
    out.vx = Math.cos(th) * def.arm * w;
    out.vy = Math.sin(th) * def.arm * w;
    out.a = th;
  } else if (d.k === "slider") {
    const w = TAU / def.period;
    out.x = def.travel * Math.sin(w * tt);
    out.y = def.hy;
    out.vx = def.travel * w * Math.cos(w * tt);
  } else if (d.k === "sweeper") {
    const w = TAU / def.period;
    out.a = w * tt;
    out.y = def.y;
    out.w = w;
  }
  return out;
}
function toLocalObs(d, wx, wy, wz, out) {
  const c = Math.cos(d.ry || 0), s = Math.sin(d.ry || 0), k = d.s || 1;
  const dx = (wx - d.x) / k, dz = (wz - d.z) / k;
  out.x = dx * c - dz * s;
  out.y = (wy - d.y) / k;
  out.z = dx * s + dz * c;
  return out;
}
function obstacleRadius(d) {
  const def = OBST[d.k], k = d.s || 1;
  if (def.type === "spike") return (Math.hypot(def.hx, def.hz) + 1) * k;
  if (def.type === "ball") return (def.arm + def.r + 1) * k + 2;
  if (def.type === "box") return (def.travel + Math.hypot(def.hx, def.hz) + 1) * k;
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
  ...PACK_IDS
];
var DECO_CATS = {
  signs: {
    label: "Panneaux",
    kinds: [
      "sign_left",
      "sign_right",
      "sign_up",
      "sign_stop",
      "sign_speed",
      "sign_warn",
      "banner"
    ]
  },
  shapes: {
    label: "Formes",
    kinds: [
      "cube",
      "sphere",
      "cylinder",
      "cone",
      "pyramid",
      "arch"
    ]
  },
  build: {
    label: "Murs et toits",
    kinds: [
      "wall",
      "wallLow",
      "roofFlat",
      "roofGable",
      "dome"
    ]
  },
  nature: {
    label: "Nature",
    kinds: [
      "pine",
      "palm",
      "tree",
      "bush",
      "rock",
      "cactus",
      "crystal",
      "mushroom",
      "flower"
    ]
  },
  image: {
    label: "Image",
    kinds: [
      "plaque"
    ]
  },
  cave: {
    label: "Souterrain",
    kinds: [
      "stalagmite",
      "cavePillar",
      "crystalCluster",
      "glowMushroom",
      "minecart",
      "lantern"
    ]
  },
  sky: {
    label: "Nuages",
    kinds: [
      "cloud",
      "balloon",
      "floatIsle",
      "windmill",
      "airship",
      "skyTower"
    ]
  },
  sea: {
    label: "Fonds marins",
    kinds: [
      "coral",
      "seaweed",
      "fishSchool",
      "shell",
      "anchor",
      "jellyfish",
      "treasure"
    ]
  },
  factory: {
    label: "Usine",
    kinds: [
      "gear",
      "pipe",
      "chimney",
      "crate",
      "barrel",
      "crane",
      "warnLight"
    ]
  },
  space: {
    label: "Espace",
    kinds: [
      "satellite",
      "asteroid",
      "antenna",
      "rocket",
      "planetMini"
    ]
  },
  race: {
    label: "Circuit",
    kinds: [
      "trafficCone",
      "tireStack",
      "flagPole",
      "grandstand"
    ]
  },
  lights: {
    label: "Lumi\xE8res",
    kinds: [
      "searchlight",
      "spotlight",
      "lanternPost",
      "lanternHang",
      "streetLamp"
    ]
  },
  vehicles: {
    label: "V\xE9hicules",
    kinds: [
      "plane",
      "biplane",
      "helicopter",
      "bus",
      "truck",
      "locomotive",
      "sedan",
      "ufo",
      "sailboat"
    ]
  },
  xmas: {
    label: "No\xEBl",
    kinds: [
      "xmasTree",
      "snowman",
      "gift",
      "candyCane",
      "xmasStar",
      "wreath",
      "sleigh",
      "reindeer",
      "gingerHouse"
    ]
  },
  halloween: {
    label: "Halloween",
    kinds: [
      "pumpkin",
      "ghost",
      "tombstone",
      "bats",
      "witchHat",
      "cauldron",
      "spookyTree",
      "hauntedHouse",
      "skull"
    ]
  },
  obstacles: {
    label: "Obstacles",
    kinds: [
      "spikes",
      "spikesPop",
      "pendulum",
      "hammer",
      "slider",
      "sweeper",
      "bumper"
    ]
  }
};
var DECO_LABELS = {
  ...Object.fromEntries(PACK.flatMap(([, , items]) => items.map(([id, name]) => [
    id,
    name
  ]))),
  sign_left: "Fl\xE8che gauche",
  sign_right: "Fl\xE8che droite",
  sign_up: "Tout droit",
  sign_stop: "Stop",
  sign_speed: "Limite",
  sign_warn: "Danger",
  banner: "Banderole",
  cube: "Cube",
  sphere: "Sph\xE8re",
  cylinder: "Cylindre",
  cone: "C\xF4ne",
  pyramid: "Pyramide",
  arch: "Arche",
  wall: "Mur",
  wallLow: "Muret",
  roofFlat: "Toit plat",
  roofGable: "Toit en pente",
  dome: "D\xF4me",
  pine: "Sapin",
  palm: "Palmier",
  tree: "Arbre",
  bush: "Buisson",
  rock: "Rocher",
  cactus: "Cactus",
  crystal: "Cristal",
  mushroom: "Champignon",
  flower: "Fleur",
  plaque: "Plaque image",
  shard: "\xC9clat secret",
  spikes: "Piques",
  spikesPop: "Piques escamotables",
  pendulum: "Boule balancier",
  hammer: "Marteau tournant",
  slider: "Mur coulissant",
  sweeper: "Balayeur",
  bumper: "Bumper",
  stalagmite: "Stalagmite",
  cavePillar: "Pilier de grotte",
  crystalCluster: "Amas de cristaux",
  glowMushroom: "Champignon lumineux",
  minecart: "Wagonnet",
  lantern: "Lanterne",
  cloud: "Nuage",
  balloon: "Montgolfi\xE8re",
  floatIsle: "\xCEle flottante",
  windmill: "\xC9olienne",
  airship: "Dirigeable",
  skyTower: "Tour c\xE9leste",
  coral: "Corail",
  seaweed: "Algues",
  fishSchool: "Banc de poissons",
  shell: "Coquillage",
  anchor: "Ancre",
  jellyfish: "M\xE9duse",
  treasure: "Coffre au tr\xE9sor",
  gear: "Engrenage",
  pipe: "Tuyau",
  chimney: "Chemin\xE9e",
  crate: "Caisses",
  barrel: "Barils",
  crane: "Grue",
  warnLight: "Gyrophare",
  satellite: "Satellite",
  asteroid: "Ast\xE9ro\xEFde",
  antenna: "Antenne",
  rocket: "Fus\xE9e",
  planetMini: "Plan\xE8te miniature",
  trafficCone: "Plot",
  tireStack: "Pile de pneus",
  flagPole: "Drapeau \xE0 damier",
  grandstand: "Tribune",
  searchlight: "Projecteur tournant",
  spotlight: "Projecteur",
  lanternPost: "Lanterne sur pied",
  lanternHang: "Lanterne suspendue",
  streetLamp: "Lampadaire",
  plane: "Avion de ligne",
  biplane: "Avion \xE0 h\xE9lice",
  helicopter: "H\xE9licopt\xE8re",
  bus: "Bus",
  truck: "Camion",
  locomotive: "Locomotive",
  sedan: "Voiture",
  ufo: "Soucoupe",
  sailboat: "Voilier",
  xmasTree: "Sapin de No\xEBl",
  snowman: "Bonhomme de neige",
  gift: "Cadeau",
  candyCane: "Sucre d\u2019orge",
  xmasStar: "\xC9toile",
  wreath: "Couronne",
  sleigh: "Tra\xEEneau",
  reindeer: "Renne",
  gingerHouse: "Maison en pain d\u2019\xE9pices",
  pumpkin: "Citrouille",
  ghost: "Fant\xF4me",
  tombstone: "Pierre tombale",
  bats: "Chauves-souris",
  witchHat: "Chapeau de sorci\xE8re",
  cauldron: "Chaudron",
  spookyTree: "Arbre mort",
  hauntedHouse: "Maison hant\xE9e",
  skull: "Cr\xE2ne"
};
for (const [key2, label, items] of PACK) {
  const kinds = items.map((i) => i[0]);
  if (DECO_CATS[key2]) DECO_CATS[key2].kinds.push(...kinds);
  else DECO_CATS[key2] = {
    label,
    kinds
  };
}
var DECO_PACK_ICONS = Object.fromEntries(PACK.flatMap(([, , items]) => items.map(([id, , icon]) => [
  id,
  icon
])));

// js/track.js
var DECORS = {
  desert: {
    label: "D\xE9sert cr\xE9puscule"
  },
  polar: {
    label: "Nuit polaire"
  },
  jungle: {
    label: "Jungle n\xE9on"
  },
  city: {
    label: "Ville futuriste"
  },
  isles: {
    label: "Archipel tropical"
  },
  volcano: {
    label: "Volcan"
  },
  orbit: {
    label: "Station orbitale"
  },
  // 0.9
  caves: {
    label: "Canyon de cristal"
  },
  sky: {
    label: "Ville dans les nuages"
  },
  reef: {
    label: "Fonds marins"
  },
  factory: {
    label: "Usine m\xE9canique"
  }
};
var WATER_DROP = 0.35;
var boatDrop = (along) => WATER_DROP * (1 - Math.max(0, Math.min(1, along || 0)));
var COLOR_KEYS = [
  "road",
  "line",
  "rail"
];
var HEX = /^#[0-9a-f]{6}$/i;
function cleanColors(c) {
  if (!c || typeof c !== "object") return null;
  const out = {};
  for (const k of COLOR_KEYS) if (typeof c[k] === "string" && HEX.test(c[k])) out[k] = c[k].toLowerCase();
  return Object.keys(out).length ? out : null;
}
var EMPTY = Object.freeze([]);
var key = (x, z) => x + 4096 << 13 | z + 4096;
var L = {
  lx: 0,
  lz: 0
};
var S = {};
var W = {
  x: 0,
  z: 0
};
var W2 = {
  x: 0,
  z: 0
};
var MO = {};
var MP = {};
var Track = class _Track {
  constructor(name = "Nouveau circuit", tiles = []) {
    this.name = name;
    this.author = "";
    this.decor = "desert";
    this.tiles = [];
    this.decos = [];
    this.index = /* @__PURE__ */ new Map();
    this.version = 0;
    this.laps = 1;
    this.desc = "";
    this.offroad = 0;
    this.v0 = 0;
    this.g0 = 100;
    this.veh0 = "car";
    this.inversionGraviteDepart = false;
    this.vt = 0;
    this.vh = "";
    this.time = 0;
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
      p2: 0
    };
    tile.v = t.v && flagAllowed(type, "v") ? 1 : 0;
    tile.o = (ori === 1 || ori === 2) && !tile.v && flagAllowed(type, "o", tile, ori) ? ori : 0;
    tile.nb = PIECES[type].noRails || t.nb && flagAllowed(type, "nb") ? 1 : 0;
    tile.tn = t.tn && flagAllowed(type, "tn", tile) ? 1 : 0;
    tile.mv = t.mv && !tile.v && flagAllowed(type, "mv", tile) ? (t.mv | 0) & 3 : 0;
    if (tile.mv) {
      const m = clampMover(tile.mv, t.ms, t.ma);
      tile.ms = m.ms;
      tile.ma = m.ma;
    }
    tile.cp = t.cp && !tile.mv && flagAllowed(type, "cp", tile, t.cp | 0) ? t.cp | 0 : 0;
    tile.tb = t.tb && !tile.mv && !tile.cp && flagAllowed(type, "tb", tile) ? 1 : 0;
    tile.th = THEMES.some((h) => h.id === (t.th | 0)) && flagAllowed(type, "th") ? t.th | 0 : 0;
    tile.col = cleanColors(t.col);
    if (surfaceAllowed(type, s, !!tile.v, tile.o)) {
      tile.s = s;
      const S22 = SURFACES[s];
      if (S22 && S22.def != null) tile.p = Math.max(S22.min, Math.min(S22.max, t.p || S22.def));
    }
    if (PIECES[type].kind === "fork" && t.s2 && (t.s2 === "-" || surfaceAllowed(type, t.s2, !!tile.v, tile.o))) {
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
  // Revêtement (avec paramètre en %). Renvoie true si quelque chose a changé.
  setSurface(tile, s, p = 0) {
    if (!surfaceAllowed(tile.t, s, !!tile.v, tile.o)) return false;
    const S22 = SURFACES[s];
    const np = S22 && S22.def != null ? Math.max(S22.min, Math.min(S22.max, p || S22.def)) : 0;
    if (tile.s === s && (tile.p || 0) === np) return false;
    tile.s = s;
    tile.p = np;
    this.version++;
    return true;
  }
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
        cand.v = 0;
        cand.tn = 0;
        cand.mv = 0;
        cand.ms = 0;
        cand.ma = 0;
        cand.cp = 0;
        cand.tb = 0;
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
        if (cand.mv) {
          cand.cp = 0;
          cand.tb = 0;
        }
      } else if (flag === "cp") {
        cand.cp = tile.cp === val ? 0 : val;
      } else if (flag === "tb") {
        cand.tb = tile.tb ? 0 : 1;
      } else if (tile.v) cand.v = 0;
      else {
        cand.v = 1;
        cand.o = 0;
        cand.mv = 0;
        cand.ms = 0;
        cand.ma = 0;
        cand.tn = 0;
        cand.tb = 0;
        if (cand.cp === 2) cand.cp = 0;
      }
      return this._reshape(tile, cand);
    }
    tile[flag] = tile[flag] ? 0 : 1;
    if (flag === "tn" && tile.tn && tile.v) {
      tile.tn = 0;
      return false;
    }
    this.version++;
    return true;
  }
  // Remplace `tile` par `cand` (normalisée : options devenues impossibles retirées, revêtement incompatible effacé) si la place et les niveaux
  // le permettent ; sinon rien ne change. Même objet : la sélection de l'inspecteur reste valable.
  _reshape(tile, cand) {
    const n = _Track.normalize(cand);
    this.remove(tile);
    if (this.conflicts(n).length || !_Track.inBounds(n)) {
      this._insert(tile);
      return false;
    }
    Object.assign(tile, n);
    this._insert(tile);
    return true;
  }
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
    if (this.conflicts(cand).length || !_Track.inBounds(cand)) {
      this._insert(tile);
      return false;
    }
    tile.ms = m.ms;
    tile.ma = m.ma;
    this._insert(tile);
    return true;
  }
  // Couleurs personnalisées { road, line, rail } (null / {} : couleurs d'origine).
  setColors(tile, col) {
    tile.col = cleanColors(col);
    this.version++;
    return true;
  }
  // 2e revêtement d'une bifurcation (voie déportée).
  setSurface2(tile, s, p = 0) {
    if (PIECES[tile.t].kind !== "fork") return false;
    if (s && s !== "-" && !surfaceAllowed(tile.t, s, !!tile.v, tile.o)) return false;
    const S22 = SURFACES[s];
    const np = S22 && S22.def != null ? Math.max(S22.min, Math.min(S22.max, p || S22.def)) : 0;
    if ((tile.s2 || "") === s && (tile.p2 || 0) === np) return false;
    tile.s2 = s;
    tile.p2 = np;
    this.version++;
    return true;
  }
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
    if (isObstacle(deco.k)) {
      deco.ph = Math.max(0, Math.min(0.95, Math.round((+d.ph || 0) * 20) / 20));
      deco.s = Math.max(0.5, Math.min(2.5, deco.s));
    }
    if (!DECO_ORDER.includes(deco.k)) return null;
    if (typeof d.cc === "string" && HEX.test(d.cc)) deco.cc = d.cc.toLowerCase();
    this.decos.push(deco);
    this.version++;
    return deco;
  }
  // Obstacles physiques (décorations particulières), mis en cache par version.
  get obstacles() {
    if (this._obsV !== this.version) {
      this._obs = this.decos.filter((d) => isObstacle(d.k));
      this._obsV = this.version;
    }
    return this._obs;
  }
  removeDeco(d) {
    const i = this.decos.indexOf(d);
    if (i < 0) return;
    this.decos.splice(i, 1);
    this.version++;
  }
  clear() {
    this.tiles = [];
    this.decos = [];
    this.index.clear();
    this.vt = 0;
    this.vh = "";
    this.laps = 1;
    this.desc = "";
    this.offroad = 0;
    this.v0 = 0;
    this.g0 = 100;
    this.veh0 = "car";
    this.inversionGraviteDepart = false;
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
  }
  // Surface roulable la plus haute sous (x, y + step, z). Le sol est à y = 0.
  // Les pièces mobiles (ascenseur, glissière) sont prises à leur position au temps this.time.
  // broken : pièces de verre déjà brisées dans CETTE course (propre à chaque voiture, voir CarPhysics) : sans collision.
  surfaceAt(x, y, z, out, step = 1.6, broken = null) {
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
    const cell = this.tilesAt(cx, cz);
    for (let i = 0; i < cell.length; i++) {
      const tile = cell[i];
      if (tile.mv || !isFloor(tile) || broken && broken.has(tile)) continue;
      best = this._floorTry(tile, x, z, 0, y, step, best, out);
    }
    const mv = this.movers;
    for (let i = 0; i < mv.length; i++) {
      const tile = mv[i];
      if (!isFloor(tile) || broken && broken.has(tile)) continue;
      this.moverOffset(tile, this.time, MO);
      if (MO.a) {
        this.moverLocal(MO, x, z, W2);
        best = this._floorTry(tile, W2.x, W2.z, MO.y, y, step, best, out, MO.a);
      } else best = this._floorTry(tile, x - MO.x, z - MO.z, MO.y, y, step, best, out);
    }
    return out;
  }
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
      const c = Math.cos(a), sn = Math.sin(a);
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
  }
  // Pièces en mouvement : 1 = ascenseur (monte puis redescend), 2 = glissière (se décale sur son côté droit et revient),
  // 3 = rotation (tourne autour de son centre, tour complet ou va-et-vient). Vitesse et amplitude réglables (voir MOVER).
  // Le mouvement ne dépend que du chrono de la course. out : décalage (x, y, z) et vitesse (vx, vy, vz) ;
  // pour une rotation : a (angle, rad), w (vitesse angulaire, rad/s) et le pivot (cx, cz).
  moverOffset(tile, t, out) {
    const M = MOVER[tile.mv];
    const mp = moverParams(tile, MP);
    const sp = mp.speed / 100, P = M.period / Math.abs(sp), w = Math.PI * 2 / P;
    const k = (1 - Math.cos(w * t)) / 2, dk = Math.sin(w * t) * w / 2;
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
  }
  // Monde -> repère de la pièce mobile « au repos » (annule le décalage et la rotation) : sert à interroger sa géométrie.
  moverLocal(o, x, z, out) {
    x -= o.x;
    z -= o.z;
    if (o.a) {
      const dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.a), s = Math.sin(o.a);
      x = o.cx + c * dx - s * dz;
      z = o.cz + s * dx + c * dz;
    }
    out.x = x;
    out.z = z;
    return out;
  }
  get movers() {
    if (this._mvV !== this.version) {
      this._mv = this.tiles.filter((t) => t.mv);
      this._mvV = this.version;
    }
    return this._mv;
  }
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
  // Paramètres du niveau, bornés.
  setParams({ desc, offroad, v0, g0, veh0, inversionGraviteDepart } = {}) {
    if (inversionGraviteDepart !== void 0) this.inversionGraviteDepart = !!inversionGraviteDepart;
    if (desc !== void 0) this.desc = String(desc || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (offroad !== void 0) this.offroad = offroad ? 1 : 0;
    if (v0 !== void 0) this.v0 = Math.max(0, Math.min(300, Math.round(+v0 || 0)));
    if (g0 !== void 0) this.g0 = Math.max(15, Math.min(250, Math.round(+g0 || 100)));
    if (veh0 !== void 0) this.veh0 = [
      "car",
      "moto",
      "boat",
      "glider"
    ].includes(veh0) ? veh0 : "car";
  }
  // Signature du contenu (pièces, décorations, règles de course), utilisée pour la
  // vérification et comme clé des classements en ligne. Le nom, la description et l'auteur
  // n'en font pas partie : on peut les modifier sans perdre la vérification ni les temps.
  signature() {
    const parts = this.tiles.map((t) => `${t.t}:${t.x}:${t.z}:${t.l}:${t.r}:${t.s}:${t.p}:${t.v}${t.nb}${t.tn}${t.mv ? "m" + t.mv : ""}${tileExtras(t)}`).sort().join("|");
    const d = this.decos.map((o) => `${o.k}:${o.x.toFixed(1)}:${o.z.toFixed(1)}:${o.s}${isObstacle(o.k) ? `:${o.y.toFixed(1)}:${o.ry.toFixed(2)}:${o.ph || 0}` : ""}`).join("|");
    const rules = (this.offroad ? "#O" : "") + (this.v0 ? "#V" + this.v0 : "") + (this.g0 !== 100 ? "#G" + this.g0 : "") + (this.veh0 !== "car" ? "#E" + this.veh0 : "") + (this.inversionGraviteDepart ? "#I" : "");
    return hashString(this.decor + "#" + parts + "#" + d + (this.laps > 1 ? "#L" + this.laps : "") + rules);
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
    t.offroad = this.offroad;
    t.v0 = this.v0;
    t.g0 = this.g0;
    t.veh0 = this.veh0;
    t.inversionGraviteDepart = this.inversionGraviteDepart;
    return t;
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
      ...d.ph || d.cc ? [
        d.ph || 0
      ] : [],
      ...d.cc ? [
        d.cc.slice(1)
      ] : []
    ]);
    const data = {
      v: extras.length || this.decos.some((d) => d.cc) || this.inversionGraviteDepart ? 4 : 3,
      n: this.name,
      a: this.author || "",
      d: this.decor,
      t: arr
    };
    if (extras.length) data.e = extras;
    if (decos.length) data.o = decos;
    if (this.laps > 1) data.lp = this.laps;
    if (this.desc) data.ds = this.desc;
    if (this.offroad) data.or = 1;
    if (this.v0) data.v0 = this.v0;
    if (this.g0 !== 100) data.g0 = this.g0;
    if (this.veh0 !== "car") data.ve = this.veh0;
    if (this.inversionGraviteDepart) data.ig = 1;
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
    tr.decor = DECORS[data.d] ? data.d : "desert";
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
          cc: typeof o[9] === "string" ? "#" + o[9] : ""
        });
      }
    }
    tr.laps = Math.max(1, Math.min(9, data.lp | 0 || 1));
    tr.setParams({
      desc: data.ds,
      offroad: data.or,
      v0: data.v0,
      g0: data.g0,
      veh0: data.ve,
      inversionGraviteDepart: data.ig
    });
    if (data.vt > 0 && data.vh) {
      tr.vt = +data.vt;
      tr.vh = String(data.vh);
    }
    return tr;
  }
};
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
function scriptTrack(name, script, opts = {}) {
  const tr = new Track(name);
  tr.decor = opts.decor || "desert";
  let x = opts.x || 0, z = opts.z || 0, h = opts.h || 0, l = opts.l || 0;
  const path = [];
  let cur = {
    s: "",
    p: 0,
    v: 0,
    nb: 0,
    tn: 0
  };
  const place = (t, px, pz, lv, r, reverse = false, noPath = false, curOver = null) => {
    const tile = {
      t,
      x: px,
      z: pz,
      l: lv,
      r: r & 3,
      ...curOver || cur
    };
    if (cur.s && !surfaceAllowed(t, cur.s, !!cur.v, cur.o | 0)) throw new Error(`${name} : rev\xEAtement ${cur.s} interdit sur ${t}`);
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
    const gm = /^\[([A-Za-z0-9]+)\](-?\d*)(?:\.([a-z])(\d*))?([\^_#~=<>]*)$/.exec(tok);
    const m = gm ? [
      tok,
      "@" + gm[1],
      gm[2],
      gm[3],
      gm[4],
      gm[5]
    ] : /^([A-Za-z]+)(-?\d*)(?:\.([a-z])(\d*))?([\^_#~=<>]*)$/.exec(tok);
    if (!m) throw new Error("Instruction invalide : " + tok);
    let op = m[1];
    const n = m[2] ? parseInt(m[2], 10) : 1;
    cur = {
      s: "",
      p: 0,
      v: m[5].includes("^") ? 1 : 0,
      nb: m[5].includes("_") ? 1 : 0,
      tn: m[5].includes("#") ? 1 : 0,
      mv: m[5].includes("~") ? 1 : m[5].includes("=") ? 2 : 0,
      o: m[5].includes("<") ? 1 : m[5].includes(">") ? 2 : 0
    };
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
  for (const d of opts.decos || []) tr.addDeco(d);
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

// js/builtinObstacles.js
var BUILTIN_OBSTACLES = {
  "corail": [
    {
      "k": "pendulum",
      "x": 372,
      "y": 0.4,
      "z": 108,
      "ry": 0,
      "s": 0.9,
      "c": 0,
      "ph": 0
    }
  ],
  "epave": [
    {
      "k": "pendulum",
      "x": 192,
      "y": 5.2,
      "z": -156,
      "ry": 1.5708,
      "s": 1,
      "c": 0,
      "ph": 0
    },
    {
      "k": "bumper",
      "x": 330,
      "y": 1.6,
      "z": -293,
      "ry": 2.7489,
      "s": 0.8,
      "c": 0,
      "ph": 0
    }
  ],
  "meduses": [
    {
      "k": "sweeper",
      "x": 68,
      "y": 0.4,
      "z": -132,
      "ry": 1.5708,
      "s": 0.95,
      "c": 0,
      "ph": 0
    },
    {
      "k": "pendulum",
      "x": -164,
      "y": 0.4,
      "z": -324,
      "ry": -1.5708,
      "s": 1,
      "c": 0,
      "ph": 0
    }
  ],
  "abysses": [
    {
      "k": "pendulum",
      "x": 276,
      "y": 4.4,
      "z": -260,
      "ry": 3.1416,
      "s": 1.1,
      "c": 0,
      "ph": 0
    }
  ],
  "barriere": [
    {
      "k": "pendulum",
      "x": 108,
      "y": 0.4,
      "z": -156,
      "ry": 1.5708,
      "s": 1,
      "c": 0,
      "ph": 0
    },
    {
      "k": "sweeper",
      "x": 488,
      "y": 0.4,
      "z": -300,
      "ry": 1.5708,
      "s": 0.95,
      "c": 0,
      "ph": 0
    }
  ],
  "chaine": [
    {
      "k": "slider",
      "x": 84,
      "y": 0.4,
      "z": -132,
      "ry": 1.5708,
      "s": 0.8,
      "c": 0,
      "ph": 0
    },
    {
      "k": "spikes",
      "x": 212,
      "y": 0.4,
      "z": -281.5,
      "ry": 1.5708,
      "s": 0.7,
      "c": 0,
      "ph": 0
    }
  ],
  "laminoir": [
    {
      "k": "hammer",
      "x": 180,
      "y": 0.4,
      "z": -176,
      "ry": 3.1416,
      "s": 1,
      "c": 0,
      "ph": 0
    },
    {
      "k": "sweeper",
      "x": 376,
      "y": 0.4,
      "z": -324,
      "ry": 1.5708,
      "s": 0.95,
      "c": 0,
      "ph": 0
    }
  ],
  "engrenages": [
    {
      "k": "spikesPop",
      "x": 216.5,
      "y": 20.900000000000002,
      "z": -252.5,
      "ry": 0.7854,
      "s": 0.75,
      "c": 0,
      "ph": 0
    }
  ],
  "fonderie": [
    {
      "k": "hammer",
      "x": 120,
      "y": 0.4,
      "z": -132,
      "ry": 1.5708,
      "s": 1,
      "c": 0,
      "ph": 0
    },
    {
      "k": "slider",
      "x": 325,
      "y": 2.2,
      "z": -297,
      "ry": 2.7489,
      "s": 0.85,
      "c": 0,
      "ph": 0
    },
    {
      "k": "bumper",
      "x": 499,
      "y": 0.4,
      "z": -260,
      "ry": 0.7854,
      "s": 0.8,
      "c": 0,
      "ph": 0
    }
  ],
  "presse": [
    {
      "k": "sweeper",
      "x": 84,
      "y": 0.4,
      "z": -376,
      "ry": 3.1416,
      "s": 0.95,
      "c": 0,
      "ph": 0
    }
  ],
  "usinefolle": [
    {
      "k": "hammer",
      "x": 80,
      "y": 0.4,
      "z": -132,
      "ry": 1.5708,
      "s": 1,
      "c": 0,
      "ph": 0
    },
    {
      "k": "spikes",
      "x": 365,
      "y": 60.1,
      "z": -228.5,
      "ry": 0.3927,
      "s": 0.7,
      "c": 0,
      "ph": 0
    },
    {
      "k": "sweeper",
      "x": 397,
      "y": 26.200000000000003,
      "z": -393,
      "ry": 2.7489,
      "s": 0.95,
      "c": 0,
      "ph": 0
    },
    {
      "k": "pendulum",
      "x": 524,
      "y": 24.400000000000002,
      "z": -348,
      "ry": 1.5708,
      "s": 1,
      "c": 0,
      "ph": 0
    }
  ],
  "coeur": [
    {
      "k": "pendulum",
      "x": -132,
      "y": 10,
      "z": -376,
      "ry": 3.1416,
      "s": 1,
      "c": 0,
      "ph": 0
    }
  ]
};

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
    goal: {
      id: "under",
      t: 16
    },
    opts: {
      l: 2
    },
    pilot: {
      vCap: 66
    },
    script: "start B2 [tr01l] S4< [tr10l] S B S [crs1] S [cds1] HR S3 B C S HL S3 B2 finish",
    medals: {
      cristal: 15.1,
      or: 15.9,
      argent: 18.3,
      bronze: 21.5
    }
  },
  {
    id: "lagon",
    name: "Lagon Turquoise",
    decor: "isles",
    difficulty: 1,
    goal: {
      id: "rings",
      n: 1
    },
    script: "start B S2 R S L S2 C S2 UU GR2 DD S2 L S.o S R S2 RR S2 S.o C S2 LL S2 B S R L S2 finish",
    medals: {
      cristal: 26.2,
      or: 27.7,
      argent: 31.9,
      bronze: 37.4
    }
  },
  {
    id: "aurore",
    name: "Aurore Naissante",
    decor: "polar",
    difficulty: 1,
    goal: {
      id: "norespawn"
    },
    script: "start S B S2 O S C S RR S I2 S R S B S2 C S LL S2 B S BR S finish",
    medals: {
      cristal: 19.3,
      or: 20.3,
      argent: 23.3,
      bronze: 27.5
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
      cristal: 18,
      or: 18.9,
      argent: 21.8,
      bronze: 25.5
    }
  },
  {
    id: "neons",
    name: "N\xE9ons Express",
    decor: "city",
    difficulty: 2,
    goal: {
      id: "nowall"
    },
    script: "start B S2 R S L S2# C S2 L S R S2 Y2.b S2 R L S2 B S2 BL S2 C S L S R S2 finish",
    medals: {
      cristal: 26.8,
      or: 28.4,
      argent: 32.8,
      bronze: 38.4
    }
  },
  {
    id: "braises",
    name: "Braises",
    decor: "volcano",
    difficulty: 2,
    goal: {
      id: "perfect",
      n: 1
    },
    script: "start S2 B S2 R S L S2 C S2 Y2.b S2 BR S U S2 D S2 C S2 UU G2 DD S2 LL S2 finish",
    medals: {
      cristal: 25.9,
      or: 27.1,
      argent: 31.2,
      bronze: 36.6
    }
  },
  {
    // Chapitre 1 · 2/6 — SPEEDWAY. Ouverture : un booster puis directement un très grand virage relevé. Aucun virage serré : quatre virages
    // relevés 3×3, un wall-ride de 6 cases sur la paroi du canyon (mur droit) à plus de 250 km/h, une descente douce et des boosters
    // pour rester au-dessus de 250 km/h sur plus de la moitié du tour.
    id: "canyon",
    name: "Canyon Corail",
    decor: "desert",
    difficulty: 2,
    profil: "speedway",
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
      cristal: 19.6,
      or: 20.7,
      argent: 23.7,
      bronze: 27.9
    }
  },
  {
    id: "quai",
    name: "Quai d\u2019Amarrage",
    decor: "orbit",
    difficulty: 2,
    goal: {
      id: "rings",
      n: 1
    },
    script: "start S2 B TI TM2 TO S2 R B S UU GR2 DD S2 C S L S2 B S O S2 KL S2 R S2 finish",
    medals: {
      cristal: 22,
      or: 23,
      argent: 26.5,
      bronze: 31.1
    }
  },
  {
    // Chapitre 1 · 3/6 — ACROBATIQUE. Ouverture : chute libre immédiate, depuis l'arrêt (la voiture quitte la plateforme de départ, à 77 m, et
    // se réceptionne sur une descente à 38°). Puis trois sauts de plus en plus grands (bosse, grand tremplin à 38°, dernier saut avec anneau
    // turbo) et un petit saut sur un mur. Réceptions en longues pentes descendantes ; chaque checkpoint est suivi de deux boosters
    // avant la rampe : on peut repartir À L'ARRÊT de n'importe quel checkpoint (la réapparition remet la voiture à l'arrêt) et réussir le saut.
    id: "tremplins",
    name: "Tremplins du Cr\xE9puscule",
    decor: "desert",
    difficulty: 2,
    profil: "acrobatique",
    goal: {
      id: "perfect",
      n: 3
    },
    opts: {
      l: 16
    },
    pilot: {
      vCap: 60
    },
    script: "start G1 V-5 [dn4] [cdo2] S C B2 S [crv1] UU G2 DD [cdo1] S3 CBR1 S [tr01s] S2< [tr10s] S LL S C B2 S2 [crv2] UX G3 DX DX [cdo2] S3 C B2 S UU GR2 DD [cdo1] S2 finish",
    medals: {
      cristal: 27.8,
      or: 29.3,
      argent: 33.7,
      bronze: 39.6
    }
  },
  {
    id: "hyper",
    name: "Hyperboucle",
    decor: "city",
    difficulty: 3,
    goal: {
      id: "norespawn"
    },
    script: "start B S2 R S L S2 B S O S2 C S L S R S2 B S OL S2 BR S2 B S OB S2 C S2 L S R S2 finish",
    medals: {
      cristal: 31.3,
      or: 32.7,
      argent: 37.5,
      bronze: 44.1
    }
  },
  {
    // Chapitre 2 · 2/6 — SPEEDWAY. Ouverture : départ en tube, propulsé par trois boosters, qui débouche directement sur un virage relevé 3×3.
    // Une succession de S relevés (droite / gauche), deux vagues douces, un wall-ride de 5 cases sur le mur gauche (l'autre côté que le canyon
    // du chapitre 1) et un tube à pleine vitesse. Aucun virage serré, plus de 250 km/h pendant près de la moitié du tour.
    id: "canopee",
    name: "Canop\xE9e",
    decor: "jungle",
    difficulty: 3,
    profil: "speedway",
    goal: {
      id: "under",
      t: 25
    },
    opts: {
      l: 5
    },
    pilot: {
      vCap: 70
    },
    script: "start TI TM3.b TO BRR S B BLL S [crs1] S2 [cds1] S [tr01l] S5< [tr10l] C B BRR S [crs1] S [cds1] B BLL S2 TB BRR S B BLL S2 B2 finish",
    medals: {
      cristal: 22.8,
      or: 24,
      argent: 27.6,
      bronze: 32.4
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
    goal: {
      id: "perfect",
      n: 4
    },
    opts: {
      l: 2
    },
    script: "start B2 S.j200 G2 V2 S3 RR C B2 S.j200 G2 V2 S3 LL C B2 S.j200 G2 V2 S3 RR C B2 S.j200 G2 V2 S3 LL S B [cdi2] DX [cdo2] B [crs1] S [cds1] B2 finish",
    medals: {
      cristal: 27.8,
      or: 29.3,
      argent: 33.7,
      bronze: 39.5
    }
  },
  {
    id: "recif",
    name: "R\xE9cif Corallien",
    decor: "isles",
    difficulty: 3,
    goal: {
      id: "vehicle",
      v: "car"
    },
    script: "start B S2 R S2 S.n S3.a R.a S2.a L.a S2.a S.n S2 C S L S BR S B S UU G2 DD S2 C S2 L R S2 finish",
    medals: {
      cristal: 28.6,
      or: 29.5,
      argent: 34,
      bronze: 39.9
    }
  },
  {
    id: "phare",
    name: "Le Phare",
    decor: "isles",
    difficulty: 3,
    goal: {
      id: "rings",
      n: 1
    },
    script: "start B S2 R S L S2 C S2 S.e S2 UU GR7 DD S2 S.e S R S L S3_ B S2 C S2 RR S2 finish",
    medals: {
      cristal: 27,
      or: 28.2,
      argent: 32.5,
      bronze: 38.1
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
    goal: {
      id: "vehicle",
      v: "moto"
    },
    opts: {
      l: 8
    },
    script: "start Y2.o B S [cvd05] [cvdL05] [cvd05] [cvdL05] B S S.o S [tr01s] S2< [tr10s] S R L R L B S2 C S.o S R L R L B S2 B finish",
    medals: {
      cristal: 23.5,
      or: 24.7,
      argent: 28.4,
      bronze: 33.4
    }
  },
  {
    id: "coulee",
    name: "Coul\xE9e Ardente",
    decor: "volcano",
    difficulty: 3,
    pilot: {
      vCap: 40
    },
    goal: {
      id: "rings",
      n: 2
    },
    script: "start B S2 R S L S2 C S S.e S5 UU GR6 DD S2 R S5 UU GR6 DD S.e S2 C S L S2 B S2 finish",
    medals: {
      cristal: 25.9,
      or: 26.9,
      argent: 30.9,
      bronze: 36.3
    }
  },
  {
    id: "navette",
    name: "Navette",
    decor: "orbit",
    difficulty: 3,
    pilot: {
      vCap: 44
    },
    goal: {
      id: "vehicle",
      v: "moto"
    },
    script: "start S2 B S2 R S L S2 S.o S2 C S2 R S2 BR S2 S.o S S.e S3 UU G6 DD S S.e S2 C S L S2 S.o S2 finish",
    medals: {
      cristal: 30,
      or: 31.2,
      argent: 35.9,
      bronze: 42.1
    }
  },
  {
    id: "boulevard",
    name: "Boulevard Sans Fin",
    decor: "city",
    difficulty: 3,
    goal: {
      id: "nowall"
    },
    script: "start B S2 R S L S3_ R_ S_ L_ S2 C S S.n S4.a L.a S2.a R.a S.a S.n S2 B S2 BR S2_ KL S2 R S L S2 finish",
    medals: {
      cristal: 30.9,
      or: 32.2,
      argent: 37,
      bronze: 43.4
    }
  },
  {
    // Chapitre 1 · 4/6 — ROLLERCOASTER (spirale ; placé avant Lac Gelé pour que deux Rollercoasters ne se suivent pas). Ouverture : trois boosters puis directement un grand looping. Hélice montante de quatre
    // grandes courbes inclinées (16 niveaux, 78 m), point de contrôle au sommet, plongeon de 16 niveaux à 38° et slalom de wall-rides
    // gauche / droite en bas. Le plongeon passe à plus de 250 km/h : les murs se prennent avec une grande marge.
    id: "spirale",
    name: "Spirale Prismatique",
    decor: "desert",
    difficulty: 3,
    profil: "rollercoaster",
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 2
    },
    script: "start B3 OB S B CBR4 CBR4 CBR4 CBR4 S C [cdi2] DX DX DX [cdo2] B S [tr01s] S2< [tr10s] S [tr02s] S3> [tr20s] S2 B2 finish",
    medals: {
      cristal: 24.3,
      or: 25.6,
      argent: 29.4,
      bronze: 34.6
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
    goal: {
      id: "turbo",
      n: 2
    },
    opts: {
      l: 5
    },
    script: "start [cvd1] [cvd1] B S3 L I B S R L S B S2 R S R B S2 [tr01s] S2< [tr10s] S3 L S L B I S3 KR S R S2 B finish",
    medals: {
      cristal: 26.6,
      or: 28,
      argent: 32.2,
      bronze: 37.8
    }
  },
  {
    id: "banquise",
    name: "Banquise Rebondissante",
    decor: "polar",
    difficulty: 3,
    goal: {
      id: "perfect",
      n: 2
    },
    script: "start S B S2 S.j G1 S2 C S RR S B S S.j G1 S2 LL S2.i C S2 B S S S S.j G1 S3_ R S2 finish",
    medals: {
      cristal: 21.2,
      or: 22.4,
      argent: 25.7,
      bronze: 30.1
    }
  },
  {
    id: "racines",
    name: "Racines Boueuses",
    decor: "jungle",
    difficulty: 3,
    goal: {
      id: "turbo",
      n: 2
    },
    script: "start B S2 R S2 L S R S.d L S2 C S R L S2 S S R S L S2.w60 B S2 Y2.d S R S L S2 finish",
    medals: {
      cristal: 27.9,
      or: 29.9,
      argent: 34.7,
      bronze: 41.2
    }
  },
  {
    id: "glacier",
    name: "Glacier Magn\xE9tique",
    decor: "polar",
    difficulty: 4,
    goal: {
      id: "norespawn"
    },
    script: "start S B S U S.m D S C S R S3 R S B S2 UU S.m DD.m S C S LL S2.m U S2 D S TI TM2 TO finish",
    medals: {
      cristal: 21.2,
      or: 22.4,
      argent: 25.9,
      bronze: 30.5
    }
  },
  {
    id: "metro",
    name: "M\xE9tro A\xE9rien",
    decor: "city",
    difficulty: 4,
    goal: {
      id: "nowall"
    },
    script: "start B S2 U2 R# S# L# S2# C S2 R S L S2 D2 S R L S2# B S2# L TI TM2 TO UU GC2 DD S2_ R S2 finish",
    medals: {
      cristal: 27.4,
      or: 29,
      argent: 33.3,
      bronze: 39.1
    }
  },
  {
    id: "basalte",
    name: "Champs de Basalte",
    decor: "volcano",
    difficulty: 4,
    goal: {
      id: "norespawn"
    },
    script: "start S2 B S2 R S2 L S2 C S2_ R_ S_ L S2.w150 S2 B S2 UU GR2 DD S2 KL S2.d R S2 B S.j G1 S2 L S2 finish",
    medals: {
      cristal: 28.4,
      or: 30,
      argent: 34.8,
      bronze: 41.2
    }
  },
  {
    id: "temple",
    name: "Temple Perdu",
    decor: "jungle",
    difficulty: 4,
    goal: {
      id: "norespawn"
    },
    script: "start B S2 R S L S2# R# S# L# S2 C S2 B S2 QU WA2 CR S2 R S L S2 D2 S2 C S TB S L S R S2 finish",
    medals: {
      cristal: 28.3,
      or: 29.6,
      argent: 34.1,
      bronze: 40
    }
  },
  {
    id: "tours",
    name: "Tours Jumelles",
    decor: "city",
    difficulty: 4,
    pilot: {
      vCap: 40
    },
    goal: {
      id: "nowall"
    },
    script: "start B S2 R S L S2 B S2 QU WA CR S2 C S R S L S2 D2 S CK S2 R S2 B S2 QU WA CR S2 C S2 R L S2 finish",
    medals: {
      cristal: 30.9,
      or: 32.5,
      argent: 37.4,
      bronze: 43.9
    }
  },
  {
    id: "ceinture",
    name: "Ceinture d\u2019Ast\xE9ro\xEFdes",
    decor: "orbit",
    difficulty: 4,
    goal: {
      id: "rings",
      n: 2
    },
    script: "start S2 B S2 UU GC2 DD S2 R S2 TB S2 L S2 B S2 UU GR2 DD S2 C S CKL S2 BL S2 UU GR2 DD S2 finish",
    medals: {
      cristal: 32.6,
      or: 33.9,
      argent: 39,
      bronze: 45.7
    }
  },
  {
    id: "helice",
    name: "Double H\xE9lice",
    decor: "polar",
    difficulty: 4,
    goal: {
      id: "norespawn"
    },
    script: "start S B S2 O S OL S C S RR S B S CK S2 L S2 C S R S3 CKL S LL B S2 O S finish",
    medals: {
      cristal: 30,
      or: 31.3,
      argent: 36,
      bronze: 42.2
    }
  },
  {
    id: "cheminee",
    name: "Chemin\xE9e du Volcan",
    decor: "volcano",
    difficulty: 4,
    goal: {
      id: "perfect",
      n: 1
    },
    script: "start S2 B S2 R S L TI TM2 TO S C S2 B S2 QU WA2 CR S2 R S2 TB S2 C S L S2 D2 S2 finish",
    medals: {
      cristal: 26.5,
      or: 27.5,
      argent: 31.7,
      bronze: 37.2
    }
  },
  {
    id: "vrille",
    name: "Tourbillon Tropical",
    decor: "isles",
    difficulty: 4,
    goal: {
      id: "turbo",
      n: 1
    },
    script: "start B S2 R S L S2 B S2 OB S C S2 CK S2 L S R S2 B S2 ODL S2 C S CKL S2 R L S2 finish",
    medals: {
      cristal: 43.6,
      or: 45.4,
      argent: 52.3,
      bronze: 61.4
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
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 3
    },
    script: "start B3 QU WA3 CR S [cdi2] DX [cdo2] B BRR S [tr01s] S3< [tr10s] S [tr02s] S3> [tr20s] S OB S C S [tr01s] S2< [tr13s] S2^ [tr31s] S2< [tr10s] S B2 finish",
    medals: {
      cristal: 24.4,
      or: 25.7,
      argent: 29.6,
      bronze: 34.7
    }
  },
  {
    id: "grandanneau",
    name: "Grand Anneau",
    decor: "orbit",
    difficulty: 4,
    laps: 3,
    goal: {
      id: "turbo",
      n: 2
    },
    script: "start S2 B BR S2 C S2 BR S2 TB S2 BR S5 BR S1 finish",
    medals: {
      cristal: 44,
      or: 45.4,
      argent: 52.2,
      bronze: 61.3
    }
  },
  {
    id: "lunaire",
    name: "Sauts Lunaires",
    decor: "isles",
    difficulty: 4,
    pilot: {
      vCap: 58
    },
    goal: {
      id: "perfect",
      n: 2
    },
    script: "start B S2 B S.g30 S2 UU G10 DD S2 C S.g100 S2 R S L S2 RR S B S2 S.e S2 UU G8 DD S S.e S2 C S2 L S R S2 finish",
    medals: {
      cristal: 30.8,
      or: 32.2,
      argent: 37,
      bronze: 43.4
    }
  },
  {
    id: "couronne",
    name: "Couronne Bor\xE9ale",
    decor: "polar",
    difficulty: 5,
    goal: {
      id: "nowall"
    },
    script: "start S B S2 O S2 C S U2 RR S2 B S UU G2 DD S2 C S LL S B S.j G1 S2 R S2.m U S.m D.m S C S BLL S2 B S OL S2 R S2.i S L S2 B S2 finish",
    medals: {
      cristal: 39,
      or: 40.4,
      argent: 46.5,
      bronze: 54.6
    }
  },
  {
    id: "caldeira",
    name: "Caldeira",
    decor: "volcano",
    difficulty: 5,
    laps: 2,
    goal: {
      id: "nowall"
    },
    script: "start S2 B S2 RR S S.n S2.a RR.a S.a S.n S S C S2 RR S2 B S RR finish",
    medals: {
      cristal: 38.8,
      or: 40.7,
      argent: 46.8,
      bronze: 54.9
    }
  },
  {
    id: "blizzard",
    name: "Blizzard",
    decor: "polar",
    difficulty: 5,
    goal: {
      id: "norespawn"
    },
    script: "start S2 B S I3 RR S C S2 L S R S2 B S UU GR2 DD S C S LL S2 B S.j G1 S2 R.i S B S O S2 C S CK S2 B S3 finish",
    medals: {
      cristal: 39.5,
      or: 41.2,
      argent: 47.5,
      bronze: 55.8
    }
  },
  {
    id: "viaduc",
    name: "Viaduc Vertical",
    decor: "city",
    difficulty: 5,
    goal: {
      id: "perfect",
      n: 1
    },
    script: "start B S2 R S L S2 B S2 QU WA2 CR S2 C S2 B S OB S R S L D2 S2 B S OD S2 C S L R S2.g40 S2 S.g100 S2 finish",
    medals: {
      cristal: 32.8,
      or: 34.1,
      argent: 39.3,
      bronze: 46.1
    }
  },
  {
    id: "archipel",
    name: "Grand Archipel",
    decor: "isles",
    difficulty: 5,
    goal: {
      id: "vehicle",
      v: "car"
    },
    script: "start B S2 R S L S2 B S2 OL S2 C S S.n S3.a R.a S2.a S.n S2 RR_ S2.w170_ S C S2 B S2 UU G3 DD S2 R S L S2 B S OB S2 C S2 L R S2 finish",
    medals: {
      cristal: 41.2,
      or: 43,
      argent: 49.5,
      bronze: 58.1
    }
  },
  {
    id: "apesanteur",
    name: "Apesanteur",
    decor: "orbit",
    difficulty: 5,
    goal: {
      id: "rings",
      n: 2
    },
    script: "start S2 B S S.g40 S2 UU GR6 DD S2 S.g100 S2 C S2 TB S2 R S2 CK S2 L S2 S.e S UU GR7 DD S.e S2 C TI TM2.b TO S finish",
    medals: {
      cristal: 35,
      or: 36.2,
      argent: 41.7,
      bronze: 48.9
    }
  },
  {
    id: "eruption",
    name: "\xC9ruption",
    decor: "volcano",
    difficulty: 5,
    goal: {
      id: "norespawn"
    },
    script: "start S2 B S2 R S L S2 QU WA CR S2 C S2 OB S2 BL S2 S.n S2.a L.a S.a S.n S2 C S2 CKL S2 UU GR2 DD S2 Y2.b S2 finish",
    medals: {
      cristal: 46,
      or: 47.7,
      argent: 54.9,
      bronze: 64.5
    }
  },
  {
    id: "zenith",
    name: "Station Z\xE9nith",
    decor: "orbit",
    difficulty: 5,
    laps: 2,
    goal: {
      id: "nowall"
    },
    script: "start S2 B S4 BR S CK S2 C BR TI TM3 TO UU GR2 DD BR S TB S3 BR finish",
    medals: {
      cristal: 39.8,
      or: 41,
      argent: 47.2,
      bronze: 55.4
    }
  },
  // ==== 0.9 : quatre nouveaux thèmes (6 circuits chacun) ============================
  // ---- Fonds marins : courants (tapis roulants), eau et bateau, bulles de verre ----
  {
    id: "courant",
    name: "Courant Chaud",
    decor: "reef",
    difficulty: 2,
    goal: {
      id: "nowall"
    },
    script: "start S2 S2.t137 R S2 C S L S3.t137 RR S2 B S2 LL S C S2.t137 R S2 finish",
    medals: {
      cristal: 18.8,
      or: 19.8,
      argent: 22.7,
      bronze: 26.6
    }
  },
  {
    id: "corail",
    name: "Jardin de Corail",
    decor: "reef",
    difficulty: 3,
    goal: {
      id: "vehicle",
      v: "car"
    },
    script: "start S2 B S2 R S S.n S2.a RR.a S.a S.n S C S2 L S2.t137 O S2 C S R S2.v L S2 finish",
    obst: [
      {
        k: "pendulum",
        at: 0.86,
        side: 0,
        s: 0.9
      }
    ],
    medals: {
      cristal: 25.5,
      or: 26.5,
      argent: 30.5,
      bronze: 35.7
    }
  },
  {
    id: "epave",
    name: "\xC9pave Engloutie",
    decor: "reef",
    difficulty: 3,
    goal: {
      id: "turbo",
      n: 1
    },
    script: "start S2 B S2 RR S2.v C S2 U S2.t137 D S LL S2 B S BR S C S S.j G1 S2 R S L S2.t137 finish",
    obst: [
      {
        k: "pendulum",
        at: 0.36,
        side: 0,
        s: 1
      },
      {
        k: "bumper",
        at: 0.62,
        side: 5.5,
        s: 0.8
      }
    ],
    medals: {
      cristal: 22.3,
      or: 23.3,
      argent: 26.8,
      bronze: 31.4
    }
  },
  {
    id: "meduses",
    name: "M\xE9duses \xC9lectriques",
    decor: "reef",
    difficulty: 4,
    goal: {
      id: "norespawn"
    },
    script: "start S2 B S2 R S C S2.v S2 L S2 S.n S3.a LL.a S2.a S.n S C S2 UU GR2 DD S2 R S2.t137 L S2 finish",
    obst: [
      {
        k: "sweeper",
        at: 0.22,
        side: 0,
        s: 0.95
      },
      {
        k: "pendulum",
        at: 0.82,
        side: 0,
        s: 1
      }
    ],
    medals: {
      cristal: 33,
      or: 34.2,
      argent: 39.4,
      bronze: 46.1
    }
  },
  {
    id: "abysses",
    name: "Abysses",
    decor: "reef",
    difficulty: 4,
    goal: {
      id: "nowall"
    },
    opts: {
      l: 2
    },
    script: "start S2 B S2 D2 S2 RR S C S2.t137 OB S2 L S U2 S2.v B S BR S2 C S2.v S2 R S L S2.t137 S finish",
    obst: [
      {
        k: "pendulum",
        at: 0.55,
        side: 0,
        s: 1.1
      }
    ],
    medals: {
      cristal: 26.8,
      or: 28.1,
      argent: 32.3,
      bronze: 38
    }
  },
  {
    id: "barriere",
    name: "Grande Barri\xE8re",
    decor: "reef",
    difficulty: 5,
    goal: {
      id: "norespawn"
    },
    script: "start S2 B S2.t137 RR S2.v C S2 LL S2.t137 S S.n S2.a R.a S2.a S.n S C S2 OB S2 B S2 BR S2.v S2 L S2.t137 S finish",
    obst: [
      {
        k: "pendulum",
        at: 0.2,
        side: 0,
        s: 1
      },
      {
        k: "sweeper",
        at: 0.7,
        side: 0,
        s: 0.95
      }
    ],
    medals: {
      cristal: 21.1,
      or: 22.5,
      argent: 25.9,
      bronze: 30.4
    }
  },
  // ---- Usine mécanique : obstacles, tapis, moteur coupé, ascenseurs ----
  {
    id: "chaine",
    name: "Cha\xEEne de Montage",
    decor: "factory",
    difficulty: 2,
    goal: {
      id: "nowall"
    },
    script: "start S2 B S2.t137 R S2 C S2 L S2.t137 S2 RR S2 C S2 B S2 LL S2.t137 finish",
    obst: [
      {
        k: "slider",
        at: 0.3,
        side: 0,
        s: 0.8
      },
      {
        k: "spikes",
        at: 0.62,
        side: -5.5,
        s: 0.7
      }
    ],
    medals: {
      cristal: 19.9,
      or: 20.7,
      argent: 23.8,
      bronze: 27.8
    }
  },
  {
    id: "laminoir",
    name: "Laminoir",
    decor: "factory",
    difficulty: 3,
    goal: {
      id: "turbo",
      n: 1
    },
    script: "start S2 B S3.t137 R S C S2.c S2 L S2 B S2 BR S2 C S2.t137 S2 R S L S2 B S finish",
    obst: [
      {
        k: "hammer",
        at: 0.4,
        side: 0,
        s: 1
      },
      {
        k: "sweeper",
        at: 0.78,
        side: 0,
        s: 0.95
      }
    ],
    medals: {
      cristal: 27.5,
      or: 29.3,
      argent: 33.6,
      bronze: 39.5
    }
  },
  {
    id: "engrenages",
    name: "Engrenages",
    decor: "factory",
    difficulty: 3,
    goal: {
      id: "norespawn"
    },
    params: {
      offroad: 1
    },
    script: "start S2 B S2 R S2 S~ S2 C S L S2 B S O S2 C S2 RR S S~ S2 LL S2.t137 finish",
    obst: [
      {
        k: "spikesPop",
        at: 0.55,
        side: 5,
        s: 0.75
      }
    ],
    medals: {
      cristal: 22.9,
      or: 24.1,
      argent: 27.6,
      bronze: 32.5
    }
  },
  {
    id: "fonderie",
    name: "Fonderie",
    decor: "factory",
    difficulty: 4,
    goal: {
      id: "nowall"
    },
    script: "start S2 B S2 R S2.x S C S2 UU S2.t137 DD S2 L S2.c S B S2 BR S2 C S2 R S2 L S2 B S2 finish",
    obst: [
      {
        k: "hammer",
        at: 0.25,
        side: 0,
        s: 1
      },
      {
        k: "slider",
        at: 0.6,
        side: 0,
        s: 0.85
      },
      {
        k: "bumper",
        at: 0.85,
        side: -5.5,
        s: 0.8
      }
    ],
    medals: {
      cristal: 29.6,
      or: 31.5,
      argent: 36.3,
      bronze: 42.6
    }
  },
  {
    id: "presse",
    name: "Presse Hydraulique",
    decor: "factory",
    difficulty: 4,
    goal: {
      id: "turbo",
      n: 2
    },
    params: {
      offroad: 1
    },
    script: "start S2 B S2 S~ S S= S2 C S2 R S2 L S2.t137 S RR S2 S~ S2 C S2 LL S2 B S S= S2 finish",
    obst: [
      {
        k: "sweeper",
        at: 0.48,
        side: 0,
        s: 0.95
      }
    ],
    medals: {
      cristal: 29.8,
      or: 31.7,
      argent: 36.5,
      bronze: 42.8
    }
  },
  {
    id: "usinefolle",
    name: "Usine Folle",
    decor: "factory",
    difficulty: 5,
    goal: {
      id: "norespawn"
    },
    script: "start S2 B S2.t137 R S2 C S2.c S QU WA CR S2 B S2 L S2 OB S2 C S2.t137 BR S2 R S2.x L S2 B S2 finish",
    obst: [
      {
        k: "hammer",
        at: 0.18,
        side: 0,
        s: 1
      },
      {
        k: "spikes",
        at: 0.55,
        side: 5.5,
        s: 0.7
      },
      {
        k: "sweeper",
        at: 0.72,
        side: 0,
        s: 0.95
      },
      {
        k: "pendulum",
        at: 0.9,
        side: 0,
        s: 1
      }
    ],
    medals: {
      cristal: 38.8,
      or: 40.4,
      argent: 46.4,
      bronze: 54.5
    }
  },
  // ---- Ville dans les nuages : vent, deltaplane, gravité faible, sauts ----
  {
    id: "envol",
    name: "Premier Envol",
    decor: "sky",
    difficulty: 3,
    goal: {
      id: "perfect",
      n: 1
    },
    script: "start S2 B S2 GU2 S GD2 S R S2 C S2.w150 S2 L S2 B S UU G2 DD S2 R S2 finish",
    medals: {
      cristal: 20.4,
      or: 21.5,
      argent: 24.7,
      bronze: 29
    }
  },
  {
    id: "suspendues",
    name: "\xCEles Suspendues",
    decor: "sky",
    difficulty: 3,
    goal: {
      id: "rings",
      n: 2
    },
    script: "start S3 S.e S UU GR5 DD S3 S.e S C S2 R S2 L S2 B S.j G1 S2 C S2 B S UU GR2 DD S2 finish",
    medals: {
      cristal: 27.4,
      or: 28.4,
      argent: 32.7,
      bronze: 38.4
    }
  },
  {
    id: "rafales",
    name: "Rafales",
    decor: "sky",
    difficulty: 4,
    goal: {
      id: "nowall"
    },
    script: "start S2 B S2.w170 R S2.w40 C S2 L S2.w160_ S2 RR S2 B S2 BL S C S2.w30 S R S2 L S2 finish",
    medals: {
      cristal: 23,
      or: 24.2,
      argent: 27.8,
      bronze: 32.6
    }
  },
  {
    id: "montgolfieres",
    name: "Montgolfi\xE8res",
    decor: "sky",
    difficulty: 4,
    goal: {
      id: "vehicle",
      v: "car"
    },
    script: "start S2 B S S.g40 S2 UU GR6 DD S2 S.g100 S2 C S2 R S2 S.e S UU GR6 DD S3 S.e S C S2 L S2 B S2 finish",
    medals: {
      cristal: 31.5,
      or: 32.7,
      argent: 37.6,
      bronze: 44.1
    }
  },
  {
    id: "pontvents",
    name: "Pont des Vents",
    decor: "sky",
    difficulty: 5,
    goal: {
      id: "norespawn"
    },
    script: "start S2 B S2_ R_ S2.w150_ C S2_ L_ S2_ B S UU GR2 DD S2 BR S2 C S2.w60_ S2_ R S2 B S2 finish",
    medals: {
      cristal: 22.6,
      or: 23.6,
      argent: 27.2,
      bronze: 31.9
    }
  },
  {
    id: "cite",
    name: "Cit\xE9 C\xE9leste",
    decor: "sky",
    difficulty: 5,
    goal: {
      id: "rings",
      n: 3
    },
    script: "start S3 S.e S UU GR5 DD S3 S.e S C S2 B S OB S2 R S2.w160 L S2 C S2 S.g50 S2 UU GR4 DD S.g100 S2 B S BR S2 finish",
    medals: {
      cristal: 36.1,
      or: 37.4,
      argent: 43.1,
      bronze: 50.5
    }
  },
  // ---- Canyon de cristal : gravité inversée, plafonds, verre, volant inversé ----
  {
    id: "galerie",
    name: "Galerie de Cristal",
    decor: "caves",
    difficulty: 3,
    goal: {
      id: "nowall"
    },
    script: "start S2 B S2 R S2 C S2.d L S2 B S2.y S3 R S2 C S2 L S2.i S2 finish",
    medals: {
      cristal: 22.7,
      or: 23.8,
      argent: 27.3,
      bronze: 32.1
    }
  },
  {
    id: "plafond",
    name: "Plafond Renvers\xE9",
    decor: "caves",
    difficulty: 4,
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 2
    },
    script: "start S2 B S2 TW.f S2^ C^ S2^ R^ S2^ TWB.f S2 C S2 L S2 B S2 finish",
    medals: {
      cristal: 17.2,
      or: 17.9,
      argent: 20.3,
      bronze: 23.7
    }
  },
  {
    id: "cristalfele",
    name: "Cristal F\xEAl\xE9",
    decor: "caves",
    difficulty: 4,
    goal: {
      id: "nowall"
    },
    script: "start S2 B S2.v R S2.v C S2 L S2 B S2.v RR S2 C S2.y S2 LL S2.v S2 B S finish",
    medals: {
      cristal: 24.8,
      or: 25.9,
      argent: 29.8,
      bronze: 35
    }
  },
  {
    id: "miroir",
    name: "Miroir",
    decor: "caves",
    difficulty: 4,
    goal: {
      id: "turbo",
      n: 1
    },
    opts: {
      l: 1
    },
    script: "start S2 B S2 S.f V3 S2^ C^ S2^ L^ S2^ S.f^ V-3 S3 C S2 R S2 B S2 finish",
    medals: {
      cristal: 17.1,
      or: 17.9,
      argent: 20.5,
      bronze: 24.1
    }
  },
  {
    id: "vrilles",
    name: "Vrilles Souterraines",
    decor: "caves",
    difficulty: 5,
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 3
    },
    script: "start S2 B S2 TW.f S2^ D^ S2^ C^ S2^ U^ S^ TWB.f S2 C S2 R S2 TW.f S2^ R^ S2^ TWB.f S2 B S2 finish",
    medals: {
      cristal: 23.2,
      or: 24.2,
      argent: 27.4,
      bronze: 31.8
    }
  },
  {
    id: "coeur",
    name: "C\u0153ur de la Montagne",
    decor: "caves",
    difficulty: 5,
    goal: {
      id: "norespawn"
    },
    opts: {
      l: 2
    },
    script: "start S2 B S2 TW.f S2^ C^ S2^ L^ S2^ TWB.f S2.v R S2 C S2.y S2 L S2 B S2 S.f V3 S2^ R^ S2^ S.f^ V-3 S3 C S2 B S2 finish",
    obst: [
      {
        k: "pendulum",
        at: 0.47,
        side: 0,
        s: 1
      }
    ],
    medals: {
      cristal: 37.3,
      or: 41.1,
      argent: 47.2,
      bronze: 55.4
    }
  }
];
var THEME_ORDER = [
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
  "caves"
];
BUILTIN_TRACKS.sort((a, b) => THEME_ORDER.indexOf(a.decor) - THEME_ORDER.indexOf(b.decor) || a.difficulty - b.difficulty);
function buildBuiltin(def) {
  const t = scriptTrack(def.name, def.script, {
    ...def.opts || {},
    decor: def.decor || "desert"
  });
  t.author = "Copytrack";
  if (def.params) t.setParams(def.params);
  if (def.laps > 1) {
    t.laps = def.laps;
    const one = t.path.slice();
    for (let k = 1; k < def.laps; k++) t.path.push(...one.slice(1));
  }
  if (def.pilot && t.path) t.path.pilot = def.pilot;
  if (BUILTIN_OBSTACLES[def.id]) {
    for (const o of BUILTIN_OBSTACLES[def.id]) t.addDeco(o);
  } else if (def.obst && t.path && t.path.length > 10) {
    const P = t.path, n = def.laps > 1 ? Math.floor(P.length / def.laps) : P.length;
    for (const o of def.obst) {
      const i = Math.min(n - 2, Math.floor(n * o.at));
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
      const q = (v, st) => Math.round(v / st) * st;
      const ry = q(Math.atan2(dx / l, dz / l), Math.PI / 8);
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

// js/physics.js
var CAR = {
  accel: 11,
  accelCurve: 1.5,
  maxSpeed: SURF_PHYS.maxSpeed,
  boostSpeed: SURF_PHYS.boostSpeed,
  boostAccel: 30,
  boostTime: 1.6,
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
  latGrip: 56,
  frontShare: 0.48,
  steerMax: 0.6,
  steerAlat: 52,
  driftRear: 0.65,
  driftSteer: 1.3,
  driftMin: 12,
  driftBrake: 0.75,
  yawDamp: 0.6,
  steerIn: 7,
  steerOut: 12,
  gravity: SURF_PHYS.gravity,
  snap: 0.7,
  step: 1.6,
  magnetRange: 4,
  magnetAcc: 80,
  launch: 2,
  stickAngle: 0.21,
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
  latGrip: 60,
  frontShare: 0.5,
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
  latGrip: 44,
  frontShare: 0.46,
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
var STICK_COS = Math.cos(CAR.stickAngle);
var SIDE_AERO = 0.03;
var SIDE_HOLD = 25 / (30 * 30);
var SIDE_MIN_SPEED = 30;
var SIDE_GRACE = 0.3;
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
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
var W1 = {
  x: 0,
  z: 0
};
var BELT = {
  x: 0,
  z: 0
};
var OB = {};
var OL = {};
var MOV = {};
var MQ1 = {};
var MQ2 = {};
var FL = {};
var CC = {
  x: 0,
  z: 0
};
var TMP = {
  x: 0,
  z: 0
};
var HIT = {
  dx: 0,
  dz: 0,
  nx: 0,
  nz: 0
};
var BK = {
  vx: 0,
  vy: 0,
  w: 0
};
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
var CarPhysics = class {
  constructor(track) {
    this.track = track;
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
      moto: false,
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
    this.broken = /* @__PURE__ */ new Set();
    this.setBounds();
    this.place(0, 0.4, 0, 0);
  }
  get g() {
    return CAR.gravity * this.gravMul;
  }
  // Réglages du véhicule actuel (voiture ou moto).
  get k() {
    return SPECS[this.vehicle] || CAR;
  }
  // Compatibilité : « moto » est un des véhicules possibles.
  get moto() {
    return this.vehicle === "moto";
  }
  set moto(v) {
    this.vehicle = v ? "moto" : "car";
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
    this.graceT = 1.5;
    this.beltX = 0;
    this.beltZ = 0;
    this.beltS = 0;
    this.plateLock = "";
    this.sinkT = 0;
    this.hazardGrace = 0.8;
    const s = this.gSign > 0 ? this.track.surfaceAt(x, y + 0.5, z, this.surf, 3, this.broken) : this.track.ceilingSurfaceAt(x, y - 0.5, z, this.surf, 3, this.broken);
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
    this.fwd.x = -Math.sin(this.yaw);
    this.fwd.y = 0;
    this.fwd.z = -Math.cos(this.yaw);
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
    if (mod === "boost") {
      if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
      this.boost = CAR.boostTime;
      this.boostF = this.surfP;
    } else if (mod === "gravity") {
      const gm = this.surfP;
      if (Math.abs(gm - this.gravMul) > 0.01) {
        this.gravMul = gm;
        this.ev.gravity = true;
      }
    } else if (mod === "flip" && this.plateLock !== "flip") {
      this.plateLock = "flip";
      this.lockTile = s.tile;
      this.gSign = -this.gSign;
      this._flipNow = true;
      this.ev.flip = true;
      return;
    }
    if (mod === "flip") return;
    if (PLATES[mod]) {
      if (this.plateLock !== mod) {
        this.plateLock = mod;
        this.vehicle = this.vehicle === PLATES[mod] ? "car" : PLATES[mod];
        this.ev.moto = true;
      }
    } else this.plateLock = "";
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
    sampleLocal(tile, lx, lz, S1);
    const sp = beltSpeed(this._pct(tile));
    rotVec(tile.r, S1.gz, -S1.gx, W1);
    out.x = W1.x * sp;
    out.z = W1.z * sp;
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
    this.ev.glass = true;
    this.ev.glassTile = tile;
    return true;
  }
  // ---------------------------------------------------------------- Pneus
  // Angle des roues avant selon la vitesse : à haute vitesse, un petit angle suffit.
  _steerAngle(speed, drift) {
    const K = this.k;
    const v2 = Math.max(1, speed * speed);
    const slipSat = K.latGrip * K.frontShare / K.corner;
    let max = Math.min(K.steerMax, Math.atan((K.a + K.b) * K.steerAlat / v2) + slipSat);
    max *= 1 + (K.driftSteer - 1) * drift;
    return this.steer * max;
  }
  // Modèle bicyclette, repère voiture (x avant, y droite, w lacet > 0 = vers la droite).
  // ax : accélération longitudinale (moteur, freins) ; grip : multiplicateur d'adhérence.
  _tires(vx, vy, w, ax, grip, dt) {
    const drift = this.driftT, K = this.k;
    const delta = this._steerAngle(Math.abs(vx), drift);
    this.steerAngle = delta;
    const L4 = K.a + K.b;
    const maxF = K.latGrip * grip * K.frontShare;
    const maxR = K.latGrip * grip * (1 - K.frontShare) * (1 - (1 - K.driftRear) * drift) * (this.rearK ?? 1);
    if (Math.abs(vx) < 1.5) {
      vx += ax * dt;
      const lateralDamp = clamp(0.35 + grip * 0.3, 0.35, 0.85);
      BK.vx = vx;
      BK.vy = vy * lateralDamp;
      BK.w = vx * Math.tan(delta) / L4 * clamp(grip, 0.2, 1);
      return BK;
    }
    const den = Math.max(Math.abs(vx), 6);
    const sgn = vx >= 0 ? 1 : -1;
    const af = Math.atan2(vy + K.a * w, den) - delta * sgn;
    const ar = Math.atan2(vy - K.b * w, den);
    const Ff = clamp(-K.corner * af, -maxF, maxF);
    const Fr = clamp(-K.corner * ar, -maxR, maxR);
    const cd = Math.cos(delta), sd = Math.sin(delta);
    vx += (ax - Ff * sd) * dt;
    vy += (Ff * cd + Fr) * dt;
    w += ((K.a * Ff * cd - K.b * Fr) / K.yawK - w * K.yawDamp) * dt;
    BK.vx = vx;
    BK.vy = vy;
    BK.w = w;
    return BK;
  }
  step(inp) {
    const dt = DT, p = this.pos, v = this.vel, ev = this.ev;
    this.track.time = (this.clock || 0) * dt;
    if (this.graceT > 0) this.graceT -= dt;
    ev.wall = 0;
    ev.land = 0;
    ev.boostHit = false;
    ev.bounce = false;
    if (this.hazardGrace > 0) this.hazardGrace = Math.max(0, this.hazardGrace - dt);
    ev.loopIn = false;
    ev.loopOut = false;
    ev.loopFall = false;
    ev.moto = false;
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
    const K = this.k;
    const sr = (back ? K.steerOut : K.steerIn) * dt;
    this.steer += clamp(target - this.steer, -sr, sr);
    if (this.boost > 0) this.boost = Math.max(0, this.boost - dt);
    if (this.bounceCD > 0) this.bounceCD -= dt;
    if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - dt);
    const turning = Math.abs(this.steer) > 0.5;
    if (inp.brake && !inp.throttle && turning && this.fwdSpeed > K.driftMin && this.grounded) {
      this.driftT = Math.min(1, this.driftT + dt * 5);
    } else if (turning && this.driftT > 0 && this.fwdSpeed > K.driftMin * 0.7) {
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
    if (this.rib) {
      this._ribStep(inp);
      return;
    }
    let fx = -Math.sin(this.yaw), fy = 0, fz = -Math.cos(this.yaw);
    if (this.grounded) {
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
        const o = this.track.moverOffset(this.surfTile, this.track.time, MOV);
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
      const C3 = surfaceCoeffs(ground ? "" : mod, f);
      let grip = C3.grip, traction = C3.traction, vmaxK = C3.vmaxK, extraDrag = C3.extraDrag, rearK = C3.rearK;
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
        rotVec(this.surfTile.r, 1, 0, TMP);
        vf += (TMP.x * fx + TMP.z * fz) * a * dt;
        vr += (TMP.x * rx + TMP.z * rz) * a * dt;
      }
      const wet = mod === "water" || mod === "boat";
      if (this.vehicle === "boat" && !wet) {
        grip = Math.min(grip, 0.8);
        traction *= 0.4;
        vmaxK = Math.min(vmaxK, 0.3);
        extraDrag += 7;
      }
      if (!wet) this.sinkT = 0;
      const ax = (this._longitudinal(vf, inp, K.maxSpeed * vmaxK, traction, extraDrag, dt) - vf) / dt;
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
      if (this.ev.sink) return;
      this.slip = Math.abs(vr);
      this.fwdSpeed = vf;
      this.airTime = 0;
      this.pitch = Math.asin(clamp(fy, -1, 1));
      this.pitchRate = 0;
    } else {
      if (this.vehicle === "glider") {
        this._glide(inp, dt);
        fx = -Math.sin(this.yaw);
        fz = -Math.cos(this.yaw);
      } else v.y -= this.g * this.gSign * dt;
      this.omega *= Math.exp(-1.5 * dt);
      if (this.vehicle !== "glider") this.omega = clamp(this.omega + this.steer * CAR.airSteer * dt, -CAR.airSteerMax, CAR.airSteerMax);
      const us = this._upSign();
      this.yaw -= this.omega * us * dt;
      this.yawRate = -this.omega * us;
      this.steerAngle = this._steerAngle(Math.hypot(v.x, v.z), this.driftT);
      const k = 1 - 6e-4 * this.speed * dt;
      v.x *= k;
      v.y *= k;
      v.z *= k;
      this.slip = 0;
      this.fwdSpeed = v.x * fx + v.z * fz;
      this.airTime += dt;
      const pin = this.vehicle === "glider" ? 0 : (inp.brake ? 1 : 0) - (inp.throttle ? 1 : 0);
      this.pitchRate += pin * this.gSign * K.airPitchAcc * (pin > 0 ? CAR.airPitchUpK : 1) * dt;
      this.pitchRate *= Math.exp(-CAR.airPitchDamp * dt);
      if (this.vehicle === "glider") this.pitch = this.glidePitch;
      else this.pitch = clamp(this.pitch + this.pitchRate * dt, -1.4, 1.4);
    }
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    this._rings();
    if (this.ev.sink) return;
    if (this._tryEnterRibbon()) return;
    if (!this.grounded && this._tryLandRibbon()) return;
    this._walls();
    this._tunnelRoof();
    this._slabs();
    this._obstacles();
    if (this.ev.sink) return;
    this._bounds();
    const gs = this.gSign;
    const s = gs > 0 ? this.track.surfaceAt(p.x, p.y, p.z, this.surf, CAR.step, this.broken) : this.track.ceilingSurfaceAt(p.x, p.y, p.z, this.surf, CAR.step, this.broken);
    const gap = gs * (p.y - s.h);
    const vn = v.x * s.nx + v.y * s.ny + v.z * s.nz;
    const magnet = s.mod === "magnet";
    const launch = magnet ? Infinity : CAR.launch;
    const snap = magnet ? CAR.step : CAR.snap;
    if (!this.grounded) {
      const m = gs > 0 ? this.track.surfaceAt(p.x, p.y, p.z, this.surfM, CAR.magnetRange, this.broken) : this.track.ceilingSurfaceAt(p.x, p.y, p.z, this.surfM, CAR.magnetRange, this.broken);
      const mg = gs * (p.y - m.h);
      if (m.mod === "magnet" && mg > 0.02 && mg < CAR.magnetRange) {
        const a = CAR.magnetAcc * (1 - mg / CAR.magnetRange) * dt;
        v.x -= m.nx * a;
        v.y -= m.ny * a;
        v.z -= m.nz * a;
      }
    }
    let stick = vn < launch;
    if (!stick && this.grounded && gap < snap && gap > -CAR.step) stick = this.n.x * s.nx + this.n.y * s.ny + this.n.z * s.nz > STICK_COS;
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
      this.pitch = Math.asin(clamp(this.fwd.y, -1, 1));
      this.airTime = 0;
    }
    if (this._springNow) {
      this._springNow = false;
      const t = this.surfTile;
      if (t) {
        sampleLocal(t, this.surfLx, this.surfLz, S1);
        rotVec(t.r, S1.gx, S1.gz, W1);
        const k = (this._pct(t) - 100) / 100 * CAR.spring;
        const n = this.n;
        v.x += W1.x * k + n.x * CAR.springHop;
        v.y += n.y * CAR.springHop;
        v.z += W1.z * k + n.z * CAR.springHop;
        this.grounded = false;
        this.pitch = Math.asin(clamp(this.fwd.y, -1, 1));
        this.airTime = 0;
      }
    }
    if (gs < 0 && !this.grounded && p.y > this.skyY) this.lost = true;
    this._updateFwd();
  }
  // Nouvelle vitesse longitudinale : moteur, freins, résistances.
  // load : part du poids qui appuie les roues sur la route (1 au sol, 0 sur un mur vertical).
  _longitudinal(vf, inp, vmax, traction, extraDrag, dt, load = 1) {
    const K = this.k;
    let a = 0;
    if (inp.throttle) {
      if (vf < -0.5) a += K.brake * traction;
      else {
        const x = Math.max(0, vf / vmax);
        a += K.accel * traction * (1 - Math.pow(x, CAR.accelCurve));
      }
    }
    if (inp.brake) {
      if (vf > 0.5) a -= K.brake * traction * (1 - CAR.driftBrake * this.driftT);
      else if (!inp.throttle) {
        const x = Math.max(0, -vf) / CAR.reverseMax;
        a -= CAR.reverseAccel * traction * (1 - x * x);
      }
    }
    if (this.boost > 0) {
      const f = this.boostF;
      const vb = K.maxSpeed + (CAR.boostSpeed - K.maxSpeed) * f;
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
  }
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
      if (!tile.tn || tile.v || this.broken.has(tile) || !isFloor(tile)) continue;
      toLocal(tile, p.x, p.z, L1);
      sampleLocal(tile, L1.lx, L1.lz, S1);
      if (!S1.inFootprint || Math.abs(S1.d) > ROAD_HALF + RAIL_W) continue;
      const roof = S1.h + TUNNEL_TOP;
      if (p.y + CAR.height > roof && q.y + CAR.height <= roof + 0.05) {
        p.y = roof - CAR.height;
        if (v.y > 0) v.y = -v.y * 0.2;
      }
    }
  }
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
      if (tile.mv || tile.v || this.broken.has(tile) || !isFloor(tile) || PIECES[tile.t].kind === "loop") continue;
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
      const dx = p.x - q.x, dz = p.z - q.z, dl = Math.hypot(dx, dz);
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
  }
  _walls() {
    const p = this.pos, v = this.vel;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const pfx = -Math.sin(this.prevYaw), pfz = -Math.cos(this.prevYaw);
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
  }
  // ---------------------------------------------------------------- Obstacles
  // Le temps des obstacles est le chrono de la course (this.clock = pas de course, fixé
  // par l'appelant avant chaque pas) : même mouvement en replay et après un retour (R).
  _obstacles() {
    const obs = this.track.obstacles;
    if (!obs.length || this.hazardGrace > 0) return;
    const t = (this.clock || 0) * DT;
    const p = this.pos, v = this.vel, n0 = this.n;
    let cx = p.x + n0.x * 0.8, cy = p.y + n0.y * 0.8, cz = p.z + n0.z * 0.8;
    if (this._obstacleGridSource !== obs) {
      const grid2 = /* @__PURE__ */ new Map(), cell2 = 20;
      for (const d of obs) {
        if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.z)) continue;
        const key2 = `${Math.floor(d.x / cell2)},${Math.floor(d.z / cell2)}`;
        let bucket = grid2.get(key2);
        if (!bucket) grid2.set(key2, bucket = []);
        bucket.push(d);
      }
      this._obstacleGridSource = obs;
      this._obstacleGrid = grid2;
    }
    const candidates = [], grid = this._obstacleGrid, cell = 20;
    const gx = Math.floor(cx / cell), gz = Math.floor(cz / cell);
    for (let ix = gx - 3; ix <= gx + 3; ix++) {
      for (let iz = gz - 3; iz <= gz + 3; iz++) {
        const bucket = grid.get(`${ix},${iz}`);
        if (bucket) for (const d of bucket) candidates.push(d);
      }
    }
    for (const d of candidates) {
      cx = p.x + n0.x * 0.8;
      cy = p.y + n0.y * 0.8;
      cz = p.z + n0.z * 0.8;
      if (!d || !OBST[d.k] || !Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isFinite(d.z) || !Number.isFinite(d.s || 1) || !Number.isFinite(d.ry || 0)) continue;
      if (Math.abs(cx - d.x) > 40 || Math.abs(cz - d.z) > 40) continue;
      const rr = obstacleRadius(d) + 3;
      if ((cx - d.x) ** 2 + (cz - d.z) ** 2 > rr * rr) continue;
      const def = OBST[d.k], k = d.s || 1, rc = 1.4 / k;
      if (!(k > 0) || !Number.isFinite(rc)) continue;
      obstacleLocal(d, t, OB);
      toLocalObs(d, cx, cy, cz, OL);
      if (![
        OB.x,
        OB.y,
        OB.z,
        OB.vx,
        OB.vy,
        OB.vz,
        OB.on,
        OL.x,
        OL.y,
        OL.z
      ].every(Number.isFinite)) continue;
      let nx = 0, ny = 0, nz = 0, pen = 0, ovx = 0, ovy = 0, ovz = 0;
      if (def.type === "spike") {
        if (OB.on < 0.4 || this.graceT > 0) continue;
        if (Math.abs(OL.x) < def.hx + rc * 0.6 && Math.abs(OL.z) < def.hz + rc * 0.6 && OL.y < def.hy * OB.on + rc && OL.y > -1.5) {
          this.ev.spike = true;
          this.ev.sink = true;
          return;
        }
        continue;
      } else if (def.type === "ball") {
        const dx = OL.x - OB.x, dy = OL.y - OB.y, dz = OL.z;
        const dd = Math.hypot(dx, dy, dz);
        if (dd >= def.r + rc) continue;
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
        const dd = Math.hypot(dx, dy, dz);
        if (dd >= rc) continue;
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
        const ca = Math.cos(OB.a), sa = Math.sin(OB.a);
        const s = clamp(OL.x * ca + OL.z * sa, -def.len, def.len);
        const dx = OL.x - ca * s, dy = OL.y - def.y, dz = OL.z - sa * s;
        const dd = Math.hypot(dx, dy, dz);
        if (dd >= def.r + rc) continue;
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
        if (OL.y > def.h + rc) continue;
        const dd = Math.hypot(OL.x, OL.z);
        if (dd >= def.r + rc) continue;
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
      const c = Math.cos(d.ry || 0), sn = Math.sin(d.ry || 0);
      const wx = nx * c + nz * sn, wz = -nx * sn + nz * c, wy = ny;
      const vwx = (ovx * c + ovz * sn) * k, vwz = (-ovx * sn + ovz * c) * k, vwy = ovy * k;
      if (![
        wx,
        wy,
        wz,
        vwx,
        vwy,
        vwz
      ].every(Number.isFinite)) continue;
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
    }
  }
  _probe(x, z, px, pz, y) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const tiles = this.track.tilesAt(cx, cz);
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (tile.mv || this.broken.has(tile)) continue;
      if (this._probeTile(tile, x, z, px, pz, y, 0)) return HIT;
    }
    const mv = this.track.movers;
    for (let i = 0; i < mv.length; i++) {
      if (this.broken.has(mv[i])) continue;
      const o = this.track.moverOffset(mv[i], this.track.time, MOV);
      if (o.a) {
        const q = this.track.moverLocal(o, x, z, MQ1), q2 = this.track.moverLocal(o, px, pz, MQ2);
        if (this._probeTile(mv[i], q.x, q.z, q2.x, q2.z, y - o.y, 0)) {
          const c = Math.cos(o.a), sn = Math.sin(o.a), dx = HIT.dx, dz = HIT.dz, nx = HIT.nx, nz = HIT.nz;
          HIT.dx = c * dx + sn * dz;
          HIT.dz = -sn * dx + c * dz;
          HIT.nx = c * nx + sn * nz;
          HIT.nz = -sn * nx + c * nz;
          return HIT;
        }
      } else if (this._probeTile(mv[i], x - o.x, z - o.z, px - o.x, pz - o.z, y - o.y, 0)) return HIT;
    }
    return null;
  }
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
    rotVec(tile.r, S1.gx, S1.gz, W1);
    HIT.dx = W1.x * push;
    HIT.dz = W1.z * push;
    const ns = inside ? -sgn : sgn;
    HIT.nx = W1.x * ns;
    HIT.nz = W1.z * ns;
    return true;
  }
  // ---------------------------------------------------------------- Rubans
  // Sur un ruban, l'état est exprimé dans le plan de la route :
  //   e1 = sens de parcours, e2 = droite, n = normale.
  //   vs, vd : vitesse le long de e1 / e2 ; psi : cap de la voiture par rapport à e1.
  _basis(R, F) {
    const d = R.dir;
    return {
      e1x: F.tx * d,
      e1y: F.ty * d,
      e1z: F.tz * d,
      e2x: F.rx * d,
      e2y: F.ry * d,
      e2z: F.rz * d
    };
  }
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
        if (!isRibbon(tile) || this.broken.has(tile)) continue;
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
          R.psi = Math.atan2(h.x * B2.e2x + h.y * B2.e2y + h.z * B2.e2z, h.x * B2.e1x + h.y * B2.e1y + h.z * B2.e1z);
          this.rib = R;
          this.ev.loopIn = true;
          this._ribPlace(R);
          return true;
        }
      }
    }
    return false;
  }
  // Vol plané du deltaplane : portance perpendiculaire à la vitesse, traînée,
  // incidence pilotée (gaz = piquer, frein = cabrer), virage incliné au volant.
  _glide(inp, dt) {
    const v = this.vel, G = GLIDE;
    const hv = Math.hypot(v.x, v.z);
    const sp = Math.max(1e-3, Math.hypot(hv, v.y));
    const aoaT = inp.brake ? G.up : inp.throttle ? G.down : G.trim;
    this.aoa += (aoaT - this.aoa) * Math.min(1, dt * 3);
    let L4 = G.lift * sp * sp * Math.max(0, 0.6 + 4 * this.aoa);
    L4 = Math.min(L4, G.liftMaxG * this.g);
    const D = G.drag * sp * sp + G.induced * L4;
    const dx = v.x / sp, dy = v.y / sp, dz = v.z / sp;
    const gu = this.gSign;
    let lx = -dx * dy * gu, ly = (1 - dy * dy) * gu, lz = -dz * dy * gu;
    const ll = Math.hypot(lx, ly, lz) || 1;
    lx /= ll;
    ly /= ll;
    lz /= ll;
    v.x += (L4 * lx - D * dx) * dt;
    v.y += (L4 * ly - D * dy - this.g * gu) * dt;
    v.z += (L4 * lz - D * dz) * dt;
    this.bankT = (this.bankT || 0) + (this.steer - (this.bankT || 0)) * Math.min(1, dt * G.turnRamp);
    const yr = this.bankT * G.turn * Math.min(1, hv / G.turnSpeed);
    const a = -yr * gu * dt, c = Math.cos(a), s = Math.sin(a);
    const vx = v.x * c + v.z * s, vz = v.z * c - v.x * s;
    v.x = vx;
    v.z = vz;
    this.yaw += a;
    this.omega = yr;
    const traj = Math.atan2(v.y, Math.max(1e-3, Math.hypot(v.x, v.z)));
    this.glidePitch = traj + this.aoa;
  }
  // Anneaux turbo : traverser le disque donne une poussée.
  _rings() {
    const p = this.pos, q = this.prev;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (const tile of tiles) {
      if (tile.t !== "ring" && !tile.tb) continue;
      toLocal(tile, p.x, p.z, L1);
      toLocal(tile, q.x, q.z, L2);
      if (L1.lz * L2.lz > 0 || L1.lz === L2.lz) continue;
      const k = L2.lz / (L2.lz - L1.lz);
      const lx = L2.lx + (L1.lx - L2.lx) * k, y = q.y + (p.y - q.y) * k;
      const cy = tile.l * LEVEL_H + ROAD_TOP + RING_Y;
      if (Math.hypot(lx, y - cy) > RING_R) continue;
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
    const c = Math.cos(this.pitch), sn = Math.sin(this.pitch);
    const fx = -Math.sin(this.yaw) * c, fy = sn, fz = -Math.cos(this.yaw) * c;
    const mis = Math.abs(Math.asin(clamp(fx * nx + fy * ny + fz * nz, -1, 1)));
    const hv = Math.hypot(v.x, v.z);
    let side = 0;
    if (hv > 4) {
      const hx = -Math.sin(this.yaw), hz = -Math.cos(this.yaw);
      side = Math.acos(clamp((v.x * hx + v.z * hz) / hv, -1, 1));
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
  // Atterrissage en plein milieu d'un ruban (retombée sur le haut d'un L, au fond d'un looping...).
  _tryLandRibbon() {
    const p = this.pos, q = this.prev, v = this.vel;
    const tiles = this.track.tilesAt(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    for (const tile of tiles) {
      if (!isRibbon(tile) || this.broken.has(tile)) continue;
      const rib = ribbonOf(tile);
      let bu = -1, bd = Infinity;
      for (let i = 0; i <= 32; i++) {
        const F2 = frameWorld(tile, rib, i / 32, this.F);
        const d = (p.x - F2.px) ** 2 + (p.y - F2.py) ** 2 + (p.z - F2.pz) ** 2;
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
      R.psi = Math.atan2(h.x * B2.e2x + h.y * B2.e2y + h.z * B2.e2z, h.x * B2.e1x + h.y * B2.e1y + h.z * B2.e1z);
      this.ev.land = -vn;
      const kq = this._landing(F.nx, F.ny, F.nz);
      R.vs *= kq;
      R.vd *= kq;
      this.rib = R;
      this._ribPlace(R);
      return true;
    }
    return false;
  }
  // Section courbe (tube) : repère de la route au point de la voiture.
  // Avec kc = courbure transversale et phi = kc * dl, la chaussée remonte de chaque côté :
  // position = centre + r sin(phi)/kc + n (1 - cos(phi))/kc, normale tournée de phi.
  // Remplit F.qx/qy/qz (point de contact) et remplace n et r par leurs valeurs locales.
  _cross(R, F) {
    const kc = F.kc || 0;
    if (F.wrap && kc > 0) {
      const C3 = 2 * Math.PI / kc;
      R.dl = ((R.dl + C3 / 2) % C3 + C3) % C3 - C3 / 2;
    }
    let X = R.dl, Y = 0, c = 1, s = 0;
    if (kc > 1e-5) {
      const phi = kc * R.dl;
      c = Math.cos(phi);
      s = Math.sin(phi);
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
  }
  _ribStep(inp) {
    const R = this.rib, dt = DT, tile = R.tile, rib = R.rib;
    let F = frameWorld(tile, rib, R.u, this.F);
    const dU = 6e-3;
    const u0 = Math.max(0, R.u - dU), u1 = Math.min(1, R.u + dU);
    const A0 = frameWorld(tile, rib, u0, this.F0), A2 = frameWorld(tile, rib, u1, this.F2);
    const k = 1 / (F.ds * (u1 - u0));
    const kg0 = ((A2.tx - A0.tx) * F.rx + (A2.ty - A0.ty) * F.ry + (A2.tz - A0.tz) * F.rz) * k;
    const kn0 = ((A2.tx - A0.tx) * F.nx + (A2.ty - A0.ty) * F.ny + (A2.tz - A0.tz) * F.nz) * k;
    this._cross(R, F);
    const kc = F.kc || 0;
    const kn = kn0 * F.cc - kg0 * F.cs, kg = kg0 * F.cc + kn0 * F.cs;
    let B2 = this._basis(R, F);
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
    const C3 = surfaceCoeffs(mod, f);
    let extraDrag = C3.extraDrag, gripK = C3.grip, tractK = C3.traction, vmaxK = C3.vmaxK, beltE1 = 0, rearK = C3.rearK;
    if (this.stunT > 0) {
      gripK *= CAR.stunGrip;
      tractK *= CAR.stunTraction;
    }
    if (mod === "boost") {
      if (this.boost < CAR.boostTime - 0.2) this.ev.boostHit = true;
      this.boost = CAR.boostTime;
      this.boostF = f;
    } else if (mod === "gravity") {
      if (Math.abs(f - this.gravMul) > 0.01) {
        this.gravMul = f;
        this.ev.gravity = true;
      }
    } else if (mod === "wind") {
      const a = (tileParam(tile) - 100) / 100 * CAR.wind;
      rotVec(tile.r, 1, 0, TMP);
      R.vs += (TMP.x * B2.e1x + TMP.z * B2.e1z) * a * dt;
      R.vd += (TMP.x * B2.e2x + TMP.z * B2.e2z) * a * dt;
    } else if (mod === "conveyor") beltE1 = beltSpeed(tileParam(tile)) * R.dir;
    else if (mod === "spring" && this.plateLock !== "spring") {
      this.plateLock = "spring";
      this.ev.spring = true;
      R.vd += (tileParam(tile) - 100) / 100 * CAR.spring * R.dir;
    } else if (PLATES[mod]) {
      if (this.plateLock !== mod) {
        this.plateLock = mod;
        this.vehicle = this.vehicle === PLATES[mod] ? "car" : PLATES[mod];
        this.ev.moto = true;
      }
    } else this._timedMods(mod);
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
    const c = Math.cos(R.psi), s = Math.sin(R.psi);
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
  }
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
    const c = Math.cos(R.psi), s = Math.sin(R.psi);
    this.fwd.x = B2.e1x * c + B2.e2x * s;
    this.fwd.y = B2.e1y * c + B2.e2y * s;
    this.fwd.z = B2.e1z * c + B2.e2z * s;
    if (Math.hypot(this.fwd.x, this.fwd.z) > 0.3) this.yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    this.grounded = true;
    this.surfType = "road";
    this.surfMod = R.tile.s || "";
  }
  _ribDetach() {
    this.pitch = Math.asin(clamp(this.fwd.y, -1, 1));
    this.pitchRate = 0;
    this.airTime = 0;
    const t = this.rib && this.rib.tile;
    this.fallWhy = this.ev.wallOff ? "wall" : t && PIECES[t.t].kind === "loop" ? "loop" : t && t.t === "twist" ? "twist" : t && t.v ? "inv" : "crest";
    this.rib = null;
    this.grounded = false;
    this.ev.loopFall = true;
  }
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
      N.psi = Math.atan2(h2.x * B2.e2x + h2.y * B2.e2y + h2.z * B2.e2z, h2.x * B2.e1x + h2.y * B2.e1y + h2.z * B2.e1z);
      this.rib = N;
      this._ribPlace(N);
      return;
    }
    this.rib = null;
    this.ev.loopOut = true;
    const h = this.fwd;
    if (Math.hypot(h.x, h.z) > 0.2) this.yaw = Math.atan2(-h.x, -h.z);
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
  }
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
        if (tile === curTile || seen.has(tile) || !isRibbon(tile) || this.broken.has(tile)) continue;
        seen.add(tile);
        const rib = ribbonOf(tile);
        for (let end = 0; end < 2; end++) {
          const G = frameWorld(tile, rib, end, this.F3);
          const dist = Math.hypot(G.px - px, G.py - py, G.pz - pz);
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

// js/raceLogic.js
var L3 = {
  lx: 0,
  lz: 0
};
var S3 = {};
var RaceLogic = class {
  constructor(track, opts = {}) {
    this.track = track;
    this.laps = Math.max(1, track.laps || 1);
    this.partial = !!opts.partial;
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
      gs: t.v || this.track.inversionGraviteDepart ? -1 : 1
    };
  }
  reset() {
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
    return {
      steps: this.steps,
      splits: this.splits.length,
      collected: [
        ...this.collected
      ],
      lap: this.lap
    };
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
        if (Math.hypot(lx, y - (h + RING_Y)) > RING_R + 0.5) continue;
        const gl = this.lastGround;
        const snap = this._snap();
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
          c = localToWorld(tile, a.cx + a.R * Math.cos(ang), a.cz + a.R * Math.sin(ang));
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
    phys.vel.x = -Math.sin(sp.yaw) * v0;
    phys.vel.z = -Math.cos(sp.yaw) * v0;
    phys.fwdSpeed = v0;
  }
}

// js/autopilot.js
var Autopilot = class {
  constructor(path, opts = {}) {
    this.path = path;
    this.idx = 0;
    this.latLimit = opts.latLimit ?? CAR.latGrip * 0.8;
    this.brakeDecel = opts.brakeDecel ?? 20;
    this.vCap = opts.vCap ?? (path.pilot && path.pilot.vCap) ?? 52;
    const n = path.length;
    this.dist = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      const a = path[i - 1], b = path[i];
      this.dist[i] = this.dist[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    this.radius = new Float32Array(n).fill(1e4);
    for (let i = 1; i < n - 1; i++) {
      const a = path[Math.max(0, i - 2)], b = path[i], c = path[Math.min(n - 1, i + 2)];
      if (a[3] === 1 || b[3] === 1 || c[3] === 1) continue;
      const h1 = Math.atan2(b[2] - a[2], b[0] - a[0]);
      const h2 = Math.atan2(c[2] - b[2], c[0] - b[0]);
      let dh = h2 - h1;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.5 + Math.hypot(c[0] - b[0], c[2] - b[2]) * 0.5;
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
    const h = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return h > 0.5 ? Math.atan2(b[1] - a[1], h) : 0;
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
      const d = (q[0] - p.x) ** 2 + (q[2] - p.z) ** 2 + ((q[1] - p.y) * 3) ** 2;
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
    return c;
  }
  _control(phys) {
    this._progress(phys);
    if (phys.rib) {
      const R = phys.rib;
      const d2 = R.dir * R.dl;
      const vs = Math.max(8, Math.abs(R.vs));
      const psiDes = Math.asin(Math.max(-0.5, Math.min(0.5, -1.2 * d2 / vs)));
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
      const fx2 = -Math.sin(phys.yaw), fz2 = -Math.cos(phys.yaw);
      const tx2 = tq2[0] - p.x, tz2 = tq2[2] - p.z;
      const ang2 = Math.atan2(fx2 * tz2 - fz2 * tx2, fx2 * tx2 + fz2 * tz2);
      const hv = Math.max(8, Math.hypot(phys.vel.x, phys.vel.z));
      const wantVy = (tq2[1] + 3 - p.y) / (Math.max(10, Math.hypot(tx2, tz2)) / hv);
      let landK = -1;
      for (let k = this.idx + 1; k < path.length && k < this.idx + 80; k++) {
        if (Math.hypot(path[k][0] - path[k - 1][0], path[k][2] - path[k - 1][2]) > 30) {
          landK = k;
          break;
        }
      }
      let low, high;
      if (landK > 0 && landK > j2) {
        const rest = Math.hypot(path[landK][0] - p.x, path[landK][2] - p.z);
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
      const hv = Math.hypot(phys.vel.x, phys.vel.z);
      const tLand = Math.max(0.15, (phys.vel.y + Math.sqrt(Math.max(0, phys.vel.y ** 2 + 2 * phys.g * Math.max(0, p.y - this._groundBelow(p.y))))) / phys.g);
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
    const fx = -Math.sin(phys.yaw), fz = -Math.cos(phys.yaw);
    const tx = tq[0] - p.x, tz = tq[2] - p.z;
    const cross = fx * tz - fz * tx;
    const dot = fx * tx + fz * tz;
    const ang = Math.atan2(cross, dot);
    const steer = Math.max(-1, Math.min(1, ang * 2.6 - (phys.omega || 0) * 0.25));
    let vTarget = this.vCap;
    const horizon = 15 + v * v / (2 * this.brakeDecel);
    for (let k = this.idx; k < path.length && this.dist[k] - this.dist[this.idx] < horizon; k++) {
      const vMax = Math.sqrt(this.latLimit * this.radius[k]);
      const dd = this.dist[k] - this.dist[this.idx];
      const allowed = Math.sqrt(vMax * vMax + 2 * this.brakeDecel * dd);
      if (allowed < vTarget) vTarget = allowed;
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
  const phys = new CarPhysics(track), logic = new RaceLogic(track);
  placeAtStart(phys, logic);
  const bot = new Autopilot(track.path, {
    latLimit: CAR.latGrip * latK,
    brakeDecel: 36
  });
  bot.reset(phys);
  let groundT = 0, respawns = 0;
  for (let i = 0; i < 120 * 120; i++) {
    phys.clock = logic.steps;
    phys.step(bot.control(phys));
    const ev = logic.update(phys);
    if (ev && ev.type === "finish") return respawns ? null : logic.time;
    if (phys.offTrack || phys.ev.sink) {
      groundT += 1 / 120;
      if (groundT > 0.3 || phys.ev.sink) return null;
    } else groundT = 0;
  }
  return null;
}
var cache2 = /* @__PURE__ */ new Map();
function dailyChallenge(day = dayKey()) {
  if (cache2.has(day)) return cache2.get(day);
  const decors = Object.keys(DECORS);
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
    cache2.set(day, out);
    return out;
  }
  return null;
}

// js/replay.js
var PHYS_VER = 24;
var MAX_REPLAY_STEPS = 120 * 600;
function decodeInputs(b64) {
  const bin = atob(b64);
  const steer = [], flags = [];
  let total = 0;
  for (let i = 0; i + 2 < bin.length; i += 3) total += bin.charCodeAt(i);
  if (total > MAX_REPLAY_STEPS) throw new Error("Enregistrement trop long.");
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
var GhostRunner = class {
  constructor(track, { inputs = null, bot = false, latK = 0.8 } = {}) {
    this.phys = new CarPhysics(track);
    this.logic = new RaceLogic(track);
    this.rep = inputs ? decodeInputs(inputs) : null;
    this.bot = bot && track.path ? new Autopilot(track.path, {
      latLimit: 56 * latK
    }) : null;
    this.reset();
  }
  reset() {
    this.logic.reset();
    placeAtStart(this.phys, this.logic);
    if (this.bot) this.bot.reset(this.phys);
    this.k = 0;
    this.groundT = 0;
    this.done = false;
  }
  step() {
    if (this.done) return;
    let inp;
    if (this.bot) inp = this.bot.control(this.phys);
    else inp = inputAt(this.rep, this.k);
    if (inp.respawn) {
      const r = this.logic.rewind();
      this.phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
      this.phys.vehicle = r.vehicle || "car";
      this.phys.gravMul = r.grav || 1;
    }
    this.phys.clock = this.logic.steps;
    this.phys.step(inp);
    const sink = this.phys.ev.sink;
    const ev = this.logic.update(this.phys);
    if (this.phys.offTrack) this.groundT += 1 / 120;
    else this.groundT = 0;
    if (this.groundT > 0.5 || sink) {
      this.groundT = 0;
      const r = this.logic.rewind();
      this.phys.place(r.x, r.y, r.z, r.yaw, r.gs || 1);
      this.phys.vehicle = r.vehicle || "car";
      this.phys.gravMul = r.grav || 1;
    }
    if (ev && ev.type === "finish") this.done = true;
    if (this.rep && this.k >= this.rep.length + 240) this.done = true;
    this.k++;
  }
};

// js/verify.js
var MAX_STEPS = 120 * 600;
var MAX_INPUTS_CHARS = 4e5;
function trackForKey(key2, code = "") {
  key2 = String(key2 || "");
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
function replayTime(track, inputs) {
  if (!inputs || inputs.length > MAX_INPUTS_CHARS) return null;
  let rep;
  try {
    rep = decodeInputs(inputs);
  } catch {
    return null;
  }
  if (!rep.length || rep.length > MAX_STEPS) return null;
  const g = new GhostRunner(track, {
    inputs
  });
  while (!g.done && g.k < MAX_STEPS) g.step();
  return g.logic.finished ? g.logic.time : null;
}
function verifyRun({ trackKey, code, inputs, time, physVer }) {
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
  const sim = replayTime(t.track, inputs);
  if (sim == null) return {
    ok: false,
    error: "La course rejou\xE9e n\u2019atteint pas l\u2019arriv\xE9e."
  };
  if (Math.abs(sim - time) > 5e-4) return {
    ok: false,
    error: "Le temps ne correspond pas \xE0 la course rejou\xE9e."
  };
  return {
    ok: true,
    time: sim,
    name: t.name,
    kind: t.kind
  };
}

// supabase/functions/submit-score/server.ts
var SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
var SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...cors,
    "Content-Type": "application/json"
  }
});
var db = (path, init = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
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
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: cors
  });
  if (req.method !== "POST") return json(405, {
    error: "M\xE9thode non autoris\xE9e."
  });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return json(500, {
      error: "Fonction mal configur\xE9e (cl\xE9s Supabase absentes)."
    });
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: req.headers.get("Authorization") ?? "",
        apikey: SERVICE_KEY
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
    const body = await req.json();
    const { trackKey, code = "", inputs, time, physVer } = body ?? {};
    if (typeof trackKey !== "string" || trackKey.length > 80 || typeof inputs !== "string" || typeof time !== "number" || typeof physVer !== "number") {
      return json(400, {
        error: "Requ\xEAte invalide."
      });
    }
    if (typeof code !== "string" || code.length > 4e5) return json(400, {
      error: "Code de circuit invalide."
    });
    const res = verifyRun({
      trackKey,
      code,
      inputs,
      time,
      physVer
    });
    if (!res.ok || typeof res.time !== "number") return json(422, {
      error: res.error ?? "Course non confirm\xE9e."
    });
    const simTime = res.time;
    const prof = await (await db(`players?id=eq.${uid}&select=id`)).json();
    if (!Array.isArray(prof) || !prof.length) return json(400, {
      error: "Profil pilote manquant."
    });
    const key2 = encodeURIComponent(trackKey);
    const prev = await (await db(`scores?track_key=eq.${key2}&player=eq.${uid}&select=time,phys_ver`)).json();
    let best = simTime;
    let improved = true;
    if (Array.isArray(prev) && prev.length && prev[0].phys_ver === physVer && prev[0].time <= simTime) {
      best = prev[0].time;
      improved = false;
    }
    if (improved) {
      const up = await db("scores", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({
          track_key: trackKey,
          player: uid,
          time: simTime,
          inputs,
          phys_ver: physVer,
          track_name: String(res.name ?? "").slice(0, 60),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
      if (!up.ok) return json(500, {
        error: "Enregistrement impossible."
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
    return json(500, {
      error: String(e?.message ?? e)
    });
  }
});
