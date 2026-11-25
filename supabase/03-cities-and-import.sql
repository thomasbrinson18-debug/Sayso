-- Sayso: official city list, business import table, and search that scales to big cities.
-- Run once in Supabase > SQL Editor (after schema.sql and 02-grants.sql).

create extension if not exists pg_trgm;

-- ---------- Cities ----------
create table public.cities (
  name   text primary key,              -- what people see and pick, e.g. 'St. Petersburg, FL'
  city   text not null,
  region text not null,                 -- state code
  lat double precision,
  lng double precision,
  active boolean not null default true
);
alter table public.cities enable row level security;
create policy "cities: anyone reads" on public.cities for select to anon, authenticated using (true);
grant select on public.cities to anon, authenticated;

insert into public.cities (name, city, region, lat, lng) values
  ('Baton Rouge, LA',    'Baton Rouge',    'LA', 30.4515, -91.1871),
  ('New Orleans, LA',    'New Orleans',    'LA', 29.9511, -90.0715),
  ('New York, NY',       'New York',       'NY', 40.7128, -74.0060),
  ('St. Petersburg, FL', 'St. Petersburg', 'FL', 27.7676, -82.6403),
  ('Tampa, FL',          'Tampa',          'FL', 27.9506, -82.4572);

-- other spellings people type, all lowercase
create table public.city_aliases (
  alias text primary key,
  name  text not null references public.cities(name) on update cascade
);
alter table public.city_aliases enable row level security;
create policy "city_aliases: anyone reads" on public.city_aliases for select to anon, authenticated using (true);
grant select on public.city_aliases to anon, authenticated;

insert into public.city_aliases (alias, name) values
  ('baton rouge','Baton Rouge, LA'), ('baton rouge, la','Baton Rouge, LA'), ('br','Baton Rouge, LA'),
  ('new orleans','New Orleans, LA'), ('new orleans, la','New Orleans, LA'), ('nola','New Orleans, LA'),
  ('new york','New York, NY'), ('new york, ny','New York, NY'), ('new york city','New York, NY'), ('nyc','New York, NY'),
  ('manhattan','New York, NY'), ('brooklyn','New York, NY'), ('queens','New York, NY'),
  ('bronx','New York, NY'), ('the bronx','New York, NY'), ('staten island','New York, NY'),
  ('st pete','St. Petersburg, FL'), ('st. pete','St. Petersburg, FL'), ('saint pete','St. Petersburg, FL'),
  ('st petersburg','St. Petersburg, FL'), ('st. petersburg','St. Petersburg, FL'),
  ('saint petersburg','St. Petersburg, FL'), ('st. petersburg, fl','St. Petersburg, FL'),
  ('tampa','Tampa, FL'), ('tampa, fl','Tampa, FL');

-- move places people already added onto the official names (e.g. 'St Pete')
update public.places p
set city = a.name, region = c.region
from public.city_aliases a
join public.cities c on c.name = a.name
where lower(trim(p.city)) = a.alias;

-- from now on a place must be in a listed city
alter table public.places
  add constraint places_city_fk foreign key (city) references public.cities(name) on update cascade;

create index if not exists places_name_trgm on public.places using gin (name gin_trgm_ops);
create index if not exists places_city on public.places (city);

-- ---------- Holding table for business imports (CSV goes here) ----------
create table public.places_import (
  overture_id  text primary key,
  name         text not null,
  category     text not null,
  city         text not null,
  region       text,
  neighborhood text,
  address      text,
  lat          double precision,
  lng          double precision
);
alter table public.places_import enable row level security;     -- no policies: dashboard only
revoke all on public.places_import from anon, authenticated;

-- ---------- Search: lists rated places, or any place when searching by name ----------
drop function if exists public.search_places(text, text, jsonb);
create function public.search_places(
  p_city text,
  p_category text default null,
  p_filters jsonb default '{}'::jsonb,
  p_query text default null,
  p_limit int default 60
)
returns table (
  place_id uuid, name text, category text, neighborhood text,
  ratings int, avg_stars numeric,
  match_status text, match_share numeric, match_count numeric, crowd_avg_stars numeric
)
language plpgsql stable security definer set search_path = public as $$
declare cfg private.app_config; nf int; q text := nullif(trim(p_query), '');
begin
  select * into cfg from private.app_config where id = 1;
  nf := private.filter_count(p_filters);
  if nf > cfg.max_filters then
    raise exception 'Use at most % crowd filters at once', cfg.max_filters;
  end if;
  return query
  with agg as (
    select r.place_id as pid,
           count(*)::int as n,
           avg(r.stars) as a,
           (count(*) filter (where private.matches(r, p_filters)))::int as m,
           avg(r.stars) filter (where private.matches(r, p_filters)) as ma
    from private.counted_reviews() r
    join public.places pp on pp.id = r.place_id and pp.city = p_city
    group by r.place_id
  )
  select p.id, p.name, p.category, p.neighborhood,
         coalesce(g.n, 0),
         round(g.a, 1),
         case when nf = 0 then 'none'
              when coalesce(g.n,0) < cfg.k_min then 'insufficient'
              when g.m = 0 then 'zero'
              when g.m < cfg.k_min then 'few'
              else 'ok' end,
         case when nf > 0 and g.n >= cfg.k_min and (g.m = 0 or g.m >= cfg.k_min)
              then round(g.m::numeric / g.n * 20) / 20 end,
         case when nf > 0 and g.m >= cfg.k_min then round(g.m / 5.0) * 5 end,
         case when nf > 0 and g.m >= cfg.k_min then round(g.ma, 1) end
  from public.places p
  left join agg g on g.pid = p.id
  where p.city = p_city
    and (p_category is null or p.category = p_category)
    and p.status = 'open'
    and (q is not null or g.n is not null)
    and (q is null or p.name ilike '%' || q || '%')
  order by coalesce(g.n, 0) desc, p.name
  limit least(greatest(p_limit, 1), 200);
end $$;
revoke execute on function public.search_places(text, text, jsonb, text, int) from public;
grant execute on function public.search_places(text, text, jsonb, text, int) to anon, authenticated;
