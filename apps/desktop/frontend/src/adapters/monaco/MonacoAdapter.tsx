import React, { useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
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
            theme={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'vs-dark' : 'light'}
            onChange={handleChange}
            onMount={handleEditorMount}
            options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                fontSize: 14,
                padding: { top: 16 }
            }}
        />
    );
};
