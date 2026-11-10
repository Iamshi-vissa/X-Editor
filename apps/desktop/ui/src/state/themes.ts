// Themes are flat token maps applied as CSS variables. The editor's syntax colours read
// the same variables, so switching theme is instant and needs no editor reconfiguration.
// Users can add their own: drop a JSON file with { "id", "name", "kind", "colors": {...} }
// into <config>/x-editor/themes/. Missing tokens fall back to the theme it "extends".

export interface Theme {
  id: string;
  name: string;
  kind: "dark" | "light";
  extends?: string;
  colors: Record<string, string>;
}

const midnight: Theme = {
  id: "midnight",
  name: "Midnight",
  kind: "dark",
  colors: {
    "bg-app": "#0b0c10",
    "bg-panel": "#121319",
    "bg-editor": "#14151c",
    "bg-raised": "#1b1d26",
    "bg-hover": "#22242f",
    "bg-active": "#2a2c3a",
    "bg-input": "#0f1015",
    border: "#23252f",
    "border-strong": "#323544",
    text: "#e6e7ee",
    "text-muted": "#9a9db0",
    "text-faint": "#62657a",
    accent: "#8b7bff",
    "accent-strong": "#a597ff",
    "accent-text": "#ffffff",
    "accent-soft": "rgba(139,123,255,0.16)",
    selection: "rgba(139,123,255,0.28)",
    "line-active": "rgba(255,255,255,0.035)",
    danger: "#ff6b81",
    warning: "#ffb454",
    success: "#5be49b",
    info: "#5ab0ff",
    "git-added": "#5be49b",
    "git-modified": "#ffb454",
    "git-deleted": "#ff6b81",
    "syn-keyword": "#c792ff",
    "syn-control": "#ff7edb",
    "syn-string": "#9ee6a0",
    "syn-number": "#ffb86c",
    "syn-comment": "#5f6380",
    "syn-function": "#7cc4ff",
    "syn-type": "#ffd479",
    "syn-variable": "#e6e7ee",
    "syn-property": "#8fd3ff",
    "syn-operator": "#b4b8d0",
    "syn-tag": "#ff8fa3",
    "syn-attribute": "#ffcb6b",
    "syn-constant": "#ff9e64",
    "syn-regexp": "#5ee0d0",
    "syn-heading": "#a597ff",
    "syn-link": "#7cc4ff",
    "syn-invalid": "#ff6b81",
  },
};

const obsidian: Theme = {
  id: "obsidian",
  name: "Obsidian",
  kind: "dark",
  extends: "midnight",
  colors: {
    "bg-app": "#000000",
    "bg-panel": "#09090b",
    "bg-editor": "#050506",
    "bg-raised": "#111114",
    "bg-hover": "#18181c",
    "bg-active": "#202026",
    "bg-input": "#0a0a0c",
    border: "#1a1a1f",
    "border-strong": "#2a2a31",
    accent: "#b18cff",
    "accent-strong": "#c7abff",
    "accent-soft": "rgba(177,140,255,0.14)",
    selection: "rgba(177,140,255,0.26)",
  },
};

const aurora: Theme = {
  id: "aurora",
  name: "Aurora",
  kind: "dark",
  extends: "midnight",
  colors: {
    "bg-app": "#070d14",
    "bg-panel": "#0c1520",
    "bg-editor": "#0e1824",
    "bg-raised": "#13202e",
    "bg-hover": "#182839",
    "bg-active": "#1e3246",
    "bg-input": "#0a121b",
    border: "#162433",
    "border-strong": "#22364a",
    text: "#dce8f2",
    "text-muted": "#8ba3b8",
    "text-faint": "#566e84",
    accent: "#2ee6c5",
    "accent-strong": "#6af2da",
    "accent-text": "#04221c",
    "accent-soft": "rgba(46,230,197,0.14)",
    selection: "rgba(46,230,197,0.22)",
    "syn-keyword": "#7aa2ff",
    "syn-control": "#c792ea",
    "syn-string": "#2ee6c5",
    "syn-function": "#82aaff",
    "syn-type": "#ffcb6b",
    "syn-comment": "#4d6479",
  },
};

