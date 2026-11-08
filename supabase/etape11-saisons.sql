-- =====================================================================================
-- Copytrack : étape 11 (saisons hebdomadaires et divisions) — à lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 10.
-- Peut être relancé sans danger. Copytrack Evolution, E15.
--
-- Une SAISON dure une semaine (du lundi 00:00 UTC au lundi suivant ; la saison 1 commence le 9 novembre 2026, comme js/seasons.js). Ses trois
-- circuits sont choisis par le jeu d'après le numéro de la saison ; leurs temps sont des catégories de record « …~v1.sea-N » : la fonction serveur
-- submit-score les rejoue et ne les accepte QUE pendant la semaine N, sur les circuits de la saison N. Aucun point n'est déclaré par le client :
-- tout est calculé ici depuis la table scores.
--
-- Points d'une saison : sur chaque circuit, 1000 × (meilleur temps de la saison / mon temps), arrondi vers le bas ; on additionne les trois circuits.
-- DIVISIONS : 1 (Élite) à 5 (Débutant) ; un nouveau pilote commence en 5. À la clôture, dans chaque division : les 20 % premiers montent (au moins un,
-- dès 3 participants), les 20 % derniers descendent (au moins un, dès 5 participants) ; l'historique est gardé (division_history).
--
-- CLÔTURE : close_due_seasons() clôt toutes les saisons finies, une seule fois chacune. Le jeu l'appelle avant d'afficher une saison : pg_cron n'est
-- donc pas indispensable. Pour une clôture à l'heure dite (facultatif : extension pg_cron, Supabase > Database > Extensions) :
--   select cron.schedule('copytrack-saisons', '5 0 * * 1', 'select public.close_due_seasons()');
-- =====================================================================================

-- L'heure des saisons : now(), sauf dans les tests SQL qui la fixent (set copytrack.now = '…'). Le jeu ne peut pas la changer : l'API REST de
-- Supabase n'exécute pas de SET, et seule la clé de service ouvre une session SQL.
create or replace function public.season_clock() returns timestamptz
language sql stable as $$ select coalesce(nullif(current_setting('copytrack.now', true), '')::timestamptz, now()) $$;

create or replace function public.season_bounds(n int) returns table (starts timestamptz, ends timestamptz)
language sql immutable as $$
  select timestamptz '2026-11-09 00:00:00+00' + make_interval(days => 7 * (n - 1)), timestamptz '2026-11-09 00:00:00+00' + make_interval(days => 7 * n);
$$;
create or replace function public.current_season() returns int
language sql stable as $$
  select greatest(1, floor(extract(epoch from (season_clock() - timestamptz '2026-11-09 00:00:00+00')) / 604800)::int + 1);
$$;

create table if not exists public.seasons (
  id int primary key check (id >= 1),
  closed_at timestamptz,
  participants int not null default 0
);
create table if not exists public.season_divisions (
  player uuid primary key references public.players (id) on delete cascade,
  division int not null default 5 check (division between 1 and 5),
  updated_at timestamptz not null default now()
);
create table if not exists public.division_history (
  season int not null,
  player uuid not null references public.players (id) on delete cascade,
  division int not null check (division between 1 and 5),
  points int not null,
  rank int not null,
  moved int not null check (moved between -1 and 1),          -- -1 : monte, 1 : descend
  primary key (season, player)
);
alter table public.seasons enable row level security;
alter table public.season_divisions enable row level security;
alter table public.division_history enable row level security;
drop policy if exists "Saisons visibles par tous" on public.seasons;
create policy "Saisons visibles par tous" on public.seasons for select using (true);
drop policy if exists "Divisions visibles par tous" on public.season_divisions;
create policy "Divisions visibles par tous" on public.season_divisions for select using (true);
drop policy if exists "Historique visible par tous" on public.division_history;
create policy "Historique visible par tous" on public.division_history for select using (true);
revoke all on public.seasons, public.season_divisions, public.division_history from anon, authenticated;
grant select on public.seasons, public.season_divisions, public.division_history to anon, authenticated;

-- Points de chaque pilote sur une saison (temps de la version de physique la plus récente de chaque circuit).
create or replace function public.season_points(n int) returns table (player uuid, points int, tracks int)
language sql stable security definer set search_path = public as $$
  with s as (
    select sc.track_key, sc.player, sc.time from scores sc
    where sc.track_key like '%~v1.sea-' || n
      and sc.phys_ver = (select max(x.phys_ver) from scores x where x.track_key = sc.track_key)
  ), b as (select track_key, min(time) as best from s group by track_key)
  select s.player, sum(floor(1000 * b.best / s.time))::int, count(*)::int from s join b using (track_key) group by s.player;
