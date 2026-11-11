// Source control: staged / unstaged changes, commit, push, pull, branches.
import { For, Show, createMemo, createSignal } from "solid-js";
import { ArrowDown, ArrowUp, Check, GitBranch, Minus, Plus, RefreshCw, Undo2, CloudDownload } from "lucide-solid";
import { ipc, type FileStatus } from "../lib/ipc";
import { basename, dirname, join } from "../lib/paths";
import { prettyKey } from "../lib/keys";
import { ask, toast } from "../state/ui";
import { workspace } from "../state/workspace";
import { repo, refreshGit, gitAction, gitBusy, statusLetter } from "../state/git";
import { openDiff, switchBranch, openFolder } from "../state/actions";
import { openFile } from "../state/editor";
import { user, signIn } from "../state/auth";
import { FileIcon, GithubMark } from "./Icons";
import { showContextMenu } from "./Overlays";

function FileRow(p: { file: FileStatus }) {
  const full = () => join(workspace()!.root, p.file.path);
  const stage = (e: MouseEvent) => { e.stopPropagation(); gitAction("Stage", () => ipc.git.stage([p.file.path])); };
  const unstage = (e: MouseEvent) => { e.stopPropagation(); gitAction("Unstage", () => ipc.git.unstage([p.file.path])); };
  const discard = async (e?: MouseEvent) => {
    e?.stopPropagation();
    const untracked = p.file.status === "untracked";
    const answer = await ask(
      untracked ? `Delete untracked file ${basename(p.file.path)}?` : `Discard changes to ${basename(p.file.path)}?`,
      untracked ? "It will be moved to the trash." : "Your uncommitted edits to this file will be lost.",
      [{ label: "Cancel", value: "cancel" }, { label: untracked ? "Move to Trash" : "Discard", value: "ok", danger: true, primary: true }],
    );
    if (answer === "ok") gitAction("Discard", () => ipc.git.discard(untracked ? [] : [p.file.path], untracked ? [p.file.path] : []));
  };
  const open = () => (p.file.status === "deleted" || p.file.status === "untracked" || p.file.status === "added" ? openFile(full()) : openDiff(full()));
  return (
    <div
      class={`git-row git-${p.file.status}`}
      onClick={open}
      onContextMenu={(e) => showContextMenu(e, [
        { label: "Open File", run: () => openFile(full()) },
        { label: "Open Changes", run: () => openDiff(full()), disabled: p.file.status === "untracked" },
        { separator: true, label: "" },
        p.file.staged ? { label: "Unstage", run: () => gitAction("Unstage", () => ipc.git.unstage([p.file.path])) } : { label: "Stage", run: () => gitAction("Stage", () => ipc.git.stage([p.file.path])) },
        { label: "Discard Changes", danger: true, run: () => discard(), disabled: p.file.staged },
      ])}
      title={p.file.path}
    >
      <FileIcon path={p.file.path} />
      <span class="git-name">{basename(p.file.path)}</span>
      <span class="git-dir">{dirname(p.file.path) === p.file.path ? "" : dirname(p.file.path)}</span>
      <span class="git-actions">
        <Show when={!p.file.staged}>
          <button class="icon-btn" title="Discard changes" onClick={discard}><Undo2 size={14} /></button>
          <button class="icon-btn" title="Stage" onClick={stage}><Plus size={14} /></button>
        </Show>
        <Show when={p.file.staged}>
          <button class="icon-btn" title="Unstage" onClick={unstage}><Minus size={14} /></button>
        </Show>
      </span>
      <span class="git-letter">{statusLetter[p.file.status] ?? "?"}</span>
    </div>
  );
}

