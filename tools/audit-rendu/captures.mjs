// Audit du rendu (phase 0) : machine à captures. Chromium sans écran (WebGL logiciel) ouvre le banc d'essai (banc.html), pose chaque cas d'une
// sélection, le photographie sous des angles fixes et range les images sur une planche HTML, avec les mesures des sondes pour chaque pièce.
//   node tools/audit-rendu/captures.mjs [--preset=echantillon] [--out=dossier]      (dossier par défaut : tools/audit-rendu/sortie/<preset>)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Track } from '../../js/track.js';
import { PIECES, SURFACES, tileCenter, sampleLocal } from '../../js/pieces.js';
import { pillarSpecs } from '../../js/trackGeometry.js';
import { SLAB_T } from '../../js/constants.js';
import { ribbonOf, frameLocal } from '../../js/ribbons.js';
import { pieceCases, orientLabel, surfaceVariants } from './cas.mjs';
import { DECO_CATS } from '../../js/decoData.js';
import { SONDES } from './sondes.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

// ---- Angles de vue, calculés sur la boîte englobante des pièces -----------------------------------------------------------------
// La route d'une pièce non tournée (r = 0) va de +z (entrée) vers −z (sortie) : « côté » regarde depuis +x.
export const ANGLES = {
  'trois-quarts': (b) => ({ eye: [b.c[0] + 0.8 * b.s, b.c[1] + 0.55 * b.s, b.c[2] + 0.8 * b.s], at: b.c }),
  'côté': (b) => ({ eye: [b.c[0] + 1.35 * b.s, b.c[1], b.c[2]], at: b.c }),
  'ras du sol': (b) => ({ eye: [b.c[0] + 0.75 * b.s, 1.4, b.c[2] + 0.75 * b.s], at: [b.c[0], Math.max(2, b.c[1] * 0.5), b.c[2]] }),
  'dessus': (b) => ({ eye: [b.c[0], b.max[1] + 1.25 * b.s, b.c[2] + 0.12 * b.s], at: b.c }),
  // Vues rapprochées sur le point à examiner (b.f, calculé par focusOf) : chapeau d'un poteau, creux d'une route sous le terrain.
  'gros plan': (b) => ({ eye: [b.f[0] + 10, b.f[1] + 3.5, b.f[2] + 7], at: b.f, fov: 45 }),
  // Depuis l'extérieur, du côté du point examiné, à hauteur d'homme : on voit la route entrer dans le sol.
  'gros plan, ras du sol': (b) => {
    let dx = b.f[0] - b.c[0], dz = b.f[2] - b.c[2];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    return { eye: [b.f[0] + dx * 30 + dz * 8, 2.2, b.f[2] + dz * 30 - dx * 8], at: [b.f[0], 0, b.f[2]], fov: 50 };
  },
  'dedans': (b) => ({ eye: [b.c[0], b.c[1] - 0.15 * (b.max[1] - b.min[1]), b.max[2] - 3], at: [b.c[0], b.c[1] - 0.1 * (b.max[1] - b.min[1]), b.min[2]], fov: 70 }),
};

