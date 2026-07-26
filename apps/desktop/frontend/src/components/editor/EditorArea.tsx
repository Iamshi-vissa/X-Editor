import React, { useEffect } from "react";
import { Tabs } from "../tabs/Tabs";
import { MonacoAdapter } from "../../adapters/monaco/MonacoAdapter";
import { useDocumentStore } from "../../stores/useDocumentStore";

export const EditorArea: React.FC = () => {
    const { documents, activeDocumentId, saveDocument } = useDocumentStore();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (activeDocumentId) saveDocument(activeDocumentId);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeDocumentId, saveDocument]);

    const activeDoc = documents.find(d => d.id === activeDocumentId);

    return (
        <div className="flex-1 flex flex-col bg-[var(--bg-editor)] overflow-hidden">
            <Tabs />
            <div className="flex-1 overflow-hidden relative">
                {activeDoc ? (
                    <MonacoAdapter document={activeDoc} />
                ) : (
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                        <div className="text-center">
                            <h1 className="text-2xl font-bold mb-4">X-Editor</h1>
                            <p>Select a file to edit</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
