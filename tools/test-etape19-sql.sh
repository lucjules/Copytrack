#!/usr/bin/env bash
# Teste supabase/etape19-avis.sql sur un PostgreSQL local : PGHOST=… PGPORT=… PGUSER=postgres tools/test-etape18-sql.sh   (npm run test:sql)
# Base jetable (copytrack_sqltest19), étapes 1 à 18 puis 19 (deux fois : relançable). On vérifie : un avis s'envoie sans session, valeurs contrôlées,
# adresses retirées, pseudo seulement s'il est donné ; plafonds par installation et global ; personne ne lit la table ; purge à 12 mois ; santé.
set -euo pipefail
export PGOPTIONS='-c client_min_messages=warning'      # (sans les NOTICE des étapes relancées)
cd "$(dirname "$0")/.."
DB=copytrack_sqltest19
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
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false,
  encrypted_password text, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now(), refreshed_at timestamp);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
SQL
$P -d $DB -f "$TMP/stub.sql"
for n in 1-communaute 2-classements 3-description 4-comptes 5-securite 6-telemetrie 7-fantomes 8-decouverte 9-secteurs 10-social 11-saisons 12-competition 13-communaute 14-securite 15-backend 15b-publication-verifiee 16-durcissement 17-securite 18-maintenance; do
  $P -d $DB -f supabase/etape$n.sql >/dev/null
done

$P -d $DB -f supabase/etape19-avis.sql >/dev/null
$P -d $DB -f supabase/etape19-avis.sql >/dev/null          # relançable

$P -d $DB -At > "$TMP/out.txt" <<'SQL'
\set ON_ERROR_STOP off
create table public.res19 (name text, ok boolean);
grant all on public.res19 to public;
create function public.check19(n text, c boolean) returns void language plpgsql security definer as $$ begin insert into public.res19 values (n, coalesce(c, false)); end $$;
grant execute on function public.check19(text, boolean) to public;
create function public.essai19(f jsonb) returns boolean language plpgsql as $$ begin perform public.submit_feedback(f); return true; exception when others then return false; end $$;
grant execute on function public.essai19(jsonb) to public;

set role anon;
select check19('un avis complet s''envoie sans session', public.submit_feedback('{"install":"00000000000000a1","version":"bêta 0.13.0","pv":38,"device":"telephone","controls":"tactile","experience":"debutant","fun":4,"camera":5,"drift":-1,"walls":0,"air":1,"difficulty":-2,"tracks_note":"Temple : trop dur https://x.example/a","comment":"Super","pseudo":"  "}'::jsonb) > 0);
select check19('valeurs hors bornes refusées (note 6, équilibrage 3, appareil inconnu, identifiant invalide)', not public.essai19('{"install":"00000000000000a2","version":"v","pv":38,"device":"ordinateur","controls":"clavier","experience":"habitue","fun":6,"camera":3,"drift":0,"walls":0,"air":0,"difficulty":0}')
  and not public.essai19('{"install":"00000000000000a2","version":"v","pv":38,"device":"ordinateur","controls":"clavier","experience":"habitue","fun":3,"camera":3,"drift":3,"walls":0,"air":0,"difficulty":0}')
  and not public.essai19('{"install":"00000000000000a2","version":"v","pv":38,"device":"console","controls":"clavier","experience":"habitue","fun":3,"camera":3,"drift":0,"walls":0,"air":0,"difficulty":0}')
  and not public.essai19('{"install":"pas-hexa","version":"v","pv":38,"device":"ordinateur","controls":"clavier","experience":"habitue","fun":3,"camera":3,"drift":0,"walls":0,"air":0,"difficulty":0}'));
select check19('le pseudo est joint seulement s''il est donné', public.submit_feedback('{"install":"00000000000000a3","version":"v","pv":38,"device":"ordinateur","controls":"manette","experience":"habitue","fun":5,"camera":4,"drift":0,"walls":-1,"air":0,"difficulty":1,"pseudo":"Testeur"}'::jsonb) > 0);
select public.submit_feedback('{"install":"00000000000000a4","version":"v","pv":38,"device":"ordinateur","controls":"clavier","experience":"habitue","fun":3,"camera":3,"drift":0,"walls":0,"air":0,"difficulty":0}'::jsonb) from generate_series(1, 7);
reset role;
select check19('adresse retirée, pseudo vide = aucun pseudo', (select tracks_note = 'Temple : trop dur <url>' and pseudo is null from feedback where install = '00000000000000a1'));
select check19('pseudo donné : gardé', (select pseudo = 'Testeur' from feedback where install = '00000000000000a3'));
select check19('5 avis par installation et par jour au plus (les suivants : 0, sans erreur)', (select count(*) from feedback where install = '00000000000000a4') = 5);
select check19('ni anon ni authenticated ne lisent les avis', not has_table_privilege('anon', 'public.feedback', 'select') and not has_table_privilege('authenticated', 'public.feedback', 'select'));
insert into feedback (created_at, install, version, phys_ver, device, controls, experience, fun, camera, drift, walls, air, difficulty) values (now() - interval '13 months', '00000000000000a5', 'v', 30, 'ordinateur', 'clavier', 'habitue', 3, 3, 0, 0, 0, 0);
select public.purge_expired();
select check19('purge : avis de plus de 12 mois effacés, récents gardés', not exists (select 1 from feedback where install = '00000000000000a5') and exists (select 1 from feedback where install = '00000000000000a1'));
set role anon;
select check19('health_report compte les avis du jour', (select (public.health_report()->>'feedback_24h')::int >= 7));
reset role;
select case when ok then '  ok   ' else '  FAIL ' end || name from public.res19 order by ctid;
select 'COMPTE ' || count(*) || ' ' || count(*) filter (where not ok) from public.res19;
SQL
grep -E "^  (ok|FAIL)" "$TMP/out.txt" || true
N="$(grep '^COMPTE' "$TMP/out.txt" || echo 'COMPTE 0 0')"
if grep -q "^  FAIL" "$TMP/out.txt" || [ "$N" != "COMPTE 9 0" ]; then echo "ÉCHEC : étape 19 ($N)"; grep -iv "^  ok" "$TMP/out.txt" | head -20; exit 1; fi
echo "RESULT étape 19 : avis des testeurs (envoi, contrôles, plafonds, confidentialité, purge, santé) ; relançable"
