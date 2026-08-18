import Link from 'next/link';
import { formatDate } from '@/lib/format';
import type { NewspaperAnalysis } from '@/lib/types';

/** First ~180 characters of the Markdown body, stripped of syntax. */
function excerpt(markdown: string, max = 180): string {
    const plain = markdown
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#>*_`~|-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain;
}

export default function AnalysisCard({ item }: { item: NewspaperAnalysis }) {
    return (
        <article className="h-full rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-sm">
            <Link href={`/analysis/${item.id}`} className="block">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {formatDate(item.date)}
                </p>
                <h3 className="mt-1 text-base font-semibold leading-snug">
                    {item.title}
                </h3>
                <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-600">
                    {excerpt(item.content)}
                </p>
                {item.syllabus_mapping ? (
                    <p className="mt-3 rounded-lg bg-ink-100 px-2.5 py-1.5 text-xs text-ink-600">
                        <span className="font-semibold">Syllabus: </span>
                        {item.syllabus_mapping}
                    </p>
                ) : null}
            </Link>
        </article>
    );
}
