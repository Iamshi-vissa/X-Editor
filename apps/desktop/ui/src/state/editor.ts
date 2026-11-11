// Open documents, tabs and editor groups (split view).
//
// Every open file owns one live EditorView. Switching tabs just shows a different view, so
// undo history, scroll position, folds and language-server state all survive tab switches.
import { batch, createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { EditorState, Text, type Extension } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { forEachDiagnostic } from "@codemirror/lint";
import { formatDocument } from "@codemirror/lsp-client";
import { ipc, errorText } from "../lib/ipc";
import { basename, isInside, norm } from "../lib/paths";
import { findLanguage } from "../lib/languages";
import {
  baseExtensions, configCompartment, configExtensions, gitCompartment, languageCompartment, lspCompartment,
  themeCompartment,
} from "../editor/setup";
import { editorTheme } from "../editor/theme";
import { gitGutter, refreshGitGutter } from "../editor/gitGutter";
import { lspExtensionFor } from "../editor/lsp";
import { settings, loadSettings } from "./settings";
import { appInfo, ask, toast } from "./ui";
import { workspace, onFsChange } from "./workspace";

export type TabKind = "file" | "settings" | "keybindings" | "diff" | "preview";
export interface Tab { id: string; kind: TabKind; title: string; path?: string }
export interface Group { id: number; tabs: Tab[]; active: string | null }

interface Doc {
  id: string;
  path: string | null;
  view: EditorView;
  saved: Text;
  eol: "\n" | "\r\n";
}

const docs = new Map<string, Doc>();
/** Reactive per-document flags for tabs and the status bar. */
export const [docMeta, setDocMeta] = createStore<Record<string, { dirty: boolean; name: string; path: string | null; version: number }>>({});
export const [groups, setGroups] = createStore<Group[]>([{ id: 1, tabs: [], active: null }]);
export const [activeGroup, setActiveGroup] = createSignal(0);
export const [cursor, setCursor] = createSignal({ line: 1, col: 1, selected: 0, cursors: 1 });
export const [diagnostics, setDiagnostics] = createSignal({ errors: 0, warnings: 0 });

const closedStack: string[] = [];
const destroyed = new WeakSet<EditorView>();

function countDiagnostics(state: EditorState) {
  let errors = 0, warnings = 0;
  forEachDiagnostic(state, (d) => {
    if (d.severity === "error") errors++;
    else if (d.severity === "warning") warnings++;
  });
  return { errors, warnings };
}
let untitledCount = 0;
let groupSeq = 1;
let isDark = true;

export const getDoc = (id: string) => docs.get(id);
export const docForPath = (path: string) => docs.get(norm(path));
export const allDocs = () => [...docs.values()];

export function activeTab(): Tab | null {
  const g = groups[activeGroup()];
  return g?.tabs.find((t) => t.id === g.active) ?? null;
}

export function activeDoc(): Doc | null {
  const t = activeTab();
  return t?.kind === "file" ? (docs.get(t.id.slice(5)) ?? null) : null;
}

const fileTabId = (docId: string) => `file:${docId}`;

function findTab(tabId: string): { gi: number; ti: number } | null {
  for (let gi = 0; gi < groups.length; gi++) {
    const ti = groups[gi].tabs.findIndex((t) => t.id === tabId);
    if (ti >= 0) return { gi, ti };
  }
  return null;
}

function isDirty(doc: Doc) {
  return !doc.view.state.doc.eq(doc.saved);
}

let autosaveTimer: number | undefined;

function updateListener(docId: string): Extension {
  return EditorView.updateListener.of((u: ViewUpdate) => {
    const doc = docs.get(docId);
    if (!doc) return;
    if (u.docChanged) {
      const dirty = isDirty(doc);
      if (docMeta[docId]?.dirty !== dirty) setDocMeta(docId, "dirty", dirty);
      setDocMeta(docId, "version", (v) => v + 1);
      if (dirty && doc.path && settings["files.autosave"] === "afterDelay") {
        clearTimeout(autosaveTimer);
        autosaveTimer = window.setTimeout(() => saveDoc(docId, { quiet: true }), settings["files.autosaveDelay"]);
      }
    }
    if (activeDoc()?.id === docId && (u.selectionSet || u.docChanged || u.focusChanged)) publishCursor(u.state);
    if (activeDoc()?.id === docId && u.transactions.length) setDiagnostics(countDiagnostics(u.state));
    if (u.focusChanged && !u.view.hasFocus && doc.path && settings["files.autosave"] === "onFocusChange" && isDirty(doc)) {
      saveDoc(docId, { quiet: true });
    }
  });
}

function publishCursor(state: EditorState) {
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.head);
  const selected = state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
  setCursor({ line: line.number, col: sel.head - line.from + 1, selected, cursors: state.selection.ranges.length });
}

