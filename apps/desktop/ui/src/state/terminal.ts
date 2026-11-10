// Terminal sessions: xterm.js in the UI, a real PTY in Rust. Each session keeps its own
// xterm instance alive while hidden, so output and scrollback survive tab switches.
import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc, errorText, type ShellKind } from "../lib/ipc";
import { settings } from "./settings";
import { layout, setLayout, toast } from "./ui";

export interface TermSession { id: string; title: string; alive: boolean; shellKind: ShellKind; exitCode: number | null }
interface TermRuntime { term: Terminal; fit: FitAddon; host: HTMLDivElement; opened: boolean }

export const [sessions, setSessions] = createStore<TermSession[]>([]);
export const [activeTerm, setActiveTerm] = createSignal<string | null>(null);
const runtimes = new Map<string, TermRuntime>();
let seq = 0;

export const runtimeFor = (id: string) => runtimes.get(id);

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

export function terminalTheme(): ITheme {
  const light = document.documentElement.dataset.themeKind === "light";
  const base: ITheme = light
    ? {
        black: "#1d1f2b", red: "#c4314b", green: "#14804a", yellow: "#9a6700", blue: "#1f5fbf", magenta: "#8239d6", cyan: "#0d7d86", white: "#7a7f96",
        brightBlack: "#5c6075", brightRed: "#d92d4b", brightGreen: "#1a9d5c", brightYellow: "#b86e00", brightBlue: "#2d74e0", brightMagenta: "#9b53f0", brightCyan: "#11929c", brightWhite: "#9095aa",
      }
    : {
        black: "#1b1d26", red: "#ff6b81", green: "#5be49b", yellow: "#ffd479", blue: "#7cc4ff", magenta: "#c792ff", cyan: "#5ee0d0", white: "#d7d9e4",
        brightBlack: "#62657a", brightRed: "#ff8fa3", brightGreen: "#86f0b8", brightYellow: "#ffe4a3", brightBlue: "#a7d7ff", brightMagenta: "#dcb8ff", brightCyan: "#8ff0e4", brightWhite: "#ffffff",
      };
  return {
    ...base,
    background: cssVar("bg-panel"),
    foreground: cssVar("text"),
    cursor: cssVar("accent"),
    cursorAccent: cssVar("bg-panel"),
    selectionBackground: cssVar("selection"),
  };
}

/** xterm draws on a canvas, which can't resolve CSS variables, so pass the real font list. */
function terminalFont() {
  return settings["terminal.fontFamily"] || cssVar("editor-font") || "monospace";
}

export function applyTerminalSettings() {
  for (const r of runtimes.values()) {
    r.term.options.theme = terminalTheme();
    r.term.options.fontSize = settings["terminal.fontSize"];
    if (r.term.options.fontFamily !== terminalFont()) r.term.options.fontFamily = terminalFont();
    r.term.options.cursorStyle = settings["terminal.cursorStyle"];
    if (r.opened) fitTerminal(r);
  }
}

function fitTerminal(r: TermRuntime) {
  try {
    r.fit.fit();
  } catch { /* not visible yet */ }
}

