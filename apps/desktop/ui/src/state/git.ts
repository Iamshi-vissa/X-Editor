// Source-control state for the open folder, refreshed on file changes and window focus.
import { createSignal } from "solid-js";
import { ipc, errorText, type RepoStatus } from "../lib/ipc";
import { toast } from "./ui";
import { workspace, onFsChange } from "./workspace";
import { refreshAllGitGutters } from "./editor";

export const [repo, setRepo] = createSignal<RepoStatus | null>(null);
export const [gitBusy, setGitBusy] = createSignal<string | null>(null);

let timer: number | undefined;
export function refreshGit(delay = 0) {
  clearTimeout(timer);
  timer = window.setTimeout(async () => {
    if (!workspace()) return setRepo(null);
    try {
      setRepo(await ipc.git.status());
    } catch {
      setRepo(null);
    }
  }, delay);
}

onFsChange((paths) => {
  // Ignore churn inside .git except for the refs/index that change status.
  if (paths.some((p) => !/[\\/]\.git[\\/]/.test(p) || /[\\/]\.git[\\/](index|HEAD|refs)/.test(p))) refreshGit(300);
});
window.addEventListener("focus", () => refreshGit(100));

/** Runs a git action with a busy indicator, error toast and status refresh. */
export async function gitAction<T>(label: string, fn: () => Promise<T>, success?: (r: T) => string | null): Promise<T | undefined> {
  setGitBusy(label);
  try {
    const r = await fn();
    const msg = success?.(r);
    if (msg) toast("success", msg, { timeout: 2500 });
    return r;
  } catch (e) {
    toast("error", `${label} failed`, { detail: errorText(e) });
    return undefined;
  } finally {
    setGitBusy(null);
    refreshGit();
    refreshAllGitGutters();
  }
}

export const statusLetter: Record<string, string> = {
  added: "A", modified: "M", deleted: "D", renamed: "R", typechange: "T", untracked: "U", conflicted: "!",
};
