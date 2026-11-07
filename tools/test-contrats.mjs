// Contrats entre modules : ce que l'inspecteur attend de l'éditeur, et ce que l'application attend de ses sessions : node tools/test-contrats.mjs   (npm test)
// Ces appels passent par des noms de méthode : une méthode renommée ou déplacée casserait l'écran sans qu'aucun test d'éditeur ne s'en aperçoive.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, finish } from './harness.mjs';

globalThis.document = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) };
const { EditorSession } = await import('../js/editor.js');
const { Inspector } = await import('../js/inspector.js');
const { GarageSession } = await import('../js/garage.js');
const { RaceSession } = await import('../js/race.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (dir, main) => [main, ...readdirSync(join(root, dir)).map((f) => `${dir}/${f}`)].map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
const inspectorSrc = source('js/inspector', 'js/inspector.js');
const appSrc = source('js/app', 'js/main.js');

console.log('Inspecteur -> éditeur');
test('chaque méthode de l\'éditeur que l\'inspecteur appelle (ed.xxx(…)) existe sur EditorSession', () => {
  const called = new Set([...inspectorSrc.matchAll(/\bed\.([A-Za-z_]\w*)\(/g)].map((m) => m[1]));
  assert.ok(called.size >= 8, 'le contrat n\'a pas été lu : ' + [...called]);
  const missing = [...called].filter((n) => typeof EditorSession.prototype[n] !== 'function');
  assert.deepEqual(missing, [], 'l\'inspecteur appelle des méthodes absentes de l\'éditeur');
});
test('chaque propriété de l\'éditeur que l\'inspecteur lit est définie par le constructeur ou une méthode', () => {
  const ctor = readFileSync(join(root, 'js/editor.js'), 'utf8');
  const props = new Set([...inspectorSrc.matchAll(/\bed\.([A-Za-z_]\w*)\b(?!\()/g)].map((m) => m[1]));
  const unknown = [...props].filter((n) => typeof EditorSession.prototype[n] !== 'function' && !new RegExp(`this\\.${n}\\b`).test(source('js/editor', 'js/editor.js')) && !ctor.includes(`.${n} =`));
  assert.deepEqual(unknown, [], 'propriétés de l\'éditeur lues par l\'inspecteur mais jamais définies');
});

console.log('Application -> sessions');
test('chaque méthode de session que l\'application appelle existe (this.session.xxx(…), s.xxx(…))', () => {
  const sessions = { editor: EditorSession.prototype, garage: GarageSession.prototype, race: RaceSession.prototype };
  const known = new Set(Object.values(sessions).flatMap((p) => Object.getOwnPropertyNames(p)));
  const called = new Set([...appSrc.matchAll(/\b(?:this\.session|this\._session)\.([A-Za-z_]\w*)\(/g)].map((m) => m[1]));
  assert.ok(called.size >= 3, 'contrat non lu : ' + [...called]);
  assert.deepEqual([...called].filter((n) => !known.has(n)), []);
});
test('les sessions se reconnaissent par `kind` (l\'éditeur est chargé à la demande, pas d\'instanceof)', () => {
  assert.ok(/this\.kind = 'editor'/.test(readFileSync(join(root, 'js/editor.js'), 'utf8')));
  assert.ok(!/instanceof EditorSession/.test(appSrc), 'l\'application ne doit pas importer l\'éditeur statiquement');
  assert.ok(!/from '\.\.?\/editor\.js'/.test(appSrc.replace(/await import\([^)]*\)/g, '')), 'import statique de editor.js dans main.js ou app/');
});
test('les familles de méthodes d\'une classe ne se marchent pas dessus (aucun nom défini deux fois)', async () => {
  const groups = [
    ['EditorSession', EditorSession, 'js/editor'], ['Inspector', Inspector, 'js/inspector'], ['RaceSession', RaceSession, 'js/race'],
  ];
  groups.push(['App', null, 'js/app']);       // (main.js démarre le jeu dès qu'on l'importe : on ne lit ici que ses fichiers)
  for (const [name, cls, dir] of groups) {
    const seen = new Map();
    for (const f of readdirSync(join(root, dir)).filter((x) => x !== 'shared.js')) {
      const text = readFileSync(join(root, dir, f), 'utf8');
      for (const m of text.matchAll(/^ {2}(?:async )?([A-Za-z_]\w*)\(.*\) \{$/gm)) {
        assert.ok(!seen.has(m[1]), `${name} : « ${m[1]} » défini dans ${seen.get(m[1])} et ${f}`);
        seen.set(m[1], f);
      }
    }
    assert.ok(seen.size > 5, name + ' : familles non lues');
    if (cls) for (const n of seen.keys()) assert.equal(typeof cls.prototype[n], 'function', `${name}.${n} n'est pas sur le prototype`);
  }
});

await finish('Tous les contrats entre modules sont respectés.');
