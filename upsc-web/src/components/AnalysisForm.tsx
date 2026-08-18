'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createClient } from '@/lib/supabase/client';
import { todayIso } from '@/lib/format';
import {
    Field,
    StatusLine,
    buttonClass,
    inputClass,
    type Status,
} from './NoteUploadForm';

export default function AnalysisForm() {
    const router = useRouter();
    const formRef = useRef<HTMLFormElement>(null);
    const [status, setStatus] = useState<Status>({ kind: 'idle' });
    const [content, setContent] = useState('');
    const [showPreview, setShowPreview] = useState(false);

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);

        const title = String(data.get('title') ?? '').trim();
        const date = String(data.get('date') ?? '');
        const syllabus = String(data.get('syllabus_mapping') ?? '').trim();
        const body = content.trim();

        if (!body) {
            setStatus({ kind: 'error', message: 'Write the analysis before publishing.' });
            return;
        }

        setStatus({ kind: 'busy', message: 'Publishing…' });

        const supabase = createClient();
        const { error } = await supabase.from('newspaper_analysis').insert({
            date,
            title,
            content: body,
            syllabus_mapping: syllabus || null,
        });

        if (error) {
            setStatus({ kind: 'error', message: `Save failed: ${error.message}` });
            return;
        }

        formRef.current?.reset();
        setContent('');
        setShowPreview(false);
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
            <h2 className="text-lg font-bold">Daily newspaper analysis</h2>
            <p className="mt-1 text-sm text-ink-600">Written in Markdown.</p>

            <div className="mt-5 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Date" htmlFor="analysis-date">
                        <input
                            id="analysis-date"
                            name="date"
                            type="date"
                            required
                            defaultValue={todayIso()}
                            className={inputClass}
                        />
                    </Field>

                    <Field label="Title" htmlFor="analysis-title">
                        <input
                            id="analysis-title"
                            name="title"
                            required
                            maxLength={200}
                            placeholder="The Hindu — 18 Aug"
                            className={inputClass}
                        />
                    </Field>
                </div>

                <Field label="Syllabus mapping" htmlFor="analysis-syllabus" optional>
                    <input
                        id="analysis-syllabus"
                        name="syllabus_mapping"
                        maxLength={300}
                        placeholder="GS2 — Governance; GS3 — Indian Economy"
                        className={inputClass}
                    />
                </Field>

                <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                        <label
                            htmlFor="analysis-content"
                            className="block text-sm font-semibold text-ink-800"
                        >
                            Analysis (Markdown)
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowPreview((v) => !v)}
                            className="rounded-md px-2 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
                        >
                            {showPreview ? 'Edit' : 'Preview'}
                        </button>
                    </div>

                    {showPreview ? (
                        <div className="prose-analysis min-h-[16rem] rounded-lg border border-ink-200 bg-ink-50 p-4 text-[15px] text-ink-800">
                            {content.trim() ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {content}
                                </ReactMarkdown>
                            ) : (
                                <p className="text-ink-400">Nothing to preview yet.</p>
                            )}
                        </div>
                    ) : (
                        <textarea
                            id="analysis-content"
                            name="content"
                            rows={14}
                            required
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder={'## Editorial 1 — Title\n\n**Context:** …\n\n- Point one\n- Point two\n\n> Prelims pointer: …'}
                            className={`${inputClass} font-mono text-[13px] leading-relaxed`}
                        />
                    )}
                </div>
            </div>

            <button type="submit" disabled={busy} className={buttonClass}>
                {busy ? 'Publishing…' : 'Publish analysis'}
            </button>

            <StatusLine status={status} />
        </form>
    );
}
