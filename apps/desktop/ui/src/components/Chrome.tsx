// Title bar, activity bar and status bar.
import { Show, createSignal, onMount, type JSX } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowDown, ArrowUp, Columns2, Cpu, Feather, Files, GitBranch, Layers, Minus, PanelBottom, PanelLeft, Play,
  Search, Settings2, Square, SquareTerminal, X, CircleAlert, TriangleAlert, Copy,
} from "lucide-solid";
import { appInfo, layout, openPalette, setLayout, showSidebar, toggleMode, type SidebarView } from "../state/ui";
import { workspace } from "../state/workspace";
import { activeDoc, activeTab, cursor, diagnostics, docMeta, splitActive } from "../state/editor";
import { repo, gitBusy } from "../state/git";
import { user } from "../state/auth";
import { keyFor, runCommand } from "../state/commands";
import { prettyKey } from "../lib/keys";
import { languageLabel } from "../lib/languages";
import { lspStatus, serverKeyFor } from "../editor/lsp";
import { settings } from "../state/settings";
import { toggleTerminalPanel } from "../state/terminal";
import { GithubMark, Logo } from "./Icons";

export function TitleBar() {
  const win = getCurrentWindow();
  const isMac = () => appInfo()?.os === "macos";
  const [maximized, setMaximized] = createSignal(false);
  onMount(async () => {
    setMaximized(await win.isMaximized().catch(() => false));
    win.onResized(async () => setMaximized(await win.isMaximized().catch(() => false)));
  });
  const title = () => {
    const ws = workspace()?.name;
    return ws ?? "X-Editor";
  };
  return (
    <header class={`titlebar ${isMac() ? "mac" : ""}`} data-tauri-drag-region onDblClick={(e) => e.target === e.currentTarget && win.toggleMaximize()}>
      <div class="titlebar-left" data-tauri-drag-region>
        <Show when={!isMac()}><span class="titlebar-logo"><Logo size={18} /></span></Show>
        <button class="title-btn" onClick={() => runCommand("folder.recent")} title="Open recent folder">
          {title()}
        </button>
      </div>
      <button class="command-center" onClick={() => openPalette("files")} title="Search files and commands">
        <Search size={13} />
        <span>{workspace() ? `Search ${workspace()!.name}` : "Search commands"}</span>
        <kbd class="kbd">{prettyKey(keyFor("palette.files"))}</kbd>
      </button>
      <div class="titlebar-right" data-tauri-drag-region>
        <button class="icon-btn" title={`Run file (${prettyKey(keyFor("run.file"))})`} onClick={() => runCommand("run.file")}><Play size={15} /></button>
        <button class="icon-btn" title={`Split editor (${prettyKey(keyFor("editor.split"))})`} onClick={splitActive}><Columns2 size={15} /></button>
        <button class={`icon-btn ${layout.sidebarOpen ? "on" : ""}`} title={`Toggle sidebar (${prettyKey(keyFor("view.sidebar"))})`} onClick={() => setLayout("sidebarOpen", !layout.sidebarOpen)}><PanelLeft size={15} /></button>
        <button class={`icon-btn ${layout.panelOpen ? "on" : ""}`} title={`Toggle terminal (${prettyKey(keyFor("view.panel"))})`} onClick={toggleTerminalPanel}><PanelBottom size={15} /></button>
        <Show when={!isMac()}>
          <div class="window-controls">
            <button class="wc" aria-label="Minimize" onClick={() => win.minimize()}><Minus size={14} /></button>
            <button class="wc" aria-label="Maximize" onClick={() => win.toggleMaximize()}>{maximized() ? <Copy size={12} /> : <Square size={12} />}</button>
            <button class="wc wc-close" aria-label="Close" onClick={() => win.close()}><X size={15} /></button>
          </div>
        </Show>
      </div>
    </header>
  );
}

function ActivityButton(p: { view: SidebarView; title: string; children: JSX.Element; badge?: number }) {
  const active = () => layout.sidebarOpen && layout.sidebarView === p.view && layout.mode === "studio";
  return (
    <button class={`activity-btn ${active() ? "active" : ""}`} title={p.title} onClick={() => showSidebar(p.view)}>
      {p.children}
      <Show when={p.badge}><span class="badge">{p.badge! > 99 ? "99+" : p.badge}</span></Show>
    </button>
  );
}

