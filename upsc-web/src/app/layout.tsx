import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: {
        default: 'Prep Desk — UPSC & State Civil Services',
        template: '%s · Prep Desk',
    },
    description:
        'Daily newspaper analysis and free GS1–GS4 and State PSC notes for UPSC and State Civil Services aspirants.',
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
        <html lang="en">
            <body className="min-h-screen antialiased">{children}</body>
        </html>
    );
}
