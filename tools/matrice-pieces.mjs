// Matrice de compatibilité pièces × orientations (phase 1 après l'audit 0.9.59) : pour CHAQUE type de pièce et chaque orientation autorisée par l'éditeur
// (sol, mur gauche, mur droit, plafond), construit un vrai circuit (départ → … → pièce → … → arrivée, avec les transitions nécessaires pour
// amener la route dans la bonne orientation), le fait rouler par le VRAI moteur de physique à trois vitesses de croisière, et note ce qui se passe.
//
//   node tools/matrice-pieces.mjs            affiche le résumé et vérifie tools/compat/matrice-pieces.json (échec si la matrice a changé)
//   node tools/matrice-pieces.mjs --update   réécrit tools/compat/matrice-pieces.json et docs/MATRICE-PIECES.md
//
// Codes d'une case : OK (finit aux trois vitesses sans quitter la route ni décoller) · SAUT (finit, mais décolle) · v≥N (ne tient qu'à partir de N km/h)
// · CHUTE (ne finit à aucune vitesse) · RACCORD (aucune pièce ne se raccorde à cette orientation : la chaîne ne peut pas être construite) · — (non
// proposé par l'éditeur) · n/a (pièce sans route, voir la raison). Ce que la matrice NE prouve PAS : le comportement avec les revêtements, les
// obstacles, plusieurs pièces de même nature enchaînées, ou un autre véhicule ; le pilote de référence est le pilote automatique, pas un humain.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Track } from '../js/track.js';
import { PIECES, PIECE_ORDER, LEGACY_TILE, flagAllowed } from '../js/pieces.js';
import { tileEnds, compatiblePlacement, rollNameOf, endsTouch, rollGap, ROLL_TOLERANCE } from '../js/connect.js';
import { centerlineWorld } from '../js/ribbons.js';
import { CarPhysics } from '../js/physics.js';
import { RaceLogic, placeAtStart } from '../js/raceLogic.js';
import { Autopilot } from '../js/autopilot.js';
import { DT } from '../js/constants.js';
import { PHYS_VER } from '../js/version.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const COLS = [
  { id: 'sol', label: 'Sol', opts: {} },
  { id: 'murG', label: 'Mur gauche', opts: { o: 1 } },
  { id: 'murD', label: 'Mur droit', opts: { o: 2 } },
  { id: 'plafond', label: 'Plafond', opts: { v: 1 } },
];
export const SPEEDS = [80, 150, 250];       // km/h de croisière
const L0 = 12;                                // niveau de la chaîne : de la place sous la route (murs : 2 niveaux, pièces descendantes) et au-dessus du terrain

const nameOfEnd = (e) => {
  const n = [e.nx, e.ny, e.nz], t = [e.exit ? e.dx : -e.dx, e.exit ? e.dy : -e.dy, e.exit ? e.dz : -e.dz];
  return Math.abs(n[1]) > 0.7 ? (n[1] > 0 ? 'sol' : 'plafond') : rollNameOf(n, t);
};
const OPTS_OF = { sol: {}, 'mur gauche': { o: 1 }, 'mur droit': { o: 2 }, plafond: { v: 1 } };

// ---- Construction d'une chaîne ----------------------------------------------------------------------------------------------------------
class Chain {
  constructor() { this.track = new Track('matrice'); this.tiles = []; this.pieces = []; this.end = null; this.fail = ''; }
  // Ajoute `type` (options opts) raccordée à l'extrémité courante ; reverse : entrée par la sortie de la pièce.
  add(type, opts = {}, reverse = false) {
    if (this.fail) return null;
    let t;
    if (!this.end) t = Track.normalize({ t: type, x: 0, z: 0, l: L0, r: 0, s: '', p: 0, ...opts });
    else {
      t = compatiblePlacement(this.end, type, opts, { reverse });
      if (!t) { this.fail = `aucune ${PIECES[type].label} ne se raccorde ici (${nameOfEnd(this.end)} → ${type})`; return null; }
      t = Track.normalize(t);
    }
    if (!Track.inBounds(t)) { this.fail = `${type} sort des niveaux`; return null; }
    if (this.track.conflicts(t).length) { this.fail = `${type} chevauche une pièce déjà posée`; return null; }
    const added = this.track.add(t);
    const ends = tileEnds(added);
    this.pieces.push({ tile: added, reverse });
    // Extrémité de sortie : la sortie (ou l'entrée, si la pièce est parcourue à contresens) ; bifurcation : branche directe.
    this.end = ends.find((e) => (reverse ? e.entry : e.exit)) || null;
    return added;
  }
  orient() { return this.end ? nameOfEnd(this.end) : null; }
  // Route droite dans l'orientation courante.
  straight() { return this.add('straight', OPTS_OF[this.orient()] || {}); }
  // Amène la route au sol (depuis un mur ou le plafond), ou du sol vers `target`.
  toFloor() {
    const o = this.orient();
    if (o === 'sol' || !o) return;
    if (o === 'mur gauche') this.add('tr10s');
    else if (o === 'mur droit') this.add('tr20s');
    else if (o === 'plafond') this.add('twist', { s: 'flip' }, true);
  }
  fromFloor(target) {
    if (target === 'sol') return;
    if (target === 'mur gauche') this.add('tr01s');
    else if (target === 'mur droit') this.add('tr02s');
    else if (target === 'plafond') this.add('twist', { s: 'flip' });
  }
}

