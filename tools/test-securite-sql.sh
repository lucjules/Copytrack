#!/usr/bin/env bash
# Tests de SÉCURITÉ de la base (phase 5) sur un PostgreSQL local qui reproduit Supabase : rôles anon / authenticated / service_role, DROITS PAR DÉFAUT de Supabase
# (tout objet créé dans public est accordé à ces rôles : les autres tests SQL ne le reproduisaient pas), sécurité au niveau des lignes, et les étapes 1 à 17.
#   PGHOST=/tmp PGPORT=54329 PGUSER=postgres tools/test-securite-sql.sh          (npm run test:sql ; il faut un serveur PostgreSQL, pas inclus dans npm test)
#   AVANT=1 tools/test-securite-sql.sh     rejoue les mêmes attaques SANS l'étape 17 : les contrôles « FAILLE » doivent alors ÉCHOUER (preuve que le test voit les
#                                          failles) et tous les autres réussir.
# On ne vérifie pas seulement que les opérations normales marchent : chaque attaque (lire, écrire, supprimer chez un autre, appeler une fonction réservée) doit être REFUSÉE
# ou sans effet, et un témoin positif prouve que le même geste marche pour le propriétaire. Base jetable (copytrack_sqlsec), créée et supprimée ici.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=copytrack_sqlsec
P="psql -v ON_ERROR_STOP=1 -q -X"
TMP="$(mktemp -d)"
if [ -n "${GARDER:-}" ]; then trap 'rm -rf "$TMP"' EXIT; else trap 'rm -rf "$TMP"; psql -q -X -d postgres -c "drop database if exists '"$DB"'" >/dev/null 2>&1 || true' EXIT; fi          # GARDER=1 : conserve la base pour l'examiner
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"

cat > "$TMP/stub.sql" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false, encrypted_password text);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Droits par défaut d'un projet Supabase : tout objet créé dans public par postgres est accordé à anon, authenticated et service_role.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
SQL
$P -d $DB -f "$TMP/stub.sql"
for n in 1-communaute 2-classements 3-description 4-comptes 5-securite 6-telemetrie 7-fantomes 8-decouverte 9-secteurs 10-social 11-saisons 12-competition 13-communaute 14-securite 15-backend; do
  $P -d $DB -f supabase/etape$n.sql >/dev/null; $P -d $DB -f supabase/etape$n.sql >/dev/null          # relançable
done
$P -d $DB -f supabase/etape15b-publication-verifiee.sql >/dev/null
$P -d $DB -f supabase/etape16-durcissement.sql >/dev/null
if [ -z "${AVANT:-}" ]; then $P -d $DB -f supabase/etape17-securite.sql >/dev/null; $P -d $DB -f supabase/etape17-securite.sql >/dev/null; fi          # relançable

# verify-prod.sql (lecture seule) sur la base COMPLÈTE (étapes 1 à 17), avant tout objet d'essai : aucune ligne MANQUE ni ÉCART (ses lignes « étape 17 », « étape 16 » et « RLS partout »).
VP="$($P -d $DB -At -F'|' -f supabase/verify-prod.sql)"
if [ -z "${AVANT:-}" ]; then
  if echo "$VP" | grep -qE '\|(MANQUE|ÉCART)$'; then echo "  FAIL verify-prod.sql sur la base complète : lignes MANQUE / ÉCART :"; echo "$VP" | grep -E '\|(MANQUE|ÉCART)$'; VPFAIL=1; else VPFAIL=0; fi
  [ "$(echo "$VP" | grep -c 'étape 17')" -ge 9 ] || { echo "  FAIL verify-prod.sql ne contient pas les lignes de l'étape 17"; VPFAIL=1; }
else VPFAIL=0; fi