export function ActivityBar() {
  return (
    <nav class="activity-bar">
      <ActivityButton view="explorer" title={`Explorer (${prettyKey(keyFor("view.explorer"))})`}><Files size={20} /></ActivityButton>
      <ActivityButton view="search" title={`Search (${prettyKey(keyFor("view.search"))})`}><Search size={20} /></ActivityButton>
      <ActivityButton view="git" title={`Source Control (${prettyKey(keyFor("view.git"))})`} badge={repo()?.files.length}><GitBranch size={20} /></ActivityButton>
      <ActivityButton view="runtimes" title="Runtimes & Language Servers"><Cpu size={20} /></ActivityButton>
      <div class="activity-spacer" />
      <ActivityButton view="account" title={user() ? `GitHub: ${user()!.login}` : "Sign in with GitHub"}>
        <Show when={user()} fallback={<GithubMark size={19} />}>
          <img class="avatar" src={user()!.avatarUrl} alt="" />
        </Show>
      </ActivityButton>
      <button class="activity-btn" title={`Settings (${prettyKey(keyFor("settings.open"))})`} onClick={() => runCommand("settings.open")}><Settings2 size={20} /></button>
    </nav>
  );
}

export function StatusBar() {
  const doc = () => activeDoc();
  const meta = () => (doc() ? docMeta[doc()!.id] : undefined);
  const lsp = () => {
    const p = meta()?.path;
    const key = p ? serverKeyFor(p) : null;
    return key ? { key, status: lspStatus[key] } : null;
  };
  return (
    <footer class="statusbar">
      <div class="status-left">
        <button class="status-item mode-pill" onClick={toggleMode} title={`Switch mode (${prettyKey(keyFor("view.mode"))})`}>
          {layout.mode === "flow" ? <><Feather size={12} /> Flow</> : <><Layers size={12} /> Studio</>}
        </button>
        <Show when={repo()?.isRepo}>
          <button class="status-item" onClick={() => runCommand("git.branch")} title="Switch branch">
            <GitBranch size={12} /> {repo()!.branch ?? "no branch"}{repo()!.files.length ? "*" : ""}
          </button>
          <Show when={repo()!.upstream}>
            <button class="status-item" onClick={() => runCommand(repo()!.behind ? "git.pull" : "git.push")} title="Pull / push">
              <ArrowDown size={12} />{repo()!.behind} <ArrowUp size={12} />{repo()!.ahead}
            </button>
          </Show>
        </Show>
        <Show when={gitBusy()}><span class="status-item muted">{gitBusy()}…</span></Show>
        <Show when={doc()}>
          <span class="status-item" title="Problems in this file">
            <CircleAlert size={12} class={diagnostics().errors ? "c-danger" : ""} /> {diagnostics().errors}
            <TriangleAlert size={12} class={diagnostics().warnings ? "c-warning" : ""} /> {diagnostics().warnings}
          </span>
        </Show>
      </div>
      <div class="status-right">
        <Show when={doc()}>
          <button class="status-item" onClick={() => runCommand("palette.line")}>
            Ln {cursor().line}, Col {cursor().col}
            <Show when={cursor().selected}> ({cursor().selected} selected)</Show>
            <Show when={cursor().cursors > 1}> · {cursor().cursors} cursors</Show>
          </button>
          <span class="status-item">{settings["editor.insertSpaces"] ? `Spaces: ${settings["editor.tabSize"]}` : `Tab: ${settings["editor.tabSize"]}`}</span>
          <span class="status-item">{doc()!.eol === "\r\n" ? "CRLF" : "LF"}</span>
          <span class="status-item">{meta()?.path ? languageLabel(meta()!.path!) : "Plain Text"}</span>
          <Show when={lsp()}>
            <span class={`status-item lsp-${lsp()!.status ?? "stopped"}`} title={`Language server: ${lsp()!.status ?? "not started"}`}>
              <span class="lsp-dot" /> {lsp()!.key}
            </span>
          </Show>
        </Show>
        <Show when={!doc() && activeTab()}><span class="status-item">{activeTab()!.title}</span></Show>
        <button class="status-item" onClick={() => runCommand("terminal.new")} title="New terminal"><SquareTerminal size={12} /></button>
        <Show when={user()}><span class="status-item"><GithubMark size={11} /> {user()!.login}</span></Show>
      </div>
    </footer>
  );
}
