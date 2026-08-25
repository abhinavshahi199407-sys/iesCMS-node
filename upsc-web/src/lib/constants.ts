export const GS_PAPERS = [
    { code: 'GS1', label: 'GS Paper 1', blurb: 'Heritage, Society, Geography' },
    { code: 'GS2', label: 'GS Paper 2', blurb: 'Polity, Governance, IR' },
    { code: 'GS3', label: 'GS Paper 3', blurb: 'Economy, Environment, Sci-Tech' },
    { code: 'GS4', label: 'GS Paper 4', blurb: 'Ethics, Integrity, Aptitude' },
    { code: 'State', label: 'State Exams', blurb: 'State PSC specific material' },
] as const;

export type GsPaper = (typeof GS_PAPERS)[number]['code'];

export const GS_PAPER_CODES = GS_PAPERS.map((p) => p.code) as readonly string[];

export function paperLabel(code: string): string {
    return GS_PAPERS.find((p) => p.code === code)?.label ?? code;
}

export const STORAGE_BUCKET = 'notes-pdfs';
