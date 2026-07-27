import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event";

export interface DirectoryEntry {
    name: string;
    path: string;
    is_dir: boolean;
}

export interface AppSettings {
    theme: string;
}

export interface SearchResultMatch {
    path: string;
    filename: string;
    line_number: number | null;
    line_snippet: string | null;
}

export interface ProcessOutputChunk {
    process_id: string;
    data: string;
}

export interface ProcessExitPayload {
    process_id: string;
    code: number | null;
}

export interface WorkspaceChangeEvent {
    kind: 'create' | 'modify' | 'remove' | 'rename';
    path: string;
}

export type TaskType = 'build' | 'run' | 'clean' | 'test' | 'custom';
export type TaskState = 'idle' | 'resolving' | 'preparing' | 'starting' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'pending';
export type ProblemSeverity = 'error' | 'warning' | 'info';

export interface Task {
    id: string;
    name: string;
    task_type: TaskType;
    command: string;
    args: string[];
    working_directory?: string;
    environment?: Record<string, string>;
    depends_on?: string[];
    problem_matcher?: string;
    group?: string;
}

export interface TaskExecution {
    execution_id: string;
    task_id: string;
    task_name: string;
    process_id?: string;
    status: TaskState;
    started_at: number;
    completed_at?: number;
    duration_ms?: number;
    exit_code?: number;
    output_summary?: string;
}

export interface Problem {
    file: string;
    line: number;
    column?: number;
    severity: ProblemSeverity;
    message: string;
    source: string;
}

export interface TaskOutputPayload {
    execution_id: string;
    data: string;
}

export type ToolchainStatus = 'available' | 'installed' | 'active' | 'invalid' | 'verificationfailed' | 'installing';
export type VerificationState = 'checksumverified' | 'signatureverified' | 'installationvalidated';
export type ToolchainScope = 'global' | 'user' | 'project';

export interface ToolchainManifest {
    id: string;
    name: string;
    language: string;
    version: string;
    platform: string;
    architecture: string;
    distribution: string;
    source_url: string;
    download_url: string;
    sha256_checksum: string;
    signature?: string;
    license: string;
    installation_path?: string;
    executable_paths?: Record<string, string>;
    environment_variables?: Record<string, string>;
    capabilities?: string[];
    scope: ToolchainScope;
    status: ToolchainStatus;
    verification_states: VerificationState[];
}

export interface ProjectToolchainRequirement {
    language: string;
    distribution: string;
    version: string;
}

export interface ToolchainProgressPayload {
    toolchain_id: string;
    stage: string;
    progress_percent: number;
    message: string;
}