cat > "$TMP/attaques.sql" <<'SQL'
\set ON_ERROR_STOP off
create function public.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); end $$;
grant execute on function public.as_user(uuid) to public;
create table public.res (n serial, name text, ok boolean);
grant all on public.res to public;
create function public.chk(name text, c boolean) returns void language plpgsql security definer as $$ begin insert into public.res (name, ok) values (name, coalesce(c, false)); end $$;
grant execute on function public.chk(text, boolean) to public;
-- Nombre de lignes touchées / renvoyées par une requête, -1 si elle a été REFUSÉE (erreur : droit, règle, exception de fonction). Exécutée avec les droits de l'appelant.
create function public.rows_of(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $$;
grant execute on function public.rows_of(text) to public;
-- Refusée ou sans effet.
create function public.denied(q text) returns boolean language sql as $$ select public.rows_of(q) <= 0 $$;
grant execute on function public.denied(text) to public;

-- ---------------------------------------------------------------- Données (en superutilisateur)
-- alice : compte et modératrice ; bob : compte ; carl, dave, erin, fred, gina : invités (session anonyme = rôle authenticated)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a11c', 'alice@accounts.copytrack.invalid', '{"username":"alice"}'),
  ('00000000-0000-0000-0000-0000000000b0', 'bob@accounts.copytrack.invalid', '{"username":"bob"}');
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000c1', true), ('00000000-0000-0000-0000-0000000000c2', true), ('00000000-0000-0000-0000-0000000000c3', true),
  ('00000000-0000-0000-0000-0000000000c4', true), ('00000000-0000-0000-0000-0000000000c5', true);
insert into public.players (id, name, created_at) values
  ('00000000-0000-0000-0000-00000000a11c', 'alice', now() - interval '3 days'), ('00000000-0000-0000-0000-0000000000b0', 'bob', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000c1', 'carl', now() - interval '3 days'), ('00000000-0000-0000-0000-0000000000c2', 'dave', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000c3', 'erin', now() - interval '3 days'), ('00000000-0000-0000-0000-0000000000c4', 'fred', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000000c5', 'gina', now() - interval '3 hours');
insert into public.moderators values ('00000000-0000-0000-0000-00000000a11c');
insert into public.cloud_saves (user_id, data) values ('00000000-0000-0000-0000-00000000a11c', '{"secret":"alice"}'), ('00000000-0000-0000-0000-0000000000b0', '{"secret":"bob"}');
insert into public.tracks (id, author, name, decor, code, signature, author_time, pieces, description) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000a11c', 'Piste d''Alice', 'x', 'code', 'sigA', 30, 5, 'desc'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000b0', 'Piste de Bob', 'x', 'code', 'sigB', 30, 5, 'desc');
insert into public.tracks (id, author, name, decor, code, signature, author_time, pieces, hidden) values
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000c1', 'Piste masquée par la modération', 'x', 'code', 'sigH', 30, 5, true);
insert into public.track_comments (id, track_id, author, body) overriding system value values (1, '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000a11c', 'bravo');
insert into public.playlists (id, owner, name, public, tracks) overriding system value values (1, '00000000-0000-0000-0000-00000000a11c', 'Privée d''Alice', false, '{00000000-0000-0000-0000-00000000f001}');
insert into public.community_modes (id, owner, name, variant) overriding system value values (1, '00000000-0000-0000-0000-00000000a11c', 'Mode d''Alice', 'v1.g-2'), (2, '00000000-0000-0000-0000-0000000000b0', 'Mode de Bob', 'v1.g-2');
insert into public.friends (a, b, status) values ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000000c2', 'pending');
insert into public.follows (follower, author) values ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000000b0');
insert into public.duels (id, challenger, opponent, track_key, status, ends_at) overriding system value values (1, '00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000000c2', 'b-test-1', 'pending', now() + interval '1 day');
insert into public.tournaments (id, owner, name, track_key, code, ends_at) overriding system value values (1, '00000000-0000-0000-0000-00000000a11c', 'Tournoi privé d''Alice', 'b-test-1', 'ABCDEF', now() + interval '2 days');
insert into public.tournament_players (tournament, player) values (1, '00000000-0000-0000-0000-00000000a11c');
insert into public.scores (track_key, player, time, inputs, phys_ver, ghost) values ('b-test-1', '00000000-0000-0000-0000-00000000a11c', 41.5, 'SECRET-INPUTS', 35, 'GHOSTDATA');
insert into public.track_likes (track_id, player) values ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000a11c');
insert into public.run_stats (install, track, outcome, time, phys_ver) values ('0123456789abcdef', 'eclats', 'finish', 60, 35);

-- ================================================================ A. Inventaire des droits (catalogue)
select public.chk('A1 la sécurité au niveau des lignes (RLS) est active sur TOUTES les tables de public', not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'res' and not c.relrowsecurity));
select public.chk('A2 anon : aucune écriture sur aucune table, ni par colonne', not exists (select 1 from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'res'
  and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete') or has_column_privilege('anon', c.oid, a.attnum, 'insert') or has_column_privilege('anon', c.oid, a.attnum, 'update'))));
select public.chk('A3 authenticated : écritures directes limitées à la liste attendue (players id/name, cloud_saves, tracks supprimer ses circuits)', (
  select coalesce(string_agg(c.relname || ':' || p, ',' order by c.relname, p), '') from pg_class c cross join unnest(array['insert', 'update', 'delete', 'truncate']) p
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'res' and has_table_privilege('authenticated', c.oid, p)) = 'cloud_saves:insert,cloud_saves:update,tracks:delete');
select public.chk('A4 authenticated : écritures par colonne limitées à players(id, name)', (
  select coalesce(string_agg(c.relname || '.' || a.attname || ':' || p, ',' order by c.relname, a.attname, p), '') from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped cross join unnest(array['insert', 'update']) p
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'res' and not has_table_privilege('authenticated', c.oid, p) and has_column_privilege('authenticated', c.oid, a.attnum, p)) = 'players.id:insert,players.id:update,players.name:insert,players.name:update');
select public.chk('A5 aucun truncate / references / trigger pour anon ni authenticated', not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'res'
  and (has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('anon', c.oid, 'trigger') or has_table_privilege('authenticated', c.oid, 'truncate') or has_table_privilege('authenticated', c.oid, 'references') or has_table_privilege('authenticated', c.oid, 'trigger'))));
select public.chk('A6 colonnes sensibles illisibles : scores.inputs et scores.ghost (anon et authenticated), players.created_at reste lisible', not has_column_privilege('anon', 'public.scores', 'inputs', 'select') and not has_column_privilege('authenticated', 'public.scores', 'inputs', 'select')
  and not has_column_privilege('anon', 'public.scores', 'ghost', 'select') and not has_column_privilege('authenticated', 'public.scores', 'ghost', 'select'));
select public.chk('A7 tables internes illisibles de anon et authenticated : rate_hits, submit_rate, track_binds, run_stats, moderators, comment_reports, mode_reports, track_reports, track_plays, mode_plays', not exists (
  select 1 from unnest(array['rate_hits', 'submit_rate', 'track_binds', 'run_stats', 'moderators', 'comment_reports', 'mode_reports', 'track_reports', 'track_plays', 'mode_plays']) t
  where has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('authenticated', 'public.' || t, 'select')));
select public.chk('A8 fonctions RÉSERVÉES au serveur (clé de service) : refusées à anon et authenticated', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('submit_best', 'publish_track', 'rate_check', 'rate_purge', 'submit_rate_check', 'submit_rate_purge', 'competition_open', 'best_time', 'settle_duel', 'close_season', 'close_tournament', 'is_moderator', 'is_account')
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))));
select public.chk('A9 fonctions appelables SANS session (anon) : seulement la liste attendue (lectures publiques, inscription, statistiques)', (
  select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('as_user', 'chk', 'rows_of', 'denied'))
  = 'current_season,elo,follower_count,get_ghost,log_runs,modes_list,my_season,playlists_list,random_track,recommended_tracks,season_bounds,season_clock,season_points,season_standings,sector_board,track_comments_list,track_stats,trending_tracks,username_available');
