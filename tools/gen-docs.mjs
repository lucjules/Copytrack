// Génère docs/MODULES.md : l'index de tous les modules du jeu (js/), avec leur rôle (la première phrase du commentaire de tête de chaque fichier).
//   node tools/gen-docs.mjs            réécrit docs/MODULES.md      (npm run docs)
//   node tools/gen-docs.mjs --check    échoue si le fichier n'est pas à jour (tools/check-docs.mjs l'appelle)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs/MODULES.md');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') out.push(...walk(p)); } else if (/\.(js|ts)$/.test(e.name) && e.name !== 'index.ts') out.push(p);
  }
  return out;
}

// Première phrase du commentaire de tête (jusqu'au premier point en fin de ligne, au plus quatre lignes).
export function roleOf(text) {
  const lines = text.split('\n');
  const parts = [];
  for (const l of lines) {
    const m = /^\s*\/\/ ?(.*)$/.exec(l);
    if (!m) break;
    if (!m[1].trim()) { if (parts.length) break; continue; }
    parts.push(m[1].trim());
    if (/[.!?]$|[.!?] \(/.test(parts[parts.length - 1]) || parts.length >= 4) break;
  }
  return parts.join(' ').replace(/\|/g, '\\|');
}

export function buildIndex() {
  const files = [...walk(join(root, 'js')), ...walk(join(root, 'supabase/functions'))].map((f) => relative(root, f).split('\\').join('/')).sort((a, b) => {
    const da = dirname(a), db = dirname(b);
    return da === db ? a.localeCompare(b) : da === 'js' ? -1 : db === 'js' ? 1 : da.localeCompare(db);
  });
  const missing = [];
  const out = ['# Index des modules', '',
    '*Fichier généré par `npm run docs` (`tools/gen-docs.mjs`) : ne pas le modifier à la main. Le rôle de chaque module est la première phrase du commentaire de tête du fichier.*',
    'La vue d\'ensemble (principes, déterminisme, flux d\'une course) est dans [ARCHITECTURE.md](ARCHITECTURE.md).', ''];
  let dir = null;
  for (const f of files) {
    const d = dirname(f);
    if (d !== dir) { dir = d; out.push('', `## \`${d}/\``, '', '| Fichier | Rôle |', '| --- | --- |'); }
    const text = readFileSync(join(root, f), 'utf8');
    const role = roleOf(text);
    if (!role) missing.push(f);
    out.push(`| \`${f.slice(d.length + 1)}\` | ${role || '**à documenter**'} |`);
  }
  return { text: out.join('\n') + '\n', missing };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { text, missing } = buildIndex();
  if (process.argv.includes('--check')) {
    if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== text) { console.log('FAIL docs/MODULES.md n\'est pas à jour : npm run docs'); process.exit(1); }
    console.log('  ok   docs/MODULES.md est à jour');
  } else {
    writeFileSync(OUT, text);
    console.log(`docs/MODULES.md : ${text.split('\n').length} lignes` + (missing.length ? `  (sans commentaire de tête : ${missing.join(', ')})` : ''));
  }
}
