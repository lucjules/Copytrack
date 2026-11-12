# Phase 5 — sécurité du backend et préparation à la production (version 0.9.64, `PHYS_VER` 35 inchangé)

Objectif : que les comptes, les scores et les données des joueurs ne puissent pas être détournés par les manipulations courantes, et que le jeu puisse être mis en production sans rien exposer.
**Rien n'a été déployé, aucune donnée Supabase de production n'a été lue ni modifiée.** Les migrations et le paquet de la fonction sont prêts ; leur application attend ton autorisation (voir « En attente », §7).

## 0. Méthode (comment les failles ont été trouvées)

Les tests SQL existants tournaient sur un PostgreSQL « nu » : ils ne reproduisaient pas les **droits par défaut de Supabase** (tout objet créé dans `public` est accordé à `anon` et `authenticated`), qui sont pourtant ce qui rend un oubli de `revoke` exploitable. Cette phase :

1. reconstruit une base **façon Supabase** (rôles `anon` / `authenticated` / `service_role`, droits par défaut, RLS active, faux schéma `auth`) et y applique les **17 étapes** (1 à 15, 15b, 16, 17), deux fois chacune ;
2. **inventorie les droits réels** : 27 tables (RLS partout), 73 fonctions (lesquelles sont appelables sans session, lesquelles sont réservées au serveur, lesquelles fixent leur `search_path`) ;
3. **attaque** en tant que joueur A contre les données de B, en tant que `anon`, et en appelant chaque fonction réservée au serveur ; chaque attaque a un **témoin positif** (le même geste marche pour le propriétaire) ;
4. **charge** en sessions réelles simultanées (huit pilotes, six manches) pour les compteurs ;
5. relit les deux fonctions serveur (`submit-score`, `ice`), le client (`account.js`, `online.js`, écrans en ligne) et le dépôt (secrets, historique Git, politique de contenu).

## 1. Failles confirmées et corrigées

Chaque ligne a été **reproduite avant correction** : `AVANT=1 tools/test-securite-sql.sh` rejoue les attaques sans l'étape 17 et doit voir échouer les contrôles « FAILLE » (12 sur 16 échouent ; le contrôle de concurrence est non déterministe et peut passer par chance, 7 sur 8 j'aime / 6 sur 8 signalements ont été mesurés).

