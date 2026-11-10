-- =====================================================================================
-- Copytrack : étape 13 (communauté 2 : commentaires, playlists, sélection, découverte, recommandations, statistiques, modes publiés)
-- À lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 12. Peut être relancé sans danger.
--
--  1. Modération : table moderators (à remplir à la main, par la clé de service : insert into moderators values ('<uuid du compte>')).
--     Un modérateur masque ou rétablit un circuit, un commentaire ou un mode (mod_hide), et choisit la SÉLECTION (pick_track).
--  2. Commentaires sur les circuits publiés : comptes seulement ; 280 caractères ; limitation de débit (1 toutes les 20 s, 10 par heure,
--     40 par jour) ; masqués après 3 signalements de comptes distincts ; supprimables par leur auteur, l'auteur du circuit ou un modérateur.
--  3. Playlists : listes ordonnées de circuits publiés (50 au plus), publiques ou privées ; 20 par pilote.
--  4. Sélection : tracks.picked_at, posée par un modérateur ; l'onglet « Sélection » de la communauté la liste.
--  5. Découverte aléatoire (random_track) et recommandations (recommended_tracks : les circuits aimés par ceux qui aiment ce que j'aime).
--  6. Statistiques de circuit (track_stats) calculées depuis run_stats (étape 6), sans rien révéler d'un joueur : rien sous 5 installations.
--  7. Modes publiés : un mode de jeu (règles + objectif) dont les règles sont une catégorie de record (variante) : son classement, sur chaque
--     circuit, est celui de cette catégorie. 5 publications par jour, 20 par pilote ; masqués après 3 signalements.
-- Toutes les écritures passent par des fonctions : le jeu ne peut écrire directement dans aucune de ces tables.
-- =====================================================================================

-- ---- 1. Modération ----------------------------------------------------------------------------------------------------------------------
create table if not exists public.moderators (user_id uuid primary key references auth.users (id) on delete cascade);
alter table public.moderators enable row level security;
revoke all on public.moderators from anon, authenticated;
create or replace function public.is_moderator(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$ select u is not null and exists (select 1 from moderators where user_id = u) $$;
-- Un compte (et pas une session invitée) : condition pour commenter, publier un mode, signaler.
create or replace function public.is_account(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$ select u is not null and exists (select 1 from accounts where user_id = u) $$;

-- ---- 2. Commentaires --------------------------------------------------------------------------------------------------------------------
create table if not exists public.track_comments (
  id bigint generated always as identity primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  author uuid not null references public.players (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  reports int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists track_comments_track on public.track_comments (track_id, created_at desc);
create index if not exists track_comments_author on public.track_comments (author, created_at desc);
create table if not exists public.comment_reports (
  comment_id bigint not null references public.track_comments (id) on delete cascade,
  player uuid not null references auth.users (id) on delete cascade,
  primary key (comment_id, player)
);
alter table public.track_comments enable row level security;
alter table public.comment_reports enable row level security;
drop policy if exists "Commentaires visibles" on public.track_comments;
create policy "Commentaires visibles" on public.track_comments for select using (not hidden or author = auth.uid());
revoke all on public.track_comments, public.comment_reports from anon, authenticated;
grant select on public.track_comments to anon, authenticated;

create or replace function public.comment_add(t uuid, msg text) returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m text := btrim(coalesce(msg, '')); now_ timestamptz := season_clock(); cid bigint;
begin
  if not is_account(uid) then raise exception 'Un compte est nécessaire pour commenter.'; end if;
  if not exists (select 1 from players where id = uid) then raise exception 'Profil de pilote manquant.'; end if;
  if not exists (select 1 from tracks where id = t and not hidden) then raise exception 'Circuit introuvable.'; end if;
  if char_length(m) < 1 or char_length(m) > 280 then raise exception 'Un commentaire fait de 1 à 280 caractères.'; end if;
  if exists (select 1 from track_comments where author = uid and created_at > now_ - interval '20 seconds') then raise exception 'Doucement : un commentaire toutes les 20 secondes.'; end if;
  if (select count(*) from track_comments where author = uid and created_at > now_ - interval '1 hour') >= 10 then raise exception 'Trop de commentaires cette heure-ci (10).'; end if;
  if (select count(*) from track_comments where author = uid and created_at > now_ - interval '1 day') >= 40 then raise exception 'Trop de commentaires aujourd''hui (40).'; end if;
  insert into track_comments (track_id, author, body, created_at) values (t, uid, m, now_) returning id into cid;
  return cid;
end $$;

create or replace function public.comment_delete(c bigint) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  delete from track_comments tc where tc.id = c
    and (tc.author = uid or is_moderator(uid) or exists (select 1 from tracks t where t.id = tc.track_id and t.author = uid));
  if not found then raise exception 'Ce commentaire n''est pas à toi.'; end if;
end $$;

create or replace function public.comment_report(c bigint) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if not is_account(uid) then raise exception 'Un compte est nécessaire pour signaler.'; end if;
  if exists (select 1 from track_comments where id = c and author = uid) then raise exception 'C''est ton propre commentaire.'; end if;
  insert into comment_reports (comment_id, player) values (c, uid) on conflict do nothing;
  select count(*) into n from comment_reports where comment_id = c;
  update track_comments set reports = n, hidden = hidden or n >= 3 where id = c;
end $$;

-- Les commentaires visibles d'un circuit, du plus récent au plus ancien, avec le pseudo et le titre de leur auteur.
-- (« drop » d'abord : une base qui a reçu une édition plus ancienne de cette étape, sans la colonne title, ne peut pas la remplacer par « create or replace » : PostgreSQL
-- refuse de changer les colonnes renvoyées d'une fonction existante. Constaté sur la production, qui avait l'ancienne édition. Aucune donnée n'est touchée.)
drop function if exists public.track_comments_list(uuid, int, int);
create or replace function public.track_comments_list(t uuid, lim int default 30, off int default 0)
returns table (id bigint, author uuid, name text, title text, body text, created_at timestamptz, mine boolean, can_delete boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.author, p.name, p.title, c.body, c.created_at, c.author = auth.uid(),
         c.author = auth.uid() or tr.author = auth.uid() or is_moderator(auth.uid())
  from track_comments c join players p on p.id = c.author join tracks tr on tr.id = c.track_id
  where c.track_id = t and not c.hidden and not tr.hidden
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(lim, 30), 1), 100) offset greatest(coalesce(off, 0), 0);
$$;

-- ---- 3. Playlists -----------------------------------------------------------------------------------------------------------------------
create table if not exists public.playlists (
  id bigint generated always as identity primary key,
  owner uuid not null references public.players (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  public boolean not null default true,
  tracks uuid[] not null default '{}' check (cardinality(tracks) <= 50),
  updated_at timestamptz not null default now()
);
create index if not exists playlists_owner on public.playlists (owner);
alter table public.playlists enable row level security;
drop policy if exists "Playlists visibles" on public.playlists;
create policy "Playlists visibles" on public.playlists for select using (public or owner = auth.uid());
revoke all on public.playlists from anon, authenticated;
grant select on public.playlists to anon, authenticated;

-- Crée (pl null) ou remplace une playlist. Les circuits inconnus ou masqués sont retirés ; l'ordre et l'unicité sont gardés.
create or replace function public.playlist_save(pl bigint, pname text, is_public boolean, items uuid[]) returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(coalesce(pname, '')); clean uuid[]; out_id bigint;
begin
  if uid is null or not exists (select 1 from players where id = uid) then raise exception 'Profil de pilote manquant.'; end if;
  if char_length(n) < 1 or char_length(n) > 40 then raise exception 'Le nom d''une playlist fait de 1 à 40 caractères.'; end if;
  if cardinality(coalesce(items, '{}')) > 50 then raise exception 'Une playlist compte 50 circuits au plus.'; end if;
  select coalesce(array_agg(x.id order by x.o), '{}') into clean from (
    select distinct on (i.id) i.id, i.o from unnest(coalesce(items, '{}')) with ordinality as i (id, o) join tracks t on t.id = i.id and not t.hidden order by i.id, i.o
  ) x;
  if pl is null then
    if (select count(*) from playlists where owner = uid) >= 20 then raise exception 'Vingt playlists au plus.'; end if;
    insert into playlists (owner, name, public, tracks) values (uid, n, coalesce(is_public, true), clean) returning id into out_id;
  else
    update playlists set name = n, public = coalesce(is_public, true), tracks = clean, updated_at = now() where id = pl and owner = uid returning id into out_id;
    if out_id is null then raise exception 'Cette playlist n''est pas à toi.'; end if;
  end if;
  return out_id;
end $$;

create or replace function public.playlist_delete(pl bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from playlists where id = pl and owner = auth.uid();
  if not found then raise exception 'Cette playlist n''est pas à toi.'; end if;
end $$;

-- Playlists : les miennes, ou les publiques les plus récentes (avec le pseudo du propriétaire et le nombre de circuits).
create or replace function public.playlists_list(mine boolean default false, lim int default 30, off int default 0)
returns table (id bigint, owner uuid, name text, owner_name text, public boolean, n int, tracks uuid[], updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select pl.id, pl.owner, pl.name, p.name, pl.public, cardinality(pl.tracks), pl.tracks, pl.updated_at
  from playlists pl join players p on p.id = pl.owner
  where case when mine then pl.owner = auth.uid() else pl.public and cardinality(pl.tracks) > 0 end
  order by pl.updated_at desc, pl.id desc
  limit least(greatest(coalesce(lim, 30), 1), 100) offset greatest(coalesce(off, 0), 0);
$$;

-- ---- 4. Sélection ------------------------------------------------------------------------------------------------------------------------
alter table public.tracks add column if not exists picked_at timestamptz;
create index if not exists tracks_picked on public.tracks (picked_at desc) where picked_at is not null;
create or replace function public.pick_track(t uuid, pick boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.'; end if;
  update tracks set picked_at = case when pick then coalesce(picked_at, now()) else null end where id = t;
end $$;
-- Masquer / rétablir un circuit ('track'), un commentaire ('comment') ou un mode ('mode') : modérateurs seulement.
create or replace function public.mod_hide(kind text, target text, hide boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.'; end if;
  if kind = 'track' then update tracks set hidden = hide where id = target::uuid;
  elsif kind = 'comment' then update track_comments set hidden = hide where id = target::bigint;
  elsif kind = 'mode' then update community_modes set hidden = hide where id = target::bigint;
  else raise exception 'Type inconnu.'; end if;
end $$;

-- ---- 5. Découverte aléatoire et recommandations -----------------------------------------------------------------------------------------
-- Un circuit visible au hasard, de préférence un que je n'ai jamais joué (sinon n'importe lequel), hors des miens et de ceux à éviter.
create or replace function public.random_track(avoid uuid[] default '{}') returns uuid
language sql volatile security definer set search_path = public as $$
  select t.id from tracks t
  where not t.hidden and t.author is distinct from auth.uid() and not (t.id = any (coalesce(avoid, '{}')))
  order by (exists (select 1 from track_plays p where p.track_id = t.id and p.player = auth.uid())), random()
  limit 1;
$$;
-- Recommandations : les circuits aimés par les pilotes qui aiment les mêmes circuits que moi (au moins un j'aime en commun), que je n'ai ni
-- aimés ni joués ; puis les circuits des auteurs que je suis (score 0), puis les mieux aimés (score -1). score : nombre de « voisins » qui l'aiment.
create or replace function public.recommended_tracks(lim int default 12)
returns table (id uuid, score bigint)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as u),
  mine as (select l.track_id from track_likes l, me where l.player = me.u),
  peers as (select l.player, count(*) as common from track_likes l join mine m on m.track_id = l.track_id, me where l.player <> me.u group by l.player),
  cand as (
    select l.track_id as id, sum(pe.common) as score from track_likes l join peers pe on pe.player = l.player group by l.track_id
    union all
    select t.id, 0 from tracks t join follows f on f.author = t.author, me where f.follower = me.u
    union all
    select t.id, -1 from tracks t
  )
  select c.id, max(c.score)::bigint from cand c join tracks t on t.id = c.id, me
  where not t.hidden and t.author is distinct from me.u
    and not exists (select 1 from mine m where m.track_id = c.id)
    and not exists (select 1 from track_plays p where p.track_id = c.id and p.player = me.u)
  group by c.id, t.likes, t.created_at
  order by max(c.score) desc, t.likes desc, t.created_at desc
  limit least(greatest(coalesce(lim, 12), 1), 50);
$$;

-- ---- 6. Statistiques de circuit (depuis run_stats, étape 6) -----------------------------------------------------------------------------
-- k : identifiant de statistiques du circuit (telemetry.js : « eclats », « daily », « u_1abc… ») ; pv : version de la physique.
-- Rien (aucune ligne) sous 5 installations distinctes : on ne déduit rien d'un joueur isolé.
create or replace function public.track_stats(k text, pv int)
returns table (players bigint, runs bigint, finishes bigint, finish_rate real, median_time real, top_time real, avg_respawns real, quit_progress real)
language sql stable security definer set search_path = public as $$
  with r as (select * from run_stats where track = k and phys_ver = pv and created_at > now() - interval '180 days'),
  best as (select install, min(time) as t from r where outcome = 'finish' group by install)
  select (select count(distinct install) from r), (select count(*) from r), (select count(*) from r where outcome = 'finish'),
         ((select count(*) from r where outcome = 'finish')::real / greatest(1, (select count(*) from r)))::real,
         (select percentile_cont(0.5) within group (order by t) from best)::real,
         (select percentile_cont(0.1) within group (order by t) from best)::real,
         (select avg(respawns) from r where outcome = 'finish')::real,
         (select percentile_cont(0.5) within group (order by progress) from r where outcome = 'quit' and progress is not null)::real
  where (select count(distinct install) from r) >= 5;
$$;

-- ---- 7. Modes publiés -------------------------------------------------------------------------------------------------------------------
create table if not exists public.community_modes (
  id bigint generated always as identity primary key,
  owner uuid not null references public.players (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  description text not null default '' check (char_length(description) <= 100),
  variant text not null check (variant = '' or variant ~ '^v1(\.[a-z0-9]+-[a-z0-9]+)+$'),
  goal jsonb check (goal is null or (jsonb_typeof(goal) = 'object' and char_length(goal::text) <= 200)),
  plays int not null default 0,
  reports int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner, name)
);
create table if not exists public.mode_reports (
  mode_id bigint not null references public.community_modes (id) on delete cascade,
  player uuid not null references auth.users (id) on delete cascade,
  primary key (mode_id, player)
);
alter table public.community_modes enable row level security;
alter table public.mode_reports enable row level security;
drop policy if exists "Modes visibles" on public.community_modes;
create policy "Modes visibles" on public.community_modes for select using (not hidden or owner = auth.uid());
revoke all on public.community_modes, public.mode_reports from anon, authenticated;
grant select on public.community_modes to anon, authenticated;

-- Le client a déjà validé le mode (rules.js, variants.js) ; ici : forme, catégories connues (liste blanche des noms), débit, quotas.
create or replace function public.mode_publish(mname text, mdesc text, mvariant text, mgoal jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); now_ timestamptz := season_clock(); n text := btrim(coalesce(mname, '')); part text; mid bigint;
begin
  if not is_account(uid) then raise exception 'Un compte est nécessaire pour publier un mode.'; end if;
  if not exists (select 1 from players where id = uid) then raise exception 'Profil de pilote manquant.'; end if;
  if char_length(n) < 1 or char_length(n) > 24 then raise exception 'Le nom d''un mode fait de 1 à 24 caractères.'; end if;
  if coalesce(mvariant, '') <> '' then
    if mvariant !~ '^v1(\.[a-z0-9]+-[a-z0-9]+)+$' then raise exception 'Catégorie invalide.'; end if;
    foreach part in array string_to_array(substr(mvariant, 4), '.') loop
      if split_part(part, '-', 1) <> all (array['g', 'gp', 'lap', 'obs', 'off', 'pm', 'rn', 'v0', 'veh', 'vm', 'wd']) then raise exception 'Catégorie invalide.'; end if;
    end loop;
  end if;
  if (select count(*) from community_modes where owner = uid and created_at > now_ - interval '1 day') >= 5 then raise exception 'Cinq modes publiés par jour au plus.'; end if;
  if (select count(*) from community_modes where owner = uid) >= 20 then raise exception 'Vingt modes publiés au plus.'; end if;
  insert into community_modes (owner, name, description, variant, goal, created_at) values (uid, n, left(btrim(coalesce(mdesc, '')), 100), coalesce(mvariant, ''), mgoal, now_)
    on conflict (owner, name) do update set description = excluded.description, variant = excluded.variant, goal = excluded.goal
    returning id into mid;
  return mid;
end $$;

create or replace function public.mode_delete(m bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from community_modes where id = m and (owner = auth.uid() or is_moderator(auth.uid()));
  if not found then raise exception 'Ce mode n''est pas à toi.'; end if;
end $$;

create or replace function public.mode_report(m bigint) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if not is_account(uid) then raise exception 'Un compte est nécessaire pour signaler.'; end if;
  if exists (select 1 from community_modes where id = m and owner = uid) then raise exception 'C''est ton propre mode.'; end if;
  insert into mode_reports (mode_id, player) values (m, uid) on conflict do nothing;
  select count(*) into n from mode_reports where mode_id = m;
  update community_modes set reports = n, hidden = hidden or n >= 3 where id = m;
end $$;

create or replace function public.mode_played(m bigint) returns void
language sql security definer set search_path = public as $$ update community_modes set plays = plays + 1 where id = m and auth.uid() is not null $$;

create or replace function public.modes_list(mine boolean default false, lim int default 30, off int default 0)
returns table (id bigint, owner uuid, owner_name text, name text, description text, variant text, goal jsonb, plays int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.owner, p.name, m.name, m.description, m.variant, m.goal, m.plays, m.created_at
  from community_modes m join players p on p.id = m.owner
  where case when mine then m.owner = auth.uid() else not m.hidden end
  order by m.plays desc, m.created_at desc
  limit least(greatest(coalesce(lim, 30), 1), 100) offset greatest(coalesce(off, 0), 0);
$$;

-- ---- Droits ---------------------------------------------------------------------------------------------------------------------------
revoke execute on function public.comment_add(uuid, text), public.comment_delete(bigint), public.comment_report(bigint), public.playlist_save(bigint, text, boolean, uuid[]),
  public.playlist_delete(bigint), public.pick_track(uuid, boolean), public.mod_hide(text, text, boolean), public.mode_publish(text, text, text, jsonb),
  public.mode_delete(bigint), public.mode_report(bigint), public.mode_played(bigint) from public, anon;
grant execute on function public.comment_add(uuid, text), public.comment_delete(bigint), public.comment_report(bigint), public.playlist_save(bigint, text, boolean, uuid[]),
  public.playlist_delete(bigint), public.pick_track(uuid, boolean), public.mod_hide(text, text, boolean), public.mode_publish(text, text, text, jsonb),
  public.mode_delete(bigint), public.mode_report(bigint), public.mode_played(bigint) to authenticated;
grant execute on function public.track_comments_list(uuid, int, int), public.playlists_list(boolean, int, int), public.random_track(uuid[]),
  public.recommended_tracks(int), public.track_stats(text, int), public.modes_list(boolean, int, int), public.is_moderator(uuid), public.is_account(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
