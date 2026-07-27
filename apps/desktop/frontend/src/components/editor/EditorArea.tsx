import React, { useEffect, useState } from "react";
import { Tabs } from "../tabs/Tabs";
import { Breadcrumbs } from "./Breadcrumbs";
import { MonacoAdapter } from "../../adapters/monaco/MonacoAdapter";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { Columns, Map, WrapText, X } from "lucide-react";

export const EditorArea: React.FC = () => {
    const {
        documents,
        activeDocumentId,
        isSplitView,
        secondaryDocumentId,
        toggleSplitView,
        saveDocument
    } = useDocumentStore();

    const [minimap, setMinimap] = useState(true);
    const [wordWrap, setWordWrap] = useState(false);

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
    const secondaryDoc = documents.find(d => d.id === secondaryDocumentId);

    return (
        <div className="flex-1 flex flex-col bg-[var(--bg-editor)] overflow-hidden relative">
            <div className="flex items-center justify-between bg-[var(--bg-secondary)] border-b border-[var(--border-primary)]">
                <div className="flex-1 overflow-hidden">
                    <Tabs />
                </div>
                {/* Editor Action Controls Bar */}
                <div className="flex items-center space-x-1 px-3 border-l border-[var(--border-primary)] shrink-0 h-9 bg-[var(--bg-secondary)]">
                    <button
                        onClick={toggleSplitView}
                        className={`p-1.5 rounded transition-colors ${
                            isSplitView
                                ? "bg-[var(--accent-primary)] text-white"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        }`}
                        title="Split Editor Right"
                    >
                        <Columns size={14} />
                    </button>
                    <button
                        onClick={() => setMinimap(!minimap)}
                        className={`p-1.5 rounded transition-colors ${
                            minimap
                                ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        }`}
                        title="Toggle Minimap"
                    >
                        <Map size={14} />
                    </button>
                    <button
                        onClick={() => setWordWrap(!wordWrap)}
                        className={`p-1.5 rounded transition-colors ${
                            wordWrap
                                ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        }`}
                        title="Toggle Word Wrap"
                    >
                        <WrapText size={14} />
                    </button>
                </div>
            </div>

            <Breadcrumbs />

            <div className="flex-1 flex overflow-hidden relative">
                {/* Primary Left Editor Pane */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {activeDoc ? (
                        <MonacoAdapter document={activeDoc} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-[var(--text-muted)] select-none">
                            <div className="text-center">
                                <h1 className="text-3xl font-extrabold mb-2 tracking-tight text-[var(--accent-primary)]">X EDITOR</h1>
                                <p className="text-xs text-[var(--text-muted)]">Select or create a file in the explorer, or press <kbd className="px-1.5 py-0.5 bg-[var(--bg-hover)] rounded border border-[var(--border-primary)] text-white font-mono">Ctrl+P</kbd> to search files.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Secondary Right Split Pane */}
                {isSplitView && (
                    <div className="flex-1 flex flex-col overflow-hidden border-l border-[var(--border-primary)] relative">
                        <div className="h-7 px-3 bg-[var(--bg-primary)] border-b border-[var(--border-primary)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                            <span className="truncate">{secondaryDoc ? secondaryDoc.path.split("/").pop() : "Secondary Pane"}</span>
                            <button
                                onClick={toggleSplitView}
                                className="p-0.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                <X size={12} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                            {secondaryDoc ? (
                                <MonacoAdapter document={secondaryDoc} />
                            ) : (
                                <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)]">
                                    Click any tab or file to view in this split pane.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
