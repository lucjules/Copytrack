-- =====================================================================================
-- Copytrack : étape 1 (pilotes et circuits de la communauté)
-- À coller dans Supabase > SQL Editor > New query, puis « Run ».
-- Le script peut être relancé sans danger (il ne recrée pas ce qui existe déjà).
--
-- Sécurité : chaque table est protégée par des règles (Row Level Security).
-- La clé publique du jeu ne peut faire QUE ce que ces règles autorisent :
--   - tout le monde peut lire les pilotes et les circuits visibles ;
--   - un pilote ne peut créer / modifier que son propre profil ;
--   - un pilote ne peut publier ou supprimer que ses propres circuits ;
--   - les compteurs (parties, j'aime, signalements) ne changent que par des
--     fonctions contrôlées ; 3 signalements masquent un circuit.
-- =====================================================================================

-- ---------- Pilotes -------------------------------------------------------------------
create table if not exists public.players (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  created_at timestamptz not null default now()
);
alter table public.players enable row level security;

drop policy if exists "Pilotes visibles par tous" on public.players;
create policy "Pilotes visibles par tous" on public.players
  for select using (true);
drop policy if exists "Créer son profil" on public.players;
create policy "Créer son profil" on public.players
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "Modifier son profil" on public.players;
create policy "Modifier son profil" on public.players
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Circuits publiés -------------------------------------------------------------
create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references public.players (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  decor text not null check (char_length(decor) <= 20),
  code text not null check (char_length(code) <= 100000),
  signature text not null unique check (char_length(signature) <= 40),
  author_time real not null check (author_time > 0 and author_time < 3600),
  pieces int not null check (pieces between 2 and 5000),
  laps int not null default 1 check (laps between 1 and 9),
  plays int not null default 0,
  likes int not null default 0,
  reports int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tracks_recent on public.tracks (created_at desc);
create index if not exists tracks_popular on public.tracks (likes desc, plays desc);
create index if not exists tracks_author on public.tracks (author);
alter table public.tracks enable row level security;

drop policy if exists "Circuits visibles" on public.tracks;
create policy "Circuits visibles" on public.tracks
  for select using (not hidden or author = auth.uid());
drop policy if exists "Publier ses circuits" on public.tracks;
create policy "Publier ses circuits" on public.tracks
  for insert to authenticated
  with check (author = auth.uid() and plays = 0 and likes = 0 and reports = 0 and hidden = false);
drop policy if exists "Supprimer ses circuits" on public.tracks;
create policy "Supprimer ses circuits" on public.tracks
  for delete to authenticated using (author = auth.uid());

-- Pas plus de 10 publications par heure et par pilote (anti-spam).
create or replace function public.tracks_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from tracks where author = new.author and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de publications : réessaie dans une heure.';
  end if;
  return new;
end $$;
drop trigger if exists tracks_rate_limit on public.tracks;
create trigger tracks_rate_limit before insert on public.tracks
  for each row execute function public.tracks_rate_limit();

-- ---------- J'aime et signalements -------------------------------------------------------
create table if not exists public.track_likes (
  track_id uuid not null references public.tracks (id) on delete cascade,
  player uuid not null default auth.uid() references public.players (id) on delete cascade,
  primary key (track_id, player)
);
alter table public.track_likes enable row level security;
drop policy if exists "Voir ses j'aime" on public.track_likes;
create policy "Voir ses j'aime" on public.track_likes
  for select to authenticated using (player = auth.uid());

create table if not exists public.track_reports (
  track_id uuid not null references public.tracks (id) on delete cascade,
  player uuid not null default auth.uid() references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (track_id, player)
);
alter table public.track_reports enable row level security;
-- (aucune règle de lecture : les signalements ne sont pas publics)

-- ---------- Fonctions appelées par le jeu ------------------------------------------------
create or replace function public.track_played(t uuid) returns void
language sql security definer set search_path = public as $$
  update tracks set plays = plays + 1 where id = t;
$$;

create or replace function public.toggle_like(t uuid) returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if exists (select 1 from track_likes where track_id = t and player = uid) then
    delete from track_likes where track_id = t and player = uid;
  else
    insert into track_likes (track_id, player) values (t, uid);
  end if;
  select count(*) into n from track_likes where track_id = t;
  update tracks set likes = n where id = t;
  return n;
end $$;

create or replace function public.report_track(t uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  insert into track_reports (track_id, player) values (t, uid) on conflict do nothing;
  select count(*) into n from track_reports where track_id = t;
  update tracks set reports = n, hidden = (n >= 3) where id = t;
end $$;

revoke all on function public.track_played(uuid) from public, anon;
revoke all on function public.toggle_like(uuid) from public, anon;
revoke all on function public.report_track(uuid) from public, anon;
grant execute on function public.track_played(uuid) to authenticated;
grant execute on function public.toggle_like(uuid) to authenticated;
grant execute on function public.report_track(uuid) to authenticated;

-- ---------- Droits d'accès de l'API (les règles ci-dessus filtrent ensuite) ---------------
grant usage on schema public to anon, authenticated;
grant select on public.players, public.tracks to anon, authenticated;
grant insert, update on public.players to authenticated;
grant insert, delete on public.tracks to authenticated;
grant select on public.track_likes to authenticated;
