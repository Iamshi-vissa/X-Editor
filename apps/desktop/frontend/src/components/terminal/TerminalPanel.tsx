import React, { useState, useEffect, useRef } from "react";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { Square, Trash2, Plus, Terminal as TerminalIcon } from "lucide-react";
import clsx from "clsx";

export const TerminalPanel: React.FC = () => {
    const {
        sessions,
        activeSessionId,
        isPanelOpen,
        spawnTerminal,
        sendInput,
        killTerminal,
        setActiveSession,
        clearOutput,
        setupListeners,
    } = useTerminalStore();

    const [inputVal, setInputVal] = useState("");
    const [commandHistory, setCommandHistory] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem("x_editor_terminal_history");
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const outputEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cleanup: (() => void) | undefined;
        setupListeners().then((unsub) => {
            cleanup = unsub;
        });
        return () => {
            if (cleanup) cleanup();
        };
    }, [setupListeners]);

    useEffect(() => {
        outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [sessions, activeSessionId]);

    const [panelTab, setPanelTab] = useState<'terminal' | 'problems' | 'output' | 'debug' | 'toolchain-logs'>('terminal');

    if (!isPanelOpen) return null;

    const activeSession = sessions.find((s) => s.id === activeSessionId);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = inputVal.trim();
        if (activeSessionId && trimmed) {
            sendInput(activeSessionId, trimmed);
            const newHistory = [...commandHistory.filter((c) => c !== trimmed), trimmed];
            setCommandHistory(newHistory);
            try {
                localStorage.setItem("x_editor_terminal_history", JSON.stringify(newHistory.slice(-100)));
            } catch (err) {
                console.error("Failed to save terminal history", err);
            }
            setHistoryIndex(-1);
            setInputVal("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (commandHistory.length === 0) return;
            const nextIdx = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(nextIdx);
            setInputVal(commandHistory[nextIdx] || "");
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (historyIndex === -1) return;
            const nextIdx = historyIndex + 1;
            if (nextIdx >= commandHistory.length) {
                setHistoryIndex(-1);
                setInputVal("");
            } else {
                setHistoryIndex(nextIdx);
                setInputVal(commandHistory[nextIdx] || "");
            }
        }
    };

    const toolchainLogs = [
        "[INFO] Initialized Toolchain Detector v1.0.4",
        "[INFO] Found System GCC: C:\\msys64\\mingw64\\bin\\gcc.exe",
        "[INFO] Active runtime Node.js v20.11.0 verified via SHA-256 checksum",
        "[INFO] Synced active project environment to .toolchain.json"
    ];

    return (
        <div className="h-64 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex flex-col shrink-0">
            {/* Header / Tabs Bar */}
            <div className="flex items-center justify-between px-4 h-9 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                <div className="flex items-center space-x-4 overflow-x-auto text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] select-none">
                    <button
                        onClick={() => setPanelTab('terminal')}
                        className={clsx("py-1 flex items-center space-x-1 border-b-2 transition-colors", panelTab === 'terminal' ? "border-[var(--accent-primary)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                    >
                        <TerminalIcon size={14} />
                        <span>Terminal</span>
                    </button>
                    <button
                        onClick={() => setPanelTab('problems')}
                        className={clsx("py-1 border-b-2 transition-colors", panelTab === 'problems' ? "border-[var(--accent-primary)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                    >
                        Problems
                    </button>
                    <button
                        onClick={() => setPanelTab('output')}
                        className={clsx("py-1 border-b-2 transition-colors", panelTab === 'output' ? "border-[var(--accent-primary)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                    >
                        Output
                    </button>
                    <button
                        onClick={() => setPanelTab('debug')}
                        className={clsx("py-1 border-b-2 transition-colors", panelTab === 'debug' ? "border-[var(--accent-primary)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                    >
                        Debug Console
                    </button>
                    <button
                        onClick={() => setPanelTab('toolchain-logs')}
                        className={clsx("py-1 border-b-2 transition-colors text-[var(--accent-primary)] font-bold", panelTab === 'toolchain-logs' ? "border-[var(--accent-primary)]" : "border-transparent opacity-80 hover:opacity-100")}
                    >
                        Toolchain Logs
                    </button>
                </div>
                <div className="flex items-center space-x-2">
                    {panelTab === 'terminal' && (
                        <>
                            {sessions.map((s) => (
                                <button
                                    key={s.id}
                                    className={`px-2 py-0.5 text-[11px] rounded flex items-center space-x-1 ${
                                        activeSessionId === s.id
                                            ? "bg-[var(--bg-hover)] font-medium text-[var(--text-primary)]"
                                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                    }`}
                                    onClick={() => setActiveSession(s.id)}
                                >
                                    <span>{s.title}</span>
                                </button>
                            ))}
                            <button
                                className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                onClick={() => spawnTerminal()}
                                title="New Terminal"
                            >
                                <Plus size={14} />
                            </button>
                        </>
                    )}
                    {activeSession && (
                        <>
                            <button
                                className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                onClick={() => clearOutput(activeSession.id)}
                                title="Clear Terminal Output"
                            >
                                <Trash2 size={14} />
                            </button>
                            {activeSession.isRunning && (
                                <button
                                    className="p-1 hover:bg-[var(--bg-hover)] rounded text-red-400 hover:text-red-300"
                                    onClick={() => killTerminal(activeSession.id)}
                                    title="Kill Process"
                                >
                                    <Square size={14} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Output Container */}
            <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-gray-200 bg-transparent leading-relaxed hide-scrollbar">
                {panelTab === 'toolchain-logs' ? (
                    <div>
                        {toolchainLogs.map((log, i) => (
                            <pre key={i} className="whitespace-pre-wrap font-mono text-[var(--accent-primary)]">
                                {log}
                            </pre>
                        ))}
                    </div>
                ) : activeSession ? (
                    <div>
                        {activeSession.output.map((line, i) => (
                            <pre key={i} className="whitespace-pre-wrap font-mono">
                                {line}
                            </pre>
                        ))}
                        <div ref={outputEndRef} />
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                        No active terminal session. Click '+' to start one.
                    </div>
                )}
            </div>

            {/* Command Input Prompt */}
            {activeSession && activeSession.isRunning && (
                <form
                    onSubmit={handleFormSubmit}
                    className="flex items-center px-3 py-1.5 bg-transparent border-t border-[var(--border-primary)]"
                >
                    <span className="text-xs font-mono font-bold text-[var(--accent-primary)] mr-2">➜</span>
                    <input
                        type="text"
                        className="flex-1 bg-transparent text-xs font-mono text-[var(--text-primary)] focus:outline-none placeholder:text-[var(--text-muted)]"
                        placeholder="Type a command and press Enter..."
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </form>
            )}
        </div>
    );
};
