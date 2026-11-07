// Génère supabase/functions/<fonction>/index.ts pour chaque fonction serveur (submit-score, ice) : un fichier AUTONOME (aucun import),
// car Supabase refuse d'importer du code depuis un site quelconque au déploiement.
// Regroupe server.ts + le code du jeu nécessaire (pour submit-score : js/verify.js et ses dépendances).
// Utilise Deno (installé à la demande via npm) : node tools/build-function.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = {
  'submit-score': '« submit-score »',
  ice: '« ice » (serveurs STUN/TURN du multijoueur)',
};
for (const [name, title] of Object.entries(FUNCTIONS)) {
  const dir = join(root, 'supabase/functions', name);
  const out = join(mkdtempSync(join(tmpdir(), 'ct-fn-')), 'bundle.js');
  execFileSync('npx', ['--yes', 'deno@2.9.6', 'bundle', '--format', 'esm', join(dir, 'server.ts'), '-o', out], { stdio: 'inherit', cwd: root });
  const code = readFileSync(out, 'utf8');
  if (/^\s*import\s/m.test(code)) throw new Error(`Le fichier regroupé (${name}) contient encore un import.`);
  const header = `// Copytrack : fonction serveur ${title} (Supabase Edge Function).
// FICHIER GÉNÉRÉ par tools/build-function.mjs à partir de server.ts et du code du jeu :
// ne pas modifier à la main. À coller tel quel dans Supabase (Edge Functions).
// deno-lint-ignore-file
// @ts-nocheck
`;
  writeFileSync(join(dir, 'index.ts'), header + code);
  console.log(`${name}/index.ts : ${(code.length / 1024).toFixed(0)} Ko, aucun import`);
}
