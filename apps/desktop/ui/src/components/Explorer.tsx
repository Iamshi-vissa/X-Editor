// File tree: lazy-loaded folders, inline create/rename, delete to trash, git colours,
// context menu and keyboard navigation (Enter opens, F2 renames, Delete trashes).
import { For, Show, createMemo, createSignal } from "solid-js";
import { ChevronRight, FilePlus, FolderPlus, RefreshCw, ListTree } from "lucide-solid";
import { writeText } from "./clipboard";
import { ipc, errorText, type DirEntry } from "../lib/ipc";
import { basename, dirname, join, norm, relative } from "../lib/paths";
import { ask, toast } from "../state/ui";
import { workspace, tree, expanded, toggleDir, loadDir, setExpanded } from "../state/workspace";
import { activeDoc, closeTab, docForPath, openFile } from "../state/editor";
import { repo } from "../state/git";
import { createTerminal } from "../state/terminal";
import { openFolder } from "../state/actions";
import { FileIcon } from "./Icons";
import { showContextMenu } from "./Overlays";

type Pending = { kind: "file" | "dir"; parent: string } | { kind: "rename"; path: string };
const [pending, setPending] = createSignal<Pending | null>(null);
const [selected, setSelected] = createSignal<string | null>(null);

function gitStatusMap() {
  const ws = workspace();
  const r = repo();
  const map = new Map<string, string>();
  if (!ws || !r?.isRepo) return map;
  for (const f of r.files) {
    const status = f.status === "untracked" || f.status === "added" ? "added" : f.status === "deleted" ? "deleted" : f.status === "conflicted" ? "conflicted" : "modified";
    const full = norm(join(ws.root, f.path));
    if (!map.has(full) || status === "conflicted") map.set(full, status);
    // Propagate to parent folders so collapsed folders show they contain changes.
    let d = norm(dirname(full));
    while (d.length > norm(ws.root).length && !map.has(d)) {
      map.set(d, "modified");
      d = norm(dirname(d));
    }
  }
  return map;
}

async function commitPending(name: string) {
  const p = pending();
  setPending(null);
  const trimmed = name.trim();
  if (!p || !trimmed) return;
  if (/[\\/:*?"<>|]/.test(trimmed) && !trimmed.includes("/")) return toast("error", "That name contains characters files can't use");
  try {
    if (p.kind === "rename") {
      const target = join(dirname(p.path), trimmed);
      if (target === p.path) return;
      const open = docForPath(p.path);
      if (open && !(await closeTab(`file:${open.id}`))) return;
      await ipc.fs.rename(p.path, target);
      await loadDir(dirname(p.path));
      if (open) openFile(target);
    } else {
      const target = join(p.parent, trimmed);
      if (p.kind === "file") {
        await ipc.fs.createFile(target);
        await loadDir(dirname(target));
        openFile(target);
      } else {
        await ipc.fs.createDir(target);
        await loadDir(dirname(target));
      }
    }
  } catch (e) {
    toast("error", "Couldn't complete that", { detail: errorText(e) });
  }
}

async function deletePath(entry: DirEntry) {
  const answer = await ask(`Move "${entry.name}" to the trash?`, entry.isDir ? "The folder and everything in it will be moved to the trash." : "You can restore it from the trash.", [
    { label: "Cancel", value: "cancel" },
    { label: "Move to Trash", value: "delete", danger: true, primary: true },
  ]);
  if (answer !== "delete") return;
  const open = docForPath(entry.path);
  if (open) await closeTab(`file:${open.id}`, { force: true });
  try {
    await ipc.fs.delete(entry.path);
    await loadDir(dirname(entry.path));
  } catch (e) {
    toast("error", "Couldn't delete", { detail: errorText(e) });
  }
}

function startCreate(kind: "file" | "dir", parent: string) {
  setExpanded(norm(parent), true);
  if (!tree[norm(parent)]) loadDir(parent);
  setPending({ kind, parent });
}

function InlineInput(p: { initial?: string; depth: number; icon?: boolean }) {
  let el!: HTMLInputElement;
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    if (save) commitPending(el.value);
    else setPending(null);
  };
  setTimeout(() => {
    el?.focus();
    const dot = (p.initial ?? "").lastIndexOf(".");
    el?.setSelectionRange(0, dot > 0 ? dot : (p.initial ?? "").length);
  }, 10);
  return (
    <div class="tree-row editing" style={{ "padding-left": `${8 + p.depth * 14}px` }}>
      <span class="tree-chevron" />
      <input
        ref={el}
        class="tree-input"
        value={p.initial ?? ""}
        spellcheck={false}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") finish(false);
        }}
        onBlur={() => finish(true)}
      />
    </div>
  );
}