function createView(docId: string, text: string, path: string | null): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: text, extensions: baseExtensions({ onUpdate: updateListener(docId), dark: isDark }) }),
  });
  if (path) attachLanguage(view, path);
  return view;
}

async function attachLanguage(view: EditorView, path: string) {
  const lang = findLanguage(path);
  if (lang) {
    try {
      const support = await lang.load();
      if (!destroyed.has(view)) view.dispatch({ effects: languageCompartment.reconfigure(support) });
    } catch (e) {
      console.warn("language load failed", e);
    }
  }
  if (destroyed.has(view)) return;
  if (settings["editor.gitGutter"] && workspace() && isInside(workspace()!.root, path)) {
    view.dispatch({ effects: gitCompartment.reconfigure(gitGutter((text) => ipc.git.lineChanges(path, text))) });
  }
  const lsp = await lspExtensionFor(path).catch(() => null);
  if (lsp && !destroyed.has(view)) view.dispatch({ effects: lspCompartment.reconfigure(lsp) });
}

function addTab(tab: Tab, groupIndex = activeGroup(), position?: number) {
  setGroups(groupIndex, "tabs", (tabs) => {
    const next = [...tabs];
    next.splice(position ?? next.length, 0, tab);
    return next;
  });
  setGroups(groupIndex, "active", tab.id);
  setActiveGroup(groupIndex);
}

export function focusTab(tabId: string) {
  const loc = findTab(tabId);
  if (!loc) return;
  batch(() => {
    setGroups(loc.gi, "active", tabId);
    setActiveGroup(loc.gi);
  });
  const doc = tabId.startsWith("file:") ? docs.get(tabId.slice(5)) : null;
  if (doc) {
    publishCursor(doc.view.state);
    setDiagnostics(countDiagnostics(doc.view.state));
    requestAnimationFrame(() => {
      doc.view.requestMeasure();
      doc.view.focus();
    });
  }
}

/** Opens a file (or focuses it if already open) and optionally jumps to a position. */
export async function openFile(path: string, opts: { line?: number; col?: number; length?: number; group?: number } = {}): Promise<EditorView | null> {
  const id = norm(path);
  let doc = docs.get(id);
  if (!doc) {
    let content;
    try {
      content = await ipc.fs.read(path);
    } catch (e) {
      toast("error", `Can't open ${basename(path)}`, { detail: errorText(e) });
      return null;
    }
    doc = docs.get(id); // opened meanwhile by a concurrent call
    if (!doc) {
      const view = createView(id, content.text, path);
      doc = { id, path, view, saved: view.state.doc, eol: content.eol };
      docs.set(id, doc);
      setDocMeta(id, { dirty: false, name: basename(path), path, version: 0 });
      addTab({ id: fileTabId(id), kind: "file", title: basename(path), path }, opts.group);
    }
  }
  focusTab(fileTabId(id));
  if (opts.line) revealPosition(doc.view, opts.line, opts.col ?? 1, opts.length ?? 0);
  return doc.view;
}

