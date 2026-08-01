import React, { useState, useEffect, useRef } from "react";
import { FileText, Search, X } from "lucide-react";
import { useWorkspaceStore } from "../../stores/useWorkspaceStore";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { ipc } from "../../services/ipc";
import type { DirectoryEntry } from "../../services/ipc";

interface QuickFileOpenModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const QuickFileOpenModal: React.FC<QuickFileOpenModalProps> = ({ isOpen, onClose }) => {
    const [query, setQuery] = useState("");
    const [allFiles, setAllFiles] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const { root } = useWorkspaceStore();
    const { openDocument } = useDocumentStore();

    useEffect(() => {
        if (isOpen && root) {
            setQuery("");
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);

            // Fetch directory files recursively (or sample top level)
            const collectFiles = async (dirPath: string): Promise<string[]> => {
                try {
                    const entries: DirectoryEntry[] = await ipc.workspace.listDirectory(dirPath);
                    let files: string[] = [];
                    for (const entry of entries) {
                        if (entry.is_dir) {
                            if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "target") {
                                const subFiles = await collectFiles(entry.path);
                                files = [...files, ...subFiles];
                            }
                        } else {
                            files.push(entry.path);
                        }
                    }
                    return files;
                } catch {
                    return [];
                }
            };

            collectFiles(root).then(setAllFiles);
        }
    }, [isOpen, root]);

    if (!isOpen) return null;

    const filteredFiles = allFiles.filter((filePath) =>
        filePath.toLowerCase().includes(query.toLowerCase())
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredFiles.length));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + filteredFiles.length) % Math.max(1, filteredFiles.length));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filteredFiles[selectedIndex]) {
                openDocument(filteredFiles[selectedIndex], false);
                onClose();
            }
        } else if (e.key === "Escape") {
            onClose();
        }
    };

    return (
        <div 
            onClick={(e) => e.target === e.currentTarget && onClose()}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
        >
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg w-full max-w-xl shadow-2xl overflow-hidden text-[var(--text-primary)]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                    <div className="flex items-center flex-1 mr-2">
                        <Search className="w-4 h-4 text-[var(--accent-primary)] mr-3 shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setSelectedIndex(0);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Search files by name (e.g. AppLayout, index.ts)..."
                            className="bg-transparent text-sm w-full outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono"
                        />
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                        title="Close (Esc)"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="max-h-80 overflow-y-auto p-1 hide-scrollbar">
                    {filteredFiles.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[var(--text-muted)]">No matching files found</div>
                    ) : (
                        filteredFiles.slice(0, 50).map((filePath, idx) => {
                            const fileName = filePath.split("/").pop() || filePath.split("\\").pop();
                            const isSelected = idx === selectedIndex;
                            return (
                                <div
                                    key={filePath}
                                    onClick={() => {
                                        openDocument(filePath, false);
                                        onClose();
                                    }}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                    className={`flex items-center justify-between px-3 py-2 rounded text-xs cursor-pointer transition-colors ${
                                        isSelected
                                            ? "bg-[var(--accent-primary)] text-[var(--accent-text)] font-medium"
                                            : "hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                                    }`}
                                >
                                    <div className="flex items-center space-x-3 truncate">
                                        <FileText className={`w-4 h-4 shrink-0 ${isSelected ? "text-[var(--accent-text)]" : "text-[var(--accent-primary)]"}`} />
                                        <span className="font-semibold truncate">{fileName}</span>
                                    </div>
                                    <span className={`text-[10px] truncate max-w-xs ml-2 ${isSelected ? "opacity-80 text-[var(--accent-text)]" : "text-[var(--text-muted)]"}`}>
                                        {filePath}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