function Node(p: { entry: DirEntry; depth: number; git: Map<string, string> }) {
  const key = () => norm(p.entry.path);
  const isOpen = () => !!expanded[key()];
  const isActive = () => {
    const d = activeDoc();
    return !!d?.path && norm(d.path) === key();
  };
  const status = () => p.git.get(key());
  const renaming = () => {
    const pd = pending();
    return pd?.kind === "rename" && norm(pd.path) === key();
  };
  const click = () => {
    setSelected(key());
    if (p.entry.isDir) toggleDir(p.entry.path);
    else openFile(p.entry.path);
  };
  const menu = (e: MouseEvent) => {
    setSelected(key());
    const ws = workspace()!;
    const dir = p.entry.isDir ? p.entry.path : dirname(p.entry.path);
    showContextMenu(e, [
      { label: "New File…", run: () => startCreate("file", dir) },
      { label: "New Folder…", run: () => startCreate("dir", dir) },
      { separator: true, label: "" },
      { label: "Open in Terminal", run: () => createTerminal({ cwd: dir, title: basename(dir) }) },
      { label: "Copy Path", run: () => writeText(p.entry.path) },
      { label: "Copy Relative Path", run: () => writeText(relative(ws.root, p.entry.path)) },
      { separator: true, label: "" },
      { label: "Rename…", hint: "F2", run: () => setPending({ kind: "rename", path: p.entry.path }) },
      { label: "Move to Trash", hint: "Del", danger: true, run: () => deletePath(p.entry) },
    ]);
  };
  const children = createMemo(() => (p.entry.isDir && isOpen() ? (tree[key()] ?? []) : []));
  return (
    <>
      <Show when={!renaming()} fallback={<InlineInput initial={p.entry.name} depth={p.depth} />}>
        <div
          class={`tree-row ${isActive() ? "active" : ""} ${selected() === key() ? "selected" : ""} ${status() ? `git-${status()}` : ""}`}
          style={{ "padding-left": `${8 + p.depth * 14}px` }}
          onClick={click}
          onContextMenu={menu}
          title={p.entry.path}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "F2") { e.preventDefault(); setPending({ kind: "rename", path: p.entry.path }); }
            if (e.key === "Delete" || (e.key === "Backspace" && e.metaKey)) { e.preventDefault(); deletePath(p.entry); }
            if (e.key === "Enter") { e.preventDefault(); click(); }
          }}
        >
          <span class={`tree-chevron ${isOpen() ? "open" : ""}`}>
            <Show when={p.entry.isDir}><ChevronRight size={14} /></Show>
          </span>
          <Show when={!p.entry.isDir}><FileIcon path={p.entry.name} /></Show>
          <span class="tree-name">{p.entry.name}</span>
          <Show when={status() && !p.entry.isDir}>
            <span class="tree-status">{status() === "added" ? "U" : status() === "deleted" ? "D" : status() === "conflicted" ? "!" : "M"}</span>
          </Show>
        </div>
      </Show>
      <Show when={p.entry.isDir && isOpen()}>
        <Show when={(() => { const pd = pending(); return pd && pd.kind !== "rename" && norm(pd.parent) === key() ? pd : null; })()}>
          {(pd) => <InlineInput depth={p.depth + 1} initial={pd().kind === "file" ? "" : ""} />}
        </Show>
        <For each={children()}>{(child) => <Node entry={child} depth={p.depth + 1} git={p.git} />}</For>
      </Show>
    </>
  );
}

export function Explorer() {
  const git = createMemo(gitStatusMap);
  const rootKey = () => norm(workspace()?.root ?? "");
  const collapseAll = () => {
    for (const k of Object.keys(expanded)) if (k !== rootKey()) setExpanded(k, false);
  };
  return (
    <div class="sidebar-view">
      <div class="sidebar-header">
        <span class="sidebar-title">{workspace()?.name ?? "Explorer"}</span>
        <Show when={workspace()}>
          <div class="sidebar-actions">
            <button class="icon-btn" title="New File" onClick={() => startCreate("file", workspace()!.root)}><FilePlus size={15} /></button>
            <button class="icon-btn" title="New Folder" onClick={() => startCreate("dir", workspace()!.root)}><FolderPlus size={15} /></button>
            <button class="icon-btn" title="Refresh" onClick={() => loadDir(workspace()!.root)}><RefreshCw size={14} /></button>
            <button class="icon-btn" title="Collapse All" onClick={collapseAll}><ListTree size={15} /></button>
          </div>
        </Show>
      </div>
      <Show
        when={workspace()}
        fallback={
          <div class="empty-state">
            <p>No folder is open.</p>
            <button class="btn btn-primary" onClick={openFolder}>Open Folder</button>
          </div>
        }
      >
        <div
          class="tree"
          onContextMenu={(e) => {
            if (e.target !== e.currentTarget) return;
            showContextMenu(e, [
              { label: "New File…", run: () => startCreate("file", workspace()!.root) },
              { label: "New Folder…", run: () => startCreate("dir", workspace()!.root) },
            ]);
          }}
        >
          <Show when={(() => { const pd = pending(); return pd && pd.kind !== "rename" && norm(pd.parent) === rootKey() ? pd : null; })()}>
            <InlineInput depth={0} />
          </Show>
          <For each={tree[rootKey()] ?? []}>{(entry) => <Node entry={entry} depth={0} git={git()} />}</For>
        </div>
      </Show>
    </div>
  );
}