export function revealPosition(view: EditorView, line: number, col: number, length = 0) {
  const l = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
  const from = Math.min(l.from + Math.max(col - 1, 0), l.to);
  const to = Math.min(from + length, l.to);
  view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
  requestAnimationFrame(() => view.focus());
}

export function newUntitled(text = "") {
  untitledCount += 1;
  const id = `untitled:${untitledCount}`;
  const view = createView(id, text, null);
  docs.set(id, { id, path: null, view, saved: Text.of([""]), eol: appInfo()?.os === "windows" ? "\r\n" : "\n" });
  setDocMeta(id, { dirty: text.length > 0, name: `Untitled-${untitledCount}`, path: null, version: 0 });
  addTab({ id: fileTabId(id), kind: "file", title: `Untitled-${untitledCount}` });
  focusTab(fileTabId(id));
}

function prepareText(doc: Doc): string {
  let lines = doc.view.state.doc.toJSON();
  if (settings["editor.trimTrailingWhitespace"]) lines = lines.map((l) => l.replace(/[ \t]+$/, ""));
  if (settings["editor.insertFinalNewline"] && lines.length && lines[lines.length - 1] !== "") lines.push("");
  return lines.join(doc.eol);
}

/** Saves a document. Untitled documents ask for a location first. */
export async function saveDoc(docId: string, opts: { quiet?: boolean; saveAs?: boolean } = {}): Promise<boolean> {
  const doc = docs.get(docId);
  if (!doc) return false;
  let path = doc.path;
  if (!path || opts.saveAs) {
    path = await ipc.fs.pickSavePath(docMeta[docId]?.name).catch(() => null);
    if (!path) return false;
  }
  const text = prepareText(doc);
  try {
    await ipc.fs.write(path, text);
  } catch (e) {
    toast("error", `Couldn't save ${basename(path)}`, { detail: errorText(e) });
    return false;
  }
  // Apply trim / final-newline edits to the editor so it matches the file on disk.
  const normalized = text.split(doc.eol).join("\n");
  if (normalized !== doc.view.state.doc.toString()) {
    doc.view.dispatch({ changes: { from: 0, to: doc.view.state.doc.length, insert: normalized } });
  }
  if (path !== doc.path) rekeyDoc(doc, path);
  doc.saved = doc.view.state.doc;
  setDocMeta(doc.id, "dirty", false);
  if (!opts.quiet) toast("success", `Saved ${basename(path)}`, { timeout: 1500 });
  const info = appInfo();
  if (info && norm(path) === norm(info.settingsPath)) await loadSettings();
  return true;
}

/** Moves an untitled doc to its new path after "Save As". */
function rekeyDoc(doc: Doc, path: string) {
  const oldId = doc.id;
  const newId = norm(path);
  if (oldId === newId) return;
  docs.delete(oldId);
  const existing = docs.get(newId);
  if (existing) closeTab(fileTabId(newId), { force: true });
  doc.id = newId;
  doc.path = path;
  docs.set(newId, doc);
  setDocMeta(produce((m) => {
    m[newId] = { ...m[oldId], name: basename(path), path, dirty: false };
    delete m[oldId];
  }));
  const loc = findTab(fileTabId(oldId));
  if (loc) {
    setGroups(loc.gi, "tabs", loc.ti, { id: fileTabId(newId), kind: "file", title: basename(path), path });
    if (groups[loc.gi].active === fileTabId(oldId)) setGroups(loc.gi, "active", fileTabId(newId));
  }
  // The update listener captured the old id; rebuild the view's state around the new one.
  const state = doc.view.state;
  doc.view.setState(EditorState.create({
    doc: state.doc,
    selection: state.selection,
    extensions: baseExtensions({ onUpdate: updateListener(newId), dark: isDark }),
  }));
  attachLanguage(doc.view, path);
}

export async function saveActive(saveAs = false) {
  const d = activeDoc();
  if (d) await saveDoc(d.id, { saveAs });
}

export async function saveAll() {
  for (const d of docs.values()) if (isDirty(d) && d.path) await saveDoc(d.id, { quiet: true });
  toast("success", "Saved all files", { timeout: 1500 });
}

