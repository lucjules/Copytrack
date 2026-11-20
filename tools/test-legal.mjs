// Légal et identité (0.12.4) : un seul nom affiché, aucune mention d'un autre jeu, licences et crédits complets, aucune musique d'origine inconnue,
// pages Confidentialité / Mentions légales / Règles / Crédits dans les deux langues, case d'âge, export des données, statistiques sans accord : rien.
//   node tools/test-legal.mjs   (npm test)
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, finish } from './harness.mjs';
import { jsStrings } from './i18n-scan.mjs';
import { GAME_NAME, FILE_PREFIX } from '../js/version.js';
import { BUILTIN_AUTHOR, authorLabel, BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { CONFIG } from '../js/config.js';
import { LEGAL_IDS, legalPage, contactHtml } from '../js/legal.js';
import { buildExport, readableLocal, EXPORT_TABLES } from '../js/dataExport.js';
import en from '../js/i18n/en.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean).filter((f) => existsSync(join(root, f)));
const TEXT = /\.(js|mjs|ts|html|css|md|json|txt|sql|sh|yml|webmanifest)$|^\.gitignore$|^LICENSE$/;
const OLD = 'Copy' + 'track';                 // l'ancien nom affiché (écrit en deux morceaux : ce fichier ne se trouve pas lui-même)
const OLD2 = 'Vi' + 'relo';                   // (0.16.0) le nom de la 0.12.4 à la 0.15.1
const OTHER = new RegExp('poly' + 'track', 'i');

console.log('Nom du jeu');
test(`un seul nom affiché (${GAME_NAME}) : titre, manifeste, logos, page légale, wiki`, () => {
  const html = read('index.html'), man = JSON.parse(read('manifest.webmanifest')), up = GAME_NAME.toUpperCase();
  assert.match(html, new RegExp(`<title>${GAME_NAME}</title>`));
  assert.equal(man.name, GAME_NAME); assert.equal(man.short_name, GAME_NAME);
  const logos = [...html.matchAll(/class="logo">([^<]*)<span>([^<]*)<\/span>/g)].map((m) => m[1] + m[2]);
  assert.ok(logos.length >= 3 && logos.every((l) => l === up), logos.join(', '));
  assert.match(read('legal.html'), new RegExp(`<title>${GAME_NAME} ·`));
  assert.ok(!new RegExp(`${OLD}|${OLD2}`).test(read('tools/wiki/modele.html')), 'le modèle du wiki écrit __NAME__, jamais un ancien nom');
  assert.match(read('wiki/index.html'), new RegExp(`<title>Wiki ${GAME_NAME}</title>`));
  assert.equal(FILE_PREFIX, GAME_NAME.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
});

test('l’ancien nom n’apparaît plus dans ce que voit le joueur (pages, manifeste, textes du code, dictionnaire anglais, wiki)', () => {
  for (const f of ['index.html', 'manifest.webmanifest', 'legal.html', 'wiki/index.html', 'tools/wiki/modele.html']) assert.ok(!read(f).includes(OLD) && !read(f).includes(OLD2), f);
  // (0.16.0) Le nom de la 0.12.4 à la 0.15.1 n'apparaît plus NULLE PART dans le dépôt, sauf la tâche de purge nocturne déjà planifiée en production (nom technique).
  const old2 = tracked.filter((f) => TEXT.test(f.split('/').pop()) && f !== 'tools/test-legal.mjs' && read(f).replace(new RegExp(OLD2.toLowerCase() + '-purge', 'g'), '').toLowerCase().includes(OLD2.toLowerCase()));
  assert.deepEqual(old2, []);
  const found = [];
  for (const f of tracked.filter((x) => /^js\/.*\.js$/.test(x) && !x.startsWith('js/vendor/'))) {
    for (const s of jsStrings(read(f))) {
      if (!(s.text.includes(OLD) || s.text.includes(OLD2)) || /^https:\/\/github\.com\/[\w-]+\/[\w-]+$/.test(s.text)) continue;      // (l'adresse du dépôt garde son nom technique)
      if (f === 'js/tracks.js' && s.text === OLD) continue;      // (BUILTIN_AUTHOR : écrit dans le code des circuits officiels, donc dans leur clé de classement)
      found.push(`${f}:${s.line} ${s.text.slice(0, 60)}`);
    }
  }
  assert.deepEqual(found, []);
  assert.deepEqual(Object.entries(en).filter(([k, v]) => k.includes(OLD) || (typeof v === 'string' && v.includes(OLD))).map(([k]) => k), []);
});

test('les circuits officiels gardent l’auteur écrit dans leur code (clé de classement inchangée) ; l’écran montre le nom actuel', () => {
  assert.equal(buildBuiltin(BUILTIN_TRACKS[0]).author, BUILTIN_AUTHOR);
  assert.equal(authorLabel(BUILTIN_AUTHOR), GAME_NAME); assert.equal(authorLabel('Bea'), 'Bea');
  assert.match(read('js/main.js'), /esc\(authorLabel\(track\.author\)\)/);
});

console.log('Aucune mention d’un autre jeu');
test('aucun fichier du dépôt ne cite l’autre jeu (code, commentaires, tests, documentation, notes de version)', () => {
  const hits = tracked.filter((f) => TEXT.test(f.split('/').pop()) && f !== 'tools/test-legal.mjs' && OTHER.test(read(f)));
  assert.deepEqual(hits, []);
  assert.ok(existsSync(join(root, 'docs/LOIS-PHYSIQUE.md')), 'la décision écrite sur les lois de conduite gardées');
});

console.log('Licences et crédits');
test('LICENSE (MIT) existe et concorde avec package.json ; chaque composant tiers est déclaré avec sa licence', () => {
  assert.match(read('LICENSE'), /^MIT License\n\nCopyright \(c\) \d{4} /);
  assert.equal(JSON.parse(read('package.json')).license, 'MIT');
  const notices = read('THIRD-PARTY-NOTICES.md');
  for (const f of ['js/vendor/THREE_LICENSE.txt', 'assets/fonts/OFL.txt', 'wiki/fonts/OFL.txt']) { assert.ok(existsSync(join(root, f)), f); assert.ok(notices.includes(f), f + ' dans THIRD-PARTY-NOTICES.md'); }
  const credits = legalPage('credits', 'fr').html;
  for (const name of ['three.js', 'Chakra Petch', 'Unbounded', 'IBM Plex Sans', 'IBM Plex Mono']) { assert.ok(notices.includes(name), name); assert.ok(credits.includes(name), name + ' dans les crédits'); }
  // Toute police déposée a sa famille dans les avis (un fichier ajouté sans être déclaré fait échouer ce test).
  const fams = (dir) => readdirSync(join(root, dir)).filter((f) => f.endsWith('.woff2')).map((f) => f.replace(/-latin.*$/, ''));
  const label = { 'chakra-petch': 'Chakra Petch', unbounded: 'Unbounded', 'ibm-plex-sans': 'IBM Plex Sans', 'ibm-plex-mono': 'IBM Plex Mono' };
  for (const f of new Set([...fams('assets/fonts'), ...fams('wiki/fonts')])) assert.ok(label[f] && notices.includes(label[f]), f + ' non déclarée');
  assert.deepEqual(readdirSync(join(root, 'js/vendor')).sort(), ['THREE_LICENSE.txt', 'TransformControls.js', 'three.module.min.js']);
});

test('aucune musique ni aucun son en fichier : tout est synthétisé (la musique du menu, d’origine inconnue, est retirée)', () => {
  assert.deepEqual(tracked.filter((f) => /\.(mp3|ogg|wav|m4a|flac|aac|opus)$/i.test(f)), []);
  assert.ok(!/fetch\(|\.mp3/.test(read('js/music.js')));
  assert.ok(!read('sw.js').includes('.mp3'));
});

test('aucun service de polices tiers : ni le jeu, ni la page légale, ni le wiki n’appellent Google Fonts', () => {
  for (const f of ['index.html', 'legal.html', 'wiki/index.html', 'tools/wiki/modele.html']) assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(read(f)), f);
  for (const m of read('wiki/index.html').matchAll(/url\((fonts\/[^)]+)\)/g)) assert.ok(existsSync(join(root, 'wiki', m[1])), m[1]);
});

console.log('Pages légales');
test('quatre pages, en français et en anglais, de même structure ; le nom du jeu y figure', () => {
  assert.deepEqual(LEGAL_IDS, ['confidentialite', 'mentions', 'regles', 'credits']);
  const count = (h, re) => (h.match(re) || []).length;
  for (const id of LEGAL_IDS) {
    const fr = legalPage(id, 'fr'), enP = legalPage(id, 'en');
    assert.ok(fr.title && enP.title && fr.title !== enP.title, id);
    assert.equal(count(fr.html, /<h3>/g), count(enP.html, /<h3>/g), id + ' : intertitres');
    assert.equal(count(fr.html, /<li>/g), count(enP.html, /<li>/g), id + ' : points');
    assert.equal(count(fr.html, /<a /g), count(enP.html, /<a /g), id + ' : liens');
    if (id !== 'regles') assert.ok(fr.html.includes(GAME_NAME) && enP.html.includes(GAME_NAME), id);
  }
  assert.equal(legalPage('inconnue').id, 'confidentialite');
});

test('confidentialité : chaque donnée envoyée, chaque destinataire, les durées, les droits, l’âge, la CNIL', () => {
  const p = legalPage('confidentialite', 'fr').html;
  for (const w of ['Aucune adresse e-mail', 'hachage bcrypt', 'Statistiques anonymes', 'Multijoueur', 'adresse IP', 'Supabase', 'Londres', 'GitHub', 'Google', 'Exporter mes données',
    'Supprimer le compte', '15 ans', 'cnil.fr', 'art. 6.1.a', 'art. 6.1.b', 'art. 6.1.f', '12 mois']) assert.ok(p.includes(w), w);
  const e = legalPage('confidentialite', 'en').html;
  for (const w of ['No email address', 'bcrypt', 'Anonymous statistics', 'Multiplayer', 'IP address', 'Export my data', 'Delete account', '15', 'CNIL', '12 months']) assert.ok(e.includes(w), w);
});

test('mentions légales : éditeur non professionnel (LCEN), hébergeur avec adresse et téléphone ; contact par adresse réglée, sinon page du projet', () => {
  const m = legalPage('mentions', 'fr').html;
  for (const w of ['2004-575', 'GitHub, Inc.', '88 Colin P. Kelly Jr. Street', '+1 877 448 4820', 'MIT', CONFIG.legal.publisher]) assert.ok(m.includes(w), w);
  assert.match(contactHtml('fr', { contact: 'jeu@exemple.fr', source: 'https://x' }), /^<a href="mailto:jeu@exemple\.fr">/);
  assert.match(contactHtml('fr', { contact: '', source: 'https://github.com/a/b/' }), /https:\/\/github\.com\/a\/b\/issues/);
  assert.ok(!contactHtml('fr', { contact: '<script>@x.fr', source: 'https://x' }).includes('<script>'), 'adresse invalide : jamais insérée');
  if (!CONFIG.legal.contact) console.log('       (à faire avant la 1.0 : régler une adresse de contact dans js/config.js, legal.contact)');
});

test('règles de la communauté : respect, vie privée, triche, créations, spam, âge, modération (3 signalements)', () => {
  const r = legalPage('regles', 'fr').html;
  for (const w of ['Respect', 'Vie privée', 'triche', 'un autre jeu', 'spam', '15 ans', 'Trois signalements']) assert.ok(r.includes(w), w);
});

test('dans le jeu : liens du menu et des Paramètres, case d’âge à la création de compte, case des règles à la publication, rappel sous les commentaires', () => {
  const html = read('index.html');
  for (const id of ['credits', 'confidentialite', 'mentions']) assert.ok(html.includes(`data-action="legal-${id}"`), id);
  assert.match(read('js/app/wiring.js'), /a\.startsWith\('legal-'\)\) \{ this\.showLegal\(a\.slice\(6\)\)/);
  assert.match(html, /id="wl-age"/); assert.match(read('js/welcome.js'), /if \(!age\.checked\)/);
  assert.match(html, /class="wl-legal"[\s\S]{0,200}legal\.html\?p=confidentialite/);
  const c = read('js/app/community.js');
  assert.match(c, /id="pub-ok"/); assert.match(c, /if \(!ok\.checked\)/); assert.match(c, /hub-crules/);
  assert.match(read('js/main.js'), /legalMethods/);
});

console.log('Données du joueur');
test('export : appareil lisible sans aucun jeton ; serveur lu table par table sur l’identifiant du joueur ; sans session, rien n’est demandé', async () => {
  const local = { 'profile': '{"xp":12}', 'settings': '{"volume":0.4}', 'online.session': '{"access_token":"secret"}', 'acct.token': 'x', 'note': 'texte' };
  assert.deepEqual(readableLocal(local), { profile: { xp: 12 }, settings: { volume: 0.4 }, note: 'texte' });
  const uid = '0b9f3c2e-1111-4222-8333-444455556666', asked = [];
  const out = await buildExport({ meta: { game: GAME_NAME }, local, uid, get: async (p) => { asked.push(p); if (p.includes('/duels?')) throw new Error('refusé'); return [{ ok: 1 }]; }, now: () => new Date('2026-11-19T10:00:00Z') });
  assert.equal(out.game, GAME_NAME); assert.equal(out.exportedAt, '2026-11-19T10:00:00.000Z'); assert.equal(out.server.status, 'ok');
  assert.equal(asked.length, EXPORT_TABLES.length);
  assert.ok(asked.every((p) => p.includes(uid) && !p.includes('{u}')));
  assert.deepEqual(out.server.duels, { error: 'refusé' });
  assert.ok(!JSON.stringify(out).includes('secret'));
  let called = false;
  const none = await buildExport({ local, uid: null, get: async () => { called = true; return []; } });
  assert.equal(none.server.status, 'no-online-session'); assert.equal(called, false);
  assert.equal((await buildExport({ uid: 'pas-un-uuid', get: async () => { called = true; } })).server.status, 'no-online-session'); assert.equal(called, false);
});

test('statistiques anonymes : rien ne part sans un oui explicite (réglage absent = pas encore demandé)', () => {
  assert.match(read('js/storage.js'), /telemetry: null,/);
  assert.match(read('js/main.js'), /enabled: \(\) => this\.settings\.telemetry === true/);
});

await finish('Légal et identité : nom unique, aucune mention d’un autre jeu, licences, pages légales et export en place.');
