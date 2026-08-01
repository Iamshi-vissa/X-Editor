import React, { useState, useRef, useEffect } from "react";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { useTaskStore } from "../../stores/useTaskStore";
import { useWorkspaceStore } from "../../stores/useWorkspaceStore";
import { useTerminalStore } from "../../stores/useTerminalStore";

interface MenuItem {
    label: string;
    shortcut?: string;
    action: () => void;
    disabled?: boolean;
}

interface MenuCategory {
    name: string;
    items: MenuItem[];
}

interface MenuBarProps {
    onOpenHelp?: (tab?: "overview" | "shortcuts" | "docs" | "about") => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({ onOpenHelp }) => {
    const { activeDocumentId, saveDocument, toggleSplitView, createNewDocument, openDocument } = useDocumentStore();
    const { buildProject, toggleTaskPanel, tasks, runTask } = useTaskStore();
    const { selectWorkspace } = useWorkspaceStore();
    const { togglePanel: toggleTerminal } = useTerminalStore();

    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const runTasks = tasks.filter((t) => t.task_type === "run");

    const handleOpenFile = async () => {
        try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: false, multiple: false });
            if (selected && typeof selected === "string") {
                await openDocument(selected, false);
            }
        } catch {
            const path = prompt("Enter file absolute path to open:");
            if (path) openDocument(path, false);
        }
        setActiveMenu(null);
    };

    const handleOpenFolder = async () => {
        try {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: true });
            if (selected && typeof selected === "string") {
                await selectWorkspace(selected);
            }
        } catch {
            const path = prompt("Enter folder absolute path to open workspace:");
            if (path) selectWorkspace(path);
        }
        setActiveMenu(null);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const triggerEditAction = (action: "undo" | "redo" | "cut" | "copy" | "paste" | "find" | "replace") => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
            editor.focus();
            switch (action) {
                case "undo":
                    editor.trigger("menu", "undo", null);
                    break;
                case "redo":
                    editor.trigger("menu", "redo", null);
                    break;
                case "cut":
                    document.execCommand("cut");
                    break;
                case "copy":
                    document.execCommand("copy");
                    break;
                case "paste":
                    document.execCommand("paste");
                    break;
                case "find":
                    editor.trigger("menu", "actions.find", null);
                    break;
                case "replace":
                    editor.trigger("menu", "editor.action.startFindReplaceAction", null);
                    break;
            }
        } else {
            try {
                document.execCommand(action);
            } catch (e) {
                console.error("Exec command failed:", e);
            }
        }
    };

    const menus: MenuCategory[] = [
        {
            name: "File",
            items: [
                {
                    label: "New Text File",
                    shortcut: "Ctrl+N",
                    action: () => {
                        createNewDocument();
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Open File...",
                    shortcut: "Ctrl+O",
                    action: handleOpenFile
                },
                {
                    label: "Open Folder...",
                    shortcut: "Ctrl+K Ctrl+O",
                    action: handleOpenFolder
                },
                { 
                    label: "Save", 
                    shortcut: "Ctrl+S", 
                    action: () => {
                        if (activeDocumentId) saveDocument(activeDocumentId);
                        setActiveMenu(null);
                    },
                    disabled: !activeDocumentId
                }
            ]
        },
        {
            name: "Edit",
            items: [
                {
                    label: "Undo",
                    shortcut: "Ctrl+Z",
                    action: () => {
                        triggerEditAction("undo");
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Redo",
                    shortcut: "Ctrl+Y",
                    action: () => {
                        triggerEditAction("redo");
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Cut",
                    shortcut: "Ctrl+X",
                    action: () => {
                        triggerEditAction("cut");
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Copy",
                    shortcut: "Ctrl+C",
                    action: () => {
                        triggerEditAction("copy");
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Paste",
                    shortcut: "Ctrl+V",
                    action: () => {
                        triggerEditAction("paste");
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Find...",
                    shortcut: "Ctrl+F",
                    action: () => {
                        triggerEditAction("find");
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Replace...",
                    shortcut: "Ctrl+H",
                    action: () => {
                        triggerEditAction("replace");
                        setActiveMenu(null);
                    }
                }
            ]
        },
        {
            name: "View",
            items: [
                {
                    label: "Split Editor Right",
                    shortcut: "Ctrl+\\",
                    action: () => {
                        toggleSplitView();
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Integrated Terminal",
                    shortcut: "Ctrl+`",
                    action: () => {
                        toggleTerminal();
                        setActiveMenu(null);
                    }
                }
            ]
        },
        {
            name: "Run",
            items: [
                {
                    label: "Build Project",
                    shortcut: "Ctrl+Shift+B",
                    action: () => {
                        if (!useTaskStore.getState().isTaskPanelOpen) {
                            toggleTaskPanel();
                        }
                        buildProject();
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Run Project",
                    shortcut: "F5",
                    action: () => {
                        if (!useTaskStore.getState().isTaskPanelOpen) {
                            toggleTaskPanel();
                        }
                        if (runTasks.length > 0) {
                            runTask(runTasks[0].id, true);
                        } else {
                            buildProject();
                        }
                        setActiveMenu(null);
                    }
                }
            ]
        },
        { name: "Terminal", items: [
            {
                label: "New Terminal",
                action: () => {
                    useTerminalStore.getState().spawnTerminal();
                    setActiveMenu(null);
                }
            }
        ] },
        { 
            name: "Help", 
            items: [
                {
                    label: "Welcome & Quick Start",
                    action: () => {
                        onOpenHelp?.("overview");
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Keyboard Shortcuts",
                    shortcut: "Ctrl+H",
                    action: () => {
                        onOpenHelp?.("shortcuts");
                        setActiveMenu(null);
                    }
                },
                {
                    label: "Documentation & Features",
                    action: () => {
                        onOpenHelp?.("docs");
                        setActiveMenu(null);
                    }
                },
                {
                    label: "About X-Editor",
                    action: () => {
                        onOpenHelp?.("about");
                        setActiveMenu(null);
                    }
                }
            ] 
        }
    ];

    return (
        <div className="flex items-center h-10 px-3 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] select-none shrink-0 relative z-50" data-tauri-drag-region ref={menuRef}>
            {/* App Branding */}
            <div className="flex items-center gap-2 mr-4 text-[var(--accent-primary)] font-bold pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span className="text-sm tracking-wide">X EDITOR</span>
            </div>

            {/* Menus */}
            <div className="flex items-center gap-1 text-[13px] text-[var(--text-secondary)] font-medium">
                {menus.map((menu) => (
                    <div key={menu.name} className="relative">
                        <div 
                            className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                                activeMenu === menu.name ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                            }`}
                            onClick={() => {
                                if (menu.items.length > 0) {
                                    setActiveMenu(activeMenu === menu.name ? null : menu.name);
                                }
                            }}
                        >
                            {menu.name}
                        </div>

                        {/* Dropdown Content */}
                        {activeMenu === menu.name && menu.items.length > 0 && (
                            <div className="absolute top-full left-0 mt-1 w-48 py-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded shadow-lg">
                                {menu.items.map((item, idx) => (
                                    <div 
                                        key={idx}
                                        onClick={() => !item.disabled && item.action()}
                                        className={`px-3 py-1.5 text-[12px] flex items-center justify-between ${
                                            item.disabled 
                                                ? 'opacity-50 cursor-not-allowed' 
                                                : 'cursor-pointer hover:bg-[var(--accent-primary)] hover:text-[var(--accent-text)]'
                                        }`}
                                    >
                                        <span>{item.label}</span>
                                        {item.shortcut && <span className="opacity-70 text-[10px]">{item.shortcut}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            
            {/* Window Controls Space */}
        </div>
    );
};