export function formatActive() {
  const d = activeDoc();
  if (!d) return;
  if (!formatDocument(d.view)) toast("info", "No formatter available for this file", { detail: "Formatting comes from the file's language server." });
}

/** Closes a tab, asking about unsaved changes. Returns false if the user cancelled. */
export async function closeTab(tabId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const loc = findTab(tabId);
  if (!loc) return true;
  const docId = tabId.startsWith("file:") ? tabId.slice(5) : null;
  const doc = docId ? docs.get(docId) : null;
  if (doc && !opts.force && isDirty(doc)) {
    const answer = await ask(`Save changes to ${docMeta[doc.id]?.name}?`, "Your changes will be lost if you don't save them.", [
      { label: "Cancel", value: "cancel" },
      { label: "Don't Save", value: "discard", danger: true },
      { label: "Save", value: "save", primary: true },
    ]);
    if (answer === "cancel") return false;
    if (answer === "save" && !(await saveDoc(doc.id))) return false;
  }
  const g = groups[loc.gi];
  const wasActive = g.active === tabId;
  const remaining = g.tabs.filter((t) => t.id !== tabId);
  batch(() => {
    setGroups(loc.gi, "tabs", remaining);
    if (wasActive) setGroups(loc.gi, "active", remaining[Math.min(loc.ti, remaining.length - 1)]?.id ?? null);
  });
  if (doc) {
    if (doc.path) closedStack.push(doc.path);
    destroyed.add(doc.view);
    doc.view.destroy();
    docs.delete(doc.id);
    setDocMeta(produce((m) => { delete m[doc.id]; }));
  }
  if (remaining.length === 0 && groups.length > 1) {
    setGroups((gs) => gs.filter((_, i) => i !== loc.gi));
    setActiveGroup(0);
  }
  const next = activeTab();
  if (next) focusTab(next.id);
  return true;
}

export async function closeActiveTab() {
  const t = activeTab();
  if (t) await closeTab(t.id);
}

export async function closeAllTabs(): Promise<boolean> {
  for (const g of [...groups]) for (const t of [...g.tabs]) if (!(await closeTab(t.id))) return false;
  return true;
}

export async function closeOtherTabs(tabId: string) {
  const loc = findTab(tabId);
  if (!loc) return;
  for (const t of [...groups[loc.gi].tabs]) if (t.id !== tabId && !(await closeTab(t.id))) return;
}

export function reopenClosed() {
  const p = closedStack.pop();
  if (p) openFile(p);
}

export function cycleTab(dir: 1 | -1) {
  const g = groups[activeGroup()];
  if (!g || g.tabs.length < 2) return;
  const i = g.tabs.findIndex((t) => t.id === g.active);
  focusTab(g.tabs[(i + dir + g.tabs.length) % g.tabs.length].id);
}

/** Moves the active tab to the other editor group, creating a split if needed. */
export function splitActive() {
  const t = activeTab();
  if (!t) return;
  const from = activeGroup();
  let to = from === 0 ? 1 : 0;
  if (groups.length === 1) {
    if (groups[0].tabs.length < 2) {
      toast("info", "Open another file to split the editor");
      return;
    }
    setGroups(groups.length, { id: ++groupSeq, tabs: [], active: null });
    to = 1;
  }
  moveTab(t.id, to);
}

export function moveTab(tabId: string, toGroup: number, position?: number) {
  const loc = findTab(tabId);
  if (!loc) return;
  const tab = groups[loc.gi].tabs[loc.ti];
  batch(() => {
    const remaining = groups[loc.gi].tabs.filter((x) => x.id !== tabId);
    setGroups(loc.gi, "tabs", remaining);
    if (groups[loc.gi].active === tabId) setGroups(loc.gi, "active", remaining[0]?.id ?? null);
    if (loc.gi === toGroup) {
      addTab(tab, toGroup, position);
    } else {
      addTab(tab, toGroup, position);
      if (remaining.length === 0 && groups.length > 1) {
        setGroups((gs) => gs.filter((_, i) => i !== loc.gi));
      }
    }
  });
  const idx = groups.findIndex((g) => g.tabs.some((x) => x.id === tabId));
  setActiveGroup(Math.max(idx, 0));
  focusTab(tabId);
}

