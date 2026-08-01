import React, { useState, useEffect } from "react";
import { 
    HelpCircle, 
    BookOpen, 
    Keyboard, 
    Info, 
    X, 
    Code2, 
    Terminal, 
    Wrench, 
    Play, 
    Blocks, 
    Search,
    Cpu,
    CheckCircle2
} from "lucide-react";

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: "overview" | "shortcuts" | "docs" | "about";
}

export const HelpModal: React.FC<HelpModalProps> = ({ 
    isOpen, 
    onClose, 
    initialTab = "overview" 
}) => {
    const [activeTab, setActiveTab] = useState<"overview" | "shortcuts" | "docs" | "about">(initialTab);
    const [shortcutFilter, setShortcutFilter] = useState("");

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
            setShortcutFilter("");
        }
    }, [isOpen, initialTab]);

    if (!isOpen) return null;

    const shortcuts = [
        { key: "Ctrl + Shift + P", action: "Open Command Palette", category: "General" },
        { key: "Ctrl + P", action: "Quick Open File by Name", category: "File Navigation" },
        { key: "Ctrl + N", action: "Create New Text File", category: "File Management" },
        { key: "Ctrl + O", action: "Open File from System", category: "File Management" },
        { key: "Ctrl + K  Ctrl + O", action: "Open Folder / Workspace", category: "File Management" },
        { key: "Ctrl + S", action: "Save Active File", category: "File Management" },
        { key: "Ctrl + \\", action: "Toggle Split View Editor", category: "View & Layout" },
        { key: "Ctrl + `", action: "Toggle Integrated Terminal", category: "View & Layout" },
        { key: "Ctrl + Shift + F", action: "Global Search & Replace", category: "Search" },
        { key: "Ctrl + Shift + B", action: "Build Project Tasks", category: "Tasks & Build" },
        { key: "F5", action: "Run Active Project", category: "Tasks & Build" },
        { key: "Ctrl + H", action: "Open Help & Documentation", category: "Help" },
        { key: "F1", action: "Open Command Palette / Help", category: "General" }
    ];

    const filteredShortcuts = shortcuts.filter(s => 
        s.action.toLowerCase().includes(shortcutFilter.toLowerCase()) ||
        s.key.toLowerCase().includes(shortcutFilter.toLowerCase()) ||
        s.category.toLowerCase().includes(shortcutFilter.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden text-[var(--text-primary)] flex flex-col max-h-[85vh]">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-lg bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]">
                            <HelpCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="font-bold text-base tracking-wide">X-Editor Help Center</h2>
                            <p className="text-xs text-[var(--text-muted)]">Documentation, Shortcuts & Information</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-[var(--border-primary)] bg-[var(--bg-primary)]/50 px-6 gap-2 pt-2">
                    <button
                        onClick={() => setActiveTab("overview")}
                        className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                            activeTab === "overview"
                                ? "border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--bg-secondary)] rounded-t-lg"
                                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>Quick Start</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("shortcuts")}
                        className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                            activeTab === "shortcuts"
                                ? "border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--bg-secondary)] rounded-t-lg"
                                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <Keyboard className="w-3.5 h-3.5" />
                        <span>Shortcuts</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("docs")}
                        className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                            activeTab === "docs"
                                ? "border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--bg-secondary)] rounded-t-lg"
                                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Features & Guides</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("about")}
                        className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                            activeTab === "about"
                                ? "border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--bg-secondary)] rounded-t-lg"
                                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <Info className="w-3.5 h-3.5" />
                        <span>About</span>
                    </button>
                </div>

                {/* Tab Content */}
                <div className="p-6 overflow-y-auto flex-1 space-y-4">

                    {/* OVERVIEW TAB */}
                    {activeTab === "overview" && (
                        <div className="space-y-6">
                            <div className="p-4 rounded-xl bg-gradient-to-r from-[var(--accent-primary)]/20 via-[var(--bg-primary)] to-[var(--bg-secondary)] border border-[var(--accent-primary)]/30">
                                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
                                    <span>Welcome to X-Editor</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-primary)] text-white font-mono">v1.0.0</span>
                                </h3>
                                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                    X-Editor is a lightweight, high-performance desktop code editor optimized for speed, polyglot toolchain integration, and custom workflows.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] space-y-2">
                                    <div className="flex items-center space-x-2 text-[var(--accent-primary)]">
                                        <Code2 className="w-4 h-4" />
                                        <span className="font-semibold text-xs text-[var(--text-primary)]">Monaco Code Editor</span>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Rich code editing with syntax highlighting, IntelliSense, split views, auto-indentation, and theme customizations.
                                    </p>
                                </div>

                                <div className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] space-y-2">
                                    <div className="flex items-center space-x-2 text-[var(--accent-primary)]">
                                        <Terminal className="w-4 h-4" />
                                        <span className="font-semibold text-xs text-[var(--text-primary)]">Integrated Terminal</span>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Spawn multiple terminal instances with shell support (`PowerShell`, `cmd`, `bash`) directly in your workspace.
                                    </p>
                                </div>

                                <div className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] space-y-2">
                                    <div className="flex items-center space-x-2 text-[var(--accent-primary)]">
                                        <Wrench className="w-4 h-4" />
                                        <span className="font-semibold text-xs text-[var(--text-primary)]">Toolchain Manager</span>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Auto-detect system compilers & runtimes including Rust (Cargo), C/C++ (MinGW/GCC), and Node.js.
                                    </p>
                                </div>

                                <div className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] space-y-2">
                                    <div className="flex items-center space-x-2 text-[var(--accent-primary)]">
                                        <Play className="w-4 h-4" />
                                        <span className="font-semibold text-xs text-[var(--text-primary)]">Tasks & Problem Parsing</span>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Run project builds and tests with live output logging and real-time error/warning diagnostics.
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold">Need to run a command quickly?</div>
                                    <div className="text-[11px] text-[var(--text-muted)]">Press <kbd className="px-1.5 py-0.5 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded font-mono text-[10px] text-[var(--text-primary)]">Ctrl+Shift+P</kbd> to launch the Command Palette.</div>
                                </div>
                                <button 
                                    onClick={() => setActiveTab("shortcuts")}
                                    className="px-3 py-1.5 bg-[var(--accent-primary)] hover:opacity-90 text-white rounded text-xs transition-opacity cursor-pointer"
                                >
                                    View All Shortcuts
                                </button>
                            </div>
                        </div>
                    )}

                    {/* SHORTCUTS TAB */}
                    {activeTab === "shortcuts" && (
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    placeholder="Filter shortcuts by key or action..."
                                    value={shortcutFilter}
                                    onChange={(e) => setShortcutFilter(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-xs outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                                />
                            </div>

                            <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden bg-[var(--bg-primary)]">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]/50 text-[11px] text-[var(--text-muted)] font-semibold">
                                            <th className="py-2.5 px-4">Shortcut</th>
                                            <th className="py-2.5 px-4">Action</th>
                                            <th className="py-2.5 px-4 text-right">Category</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-primary)] text-xs">
                                        {filteredShortcuts.map((s, idx) => (
                                            <tr key={idx} className="hover:bg-[var(--bg-hover)] transition-colors">
                                                <td className="py-2.5 px-4 font-mono font-medium text-[var(--accent-primary)]">
                                                    <kbd className="px-2 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded shadow-sm text-[11px]">
                                                        {s.key}
                                                    </kbd>
                                                </td>
                                                <td className="py-2.5 px-4 text-[var(--text-primary)]">{s.action}</td>
                                                <td className="py-2.5 px-4 text-right text-[11px] text-[var(--text-muted)]">
                                                    <span className="px-2 py-0.5 bg-[var(--bg-secondary)] rounded-full border border-[var(--border-primary)]">
                                                        {s.category}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredShortcuts.length === 0 && (
                                    <div className="p-4 text-center text-xs text-[var(--text-muted)]">
                                        No shortcuts matching "{shortcutFilter}"
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* DOCS TAB */}
                    {activeTab === "docs" && (
                        <div className="space-y-4 text-xs text-[var(--text-muted)]">
                            <div className="space-y-2 p-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                                <h4 className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] flex items-center justify-center text-[10px]">1</span>
                                    Opening Files & Workspaces
                                </h4>
                                <p className="pl-7">
                                    Use <span className="font-mono text-[var(--text-primary)]">File &gt; Open Folder</span> to set your active workspace directory. All files, tasks, git repository states, and terminal processes operate relative to the current workspace root.
                                </p>
                            </div>

                            <div className="space-y-2 p-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                                <h4 className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] flex items-center justify-center text-[10px]">2</span>
                                    Managing Toolchains
                                </h4>
                                <p className="pl-7">
                                    Open the Toolchain Manager from the Command Palette or Activity Bar. Click "Detect Toolchains" to automatically scan your system PATH for compilers like MinGW <span className="font-mono">gcc</span>, Rust <span className="font-mono">cargo</span>, or Node.js. Select your active default toolchain for building project artifacts.
                                </p>
                            </div>

                            <div className="space-y-2 p-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                                <h4 className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] flex items-center justify-center text-[10px]">3</span>
                                    Executing Tasks & Debugging Errors
                                </h4>
                                <p className="pl-7">
                                    Trigger build and run commands with <span className="font-mono text-[var(--text-primary)]">Ctrl+Shift+B</span> or <span className="font-mono text-[var(--text-primary)]">F5</span>. Build logs stream into the Task Runner panel, and compiler errors are parsed automatically into the Problems panel with line-by-line file jump support.
                                </p>
                            </div>

                            <div className="space-y-2 p-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                                <h4 className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] flex items-center justify-center text-[10px]">4</span>
                                    Source Control & Extensions
                                </h4>
                                <p className="pl-7">
                                    Track Git changes, review modified files, draft commits, and install workspace extensions directly from the Activity Bar on the left panel.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ABOUT TAB */}
                    {activeTab === "about" && (
                        <div className="space-y-6">
                            <div className="flex items-center space-x-4 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)]">
                                <div className="w-14 h-14 rounded-xl bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 flex items-center justify-center text-[var(--accent-primary)] shrink-0">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-base font-bold text-[var(--text-primary)]">X-Editor</h3>
                                    <p className="text-xs text-[var(--text-muted)]">Next-Generation Code Editor & IDE</p>
                                    <div className="flex items-center space-x-2 pt-1 text-[11px] font-mono text-[var(--text-muted)]">
                                        <span className="px-2 py-0.5 bg-[var(--bg-secondary)] rounded border border-[var(--border-primary)]">Version 1.0.0</span>
                                        <span className="px-2 py-0.5 bg-[var(--bg-secondary)] rounded border border-[var(--border-primary)]">Tauri v2</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] space-y-1">
                                    <span className="text-[var(--text-muted)] text-[11px]">Frontend Runtime</span>
                                    <div className="font-medium flex items-center gap-1.5 text-[var(--text-primary)]">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        React 19 & TypeScript
                                    </div>
                                </div>
                                <div className="p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] space-y-1">
                                    <span className="text-[var(--text-muted)] text-[11px]">Native Core</span>
                                    <div className="font-medium flex items-center gap-1.5 text-[var(--text-primary)]">
                                        <Cpu className="w-3.5 h-3.5 text-amber-400" />
                                        Rust Backend (Tauri v2)
                                    </div>
                                </div>
                                <div className="p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] space-y-1">
                                    <span className="text-[var(--text-muted)] text-[11px]">Editor Engine</span>
                                    <div className="font-medium flex items-center gap-1.5 text-[var(--text-primary)]">
                                        <Code2 className="w-3.5 h-3.5 text-sky-400" />
                                        Monaco Editor
                                    </div>
                                </div>
                                <div className="p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] space-y-1">
                                    <span className="text-[var(--text-muted)] text-[11px]">Styling Engine</span>
                                    <div className="font-medium flex items-center gap-1.5 text-[var(--text-primary)]">
                                        <Blocks className="w-3.5 h-3.5 text-purple-400" />
                                        Tailwind CSS v4
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] space-y-2 text-xs text-[var(--text-muted)]">
                                <div className="font-semibold text-[var(--text-primary)]">License & System Info</div>
                                <p className="text-[11px]">
                                    X-Editor is released under the MIT Open Source License. Designed for developer productivity with zero telemetry.
                                </p>
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] text-xs text-[var(--text-muted)]">
                    <span>Press <kbd className="px-1.5 py-0.5 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded font-mono text-[10px]">Esc</kbd> to close</span>
                    <button 
                        onClick={onClose}
                        className="px-4 py-1.5 bg-[var(--bg-hover)] hover:bg-[var(--border-primary)] text-[var(--text-primary)] rounded-md font-medium transition-colors cursor-pointer"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
};
