# Migrations et déploiements : ordre, dépendances, vérification, retour arrière

Ce document ne dit **pas** ce qui est appliqué en production : seul le projet Supabase le sait. Il dit dans quel ordre appliquer, comment **le prouver**, et comment revenir en arrière.
Tant qu'une vérification ci-dessous n'a pas été faite et lue par quelqu'un, une migration n'est **pas** « appliquée » et une fonction n'est **pas** « déployée ».

## Procédure de mise à jour complète (production)

**Rien de ce document n'a été exécuté sur la production par l'auteur de ce dépôt** : l'environnement de développement n'y accède pas. L'audit indépendant a constaté sur le projet réel : `submit-score` en version 23 avec `PHYS_VER` 31 (le jeu est en 33), `ice` en version 3 ; absents : `rate_hits`, `rate_check`, `track_binds`, `submit_best`, `publish_track`, `author_verified` ; présents : `submit_rate`, `submit_rate_check` (verrou par joueur seulement, pas de limite globale exacte), `scores_limit` (simple `COUNT`). C'est exactement l'état « étapes 1 à 14 » : `tools/test-accounts-sql.sh` le fabrique et vérifie que `verify-prod.sql` le décrit fidèlement.

Chaque étape ci-dessous a une **vérification** : tant qu'elle n'a pas été lue, l'étape n'est pas faite. Aucune étape ne supprime de donnée. En cas de doute, s'arrêter et revenir en arrière (section « Retour arrière »).

| Étape | Action | Vérification (à lire) | Si la vérification échoue |
|---|---|---|---|
| 0 | **État des lieux** : coller `supabase/verify-prod.sql` dans le SQL Editor ; lancer `node tools/check-deployed.mjs` | Les lignes `MANQUE` / `ÉCART` doivent être celles attendues AVANT l'étape 15 (liste ci-dessus). Une autre différence = la base n'est pas dans l'état supposé : **ne rien appliquer** | Comprendre l'écart d'abord |
| 1 | **Sauvegarde** : Supabase > Database > Backups (ou `pg_dump` des tables `scores`, `tracks`, `players`) | Une sauvegarde datée existe et se télécharge | Ne pas continuer |
| 2 | `etape15-backend.sql` (SQL Editor) : relançable, ne supprime rien ; **compatible avec l'ancienne fonction serveur** | Relancer `verify-prod.sql` : plus aucun `MANQUE` ; seules les lignes « APRÈS 15b » et « info » restent | `etape15-retour.sql` |
| 3 | Redéployer **`submit-score`** (`npm run build:function`, puis `supabase/functions/submit-score/index.ts`) | `node tools/check-deployed.mjs` : `physVer` = 33 (= `js/version.js`), actions `submit` + `publish-track` | Redéployer l'ancien fichier (historique Git) |
| 4 | Redéployer **`ice`** (`supabase/functions/ice/index.ts`) ; secrets TURN inchangés | `check-deployed.mjs` : `ice` répond 401 sans session ; avec une session de test : 200 et `ttl` 3600 | Redéployer l'ancien fichier |
| 5 | **Essai de bout en bout** avec un compte de test : une course validée (record enregistré, rang renvoyé) et une publication de circuit (circuit créé, `author_verified` vrai) | La ligne apparaît dans `scores` / `tracks` ; `submit-score` journalise sans erreur | Retour arrière (étapes 3-4), pas encore 15b |
| 6 | Mettre en ligne le jeu **0.9.58 ou plus** (PHYS_VER 33) | Un joueur peut publier et courir | Remettre le jeu précédent |
| 7 | `etape15b-publication-verifiee.sql` | `verify-prod.sql` : la ligne « APRÈS 15b » passe à `ok` ; essai : une publication par l'ancienne voie (insertion directe) est refusée | `grant insert on public.tracks to authenticated;` |
| 8 | **Vérification finale** | `verify-prod.sql` : **aucune** ligne `MANQUE` ni `ÉCART` ; `check-deployed.mjs` : « aucun écart constaté » | Corriger avant d'annoncer quoi que ce soit |

