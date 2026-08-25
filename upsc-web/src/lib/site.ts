/**
 * Canonical origin for absolute URLs (sitemap, Open Graph, JSON-LD).
 * Vercel exposes VERCEL_PROJECT_PRODUCTION_URL; NEXT_PUBLIC_SITE_URL overrides
 * it once a custom domain is pointed at the site.
 */
export const SITE_URL = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000')
).replace(/\/+$/, '');

export const SITE_NAME = 'Prep Desk';

export const SITE_DESCRIPTION =
    'Daily newspaper analysis and free GS1–GS4 and State PSC notes for UPSC and State Civil Services aspirants.';

/** How often statically rendered public pages re-check the database. */
export const REVALIDATE_SECONDS = 300;

export function absoluteUrl(path: string): string {
    return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
