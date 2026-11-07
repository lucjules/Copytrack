// Traducteur DOM : traduit à la volée ce que le jeu écrit dans la page (voir i18n.js pour le principe).
//
// - Tant que la langue est le français, il ne fait rien (pas d'observateur, pas de parcours).
// - En anglais, il parcourt la page une fois, puis un MutationObserver traduit ce qui est ajouté ou réécrit. L'observateur s'exécute
//   en micro-tâche, AVANT le dessin : le joueur ne voit jamais le texte français apparaître puis changer.
// - Il retient, pour chaque nœud traduit, le texte français d'origine (WeakMap) : changer de langue, dans un sens ou dans l'autre,
//   repart toujours du français. Si le jeu réécrit le nœud, le nouveau texte (français) devient la nouvelle source.
// - Un paragraphe qui mêle texte et balises (« <b>sans nom</b>, le temps… ») se traduit d'un bloc, par son HTML : l'ordre des mots
//   change d'une langue à l'autre, on ne peut pas traduire les morceaux séparément. Seuls les conteneurs « sûrs » (texte + balises
//   de mise en forme, sans id ni bouton) sont réécrits ainsi, pour ne jamais détruire un élément que le code utilise.
import { translate, getLang, SOURCE_LANG, onLangChange } from '../i18n.js';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CANVAS', 'NOSCRIPT', 'TEMPLATE']);
export const TRANSLATED_ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const INLINE_TAGS = new Set(['B', 'I', 'EM', 'STRONG', 'KBD', 'SMALL', 'U', 'BR', 'MARK', 'S', 'SUB', 'SUP', 'SPAN']);

const isOff = (el) => el.getAttribute && el.getAttribute('data-i18n') === 'off';

// Un élément « sûr » à réécrire par son HTML : uniquement du texte et des balises de mise en forme sans id ni action.
function safeInline(el) {
  if (!INLINE_TAGS.has(el.tagName) || el.id || el.hasAttribute('data-action') || isOff(el)) return false;
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && !safeInline(c)) return false;
  return true;
}
export function isInlineContainer(el) {
  if (SKIP_TAGS.has(el.tagName) || isOff(el)) return false;
  let hasEl = false, hasText = false;
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) { if (c.nodeValue.trim()) hasText = true; }
    else if (c.nodeType === 1) { if (!safeInline(c)) return false; hasEl = true; }
  }
  return hasEl && hasText;
}

export class DomTranslator {
  constructor(doc = document) {
    this.doc = doc;
    this.texts = new WeakMap();      // nœud texte -> { src, out }
    this.attrs = new WeakMap();      // élément -> Map(attribut -> { src, out })
    this.htmls = new WeakMap();      // élément -> { src, out }
    this.observer = null;
    this.stats = { walks: 0, mutations: 0 };
  }

  // ---- un nœud, un attribut, un conteneur
  _text(node) {
    const v = node.nodeValue, rec = this.texts.get(node);
    const src = rec && rec.out === v ? rec.src : v;
    const out = translate(src);
    if (out !== v) node.nodeValue = out;
    if (out !== src) this.texts.set(node, { src, out }); else if (rec) this.texts.delete(node);
  }

  _attr(el, name) {
    const v = el.getAttribute(name);
    if (v == null) return;
    let map = this.attrs.get(el);
    const rec = map && map.get(name);
    const src = rec && rec.out === v ? rec.src : v;
    const out = translate(src);
    if (out !== v) el.setAttribute(name, out);
    if (out !== src) { if (!map) this.attrs.set(el, map = new Map()); map.set(name, { src, out }); } else if (rec) map.delete(name);
  }

  // Renvoie true si le conteneur a été réécrit d'un bloc (ses enfants sont alors à jour : inutile de les parcourir).
  _html(el) {
    const rec = this.htmls.get(el);
    if (!rec && !isInlineContainer(el)) return false;
    const html = el.innerHTML;
    if (rec && rec.out === html && getLang() !== SOURCE_LANG) return true;      // déjà traduit, rien n'a bougé
    const src = rec && rec.out === html ? rec.src : html;
    const out = translate(src);
    if (out !== src) {
      el.innerHTML = out;
      this.htmls.set(el, { src, out: el.innerHTML });
      return true;
    }
    if (rec && html !== src) { el.innerHTML = src; this.htmls.delete(el); return true; }       // retour au français
    if (rec && rec.out !== html) this.htmls.delete(el);                                         // le jeu a réécrit le bloc : plus de lien
    return false;
  }

  _walk(node) {
    if (node.nodeType === 3) { this._text(node); return; }
    if (node.nodeType !== 1 || SKIP_TAGS.has(node.tagName) || isOff(node)) return;
    for (const a of TRANSLATED_ATTRS) if (node.hasAttribute(a)) this._attr(node, a);
    if (this._html(node)) return;
    for (let c = node.firstChild; c; c = c.nextSibling) this._walk(c);
  }

  // Le nœud est-il sous un bloc que l'on ne doit pas toucher (data-i18n="off") ?
  _inOff(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !!(el && el.closest && el.closest('[data-i18n="off"]'));
  }

  // ---- parcours complet (changement de langue) et observation
  refresh(root = this.doc.documentElement) {
    this.stats.walks++;
    this._walk(root);
    if (this.observer) this.observer.takeRecords();
  }

  start() {
    if (this.observer || typeof MutationObserver === 'undefined') return;
    this.observer = new MutationObserver((records) => this._onMutations(records));
    this.observer.observe(this.doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: TRANSLATED_ATTRS });
  }

  stop() {
    if (!this.observer) return;
    this.observer.disconnect();
    this.observer = null;
  }

  // À appeler quand la langue change : parcours complet, puis observation seulement si la langue n'est pas le français.
  sync() {
    if (getLang() !== SOURCE_LANG) this.start();
    this.refresh();
    if (getLang() === SOURCE_LANG) this.stop();
  }

  _onMutations(records) {
    this.stats.mutations += records.length;
    const done = new Set();
    const touch = (node) => {
      if (done.has(node) || !node.isConnected || this._inOff(node)) return;
      done.add(node);
      // Un bloc réécrit d'un bloc dont le contenu vient de changer : on le retraduit en entier.
      let p = node.parentElement;
      for (let i = 0; p && i < 3; i++, p = p.parentElement) {
        if (this.htmls.has(p) || (i === 0 && isInlineContainer(p))) { if (!done.has(p)) { done.add(p); if (this._html(p)) return; } }
      }
      if (node.isConnected) this._walk(node);
    };
    for (const r of records) {
      if (r.type === 'characterData') touch(r.target);
      else if (r.type === 'attributes') { if (r.target.isConnected && !this._inOff(r.target)) this._attr(r.target, r.attributeName); }
      else for (const n of r.addedNodes) touch(n);
    }
    this.observer && this.observer.takeRecords();      // nos propres écritures ne sont pas à retraiter
  }
}

// Installe le traducteur sur le document et le relie au changement de langue. Renvoie l'instance.
export function installDomTranslator(doc = document) {
  const tr = new DomTranslator(doc);
  onLangChange(() => tr.sync());
  if (getLang() !== SOURCE_LANG) tr.sync();
  return tr;
}
