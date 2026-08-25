import Link from 'next/link';

const NAV = [
    { href: '/', short: 'Home', full: 'Home' },
    { href: '/analysis', short: 'Analysis', full: 'Daily Analysis' },
    { href: '/notes', short: 'Notes', full: 'GS Notes' },
];

export default function SiteHeader() {
    return (
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
                <Link href="/" className="flex shrink-0 items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                        PD
                    </span>
                    <span className="whitespace-nowrap text-base font-bold tracking-tight sm:text-lg">
                        Prep Desk
                    </span>
                </Link>

                <nav className="flex items-center gap-0.5 text-sm font-medium sm:gap-2">
                    {NAV.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="whitespace-nowrap rounded-lg px-2 py-1.5 text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 sm:px-3"
                        >
                            <span className="sm:hidden">{item.short}</span>
                            <span className="hidden sm:inline">{item.full}</span>
                        </Link>
                    ))}
                </nav>
            </div>
        </header>
    );
}
