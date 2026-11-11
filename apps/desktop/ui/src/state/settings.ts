// Settings: defaults + the user's overrides from settings.json. Only values that differ
// from the defaults are written, so settings.json stays short and readable.
import { createStore, reconcile } from "solid-js/store";
import { createSignal } from "solid-js";
import { ipc, errorText } from "../lib/ipc";

export const DEFAULTS = {
  theme: "midnight",
  "theme.accent": "",
  "ui.fontSize": 13,
  "ui.density": "comfortable" as "comfortable" | "compact",
  "ui.radius": 10,
  "ui.sidebarSide": "left" as "left" | "right",
  "ui.animations": true,
  "ui.zoom": 1,
  "editor.fontFamily": "JetBrains Mono Variable",
  "editor.fontSize": 14,
  "editor.lineHeight": 1.6,
  "editor.ligatures": true,
  "editor.tabSize": 4,
  "editor.insertSpaces": true,
  "editor.wordWrap": false,
  "editor.lineNumbers": "on" as "on" | "relative" | "off",
  "editor.indentGuides": true,
  "editor.highlightActiveLine": true,
  "editor.cursorBlink": true,
  "editor.smoothCaret": true,
  "editor.bracketMatching": true,
  "editor.autoCloseBrackets": true,
  "editor.foldGutter": true,
  "editor.gitGutter": true,
  "editor.formatOnSave": false,
  "editor.trimTrailingWhitespace": false,
  "editor.insertFinalNewline": true,
  "editor.flowWidth": 100,
  "files.autosave": "off" as "off" | "afterDelay" | "onFocusChange",
  "files.autosaveDelay": 1000,
  "files.exclude": [".DS_Store", "Thumbs.db"] as string[],
  "terminal.fontSize": 13,
  "terminal.fontFamily": "",
  "terminal.shell": "",
  "terminal.shellArgs": [] as string[],
  "terminal.cursorStyle": "bar" as "bar" | "block" | "underline",
  "terminal.scrollback": 10000,
  "lsp.enabled": true,
  "lsp.servers": {
    typescript: { command: "typescript-language-server", args: ["--stdio"], languages: ["typescript", "typescriptreact", "javascript", "javascriptreact"], install: "npm i -g typescript-language-server typescript" },
    rust: { command: "rust-analyzer", args: [], languages: ["rust"], install: "rustup component add rust-analyzer" },
    python: { command: "pyright-langserver", args: ["--stdio"], languages: ["python"], install: "npm i -g pyright" },
    c: { command: "clangd", args: [], languages: ["c", "cpp"], install: "Install clangd from your package manager or LLVM" },
    go: { command: "gopls", args: [], languages: ["go"], install: "go install golang.org/x/tools/gopls@latest" },
  } as Record<string, LspServerConfig>,
  keybindings: {} as Record<string, string>,
  "github.clientId": "",
};

export interface LspServerConfig { command: string; args: string[]; languages: string[]; install?: string }
export type Settings = typeof DEFAULTS;
export type SettingKey = keyof Settings;

const [user, setUser] = createStore<Record<string, unknown>>({});
const [merged, setMerged] = createStore<Settings>(structuredClone(DEFAULTS));
const [loadError, setLoadError] = createSignal<string | null>(null);
export { loadError as settingsError };

export const settings = merged;

function recompute() {
  const next = structuredClone(DEFAULTS) as Record<string, unknown>;
  for (const [k, v] of Object.entries(user)) {
    if (k in DEFAULTS && v !== undefined && v !== null) {
      const d = (DEFAULTS as Record<string, unknown>)[k];
      // Merge object-valued settings (like lsp.servers) one level deep.
      if (d && typeof d === "object" && !Array.isArray(d) && typeof v === "object" && !Array.isArray(v)) {
        next[k] = { ...(d as object), ...(v as object) };
      } else if (typeof d === typeof v || Array.isArray(d) === Array.isArray(v)) {
        next[k] = v;
      }
    }
  }
  setMerged(reconcile(next as Settings));
}

export async function loadSettings() {
  try {
    const value = await ipc.app.readSettings();
    setUser(reconcile(value ?? {}));
    setLoadError(null);
  } catch (e) {
    // Keep the previous settings if the file has a syntax error; tell the user.
    setLoadError(errorText(e));
  }
  recompute();
}

let writeTimer: number | undefined;
function persist() {
  clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    ipc.app.writeSettings(JSON.parse(JSON.stringify(user))).catch((e) => console.error("settings write failed", e));
  }, 200);
}

export function setSetting<K extends SettingKey>(key: K, value: Settings[K]) {
  const isDefault = JSON.stringify(value) === JSON.stringify(DEFAULTS[key]);
  setUser(key as string, isDefault ? undefined : (value as unknown));
  recompute();
  persist();
}

export function resetSetting(key: SettingKey) {
  setUser(key as string, undefined);
  recompute();
  persist();
}

export function isModified(key: SettingKey) {
  return user[key as string] !== undefined;
}

export function setKeybinding(commandId: string, key: string | null) {
  const next = { ...settings.keybindings };
  if (key === null) delete next[commandId];
  else next[commandId] = key;
  setSetting("keybindings", next);
}
