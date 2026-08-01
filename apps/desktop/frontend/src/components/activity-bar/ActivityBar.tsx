import React from "react";
import { Files, Search, GitBranch, Blocks, Terminal as TerminalIcon, Hammer, AlertCircle, Palette, Wrench } from "lucide-react";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { useTaskStore } from "../../stores/useTaskStore";
import clsx from "clsx";

interface ActivityBarProps {
    activePanel?: string | null;
    onSelectPanel?: (panel: string) => void;
    onOpenThemePicker?: () => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activePanel = "explorer", onSelectPanel, onOpenThemePicker }) => {
    const { togglePanel: toggleTerminal } = useTerminalStore();
    const { toggleTaskPanel, toggleProblemsPanel, problems } = useTaskStore();

    const errorCount = problems.filter((p) => p.severity === "error").length;

    const IconWrapper = ({ id, title, icon: Icon, onClick, badge }: { id: string, title: string, icon: any, onClick?: () => void, badge?: React.ReactNode }) => {
        const isActive = activePanel === id;
        return (
            <div className="relative w-full flex justify-center mb-2">
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent-primary)] rounded-r" />}
                <button
                    className={clsx(
                        "p-2.5 rounded-lg transition-colors relative",
                        isActive ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    )}
                    onClick={() => {
                        if (onClick) {
                            onClick();
                        } else if (onSelectPanel) {
                            onSelectPanel(id);
                        }
                    }}
                    title={title}
                >
                    <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                    {badge}
                </button>
            </div>
        );
    };

    return (
        <div className="w-[52px] bg-[var(--bg-secondary)] flex flex-col items-center py-2 border-r border-[var(--border-primary)] shrink-0 z-10 select-none">
            <IconWrapper id="explorer" title="Explorer" icon={Files} onClick={() => onSelectPanel?.("explorer")} />
            <IconWrapper id="search" title="Search" icon={Search} onClick={() => onSelectPanel?.("search")} />
            <IconWrapper id="source-control" title="Source Control" icon={GitBranch} onClick={() => onSelectPanel?.("source-control")} />
            <IconWrapper id="extensions" title="Extensions Marketplace" icon={Blocks} onClick={() => onSelectPanel?.("extensions")} />
            
            <div className="w-8 h-px bg-[var(--border-primary)] my-2 opacity-50" />
            
            <IconWrapper id="toolchain" title="Toolchain Manager" icon={Wrench} onClick={() => onSelectPanel?.("toolchain")} />
            <IconWrapper id="tasks" title="Task Runner & Build Output" icon={Hammer} onClick={toggleTaskPanel} />
            <IconWrapper id="problems" title="Problems" icon={AlertCircle} onClick={toggleProblemsPanel} badge={
                errorCount > 0 ? <span className="absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border-2 border-[var(--bg-secondary)]" /> : null
            } />
            <IconWrapper id="terminal" title="Integrated Terminal" icon={TerminalIcon} onClick={toggleTerminal} />
            
            <div className="flex-1" />
            <IconWrapper id="theme" title="Theme" icon={Palette} onClick={onOpenThemePicker} />
        </div>
    );
};