### Compatibilité avec les anciennes versions du jeu

| Version du jeu | Après les étapes 2 à 6 | Après 15b (étape 7) |
|---|---|---|
| ≤ 0.9.57 (PHYS_VER ≤ 32) | **Ne peut plus enregistrer de temps** : la nouvelle `submit-score` refuse une autre version de physique (422, « recharge le jeu ») ; ses records locaux et ses fantômes restent | Idem ; **ne peut plus publier** de circuit (plus d'insertion directe) |
| 0.9.58 ou plus (PHYS_VER 33) | Tout fonctionne | Tout fonctionne |
| Records déjà en base avec `phys_ver` 31 | Conservés ; un temps de physique 33 les remplace (même plus lent), un temps d'une physique plus ancienne ne remplace jamais un record plus récent ; les classements n'affichent qu'une version de physique à la fois | — |
| Circuits publiés avant l'étape 15 | Conservés ; leur temps auteur reste **non vérifié** (`author_verified` faux) jusqu'à ce que leur auteur les republie | — |

Avant l'étape 6, laisser un temps de cohabitation n'est pas possible pour les temps : une seule version de physique est vérifiée à la fois par `submit-score` (c'est voulu : une course ne se rejoue que sur la physique qui l'a produite).

## Ordre

| # | Quoi | Où | Dépend de | Compatible avec l'ancienne fonction serveur ? |
|---|---|---|---|---|
| 1 | `etape1` … `etape14` (une fois chacune, dans l'ordre) | SQL Editor | rien | — |
| 2 | **`etape15-backend.sql`** | SQL Editor | étapes 1 à 14 | **oui** : à lancer AVANT de redéployer `submit-score` |
| 3 | Redéployer **`submit-score`** (`supabase/functions/submit-score/index.ts`) | Edge Functions | étape 15 | — (la nouvelle fonction refuse de travailler sans l'étape 15 : 503) |
| 4 | Redéployer **`ice`** (`supabase/functions/ice/index.ts`) | Edge Functions | étape 15 | — (idem : 503 sans l'étape 15 ; 500 si `SUPABASE_URL` / clé de service manquent) |
| 5 | Mettre en ligne le jeu **0.9.54** ou plus | hébergement du site | 3 | — |
| 6 | **`etape15b-publication-verifiee.sql`** | SQL Editor | 2, 3 **et** 5 | **non** : les anciens clients ne peuvent plus publier |

Ne jamais lancer 6 avant 3 et 5. Les étapes 2 et 6 sont **relançables sans danger** (idempotentes) et ne **suppriment aucune donnée**.

### Ce que fait l'étape 15 (`etape15-backend.sql`)

- `rate_hits` + `rate_check(...)` : limitation de cadence **persistante** (en base), **partagée** entre les instances, **atomique** (verrou par type de limite : le compte du pilote et le compte global sont exacts même avec des appels simultanés), avec un plafond global et un sous-plafond pour les sessions anonymes. `submit_rate_check` (étape 14) devient une enveloppe de `rate_check` : l'ancienne fonction serveur continue de fonctionner.
- `scores_limit` : verrou par pilote (2 insertions simultanées à 1 999 lignes ne donnent plus 2 001) et **ne bloque plus l'amélioration d'un temps existant** à 2 000 lignes.
- `submit_best(...)` : écriture **atomique** du meilleur temps (un temps moins bon, ou d'une physique plus ancienne, ne remplace jamais le record, même avec deux soumissions simultanées) ; le fantôme et les temps intermédiaires sont ceux de la course retenue. Elle lie aussi un circuit de joueur (`u-…`) à une **empreinte SHA-256** (`track_binds`) : la signature du jeu n'a que 32 bits, on pouvait fabriquer un autre circuit de même clé.
- `tracks` : insertion directe limitée par colonnes (plus de `created_at`, `picked_at`, `plays`, `likes`, `reports`, `hidden`, `author_verified`) ; colonne `author_verified` ; `publish_track(...)` (réservée à la fonction serveur) : seule voie qui pose un temps d'auteur **rejoué**.

### Ce que fait l'étape 15b

`revoke insert on public.tracks from authenticated` : plus aucun circuit n'entre dans la base sans passer par le rejeu de la course de l'auteur.

## Déployer les fonctions

```bash
npm run build:function
```

Colle ensuite le contenu de `supabase/functions/submit-score/index.ts` et de `supabase/functions/ice/index.ts` dans les fonctions du même nom (Supabase > Edge Functions). `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies par Supabase ; `ice` en a besoin (elle **refuse** de répondre sans elles). Réglage facultatif : `ALLOWED_ORIGIN` (restreint les appels navigateur au site du jeu).

## Preuves observables (à lancer par toi, résultat à lire)

Le plus simple : `supabase/verify-prod.sql` (lecture seule, une ligne par vérification, statut `ok` / `MANQUE` / `ÉCART` / `info`) et `node tools/check-deployed.mjs`. Les requêtes ci-dessous détaillent les mêmes contrôles à la main.

**1. Étape 15 appliquée.** Dans le SQL Editor :

```sql
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('rate_check', 'submit_best', 'publish_track', 'submit_rate_check', 'scores_limit') order by 1;
-- attendu : les 5 lignes
select prosrc like '%pg_advisory_xact_lock%' as plafond_verrouille from pg_proc where proname = 'scores_limit';
-- attendu : t
select has_table_privilege('authenticated', 'public.rate_hits', 'select') as lisible_par_le_jeu;
-- attendu : f
```

**2. Étape 15b appliquée (ou non).**

```sql
select has_table_privilege('authenticated', 'public.tracks', 'insert') as insertion_directe;
-- avant 15b : t ; après 15b : f
select has_column_privilege('authenticated', 'public.tracks', 'created_at', 'insert') as created_at_libre;
-- après 15 : f
```

**3. Version de physique réellement déployée dans `submit-score`** (sans authentification, rien de secret) :

```bash
curl -s "https://<projet>.supabase.co/functions/v1/submit-score" -H "apikey: <clé publique>"
```

Attendu : `{"ok":true,"service":"submit-score","physVer":33,…,"actions":["submit","publish-track"]}`. `physVer` doit être égal à `PHYS_VER` de `js/version.js` ; l'absence de `actions` signifie que l'**ancienne** fonction est encore en ligne.

**4. `ice` refuse sans session** (la clé publique seule ne donne plus de relais) :

```bash
curl -s -X POST "https://<projet>.supabase.co/functions/v1/ice" -H "apikey: <clé publique>" -H "Authorization: Bearer <clé publique>"
```

Attendu : `401` `{"error":"Non connecté."}`.

## Retour arrière

1. `supabase/etape15-retour.sql` (relançable) : rétablit le déclencheur de l'étape 5, `submit_rate_check` de l'étape 14 et l'insertion directe des circuits (annule aussi l'étape 15b), et retire `submit_best`, `publish_track`, `rate_check`. **Aucune donnée supprimée** : `rate_hits`, `track_binds` et `tracks.author_verified` restent ; leur suppression éventuelle est en commentaire à la fin du fichier, à décider à part.
2. Redéployer l'ancienne fonction `submit-score` (la version d'avant, depuis l'historique Git) : la nouvelle ne fonctionne plus sans l'étape 15.
3. Remettre en ligne l'ancien jeu (il publie par insertion directe, rétablie à l'étape 1).

L'ancienne fonction `ice` ne demande rien à l'étape 15 : elle peut rester.

## Ce qui n'est pas vérifié ici

Le projet Supabase réel (Auth, limites de débit de la plateforme, droits effectifs du rôle `service_role`) n'est pas testé : le SQL l'est sur un PostgreSQL local (`npm run test:sql`, dont des **sessions simultanées** réelles), les fonctions contre un faux Supabase avec la vraie vérification de course. L'état de la production (étapes appliquées, fonctions déployées) n'est connu que par les preuves ci-dessus.
