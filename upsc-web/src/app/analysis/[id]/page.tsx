import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { createPublicClient } from '@/lib/supabase/public';
import { formatDate } from '@/lib/format';
import { SITE_NAME, absoluteUrl } from '@/lib/site';
import type { NewspaperAnalysis } from '@/lib/types';

// Must be a literal: Next statically analyses segment config exports.
// Keep in step with REVALIDATE_SECONDS in lib/site.ts.
export const revalidate = 300;

// Analyses published after the last build still render on first request.
export const dynamicParams = true;

type Params = Promise<{ id: string }>;

/**
 * Pre-renders every analysis at build time. These are the long-form pages worth
 * indexing, so they should be static HTML rather than assembled per request.
 */
export async function generateStaticParams() {
    try {
        const { data } = await createPublicClient()
            .from('newspaper_analysis')
            .select('id')
            .order('date', { ascending: false })
            .limit(500);
        return (data ?? []).map((row: { id: string }) => ({ id: row.id }));
    } catch {
        // A build without database access still succeeds; pages render on demand.
        return [];
    }
}

async function getAnalysis(id: string): Promise<NewspaperAnalysis | null> {
    const { data } = await createPublicClient()
        .from('newspaper_analysis')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    return (data as NewspaperAnalysis | null) ?? null;
}

/** First ~155 characters of the body, stripped of Markdown, for meta tags. */
function summarise(markdown: string, max = 155): string {
    const plain = markdown
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\|.*$/gm, ' ')
        .replace(/[#>*_`~|-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain;
}

export async function generateMetadata({
    params,
}: {
    params: Params;
}): Promise<Metadata> {
    const { id } = await params;
    const item = await getAnalysis(id);
    if (!item) return { title: 'Analysis' };

    const description = item.syllabus_mapping
        ? `${summarise(item.content, 110)} · Syllabus: ${item.syllabus_mapping}`.slice(0, 300)
        : summarise(item.content);
    const url = absoluteUrl(`/analysis/${item.id}`);

    return {
        title: item.title,
        description,
        alternates: { canonical: url },
        openGraph: {
            type: 'article',
            title: item.title,
            description,
            url,
            siteName: SITE_NAME,
            publishedTime: new Date(`${item.date}T00:00:00Z`).toISOString(),
        },
        twitter: { card: 'summary_large_image', title: item.title, description },
    };
}

export default async function AnalysisDetailPage({ params }: { params: Params }) {
    const { id } = await params;
    const item = await getAnalysis(id);

    if (!item) notFound();

    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: item.title,
        description: summarise(item.content),
        datePublished: new Date(`${item.date}T00:00:00Z`).toISOString(),
        dateModified: new Date(item.created_at).toISOString(),
        inLanguage: 'en-IN',
        mainEntityOfPage: absoluteUrl(`/analysis/${item.id}`),
        publisher: { '@type': 'Organization', name: SITE_NAME },
        about: item.syllabus_mapping ?? undefined,
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
            />
            <SiteHeader />

            <main className="mx-auto max-w-3xl px-4 py-8">
                <Link
                    href="/analysis"
                    className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                    ← All analysis
                </Link>

                <article className="mt-4 rounded-2xl border border-ink-200 bg-white p-5 sm:p-8">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                        <time dateTime={item.date}>{formatDate(item.date)}</time>
                    </p>
                    <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
                        {item.title}
                    </h1>

                    {item.syllabus_mapping ? (
                        <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
                            <span className="font-semibold">Syllabus mapping: </span>
                            {item.syllabus_mapping}
                        </p>
                    ) : null}

                    <div className="prose-analysis mt-6 text-[15px] text-ink-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {item.content}
                        </ReactMarkdown>
                    </div>
                </article>
            </main>

            <SiteFooter />
        </>
    );
}
