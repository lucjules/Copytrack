-- =====================================================================================
-- Copytrack : étape 14 (durcissement, phase 4) — à lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 13.
-- Peut être relancé sans danger. AUCUNE suppression de données : on ne fait que restreindre des droits et ajouter ce qui manque.
--
--  1. Profils : un pilote ne pouvait modifier que SA ligne, mais toutes ses colonnes, dont `created_at` (date de création) : il pouvait donc se
--     rajeunir… ou se vieillir, et contourner la règle de l'étape 5 « un signalement ne compte que s'il vient d'un profil de plus de 24 h ».
--     Désormais le jeu ne peut écrire que `id` et `name` (et `title`, via set_title, fonction du serveur).
--  2. Limitation des soumissions de scores PARTAGÉE entre toutes les instances de la fonction serveur : la limitation en mémoire de `submit-score` est
--     propre à chaque instance (une rafale répartie sur plusieurs instances la contourne). Cette table et `submit_rate_check` comptent les soumissions
--     en base, de façon atomique. Réservées à la clé de service (la fonction serveur) : le jeu n'y a aucun accès.
--  3. Statistiques anonymes (log_runs, ouvertes à anon) : l'identifiant d'installation étant choisi par l'appelant, la limite « par installation » ne
--     bornait pas un flot d'identifiants inventés. Un plafond GLOBAL (par minute) s'ajoute.
-- =====================================================================================

-- 1. Profils : droits par colonne.
revoke insert, update on public.players from authenticated;
grant insert (id, name), update (name) on public.players to authenticated;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'title') then
    -- (le titre ne s'écrit que par set_title(), qui valide la liste des titres)
    revoke all (title) on public.players from authenticated;
    grant select (title) on public.players to anon, authenticated;
  end if;
end $$;

-- 2. Soumissions de scores : fenêtre glissante partagée.
create table if not exists public.submit_rate (
  player uuid not null,
  at timestamptz not null default now()
);
create index if not exists submit_rate_player on public.submit_rate (player, at);
create index if not exists submit_rate_at on public.submit_rate (at);
alter table public.submit_rate enable row level security;
revoke all on public.submit_rate from public, anon, authenticated;

-- Renvoie 0 si la soumission est acceptée (et la compte), sinon le nombre de secondes à attendre.
-- global_max : plafond TOUS pilotes confondus sur la même fenêtre (0 = aucun). Les sessions anonymes étant gratuites, la limite par pilote seule se
-- contourne en changeant de session : ce plafond borne le nombre total de rejeux (donc le processeur dépensé) quoi qu'il arrive.
drop function if exists public.submit_rate_check(uuid, int, int);
create or replace function public.submit_rate_check(p uuid, max_hits int, window_s int, global_max int default 0) returns int
language plpgsql security definer set search_path = public as $$
declare recent int; oldest timestamptz;
begin
  if p is null or max_hits < 1 or window_s < 1 then raise exception 'Paramètres invalides'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p::text, 0));          -- deux requêtes du même pilote en même temps passent l'une après l'autre
  delete from submit_rate where player = p and at < now() - make_interval(secs => window_s);
  select count(*), min(at) into recent, oldest from submit_rate where player = p;
  if recent >= max_hits then
    return greatest(1, ceil(extract(epoch from (oldest + make_interval(secs => window_s) - now())))::int);
  end if;
  if global_max > 0 and (select count(*) from submit_rate where at > now() - make_interval(secs => window_s)) >= global_max then
    return window_s;
  end if;
  insert into submit_rate (player) values (p);
  return 0;
end $$;
revoke all on function public.submit_rate_check(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.submit_rate_check(uuid, int, int, int) to service_role;

-- Ménage des lignes anciennes (une heure suffit : aucune fenêtre n'est plus longue) ; à appeler de temps en temps, sans danger.
create or replace function public.submit_rate_purge() returns int
language sql security definer set search_path = public as $$
  with d as (delete from submit_rate where at < now() - interval '1 hour' returning 1) select count(*)::int from d;
$$;
revoke all on function public.submit_rate_purge() from public, anon, authenticated;
grant execute on function public.submit_rate_purge() to service_role;

-- 3. log_runs : même fonction qu'à l'étape 6, plus un plafond global de 3000 lignes par minute (au-delà, le lot est ignoré, sans erreur).
create or replace function public.log_runs(events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  e jsonb; n int := 0; inst text; recent int;
begin
  if events is null or jsonb_typeof(events) <> 'array' or jsonb_array_length(events) > 50 then
    raise exception 'Lot invalide';
  end if;
  if (select count(*) from run_stats where created_at > now() - interval '1 minute') >= 3000 then return 0; end if;
  for e in select * from jsonb_array_elements(events) loop
    begin
      inst := e->>'install';
      if inst is null or inst !~ '^[0-9a-f]{16}$' then continue; end if;
      select count(*) into recent from run_stats where install = inst and created_at > now() - interval '1 hour';
      if recent >= 300 then exit; end if;
      insert into run_stats (install, track, outcome, time, progress, respawns, attempt, phys_ver, medal)
      values (
        inst, e->>'track', e->>'outcome', (e->>'time')::real, (e->>'progress')::real,
        coalesce((e->>'respawns')::int, 0), coalesce((e->>'attempt')::int, 1), (e->>'pv')::int, e->>'medal'
      );
      n := n + 1;
    exception when others then
      null;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.log_runs(jsonb) from public;
grant execute on function public.log_runs(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
