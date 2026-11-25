-- Sayso: "what you ordered" with per-dish stars, and photos on ratings.
-- Run once in Supabase > SQL Editor (after 03 and 04). If asked about RLS, choose "Run and enable RLS".

-- ---------- New fields on ratings ----------
alter table public.reviews
  add column if not exists items  jsonb  not null default '[]'::jsonb,   -- [{"name":"Shrimp po-boy","stars":5}, ...]
  add column if not exists photos text[] not null default '{}';          -- storage paths like '1b9d…e1.jpg'

create or replace function private.validate_review_extras() returns trigger
language plpgsql as $$
declare it jsonb; p text;
begin
  if jsonb_typeof(new.items) <> 'array' then raise exception 'Dishes must be a list'; end if;
  if jsonb_array_length(new.items) > 10 then raise exception 'Add at most 10 dishes per rating'; end if;
  for it in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(it->'name') is distinct from 'string' or char_length(trim(it->>'name')) not between 1 and 80 then
      raise exception 'Each dish needs a name (up to 80 characters)';
    end if;
    if jsonb_typeof(it->'stars') is distinct from 'number' or (it->>'stars')::numeric not in (1,2,3,4,5) then
      raise exception 'Give each dish 1 to 5 stars';
    end if;
  end loop;
  -- keep only name + stars
  new.items := coalesce((select jsonb_agg(jsonb_build_object('name', trim(e->>'name'), 'stars', (e->>'stars')::int))
                         from jsonb_array_elements(new.items) e), '[]'::jsonb);
  if coalesce(array_length(new.photos, 1), 0) > 4 then raise exception 'Add at most 4 photos per rating'; end if;
  foreach p in array new.photos loop
    if p !~ '^[0-9a-f-]{36}\.jpg$' then raise exception 'Invalid photo reference'; end if;
  end loop;
  return new;
end $$;

drop trigger if exists reviews_validate_extras on public.reviews;
create trigger reviews_validate_extras before insert or update on public.reviews
  for each row execute function private.validate_review_extras();

-- ---------- Top dishes at a place (no demographics) ----------
create or replace function public.place_dishes(p_place_id uuid, p_limit int default 10)
returns table (dish text, orders int, avg_stars numeric)
language sql stable security definer set search_path = public as $$
  select mode() within group (order by trim(e->>'name')),
         count(*)::int,
         round(avg((e->>'stars')::numeric), 1)
  from private.counted_reviews() r
  cross join lateral jsonb_array_elements(r.items) e
  where r.place_id = p_place_id
  group by lower(trim(e->>'name'))
  order by count(*) desc, avg((e->>'stars')::numeric) desc
  limit least(greatest(p_limit, 1), 30)
$$;

-- ---------- Recent posts: stars, note, dishes, photos (never demographics) ----------
create or replace function public.place_posts(p_place_id uuid, p_limit int default 12)
returns table (stars smallint, freq text, note text, items jsonb, photos text[], posted_on date)
language sql stable security definer set search_path = public as $$
  select r.stars, r.freq, nullif(trim(r.note), ''), r.items, r.photos, r.created_at::date
  from private.counted_reviews() r
  where r.place_id = p_place_id
    and (coalesce(trim(r.note), '') <> '' or jsonb_array_length(r.items) > 0 or cardinality(r.photos) > 0)
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

revoke execute on function public.place_dishes(uuid, int) from public;
revoke execute on function public.place_posts(uuid, int) from public;
grant execute on function public.place_dishes(uuid, int) to anon, authenticated;
grant execute on function public.place_posts(uuid, int) to anon, authenticated;

-- ---------- Photo storage ----------
-- Public bucket: anyone can view a photo by its link; nobody can list the bucket.
-- File names are random, so photos can't be linked back to a person.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists "review photos: signed-in upload" on storage.objects;
create policy "review photos: signed-in upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'review-photos' and name ~ '^[0-9a-f-]{36}\.jpg$');

-- deleting needs the owner to be able to "see" their own file record (viewing by link works for everyone regardless)
drop policy if exists "review photos: owner sees own" on storage.objects;
create policy "review photos: owner sees own" on storage.objects
  for select to authenticated
  using (bucket_id = 'review-photos' and owner_id = (select auth.uid())::text);

drop policy if exists "review photos: owner deletes" on storage.objects;
create policy "review photos: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'review-photos' and owner_id = (select auth.uid())::text);
