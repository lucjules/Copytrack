-- =====================================================================================
-- Copytrack : étape 15 (backend, phase 2) — à lancer une fois dans Supabase > SQL Editor, APRÈS les étapes 1 à 14.
-- Peut être relancé sans danger (idempotente). AUCUNE suppression de données : on ajoute des tables, des fonctions et des droits plus stricts.
-- Retour arrière : supabase/etape15-retour.sql. Ordre de mise en ligne et dépendances : supabase/MIGRATIONS.md.
--
-- COMPATIBLE avec la fonction serveur déjà déployée (étape 14) : cette étape peut être lancée AVANT de redéployer submit-score.
--
--  1. Limitation de cadence réellement globale, persistante et atomique (rate_check) : un verrou par type de limite rend exacts le compte du pilote
--     ET le compte global, quelles que soient les instances de la fonction serveur. submit_rate_check (étape 14) devient une enveloppe de rate_check.
--     Une réserve pour les comptes : les sessions anonymes (gratuites) se partagent un sous-plafond, elles ne peuvent pas bloquer les autres.
--  2. Plafond de 2 000 temps par pilote : verrouillé (deux insertions simultanées ne le dépassent plus) et ne bloque plus l'amélioration d'un temps
--     existant (un « upsert » déclenchait le plafond avant de se résoudre en mise à jour).
--  3. submit_best : écriture ATOMIQUE du meilleur temps. Un temps moins bon (ou d'une physique plus ancienne) ne remplace jamais un meilleur record,
--     même avec deux soumissions simultanées. Elle lie aussi le circuit d'un joueur (u-…) à une empreinte forte (SHA-256) : la signature du jeu n'a que
--     32 bits, on pouvait fabriquer un AUTRE circuit de même clé et poster un temps sur le classement d'un circuit existant.
--  4. Circuits publiés : plus d'insertion libre de created_at / picked_at / plays… (droits par colonne), et un temps auteur VÉRIFIÉ : publish_track
--     (appelée par la fonction serveur après rejeu de la course de l'auteur) est la seule voie qui pose author_verified.
--  5. Profils : correctif de l'étape 14 (l'upsert du jeu exige update sur id ET name ; sans cela, un nouveau joueur ne pouvait pas créer son profil).
-- =====================================================================================

-- ---------------------------------------------------------------------------- 1. Limitation de cadence
create table if not exists public.rate_hits (
  kind text not null check (kind ~ '^[a-z0-9_]{1,20}$'),
  player uuid not null,
  anon boolean not null default false,
  at timestamptz not null default clock_timestamp()
);
create index if not exists rate_hits_player on public.rate_hits (kind, player, at);
create index if not exists rate_hits_at on public.rate_hits (kind, at);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from public, anon, authenticated;

-- Renvoie 0 si la requête est acceptée (et la compte), sinon le nombre de secondes à attendre.
--   k           type de limite ('submit', 'ice', …) ; p le pilote ; max_hits par fenêtre de window_s secondes
--   global_max  plafond TOUS pilotes confondus (0 = aucun) ; is_anon + anon_max : sous-plafond des sessions anonymes (0 = aucun)
-- Un verrou transactionnel par type sérialise les appels : pas de dépassement possible entre deux requêtes simultanées, d'où qu'elles viennent.
create or replace function public.rate_check(k text, p uuid, max_hits int, window_s int, global_max int default 0, is_anon boolean default false, anon_max int default 0) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare recent int; oldest timestamptz; w interval; t0 timestamptz;
begin
  if k is null or k !~ '^[a-z0-9_]{1,20}$' or p is null or max_hits < 1 or window_s < 1 then raise exception 'Paramètres invalides'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rate:' || k, 0));
  w := make_interval(secs => window_s);
  t0 := clock_timestamp();
  delete from rate_hits where kind = k and at < t0 - w;                 -- ménage de ce type (toute la table, pas seulement ce pilote)
  select count(*), min(at) into recent, oldest from rate_hits where kind = k and player = p;
  if recent >= max_hits then return greatest(1, ceil(extract(epoch from (oldest + w - t0)))::int); end if;
  if global_max > 0 then
    select count(*), min(at) into recent, oldest from rate_hits where kind = k;
    if recent >= global_max then return greatest(1, ceil(extract(epoch from (oldest + w - t0)))::int); end if;
  end if;
  if is_anon and anon_max > 0 then
    select count(*), min(at) into recent, oldest from rate_hits where kind = k and anon;
    if recent >= anon_max then return greatest(1, ceil(extract(epoch from (oldest + w - t0)))::int); end if;
  end if;
  insert into rate_hits (kind, player, anon, at) values (k, p, coalesce(is_anon, false), t0);
  return 0;
end $$;
revoke all on function public.rate_check(text, uuid, int, int, int, boolean, int) from public, anon, authenticated;
grant execute on function public.rate_check(text, uuid, int, int, int, boolean, int) to service_role;

-- Enveloppe de compatibilité : la fonction serveur de l'étape 14 appelle submit_rate_check(p, max_hits, window_s, global_max).
drop function if exists public.submit_rate_check(uuid, int, int, int);
create or replace function public.submit_rate_check(p uuid, max_hits int, window_s int, global_max int default 0) returns int
language sql security definer set search_path = public, pg_temp as $$
  select public.rate_check('submit', p, max_hits, window_s, global_max, false, 0);
$$;
revoke all on function public.submit_rate_check(uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.submit_rate_check(uuid, int, int, int) to service_role;

-- Ménage manuel (rate_check nettoie déjà son type à chaque appel) : lignes de plus d'une heure.
create or replace function public.rate_purge() returns int
language sql security definer set search_path = public, pg_temp as $$
  with d as (delete from rate_hits where at < clock_timestamp() - interval '1 hour' returning 1) select count(*)::int from d;
$$;
revoke all on function public.rate_purge() from public, anon, authenticated;
grant execute on function public.rate_purge() to service_role;

-- ---------------------------------------------------------------------------- 2. Plafond de 2 000 temps par pilote
create or replace function public.scores_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Un verrou par pilote : deux insertions simultanées passent l'une après l'autre (la seconde recompte après la validation de la première).
  perform pg_advisory_xact_lock(hashtextextended('scores:' || new.player::text, 0));
  -- Améliorer un temps EXISTANT n'ajoute pas de ligne : jamais bloqué par le plafond (un upsert déclenche ce déclencheur avant de se résoudre en mise à jour).
  if exists (select 1 from scores where track_key = new.track_key and player = new.player) then return new; end if;
  if (select count(*) from scores where player = new.player) >= 2000 then
    raise exception 'Trop de temps enregistrés pour ce pilote.';
  end if;
  return new;
end $$;
drop trigger if exists scores_limit on public.scores;
create trigger scores_limit before insert on public.scores
  for each row execute function public.scores_limit();

-- ---------------------------------------------------------------------------- 3. Meilleur temps atomique + empreinte forte des circuits de joueurs
create table if not exists public.track_binds (
  track_key text primary key check (char_length(track_key) <= 80),
  strong text not null check (char_length(strong) between 16 and 128),
  first_player uuid,
  created_at timestamptz not null default now()
);
alter table public.track_binds enable row level security;
revoke all on public.track_binds from public, anon, authenticated;

-- Range une course DÉJÀ VÉRIFIÉE par la fonction serveur (rejeu) et renvoie { status, improved, best, rank, total }.
--   status 'ok' ; 'collision' : la clé u-… est déjà liée à un autre circuit (empreinte forte différente) ; rien n'est écrit.
-- Meilleur record = temps plus court, à physique égale ; une physique plus récente remplace toujours ; une plus ancienne ne remplace jamais.
-- Le record porte TOUJOURS le fantôme et les temps intermédiaires de la course retenue (jamais ceux d'une course plus lente).
create or replace function public.submit_best(p uuid, tk text, t double precision, inp text, pv int, tname text,
  sp jsonb default null, gh text default null, gveh jsonb default null, strong text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare cur record; sarr int[]; bound text; imp boolean := false; best double precision; before_n bigint; total_n bigint;
begin
  if p is null or tk is null or char_length(tk) > 80 or t is null or t <= 0 or t >= 3600 or pv is null then raise exception 'Paramètres invalides'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scores:' || p::text, 0));        -- une soumission à la fois par pilote (verrou partagé avec scores_limit)
  if strong is not null then
    insert into track_binds (track_key, strong, first_player) values (tk, strong, p) on conflict (track_key) do nothing;
    select b.strong into bound from track_binds b where b.track_key = tk;
    if bound is distinct from strong then return jsonb_build_object('status', 'collision'); end if;
  end if;
  if sp is not null and jsonb_typeof(sp) = 'array' and jsonb_array_length(sp) <= 400 then
    select coalesce(array_agg(x::int order by ord), '{}') into sarr from jsonb_array_elements_text(sp) with ordinality as e(x, ord);
  end if;
  select s.time, s.phys_ver into cur from scores s where s.track_key = tk and s.player = p;
  if not found then
    insert into scores (track_key, player, time, inputs, phys_ver, track_name, updated_at, splits, ghost, ghost_veh)
      values (tk, p, t, inp, pv, left(coalesce(tname, ''), 60), now(), sarr, gh, gveh);
    imp := true; best := t;
  elsif pv > cur.phys_ver or (pv = cur.phys_ver and t < cur.time) then
    update scores set time = t, inputs = inp, phys_ver = pv, track_name = left(coalesce(tname, ''), 60), updated_at = now(),
      splits = sarr, ghost = gh, ghost_veh = gveh
      where track_key = tk and player = p;
    imp := true; best := t;
  else
    best := cur.time;
    -- Même course renvoyée (même physique, même temps) : elle complète le fantôme et les temps intermédiaires qui manquaient (records d'avant les étapes 7 et 9).
    if pv = cur.phys_ver and abs(t - cur.time) < 1e-6 then
      update scores set ghost = coalesce(ghost, gh), ghost_veh = case when ghost is null then gveh else ghost_veh end, splits = coalesce(splits, sarr)
        where track_key = tk and player = p and (ghost is null or splits is null);
    end if;
  end if;
  select count(*) filter (where time < best), count(*) into before_n, total_n from scores where track_key = tk and phys_ver = pv;
  return jsonb_build_object('status', 'ok', 'improved', imp, 'best', best, 'rank', before_n + 1, 'total', total_n);
end $$;
revoke all on function public.submit_best(uuid, text, double precision, text, int, text, jsonb, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_best(uuid, text, double precision, text, int, text, jsonb, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------- 4. Circuits publiés : droits par colonne, temps auteur vérifié
alter table public.tracks add column if not exists author_verified boolean not null default false;
-- Le jeu n'écrit que le contenu du circuit : plus de created_at (limite de 10 publications par heure contournée en antidatant), picked_at (« Sélection »
-- réservée aux modérateurs), id, plays, likes, reports, hidden, author_verified. (L'ancien client reste compatible : il n'envoie que ces colonnes.)
revoke insert on public.tracks from authenticated;
grant insert (name, decor, code, signature, author_time, pieces, laps, description) on public.tracks to authenticated;
-- Défense en profondeur : aucune modification directe de la table par le jeu (author_time, author_verified, signature, code…). Jusqu'ici seule l'ABSENCE de
-- politique RLS « update » l'empêchait ; un droit accordé par erreur (ou par les droits par défaut de Supabase) ne doit pas suffire à ouvrir la porte.
-- Les modifications légitimes passent par des fonctions : update_track_meta (nom, description), toggle_like, report_track, track_played, publish_track.
revoke update, truncate, references, trigger on public.tracks from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.scores from anon, authenticated;     -- (les temps ne s'écrivent que par submit_best, via la fonction serveur)
revoke all on public.track_binds, public.rate_hits from anon, authenticated;

-- Publication VÉRIFIÉE : appelée par la fonction serveur (clé de service) après avoir rejoué la course de l'auteur sur ce code. author_time est donc le
-- temps REJOUÉ par le serveur, jamais une affirmation du client. Un même circuit (même signature) republié par SON auteur est mis à jour (c'est ainsi
-- qu'un circuit publié avant l'étape 15, au temps non vérifié, peut le devenir) ; par un autre pilote, il est refusé.
create or replace function public.publish_track(p uuid, nm text, dc text, cd text, sg text, atime double precision, pc int, lp int, ds text default '', strong text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ex record; nid uuid; bound text;
begin
  -- Les valeurs sont celles que la fonction serveur a RECALCULÉES après rejeu ; on les revérifie quand même (défense en profondeur, mêmes bornes que la table).
  if p is null or atime is null or atime <= 0 or atime >= 3600 or nm is null or char_length(nm) not between 1 and 40 or dc is null or char_length(dc) > 20
     or cd is null or char_length(cd) > 100000 or sg is null or char_length(sg) not between 1 and 40 or pc is null or pc not between 2 and 5000
     or lp is null or lp not between 1 and 9 or char_length(coalesce(ds, '')) > 200 then
    raise exception 'Paramètres invalides';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tracks:' || p::text, 0));
  -- Deux pilotes qui publient EN MÊME TEMPS la même signature : le second attend le premier (sinon la contrainte d'unicité le ferait échouer en erreur 500
  -- au lieu de « signature déjà prise »).
  perform pg_advisory_xact_lock(hashtextextended('tracksig:' || sg, 0));
  -- Empreinte forte du circuit liée à sa clé de classement (voir submit_best) : un autre circuit de même signature 32 bits est refusé.
  if strong is not null then
    insert into track_binds (track_key, strong, first_player) values ('u-' || sg, strong, p) on conflict (track_key) do nothing;
    select b.strong into bound from track_binds b where b.track_key = 'u-' || sg;
    if bound is distinct from strong then return jsonb_build_object('status', 'collision'); end if;
  end if;
  select id, author into ex from tracks where signature = sg;
  if found then
    if ex.author <> p then return jsonb_build_object('status', 'taken'); end if;
    update tracks set name = nm, decor = dc, code = cd, author_time = atime, pieces = pc, laps = lp, description = coalesce(ds, ''), author_verified = true where id = ex.id;
    return jsonb_build_object('status', 'updated', 'id', ex.id);
  end if;
  insert into tracks (author, name, decor, code, signature, author_time, pieces, laps, description, author_verified)
    values (p, nm, dc, cd, sg, atime, pc, lp, coalesce(ds, ''), true) returning id into nid;
  return jsonb_build_object('status', 'created', 'id', nid);
end $$;
drop function if exists public.publish_track(uuid, text, text, text, text, double precision, int, int, text);
revoke all on function public.publish_track(uuid, text, text, text, text, double precision, int, int, text, text) from public, anon, authenticated;
grant execute on function public.publish_track(uuid, text, text, text, text, double precision, int, int, text, text) to service_role;

-- ---------------------------------------------------------------------------- 5. Profils : l'« upsert » du jeu (défaut de l'étape 14)
-- Le jeu crée et renomme son profil par POST /rest/v1/players avec « Prefer: resolution=merge-duplicates », que PostgREST traduit en
--   INSERT … ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name.
-- PostgreSQL exige le droit UPDATE sur CHAQUE colonne du SET, même quand aucune ligne n'est en conflit. L'étape 14 n'accordait que update (name) : tout NOUVEAU
-- profil recevait « 403 permission denied for table players » (l'insertion simple passait, l'upsert du jeu non) et ne pouvait donc rien enregistrer. Constaté sur la
-- production par un essai de bout en bout (les profils existants dataient d'avant l'étape 14). Aucun risque ajouté : la politique « Modifier son profil » impose
-- id = auth.uid() avant ET après la mise à jour (using + with check) : on ne peut écrire que SA ligne, sous SON identifiant ; created_at et title restent fermés.
grant update (id, name) on public.players to authenticated;

notify pgrst, 'reload schema';