// ---- Sélections ----------------------------------------------------------------------------------------------------------------
// Un cas : { titre, groupe, tiles (pièces posées), angles: [nom | [nom, ms]], decor?, mesure? (t, orient et sonde dont on rappelle les constats) }.
const one = (t, extra = {}, l = 0) => [Track.normalize({ t, x: 0, z: 0, l, r: 0, ...extra })];
export const PRESETS = {
  echantillon: [
    { groupe: 'Poteaux des pentes (F4)', titre: 'Courbe raide qui monte (crs4), niveau 3', tiles: one('crs4', {}, 3), focus: 'poteau', angles: ['côté', 'trois-quarts', 'gros plan'], mesure: ['crs4', 'poteaux'] },
    { groupe: 'Poteaux des pentes (F4)', titre: 'Montée raide (steep4), niveau 2', tiles: one('steep4', {}, 2), focus: 'poteau', angles: ['côté', 'trois-quarts', 'gros plan'], mesure: ['steep4', 'poteaux'] },
    { groupe: 'Poteaux des pentes (F4)', titre: 'Virage qui monte de 4 niveaux (cv4), niveau 3', tiles: one('cv4', {}, 3), focus: 'poteau', angles: ['côté', 'trois-quarts', 'gros plan'], mesure: ['cv4', 'poteaux'] },
    { groupe: 'Sous le terrain (F3)', titre: 'Looping double, niveau 0', tiles: one('loopDouble'), focus: 'creux', angles: ['trois-quarts', 'côté', 'gros plan, ras du sol'], mesure: ['loopDouble', 'sous-terrain'] },
    { groupe: 'Sous le terrain (F3)', titre: 'Vrille, niveau 0', tiles: one('twist'), focus: 'creux', angles: ['trois-quarts', 'côté', 'gros plan, ras du sol'], mesure: ['twist', 'sous-terrain'] },
    { groupe: 'Sous le terrain (F3)', titre: 'Tire-bouchon, niveau 0', tiles: one('cork'), focus: 'creux', angles: ['trois-quarts', 'côté', 'gros plan, ras du sol'], mesure: ['cork', 'sous-terrain'] },
    { groupe: 'Tube (F1)', titre: 'Tube, niveau 0', tiles: one('tube'), angles: ['trois-quarts', 'dessus', 'dedans'] },
    { groupe: 'Tapis roulant (F2)', titre: 'Tapis à +160 km/h (réglage 181)', tiles: one('straight', { s: 'conveyor', p: 181 }), angles: [['dessus', 0], ['dessus', 25]], mesure: ['straight', 'tapis', 181] },
    { groupe: 'Tapis roulant (F2)', titre: 'Tapis à −160 km/h (réglage 21)', tiles: one('straight', { s: 'conveyor', p: 21 }), angles: [['dessus', 0], ['dessus', 25]], mesure: ['straight', 'tapis', 21] },
    { groupe: 'Marquages hors de la route (F5)', titre: 'Route étroite, tapis roulant', tiles: one('narrow', { s: 'conveyor' }), angles: ['dessus', 'trois-quarts'], mesure: ['narrow', 'marquages'] },
    { groupe: 'Marquages hors de la route (F5)', titre: 'Route étroite qui monte, aimant', tiles: one('nslU1', { s: 'magnet' }), angles: ['dessus', 'trois-quarts'], mesure: ['nslU1', 'marquages'] },
    { groupe: 'Témoins (sans défaut mesuré)', titre: 'Ligne droite au mur gauche, niveau 2', tiles: one('straight', { o: 1 }, 2), angles: ['trois-quarts', 'côté'] },
    { groupe: 'Témoins (sans défaut mesuré)', titre: 'Virage relevé (dévers), niveau 3', tiles: one('bank', {}, 3), angles: ['trois-quarts', 'ras du sol'] },
  ],
};

// ---- Sélections de la phase 2 (générées) --------------------------------------------------------------------------------------
const FAM_REPS = ['straight', 'curve', 'bigcurve', 'hugecurve', 'cv2', 'cvBig2', 'slope', 'steep4', 'crv2', 'cds2', 'gentle', 'sbend', 'sbendWide', 'narrow', 'narrowIn',
  'wideIn', 'wide', 'wslU2', 'nslU2', 'ncv2', 'wcv2', 'checkpoint', 'cpCurve', 'start', 'finish', 'fork', 'forkL', 'platform', 'ring'];
