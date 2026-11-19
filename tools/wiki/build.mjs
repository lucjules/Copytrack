// Wiki du jeu (wiki/index.html) : régénéré à partir du code par `npm run wiki`. Le modèle (tools/wiki/modele.html) porte les textes et la mise en page ;
// ce script y verse les données tirées du jeu : les 72 circuits (profil, médailles, objectif, résumé, nouveautés, difficulté), leurs cartes vues du dessus
// (chemin du pilote de référence), les pièces et leurs icônes de l'éditeur (js/editor/palette.js), les revêtements, les obstacles, les décorations, les versions
// du CHANGELOG. Les captures d'écran de wiki/img/ se refont à part, avec le jeu servi en local : node tools/wiki/shots.mjs (Playwright).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_TRACKS, buildBuiltin } from '../../js/tracks.js';
import { CHAPTERS, PROFILS, GOALS, goalLabel } from '../../js/career.js';
import * as pieces from '../../js/pieces.js';
import * as constants from '../../js/constants.js';
import { FAMILIES, FAMILY_ORDER } from '../../js/families.js';
import { OBST } from '../../js/obstacles.js';
import { DECO_ORDER, DECO_CATS, DECO_LABELS } from '../../js/decoData.js';
import { estimateDifficulty } from '../../js/difficulty.js';
import { RaceLogic } from '../../js/raceLogic.js';
import { VERSION, PHYS_VER, GAME_NAME } from '../../js/version.js';
import { newElements } from '../nouveautes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const { PIECES, PIECE_ORDER, SURFACES, SURFACE_ORDER } = pieces;

