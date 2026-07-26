import React from "react";
import { ActivityBar } from "../activity-bar/ActivityBar";
import { Explorer } from "../explorer/Explorer";
import { SearchPanel } from "../search/SearchPanel";
import { EditorArea } from "../editor/EditorArea";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { TaskRunnerPanel } from "../task/TaskRunnerPanel";
import { ProblemsPanel } from "../problems/ProblemsPanel";
import { StatusBar } from "../status-bar/StatusBar";

export const AppLayout: React.FC = () => {
    return (
        <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <div className="flex flex-1 overflow-hidden">
                <ActivityBar />
                <Explorer />
                <SearchPanel />
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
