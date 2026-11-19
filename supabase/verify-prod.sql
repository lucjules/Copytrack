-- =====================================================================================
-- Copytrack : VÉRIFICATION de la base réelle (LECTURE SEULE : que des SELECT, rien n'est modifié, rien n'est supprimé).
-- À coller dans Supabase > SQL Editor, avant et après chaque étape de MIGRATIONS.md, et à LIRE : une ligne « MANQUE » ou « ÉCART » n'est pas un détail.
--
-- Colonnes : verification | attendu | constate | statut
--   statut « ok »      : conforme à ce que le dépôt attend après l'étape indiquée ;
--   statut « MANQUE »  : objet absent (étape non appliquée ?) ;
--   statut « ÉCART »   : présent mais pas dans l'état attendu (droit trop large, fonction ancienne…) ;
--   statut « info »    : renseignement, pas un verdict (ex. nombre de circuits publiés avant l'étape 15 : temps auteur non vérifié).
-- Les lignes « après 15b » ne sont attendues QU'APRÈS l'étape 15b (voir MIGRATIONS.md) : avant, un « ÉCART » sur ces lignes est NORMAL.
-- =====================================================================================
with
t(n, ord) as (values ('rate_hits', 1), ('track_binds', 2), ('submit_rate', 3), ('scores', 4), ('tracks', 5)),
f(sig, ord) as (values
  ('public.rate_check(text,uuid,integer,integer,integer,boolean,integer)', 10),
  ('public.submit_best(uuid,text,double precision,text,integer,text,jsonb,text,jsonb,text)', 11),
  ('public.publish_track(uuid,text,text,text,text,double precision,integer,integer,text,text)', 12),
  ('public.submit_rate_check(uuid,integer,integer,integer)', 13),
  ('public.scores_limit()', 14)),
checks as (
  -- ---- 1. objets de l'étape 15 -------------------------------------------------------------------------------------------------------------
  select ord, 'table ' || n as verification, 'présente' as attendu,
         case when to_regclass('public.' || n) is not null then 'présente' else 'absente' end as constate,
         case when to_regclass('public.' || n) is not null then 'ok' else 'MANQUE' end as statut from t
  union all
  select ord, 'fonction ' || sig, 'présente', case when to_regprocedure(sig) is not null then 'présente' else 'absente' end,
         case when to_regprocedure(sig) is not null then 'ok' else 'MANQUE' end from f
  union all
  select 20, 'colonne tracks.author_verified', 'présente',
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tracks' and column_name = 'author_verified') then 'présente' else 'absente' end,
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tracks' and column_name = 'author_verified') then 'ok' else 'MANQUE' end
  union all
  select 21, 'scores_limit verrouille par pilote (version de l''étape 15)', 'verrou présent',
         case when to_regprocedure('public.scores_limit()') is null then 'fonction absente'
              when (select prosrc from pg_proc where oid = to_regprocedure('public.scores_limit()')) like '%pg_advisory_xact_lock%' then 'verrou présent' else 'SANS verrou (ancienne version : COUNT simple)' end,
         case when to_regprocedure('public.scores_limit()') is not null and (select prosrc from pg_proc where oid = to_regprocedure('public.scores_limit()')) like '%pg_advisory_xact_lock%' then 'ok' else 'ÉCART' end
  union all
  select 22, 'submit_rate_check est une enveloppe de rate_check (limite globale atomique)', 'enveloppe',
         case when to_regprocedure('public.submit_rate_check(uuid,integer,integer,integer)') is null then 'absente'
              when (select prosrc from pg_proc where oid = to_regprocedure('public.submit_rate_check(uuid,integer,integer,integer)')) like '%rate_check(%' and (select prosrc from pg_proc where oid = to_regprocedure('public.submit_rate_check(uuid,integer,integer,integer)')) like '%''submit''%' then 'enveloppe'
              else 'ANCIENNE version (verrou par joueur seulement)' end,
         case when to_regprocedure('public.submit_rate_check(uuid,integer,integer,integer)') is not null and (select prosrc from pg_proc where oid = to_regprocedure('public.submit_rate_check(uuid,integer,integer,integer)')) like '%rate_check(%' and (select prosrc from pg_proc where oid = to_regprocedure('public.submit_rate_check(uuid,integer,integer,integer)')) like '%''submit''%' then 'ok' else 'ÉCART' end
  union all
  -- ---- 1b. étapes ANTÉRIEURES dont l'étape 15 dépend (submit_best écrit scores.ghost) : « le fichier existe » ne prouve pas « la base l'a reçu » ------------
  select 15 + ord, 'étapes 7 / 8 / 13 : ' || label, 'présent', case when ok then 'présent' else 'absent ou ancien' end, case when ok then 'ok' else 'MANQUE' end
  from (values
    (0, 'colonnes scores.ghost, ghost_veh, has_ghost (étape 7, fantômes)',
        (select count(*) = 3 from pg_attribute where attrelid = 'public.scores'::regclass and attname in ('ghost', 'ghost_veh', 'has_ghost') and not attisdropped)),
    (1, 'colonne players.title (étape 8, titres)',
        exists (select 1 from pg_attribute where attrelid = 'public.players'::regclass and attname = 'title' and not attisdropped)),
    (2, 'fonctions get_ghost, set_title, trending_tracks (étapes 7 et 8)',
        (select count(*) = 3 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('get_ghost', 'set_title', 'trending_tracks'))),
    (3, 'track_comments_list renvoie le titre de l''auteur (édition à jour de l''étape 13)',
        coalesce((select pg_get_function_result(oid) like '%title text%' from pg_proc where pronamespace = 'public'::regnamespace and proname = 'track_comments_list'), false))
  ) v(ord, label, ok)
  union all
  -- ---- 2. droits sur les fonctions : jamais exécutables par le jeu --------------------------------------------------------------------------
  select 30 + ord, 'exécutable par le jeu (anon, authenticated, public) : ' || sig, 'non',
         case when to_regprocedure(sig) is null then 'fonction absente'
              when has_function_privilege('anon', to_regprocedure(sig), 'execute') or has_function_privilege('authenticated', to_regprocedure(sig), 'execute') or has_function_privilege('public', to_regprocedure(sig), 'execute') then 'OUI' else 'non' end,
         case when to_regprocedure(sig) is null then 'MANQUE'
              when has_function_privilege('anon', to_regprocedure(sig), 'execute') or has_function_privilege('authenticated', to_regprocedure(sig), 'execute') or has_function_privilege('public', to_regprocedure(sig), 'execute') then 'ÉCART' else 'ok' end
  from f where sig not like '%scores_limit%'
  union all
  -- ---- 3. droits sur les tables ---------------------------------------------------------------------------------------------------------------
  select 50, 'RLS activée : ' || c.relname, 'oui', case when c.relrowsecurity then 'oui' else 'NON' end, case when c.relrowsecurity then 'ok' else 'ÉCART' end
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('tracks', 'scores', 'rate_hits', 'track_binds', 'players') and c.relkind = 'r'
  union all
  select 55, 'le jeu peut créer / renommer son profil par « upsert » (update sur players.id ET players.name ; sans cela, un nouveau joueur reçoit 403)', 'oui',
         case when has_column_privilege('authenticated', 'public.players', 'id', 'update') and has_column_privilege('authenticated', 'public.players', 'name', 'update') then 'oui' else 'NON' end,
         case when has_column_privilege('authenticated', 'public.players', 'id', 'update') and has_column_privilege('authenticated', 'public.players', 'name', 'update') then 'ok' else 'ÉCART' end
  union all
  select 51, 'le jeu peut LIRE les tables internes (rate_hits, track_binds)', 'non',
         case when to_regclass('public.rate_hits') is null or to_regclass('public.track_binds') is null then 'tables absentes'
              when has_table_privilege('authenticated', 'public.rate_hits', 'select') or has_table_privilege('anon', 'public.rate_hits', 'select') or has_table_privilege('authenticated', 'public.track_binds', 'select') or has_table_privilege('anon', 'public.track_binds', 'select') then 'OUI' else 'non' end,
         case when to_regclass('public.rate_hits') is null or to_regclass('public.track_binds') is null then 'MANQUE'
              when has_table_privilege('authenticated', 'public.rate_hits', 'select') or has_table_privilege('anon', 'public.rate_hits', 'select') or has_table_privilege('authenticated', 'public.track_binds', 'select') or has_table_privilege('anon', 'public.track_binds', 'select') then 'ÉCART' else 'ok' end
  union all
  select 52, 'le jeu peut MODIFIER directement un circuit publié (update sur tracks)', 'non',
         case when has_table_privilege('authenticated', 'public.tracks', 'update') or has_table_privilege('anon', 'public.tracks', 'update') then 'OUI' else 'non' end,
         case when has_table_privilege('authenticated', 'public.tracks', 'update') or has_table_privilege('anon', 'public.tracks', 'update') then 'ÉCART' else 'ok' end
  union all
  select 53, 'le jeu peut ÉCRIRE directement des temps (insert / update / delete sur scores)', 'non',
         case when has_table_privilege('authenticated', 'public.scores', 'insert') or has_table_privilege('authenticated', 'public.scores', 'update') or has_table_privilege('authenticated', 'public.scores', 'delete')
                or has_table_privilege('anon', 'public.scores', 'insert') or has_table_privilege('anon', 'public.scores', 'update') or has_table_privilege('anon', 'public.scores', 'delete') then 'OUI' else 'non' end,
         case when has_table_privilege('authenticated', 'public.scores', 'insert') or has_table_privilege('authenticated', 'public.scores', 'update') or has_table_privilege('authenticated', 'public.scores', 'delete')
                or has_table_privilege('anon', 'public.scores', 'insert') or has_table_privilege('anon', 'public.scores', 'update') or has_table_privilege('anon', 'public.scores', 'delete') then 'ÉCART' else 'ok' end
  union all
  select 54, 'le jeu peut écrire created_at / picked_at / author_verified / author_time à l''insertion d''un circuit', 'non pour created_at, picked_at, author_verified',
         concat_ws(', ', 'created_at=' || has_column_privilege('authenticated', 'public.tracks', 'created_at', 'insert'),
                         'picked_at=' || coalesce(case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tracks' and column_name = 'picked_at') then has_column_privilege('authenticated', 'public.tracks', 'picked_at', 'insert')::text end, 'colonne absente'),
                         'author_verified=' || coalesce(case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tracks' and column_name = 'author_verified') then has_column_privilege('authenticated', 'public.tracks', 'author_verified', 'insert')::text end, 'colonne absente')),
         case when not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tracks' and column_name = 'author_verified') then 'MANQUE'
              else case when has_column_privilege('authenticated', 'public.tracks', 'created_at', 'insert') or has_column_privilege('authenticated', 'public.tracks', 'author_verified', 'insert') then 'ÉCART' else 'ok' end end
  union all
  -- ---- 4. étape 15b (attendue SEULEMENT après 15b) -------------------------------------------------------------------------------------------
  select 60, 'APRÈS 15b : insertion directe d''un circuit par le jeu', 'non (après 15b) ; oui avant',
         -- (has_ANY_column_privilege : depuis l'étape 15 le jeu n'a plus le droit d'insertion sur la table entière mais sur 8 colonnes ; tester le droit de table
         --  donnerait « 15b appliquée » alors que la publication directe reste ouverte. Constaté sur la production le jour où l'étape 15 y a été jouée.)
         case when has_any_column_privilege('authenticated', 'public.tracks', 'insert') then 'oui (étape 15b NON appliquée)' else 'non (étape 15b appliquée)' end,
         case when has_any_column_privilege('authenticated', 'public.tracks', 'insert') then 'info' else 'ok' end
  union all
  -- ---- 4 bis. étape 17 (sécurité, phase 5) : « présente » = la version corrigée de chaque fonction -------------------------------------------------------------
  select 80, 'étape 17 : table mode_plays (une partie par pilote, par mode et par heure)', 'présente', case when to_regclass('public.mode_plays') is not null then 'présente' else 'absente' end,
         case when to_regclass('public.mode_plays') is not null then 'ok' else 'MANQUE' end
  union all
  select 81 + ord, 'étape 17 : ' || label, 'version corrigée',
         case when to_regprocedure(sig) is null then 'fonction absente' when (select prosrc from pg_proc where oid = to_regprocedure(sig)) like '%' || marker || '%' then 'version corrigée' else 'ANCIENNE version' end,
         case when to_regprocedure(sig) is null then 'MANQUE' when (select prosrc from pg_proc where oid = to_regprocedure(sig)) like '%' || marker || '%' then 'ok' else 'MANQUE' end
  from (values
    (0, 'report_track ne rétablit jamais un circuit masqué', 'public.report_track(uuid)', 'hidden or n >= 3'),
    (1, 'mode_played : une partie par pilote et par heure', 'public.mode_played(bigint)', 'mode_plays'),
    (2, 'toggle_like : compteur exact sous concurrence (verrou par circuit)', 'public.toggle_like(uuid)', 'pg_advisory_xact_lock'),
    (3, 'log_runs : plafonds horaire et quotidien', 'public.log_runs(jsonb)', 'interval ''1 day'''),
    (4, 'tracks_rate_limit : 100 circuits par auteur', 'public.tracks_rate_limit()', '100 au plus'),
    (5, 'submit_best : budget de fantômes par pilote', 'public.submit_best(uuid,text,double precision,text,integer,text,jsonb,text,jsonb,text)', '40000000')
  ) v(ord, label, sig, marker)
  union all
  select 90, 'étape 17 : is_moderator / is_account non appelables par le jeu (anon, authenticated, public)', 'non',
         case when has_function_privilege('anon', 'public.is_moderator(uuid)', 'execute') or has_function_privilege('authenticated', 'public.is_moderator(uuid)', 'execute') or has_function_privilege('anon', 'public.is_account(uuid)', 'execute') or has_function_privilege('authenticated', 'public.is_account(uuid)', 'execute') or has_function_privilege('public', 'public.is_moderator(uuid)', 'execute') then 'OUI' else 'non' end,
         case when has_function_privilege('anon', 'public.is_moderator(uuid)', 'execute') or has_function_privilege('authenticated', 'public.is_moderator(uuid)', 'execute') or has_function_privilege('anon', 'public.is_account(uuid)', 'execute') or has_function_privilege('authenticated', 'public.is_account(uuid)', 'execute') or has_function_privilege('public', 'public.is_moderator(uuid)', 'execute') then 'ÉCART' else 'ok' end
  union all
  select 91, 'étape 17 : fonctions appelables SANS session (anon) hors de la liste attendue (lectures publiques, inscription, statistiques)', 'aucune',
         coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute')
                   and p.proname not in ('current_season', 'elo', 'follower_count', 'get_ghost', 'health_report', 'log_errors', 'log_runs', 'modes_list', 'my_season', 'playlists_list', 'random_track', 'recommended_tracks', 'season_bounds', 'season_clock', 'season_points', 'season_standings', 'sector_board', 'track_comments_list', 'track_stats', 'trending_tracks', 'username_available')), 'aucune'),
         case when exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute')
                   and p.proname not in ('current_season', 'elo', 'follower_count', 'get_ghost', 'health_report', 'log_errors', 'log_runs', 'modes_list', 'my_season', 'playlists_list', 'random_track', 'recommended_tracks', 'season_bounds', 'season_clock', 'season_points', 'season_standings', 'sector_board', 'track_comments_list', 'track_stats', 'trending_tracks', 'username_available')) then 'ÉCART' else 'ok' end
  union all
  -- ---- 4 ter. étape 18 (maintenance avant la 1.0) ------------------------------------------------------------------------------------------------------
  select 100, 'étape 18 : search_path fixé sur cloud_saves_touch, season_clock, season_bounds, current_season, elo', '5 sur 5',
         (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('cloud_saves_touch', 'season_clock', 'season_bounds', 'current_season', 'elo')
            and array_to_string(proconfig, ',') like 'search_path=%') || ' sur 5',
         case when (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('cloud_saves_touch', 'season_clock', 'season_bounds', 'current_season', 'elo')
            and array_to_string(proconfig, ',') like 'search_path=%') = 5 then 'ok' else 'ÉCART' end
  union all
  select 101, 'étape 18 : fonctions de déclencheur appelables par l''API (anon, authenticated)', 'aucune',
         coalesce((select string_agg(distinct p.proname, ', ') from pg_proc p, unnest(array['anon', 'authenticated']) r where p.pronamespace = 'public'::regnamespace
                   and p.prorettype = 'trigger'::regtype and has_function_privilege(r, p.oid, 'execute')), 'aucune'),
         case when exists (select 1 from pg_proc p, unnest(array['anon', 'authenticated']) r where p.pronamespace = 'public'::regnamespace
                   and p.prorettype = 'trigger'::regtype and has_function_privilege(r, p.oid, 'execute')) then 'ÉCART' else 'ok' end
  union all
  select 102, 'étape 18 : clés étrangères de public sans index qui les couvre', 'aucune',
         coalesce((select string_agg(c.conname, ', ' order by c.conname) from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace
                   and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey::int2[])), 'aucune'),
         case when exists (select 1 from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace
                   and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey::int2[])) then 'ÉCART' else 'ok' end
  union all
  select 103, 'étape 18 : règles RLS qui évaluent auth.uid() à chaque ligne (au lieu de (select auth.uid()))', 'aucune',
         coalesce((select string_agg(tablename || ' « ' || policyname || ' »', ', ' order by tablename, policyname) from pg_policies where schemaname = 'public'
                   and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'SELECT auth\.uid\(\) AS uid', '', 'g') ~ 'auth\.uid\(\)'), 'aucune'),
         case when exists (select 1 from pg_policies where schemaname = 'public'
                   and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), 'SELECT auth\.uid\(\) AS uid', '', 'g') ~ 'auth\.uid\(\)') then 'ÉCART' else 'ok' end
  union all
  select 104, 'étape 18 : tables de public sans clé primaire', 'aucune',
         coalesce((select string_agg(c.relname, ', ' order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                   and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')), 'aucune'),
         case when exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                   and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')) then 'ÉCART' else 'ok' end
  union all
  select 105, 'étape 18 : tables client_errors, maintenance_log, scores_archive', 'présentes',
         case when to_regclass('public.client_errors') is not null and to_regclass('public.maintenance_log') is not null and to_regclass('public.scores_archive') is not null then 'présentes' else 'absentes' end,
         case when to_regclass('public.client_errors') is not null and to_regclass('public.maintenance_log') is not null and to_regclass('public.scores_archive') is not null then 'ok' else 'MANQUE' end
  union all
  select 106, 'étape 18 : purge_expired, archive_old_scores (réservées au serveur), log_errors, health_report (ouvertes)', 'présentes, droits conformes',
         case when to_regprocedure('public.purge_expired()') is null or to_regprocedure('public.archive_old_scores(integer)') is null or to_regprocedure('public.log_errors(jsonb)') is null
                   or to_regprocedure('public.health_report()') is null then 'absentes'
              when has_function_privilege('anon', 'public.purge_expired()', 'execute') or has_function_privilege('authenticated', 'public.purge_expired()', 'execute')
                   or has_function_privilege('anon', 'public.archive_old_scores(integer)', 'execute') or has_function_privilege('authenticated', 'public.archive_old_scores(integer)', 'execute')
                   or not has_function_privilege('anon', 'public.log_errors(jsonb)', 'execute') or not has_function_privilege('anon', 'public.health_report()', 'execute') then 'droits non conformes'
              else 'présentes, droits conformes' end,
         case when to_regprocedure('public.purge_expired()') is null or to_regprocedure('public.archive_old_scores(integer)') is null or to_regprocedure('public.log_errors(jsonb)') is null
                   or to_regprocedure('public.health_report()') is null then 'MANQUE'
              when has_function_privilege('anon', 'public.purge_expired()', 'execute') or has_function_privilege('authenticated', 'public.purge_expired()', 'execute')
                   or has_function_privilege('anon', 'public.archive_old_scores(integer)', 'execute') or has_function_privilege('authenticated', 'public.archive_old_scores(integer)', 'execute')
                   or not has_function_privilege('anon', 'public.log_errors(jsonb)', 'execute') or not has_function_privilege('anon', 'public.health_report()', 'execute') then 'ÉCART'
              else 'ok' end
  union all
  select 107, 'étape 18 : purge nocturne (pg_cron, tâche virelo-purge) et dernière purge', 'info',
         case when to_regclass('cron.job') is null then 'pg_cron absent : purge à lancer à la main (select public.purge_expired();)'
              else coalesce((xpath('/row/c/text()', query_to_xml('select string_agg(jobname || '' '' || schedule, '', '') as c from cron.job where jobname = ''virelo-purge''', false, true, '')))[1]::text, 'tâche absente') end
         || ' · dernière purge : ' || case when to_regclass('public.maintenance_log') is null then 'jamais'
              else coalesce((xpath('/row/c/text()', query_to_xml('select max(at)::text as c from public.maintenance_log where what = ''purge_expired''', false, true, '')))[1]::text, 'jamais') end,
         'info'
  union all
  select 92, 'étape 16 : anon sans aucune écriture directe sur aucune table (INSERT / UPDATE / DELETE)', 'aucune',
         coalesce((select string_agg(c.relname, ', ' order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                   and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))), 'aucune'),
         case when exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                   and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))) then 'ÉCART' else 'ok' end
  union all
  select 93, 'RLS activée sur TOUTES les tables de public', 'aucune table sans RLS',
         coalesce((select string_agg(c.relname, ', ' order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity), 'aucune'),
         case when exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity) then 'ÉCART' else 'ok' end
  union all
  -- ---- 5. renseignements ---------------------------------------------------------------------------------------------------------------------
  select 70, 'circuits publiés dont le temps auteur n''est PAS vérifié (publiés avant l''étape 15)', 'info',
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tracks' and column_name = 'author_verified')
              then (xpath('/row/c/text()', query_to_xml('select count(*) filter (where not author_verified) || '' sur '' || count(*) as c from public.tracks', false, true, '')))[1]::text
              else 'colonne author_verified absente' end, 'info'
  union all
  select 71, 'temps enregistrés par version de physique (phys_ver) : la version du jeu actuel est dans js/version.js (PHYS_VER)', 'info',
         coalesce((select string_agg(phys_ver || ' : ' || n, ' · ' order by phys_ver) from (select phys_ver, count(*) n from public.scores group by phys_ver) x), 'aucun temps'), 'info'
  union all
  select 72, 'migrations enregistrées par la CLI Supabase (les scripts lancés dans le SQL Editor n''y figurent PAS : ce n''est pas une preuve d''absence)', 'info',
         case when to_regclass('supabase_migrations.schema_migrations') is null then 'table absente'
              else (xpath('/row/c/text()', query_to_xml('select count(*) || '' enregistrée(s)'' as c from supabase_migrations.schema_migrations', false, true, '')))[1]::text end, 'info'
)
select verification, attendu, constate, statut from checks order by ord, verification;
