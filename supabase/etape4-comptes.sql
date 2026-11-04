-- =====================================================================================
-- Copytrack : étape 4 (comptes et sauvegarde cloud entre appareils)
-- À coller dans Supabase > SQL Editor > New query, puis « Run » (après les étapes 1 à 3).
-- Peut être relancé sans danger.
--
-- Mots de passe : ils ne sont PAS stockés ici. Supabase Auth (GoTrue) les garde dans
-- auth.users.encrypted_password sous forme de hachage bcrypt avec sel (un sel aléatoire par mot de passe,
-- coût 10). Ni le jeu, ni ces tables, ni la fonction serveur ne voient jamais un mot de passe en clair
-- autrement qu'en transit HTTPS vers Supabase Auth. Réécrire un système de hachage maison serait moins sûr.
--
-- Ce script ajoute :
--   accounts      pseudo unique (sans tenir compte de la casse) lié au compte, créé AUTOMATIQUEMENT à l'inscription ;
--   cloud_saves   la sauvegarde du compte (progression, circuits créés, records), privée à son propriétaire ;
--   un verrou de pseudo : un invité ne peut pas prendre le pseudo d'un compte (classements, circuits) ;
--   username_available(n) et delete_account() appelées par le jeu.
-- Les adresses « pseudo@accounts.copytrack.invalid » sont techniques : aucun e-mail n'est envoyé ni collecté.
-- =====================================================================================

-- ---------- Comptes ------------------------------------------------------------------
create table if not exists public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  username_lower text generated always as (lower(username)) stored,
  created_at timestamptz not null default now(),
  constraint accounts_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint accounts_username_not_default check (lower(username) not in ('player', 'pilote')),
  constraint accounts_username_unique unique (username_lower)
);
alter table public.accounts enable row level security;
drop policy if exists "Voir son compte" on public.accounts;
create policy "Voir son compte" on public.accounts for select to authenticated using (user_id = auth.uid());
-- Aucune règle d'écriture : la ligne est créée par le déclencheur ci-dessous, jamais par le jeu.

-- Création du compte à l'inscription : le pseudo vient des métadonnées de l'inscription, et DOIT être celui de
-- l'adresse technique (impossible de s'inscrire avec une adresse et de réserver un autre pseudo).
create or replace function public.handle_new_account() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := new.raw_user_meta_data ->> 'username';
begin
  if coalesce(new.is_anonymous, false) or uname is null then return new; end if;   -- invités : pas de compte
  if split_part(lower(coalesce(new.email, '')), '@', 2) <> 'accounts.copytrack.invalid'
     or lower(uname) <> split_part(lower(new.email), '@', 1) then
    raise exception 'Inscription invalide';
  end if;
  insert into public.accounts (user_id, username) values (new.id, uname);
  return new;
end $$;
drop trigger if exists on_auth_user_created_account on auth.users;
create trigger on_auth_user_created_account after insert on auth.users
  for each row execute function public.handle_new_account();

-- ---------- Sauvegarde cloud ---------------------------------------------------------------
create table if not exists public.cloud_saves (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  rev integer not null default 1,                  -- numéro de version : le jeu n'écrase jamais une version qu'il n'a pas lue
  updated_at timestamptz not null default now(),
  constraint cloud_saves_object check (jsonb_typeof(data) = 'object'),
  constraint cloud_saves_size check (pg_column_size(data) <= 8000000)
);
alter table public.cloud_saves enable row level security;
drop policy if exists "Lire sa sauvegarde" on public.cloud_saves;
create policy "Lire sa sauvegarde" on public.cloud_saves for select to authenticated using (user_id = auth.uid());
drop policy if exists "Créer sa sauvegarde" on public.cloud_saves;
create policy "Créer sa sauvegarde" on public.cloud_saves for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.accounts a where a.user_id = auth.uid()));
drop policy if exists "Modifier sa sauvegarde" on public.cloud_saves;
create policy "Modifier sa sauvegarde" on public.cloud_saves for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.cloud_saves_touch() returns trigger
language plpgsql as $$
begin
  new.user_id := old.user_id;
  new.rev := old.rev + 1;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists cloud_saves_touch on public.cloud_saves;
create trigger cloud_saves_touch before update on public.cloud_saves
  for each row execute function public.cloud_saves_touch();

-- ---------- Pseudos : réservés aux comptes, jamais « Player » / « Pilote » -----------------------------
create or replace function public.players_reserve_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.accounts a where a.username_lower = lower(new.name) and a.user_id <> new.id) then
    raise exception 'Ce pseudo appartient à un compte.';
  end if;
  return new;
end $$;
drop trigger if exists players_reserve_name on public.players;
create trigger players_reserve_name before insert or update of name on public.players
  for each row execute function public.players_reserve_name();

-- Les noms par défaut sont refusés pour toute nouvelle inscription ou modification (les anciens restent).
alter table public.players drop constraint if exists players_name_not_default;
alter table public.players add constraint players_name_not_default check (lower(name) not in ('player', 'pilote')) not valid;

-- ---------- Fonctions appelées par le jeu ---------------------------------------------------------
create or replace function public.username_available(n text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.accounts where username_lower = lower(trim(n)))
     and lower(trim(n)) not in ('player', 'pilote');
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- Suppression définitive de SON compte : ses circuits, scores, j'aime et sauvegarde partent avec (cascade).
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if not exists (select 1 from public.accounts where user_id = uid) then raise exception 'Ce n''est pas un compte'; end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

grant select on public.accounts to authenticated;
grant select, insert, update on public.cloud_saves to authenticated;

notify pgrst, 'reload schema';
