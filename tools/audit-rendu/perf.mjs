// Audit du rendu (phase 3) : coût de rendu des circuits officiels dans le banc (vrai moteur, qualité Haute) : temps de construction, appels de dessin et
// triangles vus de haut, coût d'une modification dans l'éditeur, et mémoire après avoir chargé tous les circuits l'un après l'autre (fuites).
//   node tools/audit-rendu/perf.mjs [--max=N] [--json=fichier]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { BUILTIN_TRACKS, buildBuiltin } from '../../js/tracks.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1];
const MAX = +(arg('max') || 999), JSON_OUT = arg('json');
const { chromium } = require('playwright');
const PORT = 9900 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/tools/audit-rendu/banc.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.bancReady, null, { timeout: 30000 });
  const defs = BUILTIN_TRACKS.slice(0, MAX);
  let mem0 = null;
  for (const [i, def] of [...defs.entries(), [defs.length, defs[0]]]) {
    const tr = buildBuiltin(def);
    const r = await page.evaluate(([tiles, decos, decor]) => {
      const box = window.banc.load(tiles, { decor, decos });
      const c = box.min.map((v, k) => (v + box.max[k]) / 2), s = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2], 50);
      window.banc.shoot({ eye: [c[0] + 0.3 * s, c[1] + 0.9 * s, c[2] + 0.6 * s], at: c, w: 640, h: 360 });
      const info = window.banc.info();
      window.banc.shoot({ eye: [c[0], c[1] + 12, c[2]], at: [c[0] + 50, c[1], c[2]], w: 640, h: 360 });
      const near = window.banc.info();
      return { build: box.ms, calls: info.calls, tris: info.tris, nearCalls: near.calls, nearTris: near.tris, geometries: info.geometries, textures: info.textures, edit: window.banc.rebuildCost() };
    }, [tr.tiles, tr.decos, tr.decor]);
    const row = { name: def.name, tiles: tr.tiles.length, decos: tr.decos.length, ...r };
    if (i === 0) mem0 = { g: r.geometries, t: r.textures };
    rows.push(row);
    console.log(`${String(i).padStart(2)} ${String(def.name).padEnd(28)} ${String(row.tiles).padStart(4)} pièces ${String(row.decos).padStart(4)} décors · construit en ${row.build.toFixed(0)} ms · ${row.calls} appels, ${(row.tris / 1000).toFixed(0)} k triangles (vue d'ensemble) · modif ${row.edit ? row.edit.ms.toFixed(0) + ' ms' : '-'} · mémoire ${row.geometries} géométries`);
  }
  const last = rows[rows.length - 1];
  console.log(`\nmémoire : premier chargement ${mem0.g} géométries / ${mem0.t} textures ; même circuit rechargé après les ${defs.length} autres : ${last.geometries} / ${last.textures}`);
} finally {
  await browser.close();
  server.kill();
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