const isRibbonOrSpecial = (t) => ['ribbon', 'loop', 'area', 'fork', 'ring', 'sbend', 'junction'].includes(PIECES[t].kind);
function piecesPreset() {
  const ids = [...new Set(FAM_REPS.filter((t) => PIECES[t]).concat(pieceCases().filter((c) => c.orient === 'sol' && isRibbonOrSpecial(c.t)).map((c) => c.t)))];
  return ids.map((t) => {
    const c = pieceCases({ ids: [t] }).find((x) => x.orient === 'sol');
    const tile = Track.normalize({ ...c.tile, l: Math.max(c.tile.l, PIECES[t].kind === 'ribbon' || PIECES[t].kind === 'loop' ? 0 : 1) });
    return { groupe: PIECES[t].kind, titre: `${PIECES[t].label} (${t})`, tiles: [Track.inBounds(tile) ? tile : c.tile], angles: ['trois-quarts'] };
  });
}
function orientationsPreset() {
  const ids = ['straight', 'curve', 'bigcurve', 'cv2', 'slope', 'cvBig2', 'checkpoint', 'loop', 'bank', 'sbend'];
  const out = [];
  for (const t of ids) for (const c of pieceCases({ ids: [t] })) if (c.orient !== 'sol') out.push({ groupe: t, titre: `${PIECES[t].label} · ${orientLabel(c.orient)}`, tiles: [c.tile], angles: ['trois-quarts'] });
  return out;
}
function revetementsPreset() {
  const out = [];
  for (const v of surfaceVariants()) for (const [t, extra] of [['straight', {}], ['curve', {}], ['straight', { v: 1 }], ['sbend', {}]]) {
    const tile = Track.normalize({ t, x: 0, z: 0, l: extra.v ? 2 : 0, r: 0, ...extra, ...v });
    if (tile.s !== v.s || (extra.v && !tile.v)) continue;
    out.push({ groupe: SURFACES[v.s].label, titre: `${SURFACES[v.s].label}${v.p ? ' ' + v.p + ' %' : ''} · ${PIECES[t].label}${extra.v ? ' au plafond' : ''}`, tiles: [tile], angles: [extra.v ? 'ras du sol' : 'trois-quarts'] });
  }
  return out;
}
// Petite vitrine (route, pente, virage, looping, décors) pour comparer thèmes, ambiances et profils de qualité.
const vitrine = () => [
  Track.normalize({ t: 'start', x: 0, z: 0, l: 0, r: 0 }), Track.normalize({ t: 'straight', x: 0, z: -1, l: 0, r: 0, s: 'boost' }),
  Track.normalize({ t: 'slope', x: 0, z: -2, l: 0, r: 0 }), Track.normalize({ t: 'curve', x: 0, z: -3, l: 1, r: 0 }),
  Track.normalize({ t: 'loop', x: 2, z: -2, l: 0, r: 0 }), Track.normalize({ t: 'straight', x: -1, z: -3, l: 1, r: 1, s: 'water' }),
];
const vitrineDecos = [{ k: 'tree', x: 70, y: 0, z: -10, s: 1.4 }, { k: 'rock', x: -20, y: 0, z: 10, s: 1.2 }, { k: 'lamp', x: 34, y: 0, z: -20, s: 1 }];
const VIEW = { 'vitrine': (b) => ({ eye: [b.c[0] + 0.55 * b.s, b.c[1] + 0.35 * b.s, b.c[2] + 0.75 * b.s], at: b.c }) };
Object.assign(ANGLES, VIEW);
function themesPreset() {
  const out = [];
  for (const decor of ['desert', 'polar', 'jungle', 'city', 'volcano', 'orbit', 'caves', 'sky', 'reef', 'factory', 'atelier', 'isles']) out.push({ groupe: 'Thèmes', titre: decor, decor, tiles: vitrine(), decos: vitrineDecos, angles: ['vitrine'] });
  for (const sky of ['dawn', 'day', 'sunset', 'night']) out.push({ groupe: 'Ciels', titre: sky, decor: 'jungle', ambiance: { sky }, tiles: vitrine(), decos: vitrineDecos, angles: ['vitrine'] });
  for (const fog of ['clear', 'misty', 'thick']) out.push({ groupe: 'Brouillard', titre: fog, decor: 'city', ambiance: { fog }, tiles: vitrine(), decos: vitrineDecos, angles: ['vitrine'] });
  for (const weather of ['rain', 'snow', 'embers']) out.push({ groupe: 'Météo', titre: weather, decor: 'polar', ambiance: { weather }, tiles: vitrine(), decos: vitrineDecos, angles: [['vitrine', 2000]] });
  for (const quality of ['ultra', 'high', 'medium', 'low', 'potato', 'ultrapotato']) out.push({ groupe: 'Qualité', titre: quality, quality, decor: 'desert', tiles: vitrine(), decos: vitrineDecos, angles: ['vitrine'] });
  return out;
}
function decorsPreset() {
  const flagged = ['roofFlat', 'shard', 'cloud', 'balloon', 'airship', 'fishSchool', 'jellyfish', 'satellite', 'asteroid', 'lanternHang', 'helicopter', 'sailboat', 'sleigh', 'ghost', 'bats', 'skull', 'buoy',
    'heartBig', 'cupidArrow', 'confettiCannon', 'discoBall', 'redLantern', 'bell', 'hangingGhost', 'broom', 'eggBasket', 'shipWreck', 'zenStone', 'macaron'];
  const reps = Object.values(DECO_CATS).map((c) => c.kinds[0]);
  return [...new Set(flagged.concat(reps))].map((k) => ({ groupe: flagged.includes(k) ? 'Décors signalés par la sonde' : 'Un décor par catégorie', titre: k,
    tiles: [Track.normalize({ t: 'straight', x: 0, z: 0, l: 0, r: 0 })], decos: [{ k, x: 40, y: 0, z: 16, s: 1 }], focus: null, angles: ['ras du sol'] }));
}
// Mêmes scènes photographiées avant et après les corrections (rapport de l'audit).
const T = (t, extra = {}, l = 0) => [Track.normalize({ t, x: 0, z: 0, l, r: 0, ...extra })];
PRESETS.avantapres = [
  { groupe: 'Poteaux', titre: 'Courbe raide qui monte (crs4), niveau 3', tiles: T('crs4', {}, 3), focus: 'poteau', angles: ['gros plan'] },
  { groupe: 'Poteaux', titre: 'Virage qui monte de 4 niveaux (cv4), niveau 3', tiles: T('cv4', {}, 3), focus: 'poteau', angles: ['gros plan'] },
  { groupe: 'Poteaux', titre: 'Plaque triangle, niveau 1', tiles: T('tri1', {}, 1), angles: ['trois-quarts'] },
  { groupe: 'Tapis roulant', titre: 'Tapis qui avance (+160 km/h)', tiles: T('straight', { s: 'conveyor', p: 181 }), angles: ['dessus'] },
  { groupe: 'Tapis roulant', titre: 'Tapis à l’arrêt (0 km/h)', tiles: T('straight', { s: 'conveyor', p: 101 }), angles: ['dessus'] },
  { groupe: 'Marquages', titre: 'Route étroite, tapis roulant', tiles: T('narrow', { s: 'conveyor' }), angles: ['dessus'] },
  { groupe: 'Marquages', titre: 'Route large, aimant', tiles: T('wide', { s: 'magnet' }), angles: ['dessus'] },
  { groupe: 'Marquages', titre: 'Vent dans un virage serré', tiles: T('curve', { s: 'wind' }), angles: ['dessus'] },
  { groupe: 'Sous le terrain', titre: 'Vrille, niveau 0', tiles: T('twist'), focus: 'creux', angles: ['gros plan, ras du sol'] },
  { groupe: 'Sous le terrain', titre: 'Looping double, niveau 0', tiles: T('loopDouble'), focus: 'creux', angles: ['gros plan, ras du sol'] },
  { groupe: 'Supports', titre: 'Virage relevé, niveau 3', tiles: T('bank', {}, 3), angles: ['ras du sol'] },
  { groupe: 'Supports', titre: 'Tube, niveau 2', tiles: T('tube', {}, 2), angles: ['ras du sol'] },
  { groupe: 'Supports', titre: 'Tire-bouchon, niveau 2', tiles: T('cork', {}, 2), angles: ['ras du sol'] },
  { groupe: 'Météo', titre: 'Pluie dans un tunnel', decor: 'polar', ambiance: { weather: 'rain' }, tiles: [...T('straight', { tn: 1 }), Track.normalize({ t: 'straight', x: 0, z: -1, l: 0, r: 0, tn: 1 })], angles: [['dedans', 1500]] },
];

