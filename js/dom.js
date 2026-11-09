// Aides DOM partagées par tous les écrans.
//
// Règle d'écriture : un texte qui vient d'un joueur (pseudo, nom ou description de circuit, message…) ne se colle jamais tel quel dans un
// gabarit `innerHTML` : on l'échappe avec esc(), ou bien on construit l'élément avec h() (les chaînes y sont ajoutées comme du texte).

export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// h('button', { class: 'btn', onclick: fn, disabled: true }, 'Texte', autreElement) : élément DOM sans passer par innerHTML.
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
}