export function GitView() {
  const [message, setMessage] = createSignal("");
  const staged = createMemo(() => repo()?.files.filter((f) => f.staged) ?? []);
  const changes = createMemo(() => repo()?.files.filter((f) => !f.staged) ?? []);

  const commit = async () => {
    const msg = message().trim();
    if (!msg) return toast("info", "Write a commit message first");
    if (!staged().length) {
      if (!changes().length) return toast("info", "Nothing to commit");
      const answer = await ask("No changes are staged", "Stage all changes and commit them?", [
        { label: "Cancel", value: "cancel" },
        { label: "Stage All & Commit", value: "ok", primary: true },
      ]);
      if (answer !== "ok") return;
      await ipc.git.stageAll();
    }
    const r = await gitAction("Commit", () => ipc.git.commit(msg), (id) => `Committed ${id.slice(0, 7)}`);
    if (r) setMessage("");
  };

  return (
    <div class="sidebar-view">
      <div class="sidebar-header">
        <span class="sidebar-title">Source Control</span>
        <Show when={repo()?.isRepo}>
          <div class="sidebar-actions">
            <button class="icon-btn" title="Pull" disabled={!!gitBusy()} onClick={() => gitAction("Pull", ipc.git.pull, (r) => r)}><ArrowDown size={15} /></button>
            <button class="icon-btn" title="Push" disabled={!!gitBusy()} onClick={() => gitAction("Push", ipc.git.push, () => "Pushed")}><ArrowUp size={15} /></button>
            <button class="icon-btn" title="Fetch" disabled={!!gitBusy()} onClick={() => gitAction("Fetch", ipc.git.fetch, () => "Fetched")}><CloudDownload size={15} /></button>
            <button class="icon-btn" title="Refresh" onClick={() => refreshGit()}><RefreshCw size={14} /></button>
          </div>
        </Show>
      </div>
      <Show when={workspace()} fallback={<div class="empty-state"><p>Open a folder to use Git.</p><button class="btn btn-primary" onClick={openFolder}>Open Folder</button></div>}>
        <Show
          when={repo()?.isRepo}
          fallback={
            <div class="empty-state">
              <p>This folder isn't a Git repository yet.</p>
              <button class="btn btn-primary" onClick={() => gitAction("Initialize", ipc.git.init, () => "Repository created")}>Initialize Repository</button>
            </div>
          }
        >
          <div class="git-commit">
            <button class="branch-btn" onClick={switchBranch} title="Switch branch">
              <GitBranch size={13} /> <span>{repo()!.branch ?? "no branch"}</span>
              <Show when={repo()!.upstream}><span class="muted">↓{repo()!.behind} ↑{repo()!.ahead}</span></Show>
            </button>
            <textarea
              class="input commit-input"
              placeholder={`Commit message (${prettyKey("Mod+Enter")} to commit)`}
              value={message()}
              onInput={(e) => setMessage(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); } }}
              rows={3}
            />
            <button class="btn btn-primary btn-block" disabled={!!gitBusy()} onClick={commit}>
              <Check size={14} /> Commit{staged().length ? ` ${staged().length} file${staged().length === 1 ? "" : "s"}` : ""}
            </button>
            <Show when={!user()}>
              <button class="btn btn-ghost btn-block" onClick={signIn}><GithubMark size={13} /> Sign in to push to GitHub</button>
            </Show>
          </div>
          <div class="git-lists">
            <Show when={staged().length}>
              <div class="git-section">
                <span>Staged Changes</span>
                <span class="git-section-actions">
                  <button class="icon-btn" title="Unstage all" onClick={() => gitAction("Unstage", () => ipc.git.unstage(staged().map((f) => f.path)))}><Minus size={14} /></button>
                  <span class="count">{staged().length}</span>
                </span>
              </div>
              <For each={staged()}>{(f) => <FileRow file={f} />}</For>
            </Show>
            <div class="git-section">
              <span>Changes</span>
              <span class="git-section-actions">
                <Show when={changes().length}>
                  <button class="icon-btn" title="Stage all" onClick={() => gitAction("Stage", ipc.git.stageAll)}><Plus size={14} /></button>
                </Show>
                <span class="count">{changes().length}</span>
              </span>
            </div>
            <For each={changes()} fallback={<div class="muted pad">No changes. Your working tree is clean.</div>}>{(f) => <FileRow file={f} />}</For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
