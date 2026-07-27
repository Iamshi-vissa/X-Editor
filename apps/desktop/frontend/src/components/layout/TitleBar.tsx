import React from "react";
import { Search, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface TitleBarProps {
    onOpenQuickFile: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenQuickFile }) => {
    const handleMinimize = async () => {
        try {
            await getCurrentWindow().minimize();
        } catch {
            console.log("Minimize window requested");
        }
    };

    const handleMaximize = async () => {
        try {
            await getCurrentWindow().toggleMaximize();
        } catch {
            console.log("Maximize window requested");
        }
    };

    const handleClose = async () => {
        try {
            await getCurrentWindow().close();
        } catch {
            console.log("Close window requested");
        }
    };

    return (
        <div
            className="h-[30px] bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] flex items-center justify-between px-3 text-xs select-none shrink-0 text-[var(--text-muted)] z-50"
            data-tauri-drag-region
        >
            {/* Left: App Logo & Name */}
            <div className="flex items-center space-x-2 pointer-events-none shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-primary)]">
                    <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span className="font-bold tracking-wider text-[11px] text-[var(--text-primary)] font-mono">X EDITOR</span>
            </div>

            {/* Center: Quick Open Trigger (Ctrl+P) */}
            <button
                onClick={onOpenQuickFile}
                className="flex items-center space-x-2 px-6 py-1 bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] w-80 justify-center transition-colors cursor-pointer"
            >
                <Search size={12} className="text-[var(--accent-primary)]" />
                <span className="truncate">project-1 — Quick Open</span>
                <span className="font-mono text-[10px] bg-[var(--bg-hover)] px-1 rounded opacity-70">Ctrl+P</span>
            </button>

            {/* Right: Window Controls */}
            <div className="flex items-center space-x-1 shrink-0">
                <button
                    onClick={handleMinimize}
                    className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    title="Minimize"
                >
                    <Minus size={12} />
                </button>
                <button
                    onClick={handleMaximize}
                    className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    title="Maximize"
                >
                    <Square size={10} />
                </button>
                <button
                    onClick={handleClose}
                    className="p-1 hover:bg-red-600 rounded text-[var(--text-muted)] hover:text-white"
                    title="Close"
                >
                    <X size={12} />
                </button>
            </div>
        </div>
    );
};
