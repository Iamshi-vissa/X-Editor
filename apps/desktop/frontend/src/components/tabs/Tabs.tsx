import React from "react";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { X, Circle } from "lucide-react";
import clsx from "clsx";

export const Tabs: React.FC = () => {
    const { documents, activeDocumentId, setActiveDocument, closeDocument, pinDocument } = useDocumentStore();

    return (
        <div className="flex h-10 bg-[var(--bg-secondary)] overflow-x-auto overflow-y-hidden border-b border-[var(--border-primary)] hide-scrollbar shrink-0">
            {documents.map(doc => {
                const isActive = activeDocumentId === doc.id;
                return (
                    <div 
                        key={doc.id}
                        className={clsx(
                            "group flex items-center px-3 py-2 border-r border-[var(--border-primary)] cursor-pointer min-w-[120px] max-w-[200px] select-none transition-colors",
                            isActive 
                                ? "bg-[var(--bg-editor)] border-t-2 border-t-[var(--accent-primary)] text-[var(--text-primary)] font-medium" 
                                : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border-t-2 border-t-transparent",
                            doc.isPreview && "italic"
                        )}
                        onClick={() => setActiveDocument(doc.id)}
                        onDoubleClick={() => pinDocument(doc.id)}
                        onAuxClick={(e) => {
                            if (e.button === 1) {
                                e.preventDefault();
                                e.stopPropagation();
                                closeDocument(doc.id);
                            }
                        }}
                    >
                        <span className="truncate flex-1 text-[13px] mr-2">
                            {doc.path.split(/[\\/]/).pop()}
                        </span>
                        <button 
                            title="Close tab (Ctrl+W)"
                            className={clsx(
                                "group/close p-1 rounded flex items-center justify-center transition-all shrink-0 ml-1",
                                isActive
                                    ? "opacity-80 hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                                    : "opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                closeDocument(doc.id);
                            }}
                        >
                            {doc.isDirty ? (
                                <>
                                    <span className="block group-hover/close:hidden text-[var(--accent-primary)]">
                                        <Circle size={8} fill="currentColor" />
                                    </span>
                                    <span className="hidden group-hover/close:block">
                                        <X size={13} />
                                    </span>
                                </>
                            ) : (
                                <X size={13} />
                            )}
                        </button>
                    </div>
                );
            })}
        </div>
    );
};
