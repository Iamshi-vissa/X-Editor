import React from "react";
import { ActivityBar } from "../activity-bar/ActivityBar";
import { Explorer } from "../explorer/Explorer";
import { SearchPanel } from "../search/SearchPanel";
import { ToolchainManagerPanel } from "../toolchain/ToolchainManagerPanel";
import { EditorArea } from "../editor/EditorArea";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { TaskRunnerPanel } from "../task/TaskRunnerPanel";
import { ProblemsPanel } from "../problems/ProblemsPanel";
import { StatusBar } from "../status-bar/StatusBar";
import { useToolchainStore } from "../../stores/useToolchainStore";

export const AppLayout: React.FC = () => {
    const { isPanelOpen: isToolchainOpen } = useToolchainStore();

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <div className="flex flex-1 overflow-hidden">
                <ActivityBar />
                <Explorer />
                <SearchPanel />
                {isToolchainOpen && (
                    <div className="w-80 border-r border-[var(--border-primary)] shrink-0">
                        <ToolchainManagerPanel />
                    </div>
                )}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <EditorArea />
                    <ProblemsPanel />
                    <TaskRunnerPanel />
                    <TerminalPanel />
                </div>
            </div>
            <StatusBar />
        </div>
    );
};
