// App-level actions that span several stores: opening folders, running code, cloning,
// switching themes, restoring the session.
import { batch, createSignal } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc, errorText, type WorkspaceInfo } from "../lib/ipc";
import { basename, relative } from "../lib/paths";
import { isMarkdown } from "../lib/languages";
import { setSetting, settings } from "./settings";
import { builtinThemes, isTheme, type Theme } from "./themes";
import { appInfo, ask, dismissToast, layout, pick, prompt, setLayout, toast } from "./ui";
import { applyWorkspace, closeWorkspaceBackend, pickWorkspace, workspace, listFiles } from "./workspace";
import {
  activeDoc, activeTab, closeAllTabs, groups, hasDirtyDocs, openFile, openSpecialTab, openTabsForSession, saveAll,
  setActiveGroup, focusTab, saveDoc, setGroups,
} from "./editor";
import { runInTerminal, sessions, killTerminal, createTerminal } from "./terminal";
import { refreshGit, gitAction, repo } from "./git";
import { setLspWorkspace } from "../editor/lsp";

export const [customThemes, setCustomThemes] = createSignal<Theme[]>([]);
export const allThemes = () => [...builtinThemes, ...customThemes()];

export async function loadCustomThemes() {
  const raw: unknown[] = await ipc.app.readThemes().catch(() => []);
  setCustomThemes(raw.filter((t): t is Theme => isTheme(t)));
}

async function enterWorkspace(info: WorkspaceInfo | null) {
  if (!info) return;
  if (workspace() && !(await closeAllTabs())) return;
  for (const s of [...sessions]) await killTerminal(s.id);
  await setLspWorkspace(info.root);
  applyWorkspace(info);
  if (layout.mode === "studio") setLayout({ sidebarOpen: true, sidebarView: "explorer" });
  refreshGit();
  await restoreTabs(info.root);
  getCurrentWindow().setTitle(`${info.name} — X-Editor`).catch(() => {});
}

export async function openFolder() {
  await enterWorkspace(await pickWorkspace());
}

export async function openRecent(path: string) {
  try {
    await enterWorkspace(await ipc.workspace.openRecent(path));
  } catch (e) {
    toast("error", "Couldn't open folder", {
      detail: errorText(e),
      actions: [{ label: "Remove from recent", run: () => ipc.workspace.removeRecent(path) }],
    });
  }
}

export async function closeFolder() {
  if (!(await closeAllTabs())) return;
  for (const s of [...sessions]) await killTerminal(s.id);
  await setLspWorkspace(null);
  await closeWorkspaceBackend();
  refreshGit();
  getCurrentWindow().setTitle("X-Editor").catch(() => {});
}

export async function openFileDialog() {
  const p = await ipc.fs.pickFile().catch((e) => { toast("error", "Couldn't open file", { detail: errorText(e) }); return null; });
  if (p) await openFile(p);
}

export async function pickRecentFolder() {
  const list = await ipc.workspace.recent();
  if (!list.length) return toast("info", "No recent folders yet");
  const item = await pick(list.map((p) => ({ id: p, label: basename(p), detail: p, icon: "folder" })), "Open a recent folder");
  if (item) openRecent(item.id);
}

// Running code
async function shellKind() {
  return appInfo()?.shell.kind ?? "posix";
}

export async function runActiveFile() {
  const doc = activeDoc();
  if (!doc) return toast("info", "Open a file to run it");
  if (!doc.path) {
    toast("info", "Save the file first so it can run");
    return;
  }
  if (!(await saveDoc(doc.id, { quiet: true }))) return;
  const plan = await ipc.runtime.planFile(doc.path, await shellKind()).catch((e) => { toast("error", "Can't run this file", { detail: errorText(e) }); return null; });
  if (!plan) return toast("info", `X-Editor doesn't know how to run ${basename(doc.path)} yet`, { detail: "Run it from the terminal, or use Run Project." });
  await runInTerminal(plan.command, plan.cwd);
}

export async function runProject() {
  if (!workspace()) return toast("info", "Open a folder first");
  if (hasDirtyDocs()) await saveAll();
  const plan = await ipc.runtime.planProject(await shellKind()).catch(() => null);
  if (!plan) return toast("info", "No run command found for this project", { detail: "X-Editor looks for Cargo.toml, package.json scripts, go.mod, main.py, Makefile and more." });
  await runInTerminal(plan.command, plan.cwd);
}

export function runCommandInTerminal(command: string) {
  const ws = workspace();
  if (ws) runInTerminal(command, ws.root, "Tasks");
  else createTerminal({ title: "Tasks", run: command });
}

// GitHub / git
export async function cloneRepository(url?: string) {
  const target = url ?? (await prompt("Clone repository", { placeholder: "https://github.com/owner/repo.git", ok: "Choose folder…" }));
  if (!target) return;
  let progressToast: number | null = null;
  const info = await gitAction("Clone", () =>
    ipc.git.clone(target.trim(), (p) => {
      if (progressToast === null && p.total > 0) progressToast = toast("info", `Cloning… ${Math.round((p.received / p.total) * 100)}%`, { sticky: true });
    }),
  );
  if (progressToast !== null) dismissToast(progressToast);
  if (info) await enterWorkspace(info);
}

