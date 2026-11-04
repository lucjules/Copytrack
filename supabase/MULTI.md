# Multijoueur en direct : installation et fonctionnement

Jusqu'à 8 joueurs sur le même circuit, vus en **voitures fantômes** (aucune collision), chacun avec son chrono.
Menu principal > *Multijoueur* : *Créer une salle* (code de 6 caractères) ou *Rejoindre*.

## Réseau en deux temps

1. **Supabase Realtime : annuaire et signalisation seulement.** Le code de salle est le nom d'un canal
   (`copytrack-room-CODE`). Il sert à voir qui est là (présence) et à échanger quelques messages (offres WebRTC, candidats
   ICE) : de l'ordre de 10 messages par paire de joueurs, une seule fois. Aucune table, aucun script SQL.
2. **WebRTC pair à pair : tout le jeu.** Chaque joueur ouvre une liaison directe vers chacun des autres (maillage).
   Deux canaux par liaison : `state` (non fiable, 20 paquets de 38 octets par seconde) et `ctl` (fiable : circuit, départ,
   arrivée, ping). Le détail de la négociation est commenté en tête de `js/net/transport.js`.

Trafic : environ 0,8 Ko/s par liaison, rien sur Supabase pendant la course.

## À vérifier dans Supabase (une fois)

- *Realtime > Settings* : laisser **« Allow public access »** activé (les canaux de salle sont publics). Si vous le
  désactivez, il faudra des canaux privés avec une politique d'autorisation (non prévu ici).
- Limites de votre offre (connexions simultanées, messages par seconde) : à ce rythme elles ne sont pas un souci.

## Réseaux qui bloquent le pair à pair (TURN)

Les serveurs STUN publics de `ICE_SERVERS` (`js/net/transport.js`) suffisent pour la plupart des box. Un réseau
d'entreprise, ou certaines connexions mobiles, peut empêcher la liaison directe : la salle affiche alors « ✕ liaison
impossible » pour cet adversaire. Pour couvrir ces cas, ajouter un serveur TURN (payant, ou à héberger) dans
`ICE_SERVERS` : `{ urls: 'turn:…', username: '…', credential: '…' }`. Ne mettez pas un secret durable dans un jeu
statique : utilisez des identifiants temporaires fournis par votre service TURN.

## Règles de course

- Départ commun : l'hôte donne le départ, « GO » tombe au même instant chez tous (délai de 4 s, corrigé de la moitié du ping).
- **Retour au checkpoint : le chrono continue de tourner.** La voiture est téléportée, le temps perdu est la pénalité.
  Pas de pause, pas de recommencement (T) pendant la course.
- Pas de records, pièces, médailles ni classement en ligne en multijoueur : les règles du chrono y sont différentes.
- Classement final **provisoire** : chaque temps est annoncé par son joueur.
- Circuits proposés : les 66 circuits intégrés (le circuit est identifié par sa signature : même version obligatoire).

## Rendu des adversaires

- Tampon de 100 ms : chaque adversaire est affiché tel qu'il était il y a 100 ms, interpolé (position : Hermite avec les
  vitesses, orientation : slerp). Paquets perdus : interpolation linéaire, puis arrêt sur place après 0,25 s.
- Retour au checkpoint d'un adversaire : un compteur de téléportation voyage dans chaque paquet ; la voiture reste sur
  place puis **apparaît** à son nouvel emplacement, sans jamais glisser (même si le paquet de la téléportation est perdu).
- Plus un adversaire est loin de votre caméra (30 m à 260 m), plus sa voiture et son nom s'assombrissent.

## Tests

- `npm test` : paquets, interpolation, téléportation, assombrissement, protocole Phoenix (faux WebSocket), négociation WebRTC
  (faux RTCPeerConnection), salon.
- Essai à deux onglets sans serveur : `?net=local` dans l'URL (signalisation par BroadcastChannel ; le WebRTC est réel).
