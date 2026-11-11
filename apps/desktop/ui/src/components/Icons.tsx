import type { JSX } from "solid-js";
import { extname, basename } from "../lib/paths";

export const GithubMark = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export const Logo = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient id="xe-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--accent-strong)" />
        <stop offset="1" stop-color="var(--accent)" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#xe-g)" />
    <path d="M10 9.5 L22 22.5 M22 9.5 L10 22.5" stroke="var(--accent-text)" stroke-width="3.2" stroke-linecap="round" />
  </svg>
);

// File-type badges: a short label on a coloured chip. Cheap to render and readable at a glance.
const FILE_KINDS: Record<string, [string, string]> = {
  ts: ["TS", "#3b82f6"], tsx: ["TSX", "#38bdf8"], mts: ["TS", "#3b82f6"], cts: ["TS", "#3b82f6"],
  js: ["JS", "#eab308"], jsx: ["JSX", "#facc15"], mjs: ["JS", "#eab308"], cjs: ["JS", "#eab308"],
  json: ["{}", "#f59e0b"], jsonc: ["{}", "#f59e0b"], rs: ["RS", "#f97316"], py: ["PY", "#60a5fa"],
  go: ["GO", "#22d3ee"], c: ["C", "#93c5fd"], h: ["H", "#a5b4fc"], cpp: ["C++", "#60a5fa"], cc: ["C++", "#60a5fa"], hpp: ["H++", "#a5b4fc"],
  java: ["JV", "#f87171"], kt: ["KT", "#a78bfa"], cs: ["C#", "#a78bfa"], rb: ["RB", "#f43f5e"], php: ["PHP", "#818cf8"],
  swift: ["SW", "#fb923c"], dart: ["DT", "#38bdf8"], lua: ["LUA", "#60a5fa"], zig: ["ZIG", "#f59e0b"],
  html: ["<>", "#f97316"], htm: ["<>", "#f97316"], css: ["#", "#38bdf8"], scss: ["#", "#f472b6"], less: ["#", "#818cf8"],
  vue: ["V", "#34d399"], svelte: ["S", "#fb7185"], md: ["MD", "#94a3b8"], mdx: ["MDX", "#94a3b8"],
  yml: ["YML", "#f87171"], yaml: ["YML", "#f87171"], toml: ["TML", "#a3a3a3"], xml: ["XML", "#fb923c"],
  sh: ["$", "#4ade80"], bash: ["$", "#4ade80"], zsh: ["$", "#4ade80"], ps1: [">_", "#60a5fa"],
  sql: ["SQL", "#f472b6"], svg: ["SVG", "#fbbf24"], png: ["IMG", "#a78bfa"], jpg: ["IMG", "#a78bfa"], gif: ["IMG", "#a78bfa"],
  lock: ["LCK", "#71717a"], txt: ["TXT", "#a1a1aa"], env: ["ENV", "#facc15"], dockerfile: ["DK", "#38bdf8"],
};
const NAMED: Record<string, [string, string]> = {
  "package.json": ["NPM", "#ef4444"], "cargo.toml": ["CRG", "#f97316"], dockerfile: ["DK", "#38bdf8"], makefile: ["MK", "#a3a3a3"],
  ".gitignore": ["GIT", "#f97316"], "readme.md": ["i", "#60a5fa"], license: ["LIC", "#a1a1aa"], ".env": ["ENV", "#facc15"],
};

export function FileIcon(p: { path: string; style?: JSX.CSSProperties }) {
  const kind = () => NAMED[basename(p.path).toLowerCase()] ?? FILE_KINDS[extname(p.path)] ?? ["", "var(--text-faint)"];
  return (
    <span class="file-icon" style={{ "--fi": kind()[1], ...p.style }}>
      {kind()[0] || <span class="file-icon-dot" />}
    </span>
  );
}
