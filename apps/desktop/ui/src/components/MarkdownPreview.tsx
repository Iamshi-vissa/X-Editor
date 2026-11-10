// Live Markdown preview that follows the source editor as you type.
import { createMemo } from "solid-js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { openUrl } from "@tauri-apps/plugin-opener";
import { basename } from "../lib/paths";
import { docForPath, docMeta } from "../state/editor";

export function MarkdownPreview(p: { path: string }) {
  const html = createMemo(() => {
    const doc = docForPath(p.path);
    // Re-run whenever the source document's version changes.
    void (doc ? docMeta[doc.id]?.version : 0);
    const text = doc ? doc.view.state.doc.toString() : "*Open the Markdown file to preview it.*";
    return DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string);
  });
  return (
    <div
      class="md-preview"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (a?.href && /^https?:/.test(a.href)) {
          e.preventDefault();
          openUrl(a.href).catch(() => {});
        }
      }}
    >
      <div class="md-body" aria-label={`Preview of ${basename(p.path)}`} innerHTML={html()} />
    </div>
  );
}
