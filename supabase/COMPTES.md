# Comptes Copytrack — installation Supabase

Cette migration prépare les tables privées pour les comptes et sauvegardes cloud.
Elle ne change pas les tables existantes de circuits communautaires / classements.

## Installation

1. Ouvrir le projet Supabase utilisé par Copytrack.
2. Aller dans **SQL Editor** → **New query**.
3. Copier le contenu de `supabase/copytrack-accounts.sql`, puis cliquer **Run**.
4. Dans **Authentication → Providers → Email**, activer Email/Password et désactiver la confirmation d'adresse e-mail (le jeu utilise un alias technique `pseudo@accounts.copytrack.invalid`, pas une vraie adresse).\n5. Dans **Authentication → Settings**, vérifier que les mots de passe d'au moins 8 caractères sont acceptés. Les mots de passe restent gérés par Supabase Auth.\n6. Aucun e-mail réel n'est collecté dans cette version : la réinitialisation de mot de passe par e-mail n'est donc pas disponible. Ne jamais mettre la clé `service_role` dans le code du navigateur.
5. Ne jamais mettre la clé `service_role` dans le code du navigateur.

## Tables et sécurité

- `copytrack_profiles`: pseudo unique, lié à l'identifiant Supabase Auth.
- `copytrack_saves`: sauvegarde JSON privée du propriétaire.
- RLS autorise chaque compte authentifié à lire/écrire uniquement sa propre ligne.
- Les comptes et les données invitées doivent rester séparés. La sauvegarde invitée demeure dans le stockage local et son code SHWP est le moyen de transfert manuel.

L'interface permet de créer un compte, de se connecter et de synchroniser la sauvegarde cloud. Le mode invité reste local; sa clé SHWP permet de transférer manuellement la sauvegarde.