export const ipc = {
    workspace: {
        select: async (path: string): Promise<void> => {
            return await invoke("workspace_select", { path });
        },
        get: async (): Promise<string | null> => {
            return await invoke("workspace_get");
        },
        listDirectory: async (path: string): Promise<DirectoryEntry[]> => {
            return await invoke("workspace_list_directory", { path });
        }
    },
    filesystem: {
        readFile: async (path: string): Promise<string> => {
            return await invoke("filesystem_read_file", { path });
        },
        writeFile: async (path: string, content: string): Promise<void> => {
            return await invoke("filesystem_write_file", { path, content });
        },
        createFile: async (path: string, content?: string): Promise<void> => {
            return await invoke("filesystem_create_file", { path, content });
        },
        createDir: async (path: string): Promise<void> => {
            return await invoke("filesystem_create_dir", { path });
        },
        rename: async (oldPath: string, newPath: string): Promise<void> => {
            return await invoke("filesystem_rename", { oldPath, newPath });
        },
        delete: async (path: string): Promise<void> => {
            return await invoke("filesystem_delete", { path });
        },
        search: async (query: string, isContent: boolean): Promise<SearchResultMatch[]> => {
            return await invoke("filesystem_search", { query, isContent });
        }
    },
    process: {
        spawn: async (processId: string, command: string, args: string[], cwd?: string): Promise<string> => {
            return await invoke("process_spawn", { processId, command, args, cwd });
        },
        spawnToolchainTerminal: async (processId: string, command: string, args: string[], cwd?: string): Promise<string> => {
            return await invoke("process_spawn_toolchain_terminal", { processId, command, args, cwd });
        },
        writeStdin: async (processId: string, input: string): Promise<void> => {
            return await invoke("process_write_stdin", { processId, input });
        },
        kill: async (processId: string): Promise<void> => {
            return await invoke("process_kill", { processId });
        }
    },
    task: {
        list: async (): Promise<Task[]> => {
            return await invoke("task_list");
        },
        get: async (taskId: string): Promise<Task> => {
            return await invoke("task_get", { taskId });
        },
        run: async (taskId: string, allowUntrusted?: boolean): Promise<string> => {
            return await invoke("task_run", { taskId, allowUntrusted });
        },
        build: async (allowUntrusted?: boolean): Promise<string> => {
            return await invoke("task_build", { allowUntrusted });
        },
        clean: async (allowUntrusted?: boolean): Promise<string> => {
            return await invoke("task_clean", { allowUntrusted });
        },
        test: async (allowUntrusted?: boolean): Promise<string> => {
            return await invoke("task_test", { allowUntrusted });
        },
        cancel: async (executionId: string): Promise<void> => {
            return await invoke("task_cancel", { executionId });
        },
        clearHistory: async (): Promise<void> => {
            return await invoke("task_clear_history");
        },
        history: async (): Promise<TaskExecution[]> => {
            return await invoke("task_history");
        },
        setTrust: async (trusted: boolean): Promise<void> => {
            return await invoke("task_trust_set", { trusted });
        },
        getTrust: async (): Promise<'Trusted' | 'Untrusted'> => {
            return await invoke("task_trust_get");
        }
    },
    toolchain: {
        listInstalled: async (): Promise<ToolchainManifest[]> => {
            return await invoke("toolchain_list_installed");
        },
        listAvailable: async (): Promise<ToolchainManifest[]> => {
            return await invoke("toolchain_list_available");
        },
        detect: async (): Promise<ToolchainManifest[]> => {
            return await invoke("toolchain_detect");
        },
        getActive: async (): Promise<ToolchainManifest[]> => {
            return await invoke("toolchain_get_active");
        },
        install: async (manifest: ToolchainManifest, scope: string, allowUntrusted?: boolean): Promise<ToolchainManifest> => {
            return await invoke("toolchain_install", { manifest, scope, allowUntrusted });
        },
        uninstall: async (id: string): Promise<void> => {
            return await invoke("toolchain_uninstall", { id });
        },
        setProjectRequirement: async (requirement: ProjectToolchainRequirement, allowUntrusted?: boolean): Promise<void> => {
            return await invoke("toolchain_set_project", { requirement, allowUntrusted });
        }
    },
    events: {
        onStdout: async (callback: EventCallback<ProcessOutputChunk>): Promise<UnlistenFn> => {
            return await listen<ProcessOutputChunk>("process://stdout", callback);
        },
        onStderr: async (callback: EventCallback<ProcessOutputChunk>): Promise<UnlistenFn> => {
            return await listen<ProcessOutputChunk>("process://stderr", callback);
        },
        onExit: async (callback: EventCallback<ProcessExitPayload>): Promise<UnlistenFn> => {
            return await listen<ProcessExitPayload>("process://exit", callback);
        },
        onWorkspaceChange: async (callback: EventCallback<WorkspaceChangeEvent>): Promise<UnlistenFn> => {
            return await listen<WorkspaceChangeEvent>("workspace://change", callback);
        },
        onTaskStarted: async (callback: EventCallback<TaskExecution>): Promise<UnlistenFn> => {
            return await listen<TaskExecution>("task://started", callback);
        },
        onTaskOutput: async (callback: EventCallback<TaskOutputPayload>): Promise<UnlistenFn> => {
            return await listen<TaskOutputPayload>("task://output", callback);
        },
        onTaskProblem: async (callback: EventCallback<Problem>): Promise<UnlistenFn> => {
            return await listen<Problem>("task://problem", callback);
        },
        onTaskCompleted: async (callback: EventCallback<TaskExecution>): Promise<UnlistenFn> => {
            return await listen<TaskExecution>("task://completed", callback);
        },
        onToolchainProgress: async (callback: EventCallback<ToolchainProgressPayload>): Promise<UnlistenFn> => {
            return await listen<ToolchainProgressPayload>("toolchain://progress", callback);
        },
        onToolchainCompleted: async (callback: EventCallback<ToolchainManifest>): Promise<UnlistenFn> => {
            return await listen<ToolchainManifest>("toolchain://completed", callback);
        }
    },
    settings: {
        get: async (): Promise<AppSettings> => {
            return await invoke("settings_get");
        },
        update: async (theme: string): Promise<void> => {
            return await invoke("settings_update", { theme });
        }
    }
};
