import React from "react";
import { useTaskStore } from "../../stores/useTaskStore";
import { useDocumentStore } from "../../stores/useDocumentStore";
import type { Problem } from "../../services/ipc";
import { AlertCircle, AlertTriangle, Info, Trash2, X } from "lucide-react";

export const ProblemsPanel: React.FC = () => {
    const {
        problems,
        isProblemsPanelOpen,
        toggleProblemsPanel,
        clearProblems,
        setActiveProblem,
    } = useTaskStore();

    const { openDocument } = useDocumentStore();

    if (!isProblemsPanelOpen) return null;

    const handleProblemClick = (problem: Problem) => {
        setActiveProblem(problem);
        openDocument(problem.file);
    };

    const errors = problems.filter((p) => p.severity === "error");
    const warnings = problems.filter((p) => p.severity === "warning");
    const infos = problems.filter((p) => p.severity === "info");

    return (
        <div className="h-56 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex flex-col shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-9 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                <div className="flex items-center space-x-3 text-xs">
                    <span className="font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center">
                        <AlertCircle size={14} className="mr-1.5 text-red-400" /> Problems
                    </span>
                    <span className="text-red-400 font-medium">{errors.length} Errors</span>
                    <span className="text-yellow-400 font-medium">{warnings.length} Warnings</span>
                    <span className="text-blue-400 font-medium">{infos.length} Info</span>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        onClick={clearProblems}
                        title="Clear Problems"
                    >
                        <Trash2 size={14} />
                    </button>
                    <button
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        onClick={toggleProblemsPanel}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Problems List */}
            <div className="flex-1 overflow-y-auto p-2">
                {problems.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)]">
                        No compiler errors or warnings detected.
                    </div>
                ) : (
                    <div className="space-y-1">
                        {problems.map((p, i) => (
                            <div
                                key={i}
                                className="flex items-start p-2 hover:bg-[var(--bg-hover)] rounded cursor-pointer text-xs group"
                                onClick={() => handleProblemClick(p)}
                            >
                                <SeverityIcon severity={p.severity} />
                                <div className="ml-2 flex-1 truncate">
                                    <div className="text-[var(--text-primary)] font-medium truncate">{p.message}</div>
                                    <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                                        {p.file}:{p.line}
                                        {p.column ? `:${p.column}` : ""} [{p.source}]
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const SeverityIcon: React.FC<{ severity: Problem["severity"] }> = ({ severity }) => {
    switch (severity) {
        case "error":
            return <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />;
        case "warning":
            return <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" />;
        case "info":
            return <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />;
    }
};
