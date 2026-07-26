import React from "react";
import { Files, Search, Terminal as TerminalIcon, Hammer, AlertCircle, Settings } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useSearchStore } from "../../stores/useSearchStore";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { useTaskStore } from "../../stores/useTaskStore";

export const ActivityBar: React.FC = () => {
    const { theme, setTheme } = useSettingsStore();
    const { togglePanel: toggleSearch } = useSearchStore();
    const { togglePanel: toggleTerminal } = useTerminalStore();
    const { toggleTaskPanel, toggleProblemsPanel, problems } = useTaskStore();

    const errorCount = problems.filter((p) => p.severity === "error").length;

    return (
        <div className="w-12 bg-[var(--bg-secondary)] flex flex-col items-center py-2 border-r border-[var(--border-primary)] shrink-0">
            <button className="p-2 mb-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]" title="Files Explorer">
                <Files size={20} />
            </button>
            <button
                className="p-2 mb-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={toggleSearch}
                title="Search Workspace"
            >
                <Search size={20} />
            </button>
            <button
                className="p-2 mb-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={toggleTaskPanel}
                title="Task Runner"
            >
                <Hammer size={20} />
            </button>
            <button
                className="p-2 mb-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] relative"
                onClick={toggleProblemsPanel}
                title="Problems"
            >
                <AlertCircle size={20} />
                {errorCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                )}
            </button>
            <button
                className="p-2 mb-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={toggleTerminal}
                title="Toggle Terminal"
            >
                <TerminalIcon size={20} />
            </button>
            <div className="flex-1" />
            <button
                className="p-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                title="Toggle Theme"
            >
                <Settings size={20} />
            </button>
        </div>
    );
};
