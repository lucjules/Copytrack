-- =====================================================================================
-- Copytrack : étape 12 (compétition asynchrone : duels classés et tournois privés) — à lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 11.
-- Peut être relancé sans danger. Copytrack Evolution, E17.
--
-- DUELS entre amis (comptes) : l'un défie l'autre sur un circuit de la carrière ; le duel dure 24 h. Les temps sont une catégorie de record
-- « b-…~v1.duel-N » : la fonction submit-score les rejoue et ne les accepte que des deux duellistes (le défié, une fois le duel accepté), avant
-- l'échéance. À l'échéance, le meilleur temps de chacun SOUS CETTE CLÉ (table scores, temps vérifiés) décide : plus rapide gagne, un seul temps gagne
-- contre aucun, égalité parfaite = nul, aucun temps = duel annulé. Le classement ELO (départ 1200, K = 32) est calculé ici, jamais par le jeu.
-- TOURNOIS privés : un créateur, un circuit, une date de fin (1 à 14 jours), un code à 6 caractères pour entrer. Les temps : « b-…~v1.tour-N »,
-- acceptés des seuls inscrits pendant le tournoi. À la date de fin, le classement est figé (tournament_players.rank).
-- CLÔTURE : settle_due() règle les duels échus et clôt les tournois finis, une seule fois chacun ; le jeu l'appelle avant d'afficher la compétition
-- (pg_cron facultatif : select cron.schedule('copytrack-competition', '*/10 * * * *', 'select public.settle_due()');).
-- L'heure : season_clock() (étape 11), fixée seulement par les tests SQL.
-- =====================================================================================

create table if not exists public.ratings (
  player uuid primary key references public.players (id) on delete cascade,
  rating int not null default 1200,
  games int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.duels (
  id bigint generated always as identity primary key,
  challenger uuid not null references public.players (id) on delete cascade,
  opponent uuid not null references public.players (id) on delete cascade,
  track_key text not null check (track_key ~ '^b-[a-z0-9-]{1,58}$'),
  track_name text not null default '' check (char_length(track_name) <= 60),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'settled', 'void')),
  created_at timestamptz not null default now(),
  ends_at timestamptz not null,
  c_time double precision, o_time double precision,          -- figés au règlement (depuis scores)
  winner uuid, c_delta int, o_delta int, settled_at timestamptz,
  check (challenger <> opponent)
);
create index if not exists duels_challenger on public.duels (challenger);
create index if not exists duels_opponent on public.duels (opponent);
create table if not exists public.tournaments (
  id bigint generated always as identity primary key,
  owner uuid not null references public.players (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  track_key text not null check (track_key ~ '^b-[a-z0-9-]{1,58}$'),
  track_name text not null default '' check (char_length(track_name) <= 60),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  closed_at timestamptz
);
create table if not exists public.tournament_players (
  tournament bigint not null references public.tournaments (id) on delete cascade,
  player uuid not null references public.players (id) on delete cascade,
  joined_at timestamptz not null default now(),
  rank int, "time" double precision,
  primary key (tournament, player)
);
-- Suis-je inscrit à ce tournoi ? (fonction : une règle de lecture de tournament_players ne peut pas relire tournament_players sans boucler)
create or replace function public.in_tournament(tid bigint) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from tournament_players where tournament = tid and player = auth.uid()) $$;

alter table public.ratings enable row level security;
alter table public.duels enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
drop policy if exists "Classement Elo visible par tous" on public.ratings;
create policy "Classement Elo visible par tous" on public.ratings for select using (true);
drop policy if exists "Duels visibles des duellistes" on public.duels;
create policy "Duels visibles des duellistes" on public.duels for select using (auth.uid() = challenger or auth.uid() = opponent);
drop policy if exists "Tournois visibles des inscrits" on public.tournaments;
create policy "Tournois visibles des inscrits" on public.tournaments for select using (public.in_tournament(id));
drop policy if exists "Inscrits visibles des inscrits" on public.tournament_players;
create policy "Inscrits visibles des inscrits" on public.tournament_players for select using (public.in_tournament(tournament));
revoke all on public.ratings, public.duels, public.tournaments, public.tournament_players from anon, authenticated;
grant select on public.ratings to anon, authenticated;
grant select on public.duels, public.tournaments, public.tournament_players to authenticated;

