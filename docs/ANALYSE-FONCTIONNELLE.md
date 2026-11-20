# Analyse fonctionnelle — ce que vit le joueur (bêta 0.13.0)

Analyse du 19 novembre 2026, faite **depuis le jeu** et non depuis le code :

- ce qu'un joueur veut faire, ce qui existe vraiment, ce qui gêne, ce qui manque ;
- point de départ : le retour d'expérience de l'éditeur (caméra qui tremble, boutons « noir sur noir », néons décalés, moto, modes « en gros
  pâté », déclencheurs de messages, publication), puis tout le reste.

> **Avancement.** La phase A (urgences et défauts visibles) est faite en **0.13.1**, à trois exceptions près, qui demandent une action de l'éditeur :
> l'étape SQL 19 (U1), le relais TURN (U2) et le redéploiement de `submit-score` (U3). Phase C (fondations du multijoueur) faite en **0.14.0**, sauf le
> relais TURN : lien d'invitation, salon en grand, prêt, course à départ commun, revanche, apparence des voitures, connexion impossible expliquée.
> Phase B (parcours du joueur) faite en **0.15.0** : pause complète, « Continuer la carrière », écran Modes à onglets et « jouer ce circuit en mode… »,
> garage en entrée principale et onglets en quatre familles, première course guidée, mini-carte, « mauvais sens ».

**Méthode.**

- **Parcours automatisé** du jeu comme un joueur (navigateur réel, `?net=local` pour le multijoueur à deux onglets) : accueil, menus, course,
  pause, arrivée, relecture, garage, éditeur, modes, académie, défi du jour, communauté, multijoueur.
  - Appareils : ordinateur 1280×720, téléphone en paysage 844×390, téléphone en portrait 390×844.
  - Couleurs : les 6 thèmes, schéma du système clair et sombre.
- **Mesures** :
  - caméra image par image sur 16 circuits, à 60 et à 144 images par seconde, avec et sans secousses ;
  - néons et moto rendus sous quatre angles ;
  - contraste de chaque bouton visible dans chaque thème.
- **Production en lecture seule** (connecteur Supabase) : journaux des fonctions serveur, publications, configuration du multijoueur.
- **Publication testée de bout en bout** avec un serveur simulé.

Les scripts de mesure sont gardés hors du dépôt. Ils deviendront des tests au moment des corrections.

---

## 1. Urgences : en production maintenant

| # | Problème | Ce que voit le joueur | Action |
| --- | --- | --- | --- |
| U1 | **Étape SQL 19 non appliquée**, alors que la 0.13.0 est en ligne depuis le 19/11 à 19 h 55 | « Donner mon avis » répond « Envoi impossible » ; la fenêtre « Ton avis compte » s'ouvre après 6 courses et échoue | Appliquer `supabase/etape19-avis.sql` (accord déjà donné ; la confirmation Supabase n'a pas eu de réponse, deux fois) |
| U2 | **Aucun relais TURN configuré** : la fonction `ice` répond 501 « Aucun relais TURN configuré » | Multijoueur en connexion directe seulement : « ✕ liaison impossible » fréquent en 4G et sur les réseaux d'école ou d'entreprise | Choisir un service de relais et régler ses secrets (`TURN_URLS`, `TURN_SECRET`) |
| U3 | `submit-score` pas redéployée depuis la 0.12.3 | Rien de visible aujourd'hui (même physique 38) ; seule son empreinte de build diffère | Redéployer avant tout recalage de médailles (la fonction embarque les circuits) |

---

## 2. Défauts constatés, avec la cause trouvée

Gravité : **B** bloquant ou très gênant, **G** gênant, **F** finition.

### Caméra : « parfois elle tremble »

