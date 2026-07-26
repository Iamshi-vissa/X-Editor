import { create } from "zustand";
import { ipc } from "../services/ipc";

interface SettingsState {
    theme: 'light' | 'dark' | 'system';
    setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
    loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    theme: 'system',
    setTheme: async (theme) => {
        await ipc.settings.update(theme);
        set({ theme });
        if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.className = isDark ? 'dark' : 'light';
        } else {
            document.documentElement.className = theme;
        }
    },
    loadSettings: async () => {
        const settings = await ipc.settings.get();
        const theme = settings.theme as 'light' | 'dark' | 'system';
        set({ theme });
        if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.className = isDark ? 'dark' : 'light';
        } else {
            document.documentElement.className = theme;
        }
    }
}));
