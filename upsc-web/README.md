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

Create a free project at [supabase.com](https://supabase.com) — that part needs
your own login. Everything after it is one command.

### Automated

```bash
cd upsc-web
npm install
npm run setup
```

It prompts for what it needs and does whatever the credentials allow, skipping
the rest. Both steps are idempotent, so re-running is safe.

| It asks for | Found in the Supabase dashboard | It then does |
|---|---|---|
| `SUPABASE_DB_URL` | Settings → Database → Connection string → URI | Applies `supabase/schema.sql` |
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` | Creates the admin user and allow-lists it |

The service role key is used **only** by this script, from your machine. It is
never referenced by the site and never shipped to the browser. Don't put it in
`.env.local`; paste it at the prompt, or pass it for a single run:

```bash
SUPABASE_DB_URL='postgresql://...' \
NEXT_PUBLIC_SUPABASE_URL='https://xxxx.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='eyJ...' \
ADMIN_EMAIL='you@example.com' ADMIN_PASSWORD='choose-a-password' \
npm run setup
```

With no TTY (CI), it skips prompting and uses environment variables only.

### Manual

If you'd rather not hand the script any credentials:

1. **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), run it. That creates:
   - `notes` and `newspaper_analysis` tables
   - the `admins` allow-list table and `is_admin()` helper
   - Row Level Security: anyone can read, only admins can write
   - the public `notes-pdfs` storage bucket and its policies
2. **Authentication → Users → Add user** — email + password, mark it confirmed.
3. Copy that user's UUID and run, in the SQL editor:
   ```sql
   insert into public.admins (id) values ('PASTE-USER-UUID-HERE');
   ```
   Skipping this means every save is rejected by RLS. The dashboard tells you so
   and prints the exact statement to run.

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

Only the anon key is used by the app — there is no service-role key in it, so
nothing secret ships to the browser. Write access is enforced by RLS, not by
hiding keys.

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
├── supabase/schema.sql        # tables, RLS, storage bucket
├── scripts/setup-supabase.mjs # applies the schema + creates the admin user
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

## How the schema was checked

`supabase/schema.sql` was executed against a real PostgreSQL 16 server with the
Supabase-managed pieces it depends on (`auth.users`, `auth.uid()`,
`storage.buckets`, `storage.objects`, and the `anon` / `authenticated` roles)
stubbed in. Verified there:

- applies cleanly, and again on a second run without error
- anon can read `notes` and `newspaper_analysis`, and cannot insert into either
- a signed-in user who is *not* on the allow-list cannot insert or update
- a signed-in user who *is* on the allow-list can insert
- a `gs_paper` outside GS1–GS4/State is rejected by the check constraint

The stub is not a Supabase reimplementation, so treat this as a check of the SQL
and the policy logic — not of Supabase's own auth or storage behaviour.
