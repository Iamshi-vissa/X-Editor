// Start screen: open or clone a project, recent folders, GitHub repositories, shortcuts.
import { For, Show, onMount } from "solid-js";
import { FolderOpen, FilePlus, Download, X } from "lucide-solid";
import { basename, dirname } from "../lib/paths";
import { prettyKey } from "../lib/keys";
import { ipc } from "../lib/ipc";
import { recent, refreshRecent } from "../state/workspace";
import { cloneRepository, openFolder, openRecent } from "../state/actions";
import { keyFor } from "../state/commands";
import { newUntitled } from "../state/editor";
import { user } from "../state/auth";
import { Logo } from "./Icons";
import { RepoList, SignInCard } from "./AccountView";

export function Welcome() {
  onMount(refreshRecent);
  const tips: [string, string][] = [
    ["palette.files", "Go to file"],
    ["palette.commands", "All commands"],
    ["view.mode", "Flow / Studio mode"],
    ["terminal.toggle", "Terminal"],
    ["run.file", "Run current file"],
    ["editor.split", "Split editor"],
  ];
  return (
    <div class="welcome">
      <div class="welcome-inner">
        <div class="welcome-hero">
          <Logo size={56} />
          <div>
            <h1>X-Editor</h1>
            <p class="muted">Write in Flow. Build in Studio. One fast editor that grows into an IDE.</p>
          </div>
        </div>
        <div class="welcome-grid">
          <div class="welcome-col">
            <h3>Start</h3>
            <button class="start-item" onClick={openFolder}><FolderOpen size={16} /> Open Folder… <kbd class="kbd">{prettyKey(keyFor("folder.open"))}</kbd></button>
            <button class="start-item" onClick={() => cloneRepository()}><Download size={16} /> Clone Repository…</button>
            <button class="start-item" onClick={() => newUntitled()}><FilePlus size={16} /> New File <kbd class="kbd">{prettyKey(keyFor("file.new"))}</kbd></button>

            <h3>Recent</h3>
            <For each={recent().slice(0, 8)} fallback={<p class="muted small">Folders you open will show up here.</p>}>
              {(p) => (
                <div class="recent-item">
                  <button class="recent-open" onClick={() => openRecent(p)} title={p}>
                    <span class="recent-name">{basename(p)}</span>
                    <span class="recent-path">{dirname(p)}</span>
                  </button>
                  <button class="icon-btn" title="Remove from list" onClick={async () => { await ipc.workspace.removeRecent(p); refreshRecent(); }}><X size={13} /></button>
                </div>
              )}
            </For>

            <h3>Shortcuts</h3>
            <div class="tips">
              <For each={tips}>{([id, label]) => <div class="tip"><span>{label}</span><kbd class="kbd">{prettyKey(keyFor(id))}</kbd></div>}</For>
            </div>
          </div>
          <div class="welcome-col">
            <h3>GitHub</h3>
            <Show when={user()} fallback={<SignInCard />}>
              <RepoList limit={8} />
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
