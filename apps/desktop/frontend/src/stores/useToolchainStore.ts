import { create } from "zustand";
import { ipc } from "../services/ipc";
import type { ToolchainManifest, ToolchainProgressPayload, ProjectToolchainRequirement } from "../services/ipc";

interface ToolchainState {
    installedToolchains: ToolchainManifest[];
    availableToolchains: ToolchainManifest[];
    activeToolchains: ToolchainManifest[];
    progressPayload: ToolchainProgressPayload | null;
    isInstalling: boolean;
    isPanelOpen: boolean;
    error: string | null;

    togglePanel: () => void;
    fetchToolchains: () => Promise<void>;
    detectSystemToolchains: () => Promise<void>;
    installToolchain: (manifest: ToolchainManifest, scope?: string) => Promise<void>;
    uninstallToolchain: (id: string) => Promise<void>;
    setProjectToolchain: (req: ProjectToolchainRequirement) => Promise<void>;
}

export const useToolchainStore = create<ToolchainState>((set, get) => ({
    installedToolchains: [],
    availableToolchains: [],
    activeToolchains: [],
    progressPayload: null,
    isInstalling: false,
    isPanelOpen: false,
    error: null,

    togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

    fetchToolchains: async () => {
        try {
            const [installed, available, active] = await Promise.all([
                ipc.toolchain.listInstalled(),
                ipc.toolchain.listAvailable(),
                ipc.toolchain.getActive().catch(() => [])
            ]);
            set({ installedToolchains: installed, availableToolchains: available, activeToolchains: active, error: null });
        } catch (e: any) {
            set({ error: e?.toString() || "Failed to fetch toolchains" });
        }
    },

    detectSystemToolchains: async () => {
        try {
            const detected = await ipc.toolchain.detect();
            set({ installedToolchains: detected, error: null });
        } catch (e: any) {
            set({ error: e?.toString() || "System toolchain detection failed" });
        }
    },

    installToolchain: async (manifest, scope = "global") => {
        set({ isInstalling: true, error: null, progressPayload: { toolchain_id: manifest.id, stage: "starting", progress_percent: 0, message: "Initiating installation..." } });
        try {
            await ipc.toolchain.install(manifest, scope, true);
            await get().fetchToolchains();
            set({ isInstalling: false, progressPayload: null });
        } catch (e: any) {
            set({ isInstalling: false, error: e?.toString() || "Toolchain installation failed", progressPayload: null });
        }
    },

    uninstallToolchain: async (id) => {
        try {
            await ipc.toolchain.uninstall(id);
            await get().fetchToolchains();
        } catch (e: any) {
            set({ error: e?.toString() || "Failed to uninstall toolchain" });
        }
    },

    setProjectToolchain: async (req) => {
        try {
            await ipc.toolchain.setProjectRequirement(req, true);
            await get().fetchToolchains();
        } catch (e: any) {
            set({ error: e?.toString() || "Failed to set project toolchain requirement" });
        }
    }
}));
