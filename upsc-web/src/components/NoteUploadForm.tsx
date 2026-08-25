'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GS_PAPERS, STORAGE_BUCKET } from '@/lib/constants';
import type { Subtopic } from '@/lib/types';

type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string };

/** Turns "Polity Handout v2.pdf" into "polity-handout-v2.pdf". */
function slugFileName(name: string): string {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot).toLowerCase() : '.pdf';
    const slug =
        base
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'note';
    return `${slug}${ext}`;
}

export default function NoteUploadForm() {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement>(null);
    const [status, setStatus] = useState<Status>({ kind: 'idle' });
    const [subtopics, setSubtopics] = useState<Subtopic[]>([]);
    const [paper, setPaper] = useState<string>('GS1');

    useEffect(() => {
        let cancelled = false;
        createClient()
            .from('subtopics')
            .select('gs_paper, code, label, sort_order')
            .order('sort_order', { ascending: true })
            .then(({ data }) => {
                if (!cancelled && data) setSubtopics(data as Subtopic[]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const paperSubtopics = subtopics.filter((s) => s.gs_paper === paper);

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);

        const title = String(data.get('title') ?? '').trim();
        const description = String(data.get('description') ?? '').trim();
        const gsPaper = String(data.get('gs_paper') ?? '');
        const topic = String(data.get('topic') ?? '').trim();
        const subtopic = String(data.get('subtopic') ?? '');
        const file = data.get('file');

        if (!(file instanceof File) || file.size === 0) {
            setStatus({ kind: 'error', message: 'Choose a PDF to upload.' });
            return;
        }
        if (file.type && file.type !== 'application/pdf') {
            setStatus({ kind: 'error', message: 'Only PDF files are accepted.' });
            return;
        }

        setStatus({ kind: 'busy', message: 'Uploading…' });
        const supabase = createClient();

        // Prefix with the paper + a timestamp so re-uploads never collide.
        const path = `${gsPaper}/${Date.now()}-${slugFileName(file.name)}`;

        const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(path, file, { contentType: 'application/pdf', upsert: false });

        if (uploadError) {
            setStatus({ kind: 'error', message: `Upload failed: ${uploadError.message}` });
            return;
        }

        const {
            data: { publicUrl },
        } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

        const { error: insertError } = await supabase.from('notes').insert({
            title,
            description: description || null,
            gs_paper: gsPaper,
            subtopic: subtopic || null,
            topic: topic || null,
            download_url: publicUrl,
            storage_path: path,
        });

        if (insertError) {
            // Don't leave an orphan file behind if the row could not be written.
            await supabase.storage.from(STORAGE_BUCKET).remove([path]);
            setStatus({ kind: 'error', message: `Save failed: ${insertError.message}` });
            return;
        }

        formRef.current?.reset();
        setPaper('GS1');
        setStatus({ kind: 'ok', message: `“${title}” published.` });
        router.refresh();
    }

    const busy = status.kind === 'busy';

    return (
        <form
            ref={formRef}
            onSubmit={onSubmit}
            className="rounded-2xl border border-ink-200 bg-white p-5 sm:p-6"
        >
            <h2 className="text-lg font-bold">Upload PDF notes</h2>
            <p className="mt-1 text-sm text-ink-600">
                Goes straight into the public notes feed.
            </p>

            <div className="mt-5 grid gap-4">
                <Field label="Title" htmlFor="note-title">
                    <input
                        id="note-title"
                        name="title"
                        required
                        maxLength={200}
                        placeholder="Indian Polity — Fundamental Rights"
                        className={inputClass}
                    />
                </Field>

                <Field label="Description" htmlFor="note-description" optional>
                    <textarea
                        id="note-description"
                        name="description"
                        rows={3}
                        maxLength={600}
                        placeholder="What the note covers, and who it is for."
                        className={inputClass}
                    />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="GS Paper" htmlFor="note-paper">
                        <select
                            id="note-paper"
                            name="gs_paper"
                            required
                            value={paper}
                            onChange={(e) => setPaper(e.target.value)}
                            className={inputClass}
                        >
                            {GS_PAPERS.map((paper) => (
                                <option key={paper.code} value={paper.code}>
                                    {paper.label}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Topic tag" htmlFor="note-topic" optional>
                        <input
                            id="note-topic"
                            name="topic"
                            maxLength={80}
                            placeholder="Constitution"
                            className={inputClass}
                        />
                    </Field>
                </div>

                {paperSubtopics.length ? (
                    <Field label="Sub-topic" htmlFor="note-subtopic" optional>
                        <select
                            id="note-subtopic"
                            name="subtopic"
                            defaultValue=""
                            key={paper}
                            className={inputClass}
                        >
                            <option value="">— none —</option>
                            {paperSubtopics.map((sub) => (
                                <option key={sub.code} value={sub.code}>
                                    {sub.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                ) : null}

                <Field label="PDF file" htmlFor="note-file">
                    <input
                        id="note-file"
                        name="file"
                        type="file"
                        accept="application/pdf,.pdf"
                        required
                        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink-800"
                    />
                </Field>
            </div>

            <button type="submit" disabled={busy} className={buttonClass}>
                {busy ? 'Uploading…' : 'Publish note'}
            </button>

            <StatusLine status={status} />
        </form>
    );
}

const inputClass =
    'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

const buttonClass =
    'mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';

function Field({
    label,
    htmlFor,
    optional,
    children,
}: {
    label: string;
    htmlFor: string;
    optional?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label
                htmlFor={htmlFor}
                className="mb-1.5 block text-sm font-semibold text-ink-800"
            >
                {label}
                {optional ? (
                    <span className="ml-1 font-normal text-ink-400">(optional)</span>
                ) : null}
            </label>
            {children}
        </div>
    );
}

function StatusLine({ status }: { status: Status }) {
    if (status.kind === 'idle' || !status.message) return null;
    const tone =
        status.kind === 'error'
            ? 'border-red-300 bg-red-50 text-red-800'
            : status.kind === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-ink-200 bg-ink-100 text-ink-600';
    return (
        <p
            role="status"
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${tone}`}
        >
            {status.message}
        </p>
    );
}

export { Field, StatusLine, inputClass, buttonClass };
export type { Status };
