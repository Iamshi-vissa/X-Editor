import { Match, Show, Switch, createEffect, on, onMount } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc } from "./lib/ipc";
import { appInfo, layout, setAppInfo, setLayout, toast } from "./state/ui";
import { loadSettings, settings, settingsError } from "./state/settings";
import { applyTheme, resolveTheme } from "./state/themes";
import { allThemes, confirmQuit, loadCustomThemes, restoreSessionOnStartup, runCommandInTerminal, scheduleSessionSave } from "./state/actions";
import { installKeybindings } from "./state/commands";
import { initWorkspaceEvents, workspace } from "./state/workspace";
import { groups, openFile, reconfigureEditors } from "./state/editor";
import { restoreSession } from "./state/auth";
import { applyTerminalSettings } from "./state/terminal";
import { setDisplayFileHandler, setInstallHandler } from "./editor/lsp";
import { ActivityBar, StatusBar, TitleBar } from "./components/Chrome";
import { Explorer } from "./components/Explorer";
import { SearchView } from "./components/SearchView";
import { GitView } from "./components/GitView";
import { RuntimesView } from "./components/RuntimesView";
import { AccountView } from "./components/AccountView";
import { EditorArea, hasOpenTabs } from "./components/EditorArea";
import { Welcome } from "./components/Welcome";
import { Panel } from "./components/Panel";
import { Palette } from "./components/Palette";
import { ContextMenuHost, DialogHost, Toasts } from "./components/Overlays";
import { Resizer } from "./components/Resizer";

function applyAppearance() {
  const s = settings;
  const themes = allThemes();
  const theme = resolveTheme(themes.find((t) => t.id === s.theme) ?? themes[0], themes);
  applyTheme(theme, s["theme.accent"]);
  const root = document.documentElement.style;
  const family = s["editor.fontFamily"].trim() || "JetBrains Mono Variable";
  root.setProperty("--editor-font", `"${family.replace(/"/g, "")}", "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace`);
  root.setProperty("--editor-font-size", `${s["editor.fontSize"]}px`);
  root.setProperty("--editor-line-height", String(s["editor.lineHeight"]));
  root.setProperty("--editor-ligatures", s["editor.ligatures"] ? "normal" : "none");
  root.setProperty("--editor-features", s["editor.ligatures"] ? '"calt" 1, "liga" 1' : '"calt" 0, "liga" 0');
  root.setProperty("--ui-font-size", `${s["ui.fontSize"]}px`);
  root.setProperty("--radius", `${s["ui.radius"]}px`);
  root.setProperty("--radius-sm", `${Math.max(0, Math.round(s["ui.radius"] * 0.6))}px`);
  root.setProperty("--row-h", s["ui.density"] === "compact" ? "24px" : "28px");
  root.setProperty("--gap", s["ui.density"] === "compact" ? "4px" : "6px");
  root.setProperty("--caret-transition", s["editor.smoothCaret"] ? "left 90ms ease-out, top 90ms ease-out" : "none");
  root.setProperty("zoom", String(s["ui.zoom"]));
  document.documentElement.classList.toggle("no-anim", !s["ui.animations"]);
  reconfigureEditors(theme.kind === "dark");
  applyTerminalSettings();
}

export default function App() {
  onMount(async () => {
    installKeybindings();
    setDisplayFileHandler((path) => openFile(path));
    setInstallHandler(runCommandInTerminal);
    const [info] = await Promise.all([ipc.app.info(), loadSettings(), loadCustomThemes(), initWorkspaceEvents()]);
    setAppInfo(info);
    document.documentElement.dataset.os = info.os;
    if (settingsError()) toast("error", "settings.json has an error", { detail: settingsError()!, sticky: true });
    restoreSession();
    await restoreSessionOnStartup();

    const win = getCurrentWindow();
    let closing = false;
    win.onCloseRequested(async (e) => {
      if (closing) return;
      e.preventDefault();
      if (await confirmQuit()) {
        closing = true;
        await win.destroy();
      }
    });
  });

  createEffect(applyAppearance);

  // Remember open tabs and layout.
  createEffect(on(
    () => [JSON.stringify(groups.map((g) => [g.tabs.map((t) => t.id), g.active])), layout.sidebarWidth, layout.panelHeight, layout.sidebarView, layout.mode, workspace()?.root],
    () => appInfo() && scheduleSessionSave(),
    { defer: true },
  ));

  const sidebarVisible = () => layout.mode === "studio" && layout.sidebarOpen;
  const panelVisible = () => layout.mode === "studio" && layout.panelOpen;
  const clampSidebar = (w: number) => Math.min(Math.max(w, 180), Math.min(700, window.innerWidth * 0.6));
  const clampPanel = (h: number) => Math.min(Math.max(h, 100), window.innerHeight * 0.75);

  return (
    <div class={`app mode-${layout.mode} sidebar-${settings["ui.sidebarSide"]}`}>
      <TitleBar />
      <div class="workbench">
        <Show when={layout.mode === "studio"}><ActivityBar /></Show>
        <Show when={sidebarVisible()}>
          <aside class="sidebar" style={{ width: `${layout.sidebarWidth}px` }}>
            <Switch>
              <Match when={layout.sidebarView === "explorer"}><Explorer /></Match>
              <Match when={layout.sidebarView === "search"}><SearchView /></Match>
              <Match when={layout.sidebarView === "git"}><GitView /></Match>
              <Match when={layout.sidebarView === "runtimes"}><RuntimesView /></Match>
              <Match when={layout.sidebarView === "account"}><AccountView /></Match>
            </Switch>
          </aside>
          <Resizer dir="x" invert={settings["ui.sidebarSide"] === "right"} onResize={(d) => setLayout("sidebarWidth", (w) => clampSidebar(w + d))} />
        </Show>
        <main class="main">
          <div class="main-editors">
            <Show when={hasOpenTabs()} fallback={<Welcome />}>
              <EditorArea />
            </Show>
          </div>
          <Show when={panelVisible()}>
            <Resizer dir="y" invert onResize={(d) => setLayout("panelHeight", (h) => clampPanel(h + d))} />
            <div class="panel-wrap" style={{ height: `${layout.panelHeight}px` }}><Panel /></div>
          </Show>
        </main>
      </div>
      <StatusBar />
      <Palette />
      <DialogHost />
      <ContextMenuHost />
      <Toasts />
    </div>
  );
}
