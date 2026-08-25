-- =====================================================================
-- UPSC / State Civil Services prep site — Supabase schema
-- Paste this whole file into: Supabase Dashboard -> SQL Editor -> New query
-- Safe to re-run: everything is IF NOT EXISTS / OR REPLACE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Admin allow-list
--    Only user ids listed here may write. Add yourself after signing up:
--      insert into public.admins (id) values ('<your-auth-user-uuid>');
--    (Find the uuid in Dashboard -> Authentication -> Users)
-- ---------------------------------------------------------------------
create table if not exists public.admins (
    id          uuid primary key references auth.users (id) on delete cascade,
    created_at  timestamptz not null default now()
);

-- The helper lives in `private`, not `public`: PostgREST exposes `public`, so a
-- SECURITY DEFINER function there would be callable by anyone as
-- /rest/v1/rpc/is_admin. Supabase's own security linter flags that.
create schema if not exists private;

-- search_path = '' (not 'public'): the function cannot then be steered by a
-- caller-controlled search_path, so every reference below is fully qualified.
-- (select auth.uid()) makes the lookup an InitPlan, evaluated once per
-- statement rather than once per row.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.admins a where a.id = (select auth.uid())
    );
$$;

-- RLS expressions are evaluated as the querying role, so it needs EXECUTE.
-- Postgres grants EXECUTE to PUBLIC on new functions by default; revoke that
-- explicitly as defence in depth, on top of withholding schema USAGE.
grant usage on schema private to authenticated;
revoke execute on function private.is_admin() from public, anon, service_role;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 2. notes — downloadable PDF study material
-- ---------------------------------------------------------------------
create table if not exists public.notes (
    id            uuid primary key default gen_random_uuid(),
    title         text not null,
    description   text,
    gs_paper      text not null
                  check (gs_paper in ('GS1', 'GS2', 'GS3', 'GS4', 'State')),
    topic         text,
    subtopic      text,          -- FK added below, once subtopics exists
    download_url  text not null,
    storage_path  text,
    created_at    timestamptz not null default now()
);

create index if not exists notes_gs_paper_idx   on public.notes (gs_paper);
create index if not exists notes_created_at_idx on public.notes (created_at desc);

-- ---------------------------------------------------------------------
-- 3. newspaper_analysis — daily editorial / current affairs analysis
-- ---------------------------------------------------------------------
create table if not exists public.newspaper_analysis (
    id                uuid primary key default gen_random_uuid(),
    date              date not null,
    title             text not null,
    content           text not null,          -- Markdown
    syllabus_mapping  text,
    created_at        timestamptz not null default now()
);

create index if not exists newspaper_analysis_date_idx on public.newspaper_analysis (date desc);

-- ---------------------------------------------------------------------
-- 3b. subtopics — second filter level within a paper
--     A lookup table rather than a CHECK constraint, so new sub-topics are an
--     INSERT rather than a migration.
-- ---------------------------------------------------------------------
create table if not exists public.subtopics (
    gs_paper    text not null
                check (gs_paper in ('GS1', 'GS2', 'GS3', 'GS4', 'State')),
    code        text not null,
    label       text not null,
    sort_order  integer not null default 0,
    primary key (gs_paper, code)
);

-- Composite FK: a note's sub-topic must belong to that note's own paper, so a
-- GS1 note cannot carry a GS3 sub-topic. NULL stays allowed (MATCH SIMPLE),
-- so an untagged note is fine.
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'notes_subtopic_fkey') then
        alter table public.notes
            add constraint notes_subtopic_fkey
            foreign key (gs_paper, subtopic)
            references public.subtopics (gs_paper, code)
            on update cascade;
    end if;
end $$;

create index if not exists notes_subtopic_idx on public.notes (gs_paper, subtopic);

-- GS Paper I, following the UPSC syllabus grouping. Other papers have no
-- sub-topics yet; the UI simply shows no second level until rows are added.
insert into public.subtopics (gs_paper, code, label, sort_order) values
    ('GS1', 'art-culture',       'Indian Heritage & Culture',          10),
    ('GS1', 'modern-history',    'Modern Indian History',              20),
    ('GS1', 'freedom-struggle',  'Freedom Struggle',                   30),
    ('GS1', 'post-independence', 'Post-Independence India',            40),
    ('GS1', 'world-history',     'World History',                      50),
    ('GS1', 'indian-society',    'Indian Society & Diversity',         60),
    ('GS1', 'social-issues',     'Social Empowerment & Social Issues', 70),
    ('GS1', 'physical-geo',      'Physical Geography',                 80),
    ('GS1', 'resource-geo',      'Resources & Economic Geography',     90),
    ('GS1', 'geo-phenomena',     'Geophysical Phenomena',             100)
on conflict (gs_paper, code) do update
    set label = excluded.label, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- 4. Row Level Security — world readable, admin writable
-- ---------------------------------------------------------------------
alter table public.notes              enable row level security;
alter table public.newspaper_analysis enable row level security;
alter table public.admins             enable row level security;
alter table public.subtopics          enable row level security;

drop policy if exists "notes are public" on public.notes;
create policy "notes are public"
    on public.notes for select
    using (true);

drop policy if exists "admins write notes" on public.notes;
create policy "admins write notes"
    on public.notes for all
    to authenticated
    using ((select private.is_admin()))
    with check ((select private.is_admin()));

drop policy if exists "analysis is public" on public.newspaper_analysis;
create policy "analysis is public"
    on public.newspaper_analysis for select
    using (true);

drop policy if exists "admins write analysis" on public.newspaper_analysis;
create policy "admins write analysis"
    on public.newspaper_analysis for all
    to authenticated
    using ((select private.is_admin()))
    with check ((select private.is_admin()));

drop policy if exists "subtopics are public" on public.subtopics;
create policy "subtopics are public"
    on public.subtopics for select
    using (true);

drop policy if exists "admins write subtopics" on public.subtopics;
create policy "admins write subtopics"
    on public.subtopics for all
    to authenticated
    using ((select private.is_admin()))
    with check ((select private.is_admin()));

drop policy if exists "admins read admin list" on public.admins;
create policy "admins read admin list"
    on public.admins for select
    to authenticated
    using (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 5. Storage bucket for the PDFs (public read, admin upload)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('notes-pdfs', 'notes-pdfs', true)
on conflict (id) do nothing;

drop policy if exists "pdfs are public" on storage.objects;
create policy "pdfs are public"
    on storage.objects for select
    using (bucket_id = 'notes-pdfs');

drop policy if exists "admins upload pdfs" on storage.objects;
create policy "admins upload pdfs"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'notes-pdfs' and (select private.is_admin()));

drop policy if exists "admins delete pdfs" on storage.objects;
create policy "admins delete pdfs"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'notes-pdfs' and (select private.is_admin()));
