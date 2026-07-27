import React, { useState, useEffect } from "react";
import { ActivityBar } from "../activity-bar/ActivityBar";
import { Explorer } from "../explorer/Explorer";
import { SearchPanel } from "../search/SearchPanel";
import { SourceControlPanel } from "../source-control/SourceControlPanel";
import { ExtensionsPanel } from "../extensions/ExtensionsPanel";
import { ToolchainManagerPanel } from "../toolchain/ToolchainManagerPanel";
import { EditorArea } from "../editor/EditorArea";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { TaskRunnerPanel } from "../task/TaskRunnerPanel";
import { ProblemsPanel } from "../problems/ProblemsPanel";
import { StatusBar } from "../status-bar/StatusBar";
import { TitleBar } from "./TitleBar";
import { MenuBar } from "./MenuBar";
import { ThemeSelectorModal } from "./ThemeSelectorModal";
import { CommandPalette } from "../command-palette/CommandPalette";
import { QuickFileOpenModal } from "../command-palette/QuickFileOpenModal";
import { useToolchainStore } from "../../stores/useToolchainStore";

import { useDocumentStore } from "../../stores/useDocumentStore";

export const AppLayout: React.FC = () => {
    const { isPanelOpen: isToolchainOpen } = useToolchainStore();
    const { createNewDocument } = useDocumentStore();
    const [activeSidePanel, setActiveSidePanel] = useState<string>("explorer");
    const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [isQuickFileOpen, setIsQuickFileOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === "p")) {
                e.preventDefault();
                setIsCommandPaletteOpen((prev) => !prev);
            } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key.toLowerCase() === "p")) {
                e.preventDefault();
                setIsQuickFileOpen((prev) => !prev);
            } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "n")) {
                e.preventDefault();
                createNewDocument();
            } else if (e.key === "F1") {
                e.preventDefault();
                setIsCommandPaletteOpen((prev) => !prev);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [createNewDocument]);

    const handleSelectPanel = (panelId: string) => {
        if (["explorer", "search", "source-control", "extensions"].includes(panelId)) {
            setActiveSidePanel(panelId);
        }
    };

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans select-none">
            <TitleBar onOpenQuickFile={() => setIsQuickFileOpen(true)} />
            <MenuBar />
            <div className="flex flex-1 overflow-hidden relative">
                <ActivityBar
                    activePanel={activeSidePanel}
                    onSelectPanel={handleSelectPanel}
                    onOpenThemePicker={() => setIsThemeModalOpen(true)}
                />

                {/* Primary Left Side Panels */}
                {activeSidePanel === "explorer" && <Explorer />}
                {activeSidePanel === "search" && <SearchPanel />}
                {activeSidePanel === "source-control" && <SourceControlPanel />}
                {activeSidePanel === "extensions" && <ExtensionsPanel />}

                {/* Secondary Toolchain Manager Overlay Panel */}
                {isToolchainOpen && (
                    <div className="w-80 border-r border-[var(--border-primary)] shrink-0 z-20">
                        <ToolchainManagerPanel />
                    </div>
                )}

                {/* Central Editor and Bottom Output Panels */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <EditorArea />
                    <ProblemsPanel />
                    <TaskRunnerPanel />
                    <TerminalPanel />
                </div>
            </div>
            <StatusBar />

            {/* Modals & Command Palette Overlay */}
            <ThemeSelectorModal isOpen={isThemeModalOpen} onClose={() => setIsThemeModalOpen(false)} />
            <CommandPalette
                isOpen={isCommandPaletteOpen}
                onClose={() => setIsCommandPaletteOpen(false)}
                onOpenThemePicker={() => setIsThemeModalOpen(true)}
                onOpenSourceControl={() => setActiveSidePanel("source-control")}
                onOpenExtensions={() => setActiveSidePanel("extensions")}
            />
            <QuickFileOpenModal
                isOpen={isQuickFileOpen}
                onClose={() => setIsQuickFileOpen(false)}
            />
        </div>
    );
};

