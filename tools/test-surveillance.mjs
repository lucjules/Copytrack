// Surveillance quotidienne (0.12.5, tools/surveillance.mjs) : le jugement du rapport de santé de la base, et les tâches planifiées GitHub.
//   node tools/test-surveillance.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test, finish } from './harness.mjs';
import { judgeHealth, LIMITS } from './surveillance.mjs';

const NOW = Date.parse('2026-11-19T07:00:00Z');
const base = { errors_24h: 3, error_installs_24h: 1, purge_scheduled: true, purge_last: '2026-11-19T03:17:02Z', phys_ver: 38, scores_24h: 4, runs_24h: 20, players_7d: 2, tracks: 19 };
const levels = (h, o = {}) => judgeHealth(h, { physVer: 38, now: NOW, ...o }).map((x) => x.niveau);

test('journée normale : aucune alerte', () => assert.ok(!levels(base).includes('ALERTE')));
test('trop d’installations touchées par des erreurs, ou trop d’erreurs : alerte', () => {
  assert.ok(levels({ ...base, error_installs_24h: LIMITS.errorInstalls24h + 1 }).includes('ALERTE'));
  assert.ok(levels({ ...base, errors_24h: LIMITS.errors24h + 1 }).includes('ALERTE'));
});
test('purge nocturne en retard de plus de 48 h, ou jamais faite : alerte ; sans pg_cron : simple information', () => {
  assert.ok(levels({ ...base, purge_last: '2026-11-16T03:17:00Z' }).includes('ALERTE'));
  assert.ok(levels({ ...base, purge_last: null }).includes('ALERTE'));
  assert.ok(!levels({ ...base, purge_scheduled: false, purge_last: null }).includes('ALERTE'));
});
test('une physique plus récente en base que dans le dépôt : alerte ; réponse illisible : alerte', () => {
  assert.ok(levels({ ...base, phys_ver: 39 }).includes('ALERTE'));
  assert.deepEqual(levels(null), ['ALERTE']);
});
test('tâches planifiées : surveillance chaque jour (lecture seule) ; sauvegarde chaque semaine, chiffrée, seulement si ses secrets existent', () => {
  const s = readFileSync(new URL('../.github/workflows/surveillance.yml', import.meta.url), 'utf8');
  assert.match(s, /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'/); assert.match(s, /node tools\/surveillance\.mjs/); assert.match(s, /permissions:\s*\n\s*contents: read/);
  const b = readFileSync(new URL('../.github/workflows/sauvegarde.yml', import.meta.url), 'utf8');
  assert.match(b, /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \d'/);
  assert.match(b, /secrets\.SUPABASE_DB_URL/); assert.match(b, /secrets\.BACKUP_PASSPHRASE/);
  assert.match(b, /gpg --batch --symmetric/); assert.ok(!/upload-artifact[\s\S]*\.sql\b(?!\.gpg)/.test(b.replace(/\.sql\.gz\.gpg/g, '')), 'seul le fichier chiffré est publié');
  assert.ok(existsSync(new URL('../docs/EXPLOITATION.md', import.meta.url)));
});

await finish('La surveillance juge correctement la santé de la base ; les tâches planifiées sont en place.');
