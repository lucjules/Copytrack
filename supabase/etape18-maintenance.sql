-- =====================================================================================
-- Étape 18 (0.12.5, phase 2 de la 1.0) : la base prête pour la 1.0. RELANÇABLE, et ne supprime aucune donnée en s'appliquant : les purges ne
-- tournent qu'à l'heure dite (pg_cron, chaque nuit) ou à la main (select public.purge_expired();). Suppose les étapes 1 à 17.
--
-- 1. Sécurité : search_path fixé sur les 5 fonctions signalées par Supabase ; les fonctions de déclencheur ne s'appellent plus par l'API
--    (elles se déclenchent toujours : un déclencheur ne vérifie pas le droit EXECUTE).
-- 2. Performance : un index par clé étrangère ; les règles RLS n'évaluent auth.uid() qu'une fois par requête ((select auth.uid())) ;
--    une clé primaire sur rate_hits et submit_rate.
-- 3. Conservation (pages Confidentialité, js/legal.js) : purge_expired() efface les sessions invitées sans activité depuis 12 mois (et
--    tout ce qui leur appartient), les statistiques anonymes de plus de 12 mois, les erreurs remontées de plus de 90 jours, les compteurs
--    anti-abus de plus d'une heure. Planifiée chaque nuit si l'extension pg_cron est disponible. Les comptes ne sont jamais purgés ici.
-- 4. Archivage des temps des anciennes physiques : scores_archive et archive_old_scores(garder) sont PRÉPARÉS ; on ne les lance qu'une
--    fois, à la sortie de la 1.0 (docs/EXPLOITATION.md). Les temps des saisons restent : les classements des saisons closes en dépendent.
-- 5. Exploitation : client_errors et log_errors() (erreurs du jeu, anonymes, seulement avec l'accord du joueur, comme les statistiques) ;
--    health_report() (des nombres agrégés, rien de personnel) pour la surveillance quotidienne (tools/surveillance.mjs).
-- Vérification : supabase/verify-prod.sql, section « étape 18 ». Test : tools/test-etape18-sql.sh (npm run test:sql).
-- =====================================================================================

-- ---------------------------------------------------------------------------------------------------------------------------- 1. sécurité
alter function public.cloud_saves_touch() set search_path = public, pg_temp;
alter function public.season_clock() set search_path = public, pg_temp;
alter function public.season_bounds(int) set search_path = public, pg_temp;
alter function public.current_season() set search_path = public, pg_temp;
alter function public.elo(int, int, numeric) set search_path = public, pg_temp;

revoke execute on function public.handle_new_account(), public.players_reserve_name(), public.scores_limit(), public.tracks_rate_limit(),
  public.cloud_saves_touch() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------- 2. performance
create index if not exists comment_reports_player_fk on public.comment_reports (player);
create index if not exists division_history_player_fk on public.division_history (player);
create index if not exists mode_plays_player_fk on public.mode_plays (player);
create index if not exists mode_reports_player_fk on public.mode_reports (player);
create index if not exists scores_player_fk on public.scores (player);
create index if not exists tournament_players_player_fk on public.tournament_players (player);
create index if not exists tournaments_owner_fk on public.tournaments (owner);
create index if not exists track_likes_player_fk on public.track_likes (player);
create index if not exists track_plays_player_fk on public.track_plays (player);
create index if not exists track_reports_player_fk on public.track_reports (player);

-- Règles RLS : mêmes conditions, auth.uid() évalué une fois par requête (et non à chaque ligne). Une règle absente (base qui n'a pas joué
-- une étape) est laissée telle quelle : ALTER POLICY ne crée rien.
do $$
declare r record;
begin
  for r in select * from (values
    ('accounts', 'Voir son compte', 'user_id = (select auth.uid())', null),
    ('cloud_saves', 'Créer sa sauvegarde', null, 'user_id = (select auth.uid()) and exists (select 1 from public.accounts a where a.user_id = (select auth.uid()))'),
    ('cloud_saves', 'Lire sa sauvegarde', 'user_id = (select auth.uid())', null),
    ('cloud_saves', 'Modifier sa sauvegarde', 'user_id = (select auth.uid())', 'user_id = (select auth.uid())'),
    ('community_modes', 'Modes visibles', 'not hidden or owner = (select auth.uid())', null),
    ('duels', 'Duels visibles des duellistes', '(select auth.uid()) = challenger or (select auth.uid()) = opponent', null),
    ('follows', 'Mes abonnements', '(select auth.uid()) = follower', null),
    ('friends', 'Amis visibles des deux intéressés', '(select auth.uid()) = a or (select auth.uid()) = b', null),
    ('players', 'Créer son profil', null, 'id = (select auth.uid())'),
    ('players', 'Modifier son profil', 'id = (select auth.uid())', 'id = (select auth.uid())'),
    ('playlists', 'Playlists visibles', 'public or owner = (select auth.uid())', null),
    ('track_comments', 'Commentaires visibles', 'not hidden or author = (select auth.uid())', null),
    ('track_likes', 'Voir ses j''aime', 'player = (select auth.uid())', null),
    ('tracks', 'Circuits visibles', 'not hidden or author = (select auth.uid())', null),
    ('tracks', 'Publier ses circuits', null, 'author = (select auth.uid()) and plays = 0 and likes = 0 and reports = 0 and hidden = false'),
    ('tracks', 'Supprimer ses circuits', 'author = (select auth.uid())', null)
  ) as v(tbl, pol, q, wc) loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tbl and policyname = r.pol) then
      execute format('alter policy %I on public.%I', r.pol, r.tbl)
        || coalesce(' using (' || r.q || ')', '') || coalesce(' with check (' || r.wc || ')', '');
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.rate_hits'::regclass and contype = 'p') then
    alter table public.rate_hits add column id bigint generated always as identity primary key;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.submit_rate'::regclass and contype = 'p') then
    alter table public.submit_rate add column id bigint generated always as identity primary key;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------- 5. exploitation (tables d'abord : la purge les vide)
-- Erreurs du jeu : une ligne par message distinct et par lot (hits = nombre d'occurrences). Rien qui identifie : un identifiant d'installation
-- aléatoire (le même que celui des statistiques), la version, le message nettoyé (sans adresse), le fichier et la ligne, la famille de navigateur.
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  install text not null check (install ~ '^[0-9a-f]{16}$'),
  version text not null check (char_length(version) between 1 and 24),
  phys_ver int not null check (phys_ver between 1 and 10000),
  kind text not null check (kind in ('error', 'rejection', 'loop')),
  message text not null check (char_length(message) between 1 and 300),
  source text not null default '' check (char_length(source) <= 200),
  browser text not null default 'other' check (browser in ('chrome', 'firefox', 'safari', 'edge', 'other')),
  mobile boolean not null default false,
  hits int not null default 1 check (hits between 1 and 1000)
);
create index if not exists client_errors_created on public.client_errors (created_at);
create index if not exists client_errors_install on public.client_errors (install, created_at);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from public, anon, authenticated;

-- Journal de maintenance : chaque purge y laisse une ligne (health_report() dit quand a eu lieu la dernière).
create table if not exists public.maintenance_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  what text not null,
  result jsonb not null default '{}'::jsonb
);
alter table public.maintenance_log enable row level security;
revoke all on public.maintenance_log from public, anon, authenticated;

