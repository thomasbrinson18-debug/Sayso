-- Sayso: database setup for Supabase.
-- Paste this whole file into Supabase > SQL Editor > New query, then Run.
-- Safe to run on a fresh project. Re-running drops nothing, but some CREATE statements will error if they already exist.
--
-- Privacy model:
--   * profiles: only the owner can read or write their row.
--   * reviews: users can write and read only their OWN rows. Nobody can read other people's reviews.
--     Demographics are copied onto each review by a trigger from the author's profile (the client can't fake them).
--   * The app reads crowd data only through three functions that return group totals with these rules:
--       - groups smaller than k_min (5) are hidden or folded into "Smaller groups"
--       - shares are rounded to the nearest 5%, matched counts to the nearest 5
--       - at most max_filters (3) crowd filters per search
--       - accounts younger than min_account_age don't count (0 hours while testing; raise to ~3 days at launch)

create extension if not exists pgcrypto;
create schema if not exists private;   -- not exposed through the API

-- ---------- Settings ----------
create table private.app_config (
  id int primary key default 1 check (id = 1),
  k_min int not null default 5,
  max_filters int not null default 3,
  min_account_age interval not null default interval '0 hours'
);
insert into private.app_config default values;
alter table private.app_config enable row level security;  -- no policies: only the owner (the crowd functions) can read it

-- ---------- Profiles ----------
create table public.profiles (
  user_id     uuid primary key references auth.users on delete cascade,
  age_band    text check (age_band  in ('18-24','25-34','35-44','45-54','55-64','65+')),
  gender      text check (gender    in ('Woman','Man','Non-binary')),
  politics    text check (politics  in ('Liberal','Moderate','Conservative','Libertarian','Apolitical')),
  religion    text check (religion  in ('Christian','Catholic','Jewish','Muslim','Hindu','Buddhist','Spiritual','None')),
  education   text check (education in ('High school','Some college','Bachelor''s','Graduate')),
  income      text check (income    in ('Under $50k','$50-100k','$100-200k','$200k+')),
  home_city   text check (char_length(home_city) <= 60),
  school      text check (char_length(school) <= 80),
  sensitive_consent_at timestamptz,          -- when they agreed to share religion/politics
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: read own"   on public.profiles for select to authenticated using (user_id = auth.uid());
create policy "profiles: insert own" on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy "profiles: update own" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "profiles: delete own" on public.profiles for delete to authenticated using (user_id = auth.uid());

-- ---------- Places ----------
create table public.places (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  category        text not null check (category in ('Bar','Restaurant','Coffee shop','Yoga studio','Gym','Club','Salon','Other')),
  city            text not null check (char_length(city) <= 60),
  region          text,                       -- state, e.g. LA
  neighborhood    text check (char_length(neighborhood) <= 60),
  address         text,
  lat             double precision,
  lng             double precision,
  overture_id     text unique,
  fsq_id          text unique,
  google_place_id text unique,               -- the only Google field we may store permanently
  status          text not null default 'open' check (status in ('open','closed')),
  created_by      uuid default auth.uid() references auth.users on delete set null,
  created_at      timestamptz not null default now()
);
create index places_city_cat on public.places (lower(city), category);
alter table public.places enable row level security;
create policy "places: anyone reads" on public.places for select to anon, authenticated using (true);
create policy "places: signed-in users add" on public.places for insert to authenticated
  with check (created_by = auth.uid() and overture_id is null and fsq_id is null and status = 'open');

-- ---------- Reviews ----------
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references public.places on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  stars       smallint not null check (stars between 1 and 5),
  freq        text not null check (freq in ('first','few','regular')),
  note        text check (char_length(note) <= 280),
  -- demographic snapshot, filled by trigger from the author's profile
  age_band text, gender text, politics text, religion text, education text, income text, school text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (place_id, user_id)                 -- one rating per person per place
);
create index reviews_place on public.reviews (place_id);
alter table public.reviews enable row level security;
create policy "reviews: read own"   on public.reviews for select to authenticated using (user_id = auth.uid());
create policy "reviews: insert own" on public.reviews for insert to authenticated with check (user_id = auth.uid());
create policy "reviews: update own" on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reviews: delete own" on public.reviews for delete to authenticated using (user_id = auth.uid());

create function private.snapshot_demographics() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  select * into p from public.profiles where user_id = new.user_id;
  new.age_band := p.age_band;  new.gender := p.gender;      new.politics := p.politics;
  new.religion := p.religion;  new.education := p.education; new.income := p.income;
  new.school   := nullif(trim(p.school), '');
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end $$;
create trigger reviews_snapshot before insert or update on public.reviews
  for each row execute function private.snapshot_demographics();

create function private.touch_profile() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_profile();

