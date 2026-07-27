import React from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { Palette, Check, X } from "lucide-react";

interface ThemeSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({ isOpen, onClose }) => {
    const { theme, setTheme } = useSettingsStore();

    if (!isOpen) return null;

    const themes = [
        { id: "purple-dark", name: "Purple Dark (X Editor Signature)", color: "#8B5CF6", bg: "#1A1A24" },
        { id: "vscode-dark", name: "VS Code Dark Plus", color: "#007acc", bg: "#1e1e1e" },
        { id: "cyberpunk", name: "Cyberpunk Midnight", color: "#ff007f", bg: "#0d0e15" },
        { id: "light", name: "Light Modern", color: "#8B5CF6", bg: "#ffffff" }
    ];

    const handleSelectTheme = (id: string) => {
        setTheme(id as any);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg w-full max-w-md shadow-2xl overflow-hidden text-[var(--text-primary)]">
                <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]">
                    <div className="flex items-center space-x-2">
                        <Palette className="w-5 h-5 text-[var(--accent-primary)]" />
                        <span className="font-semibold text-sm">Color Theme Picker</span>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-3 space-y-2">
                    {themes.map((t) => {
                        const isSelected = theme === t.id || (theme === "dark" && t.id === "purple-dark");
                        return (
                            <button
                                key={t.id}
                                onClick={() => handleSelectTheme(t.id)}
                                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                                    isSelected
                                        ? "border-[var(--accent-primary)] bg-[var(--bg-primary)] ring-1 ring-[var(--accent-primary)]"
                                        : "border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
                                }`}
                            >
                                <div className="flex items-center space-x-3">
                                    <div
                                        className="w-5 h-5 rounded-full border border-white/20 shadow-inner flex items-center justify-center shrink-0"
                                        style={{ backgroundColor: t.bg }}
                                    >
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                                    </div>
                                    <span className="text-xs font-medium">{t.name}</span>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-[var(--accent-primary)]" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
