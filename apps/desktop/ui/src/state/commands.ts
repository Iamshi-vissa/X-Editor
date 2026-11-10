// Every action in the app is a command: it has an id, a title for the palette and an
// optional default shortcut. Users rebind shortcuts in settings ("keybindings").
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { eventToKey, normalizeKey } from "../lib/keys";
import { ipc } from "../lib/ipc";
import { settings, setSetting } from "./settings";
import { closePalette, layout, openPalette, palette, setLayout, showSidebar, toggleMode, toast } from "./ui";
import {
  closeActiveTab, closeAllTabs, cycleTab, focusGroup, formatActive, newUntitled, openKeybindingsTab, openSettingsTab,
  reopenClosed, saveActive, saveAll, splitActive, openFile,
} from "./editor";
import { createTerminal, toggleTerminalPanel } from "./terminal";
import {
  cloneRepository, closeFolder, openFileDialog, openFolder, openMarkdownPreview, pickRecentFolder, pickTheme,
  runActiveFile, runProject, switchBranch,
} from "./actions";
import { gitAction, refreshGit } from "./git";
import { signIn, signOut, user } from "./auth";
import { appInfo } from "./ui";
import { workspace } from "./workspace";

export interface Command {
  id: string;
  title: string;
  category: string;
  key?: string;
  run: () => unknown;
  when?: () => boolean;
}

const hasFolder = () => !!workspace();

export const commands: Command[] = [
  { id: "palette.commands", title: "Show All Commands", category: "View", key: "Mod+Shift+P", run: () => openPalette("commands") },
  { id: "palette.files", title: "Go to File…", category: "Go", key: "Mod+P", run: () => openPalette("files") },
  { id: "palette.line", title: "Go to Line…", category: "Go", key: "Ctrl+G", run: () => openPalette("line") },

  { id: "file.new", title: "New File", category: "File", key: "Mod+N", run: () => newUntitled() },
  { id: "file.open", title: "Open File…", category: "File", key: "Mod+O", run: openFileDialog },
  { id: "folder.open", title: "Open Folder…", category: "File", key: "Mod+Shift+O", run: openFolder },
  { id: "folder.recent", title: "Open Recent Folder…", category: "File", key: "Mod+Alt+O", run: pickRecentFolder },
  { id: "folder.close", title: "Close Folder", category: "File", run: closeFolder, when: hasFolder },
  { id: "file.save", title: "Save", category: "File", key: "Mod+S", run: () => saveActive() },
  { id: "file.saveAs", title: "Save As…", category: "File", key: "Mod+Shift+S", run: () => saveActive(true) },
  { id: "file.saveAll", title: "Save All", category: "File", key: "Mod+Alt+S", run: saveAll },

  { id: "editor.close", title: "Close Tab", category: "Editor", key: "Mod+W", run: closeActiveTab },
  { id: "editor.closeAll", title: "Close All Tabs", category: "Editor", run: closeAllTabs },
  { id: "editor.reopen", title: "Reopen Closed Tab", category: "Editor", key: "Mod+Shift+T", run: reopenClosed },
  { id: "editor.nextTab", title: "Next Tab", category: "Editor", key: "Ctrl+Tab", run: () => cycleTab(1) },
  { id: "editor.prevTab", title: "Previous Tab", category: "Editor", key: "Ctrl+Shift+Tab", run: () => cycleTab(-1) },
  { id: "editor.split", title: "Split Editor (move tab to other side)", category: "Editor", key: "Mod+\\", run: splitActive },
  { id: "editor.focusLeft", title: "Focus Left Editor", category: "Editor", key: "Mod+1", run: () => focusGroup(0) },
  { id: "editor.focusRight", title: "Focus Right Editor", category: "Editor", key: "Mod+2", run: () => focusGroup(1) },
  { id: "editor.format", title: "Format Document", category: "Editor", key: "Shift+Alt+F", run: formatActive },
  { id: "editor.toggleWrap", title: "Toggle Word Wrap", category: "Editor", key: "Alt+Z", run: () => setSetting("editor.wordWrap", !settings["editor.wordWrap"]) },
  { id: "markdown.preview", title: "Open Markdown Preview to the Side", category: "Markdown", key: "Mod+Shift+V", run: openMarkdownPreview },

  { id: "view.mode", title: "Toggle Flow / Studio Mode", category: "View", key: "Mod+Alt+M", run: toggleMode },
  { id: "view.explorer", title: "Show Explorer", category: "View", key: "Mod+Shift+E", run: () => showSidebar("explorer") },
  { id: "view.search", title: "Search in Files", category: "View", key: "Mod+Shift+F", run: () => { setLayout({ sidebarView: "search", sidebarOpen: true, mode: "studio" }); setTimeout(() => document.querySelector<HTMLInputElement>("#search-input")?.focus(), 30); } },
  { id: "view.git", title: "Show Source Control", category: "View", key: "Mod+Shift+G", run: () => showSidebar("git") },
  { id: "view.runtimes", title: "Show Runtimes & Language Servers", category: "View", run: () => showSidebar("runtimes") },
  { id: "view.account", title: "Show GitHub Account", category: "View", run: () => showSidebar("account") },
  { id: "view.sidebar", title: "Toggle Sidebar", category: "View", key: "Mod+B", run: () => setLayout("sidebarOpen", !layout.sidebarOpen) },
  { id: "view.panel", title: "Toggle Terminal Panel", category: "View", key: "Mod+J", run: toggleTerminalPanel },
  { id: "view.zoomIn", title: "Zoom In", category: "View", key: "Mod+=", run: () => setSetting("ui.zoom", Math.min(2, +(settings["ui.zoom"] + 0.1).toFixed(2))) },
  { id: "view.zoomOut", title: "Zoom Out", category: "View", key: "Mod+-", run: () => setSetting("ui.zoom", Math.max(0.6, +(settings["ui.zoom"] - 0.1).toFixed(2))) },
  { id: "view.zoomReset", title: "Reset Zoom", category: "View", key: "Mod+0", run: () => setSetting("ui.zoom", 1) },
  { id: "view.fullscreen", title: "Toggle Full Screen", category: "View", key: "F11", run: async () => { const w = getCurrentWindow(); w.setFullscreen(!(await w.isFullscreen())); } },

  { id: "terminal.toggle", title: "Toggle Terminal", category: "Terminal", key: "Ctrl+`", run: toggleTerminalPanel },
  { id: "terminal.new", title: "New Terminal", category: "Terminal", key: "Ctrl+Shift+`", run: () => createTerminal() },

  { id: "run.file", title: "Run Active File", category: "Run", key: "F5", run: runActiveFile },
  { id: "run.project", title: "Run Project", category: "Run", key: "Shift+F5", run: runProject, when: hasFolder },

  { id: "git.refresh", title: "Git: Refresh", category: "Git", run: () => refreshGit(), when: hasFolder },
  { id: "git.branch", title: "Git: Switch Branch…", category: "Git", run: switchBranch, when: hasFolder },
  { id: "git.pull", title: "Git: Pull", category: "Git", run: () => gitAction("Pull", ipc.git.pull, (r) => r), when: hasFolder },
  { id: "git.push", title: "Git: Push", category: "Git", run: () => gitAction("Push", ipc.git.push, () => "Pushed"), when: hasFolder },
  { id: "git.fetch", title: "Git: Fetch", category: "Git", run: () => gitAction("Fetch", ipc.git.fetch, () => "Fetched"), when: hasFolder },
  { id: "git.clone", title: "Git: Clone Repository…", category: "Git", run: () => cloneRepository() },

  { id: "github.signIn", title: "GitHub: Sign In", category: "GitHub", run: signIn, when: () => !user() },
  { id: "github.signOut", title: "GitHub: Sign Out", category: "GitHub", run: signOut, when: () => !!user() },
  { id: "github.openProfile", title: "GitHub: Open My Profile", category: "GitHub", run: () => user() && openUrl(user()!.htmlUrl), when: () => !!user() },

  { id: "settings.open", title: "Open Settings", category: "Preferences", key: "Mod+,", run: openSettingsTab },
  { id: "settings.json", title: "Open Settings (JSON)", category: "Preferences", run: () => appInfo() && openFile(appInfo()!.settingsPath) },
  { id: "settings.keybindings", title: "Keyboard Shortcuts", category: "Preferences", key: "Mod+K", run: openKeybindingsTab },
  { id: "theme.pick", title: "Color Theme…", category: "Preferences", key: "Mod+Alt+T", run: pickTheme },
  { id: "help.welcome", title: "Show Welcome", category: "Help", run: () => toast("info", "Close the folder to see the welcome screen") },
];