| # | Constat (mesure) | Cause | Gravité |
| --- | --- | --- | --- |
| C1 | **À 144 images/s, les à-coups de rotation sont 5 à 6 fois plus forts qu'à 60** (centile 99 de 11-103 à 18-537 selon le circuit). Même chose dès que le nombre d'images par seconde varie. | La voiture est interpolée entre deux pas de physique, mais pas le reste. La caméra suit des valeurs brutes de la physique qui avancent par paliers de 1/120 s : cap, direction de la vitesse, compensation de vitesse, pente, anticipation. Sur un écran 120/144 Hz ou une image irrégulière, chaque image reçoit 0, 1 ou 2 pas. | **B** |
| C2 | **Secousse aléatoire** à chaque accélérateur traversé (0,25), choc, réception et retournement. Sur les circuits à boosters, elle est quasi permanente. | Bruit blanc tiré à chaque image, donc plus fort quand il y a plus d'images. Les boosters déclenchent une secousse alors que ce n'est pas un choc. | **G** |
| C3 | **À-coups à l'entrée et à la sortie des loopings, tubes et murs** (pics de 1 000 à 6 000 m/s² : Spirale, Vrille, Néons, Serpent). | Changement brusque de logique de caméra (mode « ruban »), avec des vitesses de rattrapage différentes. | **G** |
| C4 | **Caméra remontée d'un coup** au-dessus du sol (pics de 5 000 à 29 000 m/s² sur Lagon et Garde). | Plancher « jamais à moins de 1,2 m du sol sous la caméra » appliqué brutalement, sans lissage. | **G** |
| C5 | La caméra « sous un pont » change de hauteur et de distance en tout ou rien. | Bascule sans transition. | **F** |

### Interface

| # | Constat | Cause | Gravité |
| --- | --- | --- | --- |
| I1 | **Boutons « noir sur noir »** : les tuiles et boutons des menus sont bleu nuit et sans bord. Ils ne se détachent que grâce au décor 3D derrière eux. Sur un décor sombre, ou avec les thèmes Crépuscule et Forêt, ils disparaissent (écart mesuré 1,11 à 1,14, il faut au moins 1,5). | Fond de bouton fixe, non redéfini par ces thèmes ; aucun bord ni ombre. Ce n'est pas le cache. | **B** |
| I2 | **Un onglet ouvert ne reçoit jamais la nouvelle version**. Il peut même mélanger anciens et nouveaux fichiers chargés à la demande (écrans ouverts plus tard) : affichages bizarres, boutons sans style. | Aucun contrôle de version ni bandeau « Nouvelle version : recharger ». | **G** |
| I3 | **Fenêtre d'arrivée coupée sur téléphone en paysage** : la rangée « Revoir la course · Partager · Classement · Fiche » sort de l'écran. | Fenêtre plus haute que l'écran, sans défilement. | **G** |
| I4 | **Éditeur (ordinateur) : le panneau d'options de la pièce recouvre le bas de la palette** (la famille Acrobaties est à moitié cachée). | Panneau superposé au lieu d'être rangé. | **G** |
| I5 | Le bouton **Carrière** ouvre un écran qui commence par le défi du jour et la saison de la semaine ; les chapitres sont plus bas. | Trois contenus mêlés sur un même écran. | **G** |
| I6 | La **pause** ne propose que Reprendre, Recommencer et Quitter. | Pas de réglages, caméra, commandes ni retour au checkpoint depuis la pause. | **G** |
| I7 | **Modes de jeu « en gros pâté »** : les 6 modes fournis, mes modes et 4 boutons (créer, importer, publiés, paquets) sont dans une seule fenêtre en liste. Descriptions minuscules, boutons « Jouer » rejetés à droite. | Fenêtre unique au lieu d'un écran à onglets. | **G** |
| I8 | **Garage** rangé dans « Profil », avec 14 onglets (Carrosserie, Couleurs, LED, Dessins, Ornements, Ailerons, Roues, Finition, Moto, Traînée, Klaxon, Atelier, Presets, Collections). | Pas d'entrée principale, onglets non regroupés. | **F** |
| I9 | **Tutoriel** : trois pages de texte par-dessus le menu, juste après le pseudo. On apprend à lire, pas à conduire. | La première course n'est pas guidée. | **G** |

### Véhicules

