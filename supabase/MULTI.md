# Multijoueur en direct : installation et fonctionnement

Jusqu'à 8 joueurs, deux modes au choix de l'hôte :
- **Course libre** : le même circuit, chacun à son rythme, vus en **voitures fantômes** (aucune collision), chacun avec son chrono (voir « Boucle de jeu asynchrone » plus bas) ;
- **Championnat** : plusieurs circuits à la suite, départ commun sur une grille, points par place, classement général, collisions douces en option (voir « Championnat »).

Menu principal > *Multijoueur* : *Créer une salle* (code de 6 caractères), *Rejoindre* par code, ou *Salons publics* (liste, sans code).

## Réseau en deux temps

1. **Supabase Realtime : annuaire et signalisation seulement.** Le code de salle est le nom d'un canal
   (`copytrack-room-CODE`). Il sert à voir qui est là (présence) et à échanger quelques messages (offres WebRTC, candidats
   ICE) : de l'ordre de 10 messages par paire de joueurs, une seule fois. Aucune table, aucun script SQL.
2. **WebRTC pair à pair : tout le jeu.** Chaque joueur ouvre une liaison directe vers chacun des autres (maillage).
   Deux canaux par liaison : `state` (non fiable, 20 paquets de 40 octets par seconde) et `ctl` (fiable : circuit, départ,
   arrivée, ping, championnat). Le détail de la négociation est commenté en tête de `js/net/transport.js`.

Trafic : environ 0,8 Ko/s par liaison, rien sur Supabase pendant la course.

## À vérifier dans Supabase (une fois)

- *Realtime > Settings* : laisser **« Allow public access »** activé (les canaux de salle sont publics). Si vous le
  désactivez, il faudra des canaux privés avec une politique d'autorisation (non prévu ici).
- Limites de votre offre (connexions simultanées, messages par seconde) : à ce rythme elles ne sont pas un souci.

## Réseaux qui bloquent le pair à pair (relais TURN)

Les serveurs STUN publics (`iceServers` de `js/config.js`) suffisent pour la plupart des box. Un réseau d'entreprise, ou certaines connexions
mobiles (NAT symétrique : 10 à 20 % des paires), empêche la liaison directe : la salle affiche alors « ✕ liaison impossible » pour cet adversaire.
Il faut pour cela un **relais TURN**. Le jeu l'obtient **à l'ouverture de chaque salle** auprès de la fonction serveur `ice`, qui fabrique des identifiants
**à durée limitée** (6 h par défaut) : aucun secret durable n'est lisible dans le jeu. Sans la fonction (ou en cas de panne), le jeu retombe sur le STUN seul, sans attendre plus de 2,5 s.

Déploiement (une fois, Supabase > Edge Functions) :
1. Nouvelle fonction **`ice`**, code = `supabase/functions/ice/index.ts` (généré : `npm run build:function`). Laisser « Verify JWT » activé (le jeu envoie sa clé publique).
2. Secrets de la fonction, **l'un ou l'autre** :
   - **Cloudflare Realtime TURN** (gratuit jusqu'à un quota généreux) : `TURN_KEY_ID` et `TURN_KEY_API_TOKEN` (créés dans le tableau de bord Cloudflare > Realtime > TURN) ;
   - **coturn auto-hébergé** : `TURN_URLS` (séparées par des virgules, ex. `turn:turn.exemple.fr:3478?transport=udp,turns:turn.exemple.fr:5349`) et `TURN_SECRET`
     (la valeur de `static-auth-secret` de coturn, avec `use-auth-secret` activé).
   Facultatifs : `STUN_URLS`, `ICE_TTL_S` (durée de vie en secondes, 600 à 86 400), `ALLOWED_ORIGIN`.
3. Rien à changer dans le jeu : `iceUrl` (`js/config.js`) vise déjà `<projet>/functions/v1/ice` ; `iceUrl: ''` désactive l'appel.

Sans secret configuré, la fonction répond 501 et le jeu n'insiste pas avant 10 minutes. Elle limite à 30 demandes par minute et par adresse.

## Championnat (manches)

L'hôte choisit *Championnat* dans le salon : nombre de manches (2 à 6), sélection de circuits (tous, faciles, moyens, difficiles, un thème), collisions douces.
Les circuits sont tirés au sort **sans doublon et du plus facile au plus dur** (circuits intégrés ou de la communauté ; pas de code de circuit envoyé).

- **Départ commun** : l'hôte annonce la manche (`round`) avec la liste des joueurs prêts, dans l'ordre de la grille (classement général ; première manche : ordre d'arrivée dans la salle) ;
  chacun démarre au même « GO » (compensé de la moitié de son aller-retour) sur sa place : quatre de front, rangées de 6 m.
- **Points** : 10, 8, 6, 5, 4, 3, 2, 1 par place, rien sans arrivée. Égalité au général : plus de victoires de manche, puis meilleure somme des places, puis identifiant.
- **Clôture d'une manche** (décidée par l'hôte, message `rend` avec le temps de chacun) : tous ont fini ou quitté, ou 30 s après la première arrivée, ou 10 minutes après le « GO ».
  Ceux qui roulent encore s'arrêtent, sans temps. Résultats + classement général pendant 12 s, puis manche suivante ; après la dernière, podium et retour au salon.
- **Pas de nouvel essai** en manche (`R` = retour au checkpoint, le chrono continue). Quitter la manche = quitter la salle (les autres continuent sans toi).
- **Classement en direct** : chaque paquet d'état porte l'avancement (0 à 1) de la voiture sur la ligne centrale du circuit (`js/net/progress.js` ; sans ligne centrale : checkpoints franchis).
- **Collisions douces** (option) : `js/net/collide.js`. Chaque voiture est un disque de 1,15 m de rayon ; chaque joueur applique SA moitié du choc à SA voiture d'après la position affichée de l'autre
  (poussée plafonnée à ~4 g, rien en looping, rien 2 s après un retour au checkpoint, rien contre une voiture arrivée). Pas de physique rejouable : aucun record n'en dépend.
- **Hôte parti** : l'identifiant le plus petit devient hôte et reprend la clôture et les départs (l'état du championnat est copié chez tous). Un joueur qui arrive en cours de route
  reçoit le championnat (`cup`), suit la manche sans la courir et part à la suivante. Un `rend` manqué est rattrapé par le résultat joint au `round` suivant.