export const commandById = (id: string) => commands.find((c) => c.id === id);

/** The effective shortcut for a command: the user's binding, or the default. */
export function keyFor(id: string): string | undefined {
  const user = settings.keybindings[id];
  if (user !== undefined) return user || undefined;
  return commandById(id)?.key;
}

export function runCommand(id: string) {
  const c = commandById(id);
  if (!c) return;
  if (c.when && !c.when()) return;
  Promise.resolve(c.run()).catch((e) => toast("error", c.title, { detail: String(e) }));
}

/** Global shortcut handling (capture phase, so app shortcuts beat editor defaults). */
export function installKeybindings() {
  window.addEventListener(
    "keydown",
    (e) => {
      const key = eventToKey(e);
      if (!key) return;
      // The shortcut editor is recording: let it have every key.
      if ((e.target as HTMLElement | null)?.classList?.contains("recording")) return;
      if (palette.open && key === "Escape") {
        e.preventDefault();
        closePalette();
        return;
      }
      for (const c of commands) {
        const k = keyFor(c.id);
        if (k && normalizeKey(k) === key) {
          if (c.when && !c.when()) continue;
          // Leave Ctrl+G etc. to text inputs except in the editor.
          const target = e.target as HTMLElement | null;
          const inInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA") && !target.closest(".cm-editor");
          if (inInput && !key.includes("Mod") && !key.startsWith("F")) continue;
          if (target?.closest(".xterm") && (c.id === "palette.line" || c.id === "editor.nextTab")) continue;
          e.preventDefault();
          e.stopPropagation();
          runCommand(c.id);
          return;
        }
      }
    },
    true,
  );
}