select public.chk('A10 toute fonction « security definer » fixe son search_path (pas de détournement par un schéma de l''appelant)', not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.proname not in ('as_user', 'chk')
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')));
select public.chk('A11 aucune fonction de public n''est exécutable par PUBLIC si elle écrit pour le serveur seulement', not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('submit_best', 'publish_track', 'rate_check', 'competition_open')
  and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')));

-- ================================================================ B. Un joueur contre les données d'un autre (bob attaque alice)
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.chk('B0 témoin : bob lit SA sauvegarde cloud', public.rows_of($$select 1 from cloud_saves where user_id = '00000000-0000-0000-0000-0000000000b0'$$) = 1);
select public.chk('B1 la sauvegarde cloud d''alice est illisible pour bob (même en la demandant par son identifiant)', public.rows_of($$select 1 from cloud_saves where user_id = '00000000-0000-0000-0000-00000000a11c'$$) = 0);
select public.chk('B2 bob ne lit que SA ligne cloud_saves (tout lire ne renvoie pas celle d''alice)', public.rows_of($$select 1 from cloud_saves$$) = 1);
select public.chk('B3 bob ne peut pas créer / modifier / supprimer la sauvegarde d''alice', public.denied($$insert into cloud_saves (user_id, data) values ('00000000-0000-0000-0000-00000000a11c', '{"pirate":1}')$$)
  and public.denied($$update cloud_saves set data = '{"pirate":1}' where user_id = '00000000-0000-0000-0000-00000000a11c'$$) and public.denied($$delete from cloud_saves where user_id = '00000000-0000-0000-0000-00000000a11c'$$));
select public.rows_of($$update cloud_saves set user_id = '00000000-0000-0000-0000-00000000a11c' where user_id = '00000000-0000-0000-0000-0000000000b0'$$);
select public.rows_of($$update cloud_saves set data = '{"secret":"bob2"}' where user_id = '00000000-0000-0000-0000-0000000000b0'$$);
reset role;
select public.chk('B4 bob ne peut pas se faire passer pour alice en changeant l''identifiant de SA sauvegarde : rien ne change chez alice, la ligne de bob garde son propriétaire (déclencheur cloud_saves_touch)', (select data ->> 'secret' from cloud_saves where user_id = '00000000-0000-0000-0000-00000000a11c') = 'alice'
  and (select count(*) from cloud_saves) = 2 and (select data ->> 'secret' from cloud_saves where user_id = '00000000-0000-0000-0000-0000000000b0') = 'bob2');
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.chk('B5 comptes : bob ne voit que le sien, ne peut rien écrire', public.rows_of($$select 1 from accounts$$) = 1 and public.denied($$update accounts set username = 'pirate'$$)
  and public.denied($$insert into accounts (user_id, username) values (gen_random_uuid(), 'faux')$$) and public.denied($$delete from accounts$$));
select public.chk('B6 profils : bob ne peut ni renommer, ni supprimer, ni usurper alice (insertion sous son identifiant)', public.denied($$update players set name = 'pirate' where id = '00000000-0000-0000-0000-00000000a11c'$$)
  and public.denied($$delete from players where id = '00000000-0000-0000-0000-00000000a11c'$$) and public.denied($$insert into players (id, name) values ('00000000-0000-0000-0000-00000000a11c', 'pirate')$$));
select public.chk('B7 profil : bob ne peut pas changer sa date de création ni son titre directement', public.denied($$update players set created_at = now() - interval '9 years' where id = '00000000-0000-0000-0000-0000000000b0'$$) and public.denied($$update players set title = 'legende' where id = '00000000-0000-0000-0000-0000000000b0'$$));
select public.chk('B8 circuits : bob ne peut ni modifier ni supprimer celui d''alice, ni en publier sous son nom ni directement', public.denied($$update tracks set author_time = 1 where id = '00000000-0000-0000-0000-00000000f001'$$)
  and public.denied($$delete from tracks where id = '00000000-0000-0000-0000-00000000f001'$$) and public.denied($$insert into tracks (author, name, decor, code, signature, author_time, pieces) values ('00000000-0000-0000-0000-00000000a11c', 'faux', 'x', 'c', 'sigX', 1, 5)$$)
  and public.denied($$insert into tracks (name, decor, code, signature, author_time, pieces) values ('directe', 'x', 'c', 'sigY', 1, 5)$$));
select public.chk('B9 circuit masqué par la modération : invisible pour bob', public.rows_of($$select 1 from tracks where id = '00000000-0000-0000-0000-00000000f003'$$) = 0);
select public.chk('B10 j''aime : ceux d''alice sont invisibles, aucune écriture directe', public.rows_of($$select 1 from track_likes where player = '00000000-0000-0000-0000-00000000a11c'$$) = 0 and public.denied($$insert into track_likes (track_id, player) values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000a11c')$$)
  and public.denied($$delete from track_likes$$));
select public.chk('B11 records : aucune écriture directe, jamais de lecture des commandes ni du fantôme', public.denied($$insert into scores (track_key, player, time, inputs, phys_ver) values ('b-test-2', '00000000-0000-0000-0000-0000000000b0', 1, 'x', 35)$$)
  and public.denied($$update scores set time = 1 where player = '00000000-0000-0000-0000-00000000a11c'$$) and public.denied($$delete from scores where player = '00000000-0000-0000-0000-00000000a11c'$$)
  and public.rows_of($$select inputs from scores$$) = -1 and public.rows_of($$select ghost from scores$$) = -1 and public.rows_of($$select time, player from scores$$) = 1);
select public.chk('B12 amis, abonnements, duels, tournois d''alice : invisibles pour bob', public.rows_of($$select 1 from friends$$) = 0 and public.rows_of($$select 1 from follows$$) = 0 and public.rows_of($$select 1 from duels$$) = 0
  and public.rows_of($$select 1 from tournaments$$) = 0 and public.rows_of($$select 1 from tournament_players$$) = 0 and public.rows_of($$select 1 from playlists where not public$$) = 0);
select public.chk('B13 tables internes : bob ne lit ni n''écrit rate_hits, submit_rate, track_binds, run_stats, moderators, reports, plays', public.rows_of($$select 1 from rate_hits$$) = -1 and public.rows_of($$select 1 from track_binds$$) = -1 and public.rows_of($$select 1 from run_stats$$) = -1
  and public.rows_of($$select 1 from moderators$$) = -1 and public.rows_of($$select 1 from track_reports$$) = -1 and public.rows_of($$select 1 from track_plays$$) = -1 and public.denied($$insert into moderators values ('00000000-0000-0000-0000-0000000000b0')$$)
  and public.denied($$insert into run_stats (install, track, outcome, time, phys_ver) values ('0123456789abcdef', 'eclats', 'finish', 60, 35)$$));
select public.chk('B14 fonctions sur les ressources d''autrui : modifier le circuit, supprimer le commentaire, la playlist ou le mode d''alice — refusé', public.rows_of($$select public.update_track_meta('00000000-0000-0000-0000-00000000f001', 'pirate', 'x')$$) = -1
  and public.rows_of($$select public.comment_delete(1)$$) = -1 and public.rows_of($$select public.playlist_delete(1)$$) = -1 and public.rows_of($$select public.mode_delete(1)$$) = -1
  and public.rows_of($$select public.playlist_save(1, 'pirate', true, '{}')$$) = -1);
select public.chk('B15 témoin : bob modifie SON circuit et supprime SON mode (le même geste marche pour le propriétaire)', public.rows_of($$select public.update_track_meta('00000000-0000-0000-0000-00000000f002', 'Renommée', 'ok')$$) = 1 and public.rows_of($$select public.mode_delete(2)$$) = 1);
select public.chk('B16 modération : bob ne peut ni masquer, ni sélectionner, ni rétablir', public.rows_of($$select public.mod_hide('track', '00000000-0000-0000-0000-00000000f001', true)$$) = -1 and public.rows_of($$select public.pick_track('00000000-0000-0000-0000-00000000f001', true)$$) = -1
  and public.rows_of($$select public.mod_hide('track', '00000000-0000-0000-0000-00000000f003', false)$$) = -1);
select public.chk('B17 amis / duels / tournois : bob ne peut pas répondre à la demande ni au duel d''autrui, ni lire un tournoi dont il n''est pas membre (sans erreur, sans effet, sans rien voir)', public.rows_of($$select public.friend_respond('00000000-0000-0000-0000-00000000a11c', true)$$) = 1
  and public.rows_of($$select public.duel_respond(1, true)$$) = 1 and public.rows_of($$select 1 from public.tournament_board(1)$$) = 0 and public.rows_of($$select 1 from public.my_duels()$$) = 0 and public.rows_of($$select 1 from public.my_friends()$$) = 0 and public.rows_of($$select 1 from public.my_tournaments()$$) = 0);
reset role;
select public.chk('B18 …et ces gestes n''ont RIEN changé chez alice (demande d''ami en attente, duel en attente, aucun titre volé)', (select status from friends where a = '00000000-0000-0000-0000-00000000a11c') = 'pending'
  and (select status from duels where id = 1) = 'pending' and (select count(*) from track_comments where id = 1) = 1 and (select count(*) from playlists where id = 1) = 1 and (select count(*) from community_modes where id = 1) = 1
  and (select name from tracks where id = '00000000-0000-0000-0000-00000000f001') = 'Piste d''Alice' and (select name from players where id = '00000000-0000-0000-0000-00000000a11c') = 'alice');
-- Fonctions réservées au serveur, appelées par un joueur connecté (bob) ET sans session (anon) : toutes refusées.
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.chk('B19 bob ne peut appeler AUCUNE fonction réservée au serveur (enregistrer un temps, publier, limiter, règle de compétition…)', public.rows_of($$select public.submit_best('00000000-0000-0000-0000-0000000000b0', 'b-test-1', 1, 'x', 35, 'x')$$) = -1
  and public.rows_of($$select public.publish_track('00000000-0000-0000-0000-0000000000b0', 'x', 'x', 'c', 'sigZ', 10, 5, 1)$$) = -1 and public.rows_of($$select public.rate_check('submit', '00000000-0000-0000-0000-0000000000b0', 1, 1)$$) = -1
  and public.rows_of($$select public.competition_open('duel', 1, '00000000-0000-0000-0000-0000000000b0', 'b-test-1')$$) = -1 and public.rows_of($$select public.best_time('b-test-1', '00000000-0000-0000-0000-00000000a11c')$$) = -1
  and public.rows_of($$select public.settle_duel(1)$$) = -1 and public.rows_of($$select public.close_season(1)$$) = -1 and public.rows_of($$select public.close_tournament(1)$$) = -1 and public.rows_of($$select public.rate_purge()$$) = -1);
reset role;
set role anon; select public.as_user(null);
select public.chk('B20 sans session (anon) : aucune fonction réservée au serveur', public.rows_of($$select public.submit_best('00000000-0000-0000-0000-0000000000b0', 'b-test-1', 1, 'x', 35, 'x')$$) = -1 and public.rows_of($$select public.publish_track('00000000-0000-0000-0000-0000000000b0', 'x', 'x', 'c', 'sigZ', 10, 5, 1)$$) = -1
  and public.rows_of($$select public.rate_check('submit', '00000000-0000-0000-0000-0000000000b0', 1, 1)$$) = -1);
select public.chk('B21 sans session (anon) : aucune fonction de joueur (j''aime, commentaire, ami, duel, tournoi, mode, playlist, titre, suppression de compte, signalement)', public.rows_of($$select public.toggle_like('00000000-0000-0000-0000-00000000f002')$$) = -1
  and public.rows_of($$select public.comment_add('00000000-0000-0000-0000-00000000f002', 'spam')$$) = -1 and public.rows_of($$select public.friend_request('alice')$$) = -1 and public.rows_of($$select public.duel_challenge('00000000-0000-0000-0000-00000000a11c', 'b-x', '')$$) = -1
  and public.rows_of($$select public.tournament_join('ABCDEF')$$) = -1 and public.rows_of($$select public.mode_publish('x', '', '', null)$$) = -1 and public.rows_of($$select public.playlist_save(null, 'x', true, '{}')$$) = -1 and public.rows_of($$select public.set_title('legende')$$) = -1
  and public.rows_of($$select public.delete_account()$$) = -1 and public.rows_of($$select public.report_track('00000000-0000-0000-0000-00000000f002')$$) = -1 and public.rows_of($$select public.track_played('00000000-0000-0000-0000-00000000f002')$$) = -1
  and public.rows_of($$select public.follow('00000000-0000-0000-0000-00000000a11c')$$) = -1);
select public.chk('B22 sans session (anon) : aucune donnée privée (comptes, sauvegardes, j''aime, amis) et aucune écriture', public.rows_of($$select 1 from accounts$$) = -1 and public.rows_of($$select 1 from cloud_saves$$) = -1 and public.rows_of($$select 1 from track_likes$$) = -1 and public.rows_of($$select 1 from friends$$) = -1
  and public.denied($$insert into players (id, name) values (gen_random_uuid(), 'pirate')$$) and public.denied($$update players set name = 'pirate'$$) and public.denied($$delete from players$$) and public.denied($$delete from tracks$$)
  and public.denied($$insert into tracks (name, decor, code, signature, author_time, pieces) values ('x', 'x', 'c', 'sigW', 1, 5)$$) and public.denied($$update scores set time = 1$$) and public.denied($$delete from scores$$));
select public.chk('B23 sans session (anon) : la lecture publique marche (profils, circuits visibles, temps)', public.rows_of($$select 1 from players$$) >= 7 and public.rows_of($$select 1 from tracks$$) = 2 and public.rows_of($$select time from scores$$) = 1);
reset role;

-- ================================================================ C. Failles CONFIRMÉES (corrigées par l'étape 17)
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000c1');
select public.report_track('00000000-0000-0000-0000-00000000f003');      -- carl, auteur du circuit masqué par la modération, le signale lui-même
reset role;
select public.chk('FAILLE 1 : un signalement ne rétablit pas un circuit masqué par la modération', (select hidden from tracks where id = '00000000-0000-0000-0000-00000000f003'));
set role authenticated;
select public.as_user('00000000-0000-0000-0000-0000000000c2'); select public.report_track('00000000-0000-0000-0000-00000000f002');
select public.as_user('00000000-0000-0000-0000-0000000000c3'); select public.report_track('00000000-0000-0000-0000-00000000f002');
select public.as_user('00000000-0000-0000-0000-0000000000c4'); select public.report_track('00000000-0000-0000-0000-00000000f002');
reset role;
select public.chk('FAILLE 2 : trois sessions invitées ne masquent pas le circuit de quelqu''un', not (select hidden from tracks where id = '00000000-0000-0000-0000-00000000f002'));
select public.chk('FAILLE 2b : leurs signalements sont quand même enregistrés (la modération les voit)', (select reports from tracks where id = '00000000-0000-0000-0000-00000000f002') = 3);
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.chk('FAILLE 3 : on ne peut pas signaler son propre circuit', public.rows_of($$select public.report_track('00000000-0000-0000-0000-00000000f002')$$) = -1);
reset role;
-- … mais trois COMPTES de plus de 24 h masquent bien un circuit (le mécanisme de modération communautaire marche toujours)
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000e001', 'eve@accounts.copytrack.invalid', '{"username":"eve"}'), ('00000000-0000-0000-0000-00000000e002', 'fay@accounts.copytrack.invalid', '{"username":"fay"}'), ('00000000-0000-0000-0000-00000000e003', 'gus@accounts.copytrack.invalid', '{"username":"gus"}');
insert into players (id, name, created_at) values ('00000000-0000-0000-0000-00000000e001', 'eve', now() - interval '2 days'), ('00000000-0000-0000-0000-00000000e002', 'fay', now() - interval '2 days'), ('00000000-0000-0000-0000-00000000e003', 'gus', now() - interval '2 days');
set role authenticated;
select public.as_user('00000000-0000-0000-0000-00000000e001'); select public.report_track('00000000-0000-0000-0000-00000000f001');
select public.as_user('00000000-0000-0000-0000-00000000e002'); select public.report_track('00000000-0000-0000-0000-00000000f001');
select public.as_user('00000000-0000-0000-0000-00000000e003'); select public.report_track('00000000-0000-0000-0000-00000000f001');
reset role;
select public.chk('témoin : trois comptes (plus de 24 h) masquent bien un circuit signalé', (select hidden from tracks where id = '00000000-0000-0000-0000-00000000f001'));
select public.chk('témoin : un nouveau compte (moins de 24 h) ne compte pas', (select count(*) from track_reports where counts) = 3);
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.mode_played(1) from generate_series(1, 300);
reset role;
select public.chk('FAILLE 4 : 300 appels de mode_played d''un même pilote ne font qu''UNE partie (le compteur classe les modes)', (select plays from community_modes where id = 1) = 1);
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000c2');
select public.mode_played(1);
select public.mode_played(999999);          -- mode inexistant : sans erreur ni effet (comme avant)
reset role;
select public.chk('témoin : un AUTRE pilote compte une partie de plus ; un mode inexistant ne plante pas', (select plays from community_modes where id = 1) = 2);
set role anon; select public.as_user(null);
select public.chk('FAILLE 5 : sans session, on ne peut pas demander si un identifiant est modérateur ou compte', public.rows_of($$select public.is_moderator('00000000-0000-0000-0000-00000000a11c')$$) = -1 and public.rows_of($$select public.is_account('00000000-0000-0000-0000-00000000a11c')$$) = -1);
reset role;
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.chk('FAILLE 5b : un joueur connecté non plus (les identifiants de pilotes sont publics)', public.rows_of($$select public.is_moderator('00000000-0000-0000-0000-00000000a11c')$$) = -1);
reset role;
set role authenticated; select public.as_user('00000000-0000-0000-0000-00000000a11c');
select public.rows_of($$select public.mod_hide('track', '00000000-0000-0000-0000-00000000f003', false)$$) as m1 \gset
select public.rows_of($$select public.comment_delete(1)$$) as m2 \gset
select public.rows_of($$select 1 from public.track_comments_list('00000000-0000-0000-0000-00000000f002')$$) as m3 \gset
reset role;
select public.chk('témoin : la modératrice rétablit le circuit (mod_hide est la SEULE voie), et les fonctions de commentaire qui s''appuient sur is_moderator / is_account marchent toujours (droits du propriétaire)', :m1 = 1 and :m2 = 1 and :m3 >= 0
  and not (select hidden from tracks where id = '00000000-0000-0000-0000-00000000f003'));
set role anon; select public.as_user(null);
select public.chk('FAILLE 6 : settle_due, close_due_seasons, in_tournament refusés sans session', public.rows_of($$select public.settle_due()$$) = -1 and public.rows_of($$select public.close_due_seasons()$$) = -1 and public.rows_of($$select public.in_tournament(1)$$) = -1);
reset role;
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.chk('témoin : avec une session, ces fonctions marchent', public.rows_of($$select public.settle_due()$$) = 1 and public.rows_of($$select public.close_due_seasons()$$) = 1);
reset role;

-- ================================================================ D. Abus : volumes, plafonds, cohérence
-- D1. Statistiques anonymes (log_runs, sans session) : plafond horaire et quotidien tous appelants confondus.
insert into run_stats (install, track, outcome, time, phys_ver, created_at) select lpad(to_hex(g), 16, '0'), 'eclats', 'finish', 60, 35, now() - interval '30 minutes' from generate_series(1, 20000) g;
set role anon; select public.as_user(null);
select public.rows_of($$select public.log_runs('[{"install":"ffffffffffffffff","track":"eclats","outcome":"finish","time":61,"pv":35}]'::jsonb)$$) as r7 \gset
reset role;
select public.chk('FAILLE 7 : log_runs ignore les lots au-delà de 20 000 lignes par heure (tous appelants), sans erreur', :r7 = 1 and (select count(*) from run_stats where install = 'ffffffffffffffff') = 0);
select public.chk('FAILLE 7b : …et le lot refusé n''a rien écrit (aucune ligne en plus)', (select count(*) from run_stats) = 20001);
delete from run_stats where created_at > now() - interval '2 hours' and install <> '0123456789abcdef';
set role anon;
select public.chk('témoin : sous le plafond, log_runs écrit (lot valide : 2 lignes dont une invalide ignorée)', public.log_runs('[{"install":"aaaaaaaaaaaaaaaa","track":"eclats","outcome":"finish","time":61,"pv":35},{"install":"zzz","track":"x","outcome":"finish","time":61,"pv":35}]'::jsonb) = 1);
select public.chk('log_runs : un lot de plus de 50 lignes est refusé', public.rows_of($$select public.log_runs((select jsonb_agg('{"install":"aaaaaaaaaaaaaaaa"}'::jsonb) from generate_series(1, 51)))$$) = -1);
reset role;
-- D2. Circuits publiés : 100 par auteur.
insert into tracks (author, name, decor, code, signature, author_time, pieces, created_at) select '00000000-0000-0000-0000-0000000000c5', 'T' || g, 'x', 'c', 'cap' || g, 10, 5, now() - interval '5 hours' from generate_series(1, 100) g;
select public.chk('FAILLE 8 : le 101e circuit publié par un même pilote est refusé (même hors cadence horaire)', public.rows_of($$insert into tracks (author, name, decor, code, signature, author_time, pieces) values ('00000000-0000-0000-0000-0000000000c5', 'T101', 'x', 'c', 'cap101', 10, 5)$$) = -1);
select public.chk('FAILLE 8b : …et un autre pilote publie toujours (le plafond est PAR auteur)', public.rows_of($$insert into tracks (author, name, decor, code, signature, author_time, pieces) values ('00000000-0000-0000-0000-0000000000c4', 'Autre', 'x', 'c', 'autre1', 10, 5)$$) = 1);
-- D3. Fantômes : budget de 40 millions de caractères par pilote (50 fantômes de la taille maximale, 800 000, d'une colonne bornée à 800 000) ; le record est TOUJOURS enregistré.
insert into scores (track_key, player, time, inputs, phys_ver, ghost) select 'b-budget-' || g, '00000000-0000-0000-0000-0000000000c3', 60, 'in', 35, repeat('A', 800000) from generate_series(1, 50) g;
select (public.submit_best('00000000-0000-0000-0000-0000000000c3', 'b-budget-new', 55, 'in2', 35, 'B', null, repeat('B', 800000), '[{"v":1}]'::jsonb) ->> 'improved') as i9 \gset
select public.chk('FAILLE 9 : budget atteint (50 fantômes de 800 000) : le nouveau record est enregistré SANS fantôme (temps, rang et commandes conservés)', :'i9'::boolean
  and (select ghost is null and ghost_veh is null and time = 55 and inputs = 'in2' from scores where track_key = 'b-budget-new'));
select (public.submit_best('00000000-0000-0000-0000-0000000000c4', 'b-budget-new', 56, 'in', 35, 'B', null, repeat('B', 800000), '[]'::jsonb) ->> 'improved') as i9b \gset
select public.chk('FAILLE 9b : le budget est PAR pilote (un autre pilote enregistre son fantôme)', :'i9b'::boolean
  and (select char_length(ghost) from scores where track_key = 'b-budget-new' and player = '00000000-0000-0000-0000-0000000000c4') = 800000);
select (public.submit_best('00000000-0000-0000-0000-0000000000c3', 'b-budget-1', 59, 'in3', 35, 'B', null, repeat('C', 800000), '[]'::jsonb) ->> 'improved') as i9c \gset
select public.chk('FAILLE 9c : améliorer un record déjà doté d''un fantôme remplace son fantôme (il ne compte pas deux fois dans le budget)', :'i9c'::boolean
  and (select left(ghost, 1) = 'C' and time = 59 from scores where track_key = 'b-budget-1' and player = '00000000-0000-0000-0000-0000000000c3'));
select (public.submit_best('00000000-0000-0000-0000-0000000000c5', 'b-normal', 40, 'in', 35, 'B', null, repeat('D', 500000), '[]'::jsonb) ->> 'improved') as i9d \gset
select public.chk('témoin : sous le budget, un pilote normal enregistre son fantôme', :'i9d'::boolean and (select char_length(ghost) = 500000 from scores where track_key = 'b-normal'));
-- D4. random_track : liste « à éviter » démesurée.
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.chk('random_track : une liste « à éviter » démesurée est bornée (répond vite, sans erreur)', public.rows_of($$select public.random_track((select array_agg(gen_random_uuid()) from generate_series(1, 200000)))$$) = 1);
reset role;
-- D5. Limites déjà en place (non-régression) : comptes seulement, cadence des commentaires, suppression de compte.
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.chk('témoin : un compte (bob) commente', public.rows_of($$select public.comment_add('00000000-0000-0000-0000-00000000f002', 'un')$$) = 1);
select public.chk('limite : un second commentaire dans les 20 secondes est refusé', public.rows_of($$select public.comment_add('00000000-0000-0000-0000-00000000f002', 'deux')$$) = -1);
select public.as_user('00000000-0000-0000-0000-0000000000c2');
select public.chk('limite : une session invitée ne peut ni commenter, ni publier un mode, ni demander d''ami, ni supprimer de compte', public.rows_of($$select public.comment_add('00000000-0000-0000-0000-00000000f002', 'spam')$$) = -1 and public.rows_of($$select public.mode_publish('Mode invité', '', 'v1.g-2', null)$$) = -1
  and public.rows_of($$select public.friend_request('alice')$$) = -1 and public.rows_of($$select public.delete_account()$$) = -1);
reset role;
select public.chk('…et le compte de l''invité n''a pas été supprimé', (select count(*) from auth.users where id = '00000000-0000-0000-0000-0000000000c2') = 1);

-- ================================================================ E. Cohérence : suppression d'un compte (cascade) et lecture publique
select public.chk('get_ghost renvoie le fantôme du n° 1 (pas les commandes : seules les colonnes name, time, ghost, ghost_veh existent)', (select count(*) from public.get_ghost('b-test-1', 1, 35)) = 1 and pg_get_function_result('public.get_ghost(text,int,int)'::regprocedure) = 'TABLE(name text, "time" double precision, ghost text, ghost_veh jsonb)');
set role authenticated; select public.as_user('00000000-0000-0000-0000-0000000000b0');
select public.chk('E1 témoin : bob supprime SON compte (cascade : ses données partent, celles d''alice restent)', public.rows_of($$select public.delete_account()$$) = 1);
reset role;
select public.chk('E2 après suppression : plus de profil, de sauvegarde ni de circuit de bob ; alice intacte', not exists (select 1 from players where id = '00000000-0000-0000-0000-0000000000b0') and not exists (select 1 from cloud_saves where user_id = '00000000-0000-0000-0000-0000000000b0')
  and not exists (select 1 from tracks where author = '00000000-0000-0000-0000-0000000000b0') and exists (select 1 from cloud_saves where user_id = '00000000-0000-0000-0000-00000000a11c') and exists (select 1 from scores where player = '00000000-0000-0000-0000-00000000a11c'));
SQL
$P -d $DB -f "$TMP/attaques.sql" > /dev/null 2>"$TMP/err.txt" || true

# F. Concurrence : vraies sessions simultanées (psql en parallèle) sur les compteurs (j'aime, signalements, parties). Six manches de huit pilotes chacune : avant l'étape 17,
#    des mises à jour étaient PERDUES (likes = 7 pour 8 lignes, reports = 6 pour 8 lignes), de façon non déterministe : d'où plusieurs manches.
$P -d $DB <<'SQL'
insert into auth.users (id, email, raw_user_meta_data) select ('00000000-0000-0000-0000-0000000f' || lpad(g::text, 4, '0'))::uuid, 'usr' || g || '@accounts.copytrack.invalid', ('{"username":"usr' || g || '"}')::jsonb from generate_series(1, 8) g;
insert into players (id, name, created_at) select ('00000000-0000-0000-0000-0000000f' || lpad(g::text, 4, '0'))::uuid, 'usr' || g, now() - interval '3 days' from generate_series(1, 8) g;
insert into tracks (id, author, name, decor, code, signature, author_time, pieces) values ('00000000-0000-0000-0000-00000000f0f1', '00000000-0000-0000-0000-00000000a11c', 'Cible', 'x', 'c', 'sigcible', 30, 5);
insert into community_modes (id, owner, name, variant) overriding system value values (50, '00000000-0000-0000-0000-00000000a11c', 'Mode concurrent', 'v1.g-2');
SQL
BAD=0
for round in 1 2 3 4 5 6; do
  $P -d $DB -c "delete from track_likes where track_id = '00000000-0000-0000-0000-00000000f0f1'" -c "delete from track_reports where track_id = '00000000-0000-0000-0000-00000000f0f1'" -c "do \$\$ begin if to_regclass('public.mode_plays') is not null then delete from public.mode_plays; end if; end \$\$" \
    -c "update tracks set likes = 0, reports = 0, hidden = false where id = '00000000-0000-0000-0000-00000000f0f1'" -c "update community_modes set plays = 0 where id = 50" >/dev/null
  pids=""
  for g in 1 2 3 4 5 6 7 8; do
    id="00000000-0000-0000-0000-0000000f$(printf '%04d' $g)"
    ( $P -d $DB -c "set role authenticated" -c "select set_config('request.jwt.claim.sub', '$id', false)" -c "select public.toggle_like('00000000-0000-0000-0000-00000000f0f1')" -c "select public.report_track('00000000-0000-0000-0000-00000000f0f1')" -c "select public.mode_played(50) from generate_series(1, 5)" >/dev/null 2>&1 ) &
    pids="$pids $!"
  done
  # Le MÊME pilote en quatre sessions simultanées : une seule partie comptée.
  for k in 1 2 3 4; do
    ( $P -d $DB -c "set role authenticated" -c "select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0001', false)" -c "select public.mode_played(50)" >/dev/null 2>&1 ) &
    pids="$pids $!"
  done
  wait $pids || true
  R="$($P -d $DB -At -c "select (select likes from tracks where id = '00000000-0000-0000-0000-00000000f0f1') || ',' || (select count(*) from track_likes where track_id = '00000000-0000-0000-0000-00000000f0f1') || ',' || (select reports from tracks where id = '00000000-0000-0000-0000-00000000f0f1') || ',' || (select count(*) from track_reports where track_id = '00000000-0000-0000-0000-00000000f0f1') || ',' || (select hidden::int from tracks where id = '00000000-0000-0000-0000-00000000f0f1') || ',' || (select plays from community_modes where id = 50)")"
  [ "$R" = "8,8,8,8,1,8" ] || { BAD=$((BAD + 1)); echo "  (manche $round : j'aime, lignes, signalements, lignes, masqué, parties = $R)"; }
done
$P -d $DB -c "insert into public.res (name, ok) values ('FAILLE 10 : six manches de huit pilotes simultanés (j''aime, signalement, parties) : compteurs EXACTS à chaque manche (8 j''aime, 8 signalements, circuit masqué, 8 parties — le même pilote en quatre sessions n''en compte qu''une)', $([ $BAD -eq 0 ] && echo true || echo false))" >/dev/null

$P -d $DB -At > "$TMP/out.txt" <<'SQL'
select case when ok then '  ok   ' else '  FAIL ' end || name from public.res order by n;
SQL
cat "$TMP/out.txt"
TOTAL=$(grep -c "^  " "$TMP/out.txt" || true)
FAILS=$(grep -c "^  FAIL" "$TMP/out.txt" || true)
FLAWS_FAIL=$(grep -c "^  FAIL FAILLE" "$TMP/out.txt" || true)
FLAWS=$(grep -c "FAILLE" "$TMP/out.txt" || true)
if [ -n "${AVANT:-}" ]; then
  # Sans l'étape 17 : la plupart des contrôles « FAILLE » doivent échouer (le test VOIT les failles) ; les autres échecs (droits des fonctions, témoins qui dépendent de
  # l'étape 17) sont attendus et seulement comptés. Le contrôle de concurrence est non déterministe (des mises à jour perdues « parfois ») : il peut passer par chance.
  OTHER=$((FAILS - FLAWS_FAIL))
  echo "AVANT l'étape 17 : $FLAWS_FAIL / $FLAWS contrôles « FAILLE » en échec ; autres échecs attendus : $OTHER"
  [ "$FLAWS_FAIL" -ge 10 ] || { echo "ÉCHEC : le test ne détecte pas les failles attendues"; exit 1; }
  echo "RESULT sécurité SQL (avant 17) : les failles sont détectées"
  exit 0
fi
if [ "$VPFAIL" != 0 ]; then echo "ÉCHEC : verify-prod.sql ne passe pas sur la base complète"; exit 1; fi
if [ "$FAILS" -gt 0 ] || [ "$TOTAL" -lt 65 ]; then echo "ÉCHEC : sécurité SQL ($FAILS échec(s) sur $TOTAL)"; head -5 "$TMP/err.txt" 2>/dev/null || true; exit 1; fi
echo "RESULT sécurité SQL : $TOTAL contrôles réussis (droits, attaques d'un joueur contre un autre, sans session, failles corrigées, abus, concurrence) + verify-prod.sql sans MANQUE ni ÉCART sur la base complète"
