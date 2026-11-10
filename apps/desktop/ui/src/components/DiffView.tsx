// Side-by-side diff of a file against its last commit (HEAD).
import { Show, createEffect, createResource, onCleanup } from "solid-js";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { ipc } from "../lib/ipc";
import { findLanguage } from "../lib/languages";
import { relative } from "../lib/paths";
import { editorTheme, syntaxColors } from "../editor/theme";
import { docForPath, openFile } from "../state/editor";
import { workspace } from "../state/workspace";

export function DiffView(p: { path: string }) {
  let host!: HTMLDivElement;
  let merge: MergeView | null = null;
  const [data] = createResource(() => p.path, async (path) => {
    const head = (await ipc.git.headText(path)) ?? "";
    const open = docForPath(path);
    const current = open ? open.view.state.doc.toString() : (await ipc.fs.read(path).catch(() => ({ text: "" }))).text.replace(/\r\n/g, "\n");
    return { head: head.replace(/\r\n/g, "\n"), current };
  });

  createEffect(async () => {
    const d = data();
    if (!d || merge) return;
    const lang = findLanguage(p.path);
    const support = lang ? await lang.load().catch(() => null) : null;
    const dark = document.documentElement.dataset.themeKind !== "light";
    const common = [lineNumbers(), editorTheme(dark), syntaxColors, EditorState.readOnly.of(true), EditorView.editable.of(false), ...(support ? [support] : [])];
    merge = new MergeView({
      a: { doc: d.head, extensions: common },
      b: { doc: d.current, extensions: common },
      parent: host,
      collapseUnchanged: { margin: 3, minSize: 6 },
      gutter: true,
      highlightChanges: true,
    });
  });
  onCleanup(() => merge?.destroy());

  return (
    <div class="diff-view">
      <div class="diff-head">
        <span class="diff-side">HEAD</span>
        <span class="diff-title">{relative(workspace()?.root, p.path)}</span>
        <span class="diff-side">Working tree <button class="link" onClick={() => openFile(p.path)}>open file</button></span>
      </div>
      <Show when={data.error}><div class="banner banner-error">{String(data.error)}</div></Show>
      <div class="diff-host" ref={host} />
    </div>
  );
}
