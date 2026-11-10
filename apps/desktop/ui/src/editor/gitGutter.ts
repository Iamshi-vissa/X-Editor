// Change markers in the gutter (added / modified / deleted lines vs. HEAD).
import { RangeSet, RangeSetBuilder, StateEffect, StateField, type Extension, type Text } from "@codemirror/state";
import { EditorView, GutterMarker, ViewPlugin, gutter, type ViewUpdate } from "@codemirror/view";
import type { LineChange } from "../lib/ipc";

class ChangeMarker extends GutterMarker {
  constructor(readonly kind: string) { super(); }
  eq(other: ChangeMarker) { return other.kind === this.kind; }
  toDOM() {
    const el = document.createElement("div");
    el.className = `cm-git-${this.kind}`;
    return el;
  }
}
const markers: Record<LineChange["kind"], ChangeMarker> = {
  added: new ChangeMarker("added"),
  modified: new ChangeMarker("modified"),
  deleted: new ChangeMarker("deleted"),
};

const setLineChanges = StateEffect.define<LineChange[]>();
/** Dispatch this to recompute markers (e.g. after a commit moved HEAD). */
export const refreshGitGutter = StateEffect.define<null>();

function build(doc: Text, changes: LineChange[]): RangeSet<GutterMarker> {
  // One marker per line; RangeSetBuilder needs positions in ascending order.
  const byLine = new Map<number, ChangeMarker>();
  for (const c of changes) {
    const from = Math.min(Math.max(c.from, 1), doc.lines);
    const to = c.kind === "deleted" ? from : Math.min(Math.max(c.to, from), doc.lines);
    for (let l = from; l <= to; l++) if (!byLine.has(l)) byLine.set(l, markers[c.kind]);
  }
  const b = new RangeSetBuilder<GutterMarker>();
  for (const line of [...byLine.keys()].sort((a, z) => a - z)) {
    const pos = doc.line(line).from;
    b.add(pos, pos, byLine.get(line)!);
  }
  return b.finish();
}

const changesField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) if (e.is(setLineChanges)) value = build(tr.state.doc, e.value);
    return value;
  },
});

export function gitGutter(compute: (text: string) => Promise<LineChange[]>): Extension {
  const updater = ViewPlugin.fromClass(
    class {
      timer: number | undefined;
      constructor(readonly view: EditorView) { this.schedule(0); }
      update(u: ViewUpdate) {
        const forced = u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshGitGutter)));
        if (u.docChanged || forced) this.schedule(forced ? 0 : 350);
      }
      schedule(delay: number) {
        clearTimeout(this.timer);
        this.timer = window.setTimeout(async () => {
          try {
            const changes = await compute(this.view.state.doc.toString());
            this.view.dispatch({ effects: setLineChanges.of(changes) });
          } catch { /* not a repository, or the file is outside it */ }
        }, delay);
      }
      destroy() { clearTimeout(this.timer); }
    },
  );
  return [changesField, gutter({ class: "cm-git-gutter", markers: (v) => v.state.field(changesField) }), updater];
}
