#!/usr/bin/env bash
# Teste supabase/etape16-durcissement.sql sur un PostgreSQL local : PGHOST=… PGPORT=… PGUSER=postgres tools/test-etape16-sql.sh   (npm run test:sql)
# La base de test reproduit l'état constaté en production : étapes 1 à 15, PUIS les droits par défaut de Supabase (tout accordé à anon et authenticated) sur les
# tables que les étapes ne restreignent pas. On vérifie : 1. les parcours du jeu AVANT l'étape ; 2. les droits après l'étape ; 3. les mêmes parcours APRÈS ;
# 4. que l'étape se relance sans erreur. Base jetable (copytrack_sqltest16), créée et supprimée ici : jamais une base de production.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=copytrack_sqltest16
P="psql -v ON_ERROR_STOP=1 -q -X"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; psql -q -X -d postgres -c "drop database if exists '"$DB"'" >/dev/null 2>&1 || true' EXIT
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
cat > "$TMP/stub.sql" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false, encrypted_password text);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated;
SQL
for f in "$TMP/stub.sql" supabase/etape1-communaute.sql supabase/etape2-classements.sql supabase/etape3-description.sql supabase/etape4-comptes.sql supabase/etape5-securite.sql supabase/etape6-telemetrie.sql supabase/etape7-fantomes.sql supabase/etape8-decouverte.sql supabase/etape9-secteurs.sql supabase/etape10-social.sql supabase/etape11-saisons.sql supabase/etape12-competition.sql supabase/etape13-communaute.sql supabase/etape14-securite.sql supabase/etape15-backend.sql; do $P -d $DB -f "$f"; done
# État de la production : les droits par défaut de Supabase sur les tables que les étapes 1 à 15 ne restreignent pas (constat du 11 novembre 2026).
$P -d $DB -c "grant all on public.accounts, public.cloud_saves, public.track_likes, public.track_plays, public.track_reports to anon, authenticated" \
          -c "grant select, insert, update, delete on public.players, public.tracks to anon" -c "grant delete on public.players to authenticated"

