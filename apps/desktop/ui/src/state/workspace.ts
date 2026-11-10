// The open folder and its lazily loaded file tree. The tree refreshes the folders that
// the Rust watcher reports as changed, so edits made outside the app show up instantly.
import { createSignal, batch } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { listen } from "@tauri-apps/api/event";
import { ipc, type DirEntry, type WorkspaceInfo, errorText } from "../lib/ipc";
import { dirname, norm } from "../lib/paths";
import { settings } from "./settings";
import { toast } from "./ui";

export const [workspace, setWorkspace] = createSignal<WorkspaceInfo | null>(null);
export const [recent, setRecent] = createSignal<string[]>([]);

/** Directory listings keyed by normalised path. */
export const [tree, setTree] = createStore<Record<string, DirEntry[] | undefined>>({});
export const [expanded, setExpanded] = createStore<Record<string, boolean>>({});

let fileListCache: string[] | null = null;
const changeListeners = new Set<(paths: string[]) => void>();
export function onFsChange(fn: (paths: string[]) => void) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export async function loadDir(path: string) {
  try {
    const entries = await ipc.fs.listDir(path);
    const excluded = new Set(settings["files.exclude"]);
    setTree(norm(path), entries.filter((e) => !excluded.has(e.name)));
  } catch (e) {
    setTree(norm(path), []);
    console.warn("listDir failed", path, e);
  }
}

export async function toggleDir(path: string, open?: boolean) {
  const key = norm(path);
  const next = open ?? !expanded[key];
  setExpanded(key, next);
  if (next && !tree[key]) await loadDir(path);
}

export async function listFiles(): Promise<string[]> {
  if (!workspace()) return [];
  if (!fileListCache) {
    try {
      fileListCache = await ipc.fs.listFiles();
    } catch {
      fileListCache = [];
    }
  }
  return fileListCache;
}

export async function refreshRecent() {
  setRecent(await ipc.workspace.recent().catch(() => []));
}

export function applyWorkspace(info: WorkspaceInfo) {
  batch(() => {
    setTree(produce((t) => { for (const k of Object.keys(t)) delete t[k]; }));
    setExpanded(produce((t) => { for (const k of Object.keys(t)) delete t[k]; }));
    fileListCache = null;
    setWorkspace(info);
    setExpanded(norm(info.root), true);
  });
  loadDir(info.root);
  refreshRecent();
}

export async function closeWorkspaceBackend() {
  await ipc.workspace.close();
  setWorkspace(null);
  fileListCache = null;
}

export async function pickWorkspace(): Promise<WorkspaceInfo | null> {
  try {
    return await ipc.workspace.pick();
  } catch (e) {
    toast("error", "Couldn't open folder", { detail: errorText(e) });
    return null;
  }
}

export async function initWorkspaceEvents() {
  await listen<string[]>("fs://changed", (e) => {
    const paths = e.payload;
    fileListCache = null;
    const dirs = new Set<string>();
    for (const p of paths) {
      const d = norm(dirname(p));
      if (tree[d]) dirs.add(d);
      if (tree[norm(p)]) dirs.add(norm(p));
    }
    for (const d of dirs) loadDir(d);
    for (const fn of changeListeners) fn(paths);
  });
}
