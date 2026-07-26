# -*- coding: utf-8 -*-
import os

directories = [
    'components/activity-bar',
    'components/explorer',
    'components/editor',
    'components/tabs',
    'components/status-bar',
    'components/layout',
    'features/workspace',
    'features/filesystem',
    'features/documents',
    'features/settings',
    'stores',
    'services/ipc',
    'adapters/monaco',
    'types',
    'hooks',
    'utils',
    'styles'
]

files = {
    'services/ipc/index.ts': '''import { invoke } from "@tauri-apps/api/core";

export interface DirectoryEntry {
    name: string;
    path: string;
    is_dir: boolean;
}

export interface AppSettings {
    theme: string;
}

export const ipc = {
    workspace: {
        select: async (path: string): Promise<void> => {
            return await invoke("workspace_select", { path });
        },
        get: async (): Promise<string | null> => {
            return await invoke("workspace_get");
        },
        listDirectory: async (path: string): Promise<DirectoryEntry[]> => {
            return await invoke("workspace_list_directory", { path });
        }
    },
    filesystem: {
        readFile: async (path: string): Promise<string> => {
            return await invoke("filesystem_read_file", { path });
        },
        writeFile: async (path: string, content: string): Promise<void> => {
            return await invoke("filesystem_write_file", { path, content });
        }
    },
    settings: {
        get: async (): Promise<AppSettings> => {
            return await invoke("settings_get");
        },
        update: async (theme: string): Promise<void> => {
            return await invoke("settings_update", { theme });
        }
    }
};
''',
    'types/index.ts': '''export interface DocumentState {
    id: string;
    path: string;
    language: string;
    content: string;
    version: number;
    isDirty: boolean;
    encoding: string;
}
''',
    'stores/useWorkspaceStore.ts': '''import { create } from "zustand";
import { ipc, DirectoryEntry } from "../services/ipc";

interface WorkspaceState {
    root: string | null;
    setRoot: (path: string | null) => void;
    selectWorkspace: (path: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
    root: null,
    setRoot: (path) => set({ root: path }),
    selectWorkspace: async (path: string) => {
        await ipc.workspace.select(path);
        set({ root: path });
    }
}));
''',
    'stores/useSettingsStore.ts': '''import { create } from "zustand";
import { ipc } from "../services/ipc";

interface SettingsState {
    theme: 'light' | 'dark' | 'system';
    setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
    loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    theme: 'system',
    setTheme: async (theme) => {
        await ipc.settings.update(theme);
        set({ theme });
        if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.className = isDark ? 'dark' : 'light';
        } else {
            document.documentElement.className = theme;
        }
    },
    loadSettings: async () => {
        const settings = await ipc.settings.get();
        const theme = settings.theme as 'light' | 'dark' | 'system';
        set({ theme });
        if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.className = isDark ? 'dark' : 'light';
        } else {
            document.documentElement.className = theme;
        }
    }
}));
''',
    'stores/useDocumentStore.ts': '''import { create } from "zustand";
import { DocumentState } from "../types";
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
''',
    'components/layout/AppLayout.tsx': '''import React from "react";
import { ActivityBar } from "../activity-bar/ActivityBar";
import { Explorer } from "../explorer/Explorer";
import { EditorArea } from "../editor/EditorArea";
import { StatusBar } from "../status-bar/StatusBar";
import { useSettingsStore } from "../../stores/useSettingsStore";

export const AppLayout: React.FC = () => {
    return (
        <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <div className="flex flex-1 overflow-hidden">
                <ActivityBar />
                <Explorer />
                <EditorArea />
            </div>
            <StatusBar />
        </div>
    );
};
''',
    'components/activity-bar/ActivityBar.tsx': '''import React from "react";
import { Files, Search, Settings } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";

export const ActivityBar: React.FC = () => {
    const { theme, setTheme } = useSettingsStore();
    return (
        <div className="w-12 bg-[var(--bg-secondary)] flex flex-col items-center py-2 border-r border-[var(--border-primary)] shrink-0">
            <button className="p-2 mb-2 hover:bg-[var(--bg-hover)] rounded"><Files size={24} /></button>
            <button className="p-2 mb-2 hover:bg-[var(--bg-hover)] rounded"><Search size={24} /></button>
            <div className="flex-1"></div>
            <button 
                className="p-2 hover:bg-[var(--bg-hover)] rounded"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle Theme"
            >
                <Settings size={24} />
            </button>
        </div>
    );
};
''',
    'components/explorer/Explorer.tsx': '''import React, { useState, useEffect } from "react";
import { useWorkspaceStore } from "../../stores/useWorkspaceStore";
import { ipc, DirectoryEntry } from "../../services/ipc";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { Folder, FolderOpen, FileText } from "lucide-react";

export const Explorer: React.FC = () => {
    const { root, selectWorkspace } = useWorkspaceStore();
    
    return (
        <div className="w-64 bg-[var(--bg-primary)] border-r border-[var(--border-primary)] flex flex-col shrink-0">
            <div className="px-4 py-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Explorer
            </div>
            <div className="flex-1 overflow-y-auto">
                {!root ? (
                    <div className="p-4">
                        <button 
                            className="bg-[var(--accent-primary)] text-white px-4 py-2 rounded hover:bg-[var(--accent-hover)] w-full"
                            onClick={async () => {
                                const { open } = await import('@tauri-apps/plugin-dialog');
                                const selected = await open({ directory: true });
                                if (selected && typeof selected === 'string') {
                                    await selectWorkspace(selected);
                                }
                            }}
                        >
                            Open Folder
                        </button>
                    </div>
                ) : (
                    <DirectoryTree path={root} isRoot={true} />
                )}
            </div>
        </div>
    );
};

const DirectoryTree: React.FC<{ path: string, isRoot?: boolean }> = ({ path, isRoot }) => {
    const [entries, setEntries] = useState<DirectoryEntry[]>([]);
    const [expanded, setExpanded] = useState(isRoot || false);
    const { openDocument } = useDocumentStore();

    useEffect(() => {
        if (expanded) {
            ipc.workspace.listDirectory(path)
                .then(setEntries)
                .catch(e => console.error("Failed to list directory", e));
        }
    }, [path, expanded]);

    if (isRoot) {
        return (
            <div>
                {entries.map(e => (
                    <TreeItem key={e.path} entry={e} onOpen={() => e.is_dir ? null : openDocument(e.path)} />
                ))}
            </div>
        );
    }

    return (
        <div className="pl-4">
            {entries.map(e => (
                <TreeItem key={e.path} entry={e} onOpen={() => e.is_dir ? null : openDocument(e.path)} />
            ))}
        </div>
    );
};

const TreeItem: React.FC<{ entry: DirectoryEntry, onOpen: () => void }> = ({ entry, onOpen }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div>
            <div 
                className="flex items-center px-4 py-1 cursor-pointer hover:bg-[var(--bg-hover)]"
                onClick={() => {
                    if (entry.is_dir) setExpanded(!expanded);
                    else onOpen();
                }}
            >
                {entry.is_dir ? (
                    expanded ? <FolderOpen size={16} className="mr-2 text-[var(--accent-primary)]"/> : <Folder size={16} className="mr-2 text-[var(--accent-primary)]"/>
                ) : (
                    <FileText size={16} className="mr-2 text-[var(--text-muted)]"/>
                )}
                <span className="text-sm truncate">{entry.name}</span>
            </div>
            {entry.is_dir && expanded && (
                <DirectoryTree path={entry.path} />
            )}
        </div>
    );
};
''',
    'components/editor/EditorArea.tsx': '''import React, { useEffect } from "react";
import { Tabs } from "../tabs/Tabs";
import { MonacoAdapter } from "../../adapters/monaco/MonacoAdapter";
import { useDocumentStore } from "../../stores/useDocumentStore";

export const EditorArea: React.FC = () => {
    const { documents, activeDocumentId, saveDocument } = useDocumentStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (activeDocumentId) saveDocument(activeDocumentId);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeDocumentId, saveDocument]);

    const activeDoc = documents.find(d => d.id === activeDocumentId);

    return (
        <div className="flex-1 flex flex-col bg-[var(--bg-editor)] overflow-hidden">
            <Tabs />
            <div className="flex-1 overflow-hidden relative">
                {activeDoc ? (
                    <MonacoAdapter document={activeDoc} />
                ) : (
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                        <div className="text-center">
                            <h1 className="text-2xl font-bold mb-4">X-Editor</h1>
                            <p>Select a file to edit</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
''',
    'components/tabs/Tabs.tsx': '''import React from "react";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { X } from "lucide-react";
import clsx from "clsx";

export const Tabs: React.FC = () => {
    const { documents, activeDocumentId, setActiveDocument, closeDocument } = useDocumentStore();

    return (
        <div className="flex h-10 bg-[var(--bg-secondary)] overflow-x-auto border-b border-[var(--border-primary)]">
            {documents.map(doc => (
                <div 
                    key={doc.id}
                    className={clsx(
                        "flex items-center px-4 py-2 border-r border-[var(--border-primary)] cursor-pointer min-w-[120px] max-w-[200px]",
                        activeDocumentId === doc.id ? "bg-[var(--bg-editor)] border-t-2 border-t-[var(--accent-primary)]" : "hover:bg-[var(--bg-hover)]"
                    )}
                    onClick={() => setActiveDocument(doc.id)}
                >
                    <span className="truncate flex-1 text-sm mr-2 select-none">
                        {doc.path.split(/[\\\\/]/).pop()} {doc.isDirty ? "" : ""}
                    </span>
                    <button 
                        className="hover:bg-[var(--bg-hover)] p-0.5 rounded ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        onClick={(e) => {
                            e.stopPropagation();
                            closeDocument(doc.id);
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};
''',
    'components/status-bar/StatusBar.tsx': '''import React from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";

export const StatusBar: React.FC = () => {
    const { theme } = useSettingsStore();
    return (
        <div className="h-6 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex items-center px-4 text-xs text-[var(--text-muted)]">
            <span>X-Editor Ready</span>
            <div className="flex-1"></div>
            <span>Theme: {theme}</span>
        </div>
    );
};
''',
    'adapters/monaco/MonacoAdapter.tsx': '''import React, { useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { DocumentState } from "../../types";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { useSettingsStore } from "../../stores/useSettingsStore";

interface Props {
    document: DocumentState;
}

export const MonacoAdapter: React.FC<Props> = ({ document }) => {
    const { updateDocumentContent } = useDocumentStore();
    const { theme } = useSettingsStore();

    const handleChange = (value: string | undefined) => {
        if (value !== undefined) {
            updateDocumentContent(document.id, value);
        }
    };

    return (
        <Editor
            height="100%"
            path={document.path}
            language={document.language}
            value={document.content}
            theme={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'vs-dark' : 'light'}
            onChange={handleChange}
            options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                fontSize: 14,
                padding: { top: 16 }
            }}
        />
    );
};
''',
    'styles/themes.css': '''@tailwind base;
@tailwind components;
@tailwind utilities;

:root.light {
    --bg-primary: #ffffff;
    --bg-secondary: #f3f4f6;
    --bg-editor: #ffffff;
    --bg-hover: #e5e7eb;
    --text-primary: #111827;
    --text-secondary: #4b5563;
    --text-muted: #6b7280;
    --border-primary: #e5e7eb;
    --accent-primary: #3b82f6;
    --accent-hover: #2563eb;
}

:root.dark {
    --bg-primary: #1f2937;
    --bg-secondary: #111827;
    --bg-editor: #1e1e1e; /* Match monaco vs-dark */
    --bg-hover: #374151;
    --text-primary: #f9fafb;
    --text-secondary: #d1d5db;
    --text-muted: #9ca3af;
    --border-primary: #374151;
    --accent-primary: #3b82f6;
    --accent-hover: #60a5fa;
}

@media (prefers-color-scheme: dark) {
    :root {
        --bg-primary: #1f2937;
        --bg-secondary: #111827;
        --bg-editor: #1e1e1e;
        --bg-hover: #374151;
        --text-primary: #f9fafb;
        --text-secondary: #d1d5db;
        --text-muted: #9ca3af;
        --border-primary: #374151;
        --accent-primary: #3b82f6;
        --accent-hover: #60a5fa;
    }
}
''',
    'App.tsx': '''import React, { useEffect } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { useSettingsStore } from "./stores/useSettingsStore";

function App() {
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return <AppLayout />;
}

export default App;
''',
    'main.tsx': '''import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/themes.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
'''
}

for d in directories:
    os.makedirs(os.path.join('src', d), exist_ok=True)

for file, content in files.items():
    with open(os.path.join('src', file), 'w', encoding='utf-8') as f:
        f.write(content)

