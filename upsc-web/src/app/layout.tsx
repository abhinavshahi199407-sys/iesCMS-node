import type { Metadata } from 'next';
import './globals.css';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
    // Lets every page express canonical/OG URLs as plain paths.
    metadataBase: new URL(SITE_URL),
    title: {
        default: `${SITE_NAME} — UPSC & State Civil Services`,
        template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: [
        'UPSC',
        'civil services',
        'daily newspaper analysis',
        'editorial analysis',
        'GS notes',
        'State PSC',
        'IAS preparation',
    ],
    openGraph: {
        type: 'website',
        siteName: SITE_NAME,
        title: `${SITE_NAME} — UPSC & State Civil Services`,
        description: SITE_DESCRIPTION,
        locale: 'en_IN',
        url: SITE_URL,
    },
    twitter: {
        card: 'summary_large_image',
        title: `${SITE_NAME} — UPSC & State Civil Services`,
        description: SITE_DESCRIPTION,
    },
    robots: { index: true, follow: true },
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en-IN">
            <body className="min-h-screen antialiased">{children}</body>
        </html>
    );
}
