-- Sayso: move imported businesses from places_import into places.
-- Run in Supabase > SQL Editor after importing the CSV into the places_import table.
-- Safe to run again after every monthly refresh.

-- 1. add new businesses, update ones we already have
insert into public.places (name, category, city, region, neighborhood, address, lat, lng, overture_id, status, created_by)
select name, category, city, region, neighborhood, address, lat, lng, overture_id, 'open', null
from public.places_import
on conflict (overture_id) do update
  set name = excluded.name, category = excluded.category, city = excluded.city, region = excluded.region,
      neighborhood = excluded.neighborhood, address = excluded.address, lat = excluded.lat, lng = excluded.lng,
      status = 'open';

-- 2. places people typed in by hand that now exist in the import (same name, same city, exactly one match):
--    move their ratings onto the imported place, then remove the hand-typed copy
drop table if exists dup;
create temp table dup as
select u.id as typed_id, min(i.id::text)::uuid as imported_id
from public.places u
join public.places i
  on i.overture_id is not null and u.overture_id is null
 and lower(trim(i.name)) = lower(trim(u.name)) and i.city = u.city
group by u.id
having count(*) = 1;

update public.reviews r
set place_id = d.imported_id
from dup d
where r.place_id = d.typed_id
  and not exists (select 1 from public.reviews r2 where r2.place_id = d.imported_id and r2.user_id = r.user_id);

delete from public.places u using dup d where u.id = d.typed_id;
drop table dup;

-- 3. empty the holding table
truncate public.places_import;

-- 4. what's loaded now
select city, category, count(*) as places
from public.places group by city, category order by city, category;
