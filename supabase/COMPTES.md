# Comptes et sauvegarde cloud : installation et fonctionnement

Le jeu propose deux façons de jouer, choisies sur l'écran d'accueil (le menu n'apparaît qu'après) :

- **Invité** : un pseudo pour la session ; la progression reste dans le navigateur de l'appareil.
- **Compte** : pseudo + mot de passe ; progression, circuits créés et records sont sauvegardés dans le cloud et se
  retrouvent depuis n'importe quel appareil en se connectant. Les « Player » et « Pilote » par défaut n'existent plus.

## Installation (5 minutes, une seule fois)

1. **SQL** : Supabase > *SQL Editor* > *New query*, coller `supabase/etape4-comptes.sql`, *Run* (après les étapes 1 à 3).
2. **Auth** : *Authentication > Sign In / Providers > Email* : activer Email, **désactiver « Confirm email »**
   (les adresses sont techniques, aucun e-mail n'est envoyé). Garder *Allow anonymous sign-ins* activé (les invités
   s'en servent déjà pour la communauté). *Minimum password length* : 8.
3. **Test** : lancer le jeu, *Créer un compte*, puis se connecter avec le même pseudo depuis un autre navigateur.

### Si la création de compte répond « le serveur refuse les comptes… »

Les comptes utilisent des adresses techniques `pseudo@accounts.copytrack.invalid`. Certains projets Supabase refusent
les domaines qui ne peuvent pas recevoir de courrier (erreur `email_address_invalid`). Dans ce cas, choisir un domaine
accepté par votre projet (par exemple un domaine à vous) et le changer **aux deux endroits** :
`ACCOUNT_EMAIL_DOMAIN` dans `js/account.js` et la valeur `'accounts.copytrack.invalid'` dans la fonction
`handle_new_account()` de `etape4-comptes.sql` (puis relancer le script). Configurer un SMTP personnalisé dans
Supabase lève aussi cette vérification. Aucun e-mail n'est jamais envoyé à ce domaine.

## Sécurité

- **Mots de passe** : jamais stockés par le jeu ni dans les tables du projet. Ils transitent en HTTPS vers Supabase Auth,
  qui ne garde qu'un **hachage bcrypt salé** (`auth.users.encrypted_password`, un sel aléatoire par mot de passe).
  Réimplémenter un hachage maison serait moins sûr : c'est volontairement délégué à Auth.
- **Pseudo unique** sans tenir compte de la casse, créé par un déclencheur à l'inscription (on ne peut pas s'inscrire
  avec un pseudo et en réserver un autre). Un invité ne peut pas prendre le pseudo d'un compte.
- **Sauvegarde** (`cloud_saves`) : lisible et modifiable par son seul propriétaire (RLS). Chaque écriture porte un numéro
  de version : le jeu ne peut pas écraser une version qu'il n'a pas lue (deux appareils : lecture, fusion, nouvel essai).
- La clé `service_role` ne doit jamais figurer dans le jeu. Le jeu n'utilise que la clé publique.
- **Pas d'e-mail, donc pas de récupération de mot de passe** : l'écran de création de compte le dit clairement.
  Un mot de passe perdu = compte inaccessible (on peut en créer un autre).
- Limites d'essais : celles de Supabase Auth (page *Authentication > Rate Limits*). Rien de plus n'est ajouté ici.

## Fonctionnement des données

- Stockage local : un invité écrit dans `shardway.*` (les anciennes sauvegardes restent valables) ; chaque compte dans
  `shardwayacct.<id du compte>.*`. Les deux ne se mélangent jamais sur un même navigateur.
- Synchronisation : à la connexion, puis quelques secondes après chaque enregistrement (record, circuit, achat), au retour
  du réseau et au bouton *Synchroniser maintenant* (écran Profil). Hors ligne, le jeu continue normalement.