Object.assign(PRESETS, { pieces: piecesPreset(), orientations: orientationsPreset(), revetements: revetementsPreset(), themes: themesPreset(), decors: decorsPreset() });

// Point à examiner de près (pièce non tournée : monde = centre + local) : le poteau dont le chapeau dépasse le plus, ou le point le plus bas de la chaussée.
function focusOf(kind, tile) {
  const ctr = tileCenter(tile), S = {};
  if (kind === 'poteau') {
    let best = null, worst = -Infinity;
    for (const P of pillarSpecs(tile)) {
      for (const dx of [-2, 2]) for (const dz of [-2, 2]) {
        sampleLocal(tile, P.lx + dx, P.lz + dz, S);
        const poke = P.top - (S.h - SLAB_T);
        if (poke > worst) { worst = poke; best = [ctr.x + P.lx + dx, P.top, ctr.z + P.lz + dz]; }
      }
    }
    return best;
  }
  if (kind === 'creux') {
    const rib = ribbonOf(tile), F = {};
    let best = null;
    for (let i = 0; i <= 200; i++) {
      frameLocal(rib, i / 200, F);
      for (const sg of [-1, 1]) {
        const w = sg * (F.hw || 12), y = F.py + F.ry * w;
        if (!best || y < best[1]) best = [ctr.x + F.px + F.rx * w, y, ctr.z + F.pz + F.rz * w];
      }
    }
    return best;
  }
  return null;
}

