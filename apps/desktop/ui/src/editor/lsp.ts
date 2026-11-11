// Language servers: one process per configured server, started the first time a matching
// file opens. Messages flow UI <-> Rust <-> server; CodeMirror's LSP client does the protocol.
import { LSPClient, LSPPlugin, Workspace, languageServerExtensions, type Transport, type WorkspaceFile } from "@codemirror/lsp-client";
import type { EditorView } from "@codemirror/view";
import type { Extension, Text } from "@codemirror/state";
import DOMPurify from "dompurify";
import { createStore } from "solid-js/store";
import { ipc } from "../lib/ipc";
import { fromFileUri, toFileUri } from "../lib/paths";
import { lspLanguageId } from "../lib/languages";
import { settings, type LspServerConfig } from "../state/settings";
import { appInfo, toast } from "../state/ui";

export type ServerStatus = "starting" | "running" | "stopped" | "missing" | "error";
export const [lspStatus, setLspStatus] = createStore<Record<string, ServerStatus>>({});

let displayFile: (path: string) => Promise<EditorView | null> = async () => null;
export function setDisplayFileHandler(fn: (path: string) => Promise<EditorView | null>) {
  displayFile = fn;
}

class EditorFile implements WorkspaceFile {
  constructor(public uri: string, public languageId: string, public version: number, public doc: Text, public view: EditorView) {}
  getView() { return this.view; }
}

/** Like the default workspace, but "go to definition" in another file opens it in a tab. */
class XWorkspace extends Workspace {
  files: EditorFile[] = [];
  private versions: Record<string, number> = {};
  private nextVersion(uri: string) { return (this.versions[uri] = (this.versions[uri] ?? -1) + 1); }
  syncFiles() {
    const out = [];
    for (const file of this.files) {
      const plugin = LSPPlugin.get(file.view);
      if (!plugin) continue;
      const changes = plugin.unsyncedChanges;
      if (!changes.empty) {
        out.push({ changes, file, prevDoc: file.doc });
        file.doc = file.view.state.doc;
        file.version = this.nextVersion(file.uri);
        plugin.clear();
      }
    }
    return out;
  }
  openFile(uri: string, languageId: string, view: EditorView) {
    if (this.getFile(uri)) return;
    const file = new EditorFile(uri, languageId, this.nextVersion(uri), view.state.doc, view);
    this.files.push(file);
    this.client.didOpen(file);
  }
  closeFile(uri: string) {
    const file = this.getFile(uri);
    if (!file) return;
    this.files = this.files.filter((f) => f !== file);
    this.client.didClose(uri);
  }
  async displayFile(uri: string): Promise<EditorView | null> {
    return displayFile(fromFileUri(uri, appInfo()?.os === "windows"));
  }
}

interface Running { client: LSPClient; id: string }
const running = new Map<string, Promise<Running | null>>();
const installed = new Map<string, boolean>();
const warned = new Set<string>();
/** Server ids we stopped on purpose, so their exit isn't reported as a crash. */
const stopping = new Set<string>();
let workspaceRoot: string | null = null;

let installHandler: (cmd: string) => void = () => {};
export function setInstallHandler(fn: (cmd: string) => void) {
  installHandler = fn;
}

function serverFor(languageId: string): [string, LspServerConfig] | null {
  for (const [key, cfg] of Object.entries(settings["lsp.servers"])) {
    if (cfg?.languages?.includes(languageId)) return [key, cfg];
  }
  return null;
}

async function start(key: string, cfg: LspServerConfig): Promise<Running | null> {
  if (!installed.has(cfg.command)) {
    const [r] = await ipc.lsp.available([cfg.command]);
    installed.set(cfg.command, !!r?.installed);
  }
  if (!installed.get(cfg.command)) {
    setLspStatus(key, "missing");
    if (!warned.has(key)) {
      warned.add(key);
      toast("info", `Install ${cfg.command} for code intelligence`, {
        detail: "Autocomplete, go to definition and inline errors need a language server.",
        actions: cfg.install && !cfg.install.startsWith("Install ") ? [{ label: "Install in terminal", run: () => installHandler(cfg.install!) }] : [],
        timeout: 9000,
      });
    }
    return null;
  }
  const id = `${key}-${Date.now()}`;
  const handlers = new Set<(msg: string) => void>();
  const transport: Transport = {
    send: (message) => { ipc.lsp.send(id, message).catch(() => {}); },
    subscribe: (h) => handlers.add(h),
    unsubscribe: (h) => handlers.delete(h),
  };
  setLspStatus(key, "starting");
  try {
    await ipc.lsp.start(id, cfg.command, cfg.args ?? [], (e) => {
      if (e.type === "message") for (const h of handlers) h(e.data);
      else if (e.type === "log") console.debug(`[${key}]`, e.data);
      else {
        if (stopping.delete(id)) return;
        const wasRunning = lspStatus[key] === "running";
        setLspStatus(key, wasRunning ? "stopped" : "error");
        running.delete(key);
        if (!wasRunning && !warned.has(`exit:${key}`)) {
          warned.add(`exit:${key}`);
          toast("warning", `${cfg.command} stopped right after starting`, {
            detail: "It may be a placeholder that isn't fully installed (e.g. the rustup proxy without the component).",
            actions: cfg.install && !cfg.install.startsWith("Install ") ? [{ label: "Install in terminal", run: () => installHandler(cfg.install!) }] : [],
            timeout: 10000,
          });
        }
      }
    });
  } catch (e) {
    setLspStatus(key, "error");
    console.warn("LSP start failed", e);
    return null;
  }
  const client = new LSPClient({
    rootUri: workspaceRoot ? toFileUri(workspaceRoot) : undefined,
    workspace: (c) => new XWorkspace(c),
    sanitizeHTML: (html) => DOMPurify.sanitize(html),
    timeout: 10000,
    extensions: languageServerExtensions(),
  }).connect(transport);
  client.initializing.then(() => setLspStatus(key, "running")).catch(() => setLspStatus(key, "error"));
  return { client, id };
}

/** Returns the LSP extension for a file, starting its server if needed (null if none). */
export async function lspExtensionFor(path: string): Promise<Extension | null> {
  if (!settings["lsp.enabled"] || !workspaceRoot) return null;
  const languageId = lspLanguageId(path);
  if (!languageId) return null;
  const found = serverFor(languageId);
  if (!found) return null;
  const [key, cfg] = found;
  if (!running.has(key)) running.set(key, start(key, cfg));
  const r = await running.get(key)!;
  if (!r) {
    running.delete(key);
    return null;
  }
  return r.client.plugin(toFileUri(path), languageId);
}

export async function stopAllServers() {
  for (const [, p] of running) {
    const r = await p;
    if (r) {
      stopping.add(r.id);
      r.client.disconnect();
      ipc.lsp.stop(r.id);
    }
  }
  running.clear();
  for (const k of Object.keys(lspStatus)) setLspStatus(k, "stopped");
}

export async function setLspWorkspace(root: string | null) {
  await stopAllServers();
  workspaceRoot = root;
  installed.clear();
  warned.clear();
}

export function serverKeyFor(path: string): string | null {
  const id = lspLanguageId(path);
  return id ? (serverFor(id)?.[0] ?? null) : null;
}
