# Essais humains (phase 4 de la 1.0)

Version d'essai : **bêta 0.13.0**, physique **38**. Le but : régler le jeu sur de vrais joueurs avant de geler la physique pour la 1.0.

## Ce qu'on cherche

- **Les médailles.** Elles sont calées aujourd'hui sur le pilote automatique (Or = son temps). Les premières statistiques anonymes montrent que presque
  toutes les arrivées décrochent le Cristal : les humains vont bien plus vite que le pilote, les médailles sont trop faciles. On les recale sur les
  temps des testeurs (`tools/essais.mjs`).
- **Le ressenti.** Dérapage, chocs contre les murs, contrôle en l'air, caméra, difficulté des circuits : le formulaire « Donner mon avis » du jeu.
- **Les blocages.** Où l'on bute : premières minutes, tutoriel, un circuit précis, l'ouverture des chapitres (4 médailles par chapitre).

## Les testeurs

Au moins **8**, pas tous habitués aux jeux de course :

| Il faut | Au moins |
| --- | --- |
| des joueurs qui jouent **rarement** aux jeux de course | 3 |
| des joueurs qui jouent **souvent** aux jeux de course | 3 |
| des essais au **téléphone ou à la tablette** (écran tactile) | 2 |
| des essais avec une **manette** | 1 si possible |
| des essais sous **Firefox ou Safari** (le reste sous Chrome ou Edge) | 2 |

Un testeur qui joue sur deux appareils compte comme deux (chaque appareil a son identifiant aléatoire).

## Avant de lancer

1. L'étape SQL 19 (`supabase/etape19-avis.sql`, la table des avis) est appliquée en production : sans elle, le formulaire répond « Envoi impossible ».
2. La version 0.13.0 est en ligne (demande de fusion fusionnée, GitHub Pages à jour) : le bas de l'accueil affiche « Virelo bêta 0.13.0 ».
3. Noter la **date de début** : elle sert à ne garder que les temps des essais (`--depuis`).

## Le message à envoyer (à copier)

