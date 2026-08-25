import type { Subtopic } from './types';

type Queryable = {
    from: (table: string) => {
        select: (cols: string) => {
            order: (
                col: string,
                opts?: { ascending?: boolean },
            ) => PromiseLike<{ data: unknown }>;
        };
    };
};

/** All sub-topics, ordered for display. Small table — safe to fetch per page. */
export async function fetchSubtopics(supabase: Queryable): Promise<Subtopic[]> {
    const { data } = await supabase
        .from('subtopics')
        .select('gs_paper, code, label, sort_order')
        .order('sort_order', { ascending: true });
    return (data as Subtopic[] | null) ?? [];
}

/** "art-culture" -> "Indian Heritage & Culture", keyed per paper. */
export function labelMap(subtopics: Subtopic[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const s of subtopics) map[`${s.gs_paper}:${s.code}`] = s.label;
    return map;
}

export function forPaper(subtopics: Subtopic[], paper: string): Subtopic[] {
    return subtopics.filter((s) => s.gs_paper === paper);
}
