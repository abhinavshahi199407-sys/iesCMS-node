# Prep Desk — UPSC & State Civil Services prep site

Next.js (App Router) + Tailwind CSS front end, Supabase for database / auth / PDF
storage, deployable free on Vercel.

- **Public side** — daily newspaper analysis (Markdown) and downloadable GS1–GS4 /
  State PSC PDF notes, with a paper filter and search. Mobile-first.
- **Admin side** — `/admin/dashboard`, password-protected, with one form to upload
  PDF notes and one to publish the daily analysis.

This folder is self-contained and does not touch the iesCMS server in the repo
root; it runs as its own app.

---

## 1. Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. That creates:
   - `notes` and `newspaper_analysis` tables
   - the `admins` allow-list table and `is_admin()` helper
   - Row Level Security: anyone can read, only admins can write
   - the public `notes-pdfs` storage bucket and its policies
3. Create your admin login under **Authentication → Users → Add user** (email +
   password, mark it confirmed).
4. Copy that user's UUID and run, in the SQL editor:
   ```sql
   insert into public.admins (id) values ('PASTE-USER-UUID-HERE');
   ```
   Skipping this step means every save is rejected by RLS. The dashboard tells
   you so and prints the exact statement to run.

---

## 2. Local development

```bash
cd upsc-web
npm install
cp .env.example .env.local     # then fill in the two values
npm run dev                    # http://localhost:3000
```

Both values come from **Supabase → Project Settings → API**:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / public key |

Only the anon key is used — there is no service-role key in this app, so nothing
secret ships to the browser. Write access is enforced by RLS, not by hiding keys.

Sign in at `/admin/login` and publish from `/admin/dashboard`.

---

## 3. Deploy to Vercel

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Set **Root Directory** to `upsc-web` (it is not at the repo root).
4. Add the same two environment variables under **Settings → Environment
   Variables**.
5. Deploy. Every later push redeploys automatically.

---

## Routes

| Route | What it is |
|---|---|
| `/` | Home — latest analysis + latest notes + paper shortcuts |
| `/analysis` | All daily newspaper analysis |
| `/analysis/[id]` | One analysis, Markdown rendered |
| `/notes` | All notes; `?paper=GS2` filters, `?q=polity` searches title/topic |
| `/admin/login` | Admin sign-in |
| `/admin/dashboard` | Upload notes / publish analysis |
| `/auth/signout` | POST-only sign-out |

`src/proxy.ts` (Next 16's replacement for `middleware.ts`) refreshes the Supabase
session cookie on every request and redirects signed-out visitors away from
`/admin`.

## Layout

```
upsc-web/
├── supabase/schema.sql        # paste into the Supabase SQL editor
└── src/
    ├── proxy.ts               # session refresh + /admin gate
    ├── app/                   # routes (App Router)
    ├── components/            # header, cards, filter sidebar, admin forms
    └── lib/
        ├── constants.ts       # GS paper list, storage bucket name
        ├── format.ts          # date formatting (UTC-stable)
        ├── types.ts
        └── supabase/          # browser, server and proxy clients
```

## Adding a paper category

Edit `GS_PAPERS` in `src/lib/constants.ts`, then widen the check constraint:

```sql
alter table public.notes drop constraint notes_gs_paper_check;
alter table public.notes add constraint notes_gs_paper_check
    check (gs_paper in ('GS1','GS2','GS3','GS4','State','Essay'));
```
