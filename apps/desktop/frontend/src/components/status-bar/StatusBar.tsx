import React from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";

export const StatusBar: React.FC = () => {
    const { theme } = useSettingsStore();
    return (
        <div className="h-6 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex items-center px-4 text-xs text-[var(--text-muted)]">
            <span>X-Editor Ready</span>
            <div className="flex-1"></div>
            <span>Theme: {theme}</span>
        </div>
    );
};
