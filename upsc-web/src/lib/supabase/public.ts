import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Anon client with no cookie access.
 *
 * The cookie-based server client calls `cookies()`, which opts a route out of
 * static rendering. Public pages read nothing user-specific, so they use this
 * instead and can then be statically generated and revalidated on a timer —
 * which is what makes them cheap to serve and friendly to search crawlers.
 */
export function createPublicClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
}
