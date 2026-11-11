// Settings and keyboard-shortcut editors. Every change applies live and is written to
// settings.json (only values that differ from the defaults).
import { For, Show, createMemo, createSignal } from "solid-js";
import { RotateCcw, FileJson, Search } from "lucide-solid";
import { DEFAULTS, isModified, resetSetting, setKeybinding, setSetting, settings, settingsError, type SettingKey } from "../state/settings";
import { allThemes } from "../state/actions";
import { commands, keyFor, runCommand } from "../state/commands";
import { eventToKey, prettyKey } from "../lib/keys";
import { fuzzyFilter } from "../lib/fuzzy";
import { appInfo } from "../state/ui";

type Control =
  | { type: "toggle" }
  | { type: "number"; min: number; max: number; step?: number }
  | { type: "select"; options: [string, string][] }
  | { type: "text"; placeholder?: string }
  | { type: "color" }
  | { type: "list"; placeholder?: string };

interface Item { key: SettingKey; title: string; description: string; control: Control }
interface Section { title: string; items: Item[] }

const SECTIONS: Section[] = [
  {
    title: "Appearance",
    items: [
      { key: "theme.accent", title: "Accent color", description: "Overrides the theme's accent. Leave empty to use the theme's own.", control: { type: "color" } },
      { key: "ui.fontSize", title: "Interface font size", description: "Size of text in sidebars, tabs and menus.", control: { type: "number", min: 10, max: 18 } },
      { key: "ui.density", title: "Density", description: "Compact fits more on screen; comfortable gives everything more room.", control: { type: "select", options: [["comfortable", "Comfortable"], ["compact", "Compact"]] } },
      { key: "ui.radius", title: "Corner roundness", description: "Radius of panels and controls, in pixels.", control: { type: "number", min: 0, max: 16 } },
      { key: "ui.sidebarSide", title: "Sidebar position", description: "Which side the sidebar sits on.", control: { type: "select", options: [["left", "Left"], ["right", "Right"]] } },
      { key: "ui.animations", title: "Animations", description: "Smooth transitions in the interface. Turn off for maximum snappiness.", control: { type: "toggle" } },
      { key: "ui.zoom", title: "Zoom", description: "Scales the whole interface.", control: { type: "number", min: 0.6, max: 2, step: 0.1 } },
    ],
  },
  {
    title: "Editor",
    items: [
      { key: "editor.fontFamily", title: "Font family", description: "Any installed font. JetBrains Mono ships with X-Editor.", control: { type: "text", placeholder: "JetBrains Mono Variable" } },
      { key: "editor.fontSize", title: "Font size", description: "Size of code text.", control: { type: "number", min: 8, max: 32 } },
      { key: "editor.lineHeight", title: "Line height", description: "Space between lines, as a multiple of the font size.", control: { type: "number", min: 1, max: 2.4, step: 0.05 } },
      { key: "editor.ligatures", title: "Font ligatures", description: "Join character pairs like => and != into single glyphs.", control: { type: "toggle" } },
      { key: "editor.tabSize", title: "Tab size", description: "Width of a tab / indentation level.", control: { type: "number", min: 1, max: 8 } },
      { key: "editor.insertSpaces", title: "Indent with spaces", description: "Pressing Tab inserts spaces instead of a tab character.", control: { type: "toggle" } },
      { key: "editor.wordWrap", title: "Word wrap", description: "Wrap long lines to the width of the editor.", control: { type: "toggle" } },
      { key: "editor.lineNumbers", title: "Line numbers", description: "Relative numbers count from the cursor line, handy for jumps.", control: { type: "select", options: [["on", "On"], ["relative", "Relative"], ["off", "Off"]] } },
      { key: "editor.indentGuides", title: "Indent guides", description: "Vertical lines showing indentation, with the current block highlighted.", control: { type: "toggle" } },
      { key: "editor.highlightActiveLine", title: "Highlight current line", description: "", control: { type: "toggle" } },
      { key: "editor.cursorBlink", title: "Blinking cursor", description: "", control: { type: "toggle" } },
      { key: "editor.smoothCaret", title: "Smooth cursor", description: "Animate the cursor as it moves.", control: { type: "toggle" } },
      { key: "editor.bracketMatching", title: "Bracket matching", description: "Highlight the bracket that matches the one at the cursor.", control: { type: "toggle" } },
      { key: "editor.autoCloseBrackets", title: "Auto-close brackets and quotes", description: "", control: { type: "toggle" } },
      { key: "editor.foldGutter", title: "Code folding arrows", description: "", control: { type: "toggle" } },
      { key: "editor.gitGutter", title: "Git change markers", description: "Coloured bars beside lines you've added or changed since the last commit.", control: { type: "toggle" } },
      { key: "editor.flowWidth", title: "Flow mode width", description: "Maximum line width (in characters) of the centred editor in Flow mode.", control: { type: "number", min: 60, max: 200 } },
    ],
  },
  {
    title: "Files",
    items: [
      { key: "files.autosave", title: "Auto save", description: "Save automatically after a pause in typing, or when the editor loses focus.", control: { type: "select", options: [["off", "Off"], ["afterDelay", "After a delay"], ["onFocusChange", "When focus leaves the editor"]] } },
      { key: "files.autosaveDelay", title: "Auto save delay (ms)", description: "", control: { type: "number", min: 200, max: 10000, step: 100 } },
      { key: "editor.trimTrailingWhitespace", title: "Trim trailing whitespace on save", description: "", control: { type: "toggle" } },
      { key: "editor.insertFinalNewline", title: "Ensure a final newline on save", description: "", control: { type: "toggle" } },
      { key: "files.exclude", title: "Hidden files", description: "Names hidden from the file tree, separated by commas.", control: { type: "list", placeholder: ".DS_Store, Thumbs.db" } },
    ],
  },
  {
    title: "Terminal",
    items: [
      { key: "terminal.shell", title: "Shell", description: "Program to run. Empty uses your default shell.", control: { type: "text", placeholder: "default" } },
      { key: "terminal.shellArgs", title: "Shell arguments", description: "Separated by commas.", control: { type: "list", placeholder: "-l" } },
      { key: "terminal.fontSize", title: "Font size", description: "", control: { type: "number", min: 8, max: 28 } },
      { key: "terminal.fontFamily", title: "Font family", description: "Empty uses the editor font.", control: { type: "text", placeholder: "editor font" } },
      { key: "terminal.cursorStyle", title: "Cursor style", description: "", control: { type: "select", options: [["bar", "Bar"], ["block", "Block"], ["underline", "Underline"]] } },
      { key: "terminal.scrollback", title: "Scrollback lines", description: "", control: { type: "number", min: 1000, max: 100000, step: 1000 } },
    ],
  },
  {
    title: "Code Intelligence",
    items: [
      { key: "lsp.enabled", title: "Language servers", description: "Autocomplete, go to definition, rename, hover docs and inline errors. Servers are configured in settings.json under \"lsp.servers\".", control: { type: "toggle" } },
    ],
  },
  {
    title: "GitHub",
    items: [
      { key: "github.clientId", title: "OAuth client ID", description: "Only needed if this build wasn't compiled with one. See docs/GITHUB_LOGIN.md.", control: { type: "text", placeholder: "Ov23li…" } },
    ],
  },
];

