import React, { useEffect, useRef } from "react";
import { FilePlus, FolderPlus, Edit2, Trash2, Copy } from "lucide-react";

interface ContextMenuProps {
    x: number;
    y: number;
    path: string;
    isDir: boolean;
    onClose: () => void;
    onNewFile?: () => void;
    onNewFolder?: () => void;
    onRename?: () => void;
    onDelete?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
    x,
    y,
    path,
    isDir,
    onClose,
    onNewFile,
    onNewFolder,
    onRename,
    onDelete
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    const handleCopyPath = () => {
        navigator.clipboard.writeText(path);
        onClose();
    };

    return (
        <div
            ref={menuRef}
            style={{ top: y, left: x }}
            className="fixed z-50 w-48 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded shadow-2xl py-1 text-xs text-[var(--text-primary)] select-none font-sans"
        >
            {isDir && (
                <>
                    <button
                        onClick={() => { onNewFile?.(); onClose(); }}
                        className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-[var(--accent-primary)] hover:text-white text-left"
                    >
                        <FilePlus size={13} />
                        <span>New File</span>
                    </button>
                    <button
                        onClick={() => { onNewFolder?.(); onClose(); }}
                        className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-[var(--accent-primary)] hover:text-white text-left"
                    >
                        <FolderPlus size={13} />
                        <span>New Folder</span>
                    </button>
                    <div className="my-1 border-t border-[var(--border-primary)] opacity-50" />
                </>
            )}
            <button
                onClick={() => { onRename?.(); onClose(); }}
                className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-[var(--accent-primary)] hover:text-white text-left"
            >
                <Edit2 size={13} />
                <span>Rename</span>
            </button>
            <button
                onClick={() => { onDelete?.(); onClose(); }}
                className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-red-600 hover:text-white text-left text-red-400"
            >
                <Trash2 size={13} />
                <span>Delete</span>
            </button>
            <div className="my-1 border-t border-[var(--border-primary)] opacity-50" />
            <button
                onClick={handleCopyPath}
                className="w-full px-3 py-1.5 flex items-center space-x-2 hover:bg-[var(--accent-primary)] hover:text-white text-left"
            >
                <Copy size={13} />
                <span>Copy Path</span>
            </button>
        </div>
    );
};
