import React from "react";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { X, Circle } from "lucide-react";
import clsx from "clsx";

export const Tabs: React.FC = () => {
    const { documents, activeDocumentId, setActiveDocument, closeDocument, pinDocument } = useDocumentStore();

    return (
        <div className="flex h-10 bg-[var(--bg-secondary)] overflow-x-auto overflow-y-hidden border-b border-[var(--border-primary)] hide-scrollbar shrink-0">
            {documents.map(doc => (
                <div 
                    key={doc.id}
                    className={clsx(
                        "group flex items-center px-3 py-2 border-r border-[var(--border-primary)] cursor-pointer min-w-[120px] max-w-[200px] select-none",
                        activeDocumentId === doc.id ? "bg-[var(--bg-editor)] border-t-2 border-t-[var(--accent-primary)] text-[var(--accent-primary)]" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border-t-2 border-t-transparent",
                        doc.isPreview && "italic"
                    )}
                    onClick={() => setActiveDocument(doc.id)}
                    onDoubleClick={() => pinDocument(doc.id)}
                >
                    <span className="truncate flex-1 text-[13px] mr-2">
                        {doc.path.split(/[\\/]/).pop()}
                    </span>
                    <button 
                        className={clsx(
                            "p-0.5 rounded ml-2 flex items-center justify-center transition-opacity",
                            doc.isDirty ? "opacity-100 text-[var(--text-primary)]" : "opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            closeDocument(doc.id);
                        }}
                    >
                        {doc.isDirty ? <Circle size={10} fill="currentColor" className="mr-0.5" /> : <X size={14} />}
                    </button>
                </div>
            ))}
        </div>
    );
};
