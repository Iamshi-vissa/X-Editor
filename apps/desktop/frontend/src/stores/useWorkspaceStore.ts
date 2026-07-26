import { create } from "zustand";
import { ipc } from "../services/ipc";

interface WorkspaceState {
    root: string | null;
    refreshCounter: number;
    setRoot: (path: string | null) => void;
    selectWorkspace: (path: string) => Promise<void>;
    createFile: (parentPath: string, filename: string) => Promise<void>;
    createDirectory: (parentPath: string, dirname: string) => Promise<void>;
    renameItem: (oldPath: string, newPath: string) => Promise<void>;
    deleteItem: (path: string) => Promise<void>;
    triggerRefresh: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
    root: null,
    refreshCounter: 0,
    setRoot: (path) => set({ root: path }),

    selectWorkspace: async (path: string) => {
        await ipc.workspace.select(path);
        set({ root: path });
    },

    triggerRefresh: () => set((state) => ({ refreshCounter: state.refreshCounter + 1 })),

    createFile: async (parentPath: string, filename: string) => {
        const path = `${parentPath}/${filename}`.replace(/\/+/g, "/");
        await ipc.filesystem.createFile(path, "");
        get().triggerRefresh();
    },

    createDirectory: async (parentPath: string, dirname: string) => {
        const path = `${parentPath}/${dirname}`.replace(/\/+/g, "/");
        await ipc.filesystem.createDir(path);
        get().triggerRefresh();
    },

    renameItem: async (oldPath: string, newPath: string) => {
        await ipc.filesystem.rename(oldPath, newPath);
        get().triggerRefresh();
    },

    deleteItem: async (path: string) => {
        await ipc.filesystem.delete(path);
        get().triggerRefresh();
    },
}));
