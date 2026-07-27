import { create } from "zustand";
import type { DocumentState } from "../types";
import { ipc } from "../services/ipc";

interface DocumentStore {
    documents: DocumentState[];
    activeDocumentId: string | null;
    isSplitView: boolean;
    secondaryDocumentId: string | null;
    toggleSplitView: () => void;
    setSecondaryDocument: (id: string | null) => void;
    createNewDocument: () => void;
    openDocument: (path: string, isPreview?: boolean) => Promise<void>;
    closeDocument: (id: string) => void;
    setActiveDocument: (id: string) => void;
    updateDocumentContent: (id: string, content: string) => void;
    saveDocument: (id: string) => Promise<void>;
    pinDocument: (id: string) => void;
}

let untitledCounter = 1;

export const useDocumentStore = create<DocumentStore>((set, get) => ({
    documents: [],
    activeDocumentId: null,
    isSplitView: false,
    secondaryDocumentId: null,

    toggleSplitView: () => set((state) => {
        const nextSplit = !state.isSplitView;
        let secondary = state.secondaryDocumentId;
        if (nextSplit && !secondary && state.documents.length > 1) {
            secondary = state.documents.find(d => d.id !== state.activeDocumentId)?.id || null;
        }
        return { isSplitView: nextSplit, secondaryDocumentId: secondary };
    }),

    setSecondaryDocument: (id) => set({ secondaryDocumentId: id }),

    createNewDocument: () => {
        const name = `Untitled-${untitledCounter++}.txt`;
        const newDoc: DocumentState = {
            id: name,
            path: name,
            language: "plaintext",
            content: "// Type your code or text here...\n",
            version: 1,
            isDirty: true,
            encoding: "utf-8",
            isPreview: false
        };
        set((state) => ({
            documents: [...state.documents, newDoc],
            activeDocumentId: name
        }));
    },

    openDocument: async (path: string, isPreview: boolean = true) => {
        const state = get();
        const existing = state.documents.find(d => d.path === path);
        
        if (existing) {
            if (state.isSplitView && state.activeDocumentId && state.activeDocumentId !== existing.id) {
                set({ secondaryDocumentId: existing.id });
            } else {
                set({ activeDocumentId: existing.id });
            }
            if (!isPreview && existing.isPreview) {
                get().pinDocument(existing.id);
            }
            return;
        }

        try {
            const content = await ipc.filesystem.readFile(path);
            const id = path;
            
            const newDoc: DocumentState = {
                id,
                path,
                language: 'typescript',
                content,
                version: 1,
                isDirty: false,
                encoding: 'utf-8',
                isPreview
            };

            set((currentState) => {
                let newDocs = [...currentState.documents];
                
                if (isPreview) {
                    const existingPreviewIndex = newDocs.findIndex(d => d.isPreview && !d.isDirty);
                    if (existingPreviewIndex !== -1) {
                        newDocs[existingPreviewIndex] = newDoc;
                        return { documents: newDocs, activeDocumentId: id };
                    }
                }
                
                return { documents: [...newDocs, newDoc], activeDocumentId: id };
            });
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
                    : state.activeDocumentId,
                secondaryDocumentId: state.secondaryDocumentId === id ? null : state.secondaryDocumentId
            };
        });
    },
    setActiveDocument: (id: string) => set({ activeDocumentId: id }),
    pinDocument: (id: string) => {
        set((state) => ({
            documents: state.documents.map(d => 
                d.id === id ? { ...d, isPreview: false } : d
            )
        }));
    },
    updateDocumentContent: (id: string, content: string) => {
        set((state) => ({
            documents: state.documents.map(d => 
                d.id === id ? { ...d, content, isDirty: true, isPreview: false, version: d.version + 1 } : d
            )
        }));
    },
    saveDocument: async (id: string) => {
        const doc = get().documents.find(d => d.id === id);
        if (!doc) return;

        let savePath = doc.path;

        if (doc.path.startsWith("Untitled-")) {
            try {
                const { save } = await import("@tauri-apps/plugin-dialog");
                const target = await save({ defaultPath: doc.path });
                if (!target || typeof target !== "string") return;
                savePath = target;
            } catch {
                const manualPath = prompt("Save file as (absolute path or filename):", doc.path);
                if (!manualPath) return;
                savePath = manualPath;
            }
        }

        try {
            await ipc.filesystem.writeFile(savePath, doc.content);
            set((state) => ({
                documents: state.documents.map(d => 
                    d.id === id ? { ...d, id: savePath, path: savePath, isDirty: false } : d
                ),
                activeDocumentId: state.activeDocumentId === id ? savePath : state.activeDocumentId,
                secondaryDocumentId: state.secondaryDocumentId === id ? savePath : state.secondaryDocumentId
            }));
        } catch (e) {
            console.error("Failed to save:", e);
            alert("Failed to save file: " + e);
        }
    }
}));
