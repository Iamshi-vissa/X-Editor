export interface DocumentState {
    id: string;
    path: string;
    language: string;
    content: string;
    version: number;
    isDirty: boolean;
    encoding: string;
    isPreview?: boolean;
}
