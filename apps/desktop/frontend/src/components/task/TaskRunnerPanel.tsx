import React, { useEffect, useRef } from "react";
import { useTaskStore } from "../../stores/useTaskStore";
import { Play, Square, RotateCw, ShieldAlert, ShieldCheck, Trash2, X, Hammer } from "lucide-react";

export const TaskRunnerPanel: React.FC = () => {
    const {
        tasks,
        activeExecution,
        outputLines,
        trustState,
        isTaskPanelOpen,
        toggleTaskPanel,
        loadTasks,
        loadTrustState,
        setWorkspaceTrust,
        runTask,
        buildProject,
        cleanProject,
        testProject,
        cancelActiveTask,
        restartActiveTask,
        clearOutput,
        setupTaskListeners,
    } = useTaskStore();

    const outputEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadTasks();
        loadTrustState();
        let cleanup: (() => void) | undefined;
        setupTaskListeners().then((unsub) => {
            cleanup = unsub;
        });
        return () => {
            if (cleanup) cleanup();
        };
    }, [loadTasks, loadTrustState, setupTaskListeners]);

    useEffect(() => {
        outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [outputLines]);

    if (!isTaskPanelOpen) return null;

    const buildTasks = tasks.filter((t) => t.task_type === "build");
    const runTasks = tasks.filter((t) => t.task_type === "run");
    const cleanTasks = tasks.filter((t) => t.task_type === "clean");
    const testTasks = tasks.filter((t) => t.task_type === "test");
    const customTasks = tasks.filter((t) => t.task_type === "custom");

    return (
        <div className="h-72 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex flex-col shrink-0">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between px-4 h-9 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                <div className="flex items-center space-x-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center">
                        <Hammer size={14} className="mr-1.5" /> Task Runner & Build Output
                    </span>

                    {/* Quick action buttons */}
                    <div className="flex items-center space-x-1 border-l border-r border-[#333] px-2">
                        <button
                            onClick={() => buildProject()}
                            className="px-2 py-0.5 text-xs bg-[#007acc] hover:bg-[#0062a3] text-white rounded font-medium"
                            title="Build Active Project"
                        >
                            Build
                        </button>
                        <button
                            onClick={() => runTasks.length > 0 ? runTask(runTasks[0].id, true) : buildProject()}
                            className="px-2 py-0.5 text-xs bg-[#238636] hover:bg-[#2ea043] text-white rounded font-medium"
                            title="Run Project"
                        >
                            Run
                        </button>
                        <button
                            onClick={() => cleanProject()}
                            className="px-2 py-0.5 text-xs bg-[#3c3c3c] hover:bg-[#4a4a4a] text-white rounded"
                            title="Clean Project"
                        >
                            Clean
                        </button>
                        <button
                            onClick={() => testProject()}
                            className="px-2 py-0.5 text-xs bg-[#3c3c3c] hover:bg-[#4a4a4a] text-white rounded"
                            title="Test Project"
                        >
                            Test
                        </button>
                    </div>

                    {/* Trust status badge */}
                    <button
                        className={`text-xs px-2 py-0.5 rounded flex items-center space-x-1 ${
                            trustState === "Trusted"
                                ? "bg-green-900/40 text-green-300 border border-green-700/50"
                                : "bg-yellow-900/40 text-yellow-300 border border-yellow-700/50"
                        }`}
                        onClick={() => setWorkspaceTrust(trustState !== "Trusted")}
                        title="Toggle Workspace Trust"
                    >
                        {trustState === "Trusted" ? (
                            <>
                                <ShieldCheck size={12} />
                                <span>Trusted Workspace</span>
                            </>
                        ) : (
                            <>
                                <ShieldAlert size={12} />
                                <span>Untrusted (Click to Trust)</span>
                            </>
                        )}
                    </button>
                </div>

                <div className="flex items-center space-x-2">
                    {activeExecution ? (
                        <button
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded flex items-center space-x-1"
                            onClick={cancelActiveTask}
                            title="Cancel Task Process Tree"
                        >
                            <Square size={12} />
                            <span>Stop Process</span>
                        </button>
                    ) : (
                        <button
                            className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            onClick={restartActiveTask}
                            title="Restart Last Task"
                        >
                            <RotateCw size={14} />
                        </button>
                    )}
                    <button
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        onClick={clearOutput}
                        title="Clear Output"
                    >
                        <Trash2 size={14} />
                    </button>
                    <button
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        onClick={toggleTaskPanel}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Main Panel Content: Split into Task List & Output Log */}
            <div className="flex-1 flex overflow-hidden">
                {/* Task Selection Sidebar */}
                <div className="w-56 bg-[var(--bg-primary)] border-r border-[var(--border-primary)] p-3 overflow-y-auto space-y-3">
                    <TaskGroup title="Build" tasks={buildTasks} onRun={(id) => runTask(id, true)} />
                    <TaskGroup title="Run" tasks={runTasks} onRun={(id) => runTask(id, true)} />
                    <TaskGroup title="Clean" tasks={cleanTasks} onRun={(id) => runTask(id, true)} />
                    <TaskGroup title="Test" tasks={testTasks} onRun={(id) => runTask(id, true)} />
                    <TaskGroup title="Custom" tasks={customTasks} onRun={(id) => runTask(id, true)} />
                </div>

                {/* Live Task Console Output */}
                <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-gray-200 bg-[var(--bg-editor)] leading-relaxed">
                    {outputLines.map((line, i) => (
                        <pre key={i} className="whitespace-pre-wrap">
                            {line}
                        </pre>
                    ))}
                    <div ref={outputEndRef} />
                </div>
            </div>
        </div>
    );
};

const TaskGroup: React.FC<{
    title: string;
    tasks: { id: string; name: string }[];
    onRun: (id: string) => void;
}> = ({ title, tasks, onRun }) => {
    if (tasks.length === 0) return null;

    return (
        <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                {title}
            </div>
            <div className="space-y-1">
                {tasks.map((t) => (
                    <button
                        key={t.id}
                        className="w-full text-left px-2 py-1 text-xs rounded hover:bg-[var(--bg-hover)] text-[var(--text-primary)] flex items-center justify-between group"
                        onClick={() => onRun(t.id)}
                    >
                        <span className="truncate">{t.name}</span>
                        <Play size={10} className="opacity-0 group-hover:opacity-100 text-[var(--accent-primary)]" />
                    </button>
                ))}
            </div>
        </div>
    );
};