function ControlFor(p: { item: Item }) {
  const value = () => settings[p.item.key] as unknown;
  const set = (v: unknown) => setSetting(p.item.key, v as never);
  const c = p.item.control;
  switch (c.type) {
    case "toggle":
      return (
        <button class={`switch ${value() ? "on" : ""}`} role="switch" aria-checked={!!value()} onClick={() => set(!value())}>
          <span class="switch-knob" />
        </button>
      );
    case "number":
      return (
        <input class="input input-num" type="number" min={c.min} max={c.max} step={c.step ?? 1} value={value() as number}
          onChange={(e) => { const n = parseFloat(e.currentTarget.value); if (Number.isFinite(n)) set(Math.min(c.max, Math.max(c.min, n))); }} />
      );
    case "select":
      return (
        <select class="input select" value={value() as string} onChange={(e) => set(e.currentTarget.value)}>
          <For each={c.options}>{([v, label]) => <option value={v}>{label}</option>}</For>
        </select>
      );
    case "text":
      return <input class="input input-text" value={(value() as string) ?? ""} placeholder={c.placeholder} spellcheck={false} onChange={(e) => set(e.currentTarget.value.trim())} />;
    case "list":
      return (
        <input class="input input-text" value={((value() as string[]) ?? []).join(", ")} placeholder={c.placeholder} spellcheck={false}
          onChange={(e) => set(e.currentTarget.value.split(",").map((s) => s.trim()).filter(Boolean))} />
      );
    case "color": {
      const swatches = ["#8b7bff", "#b18cff", "#2ee6c5", "#5ab0ff", "#ff8a4c", "#ff6b81", "#5be49b", "#ffd166"];
      return (
        <div class="swatches">
          <button class={`swatch swatch-none ${!value() ? "on" : ""}`} title="Theme default" onClick={() => set("")} />
          <For each={swatches}>{(s) => <button class={`swatch ${value() === s ? "on" : ""}`} style={{ background: s }} title={s} onClick={() => set(s)} />}</For>
          <input class="color-input" type="color" value={(value() as string) || "#8b7bff"} onInput={(e) => set(e.currentTarget.value)} title="Custom color" />
        </div>
      );
    }
  }
}

