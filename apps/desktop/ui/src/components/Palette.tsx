// One palette for everything: files (Mod+P), commands (">"), go to line (":"),
// and pickers (branches, themes, recent folders).
import { For, Show, createEffect, createMemo, createResource, createSignal, on } from "solid-js";
import { CornerDownLeft, Folder, GitBranch, Palette as PaletteIcon, Plus, Terminal } from "lucide-solid";
import { closePalette, palette, setPalette, type PickItem } from "../state/ui";
import { fuzzyFilter } from "../lib/fuzzy";
import { prettyKey } from "../lib/keys";
import { basename, dirname, join } from "../lib/paths";
import { commands, keyFor, runCommand } from "../state/commands";
import { activeDoc, openFile, revealPosition } from "../state/editor";
import { listFiles, workspace } from "../state/workspace";
import { FileIcon } from "./Icons";

interface Row { key: string; label: string; detail?: string; hint?: string; icon: () => any; positions?: number[]; run: () => void }

function Highlight(p: { text: string; positions?: number[] }) {
  const parts = createMemo(() => {
    const set = new Set(p.positions ?? []);
    const out: { t: string; hit: boolean }[] = [];
    for (let i = 0; i < p.text.length; i++) {
      const hit = set.has(i);
      if (out.length && out[out.length - 1].hit === hit) out[out.length - 1].t += p.text[i];
      else out.push({ t: p.text[i], hit });
    }
    return out;
  });
  return <For each={parts()}>{(s) => (s.hit ? <mark>{s.t}</mark> : <>{s.t}</>)}</For>;
}

const pickIcon = (name?: string) => {
  switch (name) {
    case "folder": return () => <Folder size={15} />;
    case "branch": return () => <GitBranch size={15} />;
    case "palette": return () => <PaletteIcon size={15} />;
    case "plus": return () => <Plus size={15} />;
    case "terminal": return () => <Terminal size={15} />;
    default: return () => <span class="dot" />;
  }
};

export function Palette() {
  let input: HTMLInputElement | undefined;
  let list: HTMLDivElement | undefined;
  const [sel, setSel] = createSignal(0);
  const [files] = createResource(() => palette.open && palette.mode === "files" && !!workspace(), () => listFiles());

  // A leading ">" or ":" switches mode, like in other editors.
  const effective = createMemo(() => {
    const q = palette.query;
    if (palette.mode === "pick") return { mode: "pick" as const, q };
    if (q.startsWith(">")) return { mode: "commands" as const, q: q.slice(1) };
    if (q.startsWith(":")) return { mode: "line" as const, q: q.slice(1) };
    return { mode: palette.mode === "commands" ? ("commands" as const) : palette.mode === "line" ? ("line" as const) : ("files" as const), q };
  });

  const rows = createMemo<Row[]>(() => {
    const { mode, q } = effective();
    if (mode === "commands") {
      const available = commands.filter((c) => !c.when || c.when());
      return fuzzyFilter(q, available, (c) => `${c.category}: ${c.title}`, 120).map(({ item, positions }) => ({
        key: item.id,
        label: `${item.category}: ${item.title}`,
        hint: prettyKey(keyFor(item.id)),
        positions,
        icon: () => <span class="dot" />,
        run: () => runCommand(item.id),
      }));
    }
    if (mode === "line") {
      const n = parseInt(q, 10);
      const doc = activeDoc();
      if (!doc) return [{ key: "none", label: "Open a file to go to a line", icon: () => <span class="dot" />, run: () => {} }];
      const total = doc.view.state.doc.lines;
      return [{
        key: "line",
        label: Number.isFinite(n) ? `Go to line ${Math.min(Math.max(n, 1), total)}` : `Type a line number (1–${total})`,
        icon: () => <CornerDownLeft size={15} />,
        run: () => Number.isFinite(n) && revealPosition(doc.view, n, 1),
      }];
    }
    if (mode === "pick") {
      return fuzzyFilter(q, palette.items ?? [], (i) => i.label, 300).map(({ item, positions }) => ({
        key: item.id,
        label: item.label,
        detail: item.detail,
        hint: item.hint,
        positions,
        icon: pickIcon(item.icon),
        run: () => palette.onPick?.(item as PickItem),
      }));
    }
    const ws = workspace();
    if (!ws) return [{ key: "none", label: "Open a folder to search its files", detail: "Or type > to run a command", icon: () => <Folder size={15} />, run: () => {} }];
    return fuzzyFilter(q, files() ?? [], (f) => f, 80).map(({ item, positions }) => {
      const name = basename(item);
      const nameStart = item.length - name.length;
      return {
        key: item,
        label: name,
        detail: dirname(item) === item ? "" : dirname(item),
        positions: positions.filter((p) => p >= nameStart).map((p) => p - nameStart),
        icon: () => <FileIcon path={item} />,
        run: () => openFile(join(ws.root, item)),
      };
    });
  });

  createEffect(on(() => palette.query, () => setSel(0)));
  createEffect(on(() => palette.open, (open) => { if (open) setTimeout(() => input?.focus(), 10); }));
  createEffect(() => {
    const i = sel();
    list?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  });

  const choose = (i: number) => {
    const r = rows()[i];
    if (!r) return;
    closePalette();
    r.run();
  };

  const onKey = (e: KeyboardEvent) => {
    const n = rows().length;
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % Math.max(n, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + n) % Math.max(n, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel()); }
    else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
  };

  const placeholder = () =>
    palette.placeholder ??
    (effective().mode === "commands" ? "Type a command" : effective().mode === "line" ? "Line number" : "Search files by name  ·  > commands  ·  : line");

  return (
    <Show when={palette.open}>
      <div class="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closePalette()}>
        <div class="palette" role="dialog" aria-label="Command palette">
          <input
            ref={input}
            class="palette-input"
            placeholder={placeholder()}
            value={palette.query}
            onInput={(e) => setPalette("query", e.currentTarget.value)}
            onKeyDown={onKey}
            spellcheck={false}
          />
          <div class="palette-list" ref={list}>
            <For each={rows()} fallback={<div class="palette-empty">{files.loading ? "Indexing files…" : "No matches"}</div>}>
              {(r, i) => (
                <div class={`palette-row ${i() === sel() ? "selected" : ""}`} data-i={i()} onMouseMove={() => setSel(i())} onMouseDown={(e) => { e.preventDefault(); choose(i()); }}>
                  <span class="palette-icon">{r.icon()}</span>
                  <span class="palette-label"><Highlight text={r.label} positions={r.positions} /></span>
                  <Show when={r.detail}><span class="palette-detail">{r.detail}</span></Show>
                  <Show when={r.hint}><kbd class="kbd">{r.hint}</kbd></Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
