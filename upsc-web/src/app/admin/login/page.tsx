import type { Metadata } from 'next';
import Link from 'next/link';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Admin sign in',
    robots: { index: false, follow: false },
};

type SearchParams = Promise<{ next?: string }>;

export default async function LoginPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const { next } = await searchParams;
    // Only allow same-site redirects back into the admin area.
    const target = next?.startsWith('/admin') ? next : '/admin/dashboard';

    return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
            <Link href="/" className="mb-6 text-sm font-semibold text-brand-600">
                ← Back to site
            </Link>

            <div className="rounded-2xl border border-ink-200 bg-white p-6">
                <h1 className="text-xl font-bold">Admin sign in</h1>
                <p className="mt-1 mb-5 text-sm text-ink-600">
                    Publishing access for the notes and daily analysis feeds.
                </p>
                <LoginForm next={target} />
            </div>
        </main>
    );
}