> Salut ! Je prépare la version 1.0 de mon jeu de course, Virelo, et j'ai besoin de ton avis : https://lucjules.github.io/Copytrack/
>
> Ça se joue dans le navigateur (ordinateur, téléphone ou tablette), sans rien installer. Compte 45 minutes à une heure, en une ou plusieurs fois.
>
> 1. Au premier lancement, choisis un pseudo et **accepte les statistiques anonymes** (la fenêtre « Aider à équilibrer les circuits ? »). C'est ce qui
>    me donne tes temps, sans ton nom. Si tu l'as ratée : Paramètres › Jeu.
> 2. Joue la **carrière depuis le début**, comme tu le ferais chez toi, sans demander d'aide : au moins les deux premiers chapitres (12 circuits).
>    Rejoue un circuit autant que tu veux pour améliorer ton temps.
> 3. Laisse les **aides à la conduite** coupées (les courses assistées ne comptent pas pour les médailles).
> 4. Après quelques courses, le jeu te propose **« Donner mon avis »** (sinon : Paramètres › Donner mon avis, ou le lien en bas de l'accueil). Deux
>    minutes, et sois franc : « trop dur », « ennuyeux », « je n'ai rien compris », tout m'aide.
>
> Si tu vois un bug, envoie-moi une capture d'écran. Merci !

## Pendant les essais

- **Regarder jouer** au moins deux testeurs (un débutant, un habitué), sans rien dire : noter où ils hésitent, ce qu'ils ne comprennent pas, quand
  ils soupirent. C'est souvent plus utile que le formulaire.
- Suivre la santé du serveur : `node tools/surveillance.mjs` (avis reçus sur 24 h, erreurs, statistiques).
- La **fiche d'essai** (`docs/FICHE-ESSAI.md`, une case par circuit) reste utile pour un testeur qui veut tout passer en revue, mais elle n'est pas
  nécessaire : les temps arrivent tout seuls par les statistiques.
- Durée conseillée : une à deux semaines.

## Après les essais

Il suffit de dire « les essais sont finis ». Ensuite :

1. **Export** (lecture seule) des temps et des avis depuis la date de début, par le connecteur Supabase ou le tableau de bord (SQL Editor, puis
   « Download CSV ») :

   ```sql
   select install, track, outcome, time, progress, respawns, attempt, phys_ver, medal, created_at
   from public.run_stats where phys_ver = 38 and created_at >= '2026-11-20' order by created_at;

   select * from public.feedback where created_at >= '2026-11-20' order by created_at;
   ```

2. **Rapport** :

   ```sh
   node tools/essais.mjs --temps runs.csv --avis feedback.csv --depuis 2026-11-20 --md docs/RAPPORT-ESSAIS.md
   ```

   Il donne, pour les médailles : le niveau moyen des testeurs rapporté au pilote, la part des testeurs qui atteint chaque médaille avant et après,
   et les médailles proposées pour chacun des 72 circuits ; pour les avis : la moyenne de chaque question (tous, débutants, habitués, par appareil),
   ce qui ressort (« dérapage trop dur à tenir »…) et les textes libres.

3. **Médailles** : `node tools/essais.mjs … --ecrire` les écrit dans `js/tracks.js` (`medalsBy: 'humain'`), puis `node tools/contract.mjs --builtin`,
   `node tools/fiche-essai.mjs`, `npm run sw`, `npm run build:function` et `npm test`. La fonction `submit-score` est à redéployer (elle embarque les
   circuits). Les médailles déjà gagnées par les joueurs restent acquises. Le **circuit du jour** a ses propres médailles, calculées sur le
   pilote chaque jour (`js/daily.js`) : le rapport donne les facteurs humains à y reporter (aujourd'hui, chaque arrivée y décroche le Cristal).

4. **Ressenti** : chaque réglage demandé par les avis (dérapage, murs, air) passe par le banc de physique et les tests de non-régression. S'il
   change la physique, `PHYS_VER` monte et les temps du pilote sont remesurés (`node tools/golden.mjs --update`) ; les médailles sont recalées en
   appliquant le niveau humain mesuré aux nouveaux temps du pilote (`--pv 38 --ecrire --forcer`).

5. **Gel de la physique** : plus aucun changement de `PHYS_VER` jusqu'à la 1.0 (les records et les fantômes restent comparables).

## Comment les médailles sont calées sur 8 testeurs

Avec 8 testeurs, chaque circuit n'a que quelques temps : impossible de prendre des centiles circuit par circuit (il en faut une vingtaine,
`tools/telemetry-report.mjs`, pour quand le jeu aura beaucoup de joueurs). Mais chaque temps se compare au temps du pilote automatique sur le
**même** circuit :

> ln(meilleur temps du testeur / temps du pilote) = niveau moyen + niveau du testeur + difficulté propre du circuit + hasard

Le niveau de chaque testeur se mesure sur **tous** ses circuits à la fois ; la difficulté propre d'un circuit (« plus dur pour un humain que pour le
pilote ») n'est retenue que si plusieurs testeurs la confirment (elle est tirée vers zéro tant qu'il y a peu de temps). Les médailles visent :

| Médaille | Atteinte par |
| --- | --- |
| Cristal | les 3 % meilleurs temps des testeurs |
| Or | 15 % |
| Argent | la moitié |
| Bronze | 90 % : le bronze ouvre les chapitres, presque tout le monde doit l'avoir |

Chaque testeur compte autant, qu'il ait joué 12 circuits ou 72. Un circuit que personne n'a fini reçoit la difficulté moyenne. Il faut au moins
5 testeurs ayant fini 3 circuits et 40 temps pour écrire les médailles.

Deux filtres protègent le Cristal d'un temps qui ne dit rien du circuit, et le rapport nomme chaque circuit touché (**raccourci possible : à
regarder**) :

- les temps plus de 40 % plus rapides que le pilote (raccourci, client modifié) sont écartés (`--seuil 0.6`). Dans les statistiques de la
  physique 36, les vrais temps humains allaient de 61 à 94 % du pilote ; une installation faisait 38 % dès son premier essai sur cinq circuits ;
- un temps isolé au moins 20 % plus rapide que ce que prévoient le niveau du testeur et la difficulté du circuit (un raccourci trouvé par un seul
  testeur) est retiré avant le calcul. Un temps lent n'est jamais retiré.
