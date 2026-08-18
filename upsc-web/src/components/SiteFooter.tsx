import Link from 'next/link';

export default function SiteFooter() {
    return (
        <footer className="mt-16 border-t border-ink-200 bg-white">
            <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-ink-400 sm:flex-row sm:items-center sm:justify-between">
                <p>Free study material for UPSC and State Civil Services aspirants.</p>
                <Link href="/admin/dashboard" className="hover:text-ink-600">
                    Admin
                </Link>
            </div>
        </footer>
    );
}
