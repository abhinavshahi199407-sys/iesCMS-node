import Link from 'next/link';
import { GS_PAPERS } from '@/lib/constants';

type Props = {
    active?: string;
    query?: string;
    counts?: Record<string, number>;
};

function href(paper: string | null, query?: string) {
    const params = new URLSearchParams();
    if (paper) params.set('paper', paper);
    if (query) params.set('q', query);
    const qs = params.toString();
    return qs ? `/notes?${qs}` : '/notes';
}

export default function FilterSidebar({ active, query, counts }: Props) {
    const all = [{ code: '', label: 'All notes', blurb: 'Everything uploaded so far' }, ...GS_PAPERS];

    return (
        <aside className="lg:w-64 lg:shrink-0">
            <form action="/notes" method="get" className="mb-4">
                {active ? <input type="hidden" name="paper" value={active} /> : null}
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
                {all.map((paper) => {
                    const isActive = (active ?? '') === paper.code;
                    const count = paper.code ? counts?.[paper.code] : undefined;
                    return (
                        <Link
                            key={paper.code || 'all'}
                            href={href(paper.code || null, query)}
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
                                            isActive ? 'text-xs text-brand-100' : 'text-xs text-ink-400'
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
        </aside>
    );
}
