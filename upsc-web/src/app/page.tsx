import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import AnalysisCard from '@/components/AnalysisCard';
import NoteCard from '@/components/NoteCard';
import { createPublicClient } from '@/lib/supabase/public';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/site';
import { GS_PAPERS } from '@/lib/constants';
import { fetchSubtopics, labelMap } from '@/lib/subtopics';
import type { NewspaperAnalysis, Note } from '@/lib/types';

// Statically rendered, re-checked on a timer: fast for readers, cheap to serve
// and crawlable, while new content still appears within the window.
// Must be a literal: Next statically analyses segment config exports.
// Keep in step with REVALIDATE_SECONDS in lib/site.ts.
export const revalidate = 300;

export const metadata = {
    alternates: { canonical: absoluteUrl('/') },
};

export default async function HomePage() {
    const supabase = createPublicClient();

    const [analysisRes, notesRes] = await Promise.all([
        supabase
            .from('newspaper_analysis')
            .select('*')
            .order('date', { ascending: false })
            .limit(4),
        supabase
            .from('notes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(6),
    ]);

    const analyses = (analysisRes.data ?? []) as NewspaperAnalysis[];
    const notes = (notesRes.data ?? []) as Note[];
    const labels = labelMap(await fetchSubtopics(supabase));
    const loadError = analysisRes.error ?? notesRes.error;

    const websiteSchema = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        inLanguage: 'en-IN',
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
            />
            <SiteHeader />

            <main className="mx-auto max-w-5xl px-4 py-8">
                <section className="rounded-2xl bg-ink-900 px-5 py-8 text-white sm:px-8 sm:py-10">
                    <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
                        Daily newspaper analysis and free GS notes
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-200 sm:text-base">
                        Syllabus-mapped editorial analysis every morning, plus downloadable
                        PDF notes for GS Paper 1–4 and State PSC exams. Built to read on a
                        phone.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <Link
                            href="/analysis"
                            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-ink-100"
                        >
                            Read today&apos;s analysis
                        </Link>
                        <Link
                            href="/notes"
                            className="rounded-lg border border-ink-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800"
                        >
                            Browse notes
                        </Link>
                    </div>
                </section>

                {loadError ? (
                    <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Could not load content: {loadError.message}. Check that the Supabase
                        schema has been applied and the API keys in <code>.env.local</code>{' '}
                        are correct.
                    </p>
                ) : null}

                <section className="mt-10">
                    <div className="mb-4 flex items-baseline justify-between gap-3">
                        <h2 className="text-lg font-bold sm:text-xl">
                            Daily Newspaper Analysis
                        </h2>
                        <Link
                            href="/analysis"
                            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                        >
                            View all →
                        </Link>
                    </div>

                    {analyses.length ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            {analyses.map((item) => (
                                <AnalysisCard key={item.id} item={item} />
                            ))}
                        </div>
                    ) : (
                        <EmptyState message="No analysis published yet." />
                    )}
                </section>

                <section className="mt-12">
                    <div className="mb-4 flex items-baseline justify-between gap-3">
                        <h2 className="text-lg font-bold sm:text-xl">Latest GS Notes</h2>
                        <Link
                            href="/notes"
                            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                        >
                            View all →
                        </Link>
                    </div>

                    {notes.length ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {notes.map((note) => (
                                <NoteCard
                                    key={note.id}
                                    note={note}
                                    subtopicLabel={
                                        note.subtopic
                                            ? labels[`${note.gs_paper}:${note.subtopic}`]
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState message="No notes uploaded yet." />
                    )}
                </section>

                <section className="mt-12">
                    <h2 className="mb-4 text-lg font-bold sm:text-xl">Jump to a paper</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {GS_PAPERS.map((paper) => (
                            <Link
                                key={paper.code}
                                href={`/notes?paper=${paper.code}`}
                                className="rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-sm"
                            >
                                <p className="font-semibold">{paper.label}</p>
                                <p className="mt-0.5 text-sm text-ink-600">{paper.blurb}</p>
                            </Link>
                        ))}
                    </div>
                </section>
            </main>

            <SiteFooter />
        </>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <p className="rounded-xl border border-dashed border-ink-200 bg-white px-4 py-8 text-center text-sm text-ink-400">
            {message}
        </p>
    );
}
