// Inventaire des textes français du jeu et de leur couverture par le dictionnaire anglais.
//   node tools/i18n-scan.mjs                 résumé par fichier (textes sans traduction)
//   node tools/i18n-scan.mjs js/app/multi.js liste les textes sans traduction de ces fichiers
//   node tools/i18n-scan.mjs --all           liste aussi les textes déjà traduits
//   node tools/i18n-scan.mjs --keys          une clé par ligne (à coller dans un dictionnaire), trous « ${…} » remplacés par {a}, {b}…
// Le jeu n'est pas modifié : le français reste la clé. Ce script lit le code avec un petit analyseur lexical (chaînes, gabarits, commentaires).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register, setLang, hasTranslation, looksFrench, norm } from '../js/i18n.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// ---- lexique JS minimal : renvoie les chaînes littérales { text, line, kind } (les gabarits ont leurs ${…} remplacés par {a}, {b}…)
export function jsStrings(src) {
  const out = [];
  let i = 0, line = 1, prevSig = '';        // dernier caractère significatif (pour distinguer « / » division et expression régulière)
  const n = src.length;
  const holeName = (k) => '{' + String.fromCharCode(97 + (k % 26)) + (k >= 26 ? Math.floor(k / 26) : '') + '}';
  function template(startLine) {
    // i est juste après la apostrophe inverse ; renvoie le texte avec trous
    let text = '', holes = 0;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { text += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
      if (c === '`') { i++; break; }
      if (c === '$' && src[i + 1] === '{') {
        i += 2; let depth = 1;
        const innerStart = i;
        while (i < n && depth) {
          const d = src[i];
          if (d === '{') depth++; else if (d === '}') depth--;
          else if (d === '`') { i++; template(line); continue; }
          else if (d === "'" || d === '"') { const q = d; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; } }
          else if (d === '\n') line++;
          i++;
        }
        const inner = src.slice(innerStart, i - 1);
        // les chaînes à l'intérieur d'un trou sont des textes à part entière (ex. ${n > 1 ? 'pièces' : 'pièce'})
        for (const m of inner.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) out.push({ text: m[1] ?? m[2], line: startLine, kind: 'in-template' });
        text += holeName(holes++);
        continue;
      }
      if (c === '\n') line++;
      text += c; i++;
    }
    out.push({ text, line: startLine, kind: 'template' });
    return text;
  }
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c, startLine = line; i++; let text = '';
      while (i < n && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { text += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; } else text += src[i++]; }
      i++; out.push({ text, line: startLine, kind: 'string' }); prevSig = q; continue;
    }
    if (c === '`') { i++; template(line); prevSig = '`'; continue; }
    if (c === '/' && /[(,=:[!&|?{};>+\-*%<~^]|^$/.test(prevSig)) {       // expression régulière
      i++; let cls = false;
      while (i < n && (src[i] !== '/' || cls) && src[i] !== '\n') { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
      i++; while (/[a-z]/.test(src[i] || '')) i++; prevSig = 'r'; continue;
    }
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return out;
}

// ---- HTML : fragment -> candidats (même logique que le traducteur DOM : texte seul, ou conteneur « texte + balises de mise en forme »)
const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link']);
const INLINE = new Set(['b', 'i', 'em', 'strong', 'kbd', 'small', 'u', 'br', 'mark', 's', 'sub', 'sup', 'span']);
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];

function parseFragment(html) {
  const root = { tag: '#root', attrs: '', kids: [], inner: [0, html.length] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) top.kids.push({ text: m[4], at: m.index });
    else if (m[2] !== undefined && !m[1]) {
      const tag = m[2].toLowerCase();
      const el = { tag, attrs: m[3], kids: [], inner: [m.index + m[0].length, -1], at: m.index };
      top.kids.push(el);
      if (!VOID.has(tag) && !m[3].endsWith('/')) stack.push(el);
    } else if (m[2] !== undefined && m[1]) {
      const tag = m[2].toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack[k].inner[1] = m.index; stack.length = k; break; }
    }
  }
  for (const el of stack.slice(1)) el.inner[1] = html.length;
  return root;
}
const attrOf = (attrs, name) => { const m = new RegExp('(?:^|\\s)' + name + '=(?:"([^"]*)"|\'([^\']*)\')').exec(attrs); return m ? (m[1] ?? m[2]) : null; };
const safeInline = (el) => el.tag !== undefined && INLINE.has(el.tag) && !attrOf(el.attrs, 'id') && !/\bdata-action\b/.test(el.attrs) && el.kids.every((k) => k.text !== undefined || safeInline(k));

