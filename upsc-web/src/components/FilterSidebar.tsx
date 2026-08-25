import Link from 'next/link';
import { GS_PAPERS } from '@/lib/constants';
import type { Subtopic } from '@/lib/types';

type Props = {
    active?: string;
    activeSub?: string;
    query?: string;
    counts?: Record<string, number>;
    subCounts?: Record<string, number>;
    subtopics?: Subtopic[];
};

function href(paper: string | null, sub: string | null, query?: string) {
    const params = new URLSearchParams();
    if (paper) params.set('paper', paper);
    if (sub) params.set('sub', sub);
    if (query) params.set('q', query);
    const qs = params.toString();
    return qs ? `/notes?${qs}` : '/notes';
}

export default function FilterSidebar({
    active,
    activeSub,
    query,
    counts,
    subCounts,
    subtopics = [],
}: Props) {
    const papers = [
        { code: '', label: 'All notes', blurb: 'Everything uploaded so far' },
        ...GS_PAPERS,
    ];

    // Second level only exists once a paper is chosen and that paper has any.
    const subs = active ? subtopics.filter((s) => s.gs_paper === active) : [];

    return (
        <aside className="lg:w-64 lg:shrink-0">
            <form action="/notes" method="get" className="mb-4">
                {active ? <input type="hidden" name="paper" value={active} /> : null}
                {activeSub ? <input type="hidden" name="sub" value={activeSub} /> : null}
                <label htmlFor="q" className="sr-only">
                    Search notes
                </label>
                <input
                    id="q"
                    name="q"
                    type="search"
                    defaultValue={query ?? ''}
                    placeholder="Search title or topic…"
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
            </form>

            {/* Horizontal chips on phones, vertical list from lg up */}
            <nav
                aria-label="Filter by paper"
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
            >
                {papers.map((paper) => {
                    const isActive = (active ?? '') === paper.code;
                    const count = paper.code ? counts?.[paper.code] : undefined;
                    return (
                        <Link
                            key={paper.code || 'all'}
                            // Changing paper clears the sub-topic: codes are per-paper.
                            href={href(paper.code || null, null, query)}
                            aria-current={isActive ? 'page' : undefined}
                            className={[
                                'shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition lg:shrink',
                                isActive
                                    ? 'border-brand-600 bg-brand-600 text-white'
                                    : 'border-ink-200 bg-white text-ink-600 hover:border-brand-500 hover:text-ink-900',
                            ].join(' ')}
                        >
                            <span className="flex items-center gap-2 whitespace-nowrap lg:justify-between">
                                <span>{paper.code || 'All'}</span>
                                {count !== undefined ? (
                                    <span
                                        className={
                                            isActive
                                                ? 'text-xs text-brand-100'
                                                : 'text-xs text-ink-400'
                                        }
                                    >
                                        {count}
                                    </span>
                                ) : null}
                            </span>
                            <span
                                className={[
                                    'mt-0.5 hidden text-xs lg:block',
                                    isActive ? 'text-brand-100' : 'text-ink-400',
                                ].join(' ')}
                            >
                                {paper.blurb}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            {subs.length ? (
                <div className="mt-5">
                    <h2 className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                        Narrow down
                    </h2>
                    <nav
                        aria-label="Filter by sub-topic"
                        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0"
                    >
                        <Link
                            href={href(active ?? null, null, query)}
                            aria-current={!activeSub ? 'page' : undefined}
                            className={[
                                'shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition lg:shrink',
                                !activeSub
                                    ? 'bg-brand-50 font-semibold text-brand-700'
                                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                            ].join(' ')}
                        >
                            All of {active}
                        </Link>

                        {subs.map((sub) => {
                            const isActive = activeSub === sub.code;
                            const count = subCounts?.[sub.code];
                            return (
                                <Link
                                    key={sub.code}
                                    href={href(active ?? null, sub.code, query)}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={[
                                        'flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition lg:shrink lg:whitespace-normal',
                                        isActive
                                            ? 'bg-brand-50 font-semibold text-brand-700'
                                            : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                                    ].join(' ')}
                                >
                                    <span>{sub.label}</span>
                                    {count ? (
                                        <span className="text-xs text-ink-400">{count}</span>
                                    ) : null}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            ) : null}
        </aside>
    );
}
