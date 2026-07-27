import React, { useEffect, useState } from "react";
import { useToolchainStore } from "../../stores/useToolchainStore";
import { ipc } from "../../services/ipc";
import type { ToolchainManifest, ToolchainProgressPayload } from "../../services/ipc";
import { Wrench, Download, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from "lucide-react";

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
        setProjectToolchain
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
        <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc] font-sans border-r border-[#2d2d2d] select-none">
            {/* Header */}
            <div className="p-3 border-b border-[#2d2d2d] flex items-center justify-between bg-[#252526]">
                <div className="flex items-center space-x-2">
                    <Wrench className="w-4 h-4 text-[#007acc]" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#e7e7e7]">
                        Toolchain Manager
                    </span>
                </div>
                <button
                    onClick={() => detectSystemToolchains()}
                    className="p-1 hover:bg-[#37373d] rounded text-[#cccccc] hover:text-white transition-colors"
                    title="Detect System Toolchains"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Sub-header Navigation Tabs */}
            <div className="flex border-b border-[#2d2d2d] bg-[#1e1e1e] text-xs">
                <button
                    onClick={() => setActiveTab('installed')}
                    className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors ${
                        activeTab === 'installed'
                            ? 'border-[#007acc] text-white bg-[#252526]'
                            : 'border-transparent text-[#858585] hover:text-[#cccccc]'
                    }`}
                >
                    Installed ({installedToolchains.length})
                </button>
                <button
                    onClick={() => setActiveTab('available')}
                    className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors ${
                        activeTab === 'available'
                            ? 'border-[#007acc] text-white bg-[#252526]'
                            : 'border-transparent text-[#858585] hover:text-[#cccccc]'
                    }`}
                >
                    Available ({availableToolchains.length})
                </button>
                <button
                    onClick={() => setActiveTab('active')}
                    className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors ${
                        activeTab === 'active'
                            ? 'border-[#007acc] text-white bg-[#252526]'
                            : 'border-transparent text-[#858585] hover:text-[#cccccc]'
                    }`}
                >
                    Active ({activeToolchains.length})
                </button>
            </div>

            {/* Language Selector Filter */}
            <div className="p-2 border-b border-[#2d2d2d] bg-[#252526] flex items-center space-x-2 text-xs">
                <span className="text-[#858585]">Filter Language:</span>
                <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="bg-[#3c3c3c] text-white rounded px-2 py-1 outline-none border border-[#454545] text-xs flex-1"
                >
                    <option value="all">All Languages</option>
                    {languages.map(lang => (
                        <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                    ))}
                </select>
            </div>

            {/* Live Progress Bar */}
            {isInstalling && currentProgress && (
                <div className="p-3 bg-[#2d2d30] border-b border-[#007acc] text-xs">
                    <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-white truncate">{currentProgress.message}</span>
                        <span className="text-[#007acc] font-bold">{currentProgress.progress_percent}%</span>
                    </div>
                    <div className="w-full bg-[#3c3c3c] h-1.5 rounded overflow-hidden">
                        <div
                            className="bg-[#007acc] h-full transition-all duration-300"
                            style={{ width: `${currentProgress.progress_percent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Error Notification */}
            {error && (
                <div className="p-2 bg-[#5a1d1d] border-b border-[#f14c4c] text-white text-xs flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-[#f14c4c] shrink-0" />
                    <span className="truncate">{error}</span>
                </div>
            )}

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {activeTab === 'installed' && filterToolchains(installedToolchains).map(tc => (
                    <div key={tc.id} className="p-2.5 bg-[#252526] border border-[#2d2d2d] rounded hover:border-[#3c3c3c] transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center space-x-1.5">
                                    <span className="font-semibold text-white text-xs">{tc.name}</span>
                                    <span className="text-[10px] bg-[#3c3c3c] px-1.5 py-0.5 rounded text-[#cccccc] uppercase">{tc.language}</span>
                                </div>
                                <div className="text-[11px] text-[#858585] mt-1 flex items-center space-x-3">
                                    <span>Ver: {tc.version}</span>
                                    <span>Dist: {tc.distribution}</span>
                                    <span>Scope: {tc.scope}</span>
                                </div>
                                <div className="text-[10px] text-[#007acc] mt-1 font-mono truncate max-w-[220px]">
                                    {tc.installation_path || 'System Managed'}
                                </div>
                            </div>
                            <div className="flex items-center space-x-1">
                                <button
                                    onClick={() => setProjectToolchain({ language: tc.language, distribution: tc.distribution, version: tc.version })}
                                    className="p-1 text-[10px] bg-[#007acc] hover:bg-[#0062a3] text-white rounded px-2 font-medium"
                                    title="Set as Project Active Toolchain"
                                >
                                    Activate
                                </button>
                                {tc.installation_path !== 'system' && (
                                    <button
                                        onClick={() => uninstallToolchain(tc.id)}
                                        className="p-1 hover:bg-[#3c3c3c] text-[#f14c4c] rounded"
                                        title="Uninstall Toolchain"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-[#2d2d2d] flex items-center justify-between text-[10px] text-[#858585]">
                            <span className="flex items-center space-x-1 text-[#89d185]">
                                <ShieldCheck className="w-3 h-3 text-[#89d185]" />
                                <span>Validated & Verified</span>
                            </span>
                            <span className="font-mono">{tc.architecture}</span>
                        </div>
                    </div>
                ))}

                {activeTab === 'available' && filterToolchains(availableToolchains).map(tc => (
                    <div key={tc.id} className="p-2.5 bg-[#252526] border border-[#2d2d2d] rounded hover:border-[#3c3c3c] transition-colors">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center space-x-1.5">
                                    <span className="font-semibold text-white text-xs">{tc.name}</span>
                                    <span className="text-[10px] bg-[#3c3c3c] px-1.5 py-0.5 rounded text-[#cccccc] uppercase">{tc.language}</span>
                                </div>
                                <div className="text-[11px] text-[#858585] mt-1 flex items-center space-x-3">
                                    <span>Ver: {tc.version}</span>
                                    <span>Dist: {tc.distribution}</span>
                                </div>
                                <div className="text-[10px] text-[#858585] mt-1">
                                    SHA-256 Verified Source
                                </div>
                            </div>
                            <button
                                onClick={() => installToolchain(tc, 'global')}
                                disabled={isInstalling}
                                className="flex items-center space-x-1 bg-[#0e639c] hover:bg-[#1177bb] disabled:opacity-50 text-white text-xs px-2.5 py-1 rounded transition-colors"
                            >
                                <Download className="w-3 h-3" />
                                <span>Install</span>
                            </button>
                        </div>
                    </div>
                ))}

                {activeTab === 'active' && activeToolchains.map(tc => (
                    <div key={tc.id} className="p-2.5 bg-[#1b2b3a] border border-[#007acc] rounded">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <CheckCircle2 className="w-4 h-4 text-[#89d185]" />
                                <div>
                                    <span className="font-semibold text-white text-xs">{tc.name}</span>
                                    <span className="text-[10px] text-[#858585] block">Ver: {tc.version} ({tc.distribution})</span>
                                </div>
                            </div>
                            <span className="text-[10px] bg-[#007acc] text-white px-2 py-0.5 rounded font-semibold uppercase">
                                Active Project
                            </span>
                        </div>
                    </div>
                ))}

                {activeTab === 'installed' && installedToolchains.length === 0 && (
                    <div className="p-4 text-center text-xs text-[#858585]">
                        No installed toolchains found. Click Refresh to scan system toolchains.
                    </div>
                )}
            </div>
        </div>
    );
};
