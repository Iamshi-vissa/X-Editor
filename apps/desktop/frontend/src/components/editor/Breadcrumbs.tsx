import React from "react";
import { ChevronRight, Folder, FileCode } from "lucide-react";
import { useDocumentStore } from "../../stores/useDocumentStore";

export const Breadcrumbs: React.FC = () => {
    const { documents, activeDocumentId } = useDocumentStore();
    const activeDoc = documents.find((d) => d.id === activeDocumentId);

    if (!activeDoc) return null;

    // Split document path into segments
    const normalizedPath = activeDoc.path.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);

    return (
        <div className="h-7 px-3 bg-[var(--bg-primary)] border-b border-[var(--border-primary)] flex items-center space-x-1 text-xs text-[var(--text-muted)] overflow-x-auto select-none shrink-0 hide-scrollbar">
            {segments.map((seg, idx) => {
                const isLast = idx === segments.length - 1;
                return (
                    <React.Fragment key={idx}>
                        <div className="flex items-center space-x-1 hover:text-[var(--text-primary)] cursor-pointer transition-colors">
                            {isLast ? (
                                <FileCode className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                            ) : (
                                <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            )}
                            <span className={isLast ? "font-medium text-[var(--text-primary)]" : ""}>{seg}</span>
                        </div>
                        {!isLast && <ChevronRight className="w-3 h-3 text-[var(--text-muted)] opacity-50 shrink-0" />}
                    </React.Fragment>
                );
            })}
        </div>
    );
};