// Orientation d'entrée d'une pièce (d'après la normale de son entrée) ; null si elle n'est pas lisible (route verticale).
function entryOrientation(type, opts) {
  const t = Track.normalize({ t: type, x: 0, z: 0, l: L0, r: 0, s: '', p: 0, ...opts });
  const e = tileEnds(t).find((x) => x.entry);
  return e ? nameOfEnd(e) : null;
}

export function buildChain(type, opts) {
  const c = new Chain();
  c.add('start');
  c.straight();
  // Montée en L (ramp90 → mur → sommet) : les trois pièces ne se raccordent qu'entre elles (la route y est verticale) : la chaîne les pose toujours ensemble.
  const L = ['ramp90', 'wall', 'crest90'].includes(type);
  const need = entryOrientation(L ? 'ramp90' : type, opts);
  if (!need) { c.fail = 'orientation d\'entrée illisible'; return c; }
  c.fromFloor(need);
  if (need !== 'sol') c.straight();
  if (L) {
    c.add('ramp90', opts);
    if (type === 'wall') c.add('wall', opts);
    c.add('crest90', opts);
  } else c.add(type, opts);
  c.straight();
  c.toFloor();
  if (!c.fail && c.orient() !== 'sol') c.fail = `la route finit en « ${c.orient()} » : impossible de revenir au sol`;
  c.add('straight');
  c.add('finish');
  return c;
}

// ---- Essai de conduite ---------------------------------------------------------------------------------------------------------------------
function pathOf(chain) {
  const path = [];
  for (const { tile, reverse } of chain.pieces) {
    const pts = centerlineWorld(tile, PIECES[tile.t].size >= 2 ? 12 : 6, reverse);
    if (path.length) pts.shift();
    path.push(...pts);
  }
  return path;
}

function drive(chain, kmh) {
  const tr = chain.track;
  tr.path = pathOf(chain);
  const ph = new CarPhysics(tr), lg = new RaceLogic(tr);
  placeAtStart(ph, lg); ph.graceT = 0;
  const bot = new Autopilot(tr.path); bot.reset(ph);
  const v = kmh / 3.6;
  let air = 0, airMax = 0, fell = '', done = false;
  for (let i = 0; i < 120 * 45 && !done; i++) {
    const b = bot.control(ph);
    ph.clock = i;
    ph.step({ steer: b.steer, throttle: ph.speed < v, brake: ph.speed > v * 1.15 });
    if (ph.ev.loopFall && !fell && ph.fallWhy !== 'crest') fell = ph.fallWhy || 'chute';      // « crest » : le saut voulu du haut d'une montée en L, ou la sortie d'une bande (alors la voiture n'arrive pas : détectée plus bas)
    if (ph.lost) { fell = fell || 'perdue'; break; }
    if (ph.grounded && ph.surfType === 'ground' && !tr.offroad && ph.pos.y < tr.bounds().minY - 3) { fell = fell || 'terrain'; break; }
    if (!ph.grounded && ph.pos.y < tr.bounds().minY - 3) { fell = fell || 'terrain'; break; }
    if (!ph.grounded) { air += DT; airMax = Math.max(airMax, air); } else air = 0;
    const e = lg.update(ph);
    if (e && e.type === 'finish') {
      done = true;
      // Franchir la ligne ne suffit pas : une voiture envoyée en l'air en gravité inversée « passe » aussi l'arrivée. Elle doit y arriver sur la route, à l'endroit.
      if (ph.gSign !== 1) fell = fell || 'gravité';
      else if (!ph.grounded) fell = fell || 'en vol à l\'arrivée';
    }
  }
  return { done, fell, airMax: Math.round(airMax * 100) / 100 };
}

