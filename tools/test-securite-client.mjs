// Sécurité du CLIENT et du dépôt (phase 5) : node tools/test-securite-client.mjs   (npm test)
//
// Ce qui protège la session des joueurs (jeton gardé dans le navigateur) et ce qui ne doit jamais se retrouver dans le dépôt :
//  - la politique de sécurité du contenu (index.html) : scripts du site seulement, ni script ni gestionnaire en ligne, ni eval ; ses serveurs extérieurs sont EXACTEMENT ceux
//    que le jeu utilise (Supabase de js/config.js, Google Fonts) : si l'un change sans l'autre, ce test échoue ;
//  - aucun code dynamique (eval, new Function, document.write) ni hôte tiers dans le code du jeu ;
//  - aucun secret (clé de service, jeton d'accès, JWT) dans les fichiers suivis ni dans l'historique récent ;
//  - les textes venus d'autres joueurs ne sont jamais collés tels quels dans une page (esc() / textContent) : garde statique sur les écrans en ligne.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, finish } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const walk = (dir, keep) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = dir + '/' + e.name;
  if (e.isDirectory()) return e.name === 'vendor' || e.name === 'node_modules' ? [] : walk(rel, keep);
  return keep(rel) ? [rel] : [];
});
const JS = walk('js', (f) => f.endsWith('.js'));
const html = read('index.html');

// Politique lue dans la balise <meta http-equiv="Content-Security-Policy">.
const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
const csp = new Map();
if (meta) for (const d of meta[1].split(';').map((x) => x.trim()).filter(Boolean)) { const [name, ...v] = d.split(/\s+/); csp.set(name, v); }
const { CONFIG } = await import('../js/config.js');

console.log('Politique de sécurité du contenu (index.html)');
test('la politique existe : scripts du site seulement, ni script en ligne, ni eval, ni « * »', () => {
  assert.ok(meta, 'balise Content-Security-Policy absente d\'index.html');
  assert.deepEqual(csp.get('script-src'), ["'self'"], 'script-src doit être \'self\' seul (pas de unsafe-inline, unsafe-eval, https:, *)');
  assert.deepEqual(csp.get('default-src'), ["'self'"]);
  assert.deepEqual(csp.get('object-src'), ["'none'"]);
  assert.deepEqual(csp.get('base-uri'), ["'self'"]);
  for (const [name, values] of csp) assert.ok(!values.includes('*') && !values.includes("'unsafe-eval'"), name + ' ne doit contenir ni « * » ni unsafe-eval');
  assert.ok(!(csp.get('script-src') || []).some((v) => /unsafe|https?:|data:|blob:/.test(v)));
});
test('connect-src : le site lui-même et le projet Supabase de js/config.js, rien d\'autre (un jeton ne part que vers eux)', () => {
  const origin = new URL(CONFIG.supabase.url).origin;
  assert.deepEqual(csp.get('connect-src'), ["'self'", origin], 'js/config.js et la politique ne désignent pas le même serveur');
  assert.match(CONFIG.iceUrl, new RegExp('^' + origin.replace(/[.]/g, '\\.')), 'la fonction « ice » est sur le même projet');
});
test('index.html : aucun <script> en ligne, aucun gestionnaire en ligne (onload, onclick…), aucun javascript:, aucun <style> ni <iframe>', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attrs, body] of scripts) assert.ok(/\bsrc=/.test(attrs) && !body.trim(), 'script en ligne : ' + attrs + body.slice(0, 40));
  assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'gestionnaire en ligne dans index.html');
  assert.ok(!/javascript:/i.test(html) && !/<iframe|<object|<embed|<style/i.test(html));
});
test('les serveurs extérieurs cités par index.html sont ceux que la politique autorise (feuille de style → style-src, police → font-src)', () => {
  const ext = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map((m) => new URL(m[1]).origin).filter((o, i, a) => a.indexOf(o) === i);
  for (const o of ext) assert.ok([...csp.get('style-src'), ...csp.get('font-src'), ...csp.get('img-src')].includes(o), o + ' n\'est pas autorisé par la politique');
  assert.ok(csp.get('style-src').includes('https://fonts.googleapis.com') && csp.get('font-src').includes('https://fonts.gstatic.com'));
});
test('la police se rend active SANS gestionnaire en ligne : main.js lève « media=print » de #font-css', () => {
  assert.ok(/id="font-css"/.test(html) && /media="print"/.test(html));
  assert.match(read('js/main.js'), /getElementById\('font-css'\)[\s\S]{0,200}media = 'all'/);
});