export function buildWikiPage() {
  // ---- Circuits ------------------------------------------------------------------------------------------------------------------------------
  const golden = JSON.parse(read('tools/golden-temps.json'));
  const timeOf = (id) => (typeof golden[id] === 'number' ? golden[id] : golden.tracks && golden.tracks[id]);
  const chapters = CHAPTERS.map((c) => ({
    name: c.name, decor: c.decor, desc: c.desc, bonus: !!c.bonus,
    tracks: BUILTIN_TRACKS.filter((d) => d.decor === c.decor).map((d) => {
      const tr = buildBuiltin(d), N = newElements(tr);
      return { id: d.id, name: d.name, profil: d.profil, diff: d.difficulty, time: timeOf(d.id), medals: d.medals, goal: goalLabel(d.goal), appris: d.appris, laps: d.laps || 1,
        stars: estimateDifficulty(tr).stars, nouveautes: N.length, familles: [...new Set(N.map((e) => e.family))], tiles: tr.tiles.length };
    }),
  }));

  // ---- Cartes vues du dessus (chemin d'un tour, normalisé dans 0..100) -----------------------------------------------------------------------------
  const maps = {};
  for (const d of BUILTIN_TRACKS) {
    const tr = buildBuiltin(d), n = d.laps > 1 ? Math.floor(tr.path.length / d.laps) : tr.path.length, pts = tr.path.slice(0, n);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, len = 0;
    pts.forEach((p, i) => {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]);
      if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
    });
    const s = 92 / Math.max(x1 - x0, z1 - z0, 1), ox = (100 - (x1 - x0) * s) / 2, oz = (100 - (z1 - z0) * s) / 2;
    const f = (x, z) => [+(ox + (x - x0) * s).toFixed(1), +(oz + (z - z0) * s).toFixed(1)];
    const step = Math.max(1, Math.floor(pts.length / 220)), q = [];
    for (let i = 0; i < pts.length; i += step) q.push(f(pts[i][0], pts[i][2]));
    q.push(f(pts[pts.length - 1][0], pts[pts.length - 1][2]));
    const cps = new RaceLogic(tr).cps.map((c) => { const p = c.pos || c.p || c; return p && p.x != null ? f(p.x, p.z) : null; }).filter(Boolean);
    maps[d.id] = { d: 'M' + q.map((p) => p.join(' ')).join('L'), a: q[0], b: q[q.length - 1], cps, km: +(len / 1000).toFixed(2) };
  }

  // ---- Icônes de la palette de l'éditeur : l'objet ICONS de js/editor/palette.js, évalué sans le reste du module (qui a besoin du DOM) ----------------
  const src = read('js/editor/palette.js').split('\n');
  const start = src.findIndex((l) => l.startsWith('const WIND_DIRS'));
  const open = src.findIndex((l, i) => i > start && l.startsWith('const ICONS = {'));
  const close = src.findIndex((l, i) => i > open && l === '};');
  if (start < 0 || open < 0 || close < 0) throw new Error('js/editor/palette.js : objet ICONS introuvable (le wiki lit ses icônes)');
  const env = { ...pieces, ...constants, keyLabel: (k) => k, esc: (t) => t, DECO_ICONS: {}, THEME_SWATCH: {}, tint: (c) => c };
  const icons = new Function(...Object.keys(env), src.slice(start, close + 1).join('\n') + '\nreturn ICONS;')(...Object.values(env));

  // ---- Le reste ----------------------------------------------------------------------------------------------------------------------------------
  const data = {
    version: VERSION, phys: PHYS_VER, chapters, profils: PROFILS, goals: Object.keys(GOALS),
    families: FAMILY_ORDER.map((k) => ({ id: k, label: FAMILIES[k].label, hint: FAMILIES[k].hint, members: Object.keys(FAMILIES[k].members).length, traits: (FAMILIES[k].traits || []).map((t) => t.label) })),
    pieceList: PIECE_ORDER.filter((id) => PIECES[id]).map((id) => ({ id, label: PIECES[id].label || id, kind: PIECES[id].kind || 'autre', size: PIECES[id].size || 1 })),
    surfaces: SURFACE_ORDER.filter(Boolean).map((k) => ({ id: k, label: SURFACES[k].label, param: SURFACES[k].param || null, color: (SURFACES[k].c || [])[1] || null })),
    obstacles: Object.entries(OBST).map(([k, o]) => ({ id: k, label: o.label, period: o.period })),
    decoCats: Object.entries(DECO_CATS).map(([k, c]) => ({ id: k, label: c.label, items: c.kinds.map((x) => DECO_LABELS[x] || x) })),
    counts: { pieces: PIECE_ORDER.length, decos: DECO_ORDER.length, surfaces: SURFACE_ORDER.filter(Boolean).length, tracks: BUILTIN_TRACKS.length },
  };
  const versions = read('CHANGELOG.md').split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());

  // ---- Page ------------------------------------------------------------------------------------------------------------------------------------------
  // Les données vont dans des <script type="application/json"> : « </ » y est échappé (sinon « </script> » fermerait la balise).
  const json = (o) => JSON.stringify(o).replace(/<\//g, '<\\/');
  const vNum = VERSION.replace(/^bêta /, '');
  const body = read('tools/wiki/modele.html')
    .replace('__DATA__', () => json(data)).replace('__MAPS__', () => json(maps)).replace('__ICONS__', () => json(icons)).replace('__VERS__', () => json(versions))
    .replace(/__NAME__/g, GAME_NAME).replace(/__VERSION__/g, vNum).replace(/__PHYS__/g, String(PHYS_VER)).replace(/__NVERS__/g, String(versions.length));
  const missing = [...new Set([...body.matchAll(/img\/([a-z0-9-]+)\.jpg/g), ...body.matchAll(/'(course-[a-z-]+)'/g)].map((m) => m[1]))].filter((n) => !existsSync(join(root, 'wiki/img', n + '.jpg')));
  if (missing.length) throw new Error('images absentes de wiki/img : ' + missing.join(', ') + ' (node tools/wiki/shots.mjs)');
  // Le modèle est écrit pour être aussi publié tel quel (sans <html> ni <head>) : on l'entoure ici d'un document complet, avec le retour au jeu.
  const head = body.slice(0, body.indexOf('<div class="layout">'));
  const rest = body.slice(body.indexOf('<div class="layout">')).replace('<p class="ver">', '<a class="back" href="../">← Retour au jeu</a>\n  <p class="ver">');
  const page = `<!doctype html>
  <!-- Généré par tools/wiki/build.mjs (npm run wiki) à partir du code du jeu : ne pas modifier à la main, changer tools/wiki/modele.html. -->
  <html lang="fr">
  <head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}.back{display:inline-block;margin:0 0 6px 38px;font-size:.85rem}</style>
  ${head.trim()}
  </head>
  <body>
  ${rest.trim()}
  </body>
  </html>
  `;
  return { page, info: `${Math.round(page.length / 1024)} Ko, ${data.chapters.reduce((a, c) => a + c.tracks.length, 0)} circuits, ${Object.keys(icons).length} icônes, ${versions.length} versions` };
}

if (process.argv[1] && /[\\/]wiki[\\/]build\.mjs$/.test(process.argv[1])) {
  const { page, info } = buildWikiPage();
  writeFileSync(join(root, 'wiki/index.html'), page);
  console.log('wiki/index.html : ' + info);
}
