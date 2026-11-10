-- =====================================================================================
-- Copytrack : RETOUR ARRIÈRE de l'étape 15 — à lancer dans Supabase > SQL Editor si l'étape 15 pose problème. Peut être relancé sans danger.
--
-- Il rétablit les définitions des étapes 5 et 14 (déclencheur du plafond, submit_rate_check, droits d'insertion sur tracks) et retire les fonctions de
-- l'étape 15. Il NE SUPPRIME AUCUNE DONNÉE : les tables rate_hits et track_binds et la colonne tracks.author_verified restent (inoffensives) ;
-- leur suppression éventuelle est en commentaire en bas, à décider à part.
--
-- Il annule aussi l'étape 15b (la première instruction rétablit l'insertion directe des circuits). Redéployer ensuite l'ancienne fonction submit-score :
-- la nouvelle (action publish-track, submit_best, rate_check) ne fonctionne plus sans l'étape 15. L'ancienne ne s'appuie que sur submit_rate_check, rétablie ici.
-- =====================================================================================

-- 1. Insertion directe des circuits (droits de l'étape 1) — annule aussi l'étape 15b.
grant insert on public.tracks to authenticated;

-- 2. Plafond de 2 000 temps : définition de l'étape 5.
create or replace function public.scores_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from scores where player = new.player) >= 2000 then
    raise exception 'Trop de temps enregistrés pour ce pilote.';
  end if;
  return new;
end $$;
drop trigger if exists scores_limit on public.scores;
create trigger scores_limit before insert on public.scores
  for each row execute function public.scores_limit();

-- 3. Limitation de cadence : définition de l'étape 14 (table submit_rate).
create table if not exists public.submit_rate (
  player uuid not null,
  at timestamptz not null default now()
);
create index if not exists submit_rate_player on public.submit_rate (player, at);
create index if not exists submit_rate_at on public.submit_rate (at);
alter table public.submit_rate enable row level security;
revoke all on public.submit_rate from public, anon, authenticated;

drop function if exists public.submit_rate_check(uuid, int, int, int);
create or replace function public.submit_rate_check(p uuid, max_hits int, window_s int, global_max int default 0) returns int
language plpgsql security definer set search_path = public as $$
declare recent int; oldest timestamptz;
begin
  if p is null or max_hits < 1 or window_s < 1 then raise exception 'Paramètres invalides'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p::text, 0));
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

-- 4. Fonctions de l'étape 15 (la fonction serveur de l'étape 15 ne fonctionne plus sans elles : redéployer l'ancienne).
drop function if exists public.submit_best(uuid, text, double precision, text, int, text, jsonb, text, jsonb, text);
drop function if exists public.publish_track(uuid, text, text, text, text, double precision, int, int, text, text);
drop function if exists public.publish_track(uuid, text, text, text, text, double precision, int, int, text);
drop function if exists public.rate_check(text, uuid, int, int, int, boolean, int);
drop function if exists public.rate_purge();

notify pgrst, 'reload schema';

-- Suppressions de DONNÉES, volontairement NON exécutées (à décider à part, après sauvegarde) :
--   drop table public.rate_hits;      -- compteurs de cadence (de courte durée de vie)
--   drop table public.track_binds;    -- empreintes fortes des circuits de joueurs (perdre cette table rouvre la fabrication de circuits de même clé)
--   alter table public.tracks drop column author_verified;
