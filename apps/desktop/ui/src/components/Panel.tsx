// Bottom panel with terminal tabs.
import { For, Show, createEffect, on, onCleanup, onMount } from "solid-js";
import { Plus, Trash2, X, Eraser, SquareTerminal } from "lucide-solid";
import { activeTerm, clearTerminal, createTerminal, killTerminal, mountTerminal, refitActive, runtimeFor, sessions, setActiveTerm } from "../state/terminal";
import { layout, setLayout } from "../state/ui";

function TermHost(p: { id: string; visible: boolean }) {
  let el!: HTMLDivElement;
  onMount(() => {
    const r = runtimeFor(p.id);
    if (r) el.appendChild(r.host);
    if (p.visible) mountTerminal(p.id);
  });
  createEffect(on(() => p.visible, (v) => v && mountTerminal(p.id), { defer: true }));
  return <div ref={el} class="term-wrap" style={{ display: p.visible ? "block" : "none" }} />;
}

export function Panel() {
  let body!: HTMLDivElement;
  onMount(() => {
    const ro = new ResizeObserver(() => refitActive());
    ro.observe(body);
    onCleanup(() => ro.disconnect());
  });
  createEffect(on(() => layout.panelHeight, () => refitActive(), { defer: true }));
  return (
    <div class="panel">
      <div class="panel-head">
        <div class="panel-tabs">
          <For each={sessions}>
            {(s) => (
              <div class={`panel-tab ${activeTerm() === s.id ? "active" : ""} ${s.alive ? "" : "dead"}`} onClick={() => setActiveTerm(s.id)}>
                <SquareTerminal size={13} />
                <span>{s.title}</span>
                <button class="icon-btn tiny" title="Kill terminal" onClick={(e) => { e.stopPropagation(); killTerminal(s.id); }}><X size={12} /></button>
              </div>
            )}
          </For>
        </div>
        <div class="panel-actions">
          <button class="icon-btn" title="New terminal" onClick={() => createTerminal()}><Plus size={15} /></button>
          <Show when={activeTerm()}>
            <button class="icon-btn" title="Clear" onClick={() => clearTerminal(activeTerm()!)}><Eraser size={14} /></button>
            <button class="icon-btn" title="Kill terminal" onClick={() => killTerminal(activeTerm()!)}><Trash2 size={14} /></button>
          </Show>
          <button class="icon-btn" title="Hide panel" onClick={() => setLayout("panelOpen", false)}><X size={15} /></button>
        </div>
      </div>
      <div class="panel-body" ref={body}>
        <For each={sessions} fallback={<div class="empty-state"><button class="btn" onClick={() => createTerminal()}>New Terminal</button></div>}>
          {(s) => <TermHost id={s.id} visible={activeTerm() === s.id} />}
        </For>
      </div>
    </div>
  );
}
