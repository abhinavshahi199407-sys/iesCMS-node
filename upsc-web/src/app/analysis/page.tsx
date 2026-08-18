import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import AnalysisCard from '@/components/AnalysisCard';
import { createClient } from '@/lib/supabase/server';
import type { NewspaperAnalysis } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Daily Newspaper Analysis',
    description:
        'Syllabus-mapped daily newspaper and editorial analysis for UPSC and State PSC aspirants.',
};

export default async function AnalysisListPage() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('newspaper_analysis')
        .select('*')
        .order('date', { ascending: false })
        .limit(60);

    const items = (data ?? []) as NewspaperAnalysis[];

    return (
        <>
            <SiteHeader />

            <main className="mx-auto max-w-5xl px-4 py-8">
                <h1 className="text-2xl font-bold sm:text-3xl">
                    Daily Newspaper Analysis
                </h1>
                <p className="mt-1 text-sm text-ink-600">
                    Editorials and current affairs, mapped to the syllabus.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {error ? (
                        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-2">
                            Could not load analysis: {error.message}
                        </p>
                    ) : items.length ? (
                        items.map((item) => <AnalysisCard key={item.id} item={item} />)
                    ) : (
                        <p className="rounded-xl border border-dashed border-ink-200 bg-white px-4 py-10 text-center text-sm text-ink-400 sm:col-span-2">
                            No analysis published yet.
                        </p>
                    )}
                </div>
            </main>

            <SiteFooter />
        </>
    );
}