-- Lot d'erreurs envoyé par le jeu (js/errorReport.js) : 20 au plus, lignes invalides ignorées ; 60 lignes par installation et par heure,
-- 600 par minute en tout (au-delà, le lot est ignoré sans erreur). Même schéma que log_runs (étape 6, durcie aux étapes 14 et 17).
create or replace function public.log_errors(events jsonb) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e jsonb; n int := 0; inst text; recent int;
begin
  if events is null or jsonb_typeof(events) <> 'array' or jsonb_array_length(events) > 20 then raise exception 'Lot invalide'; end if;
  if (select count(*) from client_errors where created_at > now() - interval '1 minute') >= 600 then return 0; end if;
  for e in select * from jsonb_array_elements(events) loop
    begin
      inst := e->>'install';
      if inst is null or inst !~ '^[0-9a-f]{16}$' then continue; end if;
      select count(*) into recent from client_errors where install = inst and created_at > now() - interval '1 hour';
      if recent >= 60 then exit; end if;
      insert into client_errors (install, version, phys_ver, kind, message, source, browser, mobile, hits)
      values (inst, e->>'version', (e->>'pv')::int, e->>'kind', left(regexp_replace(e->>'message', 'https?://\S+', '<url>', 'g'), 300),
              left(coalesce(e->>'source', ''), 200), coalesce(e->>'browser', 'other'), coalesce((e->>'mobile')::boolean, false),
              least(greatest(coalesce((e->>'hits')::int, 1), 1), 1000));
      n := n + 1;
    exception when others then
      null;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.log_errors(jsonb) from public, anon, authenticated;