const ember: Theme = {
  id: "ember",
  name: "Ember",
  kind: "dark",
  extends: "midnight",
  colors: {
    "bg-app": "#0f0b0a",
    "bg-panel": "#171110",
    "bg-editor": "#1a1312",
    "bg-raised": "#221917",
    "bg-hover": "#2b201d",
    "bg-active": "#352823",
    "bg-input": "#120d0c",
    border: "#2a1f1c",
    "border-strong": "#3a2b26",
    text: "#f1e6df",
    "text-muted": "#b39d92",
    "text-faint": "#7a655b",
    accent: "#ff8a4c",
    "accent-strong": "#ffa775",
    "accent-text": "#1d0d05",
    "accent-soft": "rgba(255,138,76,0.15)",
    selection: "rgba(255,138,76,0.24)",
    "syn-keyword": "#ff8a4c",
    "syn-control": "#ff6f91",
    "syn-string": "#c3e88d",
    "syn-function": "#ffcb6b",
    "syn-type": "#f78c6c",
    "syn-property": "#f0c08a",
    "syn-comment": "#6f5a52",
  },
};

const paper: Theme = {
  id: "paper",
  name: "Paper",
  kind: "light",
  colors: {
    "bg-app": "#e9eaef",
    "bg-panel": "#f4f5f8",
    "bg-editor": "#ffffff",
    "bg-raised": "#ffffff",
    "bg-hover": "#e8e9f0",
    "bg-active": "#dddff0",
    "bg-input": "#ffffff",
    border: "#dcdee6",
    "border-strong": "#c9ccd8",
    text: "#1d1f2b",
    "text-muted": "#5c6075",
    "text-faint": "#9095aa",
    accent: "#6352ff",
    "accent-strong": "#4b39f0",
    "accent-text": "#ffffff",
    "accent-soft": "rgba(99,82,255,0.12)",
    selection: "rgba(99,82,255,0.18)",
    "line-active": "rgba(20,20,60,0.035)",
    danger: "#d92d4b",
    warning: "#b86e00",
    success: "#14935a",
    info: "#1f6fd1",
    "git-added": "#14935a",
    "git-modified": "#b86e00",
    "git-deleted": "#d92d4b",
    "syn-keyword": "#7c3aed",
    "syn-control": "#c0267b",
    "syn-string": "#1a7f37",
    "syn-number": "#b45309",
    "syn-comment": "#8c90a6",
    "syn-function": "#1d5fd0",
    "syn-type": "#a15c00",
    "syn-variable": "#1d1f2b",
    "syn-property": "#0b6e99",
    "syn-operator": "#55596e",
    "syn-tag": "#c0267b",
    "syn-attribute": "#a15c00",
    "syn-constant": "#b45309",
    "syn-regexp": "#0e7d72",
    "syn-heading": "#6352ff",
    "syn-link": "#1d5fd0",
    "syn-invalid": "#d92d4b",
  },
};

export const builtinThemes: Theme[] = [midnight, obsidian, aurora, ember, paper];

/** Fills in a theme's missing tokens from the theme it extends (or midnight / paper). */
export function resolveTheme(theme: Theme, all: Theme[]): Theme {
  const baseId = theme.extends ?? (theme.kind === "light" ? "paper" : "midnight");
  const base = baseId !== theme.id ? all.find((t) => t.id === baseId) : undefined;
  const baseColors = base ? resolveTheme(base, all).colors : {};
  return { ...theme, colors: { ...baseColors, ...theme.colors } };
}

export function isTheme(v: unknown): v is Theme {
  const t = v as Theme;
  return !!t && typeof t.id === "string" && typeof t.name === "string" && typeof t.colors === "object" && (t.kind === "dark" || t.kind === "light");
}

function mix(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Writes a theme (with an optional accent override) to :root as CSS variables. */
export function applyTheme(theme: Theme, accentOverride?: string) {
  const root = document.documentElement;
  const colors = { ...theme.colors };
  if (accentOverride && /^#[0-9a-f]{6}$/i.test(accentOverride)) {
    colors.accent = accentOverride;
    colors["accent-strong"] = accentOverride;
    colors["accent-soft"] = mix(accentOverride, 0.15);
    colors.selection = mix(accentOverride, 0.26);
  }
  for (const [k, v] of Object.entries(colors)) root.style.setProperty(`--${k}`, v);
  root.dataset.themeKind = theme.kind;
  root.style.colorScheme = theme.kind;
}
