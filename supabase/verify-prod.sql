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
         case when has_table_privilege('authenticated', 'public.tracks', 'insert') then 'oui (étape 15b NON appliquée)' else 'non (étape 15b appliquée)' end,
         case when has_table_privilege('authenticated', 'public.tracks', 'insert') then 'info' else 'ok' end
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
