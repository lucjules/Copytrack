// Page autonome legal.html (0.12.4) : affiche une page légale (?p=confidentialite | mentions | regles | credits) dans la langue choisie (?lang=fr | en ;
// sinon la langue réglée dans le jeu sur cet appareil, sinon celle du navigateur). Les textes sont ceux du jeu (js/legal.js).
import { LEGAL_IDS, legalPage } from './legal.js';
import { GAME_NAME } from './version.js';

const q = new URLSearchParams(location.search);
function pickLang() {
  const asked = q.get('lang');
  if (asked === 'fr' || asked === 'en') return asked;
  try { const saved = JSON.parse(localStorage.getItem('copytrack.lang')); if (saved === 'fr' || saved === 'en') return saved; } catch { /* stockage indisponible */ }
  return String((navigator.languages && navigator.languages[0]) || navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
const lang = pickLang();
const page = legalPage(q.get('p'), lang);
const href = (p, l) => `?p=${p}&lang=${l}`;

document.documentElement.lang = lang;
document.title = `${GAME_NAME} · ${page.title}`;
document.getElementById('nav').innerHTML = LEGAL_IDS.map((id) => `<a href="${href(id, lang)}"${id === page.id ? ' aria-current="page"' : ''}>${legalPage(id, lang).title}</a>`).join('');
document.getElementById('langs').innerHTML = [['fr', 'Français'], ['en', 'English']].map(([l, n]) => `<a href="${href(page.id, l)}" lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${n}</a>`).join('');
document.getElementById('page').innerHTML = `<h1>${page.title}</h1>${page.html}`;