-- Meilleur temps vérifié d'un pilote sous une clé (version de physique la plus récente de la clé).
create or replace function public.best_time(k text, p uuid) returns double precision
language sql stable security definer set search_path = public as $$
  select min(s.time) from scores s where s.track_key = k and s.player = p and s.phys_ver = (select max(x.phys_ver) from scores x where x.track_key = k);
$$;

-- ---- Duels --------------------------------------------------------------------------------------------------------------------------
create or replace function public.duel_challenge(target uuid, track text, tname text default '') returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nid bigint;
begin
  if uid is null or not exists (select 1 from accounts where user_id = uid) then raise exception 'Un compte est nécessaire pour les duels.'; end if;
  if not exists (select 1 from friends f where f.status = 'accepted' and ((f.a = uid and f.b = target) or (f.a = target and f.b = uid))) then raise exception 'On ne défie que ses amis.'; end if;
  if track !~ '^b-[a-z0-9-]{1,58}$' then raise exception 'Circuit de duel invalide (circuits de la carrière seulement).'; end if;
  if (select count(*) from duels where (challenger = uid or opponent = uid) and status in ('pending', 'accepted')) >= 10 then raise exception 'Dix duels en cours au plus.'; end if;
  insert into duels (challenger, opponent, track_key, track_name, ends_at) values (uid, target, track, left(coalesce(tname, ''), 60), season_clock() + interval '24 hours') returning id into nid;
  return nid;
end $$;

