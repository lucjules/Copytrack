-- =====================================================================================
-- Copytrack : étape 16 (défense en profondeur des droits de table) — PROPOSÉE par l'audit 0.9.59, NON appliquée en production.
-- À lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 15 (15b indifférente). Relançable. AUCUNE donnée touchée : uniquement des REVOKE.
-- Retour arrière : les « grant » correspondants (ou « grant all on <table> to anon, authenticated », l'état d'origine de Supabase).
--
-- Constat (production, lecture seule, 11 novembre 2026) : Supabase accorde par défaut TOUS les droits (select, insert, update, delete, truncate, references,
-- trigger) aux rôles anon et authenticated sur chaque table créée dans public. Les étapes 1 à 15 retirent ces droits sur scores, tracks (en partie), players (en
-- partie), rate_hits, track_binds, submit_rate… mais pas sur accounts, cloud_saves, track_likes, track_plays, track_reports, ni les droits d'ÉCRITURE du rôle
-- anon sur players et tracks. Aujourd'hui rien n'est exposé : la sécurité au niveau des lignes (RLS) est activée sur les 27 tables et AUCUNE politique n'ouvre ces
-- opérations. Mais c'est une seule barrière : une politique trop large ajoutée un jour (ou un « disable row level security » de mise au point) ouvrirait
-- aussitôt la table. Cette étape retire les droits que le jeu n'utilise pas : il faudrait alors DEUX erreurs pour exposer une table.
--
-- Pourquoi rien ne peut casser : chaque droit retiré ici est DÉJÀ refusé par RLS (aucune politique ne l'autorise) ; le jeu écrit dans ces tables par des
-- fonctions « security definer » (toggle_like, track_played, report_track, handle_new_account…) qui n'ont pas besoin des droits du rôle appelant.
-- Vérifié par tools/test-etape16-sql.sh (npm run test:sql) : droits attendus après l'étape, et les parcours du jeu (profil, sauvegarde cloud, j'aime,
-- publication, lecture des classements) fonctionnent avant comme après.
-- =====================================================================================

-- 1. Le rôle anon (aucune session) ne fait que LIRE ce qui est public : aucune écriture directe, nulle part.
do $$ declare t record; begin
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t.relname);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t.relname);
  end loop;
end $$;

-- 2. Tables privées (aucune politique de lecture pour anon) : pas de lecture non plus sans session.
revoke select on public.accounts, public.cloud_saves, public.track_likes from anon;
do $$ begin
  if to_regclass('public.track_plays') is not null then revoke all on public.track_plays from anon, authenticated; end if;        -- (écrite par track_played, fonction du serveur)
  if to_regclass('public.track_reports') is not null then revoke all on public.track_reports from anon, authenticated; end if;    -- (écrite par report_track)
end $$;

-- 3. Rôle authenticated : seulement ce que le jeu fait réellement.
revoke insert, update, delete on public.accounts from authenticated;       -- lecture de SA ligne ; la ligne naît du déclencheur d'inscription
revoke delete on public.cloud_saves from authenticated;                    -- lecture, création, mise à jour de SA sauvegarde ; la suppression passe par delete_account
revoke delete on public.players from authenticated;                        -- création et renommage (droits par colonne : étapes 14 et 15)
revoke insert, update, delete on public.track_likes from authenticated;    -- lecture de SES j'aime ; l'écriture passe par toggle_like

notify pgrst, 'reload schema';
