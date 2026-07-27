import React, { useState } from "react";
import { Blocks, Search, Star, Download, CheckCircle, ShieldCheck } from "lucide-react";

export const ExtensionsPanel: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [installed, setInstalled] = useState<Record<string, boolean>>({
        "rust-analyzer": true,
        "typescript-language-features": true
    });

    const extensions = [
        {
            id: "rust-analyzer",
            name: "rust-analyzer",
            publisher: "rust-lang",
            description: "Rust language support and deep code intelligence.",
            version: "0.4.1800",
            downloads: "4.2M",
            rating: "4.9"
        },
        {
            id: "typescript-language-features",
            name: "TypeScript & JavaScript",
            publisher: "microsoft",
            description: "Rich language support for TypeScript & JS.",
            version: "5.3.3",
            downloads: "18.5M",
            rating: "4.8"
        },
        {
            id: "cpp-tools",
            name: "C/C++ Compiler & Intellisense",
            publisher: "ms-vscode",
            description: "C/C++ language support, MinGW windres toolchain integrations.",
            version: "1.18.5",
            downloads: "45.1M",
            rating: "4.7"
        },
        {
            id: "tailwind-intellisense",
            name: "Tailwind CSS IntelliSense",
            publisher: "tailwindcss",
            description: "Intelligent Tailwind CSS tooling for VS Code.",
            version: "0.10.5",
            downloads: "8.9M",
            rating: "4.9"
        },
        {
            id: "python",
            name: "Python",
            publisher: "ms-python",
            description: "Rich support for the Python language.",
            version: "2024.2.0",
            downloads: "105M",
            rating: "4.6"
        }
    ];

    const toggleExtension = (id: string) => {
        setInstalled((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const filtered = extensions.filter(
        (ext) =>
            ext.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ext.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="w-80 h-full flex flex-col bg-[var(--bg-secondary)] text-[var(--text-primary)] font-sans border-r border-[var(--border-primary)] select-none shrink-0">
            <div className="p-3 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-primary)] h-10">
                <div className="flex items-center space-x-2">
                    <Blocks className="w-4 h-4 text-[var(--accent-primary)]" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Extensions Marketplace</span>
                </div>
            </div>

            <div className="p-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                <div className="flex items-center bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded px-2 py-1">
                    <Search className="w-3.5 h-3.5 text-[var(--text-muted)] mr-2 shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search Extensions in Marketplace..."
                        className="bg-transparent text-xs w-full outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 hide-scrollbar">
                {filtered.map((ext) => {
                    const isInst = !!installed[ext.id];
                    return (
                        <div
                            key={ext.id}
                            className="p-2.5 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded hover:border-[var(--accent-primary)]/50 transition-colors"
                        >
                            <div className="flex items-start justify-between">
                                <div className="pr-2">
                                    <div className="flex items-center space-x-1">
                                        <span className="font-semibold text-xs text-[var(--text-primary)]">{ext.name}</span>
                                        <ShieldCheck className="w-3 h-3 text-blue-400 shrink-0" />
                                    </div>
                                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{ext.publisher} v{ext.version}</div>
                                    <p className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2">{ext.description}</p>
                                    <div className="flex items-center space-x-3 text-[10px] text-[var(--text-muted)] mt-2">
                                        <span className="flex items-center">
                                            <Download className="w-3 h-3 mr-1" /> {ext.downloads}
                                        </span>
                                        <span className="flex items-center text-yellow-400">
                                            <Star className="w-3 h-3 mr-1 fill-yellow-400" /> {ext.rating}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => toggleExtension(ext.id)}
                                    className={`px-2 py-1 rounded text-[11px] font-medium flex items-center space-x-1 shrink-0 transition-all ${
                                        isInst
                                            ? "bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
                                            : "bg-[var(--accent-primary)] hover:opacity-90 text-white"
                                    }`}
                                >
                                    {isInst ? (
                                        <>
                                            <CheckCircle className="w-3 h-3" />
                                            <span>Installed</span>
                                        </>
                                    ) : (
                                        <span>Install</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