cat > "$TMP/flows.sql" <<'SQL'
\set ON_ERROR_STOP off
-- Les parcours du jeu, sous les rôles du jeu. Chaque ligne : « nom | t/f ».
create or replace function public.as_user(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;
grant execute on function public.as_user(uuid) to public;
create table if not exists public.res16 (phase text, name text, ok boolean);
grant all on public.res16 to public;
create or replace function public.check16(ph text, n text, c boolean) returns void language plpgsql security definer as $$ begin insert into public.res16 values (ph, n, coalesce(c, false)); end $$;
grant execute on function public.check16(text, text, boolean) to public;
reset role;
delete from auth.users where id in ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c002');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000c001', 'audit16@accounts.copytrack.invalid', '{"username":"Audit16"}');
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-00000000c002', true);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-00000000c001');
-- profil : l'upsert exact du jeu (PostgREST, merge-duplicates)
insert into players (id, name) values ('00000000-0000-0000-0000-00000000c001', 'Audit16') on conflict (id) do update set id = excluded.id, name = excluded.name;
select public.check16(:'phase', 'compte : créer son profil (upsert)', exists (select 1 from players where id = '00000000-0000-0000-0000-00000000c001'));
select public.check16(:'phase', 'compte : lire sa ligne de compte', (select count(*) from accounts) = 1);
insert into cloud_saves (user_id, data) values ('00000000-0000-0000-0000-00000000c001', '{"profile":{"coins":1}}');
update cloud_saves set data = '{"profile":{"coins":2}}' where user_id = '00000000-0000-0000-0000-00000000c001';
select public.check16(:'phase', 'compte : créer puis mettre à jour sa sauvegarde cloud', (select data->'profile'->>'coins' from cloud_saves) = '2');
insert into tracks (name, decor, code, signature, author_time, pieces, laps, description) values ('Essai 16', 'desert', 'SHW3:x', 'sig16' || :'phase', 12.5, 5, 1, '');
select public.check16(:'phase', 'publier un circuit (avant 15b) et le relire', exists (select 1 from tracks where signature = 'sig16' || :'phase'));
select public.toggle_like((select id from tracks where signature = 'sig16' || :'phase'));
select public.check16(:'phase', 'j''aime : toggle_like puis lecture de ses j''aime', (select count(*) from track_likes) = 1);
select public.track_played((select id from tracks where signature = 'sig16' || :'phase'));
select public.check16(:'phase', 'track_played compte la partie', (select plays from tracks where signature = 'sig16' || :'phase') = 1);
select public.check16(:'phase', 'lire les classements (colonnes publiques)', (select count(*) from (select track_key, player, time, phys_ver from scores) s) >= 0);
delete from tracks where signature = 'sig16' || :'phase';
select public.check16(:'phase', 'supprimer son circuit', not exists (select 1 from tracks where signature = 'sig16' || :'phase'));
-- invité (session anonyme = rôle authenticated)
select public.as_user('00000000-0000-0000-0000-00000000c002');
insert into players (id, name) values ('00000000-0000-0000-0000-00000000c002', 'Invite16') on conflict (id) do update set id = excluded.id, name = excluded.name;
select public.check16(:'phase', 'invité : créer son profil', exists (select 1 from players where id = '00000000-0000-0000-0000-00000000c002'));
select public.check16(:'phase', 'invité : ne voit pas la sauvegarde du compte', (select count(*) from cloud_saves) = 0);
reset role;
-- sans session (anon) : lecture publique seulement
set role anon;
select public.check16(:'phase', 'anon : lit les pilotes et les circuits publics', (select count(*) from players) >= 2 and (select count(*) from tracks) >= 0);
select public.check16(:'phase', 'anon : pseudo disponible ?', public.username_available('PseudoLibre16') is true);
do $$ begin insert into players (id, name) values (gen_random_uuid(), 'Pirate'); exception when others then null; end $$;
do $$ begin update players set name = 'Pirate' where true; exception when others then null; end $$;
do $$ begin delete from players where true; exception when others then null; end $$;
reset role;
select public.check16(:'phase', 'anon : n''a rien pu écrire dans players', not exists (select 1 from players where name = 'Pirate') and (select count(*) from players where id in ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c002')) = 2);
set role authenticated;
select public.as_user('00000000-0000-0000-0000-00000000c002');
do $$ begin delete from cloud_saves where true; exception when others then null; end $$;
do $$ begin delete from players where id = '00000000-0000-0000-0000-00000000c001'; exception when others then null; end $$;
do $$ begin insert into track_likes (track_id, player) select id, '00000000-0000-0000-0000-00000000c001' from tracks limit 1; exception when others then null; end $$;
do $$ begin update accounts set username = 'Vol' where true; exception when others then null; end $$;
reset role;
select public.check16(:'phase', 'un autre joueur n''a rien pu modifier (sauvegarde, profil, compte)', (select count(*) from cloud_saves) = 1 and exists (select 1 from players where id = '00000000-0000-0000-0000-00000000c001') and (select username from accounts where user_id = '00000000-0000-0000-0000-00000000c001') = 'Audit16');
-- ménage (les lignes de cette phase)
delete from auth.users where id in ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c002');
SQL
$P -d $DB -v phase=avant -f "$TMP/flows.sql" > /dev/null 2>&1 || true
$P -d $DB -f supabase/etape16-durcissement.sql
$P -d $DB -f supabase/etape16-durcissement.sql          # relançable
$P -d $DB -v phase=apres -f "$TMP/flows.sql" > /dev/null 2>&1 || true

$P -d $DB -At <<'SQL' > "$TMP/out.txt"
-- 2. Droits après l'étape : la matrice attendue.
with t(name, ok) as (
  select 'anon : aucune écriture directe sur aucune table', not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'res16'
      and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete') or has_table_privilege('anon', c.oid, 'truncate')))
  union all select 'anon : aucune écriture par colonne non plus', not exists (select 1 from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'res16' and (has_column_privilege('anon', c.oid, a.attnum, 'insert') or has_column_privilege('anon', c.oid, a.attnum, 'update')))
  union all select 'anon : ne lit ni accounts, ni cloud_saves, ni track_likes, ni track_plays, ni track_reports', not (has_table_privilege('anon', 'public.accounts', 'select') or has_table_privilege('anon', 'public.cloud_saves', 'select')
      or has_table_privilege('anon', 'public.track_likes', 'select') or has_table_privilege('anon', 'public.track_plays', 'select') or has_table_privilege('anon', 'public.track_reports', 'select'))
  union all select 'anon : lit toujours players, tracks et les colonnes publiques de scores', has_table_privilege('anon', 'public.players', 'select') and has_table_privilege('anon', 'public.tracks', 'select')
      and has_column_privilege('anon', 'public.scores', 'time', 'select') and not has_column_privilege('anon', 'public.scores', 'inputs', 'select')
  union all select 'authenticated : accounts en lecture seule', has_table_privilege('authenticated', 'public.accounts', 'select') and not (has_table_privilege('authenticated', 'public.accounts', 'insert')
      or has_table_privilege('authenticated', 'public.accounts', 'update') or has_table_privilege('authenticated', 'public.accounts', 'delete'))
  union all select 'authenticated : cloud_saves sans suppression directe', has_table_privilege('authenticated', 'public.cloud_saves', 'select, insert, update') and not has_table_privilege('authenticated', 'public.cloud_saves', 'delete')
  union all select 'authenticated : players sans suppression, écriture par colonne (id, name) seulement', not has_table_privilege('authenticated', 'public.players', 'delete') and not has_table_privilege('authenticated', 'public.players', 'update')
      and has_column_privilege('authenticated', 'public.players', 'name', 'update') and not has_column_privilege('authenticated', 'public.players', 'created_at', 'update')
  union all select 'authenticated : track_likes en lecture seule ; track_plays et track_reports fermées', has_table_privilege('authenticated', 'public.track_likes', 'select') and not has_table_privilege('authenticated', 'public.track_likes', 'insert')
      and not has_table_privilege('authenticated', 'public.track_plays', 'select') and not has_table_privilege('authenticated', 'public.track_reports', 'insert')
  union all select 'authenticated : aucun truncate / references / trigger', not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'res16'
      and (has_table_privilege('authenticated', c.oid, 'truncate') or has_table_privilege('authenticated', c.oid, 'trigger') or has_table_privilege('authenticated', c.oid, 'references')))
  union all select 'étape 15 intacte : scores et tracks non modifiables directement', not (has_table_privilege('authenticated', 'public.scores', 'insert') or has_table_privilege('authenticated', 'public.tracks', 'update'))
  union all select 'la sécurité au niveau des lignes est toujours active partout', not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'res16' and not c.relrowsecurity)
)
select case when ok then '  ok   ' else '  FAIL ' end || 'droits : ' || name from t;
select case when ok then '  ok   ' else '  FAIL ' end || phase || ' : ' || name from public.res16 order by phase desc, ctid;
select 'COMPTE ' || count(*) filter (where phase = 'avant') || ' ' || count(*) filter (where phase = 'apres') || ' ' || count(*) filter (where not ok) from public.res16;
SQL
cat "$TMP/out.txt" | grep -v "^COMPTE"
N="$(grep '^COMPTE' "$TMP/out.txt")"
# Les mêmes 14 parcours avant et après, tous réussis ; les 11 contrôles de droits réussis.
if grep -q "^  FAIL" "$TMP/out.txt" || [ "$N" != "COMPTE 14 14 0" ] || [ "$(grep -c '^  ok   droits' "$TMP/out.txt")" != 11 ]; then echo "ÉCHEC : étape 16 ($N)"; exit 1; fi
echo "RESULT étape 16 : droits réduits, parcours du jeu identiques avant et après (14 + 14), relançable"
