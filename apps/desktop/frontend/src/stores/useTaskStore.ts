import { create } from "zustand";
import { ipc } from "../services/ipc";
import type { Task, TaskExecution, Problem, TaskOutputPayload } from "../services/ipc";

interface TaskStore {
    tasks: Task[];
    activeExecution: TaskExecution | null;
    executionHistory: TaskExecution[];
    outputLines: string[];
    problems: Problem[];
    trustState: 'Trusted' | 'Untrusted';
    isTaskPanelOpen: boolean;
    isProblemsPanelOpen: boolean;
    activeProblem: Problem | null;

    toggleTaskPanel: () => void;
    toggleProblemsPanel: () => void;
    loadTasks: () => Promise<void>;
    loadTrustState: () => Promise<void>;
    setWorkspaceTrust: (trusted: boolean) => Promise<void>;
    runTask: (taskId: string, allowUntrusted?: boolean) => Promise<void>;
    cancelActiveTask: () => Promise<void>;
    restartActiveTask: () => Promise<void>;
    clearOutput: () => void;
    clearProblems: () => void;
    setActiveProblem: (problem: Problem | null) => void;
    setupTaskListeners: () => Promise<() => void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
    tasks: [],
    activeExecution: null,
    executionHistory: [],
    outputLines: [],
    problems: [],
    trustState: 'Untrusted',
    isTaskPanelOpen: false,
    isProblemsPanelOpen: false,
    activeProblem: null,

    toggleTaskPanel: () => set((state) => ({ isTaskPanelOpen: !state.isTaskPanelOpen })),
    toggleProblemsPanel: () => set((state) => ({ isProblemsPanelOpen: !state.isProblemsPanelOpen })),

    loadTasks: async () => {
        try {
            const taskList = await ipc.task.list();
            set({ tasks: taskList });
        } catch (e) {
            console.error("Failed to load tasks:", e);
        }
    },

    loadTrustState: async () => {
        try {
            const trust = await ipc.task.getTrust();
            set({ trustState: trust });
        } catch (e) {
            console.error("Failed to load trust state:", e);
        }
    },

    setWorkspaceTrust: async (trusted) => {
        try {
            await ipc.task.setTrust(trusted);
            set({ trustState: trusted ? 'Trusted' : 'Untrusted' });
        } catch (e) {
            console.error("Failed to set workspace trust:", e);
        }
    },

    runTask: async (taskId, allowUntrusted = false) => {
        set({ isTaskPanelOpen: true, outputLines: [`[TaskRunner] Requesting task execution: ${taskId}...`] });
        try {
            await ipc.task.run(taskId, allowUntrusted);
        } catch (e) {
            const errText = `\n[TaskRunner Error] ${e}`;
            set((state) => ({
                outputLines: [...state.outputLines, errText],
            }));
        }
    },

    cancelActiveTask: async () => {
        const { activeExecution } = get();
        if (activeExecution) {
            try {
                await ipc.task.cancel(activeExecution.execution_id);
            } catch (e) {
                console.error("Failed to cancel task:", e);
            }
        }
    },

    restartActiveTask: async () => {
        const { activeExecution, runTask } = get();
        if (activeExecution) {
            const taskId = activeExecution.task_id;
            await runTask(taskId, true);
        }
    },

    clearOutput: () => set({ outputLines: [] }),
    clearProblems: () => set({ problems: [] }),
    setActiveProblem: (problem) => set({ activeProblem: problem }),

    setupTaskListeners: async () => {
        const unlistenStart = await ipc.events.onTaskStarted((evt: { payload: TaskExecution }) => {
            set({
                activeExecution: evt.payload,
                outputLines: [`[TaskRunner] Task '${evt.payload.task_name}' started...`],
            });
        });

        const unlistenOut = await ipc.events.onTaskOutput((evt: { payload: TaskOutputPayload }) => {
            set((state) => ({
                outputLines: [...state.outputLines, evt.payload.data],
            }));
        });

        const unlistenProb = await ipc.events.onTaskProblem((evt: { payload: Problem }) => {
            set((state) => ({
                problems: [...state.problems, evt.payload],
            }));
        });

        const unlistenDone = await ipc.events.onTaskCompleted((evt: { payload: TaskExecution }) => {
            set((state) => ({
                activeExecution: null,
                executionHistory: [evt.payload, ...state.executionHistory],
                outputLines: [
                    ...state.outputLines,
                    `\n[TaskRunner] Task '${evt.payload.task_name}' finished with status: ${evt.payload.status} (${evt.payload.duration_ms ?? 0}ms)`,
                ],
            }));
        });

        return () => {
            unlistenStart();
            unlistenOut();
            unlistenProb();
            unlistenDone();
        };
    },
}));