export function probe(type, opts) {
  const c = buildChain(type, opts);
  if (c.fail) return { code: 'RACCORD', why: c.fail };
  // Vérification de structure : chaque raccord de la chaîne se touche, sans écart de roulis.
  for (let i = 1; i < c.pieces.length; i++) {
    const a = c.pieces[i - 1], b = c.pieces[i];
    const ea = tileEnds(a.tile).find((e) => (a.reverse ? e.entry : e.exit));
    const eb = tileEnds(b.tile).find((e) => (b.reverse ? e.exit : e.entry));
    if (!ea || !eb || !endsTouch(ea, eb) || rollGap(ea, eb) > ROLL_TOLERANCE) return { code: 'RACCORD', why: `raccord ${a.tile.t} → ${b.tile.t} incompatible` };
  }
  const runs = SPEEDS.map((v) => ({ v, ...drive(c, v) }));
  const ok = runs.map((r) => r.done && !r.fell);
  const jumps = runs.some((r) => r.airMax > 0.35);
  let code;
  if (ok.every(Boolean)) code = jumps ? 'SAUT' : 'OK';
  else if (ok.some(Boolean)) code = 'v≥' + SPEEDS[ok.findIndex(Boolean)];
  else code = 'CHUTE';
  return { code, runs: runs.map((r) => `${r.v}:${r.done && !r.fell ? 'ok' : r.fell || 'non fini'}${r.airMax > 0.35 ? '/vol' + r.airMax : ''}`).join(' ') };
}

// ---- Matrice complète ---------------------------------------------------------------------------------------------------------------------------
const NA = {
  platform: 'plateforme : surface sans extrémité (aucun raccord orienté)',
  ring: 'anneau flottant : pas de route',
  cpRing: 'anneau flottant : pas de route',
  start: 'ouvre toutes les chaînes (départ)',
  finish: 'ferme toutes les chaînes (arrivée)',
  fork: 'bifurcation : sa voie directe ne se prolonge que dans un circuit à deux voies parallèles (essayée dans les circuits officiels, pas en chaîne)',
  forkL: 'bifurcation : sa voie directe ne se prolonge que dans un circuit à deux voies parallèles (essayée dans les circuits officiels, pas en chaîne)',
};

export function computeMatrix() {
  const out = {};
  const legacy = new Set(Object.keys(LEGACY_TILE));
  for (const type of Object.keys(PIECES)) {
    if (legacy.has(type)) continue;
    const row = { kind: PIECES[type].kind, cells: {} };
    for (const col of COLS) {
      if (NA[type]) { row.cells[col.id] = { code: 'n/a', why: NA[type] }; continue; }
      // Proposé par l'éditeur ? (le plafond est le drapeau v ; murs : flagAllowed('o'))
      const probeTile = { t: type, v: 0, o: 0, nb: 0, tn: 0, mv: 0, cp: 0, tb: 0 };
      let allowed = true;
      if (col.opts.o) allowed = flagAllowed(type, 'o', probeTile, col.opts.o);
      else if (col.opts.v) allowed = flagAllowed(type, 'v', probeTile, 1);
      if (!allowed) { row.cells[col.id] = { code: '—', why: 'non proposé par l\'éditeur (flagAllowed)' }; continue; }
      row.cells[col.id] = probe(type, col.opts);
    }
    out[type] = row;
  }
  return out;
}

const FAM = (type) => {
  const P = PIECES[type];
  if (P.roll) return 'Transitions d\'orientation';
  if (P.kind === 'loop') return 'Loopings';
  if (P.kind === 'fork') return 'Bifurcations';
  if (P.kind === 'ribbon') return 'Rubans (vrille, tire-bouchon, tubes, virages relevés, montée en L…)';
  if (P.kind === 'arc') return 'Virages';
  if (P.kind === 'area' || P.kind === 'ring') return 'Plateforme et anneaux';
  return 'Lignes droites, pentes et courbes';
};

