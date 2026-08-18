import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import NoteUploadForm from '@/components/NoteUploadForm';
import AnalysisForm from '@/components/AnalysisForm';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatTimestamp } from '@/lib/format';
import { paperLabel } from '@/lib/constants';
import type { NewspaperAnalysis, Note } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin dashboard',
    robots: { index: false, follow: false },
};

export default async function DashboardPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/admin/login?next=/admin/dashboard');

    const { data: adminRow } = await supabase
        .from('admins')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

    if (!adminRow) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-12">
                <h1 className="text-xl font-bold">Not an admin yet</h1>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                    You are signed in as <strong>{user.email}</strong>, but this account is
                    not on the admin allow-list, so Supabase will reject any write. Run this
                    once in the Supabase SQL editor:
                </p>
                <pre className="mt-4 overflow-x-auto rounded-lg bg-ink-900 p-4 text-xs text-white">
                    {`insert into public.admins (id) values ('${user.id}');`}
                </pre>
                <form action="/auth/signout" method="post" className="mt-6">
                    <button
                        type="submit"
                        className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100"
                    >
                        Sign out
                    </button>
                </form>
            </main>
        );
    }

    const [notesRes, analysisRes] = await Promise.all([
        supabase
            .from('notes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(8),
        supabase
            .from('newspaper_analysis')
            .select('*')
            .order('date', { ascending: false })
            .limit(8),
    ]);

    const notes = (notesRes.data ?? []) as Note[];
    const analyses = (analysisRes.data ?? []) as NewspaperAnalysis[];

    return (
        <main className="mx-auto max-w-5xl px-4 py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Admin dashboard</h1>
                    <p className="mt-1 text-sm text-ink-600">
                        Signed in as {user.email}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/"
                        className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100"
                    >
                        View site
                    </Link>
                    <form action="/auth/signout" method="post">
                        <button
                            type="submit"
                            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100"
                        >
                            Sign out
                        </button>
                    </form>
                </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <NoteUploadForm />
                <AnalysisForm />
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
                <RecentPanel title="Recent notes">
                    {notes.length ? (
                        notes.map((note) => (
                            <RecentRow
                                key={note.id}
                                primary={note.title}
                                secondary={`${paperLabel(note.gs_paper)}${
                                    note.topic ? ` · ${note.topic}` : ''
                                }`}
                                meta={formatTimestamp(note.created_at)}
                                href={note.download_url}
                            />
                        ))
                    ) : (
                        <EmptyRow>No notes yet.</EmptyRow>
                    )}
                </RecentPanel>

                <RecentPanel title="Recent analysis">
                    {analyses.length ? (
                        analyses.map((item) => (
                            <RecentRow
                                key={item.id}
                                primary={item.title}
                                secondary={item.syllabus_mapping ?? '—'}
                                meta={formatDate(item.date)}
                                href={`/analysis/${item.id}`}
                            />
                        ))
                    ) : (
                        <EmptyRow>No analysis yet.</EmptyRow>
                    )}
                </RecentPanel>
            </div>
        </main>
    );
}

function RecentPanel({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="mb-3 text-base font-bold">{title}</h2>
            <ul className="divide-y divide-ink-100">{children}</ul>
        </section>
    );
}

function RecentRow({
    primary,
    secondary,
    meta,
    href,
}: {
    primary: string;
    secondary: string;
    meta: string;
    href: string;
}) {
    return (
        <li className="py-2.5">
            <a
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="block hover:text-brand-600"
            >
                <p className="text-sm font-semibold leading-snug">{primary}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                    {secondary} · {meta}
                </p>
            </a>
        </li>
    );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
    return <li className="py-3 text-sm text-ink-400">{children}</li>;
}
