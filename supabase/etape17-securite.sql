-- =====================================================================================
-- Copytrack : étape 17 (sécurité, phase 5) — à lancer une fois dans Supabase > SQL Editor, APRÈS les étapes 1 à 15 (16 recommandée, 15b indifférente).
-- Peut être relancée sans danger (idempotente). AUCUNE suppression de données : on corrige des fonctions, on ajoute une table et des plafonds.
-- Compatible avec le jeu et la fonction serveur actuels (aucun changement de signature). Retour arrière : voir « Retour arrière » à la fin.
--
-- Chaque point ci-dessous a été CONFIRMÉ par une attaque réelle sur une base reproduisant Supabase (rôles anon / authenticated, droits par défaut, RLS active) ;
-- tools/test-securite-sql.sh les rejoue avant / après.
--
--  1. report_track : (a) un signalement RÉTABLISSAIT un circuit masqué par la modération (`hidden = (n >= 3)` écrasait la valeur) : l'auteur d'un circuit masqué
--     le signalait lui-même et le rendait visible ; (b) on pouvait signaler son PROPRE circuit ; (c) trois sessions invitées (gratuites, profil de plus de 24 h)
--     suffisaient à masquer le circuit de n'importe qui : seuls les COMPTES comptent désormais (comme pour les commentaires et les modes, étape 13). Un signalement
--     d'invité reste enregistré (la modération le voit dans `reports`), il ne masque plus seul. Un circuit masqué ne se rétablit plus que par un modérateur.
--  2. mode_played : un simple « select mode_played(1) » en boucle gonflait sans limite le compteur de parties, qui sert à CLASSER les modes publiés (n'importe qui
--     se hissait en tête). Une partie par pilote, par mode et par heure (comme track_played, étape 5).
--  3. is_moderator / is_account : lisibles par anon avec un identifiant quelconque (les identifiants des pilotes sont publics : scores.player) : on pouvait
--     lister les modérateurs. Plus appelables par le jeu (il ne les appelle jamais) ; les fonctions du serveur qui s'en servent s'exécutent avec les droits de
--     leur propriétaire et continuent de marcher.
--  4. log_runs (ouverte à anon, sans aucune session) : le plafond de 3 000 lignes par MINUTE laissait écrire 4 millions de lignes par jour avec des
--     identifiants d'installation inventés. Plafonds horaire (20 000) et quotidien (100 000) ajoutés ; le jeu, lui, en écrit quelques lignes par course.
--  5. Circuits publiés : au plus 100 par auteur (jusqu'ici seule la cadence de 10 par heure bornait : 240 circuits de 100 Ko par jour et par session gratuite).
--  6. Fantômes : budget de 40 Mo de fantômes par pilote (jusqu'ici 2 000 records × jusqu'à 800 Ko). Le record est TOUJOURS enregistré ; seul son fantôme est
--     omis au-delà du budget (un joueur normal en a 5 Mo). Les fantômes déjà en base ne sont pas touchés.
--  7. random_track : la liste « à éviter » est bornée (200) : une liste de millions d'identifiants coûtait un balayage par circuit.
--  8. settle_due, close_due_seasons, in_tournament : plus appelables sans session (le jeu ne les appelle qu'avec la sienne, invité ou compte).
--  9. Compteurs exacts sous concurrence : huit pilotes simultanés laissaient tracks.likes à 7 (8 lignes) et tracks.reports à 6 (8 lignes) ; un verrou par objet.
-- =====================================================================================

-- ---------------------------------------------------------------------------- 1. Signalements de circuits
create or replace function public.report_track(t uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int; old_enough boolean; tr_author uuid;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  perform pg_advisory_xact_lock(hashtextextended('treport:' || t::text, 0));      -- signalements simultanés d'un même circuit : l'un après l'autre (voir 9)
  select author into tr_author from tracks where id = t;
  if not found then raise exception 'Circuit introuvable.'; end if;
  if tr_author = uid then raise exception 'C''est ton propre circuit.'; end if;
  select coalesce(created_at < now() - interval '24 hours', false) into old_enough from players where id = uid;
  -- Seuls les comptes de plus de 24 h comptent pour masquer ; le signalement d'un invité est enregistré (counts = false) sans masquer.
  insert into track_reports (track_id, player, counts) values (t, uid, coalesce(old_enough, false) and is_account(uid)) on conflict do nothing;
  select count(*) into n from track_reports where track_id = t and counts;
  -- JAMAIS de rétablissement ici (`hidden or …`) : « hidden » posé par la modération (mod_hide) ou par trois signalements ne se défait que par mod_hide.
  update tracks set reports = (select count(*) from track_reports where track_id = t), hidden = hidden or n >= 3 where id = t;
end $$;
revoke all on function public.report_track(uuid) from public, anon;
grant execute on function public.report_track(uuid) to authenticated;

-- ---------------------------------------------------------------------------- 2. Parties d'un mode publié : une par pilote et par heure
create table if not exists public.mode_plays (
  mode_id bigint not null references public.community_modes (id) on delete cascade,
  player uuid not null references auth.users (id) on delete cascade,
  last_at timestamptz not null default now(),
  primary key (mode_id, player)
);
alter table public.mode_plays enable row level security;
revoke all on public.mode_plays from public, anon, authenticated;

create or replace function public.mode_played(m bigint) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); done boolean;
begin
  if uid is null or not exists (select 1 from community_modes where id = m) then return; end if;
  insert into mode_plays (mode_id, player) values (m, uid)
    on conflict (mode_id, player) do update set last_at = now() where mode_plays.last_at < now() - interval '1 hour'
    returning true into done;
  if done then update community_modes set plays = plays + 1 where id = m; end if;
end $$;
revoke all on function public.mode_played(bigint) from public, anon;
grant execute on function public.mode_played(bigint) to authenticated;

-- ---------------------------------------------------------------------------- 3. Qui est modérateur / compte : plus interrogeable par le jeu
revoke all on function public.is_moderator(uuid) from public, anon, authenticated;
revoke all on function public.is_account(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------- 4. log_runs : plafonds global horaire et quotidien
create index if not exists run_stats_created on public.run_stats (created_at);
create or replace function public.log_runs(events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  e jsonb; n int := 0; inst text; recent int;
begin
  if events is null or jsonb_typeof(events) <> 'array' or jsonb_array_length(events) > 50 then
    raise exception 'Lot invalide';
  end if;
  -- Verrou unique : sans lui, deux lots simultanés lisent le même compte AVANT que l'autre ait validé et dépassent tous deux les plafonds (global ET par installation).
  -- Transaction courte (au plus 50 lignes), verrou relâché à la fin de l'appel : les lots légitimes passent simplement l'un après l'autre.
  perform pg_advisory_xact_lock(hashtextextended('log_runs', 0));
  -- Plafonds TOUS appelants confondus (le jeu est anonyme : l'identifiant d'installation est choisi par l'appelant). Au-delà : le lot est ignoré, sans erreur.
  if (select count(*) from run_stats where created_at > now() - interval '1 minute') >= 3000 then return 0; end if;
  if (select count(*) from run_stats where created_at > now() - interval '1 hour') >= 20000 then return 0; end if;
  if (select count(*) from run_stats where created_at > now() - interval '1 day') >= 100000 then return 0; end if;
  for e in select * from jsonb_array_elements(events) loop
    begin
      inst := e->>'install';
      if inst is null or inst !~ '^[0-9a-f]{16}$' then continue; end if;
      select count(*) into recent from run_stats where install = inst and created_at > now() - interval '1 hour';
      if recent >= 300 then exit; end if;
      insert into run_stats (install, track, outcome, time, progress, respawns, attempt, phys_ver, medal)
      values (
        inst, e->>'track', e->>'outcome', (e->>'time')::real, (e->>'progress')::real,
        coalesce((e->>'respawns')::int, 0), coalesce((e->>'attempt')::int, 1), (e->>'pv')::int, e->>'medal'
      );
      n := n + 1;
    exception when others then
      null;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.log_runs(jsonb) from public;
grant execute on function public.log_runs(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------- 5. Circuits publiés : 100 par auteur au plus
create or replace function public.tracks_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Un verrou par auteur (le même que publish_track, réentrant dans une même transaction) : des publications simultanées se comptent l'une après l'autre.
  perform pg_advisory_xact_lock(hashtextextended('tracks:' || new.author::text, 0));
  if (select count(*) from tracks where author = new.author and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de publications : réessaie dans une heure.';
  end if;
  if (select count(*) from tracks where author = new.author) >= 100 then
    raise exception 'Trop de circuits publiés (100 au plus) : retire-en avant d''en publier un autre.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------- 6. Records : budget de fantômes par pilote
-- Identique à submit_best de l'étape 15, plus un budget : la somme des fantômes déjà rangés par ce pilote (hors la ligne qu'on écrit) plus celui-ci ne dépasse pas
-- 40 000 000 caractères ; sinon le record est écrit SANS fantôme (ni véhicules). Le temps, les temps intermédiaires et les commandes sont toujours enregistrés.
create or replace function public.submit_best(p uuid, tk text, t double precision, inp text, pv int, tname text,
  sp jsonb default null, gh text default null, gveh jsonb default null, strong text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare cur record; sarr int[]; bound text; imp boolean := false; best double precision; before_n bigint; total_n bigint; used bigint;
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
  if gh is not null then
    select coalesce(sum(char_length(s.ghost)), 0) into used from scores s where s.player = p and s.track_key <> tk;
    if used + char_length(gh) > 40000000 then gh := null; gveh := null; end if;
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

-- ---------------------------------------------------------------------------- 7. random_track : liste « à éviter » bornée
create or replace function public.random_track(avoid uuid[] default '{}') returns uuid
language sql volatile security definer set search_path = public as $$
  select t.id from tracks t
  where not t.hidden and t.author is distinct from auth.uid() and not (t.id = any ((coalesce(avoid, '{}'))[1:200]))
  order by (exists (select 1 from track_plays p where p.track_id = t.id and p.player = auth.uid())), random()
  limit 1;
$$;

-- ---------------------------------------------------------------------------- 9. Compteurs EXACTS sous concurrence
-- Constat (huit pilotes simultanés sur un même circuit, six essais) : « j'aime » et signalements comptaient en lisant les lignes AVANT que les transactions voisines
-- soient validées, puis écrasaient le compteur : tracks.likes = 7 pour 8 lignes, tracks.reports = 6 pour 8 lignes, et le seuil de masquage (3 signalements) pouvait
-- être manqué. Un verrou par circuit (ou commentaire, ou mode) fait passer les écritures l'une après l'autre : chaque comptage voit les précédentes.
create or replace function public.toggle_like(t uuid) returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tlike:' || t::text, 0));
  if exists (select 1 from track_likes where track_id = t and player = uid) then
    delete from track_likes where track_id = t and player = uid;
  else
    insert into track_likes (track_id, player) values (t, uid);
  end if;
  select count(*) into n from track_likes where track_id = t;
  update tracks set likes = n where id = t;
  return n;
end $$;
revoke all on function public.toggle_like(uuid) from public, anon;
grant execute on function public.toggle_like(uuid) to authenticated;

create or replace function public.comment_report(c bigint) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if not is_account(uid) then raise exception 'Un compte est nécessaire pour signaler.'; end if;
  if exists (select 1 from track_comments where id = c and author = uid) then raise exception 'C''est ton propre commentaire.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('creport:' || c::text, 0));
  insert into comment_reports (comment_id, player) values (c, uid) on conflict do nothing;
  select count(*) into n from comment_reports where comment_id = c;
  update track_comments set reports = n, hidden = hidden or n >= 3 where id = c;
end $$;
revoke all on function public.comment_report(bigint) from public, anon;
grant execute on function public.comment_report(bigint) to authenticated;

create or replace function public.mode_report(m bigint) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if not is_account(uid) then raise exception 'Un compte est nécessaire pour signaler.'; end if;
  if exists (select 1 from community_modes where id = m and owner = uid) then raise exception 'C''est ton propre mode.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mreport:' || m::text, 0));
  insert into mode_reports (mode_id, player) values (m, uid) on conflict do nothing;
  select count(*) into n from mode_reports where mode_id = m;
  update community_modes set reports = n, hidden = hidden or n >= 3 where id = m;
end $$;
revoke all on function public.mode_report(bigint) from public, anon;
grant execute on function public.mode_report(bigint) to authenticated;

-- ---------------------------------------------------------------------------- 8. Fonctions de règlement : plus sans session
-- settle_due (duels et tournois échus) et close_due_seasons (saisons finies) ne dépendent que de l'heure : les relancer est sans effet, mais elles n'ont pas à être
-- ouvertes à un appelant sans session (le jeu ne les appelle qu'avec sa session, invité ou compte). in_tournament ne sert qu'aux règles de lecture de authenticated.
revoke all on function public.settle_due() from public, anon;
grant execute on function public.settle_due() to authenticated;
revoke all on function public.close_due_seasons() from public, anon;
grant execute on function public.close_due_seasons() to authenticated;
revoke all on function public.in_tournament(bigint) from public, anon;
grant execute on function public.in_tournament(bigint) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================================
-- Retour arrière (aucune donnée n'est touchée par cette étape ; `mode_plays` reste, vide de sens) : relancer, dans l'ordre, les fichiers qui définissaient
-- ces objets avant : etape1-communaute.sql (tracks_rate_limit, toggle_like), etape5-securite.sql (report_track), etape13-communaute.sql (mode_played, is_moderator, is_account,
-- random_track, comment_report, mode_report), etape12-competition.sql (settle_due, in_tournament), etape11-saisons.sql (close_due_seasons), etape14-securite.sql (log_runs), etape15-backend.sql (submit_best). Ils sont tous relançables.
-- ATTENTION : relancer l'un de ces fichiers APRÈS cette étape annule la correction correspondante : relancer alors l'étape 17.
-- =====================================================================================