// Constats des sondes pour une pièce (rappelés sous ses images).
function measures(spec) {
  if (!spec) return [];
  const [t, sonde, p] = spec;
  const out = [];
  SONDES[sonde](pieceCases({ ids: [t] }), out, {});
  return out.filter((f) => f.orient === 'sol' && (p == null || f.valeur === p)).map((f) => f.msg);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function capture(preset, outDir) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { throw new Error('playwright introuvable'); }
  const PORT = 9100 + Math.floor(Math.random() * 400);
  const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
    await page.goto(`http://127.0.0.1:${PORT}/tools/audit-rendu/banc.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.bancReady, null, { timeout: 30000 });
    mkdirSync(join(outDir, 'img'), { recursive: true });
    const rows = [];
    let n = 0;
    for (const [i, c] of PRESETS[preset].entries()) {
      const box = await page.evaluate(([tiles, o]) => window.banc.load(tiles, o), [c.tiles, { decor: c.decor || 'desert', ambiance: c.ambiance || null, quality: c.quality || 'high', decos: c.decos || [] }]);
      const b = { min: box.min, max: box.max, c: box.min.map((v, k) => (v + box.max[k]) / 2) };
      b.s = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2], 24);
      b.f = (c.focus && focusOf(c.focus, c.tiles[0])) || b.c;
      const shots = [];
      for (const a of c.angles) {
        const [name, t] = Array.isArray(a) ? a : [a, 0];
        const cam = ANGLES[name](b);
        const url = await page.evaluate((o) => window.banc.shoot(o), { ...cam, t, w: 640, h: 360 });
        const file = `img/${String(i).padStart(3, '0')}-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/gi, '-')}${t ? '-' + t : ''}.jpg`;
        writeFileSync(join(outDir, file), Buffer.from(url.split(',')[1], 'base64'));
        shots.push({ file, label: name + (Array.isArray(a) ? ` · ${t} ms` : '') });
        n++;
      }
      rows.push({ ...c, shots, mesures: measures(c.mesure) });
    }
    writeFileSync(join(outDir, 'planche.html'), planche(preset, rows));
    writeFileSync(join(outDir, 'planche.json'), JSON.stringify(rows.map(({ tiles, ...r }) => ({ ...r, tiles: tiles.map((t) => ({ t: t.t, l: t.l, o: t.o, v: t.v, s: t.s, p: t.p })) })), null, 1));
    return { images: n, cases: rows.length, errors };
  } finally {
    await browser.close();
    server.kill();
  }
}

// Planche autonome (images à côté, dans img/) : un bloc par groupe, une ligne par cas.
function planche(preset, rows) {
  const groups = [...new Set(rows.map((r) => r.groupe))];
  const body = groups.map((g) => `<h2>${esc(g)}</h2>` + rows.filter((r) => r.groupe === g).map((r) => `
<section><h3>${esc(r.titre)}</h3>
<p class="meta">${r.tiles.map((t) => `${esc(PIECES[t.t].label)} · ${orientLabel(t.v ? 'plafond' : t.o ? 'o' + t.o : 'sol')} · niveau ${t.l}${t.s ? ' · ' + esc(SURFACES[t.s].label) + (t.p ? ' ' + t.p + ' %' : '') : ''}`).join(' ; ')}</p>
${r.mesures.length ? `<ul class="m">${[...new Set(r.mesures)].map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
<div class="shots">${r.shots.map((s) => `<figure><img src="${s.file}" alt="${esc(r.titre + ', ' + s.label)}" loading="lazy"><figcaption>${esc(s.label)}</figcaption></figure>`).join('')}</div></section>`).join('')).join('');
  return `<!doctype html><meta charset="utf-8"><title>Planche ${esc(preset)}</title>
<style>body{font:14px system-ui;margin:16px;background:#15171c;color:#eceef3}h2{margin:28px 0 8px}section{margin:12px 0 22px}h3{margin:0 0 2px}.meta{color:#a2a8b6;margin:0 0 6px}.m{color:#ff8a7a;margin:0 0 8px}.shots{display:flex;flex-wrap:wrap;gap:8px}figure{margin:0}img{width:320px;max-width:100%;display:block;border-radius:4px}figcaption{color:#a2a8b6;font-size:12px}</style>
<h1>Planche « ${esc(preset)} »</h1>${body}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1];
  const preset = arg('preset') || 'echantillon';
  if (!PRESETS[preset]) { console.error('sélection inconnue : ' + preset + ' (' + Object.keys(PRESETS).join(', ') + ')'); process.exit(1); }
  const out = arg('out') || join(here, 'sortie', preset);
  const t0 = Date.now();
  const r = await capture(preset, out);
  console.log(`${r.cases} cas, ${r.images} images en ${((Date.now() - t0) / 1000).toFixed(0)} s → ${join(out, 'planche.html')}`);
  if (r.errors.length) { console.log('erreurs de la page :\n  ' + r.errors.join('\n  ')); process.exitCode = 1; }
}
