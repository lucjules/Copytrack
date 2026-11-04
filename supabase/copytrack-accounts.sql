-- Copytrack: comptes et sauvegardes cloud
-- À exécuter dans Supabase > SQL Editor après la migration de la communauté.
-- Les mots de passe restent gérés par Supabase Auth; aucune table ne les stocke.

create table if not exists public.copytrack_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  username_normalized text generated always as (lower(trim(username))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copytrack_username_length check (char_length(trim(username)) between 3 and 20),
  constraint copytrack_username_chars check (trim(username) ~ '^[A-Za-z0-9_]+$'),
  constraint copytrack_username_unique unique (username_normalized)
);

create table if not exists public.copytrack_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint copytrack_save_object check (jsonb_typeof(save_data) = 'object')
);

alter table public.copytrack_profiles enable row level security;
alter table public.copytrack_saves enable row level security;

drop policy if exists "profile_select_own" on public.copytrack_profiles;
create policy "profile_select_own" on public.copytrack_profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "profile_insert_own" on public.copytrack_profiles;
create policy "profile_insert_own" on public.copytrack_profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "profile_update_own" on public.copytrack_profiles;
create policy "profile_update_own" on public.copytrack_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "save_select_own" on public.copytrack_saves;
create policy "save_select_own" on public.copytrack_saves
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "save_insert_own" on public.copytrack_saves;
create policy "save_insert_own" on public.copytrack_saves
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "save_update_own" on public.copytrack_saves;
create policy "save_update_own" on public.copytrack_saves
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.copytrack_profiles to authenticated;
grant select, insert, update on public.copytrack_saves to authenticated;
