-- Sayso: table access for the app (run after schema.sql).
-- New Supabase projects don't grant the API roles access to new tables automatically.
-- These grants only open the door; the row level security policies in schema.sql still decide which rows each person sees.

grant usage on schema public to anon, authenticated;

grant select on public.places to anon, authenticated;
grant insert on public.places to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.reviews  to authenticated;

-- nothing for anon on profiles or reviews, on purpose
revoke all on public.profiles from anon;
revoke all on public.reviews  from anon;
