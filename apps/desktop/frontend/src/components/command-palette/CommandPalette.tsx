import React, { useState, useEffect, useRef } from "react";
import { Search, Terminal, Hammer, Wrench, Palette, Save, AlertCircle, GitBranch, Blocks, HelpCircle, Keyboard, BookOpen, Info } from "lucide-react";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { useTaskStore } from "../../stores/useTaskStore";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { useToolchainStore } from "../../stores/useToolchainStore";
import { useSearchStore } from "../../stores/useSearchStore";

interface CommandItem {
    id: string;
    label: string;
    category: string;
    shortcut?: string;
    icon: React.ComponentType<{ className?: string }>;
    action: () => void;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenThemePicker: () => void;
    onOpenSourceControl: () => void;
    onOpenExtensions: () => void;
    onOpenHelp?: (tab?: "overview" | "shortcuts" | "docs" | "about") => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
    isOpen,
    onClose,
    onOpenThemePicker,
    onOpenSourceControl,
    onOpenExtensions,
    onOpenHelp
}) => {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const { activeDocumentId, saveDocument } = useDocumentStore();
    const { buildProject, cleanProject, testProject, toggleProblemsPanel } = useTaskStore();
    const { togglePanel: toggleTerminal } = useTerminalStore();
    const { togglePanel: toggleToolchain, detectSystemToolchains } = useToolchainStore();
    const { togglePanel: toggleSearch } = useSearchStore();

    useEffect(() => {
        if (isOpen) {
            setQuery("");
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const commands: CommandItem[] = [
        {
            id: "file-save",
            label: "File: Save Active File",
            category: "File",
            shortcut: "Ctrl+S",
            icon: Save,
            action: () => {
                if (activeDocumentId) saveDocument(activeDocumentId);
            }
        },
        {
            id: "task-build",
            label: "Tasks: Build Project",
            category: "Build",
            shortcut: "Ctrl+Shift+B",
            icon: Hammer,
            action: () => buildProject()
        },
        {
            id: "task-clean",
            label: "Tasks: Clean Project Build Artifacts",
            category: "Build",
            icon: Hammer,
            action: () => cleanProject()
        },
        {
            id: "task-test",
            label: "Tasks: Run Unit Tests",
            category: "Build",
            icon: Hammer,
            action: () => testProject()
        },
        {
            id: "toolchain-manager",
            label: "Toolchain: Open Toolchain Manager",
            category: "Toolchain",
            icon: Wrench,
            action: () => toggleToolchain()
        },
        {
            id: "toolchain-detect",
            label: "Toolchain: Detect System Toolchains (MinGW, Cargo, Node)",
            category: "Toolchain",
            icon: Wrench,
            action: () => detectSystemToolchains()
        },
        {
            id: "view-terminal",
            label: "View: Toggle Integrated Terminal",
            category: "View",
            shortcut: "Ctrl+`",
            icon: Terminal,
            action: () => toggleTerminal()
        },
        {
            id: "view-problems",
            label: "View: Toggle Problems & Errors Panel",
            category: "View",
            icon: AlertCircle,
            action: () => toggleProblemsPanel()
        },
        {
            id: "view-search",
            label: "View: Toggle Global Search & Replace",
            category: "View",
            shortcut: "Ctrl+Shift+F",
            icon: Search,
            action: () => toggleSearch()
        },
        {
            id: "view-git",
            label: "View: Toggle Source Control (Git)",
            category: "View",
            icon: GitBranch,
            action: () => onOpenSourceControl()
        },
        {
            id: "view-extensions",
            label: "View: Toggle Extensions Marketplace",
            category: "View",
            icon: Blocks,
            action: () => onOpenExtensions()
        },
        {
            id: "preferences-theme",
            label: "Preferences: Color Theme Picker",
            category: "Preferences",
            icon: Palette,
            action: () => onOpenThemePicker()
        },
        {
            id: "help-overview",
            label: "Help: Welcome & Quick Start",
            category: "Help",
            icon: HelpCircle,
            action: () => onOpenHelp?.("overview")
        },
        {
            id: "help-shortcuts",
            label: "Help: Keyboard Shortcuts Reference",
            category: "Help",
            shortcut: "Ctrl+H",
            icon: Keyboard,
            action: () => onOpenHelp?.("shortcuts")
        },
        {
            id: "help-docs",
            label: "Help: Documentation & Features Guide",
            category: "Help",
            icon: BookOpen,
            action: () => onOpenHelp?.("docs")
        },
        {
            id: "help-about",
            label: "Help: About X-Editor",
            category: "Help",
            icon: Info,
            action: () => onOpenHelp?.("about")
        }
    ];

    const filteredCommands = commands.filter(
        (c) =>
            c.label.toLowerCase().includes(query.toLowerCase()) ||
            c.category.toLowerCase().includes(query.toLowerCase())
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filteredCommands[selectedIndex]) {
                filteredCommands[selectedIndex].action();
                onClose();
            }
        } else if (e.key === "Escape") {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg w-full max-w-xl shadow-2xl overflow-hidden text-[var(--text-primary)]">
                <div className="flex items-center px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                    <Search className="w-4 h-4 text-[var(--accent-primary)] mr-3 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a command or search feature (e.g. build, save, theme)..."
                        className="bg-transparent text-sm w-full outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono"
                    />
                </div>

                <div className="max-h-80 overflow-y-auto p-1 hide-scrollbar">
                    {filteredCommands.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[var(--text-muted)]">No matching commands found</div>
                    ) : (
                        filteredCommands.map((cmd, idx) => {
                            const Icon = cmd.icon;
                            const isSelected = idx === selectedIndex;
                            return (
                                <div
                                    key={cmd.id}
                                    onClick={() => {
                                        cmd.action();
                                        onClose();
                                    }}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                    className={`flex items-center justify-between px-3 py-2 rounded text-xs cursor-pointer transition-colors ${
                                        isSelected
                                            ? "bg-[var(--accent-primary)] text-[var(--accent-text)] font-medium"
                                            : "hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                                    }`}
                                >
                                    <div className="flex items-center space-x-3 truncate">
                                        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? "text-[var(--accent-text)]" : "text-[var(--accent-primary)]"}`} />
                                        <span className="truncate">{cmd.label}</span>
                                    </div>
                                    {cmd.shortcut && (
                                        <span
                                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ml-2 ${
                                                isSelected ? "bg-black/20 text-[var(--accent-text)]" : "bg-[var(--bg-hover)] text-[var(--text-muted)]"
                                            }`}
                                        >
                                            {cmd.shortcut}
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
