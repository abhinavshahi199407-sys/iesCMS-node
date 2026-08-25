import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next 16 proxy convention (formerly middleware.ts). Runs on every request
 * matched below: refreshes the Supabase auth cookie and gates /admin.
 */
export default async function proxy(request: NextRequest) {
    return updateSession(request);
}

export const config = {
    matcher: [
        /*
         * Everything except Next internals and static assets — the session
         * cookie has to be refreshed on normal page requests.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)',
    ],
};