grant execute on function public.log_errors(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------- 3. conservation
-- Activité d'une session invitée : sa création, sa dernière connexion, la dernière mise à jour de son compte technique, et le dernier
-- rafraîchissement d'une de ses sessions (le jeu rafraîchit la session tant qu'on joue en ligne).
create or replace function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g int := 0; r int := 0; e int := 0; c int := 0; m int := 0; res jsonb;
begin
  with d as (
    delete from auth.users u
    where u.is_anonymous
      and greatest(u.created_at, coalesce(u.last_sign_in_at, u.created_at), coalesce(u.updated_at, u.created_at),
            coalesce((select max(greatest(s.created_at, coalesce(s.updated_at, s.created_at), coalesce(s.refreshed_at::timestamptz, s.created_at)))
                      from auth.sessions s where s.user_id = u.id), u.created_at))
          < now() - interval '12 months'
    returning 1)
  select count(*) into g from d;
  with d as (delete from run_stats where created_at < now() - interval '12 months' returning 1) select count(*) into r from d;
  with d as (delete from client_errors where created_at < now() - interval '90 days' returning 1) select count(*) into e from d;
  with d as (delete from rate_hits where at < clock_timestamp() - interval '1 hour' returning 1) select count(*) into c from d;
  with d as (delete from submit_rate where at < now() - interval '1 hour' returning 1) select count(*) + c into c from d;
  with d as (delete from maintenance_log where at < now() - interval '400 days' returning 1) select count(*) into m from d;
  res := jsonb_build_object('invites', g, 'statistiques', r, 'erreurs', e, 'compteurs', c, 'journal', m);
  -- Historique de pg_cron : il ne se vide pas tout seul (et pèse sur les mises à jour de Postgres).
  begin
    execute 'delete from cron.job_run_details where end_time < now() - interval ''30 days''';
  exception when others then null;
  end;
  insert into maintenance_log (what, result) values ('purge_expired', res);
  return res;
end $$;
revoke all on function public.purge_expired() from public, anon, authenticated;

-- Chaque nuit à 03:17 (UTC), si pg_cron est là. Sans pg_cron (base locale de test), rien n'est planifié : la purge se lance à la main.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';      -- (la forme documentée par Supabase : guides/cron/install)
    execute 'grant usage on schema cron to postgres';
    execute 'grant all privileges on all tables in schema cron to postgres';
    execute $c$select cron.schedule('virelo-purge', '17 3 * * *', 'select public.purge_expired()')$c$;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------- 4. archivage (préparé)
create table if not exists public.scores_archive (like public.scores including defaults);
alter table public.scores_archive add column if not exists archived_at timestamptz not null default now();
alter table public.scores_archive add column if not exists id bigint generated always as identity primary key;      -- (en dernier : l'archivage insère les colonnes de scores puis archived_at)
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.scores_archive'::regclass and contype = 'f') then
    -- (un compte supprimé emporte aussi ses temps archivés)
    alter table public.scores_archive add constraint scores_archive_player_fk foreign key (player) references public.players (id) on delete cascade;
  end if;
end $$;
create index if not exists scores_archive_player_fk on public.scores_archive (player);
alter table public.scores_archive enable row level security;
revoke all on public.scores_archive from public, anon, authenticated;
grant select on public.scores_archive to authenticated;
drop policy if exists "Lire ses temps archivés" on public.scores_archive;
create policy "Lire ses temps archivés" on public.scores_archive for select to authenticated using (player = (select auth.uid()));

-- Déplace dans scores_archive tous les temps d'une autre physique que `garder`, sauf ceux des saisons. À lancer une fois, à la main.
create or replace function public.archive_old_scores(garder int) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if garder is null or garder < 1 then raise exception 'Version de physique à garder invalide'; end if;
  with moved as (
    delete from scores where phys_ver <> garder and track_key not like '%~v1.sea-%' returning *
  )
  insert into scores_archive select moved.*, now() from moved;
  get diagnostics n = row_count;
  insert into maintenance_log (what, result) values ('archive_old_scores', jsonb_build_object('garder', garder, 'archives', n));
  return n;
end $$;
revoke all on function public.archive_old_scores(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------- 5. surveillance
-- Des nombres agrégés sur 24 h, rien de personnel : lisible sans session (tools/surveillance.mjs, tous les jours).
create or replace function public.health_report() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'at', now(),
    'phys_ver', (select max(phys_ver) from scores),
    'scores_24h', (select count(*) from scores where updated_at > now() - interval '24 hours'),
    'runs_24h', (select count(*) from run_stats where created_at > now() - interval '24 hours'),
    'errors_24h', (select coalesce(sum(hits), 0) from client_errors where created_at > now() - interval '24 hours'),
    'error_installs_24h', (select count(distinct install) from client_errors where created_at > now() - interval '24 hours'),
    'installs_24h', (select count(distinct install) from run_stats where created_at > now() - interval '24 hours'),
    'players_7d', (select count(*) from players where created_at > now() - interval '7 days'),
    'tracks', (select count(*) from tracks where not hidden),
    'purge_last', (select max(at) from maintenance_log where what = 'purge_expired'),
    'purge_scheduled', exists (select 1 from pg_extension where extname = 'pg_cron')
  );
$$;
revoke all on function public.health_report() from public, anon, authenticated;
grant execute on function public.health_report() to anon, authenticated;

notify pgrst, 'reload schema';
