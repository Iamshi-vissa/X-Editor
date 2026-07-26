import { create } from "zustand";
import { ipc } from "../services/ipc";
import type { SearchResultMatch } from "../services/ipc";

interface SearchStore {
    query: string;
    isContentSearch: boolean;
    results: SearchResultMatch[];
    isSearching: boolean;
    isPanelOpen: boolean;
    setQuery: (query: string) => void;
    setIsContentSearch: (isContent: boolean) => void;
    togglePanel: () => void;
    performSearch: () => Promise<void>;
    clearSearch: () => void;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
    query: "",
    isContentSearch: false,
    results: [],
    isSearching: false,
    isPanelOpen: false,

    setQuery: (query) => set({ query }),
    setIsContentSearch: (isContentSearch) => set({ isContentSearch }),
    togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

    performSearch: async () => {
        const { query, isContentSearch } = get();
        if (!query.trim()) {
            set({ results: [] });
            return;
        }

        set({ isSearching: true });
        try {
            const matches = await ipc.filesystem.search(query, isContentSearch);
            set({ results: matches, isSearching: false });
        } catch (e) {
            console.error("Search failed:", e);
            set({ results: [], isSearching: false });
        }
    },

    clearSearch: () => set({ query: "", results: [] }),
}));
