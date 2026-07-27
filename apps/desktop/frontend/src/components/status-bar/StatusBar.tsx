import React from "react";
import { GitBranch, AlertTriangle, AlertCircle, Wrench, Palette } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useTaskStore } from "../../stores/useTaskStore";
import { useToolchainStore } from "../../stores/useToolchainStore";
import { useDocumentStore } from "../../stores/useDocumentStore";

export const StatusBar: React.FC = () => {
    const { theme } = useSettingsStore();
    const { problems, toggleProblemsPanel } = useTaskStore();
    const { activeToolchains, togglePanel: toggleToolchain } = useToolchainStore();
    const { documents, activeDocumentId } = useDocumentStore();

    const activeDoc = documents.find((d) => d.id === activeDocumentId);
    const errors = problems.filter((p) => p.severity === "error").length;
    const warnings = problems.filter((p) => p.severity === "warning").length;

    const primaryToolchain = activeToolchains.length > 0 ? activeToolchains[0] : null;

    return (
        <div className="h-6 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex items-center justify-between px-3 text-[11px] text-[var(--text-muted)] select-none shrink-0 font-sans">
            {/* Left Items */}
            <div className="flex items-center space-x-3">
                {/* Remote / Git Branch */}
                <div className="flex items-center space-x-1 hover:text-[var(--text-primary)] cursor-pointer transition-colors">
                    <GitBranch className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span className="font-mono">main*</span>
                </div>

                {/* Problems Counter */}
                <div
                    onClick={toggleProblemsPanel}
                    className="flex items-center space-x-1.5 hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                    title="Toggle Problems Panel"
                >
                    <span className="flex items-center space-x-0.5 text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        <span>{errors}</span>
                    </span>
                    <span className="flex items-center space-x-0.5 text-yellow-400">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{warnings}</span>
                    </span>
                </div>

                {/* Active Toolchain Badge */}
                <div
                    onClick={toggleToolchain}
                    className="flex items-center space-x-1 px-1.5 py-0.5 bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]/30 rounded text-[var(--accent-primary)] cursor-pointer transition-colors"
                    title="Active Project Toolchain (Click to Manage)"
                >
                    <Wrench className="w-3 h-3" />
                    <span className="font-semibold text-[10px]">
                        {primaryToolchain ? `${primaryToolchain.name} v${primaryToolchain.version}` : "Toolchains: Active"}
                    </span>
                </div>
            </div>

            {/* Right Items */}
            <div className="flex items-center space-x-4">
                {activeDoc && (
                    <>
                        <span>Ln 1, Col 1</span>
                        <span>Spaces: 4</span>
                        <span className="uppercase">{activeDoc.encoding || "UTF-8"}</span>
                        <span className="capitalize text-[var(--text-secondary)]">{activeDoc.language}</span>
                    </>
                )}

                {/* Theme Indicator */}
                <div className="flex items-center space-x-1 text-[var(--text-secondary)] capitalize">
                    <Palette className="w-3 h-3 text-[var(--accent-primary)]" />
                    <span>{theme}</span>
                </div>
            </div>
        </div>
    );
};