| # | Constat | Cause | Gravité |
| --- | --- | --- | --- |
| V1 | **Néons décalés**. Les barres lumineuses sortent sur les côtés, au-delà des roues, et dépassent largement des carrosseries étroites (kart, monoplace). Le halo est plus grand que la voiture. | Une seule taille pour les 17 carrosseries : halo de 3,8 × 6,2 m, barres à ±1,33 m alors que le bord extérieur des roues est à ±1,22 m. | **G** |
| V2 | **Moto : les barres néon flottent dans le vide**, à 0,6 m de chaque côté d'une moto large d'environ 0,3 m. | Même fonction, réglage fixe 1,7 × 4,2 m. | **G** |
| V3 | **Moto : les jantes néon sont invisibles**. | Anneau de rayon 0,42 m caché dans un pneu de 0,5 m. | **F** |
| V4 | **Pilote de la moto inachevé** : pas de jambes, avant-bras détachés, mains loin du guidon, tête en boule. | Modèle simplifié. | **G** |
| V5 | Les voitures des autres joueurs (multijoueur) ont une couleur de joueur, **pas leur apparence du garage**. | Seule la couleur est transmise. | **G** |
| V6 | Pas de phares : les circuits de nuit et la brume se roulent sans lumière à l'avant. | Fonction absente. | **F** |

### Publication d'un circuit (« bug lors de la publication ? »)

- **Côté serveur**, tout va bien :
  - toutes les requêtes `submit-score` des dernières 24 h ont réussi ;
  - 19 circuits publiés, dont 4 cette semaine, le dernier le 19/11 au matin.
- **Côté jeu** : le parcours complet, testé avec un serveur simulé, fonctionne :
  - circuit vérifié avec une vraie course ;
  - « Publier » ouvre la fenêtre, refus clair si la case n'est pas cochée ;
  - envoi correct (session, pseudo, fonction serveur), message « est publié ! ».
