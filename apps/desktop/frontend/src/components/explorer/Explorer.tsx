import React, { useState, useEffect } from "react";
import { useWorkspaceStore } from "../../stores/useWorkspaceStore";
import { ipc } from "../../services/ipc";
import type { DirectoryEntry } from "../../services/ipc";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { ChevronRight, ChevronDown, FileText, FilePlus, FolderPlus } from "lucide-react";
import clsx from "clsx";

import { ContextMenu } from "../common/ContextMenu";

export const Explorer: React.FC = () => {
    const { root, createFile, createDirectory } = useWorkspaceStore();

    const handleOpenFolder = async () => {
        try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: true });
            if (selected && typeof selected === "string") {
                await useWorkspaceStore.getState().selectWorkspace(selected);
            }
        } catch {
            const path = prompt("Enter folder absolute path:");
            if (path) useWorkspaceStore.getState().selectWorkspace(path);
        }
    };

    return (
        <div className="w-64 bg-[var(--bg-secondary)] border-r border-[var(--border-primary)] flex flex-col shrink-0">
            <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] flex items-center justify-between select-none border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                <span>Explorer</span>
                <div className="flex items-center space-x-1">
                    <button
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        onClick={handleOpenFolder}
                        title="Open Folder Workspace"
                    >
                        <FolderPlus size={14} />
                    </button>
                    {root && (
                        <>
                            <button
                                className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                onClick={() => {
                                    const name = prompt("New file name:");
                                    if (name) createFile(root, name);
                                }}
                                title="New File in Root"
                            >
                                <FilePlus size={14} />
                            </button>
                            <button
                                className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                onClick={() => {
                                    const name = prompt("New directory name:");
                                    if (name) createDirectory(root, name);
                                }}
                                title="New Folder in Root"
                            >
                                <FolderPlus size={14} className="text-[var(--accent-primary)]" />
                            </button>
                        </>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto hide-scrollbar pb-4">
                {!root ? (
                    <div className="p-4 flex flex-col items-center justify-center h-full text-center text-[var(--text-muted)]">
                        <p className="text-sm mb-4">You have not yet opened a folder.</p>
                        <button
                            className="bg-[var(--accent-primary)] text-[var(--accent-text)] px-4 py-2 rounded text-[13px] hover:bg-[var(--accent-hover)] w-full font-medium transition-colors"
                            onClick={handleOpenFolder}
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

const DirectoryTree: React.FC<{ path: string; isRoot?: boolean }> = ({ path, isRoot }) => {
    const [entries, setEntries] = useState<DirectoryEntry[]>([]);
    const { refreshCounter } = useWorkspaceStore();
    const { openDocument } = useDocumentStore();

    useEffect(() => {
        ipc.workspace
            .listDirectory(path)
            .then(setEntries)
            .catch((e) => console.error("Failed to list directory", e));
    }, [path, refreshCounter]);

    return (
        <div className={isRoot ? "" : "pl-3 border-l border-[var(--border-primary)] ml-3"}>
            {entries.map((e) => (
                <TreeItem key={e.path} entry={e} onOpen={() => (e.is_dir ? null : openDocument(e.path))} />
            ))}
        </div>
    );
};

const TreeItem: React.FC<{ entry: DirectoryEntry; onOpen: () => void }> = ({ entry, onOpen }) => {
    const [expanded, setExpanded] = useState(false);
    const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

    const { renameItem, deleteItem, createFile, createDirectory } = useWorkspaceStore();
    const { activeDocumentId } = useDocumentStore();
    
    const isActive = activeDocumentId === entry.path;

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuPos({ x: e.clientX, y: e.clientY });
    };

    const handleRename = () => {
        const newName = prompt("Rename to:", entry.name);
        if (newName && newName !== entry.name) {
            const parent = entry.path.substring(0, entry.path.lastIndexOf("/"));
            const newPath = `${parent}/${newName}`;
            renameItem(entry.path, newPath);
        }
    };

    const handleDelete = () => {
        if (confirm(`Delete ${entry.name}?`)) {
            deleteItem(entry.path);
        }
    };

    const handleNewFile = () => {
        const name = prompt("New file name:");
        if (name) createFile(entry.path, name);
    };

    const handleNewFolder = () => {
        const name = prompt("New directory name:");
        if (name) createDirectory(entry.path, name);
    };

    return (
        <div onContextMenu={handleContextMenu}>
            <div
                className={clsx(
                    "flex items-center justify-between px-1 py-1 cursor-pointer group text-[13px] select-none transition-colors",
                    isActive ? "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-medium" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                )}
                onClick={() => {
                    if (entry.is_dir) setExpanded(!expanded);
                    else onOpen();
                }}
            >
                <div className="flex items-center flex-1 truncate mr-2">
                    {entry.is_dir ? (
                        expanded ? (
                            <ChevronDown size={14} className="mr-1 shrink-0 opacity-70" />
                        ) : (
                            <ChevronRight size={14} className="mr-1 shrink-0 opacity-70" />
                        )
                    ) : (
                        <FileText size={14} className={clsx("mr-1.5 shrink-0 ml-1", isActive ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]")} />
                    )}
                    <span className="truncate">{entry.name}</span>
                </div>
            </div>

            {entry.is_dir && expanded && <DirectoryTree path={entry.path} />}

            {menuPos && (
                <ContextMenu
                    x={menuPos.x}
                    y={menuPos.y}
                    path={entry.path}
                    isDir={entry.is_dir}
                    onClose={() => setMenuPos(null)}
                    onNewFile={handleNewFile}
                    onNewFolder={handleNewFolder}
                    onRename={handleRename}
                    onDelete={handleDelete}
                />
            )}
        </div>
    );
};
