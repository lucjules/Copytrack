// Empreinte de build de la fonction serveur (tools/build-stamp.mjs) : fichier généré, GET d'état, et le script `tools/check-deployed.mjs` lui-même, lancé contre un faux serveur.
// Contexte : `check-deployed` ne comparait que physVer, donc une fonction périmée (corrections de la phase 4, qui n'avaient pas changé PHYS_VER) passait pour « ok ».
// node tools/test-build-stamp.mjs   (npm test)
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { addStamp, readStamp, stampOf, judgeBuild } from './build-stamp.mjs';
import { createHandler } from '../supabase/functions/submit-score/handler.js';
import { PHYS_VER } from '../js/version.js';

const INDEX = new URL('../supabase/functions/submit-score/index.ts', import.meta.url);
const repoFile = readFileSync(INDEX, 'utf8');
const repo = readStamp(repoFile);

console.log('Fichier généré');
test('submit-score/index.ts porte une empreinte VALIDE (elle correspond au contenu qui la précède) : sinon `npm run build:function` n\'a pas été relancé ou le fichier a été modifié à la main', () => {
  assert.ok(repo, 'dernière ligne « globalThis.__COPYTRACK_BUILD__ = "…" » absente');
  assert.ok(repo.valid, 'empreinte ' + repo.stamp + ' ≠ contenu');
  assert.match(repo.stamp, /^[0-9a-f]{16}$/);
});
test('ice/index.ts n\'est PAS marqué (seul submit-score publie son état)', () => {
  assert.equal(readStamp(readFileSync(new URL('../supabase/functions/ice/index.ts', import.meta.url), 'utf8')), null);
});

console.log('Bibliothèque');
test('addStamp / readStamp : aller-retour, empreinte stable, 16 caractères hexadécimaux ; une modification du contenu (un seul caractère) rend l\'empreinte invalide', () => {
  const body = 'const a = 1;\nconsole.log(a);\n';
  const f = addStamp(body), r = readStamp(f);
  assert.ok(r.valid);
  assert.equal(r.stamp, stampOf(body));
  assert.equal(addStamp(body), f, 'déterministe');
  assert.equal(readStamp(f.replace('a = 1', 'a = 2')).valid, false, 'contenu modifié');
  assert.equal(readStamp(f.replace(r.stamp, '0'.repeat(16))).valid, false, 'empreinte remplacée');
  assert.equal(readStamp(body), null, 'pas d\'empreinte');
  assert.equal(readStamp(f + 'x'), null, 'ligne d\'empreinte pas en dernier');
  assert.ok(readStamp(addStamp('sans retour final')).valid, 'un contenu sans retour à la ligne final est normalisé');
});
test('judgeBuild : identique = ok ; absente (fonction d\'avant le contrôle), mal formée ou différente = ÉCART qui dit de REDÉPLOYER ; dépôt sans empreinte = inconnu ; dépôt incohérent = ÉCART', () => {
  const R = { stamp: 'aaaaaaaaaaaaaaaa', valid: true };
  assert.equal(judgeBuild('aaaaaaaaaaaaaaaa', R).kind, 'ok');
  for (const d of [undefined, null, '', 42, 'zz', 'AAAAAAAAAAAAAAAA', 'aaaaaaaaaaaaaaaaa']) {
    const j = judgeBuild(d, R);
    assert.equal(j.kind, 'ÉCART', String(d)); assert.match(j.msg, /REDÉPLOYER/);
  }
  assert.match(judgeBuild(undefined, R).msg, /AVANT ce contrôle/);
  const diff = judgeBuild('bbbbbbbbbbbbbbbb', R);
  assert.equal(diff.kind, 'ÉCART'); assert.match(diff.msg, /bbbbbbbbbbbbbbbb.*aaaaaaaaaaaaaaaa/);
  assert.equal(judgeBuild('aaaaaaaaaaaaaaaa', null).kind, 'inconnu');
  assert.equal(judgeBuild('aaaaaaaaaaaaaaaa', { stamp: 'aaaaaaaaaaaaaaaa', valid: false }).kind, 'ÉCART');
});

