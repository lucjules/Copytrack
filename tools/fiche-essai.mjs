// Fiche d'essai des 66 circuits : node tools/fiche-essai.mjs   -> docs/FICHE-ESSAI.md et docs/temps-humains.json (gabarit vide)
// Un circuit n'a été parcouru que par le pilote automatique : cette fiche sert à les jouer une fois, à la main, et à noter ce qui cloche.
// Les meilleurs temps relevés se recopient dans docs/temps-humains.json, puis : node tools/medals.mjs --humain docs/temps-humains.json --ecrire
import { writeFileSync } from 'node:fs';
import { BUILTIN_TRACKS, buildBuiltin } from '../js/tracks.js';
import { PROFILS, CHAPTERS, CHAPTER_SIZE, goalFor, goalLabel } from '../js/career.js';
import { runTrack } from './lab.mjs';

const L = [];
L.push('# Fiche d\'essai — les 66 circuits', '',
  'À remplir en jouant, **un circuit après l\'autre, dans l\'ordre de la carrière** (un chapitre s\'ouvre avec 4 médailles dans le précédent). Pour essayer un circuit précis sans progresser : ouvrir la console du navigateur (F12) et taper `copytrack.playBuiltin(N)`, où N = numéro du circuit − 1.',
  'Pour chaque circuit, coche ce qui est vrai et note le meilleur temps. Le temps du pilote automatique sert de repère : **Or = son temps**.', '',
  '| Case | Question |', '| --- | --- |',
  '| Départ | le départ est clair dès la première seconde, sans réapparaître |',
  '| Passage | le passage le plus dur est dur **mais juste** (on comprend pourquoi on a raté) |',
  '| Médaille | on peut décrocher au moins l\'argent en moins de 10 essais |',
  '| Bonus | l\'objectif ★ est réalisable sans se battre contre le circuit |',
  '| Checkpoint | repartir du dernier checkpoint (touche R) ne piège jamais la voiture |',
  '| Fini | rien à changer : tu es satisfait·e de ce circuit |', '');
const tpl = {};
BUILTIN_TRACKS.forEach((d, i) => {
  if (i % CHAPTER_SIZE === 0) { const c = CHAPTERS[i / CHAPTER_SIZE]; L.push(`## Chapitre ${i / CHAPTER_SIZE + 1} · ${c.name}`, '', `_${c.desc}_`, ''); }
  const S = runTrack(buildBuiltin(d)), pf = PROFILS[d.profil];
  tpl[d.id] = [];
  L.push(`### ${i + 1}. ${d.name} — ${pf.label}, ${'◆'.repeat(d.difficulty)}${'◇'.repeat(5 - d.difficulty)}`, '',
    `- ${d.appris}`,
    `- Pilote automatique : **${S.time.toFixed(1)} s** · médailles : cristal ${d.medals.cristal} · or ${d.medals.or} · argent ${d.medals.argent} · bronze ${d.medals.bronze}`,
    `- Objectif bonus ★ : ${goalLabel(goalFor(d, i))}`,
    '- [ ] Départ  - [ ] Passage  - [ ] Médaille  - [ ] Bonus  - [ ] Checkpoint  - [ ] Fini',
    '- Mon meilleur temps : ______ s · Notes : ____________________________________________', '');
});
writeFileSync(new URL('../docs/FICHE-ESSAI.md', import.meta.url), L.join('\n'));
writeFileSync(new URL('../docs/temps-humains.json', import.meta.url), JSON.stringify(tpl, null, 1) + '\n');
console.log('docs/FICHE-ESSAI.md et docs/temps-humains.json écrits (' + BUILTIN_TRACKS.length + ' circuits)');