- **Petits défauts trouvés** :
  - P1 (**G**) : après un **échec** d'envoi, le jeu quitte quand même l'écran de vérification (la réussite et l'échec sont traités pareil). Le message d'erreur ne reste que 4 s, et il faut recommencer depuis « Mes circuits ».
  - P2 (**F**) : fermer la fenêtre de publication avec Échap laisse le joueur sur l'écran d'arrivée sans fenêtre.
- **La « publication » du site** (GitHub Pages) a échoué une fois, le 18/11. Cause : deux mises en ligne lancées en même temps. La suivante est passée ; rien à corriger dans le jeu.

**À préciser avec l'éditeur** : si le bug vu concerne un autre écran (publication d'un mode, d'une playlist, modification du nom après coup), il faut savoir lequel. Les modes et les playlists n'ont pas été testés de bout en bout ici.

---

## 3. Par domaine : ce que le joueur veut, ce qui existe, ce qui manque

### Premières minutes

- **Existe** : pseudo invité ou compte, tutoriel en 3 pages, Académie (6 leçons et exercices notés), course rapide en un clic.
- **Manque** :
  - une **première course guidée**, qui apprend en conduisant ;
  - l'Académie proposée au bon moment (après un échec répété) ;
  - un choix « débutant / habitué » qui règle les aides et la difficulté de départ.

### Menus et navigation

- **Existe** : 6 tuiles, puis des sous-panneaux de 3 à 8 entrées ; le clavier et la manette parcourent tout.
- **Manque** :
  - des boutons lisibles sur tous les décors et thèmes (I1) ;
  - le **garage en entrée principale** ;
  - une **Carrière** qui montre les chapitres d'abord, avec le défi du jour et la saison à part ;
  - un bandeau **« nouvelle version »** (I2) ;
  - un fil d'Ariane ou des retours cohérents, car certains écrans sont des fenêtres et d'autres des pages.

### Course

- **Existe** :
  - chrono, checkpoints, retour au checkpoint (R), recommencer (T) ;
  - fantômes (record, or, rival, partagé), HUD d'entraînement avec écarts et secteurs ;
  - relecture avec caméras, analyse, export vidéo ;
  - catégories (départ moto, bateau, deltaplane, pluie, profils), météo, aides à la conduite, vibrations.
- **Manque** :
  - **mini-carte en course**, avec fantômes et adversaires ;
  - indicateur **« mauvais sens »** ;
  - **pause complète** : réglages, caméra, commandes, retour au checkpoint, voir le circuit ;
  - **mode photo** ;
  - **phares** ;
  - **direction par inclinaison** du téléphone ;
  - **adversaires pilotés par l'IA** : le pilote automatique existe déjà, il peut devenir des concurrents à plusieurs niveaux. Aujourd'hui, la seule façon de courir « contre quelqu'un » hors ligne, ce sont les fantômes.

### Caméra

- **Existe** : poursuite, capot, caméras personnalisées (distance, hauteur, regard, champ de vision), anticipation dans les virages, visée de la réception pendant les sauts, retournement au plafond.
- **À refaire** :
  - C1 à C5 ;
  - un **réglage « rigidité »** (de collée à souple) ;
  - une caméra « cockpit » ou « pare-chocs » ;
  - une **vue arrière** (regarder derrière, utile en multijoueur).

### Véhicules et garage

- **Existe** : 17 carrosseries, moto, bateau, deltaplane, peinture, dessins, néons, ailerons, roues, finitions, traînées, klaxons, atelier libre, préréglages, collections.
- **À corriger** : V1 à V5.
- **Manque** : le garage visible par les autres (multijoueur, classements, fiche de joueur) et un aperçu « en course » dans le garage (sur la route, de nuit).

### Carrière, défis et progression

- **Existe** :
  - 72 circuits en 12 chapitres, médailles, objectifs bonus ;
  - défi du jour avec série, saison de la semaine ;
  - niveaux et licences, titres, déblocages, statistiques.
- **Manque** :
  - un écran Carrière lisible (I5) ;
  - les médailles recalées sur les vrais joueurs (phase 4 du plan de la 1.0, en cours) ;
  - des **objectifs du jour ou de la semaine** affichés à l'accueil (« finis 3 circuits en Or ») pour donner une raison de revenir.

### Modes de jeu

- **Existe** :
  - 6 modes fournis (Sauts lunaires, Pieds de plomb, Route libre, Tout en moto, Départ lancé, Marathon) ;
  - modes personnels jusqu'à la limite, publication, paquets (mods), règles de partie en multijoueur.
- **Manque** :
  - un **écran Modes** à onglets (Fournis · Mes modes · Publiés · Paquets), avec une **carte par mode** (image, règles en pictogrammes, objectif) et le choix du circuit dans la foulée ;
  - un **bouton Modes avec menu déroulant** dans la fiche d'un circuit (« jouer ce circuit en mode… »).

### Éditeur

- **Existe** :
  - 52 pièces de base (449 variantes), peinture, décors, sélection, inspecteur, gomme ;
  - pièces mobiles, groupes et calques, préfabriqués, ambiance (nuit, brume), logique « événement → conditions → actions », déclencheurs ;
  - test depuis n'importe quelle pièce, vérification et publication, éditeur guidé.
- **Manque** :
  - **Déclencheurs posés comme des objets** : aujourd'hui, un message ou un effet se règle dans une fenêtre à part en **tapant les coordonnées de la case en chiffres**. Il faudrait une zone visible dans la scène, sélectionnable, réglée dans l'**inspecteur** : texte du message, durée, couleur, son, effet, une fois ou à chaque passage, condition (tour, véhicule, compteur).
  - **Règles de logique accessibles depuis l'inspecteur** : clic sur une pièce ou un groupe, puis « quand la voiture passe ici… ».
  - **Pièces plus réglables** :
    - virages à angle et rayon libres, pentes à hauteur libre, inclinaison continue ;
    - tremplins réglables (angle, longueur) ;
    - accélérateurs réglables (force, durée) ;
    - murs et barrières à hauteur et longueur choisies.
  - **Nouvelles pièces** : à choisir ensemble à partir de l'inventaire des familles. Pistes : portails de téléportation, checkpoints à ordre libre, tremplins à jet, pièces destructibles visuelles.
  - Panneau d'options rangé (I4).

### Multijoueur (priorité de l'éditeur)

**Ce qui existe et marche** :

- salons de 2 à 8 joueurs par code à 6 caractères, liste des salons publics ;
- deux modes :
  - **course libre** : chacun à son rythme, voitures fantômes ;
  - **championnat** : 2 à 6 manches, grille de départ, points, collisions douces en option ;
- règles de partie (gravité, hors piste…), noms au-dessus des voitures, classement de manche en direct ;
- reconnexion après une coupure, latence affichée ;
- compétition (duels entre amis, tournois) et amis par compte.

**Ce qui ne va pas** :

- **U2** : pas de relais TURN, donc beaucoup de joueurs ne peuvent tout simplement pas se connecter ;
- tout se passe **dans des fenêtres** posées sur le menu : salon, résultats, « podium » ;
- pas de **course simple à départ commun** : le mode libre, ce sont des fantômes, et le championnat impose au moins 2 manches ;
- **personne n'est « prêt »** : l'état existe dans le code, mais l'interface ne s'en sert pas ; l'hôte lance quand il veut ;
- en course, l'avancement des autres est affiché en **pourcentage**, sans écart en secondes ni mini-carte ;
- les autres voitures n'ont pas leur apparence (V5).

**Ce qui manque**, du plus important au moins important :

1. **Relais TURN** (U2).
2. **Lien d'invitation** : bouton « Copier le lien », adresse qui ouvre directement le salon, code QR sur téléphone. **Inviter un ami** depuis la liste d'amis.
3. **Salon plein écran** :
   - la voiture de chaque joueur avec son apparence, son pseudo, son titre et sa latence ;
   - état **Prêt / Pas prêt**, départ quand tout le monde est prêt (ou lancé par l'hôte) ;
   - aperçu du circuit choisi ;
   - **émotes et messages rapides** (« GG », « Encore une ! », « Attends-moi »).
4. **Course simple à départ commun**, avec nombre de tours au choix, distincte du championnat.
5. **En course** : **position en direct** (1er, 2e…), **écart en secondes** avec le précédent et le suivant, **mini-carte** des adversaires, annonce des dépassements.
6. **Après la course** :
   - **podium en 3D** ;
   - **« Revanche »** et **« Circuit suivant » votés** ;
   - temps, meilleur tour, comparaison des tracés.
7. **Partie rapide** : un bouton qui trouve un salon public ou en crée un. Quand il y a peu de monde, **compléter avec des voitures pilotées par l'IA** ou des fantômes de bons joueurs, pour qu'une partie démarre toujours.
8. **Spectateur** pour ceux qui ont fini ou qui arrivent en cours de course : caméra sur le premier, changement de joueur.
9. **Outils de l'hôte** : exclure, passer la main, fermer le salon aux nouveaux, places maximum, circuit au hasard, **vote du circuit** parmi 3 proposés (avec vignettes), playlist de salon.
10. **Modes multijoueur** :
    - **élimination** : le dernier à chaque tour sort ;
    - **par équipes** : points cumulés ;
    - **contre-la-montre en direct** : meilleur temps en N minutes, classement en temps réel ;
    - **poursuite / chat**.
11. **Fiabilité** : avertissement clair quand un joueur ne peut pas se connecter (cause et que faire), mesure de la qualité de liaison avant la course, test automatique à deux onglets pour chaque mode.

### Communauté et social

- **Existe** :
  - circuits publiés (récents, populaires, plus joués, cette semaine, abonnements, mes publications, sélection, pour toi, au hasard) ;
  - playlists, commentaires, statistiques par circuit, signalement, classements mondiaux, par secteur et entre amis, abonnements.
- **Manque** :
  - une **fiche de joueur** publique (ses circuits, records, voiture, titres) ;
  - le **partage d'un clip ou d'une image** en un geste (la vidéo existe, mais elle est cachée dans la relecture) ;
  - des **notifications** (« ton record a été battu », « nouveau circuit d'un auteur suivi »).

### Son

- **Existe** : moteur, effets, musique synthétisée, klaxons, réglages de volume.
- **Manque** : plusieurs ambiances musicales, un son par véhicule (moto et bateau), le son d'un adversaire qui passe en multijoueur.

### Téléphone, tablette, manette

- **Existe** :
  - boutons tactiles, mode glisser pour diriger, accueil adapté au portrait et au paysage, demande de passer en paysage pour la course et l'éditeur ;
  - manette dans les menus et en course, touches reconfigurables.
- **Manque** : I3, direction par inclinaison, taille et position des boutons tactiles réglables en course, éditeur pensé pour le tactile (aujourd'hui seulement en paysage, dense).

---

## 4. Ce qui manque, classé

**Indispensable** (attendu par tout joueur d'un jeu de course, ou bloquant) :

- caméra stable (C1 à C4) ;
- boutons lisibles (I1) ;
- relais TURN et lien d'invitation ;
- salon plein écran avec « prêt » ;
- course multijoueur à départ commun, avec positions en direct ;
- revanche ;
- pause complète ;
- bandeau de nouvelle version ;
- néons et moto corrigés ;
- fenêtres qui tiennent dans l'écran du téléphone.

**Fort intérêt** :

- adversaires IA ;
- mini-carte ;
- « mauvais sens » ;
- écran Modes à onglets et « jouer en mode… » depuis la fiche ;
- Carrière lisible ;
- première course guidée ;
- déclencheurs et logique dans l'inspecteur ;
- pièces réglables ;
- partie rapide avec IA pour compléter ;
- apparence des voitures en multijoueur ;
- objectifs du jour ;
- fiche de joueur.

**Bonus** :

- mode photo ;
- phares ;
- inclinaison du téléphone ;
- spectateur ;
- modes multijoueur élimination et équipes ;
- émotes ;
- vote de circuit ;
- notifications ;
- nouvelles pièces ;
- ambiances musicales ;
- écran partagé à deux sur un même ordinateur.

---

## 5. Découpage proposé en phases

Aucune de ces phases ne change la physique, sauf mention : les records, fantômes et médailles restent valables.

| Phase | Contenu | Dépend de l'éditeur |
| --- | --- | --- |
| **A. Urgences et défauts visibles** | U1, U3 ; caméra C1 à C5 (lissage de tout ce qu'elle suit, secousse douce et indépendante du nombre d'images, transitions des loopings et du plancher) ; boutons lisibles dans les 6 thèmes et sur tout décor (bord, fond adapté, test de contraste sur décor sombre) ; bandeau « nouvelle version » ; néons ajustés à chaque carrosserie et à la moto ; pilote de moto ; fenêtres du téléphone ; panneau de l'éditeur ; P1 et P2 | Feu vert pour l'étape 19 |
| **B. Parcours du joueur** | Pause complète ; Carrière (chapitres d'abord) ; écran Modes à onglets et « jouer en mode… » ; garage en entrée principale, onglets regroupés ; première course guidée ; mini-carte ; « mauvais sens » | — |
| **C. Multijoueur, fondations** | Relais TURN ; lien d'invitation et QR ; salon plein écran (voitures avec leur apparence, prêt, aperçu du circuit) ; course simple à départ commun ; positions et écarts en direct ; podium, revanche et circuit suivant votés ; messages d'erreur de connexion clairs | Choix et secrets du service de relais |
| **D. Multijoueur, vie des salons** | Partie rapide ; IA ou fantômes pour compléter ; spectateur ; outils de l'hôte et vote du circuit ; invitations d'amis ; émotes ; modes élimination, équipes et contre-la-montre en direct | — |
| **E. Contenu solo** | Adversaires IA (à partir du pilote automatique, plusieurs niveaux) ; objectifs du jour ; mode photo ; phares ; inclinaison du téléphone ; fiche de joueur | — |
| **F. Éditeur** | Déclencheurs en objets réglés dans l'inspecteur ; logique depuis l'inspecteur ; pièces réglables (angle, rayon, hauteur, force) ; nouvelles pièces choisies ensemble | Liste des pièces voulues |
| **G. Reprise des essais** | Les essais humains de la phase 4 de la 1.0 sur la version corrigée, puis médailles et gel de la physique | Testeurs |

Ordre conseillé : **A**, puis **C** (le multijoueur est la priorité et dépend d'un choix externe), puis **B**, **D**, **E**, **F** et **G**. Les essais humains gagnent à se faire après A et B : les testeurs jugeront le jeu corrigé, pas ses défauts connus.