- Elle **fusionne** au lieu d'écraser : meilleur temps par circuit, circuits réunis (les suppressions suivent), objets et
  médailles réunis, statistiques au maximum ; les pièces ne sont jamais inventées (l'achat fait sur un autre appareil est déduit).
- Ne sont pas synchronisés : réglages de l'appareil (volume, touches, qualité), brouillon de l'éditeur.
- Création d'un compte depuis un appareil qui a déjà de la progression « invité » : case *Reprendre la progression de cet
  appareil* (cochée par défaut).
- Suppression : *Profil > Supprimer le compte* efface le compte, la sauvegarde, les circuits publiés et les temps en ligne.

## Tests

- `npm test` : client (pseudos, mots de passe, comptes, fusion, hors ligne, session expirée) avec un Supabase simulé.
- `npm run test:sql` : le script SQL sur un vrai PostgreSQL local (variables `PGHOST`, `PGPORT`, `PGUSER`), avec un faux schéma `auth`.

## Invité, code joueur, restauration (phase 4)

- **Identité en ligne de l'invité** : une session anonyme Supabase, stockée sur l'appareil (clé `online.session`). C'est ce qui lui donne ses scores et ses
  circuits publiés. **Elle ne quitte jamais l'appareil** : le *code joueur* (Profil > Exporter) n'en contient ni la session ni le profil en ligne, et importer un
  code ne les remplace jamais (les anciens codes, qui la contenaient, sont filtrés à l'import : sans cela, importer un code revenait à *devenir* le pilote qui
  l'avait exporté). Un invité ne se récupère donc pas sur un autre appareil : pour retrouver ses données ailleurs, il crée un compte (*Reprendre la progression
  de cet appareil*), ou exporte/importe son code joueur, qui transporte la **progression** (records, circuits, objets, médailles) mais pas l'identité en ligne.
- **Panne du serveur ≠ session expirée** : seul un jeton de renouvellement REFUSÉ par le serveur (400, 401, 403) déconnecte un compte ou donne une nouvelle identité
  anonyme à un invité. Réseau coupé, erreur 5xx ou trop d'essais (429) gardent la session et réessaient plus tard.
- **Restaurer une ancienne sauvegarde** (Profil > Importer, fusion ou remplacement) est un geste volontaire, plus récent que les suppressions déjà synchronisées :
  les circuits qu'elle rend (absents ou supprimés ici) sont datés de la restauration et battent leur pierre tombale ; les records qu'elle apporte sont marqués
  `rt` et survivent à une remise à zéro des records faite avant. Ce qui existait déjà garde ses dates (le plus récent gagne) ; une remise à zéro volontaire reste
  valable pour tout ce qui n'a PAS été restauré après.
- **Meilleur temps de toutes les physiques** (`bt`) : les médailles et déblocages ne redescendent pas quand une mise à jour de la physique remplace le record.

## Ce que `submit-score` vérifie (dans l'ordre)

Méthode · configuration · taille annoncée (413) · session Supabase valide (401) · cadence en mémoire de l'instance puis **cadence partagée en base** (429, `etape14`) ·
corps lu **par morceaux avec une limite stricte en octets** (le flux est annulé au-delà : `Content-Length` absent ou mensonger ne sert à rien) · forme des champs
(clé de circuit, commandes en base64, temps de 0 à 600 s, version de physique : 400) · rejeu COMPLET de la course avec le vrai code du jeu (version de physique,
circuit reconnu et de la bonne version, arrivée atteinte, temps égal à 0,5 ms près : 422) · compétition (participants et fenêtre, en base) · profil du pilote ·
meilleur temps conservé. La clé de service n'est jamais renvoyée ; les erreurs internes non plus.

**Limites connues** : une session anonyme est gratuite, donc la limite par pilote se contourne en changeant de session (le plafond global en base borne le total de
rejeux) ; `ALLOWED_ORIGIN` est `*` tant qu'il n'est pas réglé (la session Supabase est exigée de toute façon) ; le temps de l'auteur d'un circuit de joueur
(`author_time`, qui donne les médailles de ce circuit) est vérifié par le jeu à la publication mais pas rejoué par la base.
