import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import { GS_PAPERS } from '@/lib/constants';
import { SITE_URL } from '@/lib/site';

// Must be a literal: Next statically analyses segment config exports.
// Keep in step with REVALIDATE_SECONDS in lib/site.ts.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const supabase = createPublicClient();

    const staticEntries: MetadataRoute.Sitemap = [
        { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
        { url: `${SITE_URL}/analysis`, changeFrequency: 'daily', priority: 0.9 },
        { url: `${SITE_URL}/notes`, changeFrequency: 'weekly', priority: 0.8 },
    ];

    // One entry per paper filter — these are the landing pages an aspirant
    // actually searches for ("UPSC GS2 notes").
    const paperEntries: MetadataRoute.Sitemap = GS_PAPERS.map((paper) => ({
        url: `${SITE_URL}/notes?paper=${paper.code}`,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
    }));

    try {
        const [analysisRes, subtopicRes] = await Promise.all([
            supabase
                .from('newspaper_analysis')
                .select('id, date, created_at')
                .order('date', { ascending: false })
                .limit(1000),
            supabase.from('subtopics').select('gs_paper, code'),
        ]);

        const analysisEntries: MetadataRoute.Sitemap = (analysisRes.data ?? []).map(
            (row: { id: string; date: string; created_at: string }) => ({
                url: `${SITE_URL}/analysis/${row.id}`,
                lastModified: new Date(row.created_at),
                changeFrequency: 'monthly' as const,
                priority: 0.8,
            }),
        );

        const subtopicEntries: MetadataRoute.Sitemap = (
            subtopicRes.data ?? []
        ).map((row: { gs_paper: string; code: string }) => ({
            url: `${SITE_URL}/notes?paper=${row.gs_paper}&sub=${row.code}`,
            changeFrequency: 'weekly' as const,
            priority: 0.6,
        }));

        return [
            ...staticEntries,
            ...paperEntries,
            ...subtopicEntries,
            ...analysisEntries,
        ];
    } catch {
        // Never fail the build or the route over a database hiccup.
        return [...staticEntries, ...paperEntries];
    }
}
