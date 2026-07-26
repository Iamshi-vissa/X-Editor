import { create } from "zustand";
import { ipc } from "../services/ipc";
import type { ProcessOutputChunk, ProcessExitPayload } from "../services/ipc";

export interface TerminalSession {
    id: string;
    title: string;
    output: string[];
    isRunning: boolean;
}

interface TerminalStore {
    sessions: TerminalSession[];
    activeSessionId: string | null;
    isPanelOpen: boolean;
    togglePanel: () => void;
    spawnTerminal: (command?: string, args?: string[]) => Promise<void>;
    sendInput: (sessionId: string, input: string) => Promise<void>;
    killTerminal: (sessionId: string) => Promise<void>;
    appendOutput: (sessionId: string, data: string) => void;
    setActiveSession: (id: string) => void;
    clearOutput: (sessionId: string) => void;
    setupListeners: () => Promise<() => void>;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
    sessions: [],
    activeSessionId: null,
    isPanelOpen: false,

    togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

    spawnTerminal: async (command = "cmd.exe", args = []) => {
        const id = `term_${Date.now()}`;
        const newSession: TerminalSession = {
            id,
            title: `Terminal (${command})`,
            output: [`Starting process: ${command}...`],
            isRunning: true,
        };

        set((state) => ({
            sessions: [...state.sessions, newSession],
            activeSessionId: id,
            isPanelOpen: true,
        }));

        try {
            await ipc.process.spawn(id, command, args);
        } catch (e) {
            get().appendOutput(id, `\nError spawning process: ${e}`);
        }
    },

    sendInput: async (sessionId, input) => {
        try {
            await ipc.process.writeStdin(sessionId, input.endsWith("\n") ? input : input + "\n");
        } catch (e) {
            get().appendOutput(sessionId, `\nFailed to send input: ${e}`);
        }
    },

    killTerminal: async (sessionId) => {
        try {
            await ipc.process.kill(sessionId);
        } catch (e) {
            console.error("Failed to kill terminal:", e);
        }
        set((state) => ({
            sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, isRunning: false } : s)),
        }));
    },

    appendOutput: (sessionId, data) => {
        set((state) => ({
            sessions: state.sessions.map((s) =>
                s.id === sessionId ? { ...s, output: [...s.output, data] } : s
            ),
        }));
    },

    setActiveSession: (id) => set({ activeSessionId: id }),

    clearOutput: (sessionId) => {
        set((state) => ({
            sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, output: [] } : s)),
        }));
    },

    setupListeners: async () => {
        const unlistenOut = await ipc.events.onStdout((event: { payload: ProcessOutputChunk }) => {
            get().appendOutput(event.payload.process_id, event.payload.data);
        });

        const unlistenErr = await ipc.events.onStderr((event: { payload: ProcessOutputChunk }) => {
            get().appendOutput(event.payload.process_id, event.payload.data);
        });

        const unlistenExit = await ipc.events.onExit((event: { payload: ProcessExitPayload }) => {
            get().appendOutput(
                event.payload.process_id,
                `\n[Process exited with code ${event.payload.code ?? "unknown"}]`
            );
            set((state) => ({
                sessions: state.sessions.map((s) =>
                    s.id === event.payload.process_id ? { ...s, isRunning: false } : s
                ),
            }));
        });

        return () => {
            unlistenOut();
            unlistenErr();
            unlistenExit();
        };
    },
}));
