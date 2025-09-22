// Simple, extensible app settings persisted in localStorage

export type Theme = 'light' | 'dark' | 'system';
export type ColorScheme = 'default' | 'sky' | 'emerald' | 'rose';

export type AppSettings = {
  speakSummaries: boolean;
  theme: Theme;
  colorScheme: ColorScheme;
};

const SETTINGS_KEY = 'llm-web-chat:settings';

export const DEFAULT_SETTINGS: AppSettings = {
  speakSummaries: false,
  theme: 'system',
  colorScheme: 'default',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(partial: Partial<AppSettings>) {
  const cur = loadSettings();
  const next = { ...cur, ...partial };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}