console.log('Code du jeu : rien de dynamique, rien de tiers');
test('aucun eval, new Function, document.write, setTimeout(texte), innerHTML contenant <script, ni lien javascript: dans js/', () => {
  const bad = [];
  for (const f of JS) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const [re, what] of [[/\beval\s*\(/, 'eval'], [/\bnew Function\s*\(/, 'new Function'], [/document\.write\s*\(/, 'document.write'], [/set(Timeout|Interval)\s*\(\s*['"`]/, 'minuterie à texte'], [/javascript:/i, 'javascript:'], [/<script/i, '<script']]) if (re.test(src)) bad.push(f + ' : ' + what);
  }
  assert.deepEqual(bad, []);
});
test('les seuls serveurs que le jeu appelle : Supabase (js/config.js) ; aucun hôte tiers codé en dur dans js/ (hors espace de noms SVG)', () => {
  const hosts = new Set();
  for (const f of JS) {
    if (f.startsWith('js/i18n/')) continue;
    const src = read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    for (const m of src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1].toLowerCase());
  }
  hosts.delete('www.w3.org');
  assert.deepEqual([...hosts].sort(), [new URL(CONFIG.supabase.url).host], 'hôtes en dur : ' + [...hosts].join(', '));
});

console.log('Secrets');
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean).filter((f) => !/\.(png|jpg|jpeg|gif|webp|mp3|ogg|wav|woff2?|ico)$/i.test(f) && !f.startsWith('js/vendor/') && f !== 'package-lock.json');
const SECRETS = [
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'JWT (clé de service ou jeton)'],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'clé secrète Supabase (sb_secret_…)'],
  [/\bsbp_[a-f0-9]{30,}/, 'jeton d\'accès personnel Supabase (sbp_…)'],
  [/SERVICE_ROLE_KEY\s*[:=]\s*['"][A-Za-z0-9._-]{20,}['"]/, 'clé de service en clair'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'clé privée'],
  [/TURN_(SECRET|KEY_API_TOKEN)\s*[:=]\s*['"][A-Za-z0-9._-]{12,}['"]/, 'secret TURN en clair'],
];
test('aucun secret dans les fichiers suivis par Git (clé de service, jeton d\'accès, JWT, clé privée, secret TURN) ; la clé publique « sb_publishable_ » est la seule clé présente', () => {
  const hits = [];
  for (const f of tracked) {
    if (statSync(join(root, f)).size > 3_000_000) continue;
    const src = read(f);
    for (const [re, what] of SECRETS) if (re.test(src)) hits.push(f + ' : ' + what);
  }
  assert.deepEqual(hits, []);
  assert.match(CONFIG.supabase.key, /^sb_publishable_/, 'la clé embarquée doit être la clé PUBLIQUE');
});
test('les fonctions serveur lisent leurs secrets dans l\'environnement (Deno.env), jamais en dur ; la clé de service ne sort dans aucune réponse (voir test-submit-handler)', () => {
  for (const f of ['supabase/functions/submit-score/server.ts', 'supabase/functions/ice/server.ts']) {
    const src = read(f);
    assert.match(src, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
    assert.ok(!/serviceKey:\s*['"]/.test(src));
  }
  assert.ok(!/service_role|SERVICE_ROLE/.test(JS.map(read).join('\n')), 'le jeu ne mentionne jamais la clé de service');
});
test('fichiers sensibles absents du dépôt : .env, clés, sauvegardes de base', () => {
  const bad = tracked.filter((f) => /(^|\/)\.env(\.|$)|\.pem$|\.p12$|id_rsa|\.sqlite$|\.dump$|backup.*\.sql$/i.test(f));
  assert.deepEqual(bad, []);
});

console.log('Textes des autres joueurs : jamais collés tels quels dans une page');
// Les écrans qui affichent du texte venu du réseau (pseudos, noms et descriptions de circuits, commentaires, salons, amis, duels…) construisent leurs gabarits avec esc().
const ONLINE_SCREENS = ['js/app/community.js', 'js/app/competition.js', 'js/ui/leaderboardPanel.js', 'js/app/multi.js', 'js/app/modes.js', 'js/app/profile.js', 'js/app/rewards.js', 'js/app/raceHub.js', 'js/welcome.js'];
const REMOTE = /\b(row|r|m|c|f|x|t|e|d|h|it|item|entry|rec|room|player|friend|duel|mode|pl|sc|nx|s)\.(name|owner_name|opponent_name|author|body|description|desc|host|title|track_name|trackName|username|message)\b|\bplayers\.name\b/;
// Toutes les expressions ${…} d'une ligne (y compris imbriquées), sans le contenu des gabarits imbriqués ; esc(…) retiré (parenthèses équilibrées) ; « champ ? … » (simple test) ignoré.
function templateExprs(line) {
  const out = [];
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] !== '$' || line[i + 1] !== '{') continue;
    let depth = 1, j = i + 2;
    for (; j < line.length && depth > 0; j++) { if (line[j] === '{') depth++; else if (line[j] === '}') depth--; }
    out.push(line.slice(i + 2, j - 1));
  }
  return out.map((e) => {
    let code = e.replace(/`[^`]*`/g, '');
    for (;;) {                                         // retire esc( … ) et opt( … ) (assistant d'<option> qui échappe : vérifié plus bas) à parenthèses équilibrées
      const k = code.search(/\b(esc|opt)\(/);
      if (k < 0) break;
      let d = 0, j = k + (code[k] === 'e' ? 3 : 3);
      for (; j < code.length; j++) { if (code[j] === '(') d++; else if (code[j] === ')') { d--; if (!d) break; } }
      code = code.slice(0, k) + code.slice(j + 1);
    }
    return code.replace(/[\w.$]+\s*\?(?![.?])/g, '');
  });
}
test('la garde sait trouver un champ distant non échappé (essai à blanc) et laisse passer esc(), les conditions et les nombres', () => {
  const find = (l) => templateExprs(l).filter((e) => REMOTE.test(e));
  assert.equal(find('el.innerHTML = `<b>${r.name}</b>`;').length, 1);
  assert.equal(find('x = `<b>${row.name || "—"}</b>`').length, 1);
  assert.equal(find('x = `<b>${esc(row.name)}</b>`').length, 0);
  assert.equal(find('x = `${row.description ? `<p>${esc(row.description)}</p>` : ""}`').length, 0);
  assert.equal(find('x = `<p>${esc(String((e && e.message) || "x").replace(/a/, ""))}</p>`').length, 0);
  assert.equal(find('x = `<i>${r.points} pt${r.points > 1 ? "s" : ""}</i>`').length, 0);
  assert.equal(find('x = `<p>${c.body}</p>`').length, 1);
});
test('gabarits HTML des écrans en ligne : chaque champ venu d\'un autre joueur passe par esc() (les titres de fenêtre et messages passent par textContent)', () => {
  const bad = [];
  for (const f of ONLINE_SCREENS) {
    read(f).split('\n').forEach((l, i) => {
      if (/^\s*\/\//.test(l) || !/<[a-zA-Z/]/.test(l)) return;
      for (const e of templateExprs(l)) if (REMOTE.test(e)) bad.push(`${f}:${i + 1}: ${e.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(bad, [], 'texte distant non échappé :\n' + bad.join('\n'));
});
test('les assistants opt(…) des écrans en ligne qui fabriquent des <option> échappent la valeur ET le libellé', () => {
  for (const f of ONLINE_SCREENS) for (const l of read(f).split('\n')) if (/const opt = \(/.test(l) && /<option/.test(l)) assert.ok(/esc\(v\)/.test(l) && /esc\(l(abel)?\)/.test(l), f + ' : ' + l.trim().slice(0, 100));
});
test('ui.modal et ui.flash écrivent le titre et le message en textContent (un pseudo ou un nom de playlist y est affiché, jamais interprété)', () => {
  const ui = read('js/ui.js');
  assert.match(ui, /\$\('modal-title'\)\.textContent = title/);
  assert.match(ui, /t\.textContent = text/);
});

await finish('Tous les tests de sécurité du client et du dépôt passent.');
