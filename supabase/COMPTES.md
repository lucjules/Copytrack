# Comptes Copytrack — installation Supabase

Cette migration prépare les tables privées pour les comptes et sauvegardes cloud.
Elle ne change pas les tables existantes de circuits communautaires / classements.

## Installation

1. Ouvrir le projet Supabase utilisé par Copytrack.
2. Aller dans **SQL Editor** → **New query**.
3. Copier le contenu de `supabase/copytrack-accounts.sql`, puis cliquer **Run**.
4. Dans **Authentication → Providers → Email**, désactiver la confirmation d'adresse e-mail si l'interface Copytrack utilise un identifiant sans e-mail. Les mots de passe doivent rester gérés par Supabase Auth.
5. Ne jamais mettre la clé `service_role` dans le code du navigateur.

## Tables et sécurité

- `copytrack_profiles`: pseudo unique, lié à l'identifiant Supabase Auth.
- `copytrack_saves`: sauvegarde JSON privée du propriétaire.
- RLS autorise chaque compte authentifié à lire/écrire uniquement sa propre ligne.
- Les comptes et les données invitées doivent rester séparés. La sauvegarde invitée demeure dans le stockage local et son code SHWP est le moyen de transfert manuel.

La migration ne crée pas encore l'interface de connexion ni le flux de synchronisation; elle constitue la partie base de données à appliquer avant leur activation.
