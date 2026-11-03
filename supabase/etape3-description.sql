-- Copytrack bêta 0.9 — étape 3 : description des circuits, et modification du nom /
-- de la description après publication (seulement par l'auteur).
-- À lancer une fois dans Supabase : SQL Editor › New query › coller › Run.
-- Sans danger si on le relance.

alter table public.tracks add column if not exists description text not null default '';
alter table public.tracks drop constraint if exists tracks_description_len;
alter table public.tracks add constraint tracks_description_len check (char_length(description) <= 200);

-- Modifier le nom et la description de SON circuit (le code et les temps ne changent pas :
-- les classements utilisent une signature qui ignore le nom et la description).
create or replace function public.update_track_meta(t uuid, n text, d text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nn text := trim(coalesce(n, '')); dd text := trim(coalesce(d, ''));
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if char_length(nn) < 1 or char_length(nn) > 40 then raise exception 'Nom invalide (1 à 40 caractères)'; end if;
  if char_length(dd) > 200 then raise exception 'Description trop longue (200 caractères au plus)'; end if;
  update tracks set name = nn, description = dd where id = t and author = uid;
  if not found then raise exception 'Circuit introuvable, ou ce n''est pas le tien'; end if;
end $$;

revoke all on function public.update_track_meta(uuid, text, text) from public, anon;
grant execute on function public.update_track_meta(uuid, text, text) to authenticated;

-- Recharge le schéma de l'API pour qu'elle voie la nouvelle colonne tout de suite.
notify pgrst, 'reload schema';
