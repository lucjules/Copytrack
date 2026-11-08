-- =====================================================================================
-- Copytrack : étape 10 (amis et abonnements) — à lancer une fois dans Supabase > SQL Editor, après les étapes 1 à 9.
-- Peut être relancé sans danger. Copytrack Evolution, E15.
--
--  - AMIS : une demande, acceptée ou refusée par l'autre. Seuls les COMPTES (pas les sessions invitées, qui changent d'identifiant si le navigateur
--    est vidé) peuvent avoir des amis. Une demande n'est visible que des deux intéressés. Au plus 20 demandes envoyées par 24 h, 200 amis et demandes.
--    friends_board : le classement d'un circuit limité à moi et mes amis.
--  - ABONNEMENTS : suivre un auteur de la communauté (ses circuits). La liste de mes abonnements n'est visible que de moi ; le nombre d'abonnés
--    d'un auteur est public (follower_count). Au plus 500 abonnements.
-- Aucune écriture directe dans les tables : tout passe par les fonctions ci-dessous (security definer), qui vérifient qui appelle.
-- =====================================================================================

create table if not exists public.friends (
  a uuid not null references public.players (id) on delete cascade,      -- celui qui a demandé
  b uuid not null references public.players (id) on delete cascade,      -- celui qui a reçu la demande
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (a, b),
  check (a <> b)
);
create unique index if not exists friends_pair on public.friends (least(a, b), greatest(a, b));
create index if not exists friends_b on public.friends (b);
alter table public.friends enable row level security;
drop policy if exists "Amis visibles des deux intéressés" on public.friends;
create policy "Amis visibles des deux intéressés" on public.friends for select using (auth.uid() = a or auth.uid() = b);
revoke all on public.friends from anon, authenticated;
grant select on public.friends to authenticated;

create table if not exists public.follows (
  follower uuid not null references auth.users (id) on delete cascade,
  author uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, author),
  check (follower <> author)
);
create index if not exists follows_author on public.follows (author);
alter table public.follows enable row level security;
drop policy if exists "Mes abonnements" on public.follows;
create policy "Mes abonnements" on public.follows for select using (auth.uid() = follower);
revoke all on public.follows from anon, authenticated;
grant select on public.follows to authenticated;

-- ---- Amis ---------------------------------------------------------------------------------------------------------------------------
-- Demande d'ami par pseudo (celui d'un compte). Renvoie 'sent', 'accepted' (l'autre m'avait déjà demandé : c'est accepté) ou 'already'.
create or replace function public.friend_request(target_name text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); target uuid;
begin
  if uid is null or not exists (select 1 from accounts where user_id = uid) then raise exception 'Un compte est nécessaire pour avoir des amis.'; end if;
  select p.id into target from players p join accounts acc on acc.user_id = p.id where lower(p.name) = lower(trim(target_name)) limit 1;
  if target is null then raise exception 'Aucun compte ne porte ce pseudo.'; end if;
  if target = uid then raise exception 'C''est ton propre pseudo.'; end if;
  if exists (select 1 from friends where a = target and b = uid and status = 'pending') then
    update friends set status = 'accepted', accepted_at = now() where a = target and b = uid;
    return 'accepted';
  end if;
  if exists (select 1 from friends where least(a, b) = least(uid, target) and greatest(a, b) = greatest(uid, target)) then return 'already'; end if;
  if (select count(*) from friends where a = uid and created_at > now() - interval '24 hours') >= 20 then raise exception 'Trop de demandes d''amis aujourd''hui : réessaie demain.'; end if;
  if (select count(*) from friends where a = uid or b = uid) >= 200 then raise exception 'Liste d''amis pleine (200).'; end if;
  insert into friends (a, b) values (uid, target);
  return 'sent';
end $$;

-- Réponse à une demande reçue : acceptée, ou supprimée (refus : l'autre n'en est pas averti, il peut redemander plus tard).
create or replace function public.friend_respond(other uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if accept then update friends set status = 'accepted', accepted_at = now() where a = other and b = uid and status = 'pending';
  else delete from friends where a = other and b = uid and status = 'pending'; end if;
end $$;

-- Retirer un ami (ou annuler une demande envoyée).
create or replace function public.friend_remove(other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  delete from friends where (a = uid and b = other) or (a = other and b = uid);
end $$;

-- Mes amis et demandes : l'autre, son pseudo, l'état, et si la demande m'est adressée (à moi de répondre).
create or replace function public.my_friends()
returns table (id uuid, name text, status text, incoming boolean, since timestamptz)
language sql stable security definer set search_path = public as $$
  select case when f.a = auth.uid() then f.b else f.a end, p.name, f.status, (f.b = auth.uid() and f.status = 'pending'), coalesce(f.accepted_at, f.created_at)
  from friends f join players p on p.id = case when f.a = auth.uid() then f.b else f.a end
  where auth.uid() in (f.a, f.b)
  order by f.status desc, p.name;
$$;

-- Classement d'un circuit entre amis (moi compris).
create or replace function public.friends_board(k text, pv int, lim int default 20)
returns table (rank bigint, player uuid, name text, "time" double precision, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with circle as (
    select auth.uid() as id
    union select case when f.a = auth.uid() then f.b else f.a end from friends f where f.status = 'accepted' and auth.uid() in (f.a, f.b)
  )
  select row_number() over (order by s.time, s.updated_at), s.player, p.name, s.time::double precision, s.updated_at
  from scores s join circle c on c.id = s.player join players p on p.id = s.player
  where s.track_key = k and s.phys_ver = pv and auth.uid() is not null
  order by s.time, s.updated_at
  limit greatest(1, least(coalesce(lim, 20), 200));
$$;

-- ---- Abonnements --------------------------------------------------------------------------------------------------------------------
create or replace function public.follow(author_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if author_id = uid then raise exception 'On ne se suit pas soi-même.'; end if;
  if not exists (select 1 from players where id = author_id) then raise exception 'Auteur inconnu.'; end if;
  if (select count(*) from follows where follower = uid) >= 500 then raise exception 'Trop d''abonnements (500).'; end if;
  insert into follows (follower, author) values (uid, author_id) on conflict do nothing;
end $$;

create or replace function public.unfollow(author_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  delete from follows where follower = auth.uid() and author = author_id;
end $$;

create or replace function public.follower_count(author_id uuid) returns int
language sql stable security definer set search_path = public as $$ select count(*)::int from follows where author = author_id $$;

revoke execute on function public.friend_request(text), public.friend_respond(uuid, boolean), public.friend_remove(uuid), public.my_friends(), public.friends_board(text, int, int), public.follow(uuid), public.unfollow(uuid) from public, anon;
grant execute on function public.friend_request(text), public.friend_respond(uuid, boolean), public.friend_remove(uuid), public.my_friends(), public.friends_board(text, int, int), public.follow(uuid), public.unfollow(uuid) to authenticated;
grant execute on function public.follower_count(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
