# Migrations et déploiements : ordre, dépendances, vérification, retour arrière

Ce document ne dit **pas** ce qui est appliqué en production : seul le projet Supabase le sait. Il dit dans quel ordre appliquer, comment **le prouver**, et comment revenir en arrière.
Tant qu'une vérification ci-dessous n'a pas été faite et lue par quelqu'un, une migration n'est **pas** « appliquée » et une fonction n'est **pas** « déployée ».

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

Attendu : `{"ok":true,"service":"submit-score","physVer":31,…,"actions":["submit","publish-track"]}`. `physVer` doit être égal à `PHYS_VER` de `js/version.js` ; l'absence de `actions` signifie que l'**ancienne** fonction est encore en ligne.

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
