'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { inputClass } from './NoteUploadForm';

export default function LoginForm({ next }: { next: string }) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setError(null);

        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: String(data.get('email') ?? ''),
            password: String(data.get('password') ?? ''),
        });

        if (signInError) {
            setError(signInError.message);
            setBusy(false);
            return;
        }

        router.replace(next);
        router.refresh();
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-4">
            <div>
                <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-semibold text-ink-800"
                >
                    Email
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className={inputClass}
                />
            </div>

            <div>
                <label
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-semibold text-ink-800"
                >
                    Password
                </label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className={inputClass}
                />
            </div>

            {error ? (
                <p
                    role="alert"
                    className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                    {error}
                </p>
            ) : null}

            <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {busy ? 'Signing in…' : 'Sign in'}
            </button>
        </form>
    );
}
