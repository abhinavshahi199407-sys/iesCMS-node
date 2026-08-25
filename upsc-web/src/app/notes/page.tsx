import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import FilterSidebar from '@/components/FilterSidebar';
import NoteCard from '@/components/NoteCard';
import { createPublicClient } from '@/lib/supabase/public';
import { absoluteUrl } from '@/lib/site';
import { GS_PAPER_CODES, paperLabel } from '@/lib/constants';
import { fetchSubtopics, labelMap } from '@/lib/subtopics';
import type { Note } from '@/lib/types';

// Reads searchParams, so this route is request-rendered by nature. The data
// query is cheap and the SEO-valuable pages are the analysis articles.
export const dynamic = 'force-dynamic';

/**
 * Each paper and sub-topic filter is a page someone actually searches for
 * ("UPSC GS2 notes"), so each is self-canonical with its own title and
 * description. A `q=` search is a different matter — those are unbounded and
 * thin, so they are canonicalised back to the filter and left out of the index.
 */
export async function generateMetadata({
    searchParams,
}: {
    searchParams: SearchParams;
}): Promise<Metadata> {
    const { paper, sub, q } = await searchParams;
    const activePaper = paper && GS_PAPER_CODES.includes(paper) ? paper : undefined;

    let activeSub: string | undefined;
    let subLabel: string | undefined;
    if (activePaper && sub) {
        const match = (await fetchSubtopics(createPublicClient())).find(
            (s) => s.gs_paper === activePaper && s.code === sub,
        );
        if (match) {
            activeSub = match.code;
            subLabel = match.label;
        }
    }

    const path = activeSub
        ? `/notes?paper=${activePaper}&sub=${activeSub}`
        : activePaper
          ? `/notes?paper=${activePaper}`
          : '/notes';

    const title = subLabel
        ? `${subLabel} — ${paperLabel(activePaper!)} Notes`
        : activePaper
          ? `${paperLabel(activePaper)} Notes`
          : 'GS Notes';

    const description = subLabel
        ? `Free downloadable ${subLabel} notes for ${paperLabel(activePaper!)}, for UPSC and State Civil Services aspirants.`
        : activePaper
          ? `Free downloadable ${paperLabel(activePaper)} notes for UPSC and State Civil Services aspirants.`
          : 'Downloadable GS1–GS4 and State PSC notes for civil services aspirants.';

    return {
        title,
        description,
        alternates: { canonical: absoluteUrl(path) },
        openGraph: { title, description, url: absoluteUrl(path) },
        // Search-result permutations are endless; keep them out of the index.
        robots: q ? { index: false, follow: true } : { index: true, follow: true },
    };
}

type SearchParams = Promise<{ paper?: string; sub?: string; q?: string }>;

export default async function NotesPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const { paper, sub, q } = await searchParams;
    const activePaper = paper && GS_PAPER_CODES.includes(paper) ? paper : undefined;
    const query = q?.trim() || undefined;

    const supabase = createPublicClient();
    const subtopics = await fetchSubtopics(supabase);

    // A sub-topic only means anything within its own paper.
    const activeSub =
        activePaper && sub && subtopics.some((s) => s.gs_paper === activePaper && s.code === sub)
            ? sub
            : undefined;

    let request = supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

    if (activePaper) request = request.eq('gs_paper', activePaper);
    if (activeSub) request = request.eq('subtopic', activeSub);
    if (query) {
        const safe = query.replace(/[%,()]/g, ' ');
        request = request.or(`title.ilike.%${safe}%,topic.ilike.%${safe}%`);
    }

    const [{ data, error }, countsRes] = await Promise.all([
        request,
        supabase.from('notes').select('gs_paper, subtopic'),
    ]);

    const notes = (data ?? []) as Note[];
    const allRows = (countsRes.data ?? []) as {
        gs_paper: string;
        subtopic: string | null;
    }[];

    const counts: Record<string, number> = {};
    const subCounts: Record<string, number> = {};
    for (const row of allRows) {
        counts[row.gs_paper] = (counts[row.gs_paper] ?? 0) + 1;
        if (activePaper && row.gs_paper === activePaper && row.subtopic) {
            subCounts[row.subtopic] = (subCounts[row.subtopic] ?? 0) + 1;
        }
    }

    const labels = labelMap(subtopics);
    const heading = activeSub
        ? labels[`${activePaper}:${activeSub}`]
        : activePaper
          ? paperLabel(activePaper)
          : 'All GS Notes';

    return (
        <>
            <SiteHeader />

            <main className="mx-auto max-w-5xl px-4 py-8">
                {activeSub ? (
                    <p className="text-sm font-semibold text-brand-600">
                        {paperLabel(activePaper!)}
                    </p>
                ) : null}
                <h1 className="text-2xl font-bold sm:text-3xl">{heading}</h1>
                <p className="mt-1 text-sm text-ink-600">
                    {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                    {query ? ` matching “${query}”` : ''}
                </p>

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:gap-8">
                    <FilterSidebar
                        active={activePaper}
                        activeSub={activeSub}
                        query={query}
                        counts={counts}
                        subCounts={subCounts}
                        subtopics={subtopics}
                    />

                    <div className="min-w-0 flex-1">
                        {error ? (
                            <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                Could not load notes: {error.message}
                            </p>
                        ) : notes.length ? (
                            <div className="grid gap-4 sm:grid-cols-2">
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
                            <p className="rounded-xl border border-dashed border-ink-200 bg-white px-4 py-10 text-center text-sm text-ink-400">
                                Nothing here yet. Try another paper or clear the search.
                            </p>
                        )}
                    </div>
                </div>
            </main>

            <SiteFooter />
        </>
    );
}