// Table compacte lue par le vérificateur d'éditeur (js/continuity.js) : { type: { sol, murG, murD, plafond } } (codes de la matrice). Générée : ne pas modifier à la main.
export function renderFacts(m) {
  const o = {};
  for (const [type, row] of Object.entries(m)) o[type] = Object.fromEntries(COLS.map((c) => [c.id, row.cells[c.id].code]));
  const body = Object.entries(o).map(([t, r]) => `  ${t}: ${JSON.stringify(r).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")},`).join('\n');
  return `// GÉNÉRÉ par \`node tools/matrice-pieces.mjs --update\` (docs/MATRICE-PIECES.md) : ne pas modifier à la main.\n// Résultat mesuré de chaque pièce dans chaque orientation (codes : OK, SAUT, v≥N, CHUTE, RACCORD, —, n/a). Lu par continuity.js.\nexport const PIECE_FACTS = {\n${body}\n};\n`;
}

export function renderMarkdown(m) {
  const fams = {};
  for (const [type, row] of Object.entries(m)) (fams[FAM(type)] ||= []).push([type, row]);
  const sum = {};
  for (const row of Object.values(m)) for (const c of Object.values(row.cells)) sum[c.code] = (sum[c.code] || 0) + 1;
  const lines = [
    '# Matrice de compatibilité des pièces (générée)', '',
    'Générée par `node tools/matrice-pieces.mjs --update` : **ne pas modifier à la main**. Chaque case est un vrai circuit (départ → pièce → arrivée, avec les',
    `transitions nécessaires) roulé par le moteur de physique actuel (\`PHYS_VER\` ${PHYS_VER}) au pilote automatique, à 80, 150 et 250 km/h de croisière.`, '',
    '| Code | Sens |', '|---|---|',
    '| OK | finit aux trois vitesses, sans quitter la route ni décoller |',
    '| SAUT | finit, mais la voiture décolle plus de 0,35 s (rupture de pente, tremplin, bascule) |',
    '| v≥N | ne tient qu\'à partir de N km/h (au pilote automatique) |',
    '| CHUTE | ne finit à aucune des trois vitesses |',
    '| RACCORD | la chaîne ne peut pas être construite : aucune pièce du catalogue ne se raccorde à cette orientation (voir la raison) |',
    '| — | orientation non proposée par l\'éditeur (`flagAllowed`) |',
    '| n/a | pièce sans route roulable (raison dans le fichier JSON) |', '',
    `Totaux : ${Object.entries(sum).sort().map(([k, v]) => `${k} ${v}`).join(' · ')}.`, '',
    '**Limites** : pilote automatique (pas un humain), voiture classique, sans revêtement ni obstacle, une seule pièce testée par chaîne, vitesse de croisière régulée.',
    'Les raisons détaillées de chaque case (vitesses, chutes, raccords impossibles) sont dans `tools/compat/matrice-pieces.json`.', '',
  ];
  for (const [fam, rows] of Object.entries(fams)) {
    lines.push(`## ${fam}`, '', '| Pièce | ' + COLS.map((c) => c.label).join(' | ') + ' |', '|---|' + COLS.map(() => '---|').join(''));
    rows.sort((a, b) => PIECE_ORDER.indexOf(a[0]) - PIECE_ORDER.indexOf(b[0]));
    for (const [type, row] of rows) lines.push(`| \`${type}\` ${PIECES[type].label} | ` + COLS.map((c) => row.cells[c.id].code).join(' | ') + ' |');
    lines.push('');
  }
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const m = computeMatrix();
  const file = join(root, 'tools/compat/matrice-pieces.json');
  const json = JSON.stringify(m, null, 1) + '\n';
  const codes = {};
  for (const row of Object.values(m)) for (const c of Object.values(row.cells)) codes[c.code] = (codes[c.code] || 0) + 1;
  console.log('Matrice :', Object.keys(m).length, 'pièces ×', COLS.length, 'orientations ;', JSON.stringify(codes));
  if (process.argv.includes('--update')) {
    writeFileSync(file, json);
    writeFileSync(join(root, 'docs/MATRICE-PIECES.md'), renderMarkdown(m) + '\n');
    writeFileSync(join(root, 'js/pieceFacts.js'), renderFacts(m));
    console.log('écrit : tools/compat/matrice-pieces.json, docs/MATRICE-PIECES.md');
  } else {
    let ref = '';
    try { ref = readFileSync(file, 'utf8'); } catch { /* absente */ }
    if (ref !== json) { console.log('  FAIL la matrice a changé (relancer avec --update si c\'est voulu)'); process.exit(1); }
    console.log('  ok   identique à tools/compat/matrice-pieces.json');
  }
}
