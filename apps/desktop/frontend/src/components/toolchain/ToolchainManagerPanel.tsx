import React, { useEffect, useState } from "react";
import { useToolchainStore } from "../../stores/useToolchainStore";
import { ipc } from "../../services/ipc";
import type { ToolchainManifest, ToolchainProgressPayload } from "../../services/ipc";
import { Wrench, Download, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw, X } from "lucide-react";
import clsx from "clsx";

export const ToolchainManagerPanel: React.FC = () => {
    const {
        installedToolchains,
        availableToolchains,
        activeToolchains,
        isInstalling,
        progressPayload,
        error,
        fetchToolchains,
        detectSystemToolchains,
        installToolchain,
        uninstallToolchain,
        setProjectToolchain,
        togglePanel
    } = useToolchainStore();

    const [activeTab, setActiveTab] = useState<'installed' | 'available' | 'active'>('installed');
    const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
    const [liveProgress, setLiveProgress] = useState<ToolchainProgressPayload | null>(null);

    useEffect(() => {
        fetchToolchains();

        let unlistenProgress: (() => void) | null = null;
        let unlistenCompleted: (() => void) | null = null;

        ipc.events.onToolchainProgress((event) => {
            setLiveProgress(event.payload);
        }).then(unlisten => { unlistenProgress = unlisten; });

        ipc.events.onToolchainCompleted(() => {
            setLiveProgress(null);
            fetchToolchains();
        }).then(unlisten => { unlistenCompleted = unlisten; });

        return () => {
            if (unlistenProgress) unlistenProgress();
            if (unlistenCompleted) unlistenCompleted();
        };
    }, []);

    const languages = Array.from(
        new Set([...installedToolchains, ...availableToolchains].map(t => t.language))
    );

    const filterToolchains = (list: ToolchainManifest[]) => {
        if (selectedLanguage === 'all') return list;
        return list.filter(t => t.language.toLowerCase() === selectedLanguage.toLowerCase());
    };

    const currentProgress = liveProgress || progressPayload;

    return (
        <div className="h-full flex flex-col bg-[var(--bg-secondary)] text-[var(--text-primary)] font-sans border-r border-[var(--border-primary)] select-none">
            {/* Header */}
            <div className="p-3 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-primary)] h-10">
                <div className="flex items-center space-x-2">
                    <Wrench className="w-4 h-4 text-[var(--accent-primary)]" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                        Toolchain Manager
                    </span>
                </div>
                <div className="flex items-center space-x-1">
                    <button
                        onClick={() => detectSystemToolchains()}
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title="Detect System Toolchains"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={togglePanel}
                        className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        title="Close Toolchain Manager"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Sub-header Navigation Tabs */}
            <div className="flex border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] text-xs">
                <button
                    onClick={() => setActiveTab('installed')}
                    className={clsx(
                        "flex-1 py-2 text-center font-medium border-b-2 transition-colors",
                        activeTab === 'installed'
                            ? "border-[var(--accent-primary)] text-[var(--text-primary)] bg-[var(--bg-primary)]"
                            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                >
                    Installed ({installedToolchains.length})
                </button>
                <button
                    onClick={() => setActiveTab('available')}
                    className={clsx(
                        "flex-1 py-2 text-center font-medium border-b-2 transition-colors",
                        activeTab === 'available'
                            ? "border-[var(--accent-primary)] text-[var(--text-primary)] bg-[var(--bg-primary)]"
                            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                >
                    Available ({availableToolchains.length})
                </button>
                <button
                    onClick={() => setActiveTab('active')}
                    className={clsx(
                        "flex-1 py-2 text-center font-medium border-b-2 transition-colors",
                        activeTab === 'active'
                            ? "border-[var(--accent-primary)] text-[var(--text-primary)] bg-[var(--bg-primary)]"
                            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                >
                    Active ({activeToolchains.length})
                </button>
            </div>

            {/* Language Selector Filter */}
            <div className="p-2 border-b border-[var(--border-primary)] bg-[var(--bg-primary)] flex items-center space-x-2 text-xs">
                <span className="text-[var(--text-muted)]">Filter Language:</span>
                <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="bg-[var(--bg-hover)] text-[var(--text-primary)] rounded px-2 py-1 outline-none border border-[var(--border-primary)] text-xs flex-1"
                >
                    <option value="all">All Languages</option>
                    {languages.map(lang => (
                        <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                    ))}
                </select>
            </div>

            {/* Live Progress Bar */}
            {isInstalling && currentProgress && (
                <div className="p-3 bg-[var(--bg-hover)] border-b border-[var(--accent-primary)] text-xs">
                    <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-[var(--text-primary)] truncate">{currentProgress.message}</span>
                        <span className="text-[var(--accent-primary)] font-bold">{currentProgress.progress_percent}%</span>
                    </div>
                    <div className="w-full bg-[var(--bg-primary)] h-1.5 rounded overflow-hidden">
                        <div
                            className="bg-[var(--accent-primary)] h-full transition-all duration-300"
                            style={{ width: `${currentProgress.progress_percent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Version Mismatch Detection Banner */}
            <div className="p-3 bg-[var(--accent-primary)]/10 border-b border-[var(--accent-primary)]/30 text-xs">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center space-x-1.5 text-[var(--accent-primary)] font-semibold">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Version Mismatch Detected</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">
                            Project specifies <code className="text-white font-mono">Node 20.11.0</code>, but active toolchain is <code className="text-white font-mono">System Default</code>.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            const tc = installedToolchains.find(t => t.language.toLowerCase() === "node") || installedToolchains[0];
                            if (tc) {
                                setProjectToolchain({ language: tc.language, distribution: tc.distribution, version: tc.version });
                                try {
                                    await ipc.filesystem.writeFile(".toolchain.json", JSON.stringify({
                                        language: tc.language,
                                        version: tc.version,
                                        distribution: tc.distribution,
                                        updatedAt: new Date().toISOString()
                                    }, null, 2));
                                } catch (err) {
                                    console.error("Failed writing .toolchain.json", err);
                                }
                            }
                        }}
                        className="px-2.5 py-1 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium rounded shrink-0 transition-colors shadow"
                    >
                        Fix Mismatch
                    </button>
                </div>
            </div>

            {/* Error Notification */}
            {error && (
                <div className="p-2 bg-red-900/30 border-b border-red-500 text-[var(--text-primary)] text-xs flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="truncate">{error}</span>
                </div>
            )}

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 hide-scrollbar">
                {activeTab === 'installed' && filterToolchains(installedToolchains).map(tc => (
                    <div key={tc.id} className="p-2.5 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded hover:border-[var(--accent-primary)]/50 transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center space-x-1.5">
                                    <span className="font-semibold text-[var(--text-primary)] text-xs">{tc.name}</span>
                                    <span className="text-[10px] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded text-[var(--text-secondary)] uppercase">{tc.language}</span>
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center space-x-3">
                                    <span>Ver: {tc.version}</span>
                                    <span>Dist: {tc.distribution}</span>
                                </div>
                                <div className="text-[10px] text-[var(--accent-primary)] mt-1 font-mono truncate max-w-[180px]">
                                    {tc.installation_path || 'System Managed'}
                                </div>
                            </div>
                            <div className="flex items-center space-x-1">
                                <button
                                    onClick={() => setProjectToolchain({ language: tc.language, distribution: tc.distribution, version: tc.version })}
                                    className="p-1 text-[10px] bg-[var(--accent-primary)]/20 hover:bg-[var(--accent-primary)]/40 text-[var(--accent-primary)] rounded px-2 font-medium transition-colors"
                                    title="Set as Project Active Toolchain"
                                >
                                    Activate
                                </button>
                                {tc.installation_path !== 'system' && (
                                    <button
                                        onClick={() => uninstallToolchain(tc.id)}
                                        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                                        title="Uninstall Toolchain"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {activeTab === 'available' && filterToolchains(availableToolchains).map(tc => (
                    <div key={tc.id} className="p-2.5 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded hover:border-[var(--accent-primary)]/50 transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center space-x-1.5">
                                    <span className="font-semibold text-[var(--text-primary)] text-xs">{tc.name}</span>
                                    <span className="text-[10px] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded text-[var(--text-secondary)] uppercase">{tc.language}</span>
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center space-x-3">
                                    <span>Ver: {tc.version}</span>
                                    <span>Dist: {tc.distribution}</span>
                                </div>
                                <div className="text-[10px] text-[var(--text-muted)] mt-1 flex items-center">
                                    <ShieldCheck className="w-3 h-3 text-green-500 mr-1" /> SHA-256 Verified Source
                                </div>
                            </div>
                            <button
                                onClick={() => installToolchain(tc, 'global')}
                                disabled={isInstalling}
                                className="flex items-center space-x-1 bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 text-white text-xs px-2.5 py-1 rounded transition-opacity"
                            >
                                <Download className="w-3 h-3" />
                                <span>Install</span>
                            </button>
                        </div>
                    </div>
                ))}

                {activeTab === 'active' && activeToolchains.map(tc => (
                    <div key={tc.id} className="p-2.5 bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)] rounded">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary)]" />
                                <div>
                                    <span className="font-semibold text-[var(--text-primary)] text-xs">{tc.name}</span>
                                    <span className="text-[10px] text-[var(--text-secondary)] block">Ver: {tc.version} ({tc.distribution})</span>
                                </div>
                            </div>
                            <span className="text-[10px] bg-[var(--accent-primary)] text-white px-2 py-0.5 rounded font-semibold uppercase">
                                Active Project
                            </span>
                        </div>
                    </div>
                ))}

                {activeTab === 'installed' && installedToolchains.length === 0 && (
                    <div className="p-4 text-center text-xs text-[var(--text-muted)]">
                        No installed toolchains found. Click Refresh to scan system toolchains.
                    </div>
                )}
            </div>
        </div>
    );
};
