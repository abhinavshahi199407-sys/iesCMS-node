export type Note = {
    id: string;
    title: string;
    description: string | null;
    gs_paper: string;
    topic: string | null;
    subtopic: string | null;
    download_url: string;
    storage_path: string | null;
    created_at: string;
};

export type NewspaperAnalysis = {
    id: string;
    date: string;
    title: string;
    content: string;
    syllabus_mapping: string | null;
    created_at: string;
};

export type Subtopic = {
    gs_paper: string;
    code: string;
    label: string;
    sort_order: number;
};