/** Opens a new terminal. `run` is typed into the shell once it starts. */
export async function createTerminal(opts: { cwd?: string; title?: string; run?: string } = {}): Promise<string | null> {
  const id = `term-${++seq}-${Date.now()}`;
  const fontFamily = terminalFont();
  const term = new Terminal({
    fontFamily,
    fontSize: settings["terminal.fontSize"],
    lineHeight: 1.25,
    cursorBlink: true,
    cursorStyle: settings["terminal.cursorStyle"],
    scrollback: settings["terminal.scrollback"],
    allowProposedApi: true,
    theme: terminalTheme(),
    macOptionIsMeta: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((_e, uri) => { openUrl(uri).catch(() => {}); }));
  const host = document.createElement("div");
  host.className = "term-host";
  runtimes.set(id, { term, fit, host, opened: false });
  setSessions(sessions.length, { id, title: opts.title ?? "Terminal", alive: true, shellKind: "posix", exitCode: null });
  setActiveTerm(id);
  setLayout("panelOpen", true);
  if (layout.mode === "flow") setLayout("mode", "studio");

  term.onData((data) => { ipc.term.write(id, data).catch(() => {}); });
  term.onResize(({ cols, rows }) => { ipc.term.resize(id, cols, rows).catch(() => {}); });

  try {
    const kind = await ipc.term.spawn(
      { id, cwd: opts.cwd, shell: settings["terminal.shell"] || undefined, shellArgs: settings["terminal.shellArgs"], cols: term.cols, rows: term.rows },
      (e) => {
        if (e.type === "data") term.write(e.data);
        else {
          term.write(`\r\n\x1b[2m[process exited${e.code != null ? ` with code ${e.code}` : ""}]\x1b[0m\r\n`);
          const i = sessions.findIndex((s) => s.id === id);
          if (i >= 0) setSessions(i, { alive: false, exitCode: e.code });
        }
      },
    );
    const i = sessions.findIndex((s) => s.id === id);
    if (i >= 0) setSessions(i, "shellKind", kind);
    if (opts.run) setTimeout(() => ipc.term.write(id, opts.run + "\r"), 150);
  } catch (e) {
    term.write(`\x1b[31mCouldn't start the shell: ${errorText(e)}\x1b[0m\r\n`);
    toast("error", "Couldn't start terminal", { detail: errorText(e) });
    const i = sessions.findIndex((s) => s.id === id);
    if (i >= 0) setSessions(i, "alive", false);
    return null;
  }
  return id;
}

/** Called by the panel once the terminal's host element is in the DOM. */
export function mountTerminal(id: string) {
  const r = runtimes.get(id);
  if (!r) return;
  if (!r.opened) {
    r.term.open(r.host);
    r.opened = true;
    import("@xterm/addon-webgl")
      .then(({ WebglAddon }) => {
        const gl = new WebglAddon();
        gl.onContextLoss(() => gl.dispose());
        r.term.loadAddon(gl);
      })
      .catch(() => { /* canvas renderer fallback */ });
  }
  requestAnimationFrame(() => {
    fitTerminal(r);
    r.term.focus();
  });
}

export function refitActive() {
  const id = activeTerm();
  const r = id ? runtimes.get(id) : undefined;
  if (r?.opened) fitTerminal(r);
}

export async function killTerminal(id: string) {
  await ipc.term.kill(id).catch(() => {});
  runtimes.get(id)?.term.dispose();
  runtimes.delete(id);
  const idx = sessions.findIndex((s) => s.id === id);
  setSessions(produce((s) => { if (idx >= 0) s.splice(idx, 1); }));
  if (activeTerm() === id) setActiveTerm(sessions[Math.max(0, idx - 1)]?.id ?? null);
  if (sessions.length === 0) setLayout("panelOpen", false);
}

export function clearTerminal(id: string) {
  runtimes.get(id)?.term.clear();
}

/** Types a command into the "Run" terminal, creating it if needed. */
export async function runInTerminal(command: string, cwd: string, title = "Run") {
  let s = sessions.find((x) => x.title === title && x.alive);
  if (!s) {
    const id = await createTerminal({ cwd, title, run: command });
    return id;
  }
  const cd = s.shellKind === "powershell" ? `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'` : s.shellKind === "cmd" ? `cd /d "${cwd}"` : `cd '${cwd.replace(/'/g, `'\\''`)}'`;
  setActiveTerm(s.id);
  setLayout("panelOpen", true);
  await ipc.term.write(s.id, `${cd} ${s.shellKind === "powershell" ? ";" : "&&"} ${command}\r`);
  return s.id;
}

export function toggleTerminalPanel() {
  if (!layout.panelOpen && sessions.length === 0) {
    createTerminal();
    return;
  }
  setLayout("panelOpen", !layout.panelOpen);
}