console.log('GET d\'état de la fonction');
const get = async (h) => { const r = await h(new Request('https://fn.example/', { method: 'GET' })); return { status: r.status, body: await r.json() }; };
const mk = (extra = {}) => createHandler({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'cle', log: () => {}, ...extra });
test('sans empreinte (tests, développement) : `build` vaut null ; le reste de l\'état est inchangé (physVer, actions, limites)', async () => {
  const { status, body } = await get(mk());
  assert.equal(status, 200); assert.equal(body.build, null);
  assert.equal(body.physVer, PHYS_VER); assert.deepEqual(body.actions, ['submit', 'publish-track']); assert.equal(body.service, 'submit-score');
});
test('empreinte donnée au gestionnaire : publiée telle quelle', async () => {
  assert.equal((await get(mk({ build: '0123456789abcdef' }))).body.build, '0123456789abcdef');
});
test('empreinte posée APRÈS la création du gestionnaire (comme le fichier généré, dont la dernière ligne s\'exécute après Deno.serve) : lue à chaque requête', async () => {
  const h = mk();
  assert.equal((await get(h)).body.build, null);
  globalThis.__COPYTRACK_BUILD__ = 'fedcba9876543210';
  try { assert.equal((await get(h)).body.build, 'fedcba9876543210'); } finally { delete globalThis.__COPYTRACK_BUILD__; }
  assert.equal((await get(h)).body.build, null);
});
test('une valeur qui n\'a pas la forme d\'une empreinte n\'est jamais publiée (ni chaîne quelconque, ni nombre, ni texte long)', async () => {
  for (const bad of ['nimporte quoi', 12345, 'A'.repeat(16), 'a'.repeat(300), {}]) assert.equal((await get(mk({ build: bad }))).body.build, null, String(bad).slice(0, 20));
});

console.log('Le script check-deployed lancé contre un faux serveur');
// Faux projet Supabase local : le GET d'état de submit-score annonce la physique du dépôt et l'empreinte voulue ; ice exige un jeton ; la racine REST expose le schéma attendu.
async function runCheck(buildField) {
  const server = http.createServer((req, res) => {
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url.startsWith('/functions/v1/submit-score')) {
      const body = { ok: true, service: 'submit-score', physVer: PHYS_VER, rate: { max: 8, windowS: 60, globalMax: 600, anonMax: 400 }, actions: ['submit', 'publish-track'] };
      if (buildField !== undefined) body.build = buildField;
      return json(200, body);
    }
    if (req.url.startsWith('/functions/v1/ice')) return json(401, { error: 'jeton requis' });
    if (req.url.startsWith('/rest/v1/')) return json(200, { definitions: { tracks: { properties: { author_verified: {} } } }, paths: {} });
    return json(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const cfg = JSON.stringify({ supabase: { url: `http://127.0.0.1:${server.address().port}`, key: 'cle-publique-de-test' } });
  const pre = 'data:text/javascript,' + encodeURIComponent(`globalThis.COPYTRACK_CONFIG = ${cfg};`);
  const out = await new Promise((resolve) => {
    execFile(process.execPath, ['--import', pre, new URL('./check-deployed.mjs', import.meta.url).pathname], { timeout: 30000, env: { ...process.env, NODE_USE_ENV_PROXY: '', HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '' } },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
  server.close();
  return out;
}
const line = (out, re) => out.stdout.split('\n').find((l) => re.test(l)) || '';
await test('empreinte identique à celle du dépôt : « ok », code de sortie 0 (tout le reste étant conforme)', async () => {
  const o = await runCheck(repo.stamp);
  assert.match(line(o, /empreinte/), /^ok\s+submit-score : empreinte de build identique/, o.stdout);
  assert.equal(o.code, 0, o.stdout + o.stderr);
});
await test('fonction d\'AVANT ce contrôle (physVer bon, pas d\'empreinte) : ÉCART qui demande de redéployer, code de sortie 1 — le cas que check-deployed laissait passer', async () => {
  const o = await runCheck(undefined);
  assert.match(line(o, /empreinte/), /^ÉCART\s+submit-score : la fonction déployée n'annonce pas d'empreinte/, o.stdout);
  assert.match(o.stdout, /physVer: ?|version de physique déployée \d+, dépôt \d+/, 'physVer reste annoncé comme conforme');
  assert.equal(o.code, 1);
});
await test('autre code déployé (empreinte différente, même physVer) : ÉCART, code de sortie 1', async () => {
  const other = repo.stamp === '0000000000000000' ? '1111111111111111' : '0000000000000000';
  const o = await runCheck(other);
  assert.match(line(o, /empreinte/), new RegExp(`^ÉCART\\s+submit-score : empreinte déployée ${other}, dépôt ${repo.stamp}`), o.stdout);
  assert.equal(o.code, 1);
});

finish('Tous les tests de l\'empreinte de build passent.');
