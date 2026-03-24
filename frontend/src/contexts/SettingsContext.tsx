"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
}

interface SettingsContextValue extends Settings {
  setApiKey: (v: string) => void;
  setBaseUrl: (v: string) => void;
  setModel: (v: string) => void;
  setSystemPrompt: (v: string) => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const DEFAULT_SYSTEM_PROMPT = "你是一位专业的AI学术助手，专注于帮助用户阅读和理解学术论文。请用清晰、专业的语言回答问题。";

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseUrl: "https://api.minimax.chat/v1",
  model: "MiniMax-M2.7",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

const STORAGE_KEY = "paperuwant_settings";

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Settings>;
        setSettings({
          apiKey: parsed.apiKey ?? DEFAULT_SETTINGS.apiKey,
          baseUrl: parsed.baseUrl ?? DEFAULT_SETTINGS.baseUrl,
          model: parsed.model ?? DEFAULT_SETTINGS.model,
          systemPrompt: parsed.systemPrompt ?? DEFAULT_SETTINGS.systemPrompt,
        });
      }
    } catch (e) {
      console.error("Failed to load settings from localStorage:", e);
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        console.error("Failed to save settings to localStorage:", e);
      }
    }
  }, [settings, isHydrated]);

  const value: SettingsContextValue = {
    ...settings,
    setApiKey: (v) => setSettings((s) => ({ ...s, apiKey: v })),
    setBaseUrl: (v) => setSettings((s) => ({ ...s, baseUrl: v })),
    setModel: (v) => setSettings((s) => ({ ...s, model: v })),
    setSystemPrompt: (v) => setSettings((s) => ({ ...s, systemPrompt: v })),
    isSettingsOpen,
    openSettings: () => setIsSettingsOpen(true),
    closeSettings: () => setIsSettingsOpen(false),
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
