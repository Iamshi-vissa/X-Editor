import React, { useEffect, useState } from "react";
import { Tabs } from "../tabs/Tabs";
import { Breadcrumbs } from "./Breadcrumbs";
import { MonacoAdapter } from "../../adapters/monaco/MonacoAdapter";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { Columns, Map, WrapText, X, Play } from "lucide-react";

export const EditorArea: React.FC = () => {
    const {
        documents,
        activeDocumentId,
        isSplitView,
        secondaryDocumentId,
        toggleSplitView,
        saveDocument
    } = useDocumentStore();

    const { sessions, activeSessionId, spawnTerminal, sendInput } = useTerminalStore();

    const [minimap, setMinimap] = useState(true);
    const [wordWrap, setWordWrap] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (activeDocumentId) saveDocument(activeDocumentId);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeDocumentId, saveDocument]);

    const activeDoc = documents.find(d => d.id === activeDocumentId);
    const secondaryDoc = documents.find(d => d.id === secondaryDocumentId);

    const handleRunActiveFile = async () => {
        if (!activeDoc) return;
        await saveDocument(activeDoc.id);

        const currentDocs = useDocumentStore.getState().documents;
        const doc = currentDocs.find(d => d.id === activeDoc.id) || activeDoc;

        if (doc.path.startsWith("Untitled-")) {
            alert("Please save your file to disk before running code.");
            return;
        }

        const normalizedPath = doc.path.replace(/\\/g, "/");
        const dir = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
        const filename = normalizedPath.substring(normalizedPath.lastIndexOf("/") + 1);
        const basename = filename.includes(".") ? filename.substring(0, filename.lastIndexOf(".")) : filename;
        const ext = filename.includes(".") ? filename.substring(filename.lastIndexOf(".") + 1).toLowerCase() : "";

        const tempDir = (window.navigator.platform.includes("Win") ? "C:/Windows/Temp" : "/tmp");
        const exeName = `${basename}_runner.exe`;
        const exePath = `${tempDir}/${exeName}`;

        let cmd = "";
        switch (ext) {
            case "c":
                cmd = `gcc "${normalizedPath}" -o "${exePath}" && "${exePath}"`;
                break;
            case "cpp":
            case "cc":
            case "cxx":
                cmd = `g++ "${normalizedPath}" -o "${exePath}" && "${exePath}"`;
                break;
            case "py":
            case "pyw":
                cmd = `python "${normalizedPath}"`;
                break;
            case "js":
            case "mjs":
            case "cjs":
                cmd = `node "${normalizedPath}"`;
                break;
            case "ts":
            case "tsx":
            case "jsx":
                cmd = `npx ts-node "${normalizedPath}"`;
                break;
            case "rs":
                cmd = `rustc "${normalizedPath}" -o "${exePath}" && "${exePath}"`;
                break;
            case "go":
                cmd = `go run "${normalizedPath}"`;
                break;
            case "java":
                cmd = `javac "${normalizedPath}" && java -cp "${dir || '.'}" ${basename}`;
                break;
            case "php":
                cmd = `php "${normalizedPath}"`;
                break;
            case "rb":
                cmd = `ruby "${normalizedPath}"`;
                break;
            case "ps1":
                cmd = `powershell -ExecutionPolicy Bypass -File "${normalizedPath}"`;
                break;
            case "bat":
            case "cmd":
                cmd = `"${normalizedPath}"`;
                break;
            case "sh":
                cmd = `bash "${normalizedPath}"`;
                break;
            case "cs":
                cmd = `dotnet run`;
                break;
            default:
                cmd = `echo Executing ${normalizedPath}...`;
                break;
        }

        const activeSession = sessions.find((s) => s.id === activeSessionId);
        if (!activeSession || !activeSession.isRunning) {
            await spawnTerminal("cmd.exe", ["/K", cmd]);
        } else {
            sendInput(activeSession.id, cmd);
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-[var(--bg-editor)] overflow-hidden relative">
            <div className="flex items-center justify-between bg-[var(--bg-secondary)] border-b border-[var(--border-primary)]">
                <div className="flex-1 overflow-hidden">
                    <Tabs />
                </div>
                {/* Editor Action Controls Bar */}
                <div className="flex items-center space-x-1 px-3 border-l border-[var(--border-primary)] shrink-0 h-9 bg-[var(--bg-secondary)]">
                    <button
                        onClick={handleRunActiveFile}
                        className="p-1.5 rounded transition-colors bg-[var(--accent-primary)] text-white hover:opacity-90 flex items-center space-x-1 text-xs font-semibold"
                        title="Run Active File in Terminal"
                    >
                        <Play size={13} fill="currentColor" />
                        <span>Run</span>
                    </button>
                    <button
                        onClick={toggleSplitView}
                        className={`p-1.5 rounded transition-colors ${
                            isSplitView
                                ? "bg-[var(--accent-primary)] text-white"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        }`}
                        title="Split Editor Right"
                    >
                        <Columns size={14} />
                    </button>
                    <button
                        onClick={() => setMinimap(!minimap)}
                        className={`p-1.5 rounded transition-colors ${
                            minimap
                                ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        }`}
                        title="Toggle Minimap"
                    >
                        <Map size={14} />
                    </button>
                    <button
                        onClick={() => setWordWrap(!wordWrap)}
                        className={`p-1.5 rounded transition-colors ${
                            wordWrap
                                ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        }`}
                        title="Toggle Word Wrap"
                    >
                        <WrapText size={14} />
                    </button>
                </div>
            </div>

            <Breadcrumbs />

            <div className="flex-1 flex overflow-hidden relative">
                {/* Primary Left Editor Pane */}
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {activeDoc ? (
                        <MonacoAdapter document={activeDoc} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-[var(--text-muted)] select-none">
                            <div className="text-center">
                                <h1 className="text-3xl font-extrabold mb-2 tracking-tight text-[var(--accent-primary)]">X EDITOR</h1>
                                <p className="text-xs text-[var(--text-muted)]">Select or create a file in the explorer, or press <kbd className="px-1.5 py-0.5 bg-[var(--bg-hover)] rounded border border-[var(--border-primary)] text-white font-mono">Ctrl+P</kbd> to search files.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Secondary Right Split Pane */}
                {isSplitView && (
                    <div className="flex-1 flex flex-col overflow-hidden border-l border-[var(--border-primary)] relative">
                        <div className="h-7 px-3 bg-[var(--bg-primary)] border-b border-[var(--border-primary)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                            <span className="truncate">{secondaryDoc ? secondaryDoc.path.split("/").pop() : "Secondary Pane"}</span>
                            <button
                                onClick={toggleSplitView}
                                className="p-0.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                <X size={12} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                            {secondaryDoc ? (
                                <MonacoAdapter document={secondaryDoc} />
                            ) : (
                                <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)]">
                                    Click any tab or file to view in this split pane.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