-- ---------- Crowd helpers (private) ----------
-- filters look like {"age_band":["25-34"],"gender":["Woman"],"school":["UT Austin"]}
create function private.matches(r public.reviews, f jsonb) returns boolean
language sql immutable as $$
  select coalesce(
        (coalesce(jsonb_array_length(f->'age_band'),0)  = 0 or (f->'age_band')  ? r.age_band)
    and (coalesce(jsonb_array_length(f->'gender'),0)    = 0 or (f->'gender')    ? r.gender)
    and (coalesce(jsonb_array_length(f->'politics'),0)  = 0 or (f->'politics')  ? r.politics)
    and (coalesce(jsonb_array_length(f->'religion'),0)  = 0 or (f->'religion')  ? r.religion)
    and (coalesce(jsonb_array_length(f->'education'),0) = 0 or (f->'education') ? r.education)
    and (coalesce(jsonb_array_length(f->'income'),0)    = 0 or (f->'income')    ? r.income)
    and (coalesce(jsonb_array_length(f->'school'),0)    = 0 or exists (
          select 1 from jsonb_array_elements_text(f->'school') s where lower(trim(s)) = lower(r.school)))
  , false)
$$;

create function private.filter_count(f jsonb) returns int
language plpgsql immutable as $$
declare k text; n int := 0;
begin
  if f is null or jsonb_typeof(f) <> 'object' then return 0; end if;
  for k in select jsonb_object_keys(f) loop
    if k not in ('age_band','gender','politics','religion','education','income','school') then
      raise exception 'Unknown filter: %', k;
    end if;
    if jsonb_typeof(f->k) <> 'array' then raise exception 'Filter % must be a list', k; end if;
    if jsonb_array_length(f->k) > 0 then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- reviews that count toward crowd stats (account old enough)
create function private.counted_reviews() returns setof public.reviews
language sql stable security definer set search_path = public as $$
  select rv.* from public.reviews rv
  join auth.users u on u.id = rv.user_id
  where u.created_at <= now() - (select min_account_age from private.app_config where id = 1)
$$;

-- ---------- Public crowd API ----------
create function public.search_places(p_city text, p_category text default null, p_filters jsonb default '{}'::jsonb)
returns table (
  place_id uuid, name text, category text, neighborhood text,
  ratings int, avg_stars numeric,
  match_status text,          -- 'none' (no filter) | 'insufficient' (place < k ratings) | 'zero' | 'few' (< k) | 'ok'
  match_share numeric,        -- 0..1, rounded to nearest 0.05, only when 'ok' or 'zero'
  match_count numeric,        -- rounded to nearest 5, only when 'ok'
  crowd_avg_stars numeric     -- only when 'ok'
)
language plpgsql stable security definer set search_path = public as $$
declare cfg private.app_config; nf int;
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
  where lower(p.city) = lower(p_city)
    and (p_category is null or p.category = p_category)
    and p.status = 'open';
end $$;

-- breakdown of one place's crowd for every dimension
create function public.place_crowd(p_place_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg private.app_config; n int; dims jsonb := '{}'::jsonb; d text; part jsonb;
begin
  select * into cfg from private.app_config where id = 1;
  select count(*) into n from private.counted_reviews() r where r.place_id = p_place_id;
  if n < cfg.k_min then
    return jsonb_build_object('ratings', n, 'hidden', true);
  end if;
  foreach d in array array['age_band','gender','politics','religion','education','income'] loop
    execute format($q$
      with c as (
        select %1$I as v, count(*) as cnt from private.counted_reviews() r
        where r.place_id = $1 group by 1
      ), l as (
        select case when v is null then 'Not shared'
                    when cnt < $2 then 'Smaller groups'
                    else v end as label, cnt
        from c
      )
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'share', round(s::numeric / $3 * 20) / 20)), '[]'::jsonb)
      from (select label, sum(cnt) as s from l group by label) x
    $q$, d) into part using p_place_id, cfg.k_min, n;
    dims := dims || jsonb_build_object(d, part);
  end loop;
  return jsonb_build_object('ratings', n, 'hidden', false, 'dims', dims);
end $$;

-- recent notes, never with demographics
create function public.place_notes(p_place_id uuid, p_limit int default 20)
returns table (stars smallint, freq text, note text, posted_on date)
language sql stable security definer set search_path = public as $$
  select r.stars, r.freq, r.note, r.created_at::date
  from private.counted_reviews() r
  where r.place_id = p_place_id and coalesce(trim(r.note), '') <> ''
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------- Permissions ----------
revoke all on schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.search_places(text, text, jsonb) from public;
revoke execute on function public.place_crowd(uuid) from public;
revoke execute on function public.place_notes(uuid, int) from public;
grant execute on function public.search_places(text, text, jsonb) to anon, authenticated;
grant execute on function public.place_crowd(uuid) to anon, authenticated;
grant execute on function public.place_notes(uuid, int) to anon, authenticated;
revoke all on public.reviews from anon;
revoke all on public.profiles from anon;

-- ---------- Table access for the API (same as 02-grants.sql) ----------
grant usage on schema public to anon, authenticated;

grant select on public.places to anon, authenticated;
grant insert on public.places to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.reviews  to authenticated;

-- nothing for anon on profiles or reviews, on purpose
revoke all on public.profiles from anon;
revoke all on public.reviews  from anon;
