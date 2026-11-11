// Layout and transient UI: which sidebar view is showing, panel sizes, the
// Flow (focused editor) / Studio (full IDE) mode, toasts, dialogs and the palette.
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type { AppInfo } from "../lib/ipc";

export type SidebarView = "explorer" | "search" | "git" | "runtimes" | "account";
export type Mode = "studio" | "flow";

export const [appInfo, setAppInfo] = createSignal<AppInfo | null>(null);

export const [layout, setLayout] = createStore({
  sidebarView: "explorer" as SidebarView,
  sidebarOpen: true,
  sidebarWidth: 280,
  panelOpen: false,
  panelHeight: 280,
  mode: "studio" as Mode,
});

export function showSidebar(view: SidebarView) {
  if (layout.mode === "flow") setLayout("mode", "studio");
  if (layout.sidebarOpen && layout.sidebarView === view) setLayout("sidebarOpen", false);
  else setLayout({ sidebarView: view, sidebarOpen: true });
}

export function toggleMode() {
  setLayout("mode", layout.mode === "flow" ? "studio" : "flow");
}

// Toasts
export interface ToastAction { label: string; run: () => void }
export interface Toast { id: number; kind: "info" | "success" | "warning" | "error"; message: string; detail?: string; actions?: ToastAction[]; sticky?: boolean }
const [toasts, setToasts] = createSignal<Toast[]>([]);
export { toasts };
let toastId = 0;
export function toast(kind: Toast["kind"], message: string, opts: { detail?: string; actions?: ToastAction[]; sticky?: boolean; timeout?: number } = {}) {
  const id = ++toastId;
  setToasts((t) => [...t.slice(-4), { id, kind, message, ...opts }]);
  if (!opts.sticky) setTimeout(() => dismissToast(id), opts.timeout ?? (kind === "error" ? 8000 : 4000));
  return id;
}
export function dismissToast(id: number) {
  setToasts((t) => t.filter((x) => x.id !== id));
}

// Modal dialogs (confirm / choice / prompt), awaited as promises.
export interface DialogButton { label: string; value: string; primary?: boolean; danger?: boolean }
export interface DialogSpec {
  title: string;
  message?: string;
  buttons: DialogButton[];
  input?: { placeholder?: string; value?: string };
  resolve: (r: { button: string; input?: string }) => void;
}
export const [dialog, setDialog] = createSignal<DialogSpec | null>(null);

export function ask(title: string, message: string, buttons: DialogButton[]): Promise<string> {
  return new Promise((resolve) => setDialog({ title, message, buttons, resolve: (r) => resolve(r.button) }));
}

export function prompt(title: string, opts: { message?: string; value?: string; placeholder?: string; ok?: string } = {}): Promise<string | null> {
  return new Promise((resolve) =>
    setDialog({
      title,
      message: opts.message,
      input: { value: opts.value, placeholder: opts.placeholder },
      buttons: [
        { label: "Cancel", value: "cancel" },
        { label: opts.ok ?? "OK", value: "ok", primary: true },
      ],
      resolve: (r) => resolve(r.button === "ok" ? (r.input ?? "") : null),
    }),
  );
}

// Command palette
export type PaletteMode = "files" | "commands" | "line" | "pick";
export interface PickItem { id: string; label: string; detail?: string; hint?: string; icon?: string }
export interface PaletteState {
  open: boolean;
  mode: PaletteMode;
  query: string;
  placeholder?: string;
  items?: PickItem[];
  onPick?: (item: PickItem) => void;
}
export const [palette, setPalette] = createStore<PaletteState>({ open: false, mode: "files", query: "" });

export function openPalette(mode: PaletteMode, query = "") {
  setPalette({ open: true, mode, query, items: undefined, onPick: undefined, placeholder: undefined });
}

/** Shows a list picker in the palette and resolves with the chosen item (or null). */
export function pick(items: PickItem[], placeholder: string): Promise<PickItem | null> {
  return new Promise((resolve) => {
    let done = false;
    setPalette({
      open: true,
      mode: "pick",
      query: "",
      items,
      placeholder,
      onPick: (item) => { done = true; resolve(item); },
    });
    const check = setInterval(() => {
      if (!palette.open) {
        clearInterval(check);
        if (!done) resolve(null);
      }
    }, 100);
  });
}

export function closePalette() {
  setPalette("open", false);
}
