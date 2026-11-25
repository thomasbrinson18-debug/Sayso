# Refreshing businesses from Overture Maps

Run with the DuckDB CLI (v1.2+) from this folder. Change the release date in `areas.sql` and `places.sql`
to the latest one listed at https://stac.overturemaps.org/catalog.json.

1. `duckdb overture.duckdb -c ".read areas.sql"`  (city and neighborhood boundaries, ~1 min)
2. `duckdb overture.duckdb -c ".read places.sql"` (every place inside the cities, ~15 min)
3. `duckdb overture.duckdb -c ".read map.sql" -c ".read build.sql"` (keep Sayso's place types, add neighborhoods)
4. Export one CSV per city:
   `COPY (SELECT overture_id, name, category, city, region, neighborhood, address, lat, lng FROM out WHERE city='Tampa, FL' ORDER BY name) TO 'places-tampa.csv' (HEADER, DELIMITER ',');`
5. In Supabase: Table Editor → `places_import` → Insert → Import data from CSV, once per file.
6. SQL Editor → run `supabase/04-merge-import.sql`.

To add a city: add it to the `boxes` list in `areas.sql`, the name mapping in `places.sql`,
and a row in the `cities` table (see `supabase/03-cities-and-import.sql`).

Data: © Overture Maps Foundation, CDLA Permissive 2.0.
