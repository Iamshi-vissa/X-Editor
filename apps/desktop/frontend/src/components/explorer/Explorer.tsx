import React, { useState, useEffect } from "react";
import { useWorkspaceStore } from "../../stores/useWorkspaceStore";
import { ipc } from "../../services/ipc";
import type { DirectoryEntry } from "../../services/ipc";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { Folder, FolderOpen, FileText, FilePlus, FolderPlus, Edit2, Trash2 } from "lucide-react";

export const Explorer: React.FC = () => {
    const { root, selectWorkspace, createFile, createDirectory } = useWorkspaceStore();

    return (
        <div className="w-64 bg-[var(--bg-primary)] border-r border-[var(--border-primary)] flex flex-col shrink-0">
            <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center justify-between border-b border-[var(--border-primary)]">
                <span>Explorer</span>
                {root && (
                    <div className="flex items-center space-x-1">
                        <button
                            className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            onClick={() => {
                                const name = prompt("New file name:");
                                if (name) createFile(root, name);
                            }}
                            title="New File"
                        >
                            <FilePlus size={14} />
                        </button>
                        <button
                            className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            onClick={() => {
                                const name = prompt("New directory name:");
                                if (name) createDirectory(root, name);
                            }}
                            title="New Folder"
                        >
                            <FolderPlus size={14} />
                        </button>
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-y-auto">
                {!root ? (
                    <div className="p-4">
                        <button
                            className="bg-[var(--accent-primary)] text-white px-4 py-2 rounded text-xs hover:bg-[var(--accent-hover)] w-full font-medium"
                            onClick={async () => {
                                const { open } = await import("@tauri-apps/plugin-dialog");
                                const selected = await open({ directory: true });
                                if (selected && typeof selected === "string") {
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
        <div className={isRoot ? "" : "pl-3"}>
            {entries.map((e) => (
                <TreeItem key={e.path} entry={e} onOpen={() => (e.is_dir ? null : openDocument(e.path))} />
            ))}
        </div>
    );
};

const TreeItem: React.FC<{ entry: DirectoryEntry; onOpen: () => void }> = ({ entry, onOpen }) => {
    const [expanded, setExpanded] = useState(false);
    const { renameItem, deleteItem, createFile, createDirectory } = useWorkspaceStore();

    const handleRename = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newName = prompt("Rename to:", entry.name);
        if (newName && newName !== entry.name) {
            const parent = entry.path.substring(0, entry.path.lastIndexOf("/"));
            const newPath = `${parent}/${newName}`;
            renameItem(entry.path, newPath);
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm(`Delete ${entry.name}?`)) {
            deleteItem(entry.path);
        }
    };

    const handleNewFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        const name = prompt("New file name:");
        if (name) createFile(entry.path, name);
    };

    const handleNewFolder = (e: React.MouseEvent) => {
        e.stopPropagation();
        const name = prompt("New directory name:");
        if (name) createDirectory(entry.path, name);
    };

    return (
        <div>
            <div
                className="flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-[var(--bg-hover)] group rounded text-xs select-none"
                onClick={() => {
                    if (entry.is_dir) setExpanded(!expanded);
                    else onOpen();
                }}
            >
                <div className="flex items-center flex-1 truncate mr-2">
                    {entry.is_dir ? (
                        expanded ? (
                            <FolderOpen size={14} className="mr-1.5 text-[var(--accent-primary)] shrink-0" />
                        ) : (
                            <Folder size={14} className="mr-1.5 text-[var(--accent-primary)] shrink-0" />
                        )
                    ) : (
                        <FileText size={14} className="mr-1.5 text-[var(--text-muted)] shrink-0" />
                    )}
                    <span className="truncate text-[var(--text-primary)]">{entry.name}</span>
                </div>

                <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 text-[var(--text-muted)] shrink-0">
                    {entry.is_dir && (
                        <>
                            <button className="hover:text-[var(--text-primary)] p-0.5" onClick={handleNewFile} title="New File">
                                <FilePlus size={12} />
                            </button>
                            <button className="hover:text-[var(--text-primary)] p-0.5" onClick={handleNewFolder} title="New Folder">
                                <FolderPlus size={12} />
                            </button>
                        </>
                    )}
                    <button className="hover:text-[var(--text-primary)] p-0.5" onClick={handleRename} title="Rename">
                        <Edit2 size={12} />
                    </button>
                    <button className="hover:text-red-400 p-0.5" onClick={handleDelete} title="Delete">
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {entry.is_dir && expanded && <DirectoryTree path={entry.path} />}
        </div>
    );
};