$$;

-- Classement d'une saison (en cours ou close) : division du pilote pendant cette saison, points, circuits courus.
create or replace function public.season_standings(n int, lim int default 50)
returns table (rank bigint, player uuid, name text, division int, points int, tracks int)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by sp.points desc, p.name), sp.player, p.name, coalesce(h.division, sd.division, 5), sp.points, sp.tracks
  from season_points(n) sp join players p on p.id = sp.player
  left join division_history h on h.season = n and h.player = sp.player
  left join season_divisions sd on sd.player = sp.player
  order by sp.points desc, p.name
  limit greatest(1, least(coalesce(lim, 50), 200));
$$;

-- Ma saison : division, points, place dans la division, participants de la division, et ce qui s'est passé à la clôture (moved).
create or replace function public.my_season(n int)
returns table (division int, points int, rank bigint, in_division bigint, moved int, closed boolean)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  div as (
    select coalesce((select h.division from division_history h where h.season = n and h.player = (select id from me)),
                    (select sd.division from season_divisions sd where sd.player = (select id from me)), 5) as d
  ),
  pts as (
    select sp.player, sp.points from season_points(n) sp
    left join division_history h on h.season = n and h.player = sp.player
    left join season_divisions sd on sd.player = sp.player
    where coalesce(h.division, sd.division, 5) = (select d from div)
  ),
  ranked as (select player, points, row_number() over (order by points desc, player) as r, count(*) over () as k from pts)
  select (select d from div), coalesce((select points from ranked where player = (select id from me)), 0),
         (select r from ranked where player = (select id from me)), coalesce((select max(k) from ranked), 0),
         (select h.moved from division_history h where h.season = n and h.player = (select id from me)),
         exists (select 1 from seasons where id = n and closed_at is not null)
  where (select id from me) is not null;
$$;

-- Clôture d'une saison finie : montées et descentes dans chaque division, historique. Renvoie le nombre de participants, 0 si déjà close, -1 si pas finie.
create or replace function public.close_season(n int) returns int
language plpgsql security definer set search_path = public as $$
declare e timestamptz; cnt int := 0; d int;
begin
  select ends into e from season_bounds(n);
  if n < 1 or season_clock() < e then return -1; end if;
  perform pg_advisory_xact_lock(4242, n);                        -- deux clôtures en même temps : une seule travaille
  if exists (select 1 from seasons where id = n and closed_at is not null) then return 0; end if;
  for d in 1 .. 5 loop
    insert into division_history (season, player, division, points, rank, moved)
    select n, r.player, d, r.points, r.rk,
      case when d > 1 and r.k >= 3 and r.rk <= greatest(1, floor(r.k * 0.2)) then -1
           when d < 5 and r.k >= 5 and r.rk > r.k - greatest(1, floor(r.k * 0.2)) then 1 else 0 end
    from (
      select sp.player, sp.points, row_number() over (order by sp.points desc, sp.player) as rk, count(*) over () as k
      from season_points(n) sp left join season_divisions sd on sd.player = sp.player
      where coalesce(sd.division, 5) = d
    ) r
    on conflict (season, player) do nothing;
  end loop;
  insert into season_divisions (player, division, updated_at)
    select h.player, h.division + h.moved, now() from division_history h where h.season = n
    on conflict (player) do update set division = excluded.division, updated_at = now();
  select count(*) into cnt from division_history where season = n;
  insert into seasons (id, closed_at, participants) values (n, now(), cnt)
    on conflict (id) do update set closed_at = now(), participants = excluded.participants;
  return cnt;
end $$;

-- Clôt toutes les saisons finies (une fois chacune) : appelée par le jeu avant d'afficher une saison, et par pg_cron si on l'a activé.
create or replace function public.close_due_seasons() returns int
language plpgsql security definer set search_path = public as $$
declare cur int := current_season(); first int; total int := 0; n int;
begin
  select max(id) + 1 into first from seasons where closed_at is not null;
  if first is null then
    select min(substring(track_key from '~v1\.sea-([0-9]+)$')::int) into first from scores where track_key like '%~v1.sea-%';
  end if;
  if first is null then return 0; end if;
  for n in first .. cur - 1 loop total := total + greatest(0, close_season(n)); end loop;
  return total;
end $$;

grant execute on function public.season_clock(), public.season_bounds(int), public.current_season(), public.season_points(int), public.season_standings(int, int), public.close_due_seasons() to anon, authenticated;
grant execute on function public.my_season(int) to authenticated;
revoke execute on function public.close_season(int) from public, anon, authenticated;     -- seulement par close_due_seasons (ou la clé de service)

notify pgrst, 'reload schema';
