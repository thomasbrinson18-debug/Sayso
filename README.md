# Sayso

Rate places and see who actually goes there. Filter any city's bars, restaurants, gyms and studios by the crowd: age, gender, politics, religion, education, income and school.

## How it works

- **Front end:** static HTML/JS (`index.html`, `app.js`), hosted on GitHub Pages.
- **Back end:** Supabase (Postgres + Auth). Setup scripts are in `supabase/`.
- **Privacy:** nobody can read individual ratings. The app only gets crowd totals from three database functions (`search_places`, `place_crowd`, `place_notes`) that:
  - hide any group smaller than 5 people
  - round shares to the nearest 5%
  - allow at most 3 crowd filters per search
  - show notes without any demographics

## Setting up a new Supabase project

1. SQL Editor → run `supabase/schema.sql` (choose "Run and enable RLS" if asked).
2. Authentication → URL Configuration → set Site URL and Redirect URLs to the GitHub Pages address.
3. Put the project URL and publishable key at the top of `app.js`. Never put the secret / service_role key in this repo.