export function SettingsView() {
  const [q, setQ] = createSignal("");
  const filtered = createMemo(() => {
    const query = q().trim().toLowerCase();
    if (!query) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      items: s.items.filter((i) => `${i.title} ${i.description} ${i.key}`.toLowerCase().includes(query)),
    })).filter((s) => s.items.length);
  });
  return (
    <div class="page">
      <div class="page-inner">
        <div class="page-head">
          <h1>Settings</h1>
          <button class="btn" onClick={() => runCommand("settings.json")}><FileJson size={14} /> Edit settings.json</button>
        </div>
        <Show when={settingsError()}>
          <div class="banner banner-error">settings.json has an error, so your last good settings are still in use: {settingsError()}</div>
        </Show>
        <div class="search-box">
          <Search size={14} />
          <input placeholder="Search settings" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        </div>

        <Show when={!q()}>
          <h2 class="settings-section">Theme</h2>
          <div class="theme-grid">
            <For each={allThemes()}>
              {(t) => (
                <button class={`theme-card ${settings.theme === t.id ? "on" : ""}`} onClick={() => setSetting("theme", t.id)}>
                  <div class="theme-preview" style={{ background: t.colors["bg-app"] ?? (t.kind === "light" ? "#e9eaef" : "#0b0c10") }}>
                    <div class="tp-side" style={{ background: t.colors["bg-panel"] ?? "#121319" }} />
                    <div class="tp-editor" style={{ background: t.colors["bg-editor"] ?? "#14151c" }}>
                      <span style={{ background: t.colors["syn-keyword"] ?? "#c792ff", width: "30%" }} />
                      <span style={{ background: t.colors["syn-function"] ?? "#7cc4ff", width: "55%" }} />
                      <span style={{ background: t.colors["syn-string"] ?? "#9ee6a0", width: "40%" }} />
                      <span style={{ background: t.colors.accent ?? "#8b7bff", width: "20%" }} />
                    </div>
                  </div>
                  <div class="theme-name">{t.name} <span class="muted">· {t.kind}</span></div>
                </button>
              )}
            </For>
          </div>
          <p class="muted small">Add your own theme by placing a JSON file in {appInfo()?.configDir ?? "the config folder"}/themes.</p>
        </Show>

        <For each={filtered()}>
          {(section) => (
            <>
              <h2 class="settings-section">{section.title}</h2>
              <For each={section.items}>
                {(item) => (
                  <div class={`setting ${isModified(item.key) ? "modified" : ""}`}>
                    <div class="setting-text">
                      <div class="setting-title">
                        {item.title}
                        <Show when={isModified(item.key)}>
                          <button class="icon-btn reset" title={`Reset to default (${JSON.stringify(DEFAULTS[item.key])})`} onClick={() => resetSetting(item.key)}><RotateCcw size={12} /></button>
                        </Show>
                      </div>
                      <Show when={item.description}><div class="setting-desc">{item.description}</div></Show>
                      <div class="setting-key">{item.key}</div>
                    </div>
                    <div class="setting-control"><ControlFor item={item} /></div>
                  </div>
                )}
              </For>
            </>
          )}
        </For>
      </div>
    </div>
  );
}

export function KeybindingsView() {
  const [q, setQ] = createSignal("");
  const [recording, setRecording] = createSignal<string | null>(null);
  const rows = createMemo(() => fuzzyFilter(q(), commands, (c) => `${c.category}: ${c.title} ${c.id}`, 500).map((r) => r.item));
  const conflicts = createMemo(() => {
    const seen = new Map<string, number>();
    for (const c of commands) {
      const k = keyFor(c.id);
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return seen;
  });
  const record = (id: string, e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return setRecording(null);
    if (e.key === "Backspace" || e.key === "Delete") {
      setKeybinding(id, "");
      return setRecording(null);
    }
    const k = eventToKey(e);
    if (!k) return;
    setKeybinding(id, k);
    setRecording(null);
  };
  return (
    <div class="page">
      <div class="page-inner">
        <div class="page-head"><h1>Keyboard Shortcuts</h1></div>
        <p class="muted">Click a shortcut, then press the new keys. Backspace removes it, Escape cancels.</p>
        <div class="search-box">
          <Search size={14} />
          <input placeholder="Search commands" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        </div>
        <div class="kb-table">
          <For each={rows()}>
            {(c) => {
              const k = () => keyFor(c.id);
              const custom = () => settings.keybindings[c.id] !== undefined;
              return (
                <div class={`kb-row ${custom() ? "modified" : ""}`}>
                  <div class="kb-cmd">
                    <span class="muted">{c.category}:</span> {c.title}
                    <div class="setting-key">{c.id}</div>
                  </div>
                  <button
                    class={`kb-key ${recording() === c.id ? "recording" : ""} ${k() && (conflicts().get(k()!) ?? 0) > 1 ? "conflict" : ""}`}
                    onClick={() => setRecording(c.id)}
                    onKeyDown={(e) => recording() === c.id && record(c.id, e)}
                    onBlur={() => recording() === c.id && setRecording(null)}
                    title={k() && (conflicts().get(k()!) ?? 0) > 1 ? "Another command uses this shortcut" : ""}
                  >
                    {recording() === c.id ? "Press keys…" : k() ? <kbd class="kbd">{prettyKey(k())}</kbd> : <span class="muted">—</span>}
                  </button>
                  <Show when={custom()} fallback={<span class="kb-reset-space" />}>
                    <button class="icon-btn" title="Reset to default" onClick={() => setKeybinding(c.id, null)}><RotateCcw size={12} /></button>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
