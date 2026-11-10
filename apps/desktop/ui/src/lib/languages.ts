// Maps files to CodeMirror languages (loaded lazily) and to LSP language ids.
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { basename, extname } from "./paths";

export function findLanguage(path: string): LanguageDescription | null {
  const name = basename(path);
  return LanguageDescription.matchFilename(languages, name) ?? null;
}

/** LSP languageId for a file, per the LSP spec's list. */
export function lspLanguageId(path: string): string | null {
  const ext = extname(path);
  const map: Record<string, string> = {
    ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescriptreact",
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascriptreact",
    rs: "rust", py: "python", pyi: "python", go: "go",
    c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp",
    java: "java", rb: "ruby", php: "php", cs: "csharp", swift: "swift", kt: "kotlin",
    lua: "lua", zig: "zig", json: "json", css: "css", scss: "scss", html: "html", vue: "vue", svelte: "svelte",
    md: "markdown", yaml: "yaml", yml: "yaml", toml: "toml", sh: "shellscript", bash: "shellscript",
  };
  return map[ext] ?? null;
}

export function languageLabel(path: string): string {
  return findLanguage(path)?.name ?? (extname(path) ? extname(path).toUpperCase() : "Plain Text");
}

export const isMarkdown = (path: string) => ["md", "markdown", "mdx"].includes(extname(path));
