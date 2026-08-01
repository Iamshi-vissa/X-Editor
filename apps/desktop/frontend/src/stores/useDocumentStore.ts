import { create } from "zustand";
import type { DocumentState } from "../types";
import { ipc } from "../services/ipc";

export function detectLanguageFromPath(path: string): string {
    if (!path) return "javascript";
    const filename = path.split(/[\/\\]/).pop() || "";
    const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() || "" : filename.toLowerCase();

    switch (ext) {
        case "js": case "mjs": case "cjs": case "jsx":
            return "javascript";
        case "ts": case "tsx":
            return "typescript";
        case "rs":
            return "rust";
        case "py": case "pyw": case "pyi":
            return "python";
        case "c": case "h":
            return "c";
        case "cpp": case "cc": case "cxx": case "hpp": case "hh": case "hxx":
            return "cpp";
        case "cs":
            return "csharp";
        case "java":
            return "java";
        case "go":
            return "go";
        case "html": case "htm":
            return "html";
        case "css": case "scss": case "less":
            return "css";
        case "json": case "jsonc":
            return "json";
        case "md": case "markdown":
            return "markdown";
        case "xml": case "svg":
            return "xml";
        case "yaml": case "yml":
            return "yaml";
        case "toml":
            return "toml";
        case "sql":
            return "sql";
        case "sh": case "bash": case "zsh":
            return "shell";
        case "ps1": case "psm1":
            return "powershell";
        case "bat": case "cmd":
            return "bat";
        case "php":
            return "php";
        case "rb":
            return "ruby";
        case "ini": case "cfg": case "conf": case "godot":
            return "ini";
        default:
            return "javascript";
    }
}

interface DocumentStore {
    documents: DocumentState[];
    activeDocumentId: string | null;
    isSplitView: boolean;
    secondaryDocumentId: string | null;
    toggleSplitView: () => void;
    setSecondaryDocument: (id: string | null) => void;
    createNewDocument: (language?: string) => void;
    openDocument: (path: string, isPreview?: boolean) => Promise<void>;
    closeDocument: (id: string) => void;
    setActiveDocument: (id: string) => void;
    setDocumentLanguage: (id: string, language: string) => void;
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

    createNewDocument: (preferredLanguage?: string) => {
        const lang = preferredLanguage || "javascript";
        const ext = lang === "typescript" ? "ts" : lang === "rust" ? "rs" : lang === "python" ? "py" : lang === "cpp" ? "cpp" : lang === "html" ? "html" : lang === "css" ? "css" : lang === "json" ? "json" : "js";
        const name = `Untitled-${untitledCounter++}.${ext}`;
        const newDoc: DocumentState = {
            id: name,
            path: name,
            language: lang,
            content: "// Type your code here...\n",
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
            const detectedLang = detectLanguageFromPath(path);
            
            const newDoc: DocumentState = {
                id,
                path,
                language: detectedLang,
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
            const docIndex = state.documents.findIndex(d => d.id === id);
            const newDocs = state.documents.filter(d => d.id !== id);
            
            let nextActiveId = state.activeDocumentId;
            if (state.activeDocumentId === id) {
                if (newDocs.length > 0) {
                    const targetIndex = Math.max(0, Math.min(docIndex - 1, newDocs.length - 1));
                    nextActiveId = newDocs[targetIndex].id;
                } else {
                    nextActiveId = null;
                }
            }

            return {
                documents: newDocs,
                activeDocumentId: nextActiveId,
                secondaryDocumentId: state.secondaryDocumentId === id ? null : state.secondaryDocumentId
            };
        });
    },
    setActiveDocument: (id: string) => set({ activeDocumentId: id }),
    setDocumentLanguage: (id: string, language: string) => {
        set((state) => ({
            documents: state.documents.map(d => 
                d.id === id ? { ...d, language } : d
            )
        }));
    },
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
            const newLanguage = detectLanguageFromPath(savePath);
            set((state) => ({
                documents: state.documents.map(d => 
                    d.id === id ? { ...d, id: savePath, path: savePath, language: newLanguage, isDirty: false } : d
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
