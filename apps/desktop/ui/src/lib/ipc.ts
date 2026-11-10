// Typed wrappers around every Rust command. The UI never touches `invoke` directly.
import { Channel, invoke } from "@tauri-apps/api/core";

export interface ShellInfo { program: string; args: string[]; kind: ShellKind }
export type ShellKind = "posix" | "powershell" | "cmd";
export interface AppInfo {
  os: "windows" | "macos" | "linux" | string;
  version: string;
  configDir: string;
  settingsPath: string;
  shell: ShellInfo;
  githubConfigured: boolean;
}
export interface WorkspaceInfo { root: string; name: string }
export interface DirEntry { name: string; path: string; isDir: boolean; isSymlink: boolean }
export interface FileContent { text: string; eol: "\n" | "\r\n"; size: number }
export interface SearchOptions { query: string; regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean; limit?: number }
export interface SearchMatch { path: string; line: number; column: number; length: number; preview: string }
export interface FileStatus { path: string; status: string; staged: boolean }
export interface RepoStatus { isRepo: boolean; branch: string | null; upstream: string | null; ahead: number; behind: number; files: FileStatus[] }
export interface BranchInfo { name: string; isHead: boolean; isRemote: boolean }
export interface LineChange { kind: "added" | "modified" | "deleted"; from: number; to: number }
export interface DeviceCode { deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number }
export interface GithubUser { login: string; name: string | null; avatarUrl: string; htmlUrl: string; email: string | null }
export interface GithubRepo { fullName: string; description: string | null; private: boolean; cloneUrl: string; htmlUrl: string; language: string | null; stargazersCount: number; updatedAt: string | null }
export interface InstalledRuntime { id: string; name: string; version: string | null; path: string }
export interface RequirementStatus { runtime: string; requested: string; source: string; installedVersion: string | null; satisfied: boolean | null }
export interface RuntimeReport { installed: InstalledRuntime[]; requirements: RequirementStatus[] }
export interface RunPlan { command: string; cwd: string; label: string }
export type TermEvent = { type: "data"; data: string } | { type: "exit"; code: number | null };
export type LspEvent = { type: "message"; data: string } | { type: "log"; data: string } | { type: "exit" };

function channel<T>(handler: (e: T) => void): Channel<T> {
  const ch = new Channel<T>();
  ch.onmessage = handler;
  return ch;
}

export const ipc = {
  app: {
    info: () => invoke<AppInfo>("app_info"),
    readSettings: () => invoke<Record<string, unknown>>("settings_read"),
    writeSettings: (value: Record<string, unknown>) => invoke<void>("settings_write", { value }),
    readSession: () => invoke<Record<string, any>>("session_read"),
    writeSession: (value: Record<string, unknown>) => invoke<void>("session_write", { value }),
    readThemes: () => invoke<unknown[]>("themes_read"),
  },
  workspace: {
    pick: () => invoke<WorkspaceInfo | null>("workspace_pick"),
    openRecent: (path: string) => invoke<WorkspaceInfo>("workspace_open_recent", { path }),
    recent: () => invoke<string[]>("workspace_recent"),
    removeRecent: (path: string) => invoke<void>("workspace_remove_recent", { path }),
    close: () => invoke<void>("workspace_close"),
  },
  fs: {
    listDir: (path: string) => invoke<DirEntry[]>("fs_list_dir", { path }),
    read: (path: string) => invoke<FileContent>("fs_read", { path }),
    write: (path: string, text: string) => invoke<void>("fs_write", { path, text }),
    createFile: (path: string) => invoke<void>("fs_create_file", { path }),
    createDir: (path: string) => invoke<void>("fs_create_dir", { path }),
    rename: (from: string, to: string) => invoke<void>("fs_rename", { from, to }),
    delete: (path: string) => invoke<void>("fs_delete", { path }),
    listFiles: () => invoke<string[]>("fs_list_files"),
    search: (options: SearchOptions) => invoke<SearchMatch[]>("fs_search", { options }),
    pickFile: () => invoke<string | null>("fs_pick_file"),
    pickSavePath: (suggestedName?: string) => invoke<string | null>("fs_pick_save_path", { suggestedName }),
  },
  term: {
    spawn: (
      args: { id: string; cwd?: string; shell?: string; shellArgs?: string[]; cols: number; rows: number },
      onEvent: (e: TermEvent) => void,
    ) => invoke<ShellKind>("term_spawn", { args, onEvent: channel(onEvent) }),
    write: (id: string, data: string) => invoke<void>("term_write", { id, data }),
    resize: (id: string, cols: number, rows: number) => invoke<void>("term_resize", { id, cols, rows }),
    kill: (id: string) => invoke<void>("term_kill", { id }),
  },
  git: {
    status: () => invoke<RepoStatus>("git_status"),
    init: () => invoke<void>("git_init"),
    stage: (paths: string[]) => invoke<void>("git_stage", { paths }),
    stageAll: () => invoke<void>("git_stage_all"),
    unstage: (paths: string[]) => invoke<void>("git_unstage", { paths }),
    discard: (paths: string[], untracked: string[]) => invoke<void>("git_discard", { paths, untracked }),
    commit: (message: string) => invoke<string>("git_commit", { message }),
    branches: () => invoke<BranchInfo[]>("git_branches"),
    checkout: (name: string, create = false) => invoke<void>("git_checkout", { name, create }),
    headText: (path: string) => invoke<string | null>("git_head_text", { path }),
    lineChanges: (path: string, text: string) => invoke<LineChange[]>("git_line_changes", { path, text }),
    pull: () => invoke<string>("git_pull"),
    push: () => invoke<void>("git_push"),
    fetch: () => invoke<void>("git_fetch"),
    clone: (url: string, onProgress: (p: { received: number; total: number }) => void) =>
      invoke<WorkspaceInfo | null>("git_clone", { url, onProgress: channel(onProgress) }),
  },
  auth: {
    status: () => invoke<GithubUser | null>("auth_status"),
    start: () => invoke<DeviceCode>("auth_login_start"),
    wait: (code: DeviceCode) => invoke<GithubUser>("auth_login_wait", { code }),
    cancel: () => invoke<void>("auth_cancel"),
    logout: () => invoke<void>("auth_logout"),
    repos: () => invoke<GithubRepo[]>("github_repos"),
  },
  lsp: {
    start: (id: string, command: string, args: string[], onEvent: (e: LspEvent) => void) =>
      invoke<void>("lsp_start", { id, command, args, onEvent: channel(onEvent) }),
    send: (id: string, message: string) => invoke<void>("lsp_send", { id, message }),
    stop: (id: string) => invoke<void>("lsp_stop", { id }),
    available: (commands: string[]) => invoke<{ command: string; installed: boolean }[]>("lsp_available", { commands }),
  },
  runtime: {
    report: () => invoke<RuntimeReport>("runtime_report"),
    planFile: (path: string, shellKind: ShellKind) => invoke<RunPlan | null>("run_plan_file", { path, shellKind }),
    planProject: (shellKind: ShellKind) => invoke<RunPlan | null>("run_plan_project", { shellKind }),
  },
};

export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}
