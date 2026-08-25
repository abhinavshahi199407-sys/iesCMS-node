import { paperLabel } from '@/lib/constants';
import { formatTimestamp } from '@/lib/format';
import type { Note } from '@/lib/types';

export default function NoteCard({
    note,
    subtopicLabel,
}: {
    note: Note;
    subtopicLabel?: string;
}) {
    return (
        <article className="flex h-full flex-col rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                    {paperLabel(note.gs_paper)}
                </span>
                {subtopicLabel ? (
                    <span className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-800">
                        {subtopicLabel}
                    </span>
                ) : null}
                {note.topic ? (
                    <span className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">
                        {note.topic}
                    </span>
                ) : null}
            </div>

            <h3 className="text-base font-semibold leading-snug">{note.title}</h3>

            {note.description ? (
                <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-600">
                    {note.description}
                </p>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-ink-400">
                    {formatTimestamp(note.created_at)}
                </span>
                <a
                    href={note.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                    Download PDF
                </a>
            </div>
        </article>
    );
}
