// Documentation : cohérente avec le code : node tools/check-docs.mjs   (npm test)
//  - docs/MODULES.md est l'index à jour des modules (npm run docs), et chaque module a un commentaire de tête ;
//  - tous les liens relatifs des fichiers Markdown pointent vers un fichier qui existe ;
//  - la version du README, de package.json, de js/version.js et du dernier titre de CHANGELOG.md concordent ;
//  - docs/ARCHITECTURE.md parle de chaque dossier de js/ ; les `npm run …` cités existent dans package.json.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, finish } from './harness.mjs';
import { buildIndex } from './gen-docs.mjs';
import { VERSION } from '../js/version.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const markdown = ['README.md', 'CHANGELOG.md', ...readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f),
  ...readdirSync(join(root, 'supabase')).filter((f) => f.endsWith('.md')).map((f) => 'supabase/' + f)];

console.log('Index des modules');
test('docs/MODULES.md est à jour (npm run docs) et chaque module a un commentaire de tête', () => {
  const { text, missing } = buildIndex();
  assert.deepEqual(missing, [], 'modules sans commentaire de tête');
  assert.equal(read('docs/MODULES.md'), text, 'docs/MODULES.md n\'est pas à jour : npm run docs');
});

console.log('Liens et versions');
test('les liens relatifs des fichiers Markdown pointent vers des fichiers qui existent', () => {
  const broken = [];
  for (const f of markdown) {
    const text = read(f).replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      if (!existsSync(resolve(root, dirname(f), target))) broken.push(`${f} -> ${m[1]}`);
    }
  }
  assert.deepEqual(broken, []);
});
test('la version concorde : js/version.js, package.json, README, dernier titre du CHANGELOG', () => {
  const v = /bêta (\d+\.\d+\.\d+)/.exec(VERSION);
  assert.ok(v, 'VERSION doit s\'écrire « bêta X.Y.Z » : ' + VERSION);
  assert.equal(JSON.parse(read('package.json')).version, v[1], 'package.json');
  assert.ok(read('README.md').includes(`**bêta ${v[1]}**`), 'README : « Version actuelle : **bêta ' + v[1] + '** »');
  const top = /^## Bêta (\d+\.\d+\.\d+)/m.exec(read('CHANGELOG.md'));
  assert.equal(top && top[1], v[1], 'le premier titre de CHANGELOG.md doit être la version actuelle');
});

console.log('Architecture');
test('ARCHITECTURE.md parle de chaque dossier de js/ ; README y renvoie', () => {
  const dirs = readdirSync(join(root, 'js')).filter((d) => d !== 'vendor' && statSync(join(root, 'js', d)).isDirectory());
  const arch = read('docs/ARCHITECTURE.md');
  assert.deepEqual(dirs.filter((d) => !arch.includes(`${d}/`)), [], 'dossiers de js/ absents de docs/ARCHITECTURE.md');
  assert.ok(read('README.md').includes('docs/ARCHITECTURE.md'));
});
test('les commandes « npm run … » citées dans le README et ARCHITECTURE.md existent', () => {
  const scripts = Object.keys(JSON.parse(read('package.json')).scripts);
  const cited = new Set();
  for (const f of ['README.md', 'docs/ARCHITECTURE.md']) for (const m of read(f).matchAll(/npm run ([\w:-]+)/g)) cited.add(m[1]);
  assert.deepEqual([...cited].filter((s) => !scripts.includes(s)), []);
});

await finish('La documentation est cohérente avec le code.');
