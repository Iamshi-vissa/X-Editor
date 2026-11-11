// Search across the workspace (Rust does the work in parallel and respects .gitignore),
// with replace-all that also updates files that are open with unsaved edits.
import { For, Show, createMemo, createSignal } from "solid-js";
import { CaseSensitive, ChevronRight, Regex, Replace, WholeWord } from "lucide-solid";
import { ipc, errorText, type SearchMatch } from "../lib/ipc";
import { basename, dirname, join } from "../lib/paths";
import { ask, toast } from "../state/ui";
import { workspace } from "../state/workspace";
import { docForPath, openFile } from "../state/editor";
import { FileIcon } from "./Icons";

export function SearchView() {
  const [query, setQuery] = createSignal("");
  const [replace, setReplace] = createSignal("");
  const [showReplace, setShowReplace] = createSignal(false);
  const [opts, setOpts] = createSignal({ caseSensitive: false, wholeWord: false, regex: false });
  const [results, setResults] = createSignal<SearchMatch[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  let seq = 0;
  let timer: number | undefined;

  const run = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const q = query();
      const my = ++seq;
      if (!q || !workspace()) return setResults([]);
      setBusy(true);
      try {
        const r = await ipc.fs.search({ query: q, ...opts(), limit: 5000 });
        if (my === seq) { setResults(r); setError(null); }
      } catch (e) {
        if (my === seq) { setResults([]); setError(errorText(e)); }
      } finally {
        if (my === seq) setBusy(false);
      }
    }, 180);
  };

  const grouped = createMemo(() => {
    const map = new Map<string, SearchMatch[]>();
    for (const m of results()) {
      const list = map.get(m.path) ?? [];
      list.push(m);
      map.set(m.path, list);
    }
    return [...map.entries()];
  });

  const toggle = (k: "caseSensitive" | "wholeWord" | "regex") => { setOpts((o) => ({ ...o, [k]: !o[k] })); run(); };

  const buildRegex = () => {
    const o = opts();
    let src = o.regex ? query() : query().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (o.wholeWord) src = `\\b(?:${src})\\b`;
    return new RegExp(src, o.caseSensitive ? "g" : "gi");
  };

  const replaceAll = async () => {
    const ws = workspace();
    if (!ws || !results().length) return;
    const files = grouped().map(([p]) => p);
    const answer = await ask(`Replace ${results().length} matches in ${files.length} files?`, `"${query()}" will be replaced with "${replace()}". Open files are changed in the editor (undo works there); closed files are written to disk.`, [
      { label: "Cancel", value: "cancel" },
      { label: "Replace All", value: "ok", primary: true, danger: true },
    ]);
    if (answer !== "ok") return;
    let re: RegExp;
    try { re = buildRegex(); } catch (e) { return toast("error", "Invalid pattern", { detail: errorText(e) }); }
    let changed = 0;
    for (const rel of files) {
      const full = join(ws.root, rel);
      const open = docForPath(full);
      try {
        if (open) {
          const text = open.view.state.doc.toString();
          const next = text.replace(re, replace());
          if (next !== text) { open.view.dispatch({ changes: { from: 0, to: text.length, insert: next } }); changed++; }
        } else {
          const c = await ipc.fs.read(full);
          const next = c.text.replace(re, replace());
          if (next !== c.text) { await ipc.fs.write(full, next); changed++; }
        }
      } catch (e) {
        toast("error", `Couldn't update ${basename(rel)}`, { detail: errorText(e) });
      }
    }
    toast("success", `Replaced in ${changed} file${changed === 1 ? "" : "s"}`);
    run();
  };

  return (
    <div class="sidebar-view">
      <div class="sidebar-header"><span class="sidebar-title">Search</span></div>
      <div class="search-form">
        <div class="search-row">
          <button class={`icon-btn ${showReplace() ? "on" : ""}`} title="Toggle replace" onClick={() => setShowReplace(!showReplace())}>
            <ChevronRight size={14} style={{ transform: showReplace() ? "rotate(90deg)" : "" }} />
          </button>
          <div class="input-with-toggles">
            <input id="search-input" class="input" placeholder="Search" value={query()} spellcheck={false} onInput={(e) => { setQuery(e.currentTarget.value); run(); }} />
            <button class={`toggle ${opts().caseSensitive ? "on" : ""}`} title="Match case" onClick={() => toggle("caseSensitive")}><CaseSensitive size={15} /></button>
            <button class={`toggle ${opts().wholeWord ? "on" : ""}`} title="Whole word" onClick={() => toggle("wholeWord")}><WholeWord size={15} /></button>
            <button class={`toggle ${opts().regex ? "on" : ""}`} title="Regular expression" onClick={() => toggle("regex")}><Regex size={15} /></button>
          </div>
        </div>
        <Show when={showReplace()}>
          <div class="search-row">
            <span class="search-spacer" />
            <div class="input-with-toggles">
              <input class="input" placeholder="Replace" value={replace()} spellcheck={false} onInput={(e) => setReplace(e.currentTarget.value)} />
              <button class="toggle" title="Replace all" disabled={!results().length} onClick={replaceAll}><Replace size={15} /></button>
            </div>
          </div>
        </Show>
        <div class="search-summary">
          <Show when={error()}><span class="c-danger">{error()}</span></Show>
          <Show when={!error() && query()}>
            {busy() ? "Searching…" : `${results().length}${results().length >= 5000 ? "+" : ""} results in ${grouped().length} files`}
          </Show>
          <Show when={!workspace()}>Open a folder to search it.</Show>
        </div>
      </div>
      <div class="search-results">
        <For each={grouped()}>
          {([path, matches]) => (
            <div class="search-file">
              <div class="search-file-row" onClick={() => setCollapsed((c) => ({ ...c, [path]: !c[path] }))}>
                <ChevronRight size={14} class={`chev ${collapsed()[path] ? "" : "open"}`} />
                <FileIcon path={path} />
                <span class="search-file-name">{basename(path)}</span>
                <span class="search-file-dir">{dirname(path) === path ? "" : dirname(path)}</span>
                <span class="count">{matches.length}</span>
              </div>
              <Show when={!collapsed()[path]}>
                <For each={matches.slice(0, 200)}>
                  {(m) => (
                    <div class="search-match" onClick={() => openFile(join(workspace()!.root, m.path), { line: m.line, col: m.column, length: m.length })}>
                      <span class="search-line-no">{m.line}</span>
                      <span class="search-preview">
                        {(() => {
                          const chars = [...m.preview];
                          const start = Math.max(0, m.column - 1 - 30);
                          const before = chars.slice(start, m.column - 1).join("");
                          const hit = chars.slice(m.column - 1, m.column - 1 + m.length).join("");
                          const after = chars.slice(m.column - 1 + m.length, m.column - 1 + m.length + 120).join("");
                          return <>{start > 0 ? "…" : ""}{before.trimStart()}<mark>{hit}</mark>{after}</>;
                        })()}
                      </span>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
