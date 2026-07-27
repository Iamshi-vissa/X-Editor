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
                    { token: "keyword", foreground: "a855f7", fontStyle: "bold" },
                    { token: "keyword.operator", foreground: "a855f7" },
                    { token: "string", foreground: "c4b5fd" },
                    { token: "entity.name.function", foreground: "d8b4fe" },
                    { token: "support.function", foreground: "d8b4fe" },
                    { token: "entity.name.type", foreground: "e9d5ff", fontStyle: "bold" },
                    { token: "support.type", foreground: "e9d5ff" },
                    { token: "comment", foreground: "7a7590", fontStyle: "italic" },
                    { token: "constant.numeric", foreground: "c084fc" },
                    { token: "variable", foreground: "e4e0f0" }
                ],
                colors: {
                    "editor.background": "#0e0e14",
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
        }
    }, [monaco]);

    const handleEditorMount: OnMount = (editor) => {
        editorRef.current = editor;
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

    return (
        <Editor
            height="100%"
            path={document.path}
            language={document.language}
            value={document.content}
            theme={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'premium-purple' : 'light'}
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
                bracketPairColorization: { enabled: true }
            }}
        />
    );
};
