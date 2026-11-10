// Keyboard shortcuts as strings like "Mod+Shift+P". "Mod" is Cmd on macOS, Ctrl elsewhere.
export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const CODE_NAMES: Record<string, string> = {
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Space: "Space",
  NumpadAdd: "=", NumpadSubtract: "-",
};

export function eventToKey(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  let key: string;
  if (e.code.startsWith("Key")) key = e.code.slice(3);
  else if (e.code.startsWith("Digit")) key = e.code.slice(5);
  else if (CODE_NAMES[e.code]) key = CODE_NAMES[e.code];
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (isMac && e.ctrlKey) parts.push("Ctrl");
  if (!isMac && e.metaKey) parts.push("Meta");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/** Puts modifiers in canonical order so user-written bindings match events. */
export function normalizeKey(k: string): string {
  const parts = k.split("+").map((p) => p.trim()).filter(Boolean);
  const key = parts.pop() ?? "";
  const mods = new Set(parts.map((p) => {
    const l = p.toLowerCase();
    if (l === "cmd" || l === "command") return isMac ? "Mod" : "Meta";
    if (l === "ctrl" || l === "control") return isMac ? "Ctrl" : "Mod";
    if (l === "mod") return "Mod";
    if (l === "option" || l === "alt") return "Alt";
    if (l === "shift") return "Shift";
    if (l === "meta" || l === "super" || l === "win") return "Meta";
    return p;
  }));
  const order = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];
  return [...order.filter((m) => mods.has(m)), key.length === 1 ? key.toUpperCase() : key].join("+");
}

/** Human-readable form: "⌘⇧P" on macOS, "Ctrl+Shift+P" elsewhere. */
export function prettyKey(k: string | undefined): string {
  if (!k) return "";
  const n = normalizeKey(k);
  if (!isMac) return n.replace("Mod", "Ctrl");
  const map: Record<string, string> = { Mod: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘", Enter: "↩", Backspace: "⌫", Escape: "⎋", Tab: "⇥", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  return n.split("+").map((p) => map[p] ?? p).join("");
}
