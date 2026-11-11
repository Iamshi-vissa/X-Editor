// Editor groups (up to two side by side), tab bars, breadcrumbs and editor views.
import { For, Match, Show, Switch, createEffect, createSignal, on } from "solid-js";
import { ChevronRight, Columns2, Eye, Play, X } from "lucide-solid";
import { basename, relative } from "../lib/paths";
import { isMarkdown } from "../lib/languages";
import {
  activeGroup, closeOtherTabs, closeTab, docMeta, focusTab, getDoc, groups, moveTab, setActiveGroup, splitActive,
  type Group, type Tab,
} from "../state/editor";
import { workspace } from "../state/workspace";
import { layout } from "../state/ui";
import { settings } from "../state/settings";
import { openMarkdownPreview, runActiveFile } from "../state/actions";
import { FileIcon } from "./Icons";
import { showContextMenu } from "./Overlays";
import { writeText } from "./clipboard";
import { SettingsView, KeybindingsView } from "./SettingsView";
import { DiffView } from "./DiffView";
import { MarkdownPreview } from "./MarkdownPreview";

let dragTab: string | null = null;

function TabItem(p: { tab: Tab; groupIndex: number; active: boolean }) {
  const dirty = () => (p.tab.kind === "file" ? docMeta[p.tab.id.slice(5)]?.dirty : false);
  const title = () => (p.tab.kind === "file" ? (docMeta[p.tab.id.slice(5)]?.name ?? p.tab.title) : p.tab.title);
  const close = (e: MouseEvent) => {
    e.stopPropagation();
    closeTab(p.tab.id);
  };
  return (
    <div
      class={`tab ${p.active ? "active" : ""} ${dirty() ? "dirty" : ""}`}
      draggable={true}
      onDragStart={(e) => { dragTab = p.tab.id; e.dataTransfer?.setData("text/plain", p.tab.id); }}
      onDragEnd={() => (dragTab = null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragTab || dragTab === p.tab.id) return;
        const idx = groups[p.groupIndex].tabs.findIndex((t) => t.id === p.tab.id);
        moveTab(dragTab, p.groupIndex, idx);
      }}
      onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(p.tab.id); } }}
      onClick={() => focusTab(p.tab.id)}
      onContextMenu={(e) => showContextMenu(e, [
        { label: "Close", run: () => closeTab(p.tab.id) },
        { label: "Close Others", run: () => closeOtherTabs(p.tab.id) },
        { separator: true, label: "" },
        { label: "Move to Other Side", run: () => { focusTab(p.tab.id); splitActive(); } },
        ...(p.tab.path ? [
          { separator: true, label: "" },
          { label: "Copy Path", run: () => writeText(p.tab.path!) },
          { label: "Copy Relative Path", run: () => writeText(relative(workspace()?.root, p.tab.path!)) },
        ] : []),
      ])}
      title={p.tab.path ?? title()}
    >
      <Show when={p.tab.path} fallback={<span class="tab-glyph" />}>
        <FileIcon path={p.tab.path!} />
      </Show>
      <span class="tab-title">{title()}</span>
      <button class="tab-close" aria-label="Close tab" onClick={close} onMouseDown={(e) => e.stopPropagation()}>
        <span class="tab-dirty-dot" />
        <X size={13} />
      </button>
    </div>
  );
}

function Breadcrumbs(p: { tab: Tab }) {
  const parts = () => relative(workspace()?.root, p.tab.path ?? "").split("/").filter(Boolean);
  return (
    <div class="breadcrumbs">
      <div class="crumbs">
        <For each={parts()}>
          {(part, i) => (
            <>
              <Show when={i() > 0}><ChevronRight size={12} class="crumb-sep" /></Show>
              <span class={i() === parts().length - 1 ? "crumb last" : "crumb"}>{part}</span>
            </>
          )}
        </For>
      </div>
      <div class="crumb-actions">
        <Show when={p.tab.path && isMarkdown(p.tab.path)}>
          <button class="icon-btn" title="Preview Markdown" onClick={openMarkdownPreview}><Eye size={14} /></button>
        </Show>
        <button class="icon-btn" title="Run this file" onClick={runActiveFile}><Play size={14} /></button>
        <button class="icon-btn" title="Split editor" onClick={splitActive}><Columns2 size={14} /></button>
      </div>
    </div>
  );
}

function FileHost(p: { tab: Tab; visible: boolean }) {
  const doc = () => getDoc(p.tab.id.slice(5));
  createEffect(on(() => p.visible, (v) => {
    const d = doc();
    if (v && d) requestAnimationFrame(() => d.view.requestMeasure());
  }));
  return (
    <div class="editor-host" style={{ display: p.visible ? "flex" : "none" }}>
      {doc()?.view.dom}
    </div>
  );
}

function GroupView(p: { group: Group; index: number }) {
  const [dropping, setDropping] = createSignal(false);
  const active = () => p.group.tabs.find((t) => t.id === p.group.active) ?? null;
  return (
    <section
      class={`editor-group ${activeGroup() === p.index ? "focused" : ""}`}
      onMouseDown={() => activeGroup() !== p.index && setActiveGroup(p.index)}
    >
      <div
        class={`tabbar ${dropping() ? "drop" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => { e.preventDefault(); setDropping(false); if (dragTab) moveTab(dragTab, p.index); }}
        onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}
      >
        <For each={p.group.tabs}>{(tab) => <TabItem tab={tab} groupIndex={p.index} active={tab.id === p.group.active} />}</For>
      </div>
      <Show when={active()?.kind === "file" && active()?.path}>
        <Breadcrumbs tab={active()!} />
      </Show>
      <div class={`editor-stack ${layout.mode === "flow" ? "flow" : ""}`} style={{ "--flow-width": `${settings["editor.flowWidth"]}ch` }}>
        <For each={p.group.tabs}>
          {(tab) => (
            <Switch>
              <Match when={tab.kind === "file"}><FileHost tab={tab} visible={tab.id === p.group.active} /></Match>
              <Match when={tab.id === p.group.active && tab.kind === "settings"}><SettingsView /></Match>
              <Match when={tab.id === p.group.active && tab.kind === "keybindings"}><KeybindingsView /></Match>
              <Match when={tab.id === p.group.active && tab.kind === "diff"}><DiffView path={tab.path!} /></Match>
              <Match when={tab.id === p.group.active && tab.kind === "preview"}><MarkdownPreview path={tab.path!} /></Match>
            </Switch>
          )}
        </For>
      </div>
    </section>
  );
}

export function EditorArea() {
  return (
    <div class="editor-area">
      <For each={groups}>{(g, i) => <GroupView group={g} index={i()} />}</For>
    </div>
  );
}

export const hasOpenTabs = () => groups.some((g) => g.tabs.length > 0);
export const tabLabel = (t: Tab) => (t.path ? basename(t.path) : t.title);
