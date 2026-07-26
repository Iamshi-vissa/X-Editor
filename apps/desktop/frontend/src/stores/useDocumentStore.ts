import { create } from "zustand";
import type { DocumentState } from "../types";
import { ipc } from "../services/ipc";

interface DocumentStore {
    documents: DocumentState[];
    activeDocumentId: string | null;
    openDocument: (path: string) => Promise<void>;
    closeDocument: (id: string) => void;
    setActiveDocument: (id: string) => void;
    updateDocumentContent: (id: string, content: string) => void;
    saveDocument: (id: string) => Promise<void>;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
    documents: [],
    activeDocumentId: null,
    openDocument: async (path: string) => {
        const state = get();
        const existing = state.documents.find(d => d.path === path);
        if (existing) {
            set({ activeDocumentId: existing.id });
            return;
        }

        try {
            const content = await ipc.filesystem.readFile(path);
            const id = path; // Simplified ID mapping
            const newDoc: DocumentState = {
                id,
                path,
                language: 'typescript', // Simplified detection for Phase 1
                content,
                version: 1,
                isDirty: false,
                encoding: 'utf-8'
            };
            set({ documents: [...state.documents, newDoc], activeDocumentId: id });
        } catch (e) {
            console.error("Failed to open file:", e);
            alert("Failed to open file: " + e);
        }
    },
    closeDocument: (id: string) => {
        set((state) => {
            const newDocs = state.documents.filter(d => d.id !== id);
            return {
                documents: newDocs,
                activeDocumentId: state.activeDocumentId === id 
                    ? (newDocs.length > 0 ? newDocs[0].id : null) 
                    : state.activeDocumentId
            };
        });
    },
    setActiveDocument: (id: string) => set({ activeDocumentId: id }),
    updateDocumentContent: (id: string, content: string) => {
        set((state) => ({
            documents: state.documents.map(d => 
                d.id === id ? { ...d, content, isDirty: true, version: d.version + 1 } : d
            )
        }));
    },
    saveDocument: async (id: string) => {
        const doc = get().documents.find(d => d.id === id);
        if (!doc) return;
        try {
            await ipc.filesystem.writeFile(doc.path, doc.content);
            set((state) => ({
                documents: state.documents.map(d => 
                    d.id === id ? { ...d, isDirty: false } : d
                )
            }));
        } catch (e) {
            console.error("Failed to save:", e);
            alert("Failed to save file: " + e);
        }
    }
}));