export function focusGroup(i: number) {
  if (groups[i]?.active) focusTab(groups[i].active!);
}

/** Opens a special (non-file) tab like Settings, a diff or a Markdown preview. */
export function openSpecialTab(tab: Tab, inOtherGroup = false) {
  if (findTab(tab.id)) return focusTab(tab.id);
  let gi = activeGroup();
  if (inOtherGroup) {
    if (groups.length === 1) setGroups(1, { id: ++groupSeq, tabs: [], active: null });
    gi = gi === 0 ? 1 : 0;
  }
  addTab(tab, gi);
}

export function openSettingsTab() {
  openSpecialTab({ id: "settings", kind: "settings", title: "Settings" });
}

export function openKeybindingsTab() {
  openSpecialTab({ id: "keybindings", kind: "keybindings", title: "Keyboard Shortcuts" });
}

export const hasDirtyDocs = () => [...docs.values()].some(isDirty);

/** Re-applies settings to every open editor (called when settings change). */
export function reconfigureEditors(dark: boolean) {
  const themeChanged = dark !== isDark;
  isDark = dark;
  for (const d of docs.values()) {
    d.view.dispatch({
      effects: [
        configCompartment.reconfigure(configExtensions()),
        ...(themeChanged ? [themeCompartment.reconfigure(editorTheme(dark))] : []),
      ],
    });
  }
}

export function refreshAllGitGutters() {
  for (const d of docs.values()) d.view.dispatch({ effects: refreshGitGutter.of(null) });
}

export function openTabsForSession() {
  return {
    groups: groups.map((g) => ({
      tabs: g.tabs.filter((t) => t.kind === "file" && t.path).map((t) => t.path!),
      active: g.tabs.find((t) => t.id === g.active)?.path ?? null,
    })),
  };
}

// Files changed on disk: reload clean ones silently, ask about ones with unsaved edits.
const pendingConflicts = new Set<string>();
onFsChange(async (paths) => {
  const changed = new Set(paths.map(norm));
  for (const doc of docs.values()) {
    if (!doc.path || !changed.has(norm(doc.path))) continue;
    let content;
    try {
      content = await ipc.fs.read(doc.path);
    } catch {
      continue; // deleted or unreadable: keep the buffer
    }
    const diskText = content.text.replace(/\r\n/g, "\n");
    if (diskText === doc.view.state.doc.toString()) {
      doc.saved = doc.view.state.doc;
      setDocMeta(doc.id, "dirty", false);
      continue;
    }
    if (diskText === doc.saved.toString()) continue; // our own save, or nothing new
    if (!isDirty(doc)) {
      const view = doc.view;
      const head = Math.min(view.state.selection.main.head, diskText.length);
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: diskText }, selection: { anchor: head } });
      doc.saved = view.state.doc;
      setDocMeta(doc.id, "dirty", false);
    } else if (!pendingConflicts.has(doc.id)) {
      pendingConflicts.add(doc.id);
      const id = doc.id;
      toast("warning", `${docMeta[id]?.name} changed on disk`, {
        detail: "You have unsaved changes in the editor.",
        sticky: true,
        actions: [
          { label: "Reload from disk", run: () => {
            const d = docs.get(id);
            if (d) {
              d.view.dispatch({ changes: { from: 0, to: d.view.state.doc.length, insert: diskText } });
              d.saved = d.view.state.doc;
              setDocMeta(id, "dirty", false);
            }
            pendingConflicts.delete(id);
          } },
          { label: "Keep mine", run: () => pendingConflicts.delete(id) },
        ],
      });
    }
  }
});
