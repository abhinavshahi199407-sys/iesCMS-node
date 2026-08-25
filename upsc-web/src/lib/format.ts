const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
});

/** Formats a `date` column ("2026-08-18") without shifting across time zones. */
export function formatDate(value: string): string {
    const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? value : DATE_FMT.format(d);
}

/** Formats a `timestamptz` column for display. */
export function formatTimestamp(value: string): string {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : DATE_FMT.format(d);
}

/** Today as YYYY-MM-DD, for date input defaults. */
export function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}
