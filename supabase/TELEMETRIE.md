# Statistiques de jeu anonymes et médailles calibrées sur de vrais joueurs

Les temps de médailles des 66 circuits intégrés ont été calés sur le **pilote automatique**, pas sur des humains. Pour les régler sur de vrais joueurs, le jeu peut (avec l'accord du joueur)
envoyer quelques statistiques anonymes. Rien ne part tant que le joueur n'a pas accepté : la question est posée une fois (au menu principal), et le réglage
« Statistiques anonymes » (Profil › Options) la retire à tout moment ; retirer l'accord vide aussi la file d'attente locale.

## Ce qui est envoyé

Une ligne par partie terminée ou abandonnée (après au moins 3 s de course), uniquement sur les **circuits intégrés** (et le défi du jour, sous le nom `daily`) :

| champ | contenu |
|---|---|
| `install` | un identifiant **aléatoire** de 16 caractères hexadécimaux, créé sur cet appareil ; jamais lié au pseudo, au compte ni à l'adresse |
| `track` | identifiant du circuit intégré (son identifiant dans `js/tracks.js`) |
| `outcome` | `finish` (arrivée) ou `quit` (abandon) |
| `time` | temps de la partie (s) |
| `progress` | à l'abandon : avancement atteint (0 à 1) |
| `attempt` | numéro d'essai sur ce circuit pour cette installation |
| `respawns` | retours au checkpoint |
| `medal` | médaille obtenue (arrivée) |
| `pv` | version de la physique |

**Rien d'autre** : ni nom, ni position, ni commandes enregistrées, ni identifiant de compte. Les événements attendent dans une file locale bornée (300 au plus, 14 jours), partent par lots de 50 et reprennent après un échec réseau.

## Installation (facultative)

1. Lancer `supabase/etape6-telemetrie.sql` dans l'éditeur SQL de Supabase (relançable). Il crée `run_stats` (**aucune lecture publique**, aucune écriture directe) et la fonction `log_runs(events jsonb)`
   (`security definer`) qui valide la forme de chaque ligne (identifiants, issue, bornes de temps, médaille ; une ligne invalide est ignorée, les autres passent) et limite chaque installation à 300 lignes par heure.
   À purger de temps en temps (la commande est dans l'en-tête du script).
2. Rien à configurer dans le jeu. Sans le script, l'appel échoue en silence et le jeu fonctionne normalement.

## Exploitation

1. Exporter `run_stats` depuis le tableau de bord Supabase (la table n'est lisible qu'avec la clé de service) en `runs.json` ou `.csv`.
2. `node tools/telemetry-report.mjs runs.json [--pv 26] [--md rapport.md]` : par circuit, nombre de joueurs, taux d'arrivée, essais avant la première arrivée, abandons (et où), temps réels (centiles
   des meilleurs temps, un par joueur) comparés aux médailles, alertes « trop dur », « trop facile », « Or hors de portée ». Les temps impossibles (plus de 40 % plus rapides que le pilote automatique)
   sont écartés : un client truqué ne règle pas les médailles.
3. Pour recaler : `--ecrire-humains docs/temps-humains.json`, puis `node tools/medals.mjs --humain docs/temps-humains.json --ecrire` (cristal 3 %, or 12 %, argent 40 %, bronze 75 % des meilleurs
   temps ; échantillon minimal par circuit). Les circuits recalés portent `medalsBy: 'humain'` (le contrat ne les recale plus sur le pilote). Puis `node tools/golden.mjs --update`, `npm run sw`,
   `npm run build:function`, et relecture avant commit : une médaille ne change jamais toute seule.
