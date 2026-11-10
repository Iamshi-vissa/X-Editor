// Builds the CodeMirror extensions for one document. Settings-dependent pieces live in
// compartments so changing a setting reconfigures every open editor live.
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection,
  dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, gutter, GutterMarker,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { foldGutter, indentOnInput, bracketMatching, foldKeymap, indentUnit } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { editorTheme, syntaxColors } from "./theme";
import { settings } from "../state/settings";

export const configCompartment = new Compartment();
export const themeCompartment = new Compartment();
export const languageCompartment = new Compartment();
export const lspCompartment = new Compartment();
export const gitCompartment = new Compartment();
export const readOnlyCompartment = new Compartment();

class RelNumber extends GutterMarker {
  constructor(readonly text: string) { super(); }
  eq(o: RelNumber) { return o.text === this.text; }
  toDOM() { return document.createTextNode(this.text); }
}

/** Line numbers relative to the cursor line (the cursor line shows its absolute number). */
const relativeLineNumbers = gutter({
  class: "cm-lineNumbers",
  lineMarker(view, line) {
    const cur = view.state.doc.lineAt(view.state.selection.main.head).number;
    const n = view.state.doc.lineAt(line.from).number;
    return new RelNumber(n === cur ? String(n) : String(Math.abs(n - cur)));
  },
  lineMarkerChange: (u) => u.selectionSet || u.docChanged,
  initialSpacer: () => new RelNumber("000"),
});

/** The part of the editor config that depends on user settings. */
export function configExtensions(): Extension {
  const s = settings;
  const ext: Extension[] = [
    EditorState.tabSize.of(s["editor.tabSize"]),
    indentUnit.of(s["editor.insertSpaces"] ? " ".repeat(s["editor.tabSize"]) : "\t"),
    drawSelection({ cursorBlinkRate: s["editor.cursorBlink"] ? 1100 : 0 }),
  ];
  if (s["editor.lineNumbers"] === "on") ext.push(lineNumbers(), highlightActiveLineGutter());
  if (s["editor.lineNumbers"] === "relative") ext.push(relativeLineNumbers, highlightActiveLineGutter());
  if (s["editor.foldGutter"]) ext.push(foldGutter({ openText: "⌄", closedText: "›" }));
  if (s["editor.wordWrap"]) ext.push(EditorView.lineWrapping);
  if (s["editor.highlightActiveLine"]) ext.push(highlightActiveLine());
  if (s["editor.bracketMatching"]) ext.push(bracketMatching());
  if (s["editor.autoCloseBrackets"]) ext.push(closeBrackets());
  if (s["editor.indentGuides"]) {
    ext.push(indentationMarkers({
      highlightActiveBlock: true,
      markerType: "fullScope",
      thickness: 1,
      colors: { light: "var(--border-strong)", dark: "var(--border-strong)", activeLight: "var(--accent)", activeDark: "var(--accent)" },
    }));
  }
  return ext;
}

export function baseExtensions(opts: { onUpdate: Extension; dark: boolean }): Extension {
  return [
    configCompartment.of(configExtensions()),
    themeCompartment.of(editorTheme(opts.dark)),
    languageCompartment.of([]),
    lspCompartment.of([]),
    gitCompartment.of([]),
    readOnlyCompartment.of([]),
    highlightSpecialChars(),
    history(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxColors,
    autocompletion({ activateOnTyping: true, icons: true }),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    opts.onUpdate,
  ];
}
