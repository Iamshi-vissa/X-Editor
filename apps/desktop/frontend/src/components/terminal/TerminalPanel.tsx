import React, { useState, useEffect, useRef } from "react";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { Square, Trash2, Plus, Terminal as TerminalIcon } from "lucide-react";

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

    if (!isPanelOpen) return null;

    const activeSession = sessions.find((s) => s.id === activeSessionId);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (activeSessionId && inputVal.trim()) {
            sendInput(activeSessionId, inputVal);
            setInputVal("");
        }
    };

    return (
        <div className="h-64 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex flex-col shrink-0">
            {/* Header / Tabs Bar */}
            <div className="flex items-center justify-between px-4 h-9 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                <div className="flex items-center space-x-2 overflow-x-auto">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center mr-2">
                        <TerminalIcon size={14} className="mr-1" /> Terminal
                    </span>
                    {sessions.map((s) => (
                        <button
                            key={s.id}
                            className={`px-3 py-1 text-xs rounded flex items-center space-x-1 ${
                                activeSessionId === s.id
                                    ? "bg-[var(--bg-hover)] font-medium text-[var(--text-primary)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            }`}
                            onClick={() => setActiveSession(s.id)}
                        >
                            <span>{s.title}</span>
                            <span
                                className={`w-2 h-2 rounded-full ${
                                    s.isRunning ? "bg-green-500" : "bg-gray-400"
                                }`}
                            />
                        </button>
                    ))}
                    <button
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        onClick={() => spawnTerminal()}
                        title="New Terminal"
                    >
                        <Plus size={14} />
                    </button>
                </div>
                {activeSession && (
                    <div className="flex items-center space-x-2">
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
                    </div>
                )}
            </div>

            {/* Output Container */}
            <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-gray-200 bg-[var(--bg-editor)] leading-relaxed">
                {activeSession ? (
                    <div>
                        {activeSession.output.map((line, i) => (
                            <pre key={i} className="whitespace-pre-wrap">
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
                    className="flex items-center px-3 py-1 bg-[var(--bg-primary)] border-t border-[var(--border-primary)]"
                >
                    <span className="text-xs font-mono text-[var(--accent-primary)] mr-2">&gt;</span>
                    <input
                        type="text"
                        className="flex-1 bg-transparent text-xs font-mono text-[var(--text-primary)] focus:outline-none"
                        placeholder="Type a command and press Enter..."
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                    />
                </form>
            )}
        </div>
    );
};
