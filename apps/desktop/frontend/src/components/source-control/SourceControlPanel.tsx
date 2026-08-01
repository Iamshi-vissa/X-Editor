import React, { useState } from "react";
import { GitBranch, GitCommit, Check, RefreshCw, Plus, FileCode } from "lucide-react";

export const SourceControlPanel: React.FC = () => {
    const [commitMessage, setCommitMessage] = useState("");
    const [isCommitted, setIsCommitted] = useState(false);

    const changes = [
        { path: "apps/desktop/frontend/src/components/layout/MenuBar.tsx", status: "M" },
        { path: "apps/desktop/frontend/src/components/toolchain/ToolchainManagerPanel.tsx", status: "M" },
        { path: "apps/desktop/frontend/src/styles/themes.css", status: "M" }
    ];

    const handleCommit = () => {
        if (!commitMessage.trim()) return;
        setIsCommitted(true);
        setTimeout(() => {
            setCommitMessage("");
            setIsCommitted(false);
        }, 2000);
    };

    return (
        <div className="w-80 h-full flex flex-col bg-[var(--bg-secondary)] text-[var(--text-primary)] font-sans border-r border-[var(--border-primary)] select-none shrink-0">
            <div className="p-3 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-primary)] h-10">
                <div className="flex items-center space-x-2">
                    <GitBranch className="w-4 h-4 text-[var(--accent-primary)]" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Source Control</span>
                </div>
                <button className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Refresh Git Status">
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="p-3 space-y-3 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                <div className="flex items-center space-x-2 text-xs text-[var(--text-secondary)] font-mono">
                    <GitBranch className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>main*</span>
                </div>

                <div className="space-y-2">
                    <textarea
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Commit message (Ctrl+Enter to commit)..."
                        className="w-full h-16 p-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none resize-none focus:border-[var(--accent-primary)]"
                    />
                    <button
                        onClick={handleCommit}
                        disabled={!commitMessage.trim()}
                        className="w-full flex items-center justify-center space-x-1.5 py-1.5 bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 text-white rounded text-xs font-medium transition-opacity"
                    >
                        {isCommitted ? <Check className="w-4 h-4" /> : <GitCommit className="w-4 h-4" />}
                        <span>{isCommitted ? "Committed to main!" : "Commit & Push"}</span>
                    </button>
                </div>
            </div>

            <div className="p-2 border-b border-[var(--border-primary)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex justify-between items-center bg-[var(--bg-secondary)]">
                <span>Changes ({changes.length})</span>
                <span className="text-[10px] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded text-[var(--accent-primary)]">Git Active</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 hide-scrollbar">
                {changes.map((file, idx) => (
                    <div
                        key={idx}
                        className="group flex items-center justify-between p-1.5 rounded hover:bg-[var(--bg-hover)] text-xs cursor-pointer"
                    >
                        <div className="flex items-center space-x-2 truncate">
                            <FileCode className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                            <span className="truncate text-[var(--text-primary)]">{file.path.split("/").pop()}</span>
                        </div>
                        <div className="flex items-center space-x-1 shrink-0">
                            <span className="text-[10px] text-yellow-400 font-bold font-mono px-1">{file.status}</span>
                            <button className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-primary)] rounded text-[var(--text-muted)] hover:text-green-400">
                                <Plus className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