| # | Faille | Gravité | Preuve | Correction |
|---|---|---|---|---|
| 1 | **Un circuit masqué par la modération se rétablissait tout seul** : `report_track` écrivait `hidden = (n >= 3)`. L'auteur d'un circuit masqué le signalait lui-même et le rendait visible. | Moyenne (contournement de la modération) | `FAILLE 1` | `hidden = hidden or n >= 3` : seul `mod_hide` rétablit (étape 17 §1) |
| 2 | **Trois sessions invitées masquaient le circuit de n'importe qui** (sessions gratuites, profil de plus de 24 h) | Moyenne (censure) | `FAILLE 2` | seuls les **comptes** comptent (comme pour commentaires et modes) ; le signalement d'un invité est enregistré, sans masquer |
| 3 | On pouvait **signaler son propre circuit** | Faible | `FAILLE 3` | refusé (« C'est ton propre circuit. ») |
| 4 | **`mode_played` gonflait sans limite** le compteur qui CLASSE les modes publiés : `select mode_played(1)` en boucle | Moyenne (classement truqué) | `FAILLE 4` (300 appels → 300 parties) | une partie par pilote, par mode et par heure (table `mode_plays`) |
| 5 | **`is_moderator(uuid)` / `is_account(uuid)` interrogeables par `anon`** avec un identifiant quelconque (les identifiants de pilotes sont publics : `scores.player`) : on pouvait **lister les modérateurs** | Faible (information, ciblage) | `FAILLE 5`, `5b` | plus appelables par le jeu (qui ne les appelle jamais) ; les fonctions serveur qui s'en servent continuent de marcher |
| 6 | **`log_runs` ouverte à `anon` sans session** : plafond de 3 000 lignes par MINUTE = **4 millions de lignes par jour** avec des identifiants d'installation inventés | Moyenne (saturation du stockage) | `FAILLE 7` | plafonds horaire (20 000) et quotidien (100 000) tous appelants ; index sur `created_at` |
| 7 | **Aucun plafond total de circuits publiés** par auteur (seule la cadence de 10 par heure) : 240 circuits de 100 Ko par jour et par session gratuite | Moyenne (stockage) | `FAILLE 8` | 100 par auteur ; refus clair « 100 au plus » (422 `trackCap`) |
| 8 | **Fantômes sans budget** : 2 000 records × jusqu'à 800 Ko par pilote (≈ 1,6 Go) | Moyenne (stockage) | `FAILLE 9` | budget de 40 Mo de fantômes par pilote ; le **record est toujours enregistré**, seul son fantôme est omis au-delà |
| 9 | **Compteurs perdus sous concurrence** : `tracks.likes` = 7 pour 8 lignes, `tracks.reports` = 6 pour 8 lignes (comptage avant validation des transactions voisines, puis écrasement) ; le seuil de masquage pouvait être manqué | Faible à moyenne (intégrité) | `FAILLE 10` (6 manches de 8 pilotes) | un verrou par circuit / commentaire / mode (`toggle_like`, `report_track`, `comment_report`, `mode_report`) |
| 10 | `settle_due`, `close_due_seasons`, `in_tournament` **appelables sans session** | Faible | `FAILLE 6` | réservées aux sessions (le jeu ne les appelle qu'avec la sienne) |
| 11 | `random_track(avoid)` : liste « à éviter » non bornée (un balayage par circuit et par identifiant) | Faible | smoke test | bornée à 200 |
| 12 | **Fonctions serveur sans délai** sur leurs appels à Supabase : une base lente laissait la fonction pendre ; une panne répondait « erreur interne » (500) au lieu de « réessaie » | Fiabilité | `test-submit-handler`, `test-ice` | délai de 8 s, **503 + `Retry-After`** (authentification, base, relais) ; le renvoi est idempotent (testé) |
| 13 | **Aucune politique de contenu (CSP)** : un texte venu d'un autre joueur qui échapperait à `esc()` volerait la session (jeton en `localStorage`) | Défense en profondeur | `test-securite-client` | CSP dans `index.html` : scripts du site seulement, ni script ni gestionnaire en ligne, ni `eval` ; seuls serveurs extérieurs : Supabase et Google Fonts |

## 2. Ce qui a été examiné et trouvé correct (avec preuve)

* **RLS active sur les 27 tables** ; `anon` n'a **aucune écriture** (table ni colonne) ; `authenticated` n'a que `cloud_saves` (insérer / modifier SA ligne), `tracks` (supprimer SES circuits) et `players` (colonnes `id`, `name`) — liste exacte vérifiée (`A1` à `A5`).
* **Un joueur contre un autre** (`B0` à `B18`, avec témoins) : sauvegarde cloud d'autrui illisible, non modifiable, non supprimable, et on ne peut pas changer l'identifiant de SA ligne pour usurper (le déclencheur `cloud_saves_touch` le neutralise : testé sur l'état final) ; comptes, profils (`created_at`, `title` fermés), circuits, j'aime, records (aucune écriture directe, jamais les colonnes `inputs` ni `ghost`), amis, duels, tournois et playlists privées d'autrui invisibles ; fonctions sur les ressources d'autrui refusées ; **rien n'a changé chez la victime**.
* **Fonctions réservées au serveur** (`submit_best`, `publish_track`, `rate_check`, `competition_open`, `best_time`, `settle_duel`, `close_season`, `close_tournament`, `rate_purge`…) : refusées à `anon` **et** `authenticated` (`A8`, `B19`, `B20`).
* **Sans session** : aucune fonction de joueur, aucune donnée privée ; la liste exacte des 19 fonctions appelables sans session est verrouillée (`A9`) — un oubli futur de `revoke` fait échouer le test.
* **Toute fonction « security definer » fixe son `search_path`** (`A10`).
* `submit-score` : identité = celle que **Supabase Auth reconnaît au jeton** (jamais le corps : `player`, `uid`, `p`, `is_anonymous`… ignorés, testé), la clé de service ne sert jamais de jeton de joueur et ne sort dans aucune réponse (succès, refus, panne), types détournés / clés hostiles / JSON hostiles refusés avant tout calcul, **fail-closed** si la limite en base est indisponible, taille bornée avant lecture, rejeu serveur = vérité.
* `ice` : session obligatoire, limite en base, 503 (jamais « ouvert ») si mal configurée.
* **Échappement** des textes venus d'autres joueurs : les 9 modules d'écrans en ligne sont contrôlés statiquement (garde avec essai à blanc) ; `ui.modal` et `ui.flash` écrivent en `textContent`.
* **Secrets** : aucun JWT, clé secrète, jeton d'accès, clé privée ou secret TURN dans les fichiers suivis **ni dans l'historique Git** ; la seule clé du dépôt est la clé PUBLIQUE (`sb_publishable_…`).
* **Supabase Storage** : non utilisé (aucun appel `storage/v1`, aucun bucket dans les migrations). S'il existe un bucket dans le projet, il ne vient pas de ce dépôt : à vérifier dans le tableau de bord (§7, réglages).
* Suppression de compte (`delete_account`) : seulement SON compte, refusée à un invité, cascade vérifiée (`E1`, `E2`).

## 3. Protections ajoutées

`supabase/etape17-securite.sql` (9 correctifs, idempotente, aucune donnée supprimée) ; délais et 503 dans les deux fonctions serveur ; CSP ; `tools/test-securite-sql.sh` (rejoue les attaques, avec `AVANT=1` sans l'étape 17), `tools/test-securite-client.mjs` ; lignes de `verify-prod.sql` pour l'étape 17 (version corrigée de chaque fonction, droits de `is_moderator`/`is_account`, fonctions appelables sans session hors liste, écritures de `anon`, RLS partout).

Aucune restriction ne touche un joueur normal : un joueur a 5 Mo de fantômes (budget : 40 Mo), publie quelques circuits (plafond : 100), joue quelques centaines de parties par heure.

## 4. Tests de sécurité exécutés

| Test | Résultat |
|---|---|
| `tools/test-securite-sql.sh` (PostgreSQL 16, droits par défaut de Supabase, étapes 1 à 17 appliquées deux fois) | **67 contrôles réussis** : droits, attaques d'un joueur contre un autre, sans session, 10 familles de failles corrigées, abus, concurrence (6 manches de 8 pilotes) |
| `AVANT=1 tools/test-securite-sql.sh` (sans l'étape 17) | les failles sont **détectées** : 12 contrôles « FAILLE » sur 16 échouent |
| `tools/test-submit-handler.mjs` | + 13 tests (jeton, identité, cadence, clés et corps hostiles, types détournés, fuites de secrets, CORS, 503 / délai / idempotence, plafond de circuits) ; **mutations** : en faisant lire `body.uid` ou en utilisant la clé de service comme jeton, les tests échouent |
| `tools/test-ice.mjs` | + délai et 503 |
| `tools/test-securite-client.mjs` | 14 tests : CSP ↔ `js/config.js`, pas de script ni gestionnaire en ligne, pas de code dynamique, aucun hôte tiers, aucun secret (arbre + chemins sensibles), échappement des écrans en ligne |
| Suite complète, lint, Deno, 5 suites navigateur (CSP active) | voir le compte-rendu final |

## 5. Incompatibilités possibles

* **Signalements d'invités** : ils ne masquent plus un circuit à eux seuls (voulu).
* **Auteurs de plus de 100 circuits** : ils ne pourront plus en publier d'autres, sans rien perdre (14 circuits publiés au 11 novembre : aucun cas connu).
* **Fantômes au-delà de 40 Mo par pilote** : le record est enregistré sans fantôme (aucun cas connu).
* **Hébergement personnalisé** : la CSP bloque un `<script>` en ligne (la configuration `COPYTRACK_CONFIG` par script de `js/config.js`) et tout serveur autre que celui de `js/config.js` : modifier `DEFAULTS` dans `js/config.js` **et** `connect-src` dans `index.html` (un test échoue si les deux divergent).
* **Anciens clients** (≤ 0.9.63) : compatibles avec la base après l'étape 17 (aucune signature de fonction changée) et avec la fonction serveur (ils reçoivent un 503 au lieu d'un 500 lors d'une panne).

## 6. Risques qui subsistent (non corrigés, et pourquoi)

1. **Sessions anonymes gratuites** : ~30 par heure et par adresse. Les plafonds globaux en base bornent le processeur (400 rejeux par minute pour les invités, 200 de réserve pour les comptes) mais **un attaquant peut priver les invités du service** en épuisant leur sous-plafond. Contre-mesure : activer un **CAPTCHA** (Turnstile / hCaptcha) sur les connexions anonymes et les inscriptions (réglage Supabase, §7).
2. **Saturation du stockage par de nombreuses sessions** : les plafonds sont PAR pilote (2 000 records, 100 circuits, 40 Mo de fantômes, 8 Mo de sauvegarde cloud) ; N sessions multiplient ces bornes. Surveiller la taille de la base (alertes Supabase).
3. **Pas de limitation de débit native sur l'API REST / RPC** de Supabase : `get_ghost` (jusqu'à 800 Ko), `sector_board`, `season_*`… peuvent être martelés (sortie réseau, processeur). À traiter devant (CDN / pare-feu applicatif) si le trafic le justifie.
4. **Triche « parfaite »** : une suite de commandes valide est une course valide ; un robot qui joue parfaitement (pilote automatique d'un circuit) produit un temps légitime pour le serveur. Aucune détection comportementale ; la modération se fait à la main (modérateurs).
5. **Signalements** : trois **comptes** de plus de 24 h (gratuits) masquent un circuit ; seul un modérateur le rétablit.
6. **Changement d'adresse technique d'un compte** (Supabase Auth) : non bloqué ; effet limité (squat d'un pseudo non pris). Un verrou par déclencheur sur `auth.users` n'a pas pu être éprouvé sans un vrai GoTrue : non fait.
7. **Pas de récupération de mot de passe** (choix de produit : aucune adresse e-mail réelle) ; un mot de passe perdu = compte perdu (documenté dans `supabase/COMPTES.md`).
8. **Plaques d'image** : un circuit publié peut charger une image depuis une adresse `https` arbitraire : l'hébergeur de l'image voit l'adresse IP de qui joue le circuit. Par conception ; la CSP laisse `img-src https:`.
9. **Textes stockés sans filtrage côté serveur** (pseudos, noms, descriptions, commentaires) : l'affichage les échappe (garde statique) ; un autre client qui les afficherait sans échapper serait exposé.
10. **Lectures coûteuses ouvertes** (`close_due_seasons`, `season_points`) : balayage de `scores` (volume actuel négligeable).
11. **Pas de test sur un vrai Supabase** (PostgREST, GoTrue, Edge Runtime) : la base de test est PostgreSQL 16 + faux schéma `auth`. La preuve finale en production est `verify-prod.sql`, `node tools/check-deployed.mjs` et l'essai de bout en bout (§7).

## 7. En attente : opérations de production (rien n'a été fait)

Ordre recommandé (détail et vérifications dans `supabase/MIGRATIONS.md`, section « Étape 17 ») :

1. **Lire** `supabase/verify-prod.sql` (lecture seule) : état de départ (les lignes de l'étape 17 doivent dire `MANQUE` avant, `ok` après).
2. **Sauvegarde** (Supabase › Database › Backups ou `pg_dump` ; le plan n'a pas de sauvegarde automatique) — l'étape 17 ne supprime rien.
3. **Étape 16** (`etape16-durcissement.sql`, uniquement des `REVOKE`) **si `verify-prod.sql` ne la voit pas appliquée** : proposée le 11 novembre, non appliquée à cette date.
4. **Étape 17** (`etape17-securite.sql`) : compatible avec la fonction et le jeu actuels ; à lancer AVANT de redéployer la fonction. Relançable ; retour arrière en relançant les étapes 1, 5, 11, 12, 13, 14, 15 (fin du fichier).
5. **Redéployer `submit-score` et `ice`** (`npm run build:function`, puis `supabase/functions/*/index.ts`). `submit-score/index.ts` est régénéré ; **ne pas coller `handler.js`**.
6. **Mettre en ligne le jeu 0.9.64** (CSP dans `index.html`, `sw.js` régénéré).
7. **Réglages Supabase Auth** (tableau de bord, rien dans le dépôt) :
   * *Authentication › Policies* : longueur minimale du mot de passe **8** (le serveur accepte 6 aujourd'hui, le jeu en exige 8) ;
   * **CAPTCHA** sur les connexions anonymes et les inscriptions (risque n° 1) ;
   * limites de débit d'authentification (connexion, inscription, jeton) : garder les valeurs par défaut au minimum ;
   * *Allow anonymous sign-ins* : **activé** (indispensable) ; *Confirm email* : désactivé (voulu : aucun e-mail) ;
   * *Storage* : aucun bucket public inattendu (le jeu n'en utilise pas) ;
   * *Data API › Exposed schemas* : `public` seulement ; vérifier qu'aucune table n'y manque de RLS (`verify-prod.sql`, ligne « RLS activée sur TOUTES… »).
8. **Variables d'environnement des fonctions** : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` (fournies par Supabase, jamais dans le dépôt) ; **`ALLOWED_ORIGIN`** : à définir sur l'adresse du jeu (sans elle, `*` : sans conséquence immédiate, le jeton est exigé, mais inutilement large) ; pour `ice` : `TURN_KEY_ID` + `TURN_KEY_API_TOKEN` (Cloudflare) ou `TURN_URLS` + `TURN_SECRET` (coturn), `STUN_URLS`, `ICE_TTL_S` (facultatifs). Ce sont les seuls secrets : **ne jamais** les mettre dans le dépôt (un test le vérifie).
9. **Révoquer le jeton d'accès personnel** fourni le 10 novembre pour l'opération précédente (supabase.com/dashboard/account/tokens) si ce n'est pas déjà fait.
10. **Essai de bout en bout** avec un compte de test, puis `node tools/check-deployed.mjs` : `physVer` 35, actions `submit` + `publish-track`.
11. **Alertes** : taille de la base, erreurs et durée des fonctions (les journaux disent « limite partagée indisponible » si l'étape 15 manque, « 503 » sur panne amont).

## 8. Fichiers

* SQL : `supabase/etape17-securite.sql` (nouveau), `supabase/verify-prod.sql`, `supabase/MIGRATIONS.md`.
* Fonctions : `supabase/functions/submit-score/handler.js` (délai, 503, plafond de circuits), `supabase/functions/ice/handler.js` (délai, 503), `supabase/functions/submit-score/index.ts` (régénéré).
* Client : `index.html` (CSP), `js/main.js` (police sans gestionnaire en ligne), `js/config.js` (note d'hébergement).
* Tests : `tools/test-securite-sql.sh` (nouveau), `tools/test-securite-client.mjs` (nouveau), `tools/test-submit-handler.mjs`, `tools/test-ice.mjs`, `package.json` (`test:sql`).