create or replace function public.duel_respond(duel bigint, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update duels set status = case when accept then 'accepted' else 'declined' end
  where id = duel and opponent = auth.uid() and status = 'pending' and ends_at > season_clock();
end $$;

-- Elo : nouveau classement de A contre B (score 1 victoire, 0.5 nul, 0 défaite), K = 32.
create or replace function public.elo(ra int, rb int, score numeric) returns int
language sql immutable as $$ select round(ra + 32 * (score - 1 / (1 + power(10, (rb - ra) / 400.0))))::int $$;

-- Règle un duel échu (une seule fois). Renvoie true s'il l'a réglé.
create or replace function public.settle_duel(duel bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare d duels%rowtype; k text; ct double precision; ot double precision; rc int; ro int; sc numeric;
begin
  select * into d from duels where id = duel for update;
  if not found or d.status not in ('pending', 'accepted') or season_clock() < d.ends_at then return false; end if;
  k := d.track_key || '~v1.duel-' || d.id;
  ct := best_time(k, d.challenger);
  ot := case when d.status = 'accepted' then best_time(k, d.opponent) end;
  if d.status = 'pending' or (ct is null and ot is null) then
    update duels set status = 'void', c_time = ct, o_time = ot, settled_at = season_clock() where id = d.id;
    return true;
  end if;
  sc := case when ot is null or ct < ot then 1 when ct is null or ot < ct then 0 else 0.5 end;
  insert into ratings (player) values (d.challenger), (d.opponent) on conflict do nothing;
  select rating into rc from ratings where player = d.challenger;
  select rating into ro from ratings where player = d.opponent;
  update ratings set rating = elo(rc, ro, sc), games = games + 1, wins = wins + (sc = 1)::int, draws = draws + (sc = 0.5)::int, updated_at = season_clock() where player = d.challenger;
  update ratings set rating = elo(ro, rc, 1 - sc), games = games + 1, wins = wins + (sc = 0)::int, draws = draws + (sc = 0.5)::int, updated_at = season_clock() where player = d.opponent;
  update duels set status = 'settled', c_time = ct, o_time = ot, winner = case when sc = 1 then d.challenger when sc = 0 then d.opponent end,
    c_delta = elo(rc, ro, sc) - rc, o_delta = elo(ro, rc, 1 - sc) - ro, settled_at = season_clock() where id = d.id;
  return true;
end $$;

-- Mes duels : l'adversaire, le circuit, l'état, les temps (en cours : depuis scores ; réglés : figés), le résultat et l'Elo gagné ou perdu.
create or replace function public.my_duels(lim int default 30)
returns table (id bigint, opponent uuid, opponent_name text, mine boolean, track_key text, track_name text, status text, ends_at timestamptz,
               my_time double precision, their_time double precision, result text, delta int)
language sql stable security definer set search_path = public as $$
  select d.id, o.id, o.name, d.challenger = auth.uid(), d.track_key, d.track_name, d.status, d.ends_at,
    case when d.status in ('settled', 'void') then (case when d.challenger = auth.uid() then d.c_time else d.o_time end)
         else best_time(d.track_key || '~v1.duel-' || d.id, auth.uid()) end,
    case when d.status in ('settled', 'void') then (case when d.challenger = auth.uid() then d.o_time else d.c_time end) end,     -- le temps de l'autre : seulement à la fin
    case when d.status <> 'settled' then null when d.winner is null then 'draw' when d.winner = auth.uid() then 'win' else 'loss' end,
    case when d.challenger = auth.uid() then d.c_delta else d.o_delta end
  from duels d join players o on o.id = case when d.challenger = auth.uid() then d.opponent else d.challenger end
  where auth.uid() in (d.challenger, d.opponent)
  order by (d.status in ('pending', 'accepted')) desc, d.created_at desc
  limit greatest(1, least(coalesce(lim, 30), 100));
$$;

-- Face-à-face contre un pilote : victoires, nuls, défaites (duels réglés).
create or replace function public.head_to_head(other uuid) returns table (wins bigint, draws bigint, losses bigint)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where winner = auth.uid()), count(*) filter (where winner is null), count(*) filter (where winner = other)
  from duels where status = 'settled' and ((challenger = auth.uid() and opponent = other) or (challenger = other and opponent = auth.uid()));
$$;

-- Classement Elo de moi et mes amis.
create or replace function public.friends_ratings()
returns table (rank bigint, player uuid, name text, rating int, games int, wins int)
language sql stable security definer set search_path = public as $$
  with circle as (
    select auth.uid() as id
    union select case when f.a = auth.uid() then f.b else f.a end from friends f where f.status = 'accepted' and auth.uid() in (f.a, f.b)
  )
  select row_number() over (order by coalesce(r.rating, 1200) desc, p.name), c.id, p.name, coalesce(r.rating, 1200), coalesce(r.games, 0), coalesce(r.wins, 0)
  from circle c join players p on p.id = c.id left join ratings r on r.player = c.id
  where auth.uid() is not null
  order by coalesce(r.rating, 1200) desc, p.name;
$$;

-- ---- Tournois privés ----------------------------------------------------------------------------------------------------------------
create or replace function public.tournament_create(tname text, track text, trackname text, days int) returns table (id bigint, code text)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text; nid bigint; chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if uid is null or not exists (select 1 from accounts where user_id = uid) then raise exception 'Un compte est nécessaire pour créer un tournoi.'; end if;
  if track !~ '^b-[a-z0-9-]{1,58}$' then raise exception 'Circuit de tournoi invalide (circuits de la carrière seulement).'; end if;
  if char_length(trim(coalesce(tname, ''))) < 1 then raise exception 'Donne un nom au tournoi.'; end if;
  if (select count(*) from tournaments t where t.owner = uid and t.closed_at is null) >= 5 then raise exception 'Cinq tournois ouverts au plus.'; end if;
  loop
    c := (select string_agg(substr(chars, 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from tournaments t where t.code = c);
  end loop;
  insert into tournaments (owner, name, track_key, track_name, code, starts_at, ends_at)
    values (uid, left(trim(tname), 40), track, left(coalesce(trackname, ''), 60), c, season_clock(), season_clock() + make_interval(days => greatest(1, least(coalesce(days, 3), 14))))
    returning tournaments.id into nid;
  insert into tournament_players (tournament, player) values (nid, uid);
  return query select nid, c;
end $$;

create or replace function public.tournament_join(jcode text) returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t tournaments%rowtype;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  select * into t from tournaments where code = upper(trim(jcode));
  if not found then raise exception 'Aucun tournoi avec ce code.'; end if;
  if t.closed_at is not null or season_clock() >= t.ends_at then raise exception 'Ce tournoi est terminé.'; end if;
  if (select count(*) from tournament_players where tournament = t.id) >= 64 then raise exception 'Tournoi complet (64 pilotes).'; end if;
  insert into tournament_players (tournament, player) values (t.id, uid) on conflict do nothing;
  return t.id;
end $$;

-- Classement d'un tournoi (inscrits seulement) : en cours, depuis scores ; clos, figé.
create or replace function public.tournament_board(tid bigint)
returns table (rank bigint, player uuid, name text, "time" double precision)
language sql stable security definer set search_path = public as $$
  with t as (select * from tournaments where id = tid and exists (select 1 from tournament_players me where me.tournament = tid and me.player = auth.uid())),
  rows as (
    select tp.player, case when (select closed_at from t) is not null then tp.time else best_time((select track_key from t) || '~v1.tour-' || tid, tp.player) end as tm
    from tournament_players tp where tp.tournament = tid and exists (select 1 from t)
  )
  select row_number() over (order by r.tm nulls last, p.name), r.player, p.name, r.tm from rows r join players p on p.id = r.player
  order by r.tm nulls last, p.name;
$$;

create or replace function public.my_tournaments()
returns table (id bigint, name text, code text, track_key text, track_name text, ends_at timestamptz, closed boolean, players bigint, my_rank int, owner boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.code, t.track_key, t.track_name, t.ends_at, t.closed_at is not null, (select count(*) from tournament_players x where x.tournament = t.id), tp.rank, t.owner = auth.uid()
  from tournaments t join tournament_players tp on tp.tournament = t.id and tp.player = auth.uid()
  order by (t.closed_at is null) desc, t.ends_at desc
  limit 30;
$$;

create or replace function public.close_tournament(tid bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare t tournaments%rowtype;
begin
  select * into t from tournaments where id = tid for update;
  if not found or t.closed_at is not null or season_clock() < t.ends_at then return false; end if;
  update tournament_players tp set time = best_time(t.track_key || '~v1.tour-' || t.id, tp.player) where tp.tournament = t.id;
  update tournament_players tp set rank = r.rk from (
    select player, row_number() over (order by time nulls last, player) as rk from tournament_players where tournament = t.id and time is not null
  ) r where tp.tournament = t.id and tp.player = r.player;
  update tournaments set closed_at = season_clock() where id = t.id;
  return true;
end $$;

-- Règle tout ce qui est échu (duels, tournois) : appelée par le jeu avant d'afficher la compétition, et par pg_cron si on l'a activé.
create or replace function public.settle_due() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select id from duels where status in ('pending', 'accepted') and ends_at <= season_clock() order by id loop
    if settle_duel(r.id) then n := n + 1; end if;
  end loop;
  for r in select id from tournaments where closed_at is null and ends_at <= season_clock() order by id loop
    if close_tournament(r.id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Fenêtre d'une course de duel ou de tournoi (lue par la fonction submit-score avec la clé de service) : '' si le pilote peut y courir, sinon la raison.
create or replace function public.competition_open(kind text, cid bigint, p uuid, base text) returns text
language plpgsql stable security definer set search_path = public as $$
declare d duels%rowtype; t tournaments%rowtype;
begin
  if kind = 'duel' then
    select * into d from duels where id = cid;
    if not found or d.track_key <> base then return 'Duel introuvable sur ce circuit.'; end if;
    if season_clock() >= d.ends_at or d.status not in ('pending', 'accepted') then return 'Ce duel est terminé.'; end if;
    if p = d.challenger or (p = d.opponent and d.status = 'accepted') then return ''; end if;
    return 'Tu ne fais pas partie de ce duel.';
  elsif kind = 'tour' then
    select * into t from tournaments where id = cid;
    if not found or t.track_key <> base then return 'Tournoi introuvable sur ce circuit.'; end if;
    if t.closed_at is not null or season_clock() >= t.ends_at or season_clock() < t.starts_at then return 'Ce tournoi est terminé.'; end if;
    if exists (select 1 from tournament_players where tournament = cid and player = p) then return ''; end if;
    return 'Tu n''es pas inscrit à ce tournoi.';
  end if;
  return 'Compétition inconnue.';
end $$;

revoke execute on function public.best_time(text, uuid), public.settle_duel(bigint), public.close_tournament(bigint), public.competition_open(text, bigint, uuid, text) from public, anon, authenticated;
revoke execute on function public.duel_challenge(uuid, text, text), public.duel_respond(bigint, boolean), public.my_duels(int), public.head_to_head(uuid), public.friends_ratings(),
  public.tournament_create(text, text, text, int), public.tournament_join(text), public.tournament_board(bigint), public.my_tournaments() from public, anon;
grant execute on function public.duel_challenge(uuid, text, text), public.duel_respond(bigint, boolean), public.my_duels(int), public.head_to_head(uuid), public.friends_ratings(),
  public.tournament_create(text, text, text, int), public.tournament_join(text), public.tournament_board(bigint), public.my_tournaments(), public.settle_due() to authenticated;
grant execute on function public.elo(int, int, numeric) to anon, authenticated;
grant execute on function public.in_tournament(bigint) to authenticated;
-- La fonction submit-score (clé de service) lit la fenêtre d'un duel ou d'un tournoi.
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.competition_open(text, bigint, uuid, text) to service_role; end if; end $$;

notify pgrst, 'reload schema';
