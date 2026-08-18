import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import type { NewspaperAnalysis } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

async function getAnalysis(id: string): Promise<NewspaperAnalysis | null> {
    const supabase = await createClient();
    const { data } = await supabase
        .from('newspaper_analysis')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    return (data as NewspaperAnalysis | null) ?? null;
}

export async function generateMetadata({
    params,
}: {
    params: Params;
}): Promise<Metadata> {
    const { id } = await params;
    const item = await getAnalysis(id);
    return { title: item?.title ?? 'Analysis' };
}

export default async function AnalysisDetailPage({ params }: { params: Params }) {
    const { id } = await params;
    const item = await getAnalysis(id);

    if (!item) notFound();

    return (
        <>
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
                        {formatDate(item.date)}
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
