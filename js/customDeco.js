// Pièces décoratives personnalisées (lot 12) : un petit objet que le joueur assemble avec des formes simples et pose dans l'éditeur comme n'importe quelle décoration.
// Les formes voyagent DANS le code du circuit (champ de la décoration « custom ») : quiconque ouvre le circuit voit la pièce. Purement visuel.
// Module sans DOM ni rendu : validation, forme compacte, code « SHD1: » (la géométrie est dans customDecoBuild.js : ce module-ci est lu aussi par la vérification serveur).

export const MAX_DECO_PARTS = 12;
export const MAX_CUSTOM_DECOS = 10;                 // décorations « pièce perso » par circuit (chacune porte ses formes : le code reste raisonnable)
export const DECO_SHAPES = ['box', 'sphere', 'cyl', 'cone', 'wedge', 'ring'];
export const DECO_SHAPE_LABELS = { box: 'Bloc', sphere: 'Sphère', cyl: 'Cylindre', cone: 'Cône', wedge: 'Cale', ring: 'Anneau' };
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, lo, hi, def, step) => { let n = Number(v); if (!Number.isFinite(n)) n = def; n = Math.min(hi, Math.max(lo, n)); return Number((Math.round(n / step) * step).toFixed(3)); };

export function sanitizeDecoPart(p) {
  if (!p || typeof p !== 'object' || !DECO_SHAPES.includes(p.s)) return null;
  return {
    s: p.s, x: num(p.x, -8, 8, 0, 0.1), y: num(p.y, 0, 12, 1, 0.1), z: num(p.z, -8, 8, 0, 0.1),
    sx: num(p.sx, 0.1, 8, 1, 0.1), sy: num(p.sy, 0.1, 10, 1, 0.1), sz: num(p.sz, 0.1, 8, 1, 0.1),
    ry: num(p.ry, 0, 345, 0, 15), c: typeof p.c === 'string' && HEX.test(p.c) ? p.c.toLowerCase() : '#c0c6e0', g: p.g ? 1 : 0,
  };
}
export const sanitizeDecoParts = (list) => (Array.isArray(list) ? list.slice(0, MAX_DECO_PARTS).map(sanitizeDecoPart).filter(Boolean) : []);

// ---------------------------------------------------------------- forme compacte (dans le code du circuit)
export const packDecoParts = (parts) => sanitizeDecoParts(parts).map((p) => [DECO_SHAPES.indexOf(p.s), p.x, p.y, p.z, p.sx, p.sy, p.sz, p.ry / 15, p.c.slice(1), p.g]);
export const unpackDecoParts = (arr) => sanitizeDecoParts(Array.isArray(arr) ? arr.slice(0, MAX_DECO_PARTS).map((a) => (Array.isArray(a) ? { s: DECO_SHAPES[a[0]], x: a[1], y: a[2], z: a[3], sx: a[4], sy: a[5], sz: a[6], ry: (+a[7] || 0) * 15, c: '#' + a[8], g: a[9] } : null)) : []);

// ---------------------------------------------------------------- code partageable « SHD1: » (une pièce de la bibliothèque)
const b64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => { const t = s.replace(/-/g, '+').replace(/_/g, '/'); const pad = t + '='.repeat((4 - (t.length % 4)) % 4); return typeof atob === 'function' ? decodeURIComponent(escape(atob(pad))) : Buffer.from(pad, 'base64').toString('utf8'); };
export const cleanDecoName = (n) => String(n == null ? '' : n).replace(/[^\p{L}\p{N} _'’.-]/gu, '').trim().slice(0, 24) || 'Ma pièce';
export const encodeDeco = (name, parts) => 'SHD1:' + b64(JSON.stringify({ n: cleanDecoName(name), p: packDecoParts(parts) }));
export function decodeDeco(code) {
  const t = String(code || '').trim();
  if (!t.startsWith('SHD1:')) throw new Error('Ce n\'est pas un code de pièce (il commence par SHD1:).');
  if (t.length > 4000) throw new Error('Code de pièce trop long.');
  let o;
  try { o = JSON.parse(unb64(t.slice(5))); } catch { throw new Error('Code de pièce invalide ou coupé.'); }
  const parts = o && typeof o === 'object' ? unpackDecoParts(o.p) : [];
  if (!parts.length) throw new Error('Cette pièce est vide.');
  return { name: cleanDecoName(o.n), parts };
}