export async function switchBranch() {
  const branches = await ipc.git.branches().catch((e) => { toast("error", "Couldn't list branches", { detail: errorText(e) }); return null; });
  if (!branches) return;
  const items = [
    { id: "__new", label: "Create new branch…", icon: "plus" },
    ...branches.map((b) => ({ id: b.name, label: b.name, detail: b.isRemote ? "remote" : b.isHead ? "current" : "", icon: "branch" })),
  ];
  const item = await pick(items, `Current branch: ${repo()?.branch ?? "?"}`);
  if (!item) return;
  if (item.id === "__new") {
    const name = await prompt("New branch name", { placeholder: "feature/my-change", ok: "Create" });
    if (name) await gitAction("Create branch", () => ipc.git.checkout(name.trim(), true), () => `Switched to ${name}`);
  } else {
    await gitAction("Checkout", () => ipc.git.checkout(item.id), () => `Switched to ${item.label}`);
  }
}

// Themes
export async function pickTheme() {
  const original = settings.theme;
  const item = await pick(allThemes().map((t) => ({ id: t.id, label: t.name, detail: t.kind === "light" ? "light" : "dark", icon: "palette" })), "Choose a color theme");
  if (item) setSetting("theme", item.id);
  else setSetting("theme", original);
}

export function openMarkdownPreview() {
  const d = activeDoc();
  if (!d?.path || !isMarkdown(d.path)) return toast("info", "Open a Markdown file to preview it");
  openSpecialTab({ id: `preview:${d.path}`, kind: "preview", title: `Preview ${basename(d.path)}`, path: d.path }, true);
}

export async function openDiff(path: string) {
  openSpecialTab({ id: `diff:${path}`, kind: "diff", title: `${basename(path)} (changes)`, path });
}

// Session: remembers open tabs per folder and the layout.
let sessionTimer: number | undefined;
export function scheduleSessionSave() {
  clearTimeout(sessionTimer);
  sessionTimer = window.setTimeout(async () => {
    const current = await ipc.app.readSession().catch(() => ({}) as Record<string, any>);
    const ws = workspace();
    const folders = { ...(current.folders ?? {}) };
    if (ws) folders[ws.root] = openTabsForSession();
    await ipc.app.writeSession({
      ...current,
      lastFolder: ws?.root ?? null,
      folders,
      layout: { sidebarWidth: layout.sidebarWidth, panelHeight: layout.panelHeight, sidebarView: layout.sidebarView, mode: layout.mode },
    }).catch(() => {});
  }, 800);
}

async function restoreTabs(root: string) {
  const session = await ipc.app.readSession().catch(() => ({}) as Record<string, any>);
  const saved = session.folders?.[root] as { groups: { tabs: string[]; active: string | null }[] } | undefined;
  if (!saved?.groups) return;
  for (let gi = 0; gi < Math.min(saved.groups.length, 2); gi++) {
    const g = saved.groups[gi];
    if (gi === 1 && g.tabs.length && groups.length === 1) setGroups(1, { id: 99, tabs: [], active: null });
    for (const p of g.tabs) await openFile(p, { group: gi });
    if (g.active) {
      const t = groups[gi]?.tabs.find((x) => x.path === g.active);
      if (t) focusTab(t.id);
    }
  }
  setActiveGroup(0);
}

export async function restoreSessionOnStartup() {
  const session = await ipc.app.readSession().catch(() => ({}) as Record<string, any>);
  if (session.layout) {
    batch(() => {
      const l = session.layout;
      if (typeof l.sidebarWidth === "number") setLayout("sidebarWidth", l.sidebarWidth);
      if (typeof l.panelHeight === "number") setLayout("panelHeight", l.panelHeight);
      if (l.sidebarView) setLayout("sidebarView", l.sidebarView);
      if (l.mode === "flow" || l.mode === "studio") setLayout("mode", l.mode);
    });
  }
  if (session.lastFolder) {
    try {
      await enterWorkspace(await ipc.workspace.openRecent(session.lastFolder));
    } catch { /* folder moved or deleted */ }
  }
}

/** Asks before quitting when there are unsaved changes. */
export async function confirmQuit(): Promise<boolean> {
  if (!hasDirtyDocs()) return true;
  const answer = await ask("You have unsaved changes", "Save them before closing X-Editor?", [
    { label: "Cancel", value: "cancel" },
    { label: "Don't Save", value: "discard", danger: true },
    { label: "Save All", value: "save", primary: true },
  ]);
  if (answer === "cancel") return false;
  if (answer === "save") await saveAll();
  return true;
}

export async function quickOpenFiles() {
  return (await listFiles()).map((f) => ({ path: f, label: basename(f), detail: relative(null, f) }));
}

export const tabTitle = () => activeTab()?.title ?? null;