export function htmlCandidates(html, kind = 'html', isCovered = () => false) {
  const out = [];
  const skipTag = new Set(['script', 'style', 'textarea', 'svg', 'template']);
  const visit = (el) => {
    for (const a of ATTRS) { const v = attrOf(el.attrs || '', a); if (v) out.push({ text: v, kind: 'attr:' + a, at: el.at }); }
    if (skipTag.has(el.tag)) return;
    const hasEl = el.kids.some((k) => k.text === undefined), hasText = el.kids.some((k) => k.text !== undefined && /\S/.test(k.text));
    if (el.tag !== '#root' && hasEl && hasText && el.kids.every((k) => k.text !== undefined || safeInline(k))) {
      const inner = html.slice(el.inner[0], el.inner[1]);
      out.push({ text: inner, kind: kind + '-inline', at: el.at });
      if (isCovered(inner)) return;                       // traduit d'un bloc : les morceaux ne comptent pas
    }
    for (const k of el.kids) {
      if (k.text !== undefined) { if (/[A-Za-zÀ-ÿ]/.test(k.text.replace(/\{\w+\}/g, ''))) out.push({ text: k.text, kind, at: k.at }); }
      else visit(k);
    }
  };
  visit(parseFragment(html));
  return out;
}

const IGNORE_DIRS = new Set(['vendor', 'node_modules', '.git']);
function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    if (IGNORE_DIRS.has(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, acc); else if (f.endsWith('.js') || f === 'index.html') acc.push(p);
  }
  return acc;
}

// Une chaîne est-elle probablement un texte pour le joueur ? (heuristique : le contrôle fiable est le test navigateur)
const CODEISH = /^(https?:|\/|\.|#|data:|[a-z]+:\/\/|[\w.-]+\.(js|css|json|png|svg|html|mjs))/;
export function candidate(text, kind) {
  const s = text.replace(/\{\w+\}/g, '').trim();
  if (s.length < 2 || !/[A-Za-zÀ-ÿ]/.test(s) || CODEISH.test(s)) return false;
  if (/^[\w$.\-[\]#:>~+*=, ]+$/.test(s) && !/[A-ZÀ-Ý]/.test(s[0]) && !looksFrench(s)) return false;          // sélecteur, identifiant, clé
  if (/^[A-Za-z0-9_$.-]+$/.test(s) && !/[àâçéèêëîïôùûüœÀÉ]/.test(s) && (kind === 'string' && !/^[A-ZÉ][a-zéèêàç]{2,}$/.test(s))) return false;
  return looksFrench(s) || (/^[A-ZÉÈ][a-zéèêàçùô]+( [\wÀ-ÿ'’-]+)*$/.test(s));
}

export function loadDictionary() {
  return import('../js/i18n/en.js').then((m) => { register(m.default); setLang('en'); return m.default; }).catch(() => { setLang('en'); return {}; });
}

export function covered(key) {
  return hasTranslation(key.replace(/\{\w+\}/g, '1')) || hasTranslation(key);
}

export async function scan() {
  await loadDictionary();
  const report = [];
  for (const file of walk(join(ROOT, 'js')).concat(join(ROOT, 'index.html'))) {
    const rel = relative(ROOT, file);
    if (/js\/i18n(\/|\.js)/.test(rel)) continue;
    const src = readFileSync(file, 'utf8');
    const cover = (h) => covered(norm(h));
    let items;
    if (file.endsWith('.html')) {
      const body = src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' ')).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, ' '));
      items = htmlCandidates(body, 'html', cover).map((c) => ({ ...c, line: body.slice(0, c.at).split('\n').length }));
    } else {
      items = [];
      for (const it of jsStrings(src)) {
        if (/<\/?[A-Za-z][^>]*>/.test(it.text) && it.kind !== 'in-template') items.push(...htmlCandidates(it.text, it.kind, cover).map((c) => ({ ...c, line: it.line })));
        else items.push(it);
      }
    }
    const seen = new Set();
    for (const it of items) {
      const key = norm(it.text);
      if (!candidate(it.text, it.kind) || seen.has(key)) continue;
      seen.add(key);
      report.push({ file: rel, line: it.line, key, kind: it.kind, done: covered(key) });
    }
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith('--'));
  const all = args.includes('--all');
  const rep = (await scan()).filter((r) => (all || !r.done) && (!files.length || files.some((f) => r.file.includes(f))));
  if (args.includes('--keys')) { for (const r of rep) console.log(JSON.stringify(r.key)); process.exit(0); }
  if (files.length) { for (const r of rep) console.log(`${r.file}:${r.line} [${r.kind}${r.done ? ' ok' : ''}] ${r.key}`); process.exit(0); }
  const by = new Map();
  for (const r of rep) by.set(r.file, (by.get(r.file) || 0) + 1);
  const rows = [...by].sort((a, b) => b[1] - a[1]);
  for (const [f, c] of rows) console.log(String(c).padStart(5), f);
  console.log(String(rep.length).padStart(5), 'au total' + (all ? '' : ' (sans traduction)'));
}
