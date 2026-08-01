import React, { useRef, useEffect } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";
import type { DocumentState } from "../../types";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useTaskStore } from "../../stores/useTaskStore";

interface Props {
    document: DocumentState;
}

const resolveMonacoTheme = (themeName: string): string => {
    if (themeName === 'monochrome' || themeName === 'grey-black-white') return 'monochrome-theme';
    if (themeName === 'vscode-dark') return 'vscode-dark-theme';
    if (themeName === 'cyberpunk') return 'cyberpunk-theme';
    if (themeName === 'light') return 'vs';
    if (themeName === 'purple-dark' || themeName === 'dark') return 'premium-purple';
    if (themeName === 'system') {
        const isDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isDark ? 'premium-purple' : 'vs';
    }
    return 'premium-purple';
};

export const MonacoAdapter: React.FC<Props> = ({ document }) => {
    const { updateDocumentContent } = useDocumentStore();
    const { theme } = useSettingsStore();
    const { activeProblem } = useTaskStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null);
    const monaco = useMonaco();

    useEffect(() => {
        if (monaco) {
            monaco.editor.defineTheme("premium-purple", {
                base: "vs-dark",
                inherit: true,
                rules: [
                    { token: "", background: "0e0e14", foreground: "e4e0f0" },
                    { token: "keyword", foreground: "c084fc", fontStyle: "bold" },
                    { token: "keyword.control", foreground: "f472b6", fontStyle: "bold" },
                    { token: "keyword.operator", foreground: "a855f7" },
                    { token: "string", foreground: "34d399" },
                    { token: "string.escape", foreground: "6ee7b7" },
                    { token: "string.quote", foreground: "34d399" },
                    { token: "number", foreground: "fb923c" },
                    { token: "number.hex", foreground: "f97316" },
                    { token: "number.float", foreground: "fb923c" },
                    { token: "constant.numeric", foreground: "fb923c" },
                    { token: "comment", foreground: "71717a", fontStyle: "italic" },
                    { token: "comment.line", foreground: "71717a", fontStyle: "italic" },
                    { token: "comment.block", foreground: "71717a", fontStyle: "italic" },
                    { token: "comment.doc", foreground: "9ca3af", fontStyle: "italic" },
                    { token: "type", foreground: "38bdf8", fontStyle: "bold" },
                    { token: "type.identifier", foreground: "38bdf8" },
                    { token: "entity.name.type", foreground: "38bdf8", fontStyle: "bold" },
                    { token: "support.type", foreground: "38bdf8" },
                    { token: "function", foreground: "818cf8" },
                    { token: "entity.name.function", foreground: "818cf8" },
                    { token: "support.function", foreground: "a78bfa" },
                    { token: "variable", foreground: "e2e8f0" },
                    { token: "variable.parameter", foreground: "fcd34d" },
                    { token: "variable.other", foreground: "e2e8f0" },
                    { token: "delimiter", foreground: "94a3b8" },
                    { token: "delimiter.bracket", foreground: "f472b6" },
                    { token: "delimiter.parenthesis", foreground: "38bdf8" },
                    { token: "operator", foreground: "c084fc" },
                    { token: "tag", foreground: "f472b6", fontStyle: "bold" },
                    { token: "tag.html", foreground: "f472b6", fontStyle: "bold" },
                    { token: "attribute.name", foreground: "818cf8" },
                    { token: "attribute.value", foreground: "34d399" },
                    { token: "property", foreground: "38bdf8" },
                    { token: "value.css", foreground: "fb923c" }
                ],
                colors: {
                    "editor.background": "#0e0e14",
                    "editor.foreground": "#e4e0f0",
                    "editor.lineHighlightBackground": "#201a29",
                    "editorLineNumber.foreground": "#7a7590",
                    "editorLineNumber.activeForeground": "#8b5cf6",
                    "editorCursor.foreground": "#8b5cf6",
                    "editorIndentGuide.background": "#272230",
                    "editorIndentGuide.activeBackground": "#8b5cf6",
                    "editor.selectionBackground": "#8b5cf640",
                    "minimap.background": "#0e0e14"
                }
            });

            monaco.editor.defineTheme("vscode-dark-theme", {
                base: "vs-dark",
                inherit: true,
                rules: [
                    { token: "", foreground: "D4D4D4", background: "1E1E1E" },
                    { token: "keyword", foreground: "569CD6", fontStyle: "bold" },
                    { token: "keyword.control", foreground: "C586C0", fontStyle: "bold" },
                    { token: "string", foreground: "CE9178" },
                    { token: "number", foreground: "B5CEA8" },
                    { token: "comment", foreground: "6A9955", fontStyle: "italic" },
                    { token: "type", foreground: "4EC9B0" },
                    { token: "function", foreground: "DCDCAA" },
                    { token: "variable", foreground: "9CDCFE" },
                    { token: "tag", foreground: "569CD6" },
                    { token: "attribute.name", foreground: "9CDCFE" },
                    { token: "attribute.value", foreground: "CE9178" }
                ],
                colors: {
                    "editor.background": "#1E1E1E",
                    "editor.foreground": "#D4D4D4"
                }
            });

            monaco.editor.defineTheme("cyberpunk-theme", {
                base: "vs-dark",
                inherit: true,
                rules: [
                    { token: "", foreground: "00F0FF", background: "0D0E15" },
                    { token: "keyword", foreground: "FF007F", fontStyle: "bold" },
                    { token: "keyword.control", foreground: "FF007F", fontStyle: "bold" },
                    { token: "string", foreground: "FFE600" },
                    { token: "number", foreground: "FF9900" },
                    { token: "comment", foreground: "727585", fontStyle: "italic" },
                    { token: "type", foreground: "00F0FF", fontStyle: "bold" },
                    { token: "function", foreground: "39FF14" },
                    { token: "variable", foreground: "FCEE0A" },
                    { token: "tag", foreground: "FF007F" },
                    { token: "attribute.name", foreground: "00F0FF" }
                ],
                colors: {
                    "editor.background": "#0D0E15",
                    "editor.foreground": "#00F0FF"
                }
            });

            monaco.editor.defineTheme("monochrome-theme", {
                base: "vs-dark",
                inherit: true,
                rules: [
                    { token: "", background: "000000", foreground: "ffffff" },
                    { token: "keyword", foreground: "ffffff", fontStyle: "bold" },
                    { token: "keyword.control", foreground: "e5e5e5", fontStyle: "bold" },
                    { token: "keyword.operator", foreground: "d4d4d4" },
                    { token: "string", foreground: "a3a3a3" },
                    { token: "string.escape", foreground: "d4d4d4" },
                    { token: "number", foreground: "e5e5e5" },
                    { token: "constant.numeric", foreground: "e5e5e5" },
                    { token: "comment", foreground: "666666", fontStyle: "italic" },
                    { token: "comment.line", foreground: "666666", fontStyle: "italic" },
                    { token: "comment.block", foreground: "666666", fontStyle: "italic" },
                    { token: "type", foreground: "f5f5f5", fontStyle: "bold" },
                    { token: "function", foreground: "e5e5e5" },
                    { token: "variable", foreground: "d4d4d4" },
                    { token: "delimiter", foreground: "888888" },
                    { token: "delimiter.bracket", foreground: "cccccc" },
                    { token: "tag", foreground: "ffffff", fontStyle: "bold" },
                    { token: "attribute.name", foreground: "cccccc" },
                    { token: "attribute.value", foreground: "a3a3a3" }
                ],
                colors: {
                    "editor.background": "#000000",
                    "editor.foreground": "#ffffff",
                    "editor.lineHighlightBackground": "#181818",
                    "editorLineNumber.foreground": "#666666",
                    "editorLineNumber.activeForeground": "#ffffff",
                    "editorCursor.foreground": "#ffffff",
                    "editorIndentGuide.background": "#222222",
                    "editorIndentGuide.activeBackground": "#666666",
                    "editor.selectionBackground": "#333333",
                    "minimap.background": "#000000"
                }
            });
        }
    }, [monaco]);

    const handleEditorMount: OnMount = (editor) => {
        editorRef.current = editor;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).activeMonacoEditor = editor;
        editor.onDidFocusEditorText(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).activeMonacoEditor = editor;
        });
    };

    useEffect(() => {
        if (activeProblem && editorRef.current) {
            const isMatch = document.path.endsWith(activeProblem.file) || activeProblem.file.endsWith(document.path);
            if (isMatch) {
                editorRef.current.revealLineInCenter(activeProblem.line);
                editorRef.current.setPosition({
                    lineNumber: activeProblem.line,
                    column: activeProblem.column ?? 1,
                });
                editorRef.current.focus();
            }
        }
    }, [activeProblem, document.path]);

    const handleChange = (value: string | undefined) => {
        if (value !== undefined) {
            updateDocumentContent(document.id, value);
        }
    };

    const activeTheme = resolveMonacoTheme(theme);

    return (
        <Editor
            height="100%"
            path={document.path}
            language={document.language}
            value={document.content}
            theme={activeTheme}
            onChange={handleChange}
            onMount={handleEditorMount}
            options={{
                minimap: { enabled: true, renderCharacters: false },
                wordWrap: 'on',
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
                fontLigatures: true,
                padding: { top: 16 },
                lineNumbers: "on",
                renderLineHighlight: "all",
                matchBrackets: "always",
                bracketPairColorization: { enabled: true },
                automaticLayout: true,
                suggestOnTriggerCharacters: true
            }}
        />
    );
};