Messages fiables : `cup` (le championnat), `round` (départ de la manche n : joueurs, noms, délai, résultat précédent), `finish` avec `rn` (mon temps pour la manche n), `rend` (manche close : temps de tous,
délai avant la suivante), `cupstop` (l'hôte arrête). **Seuls les messages de l'hôte** (`cup`, `round`, `rend`, `cupstop`) sont pris en compte ; tout est borné et vérifié à la réception.

Limite assumée : il n'y a pas de serveur de jeu, **chacun est seul juge de son temps**. Un tricheur peut annoncer un faux temps ; rien d'autre n'en dépend (ni record, ni pièces, ni classement en ligne).

## Salons publics

Cocher *Salon public* dans le salon (créateur seulement) publie une fiche (code, pseudo de l'hôte, circuit, nombre de joueurs, mode) dans un canal Realtime commun (`copytrack-room-LOBBY`, 5 lettres :
aucun vrai salon n'en a autant). *Multijoueur > Salons publics* s'y abonne **sans s'y inscrire** et liste les fiches ; un clic rejoint le salon. La fiche disparaît quand l'hôte part ou décoche.
Le canal est public : n'importe qui peut y publier une fausse fiche, qui ne mène qu'à « Salle introuvable » (les fiches sont validées, bornées à 40, et seules celles d'une version compatible sont affichées).
Aucune table, aucun script SQL.

## Boucle de jeu asynchrone (à la Polytrack)

- **Personne n'attend personne.** Chacun a son propre chrono et fait ses essais à son rythme sur le même circuit. Un joueur qui arrive
  quand la course est déjà lancée démarre tout de suite (décompte de 1,5 s).
- **Après l'arrivée : `R` (ou `T`) = nouvel essai immédiat**, sans décompte, sans menu ni salon. `T` fonctionne aussi en cours de course
  pour abandonner un essai. Les autres voient la voiture « apparaître » au départ (même mécanisme que la téléportation).
- **Retour au checkpoint (`R` en course) : le chrono continue de tourner** ; le temps perdu est la pénalité.
- Chaque arrivée est annoncée à la salle : un tableau (meilleur temps de chacun, nombre d'essais) reste affiché sans jamais bloquer le jeu.
  Un nouvel arrivant reçoit les meilleurs temps déjà réalisés.
- Échap : proposer de quitter la course (retour au salon, les autres continuent). L'hôte peut choisir un autre circuit et « Relancer
  pour tous » : chacun repart sur le nouveau circuit.
- Pas de records, pièces, médailles ni classement en ligne en multijoueur. Classement de la salle **provisoire** : chaque temps est annoncé par son joueur.

## Circuits

Choisis par l'hôte dans le salon :
- **Intégrés** : les 66 circuits du jeu.
- **Communauté** : par **ID** (le `id` d'un circuit publié ; colle-le dans le champ du salon) ou « Parcourir la communauté ». Les autres joueurs
  téléchargent le circuit eux-mêmes ; sa signature est vérifiée (tout le monde doit avoir exactement le même).
- **Code de circuit** (`SHW…` ou lien de partage) ou **Mes circuits** : l'hôte envoie le code à chacun par le canal fiable, en morceaux de
  12 Ko (jusqu'à 400 000 caractères). Attention : la publication dans la communauté est limitée à 100 000 caractères et 5000 pièces. Les morceaux sont assemblés puis vérifiés avec la signature.

## Rendu des adversaires

- Tampon de 100 ms : chaque adversaire est affiché tel qu'il était il y a 100 ms, interpolé (position : Hermite avec les
  vitesses, orientation : slerp). Paquets perdus : interpolation linéaire, puis arrêt sur place après 0,25 s.
- Retour au checkpoint d'un adversaire : un compteur de téléportation voyage dans chaque paquet ; la voiture reste sur
  place puis **apparaît** à son nouvel emplacement, sans jamais glisser (même si le paquet de la téléportation est perdu).
- Plus un adversaire est loin de votre caméra (30 m à 260 m), plus sa voiture et son nom s'assombrissent.

## Tests

- `npm test` : paquets, interpolation, téléportation, assombrissement, protocole Phoenix (faux WebSocket), négociation WebRTC
  (faux RTCPeerConnection), salon (`tools/test-net.mjs`) ; championnat, avancement, grille, collisions, annuaire (`tools/test-manche.mjs`) ; serveurs ICE et fonction `ice` (`tools/test-ice.mjs`).
- Essai à deux onglets sans serveur : `?net=local` dans l'URL (signalisation par BroadcastChannel ; le WebRTC est réel).
