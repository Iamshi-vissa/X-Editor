import React from "react";
import { useSearchStore } from "../../stores/useSearchStore";
import { useDocumentStore } from "../../stores/useDocumentStore";
import { Search as SearchIcon, FileText, X } from "lucide-react";

export const SearchPanel: React.FC = () => {
    const {
        query,
        isContentSearch,
        results,
        isSearching,
        setQuery,
        setIsContentSearch,
        togglePanel,
        performSearch,
    } = useSearchStore();

    const { openDocument } = useDocumentStore();

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            performSearch();
        }
    };

    return (
        <div className="w-80 bg-[var(--bg-primary)] border-r border-[var(--border-primary)] flex flex-col shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-primary)]">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center">
                    <SearchIcon size={14} className="mr-1.5" /> Workspace Search
                </span>
                <button
                    className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    onClick={togglePanel}
                >
                    <X size={14} />
                </button>
            </div>

            {/* Input Controls */}
            <div className="p-3 border-b border-[var(--border-primary)] space-y-2">
                <div className="relative">
                    <input
                        type="text"
                        className="w-full bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] px-3 py-1.5 rounded border border-[var(--border-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                        placeholder="Search files or content..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isContentSearch}
                            onChange={(e) => setIsContentSearch(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-0"
                        />
                        <span>Match file content</span>
                    </label>
                    <button
                        className="px-2 py-0.5 bg-[var(--accent-primary)] text-[var(--accent-text)] text-xs rounded hover:bg-[var(--accent-hover)] font-medium"
                        onClick={performSearch}
                    >
                        Search
                    </button>
                </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-2">
                {isSearching ? (
                    <div className="text-xs text-[var(--text-muted)] p-3 text-center">Searching workspace...</div>
                ) : results.length > 0 ? (
                    <div className="space-y-1">
                        {results.map((res, i) => (
                            <div
                                key={i}
                                className="p-2 hover:bg-[var(--bg-hover)] rounded cursor-pointer text-xs group"
                                onClick={() => openDocument(res.path)}
                            >
                                <div className="flex items-center text-[var(--text-primary)] font-medium truncate">
                                    <FileText size={14} className="mr-1.5 text-[var(--accent-primary)] shrink-0" />
                                    <span className="truncate">{res.filename}</span>
                                    {res.line_number && (
                                        <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                                            :L{res.line_number}
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)] truncate pl-5 mt-0.5">
                                    {res.line_snippet ?? res.path}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : query ? (
                    <div className="text-xs text-[var(--text-muted)] p-3 text-center">No matches found.</div>
                ) : (
                    <div className="text-xs text-[var(--text-muted)] p-3 text-center">
                        Enter a search term and press Enter.
                    </div>
                )}
            </div>
        </div>
    );
};
