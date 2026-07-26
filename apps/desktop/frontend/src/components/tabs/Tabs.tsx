import React from "react";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { X } from "lucide-react";
import clsx from "clsx";

export const Tabs: React.FC = () => {
    const { documents, activeDocumentId, setActiveDocument, closeDocument } = useDocumentStore();

    return (
        <div className="flex h-10 bg-[var(--bg-secondary)] overflow-x-auto border-b border-[var(--border-primary)]">
            {documents.map(doc => (
                <div 
                    key={doc.id}
                    className={clsx(
                        "flex items-center px-4 py-2 border-r border-[var(--border-primary)] cursor-pointer min-w-[120px] max-w-[200px]",
                        activeDocumentId === doc.id ? "bg-[var(--bg-editor)] border-t-2 border-t-[var(--accent-primary)]" : "hover:bg-[var(--bg-hover)]"
                    )}
                    onClick={() => setActiveDocument(doc.id)}
                >
                    <span className="truncate flex-1 text-sm mr-2 select-none">
                        {doc.path.split(/[\\/]/).pop()} {doc.isDirty ? "" : ""}
                    </span>
                    <button 
                        className="hover:bg-[var(--bg-hover)] p-0.5 rounded ml-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        onClick={(e) => {
                            e.stopPropagation();
                            closeDocument(doc.id);
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
};
