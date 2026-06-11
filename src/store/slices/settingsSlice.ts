import { StateCreator } from "zustand";
import { AppSettings } from "../../types";
import { getDb } from "../../lib/db";
import { THEMES, applyTheme } from "../../lib/themes";
import { setSoundEnabled, setSoundVolume } from "../../lib/sound";
import type { AppState } from "../index";

export const DEFAULT_SETTINGS: AppSettings = {
  openrouter_api_key: "",
  lmstudio_url: "http://127.0.0.1:1234",
  lmstudio_model: "gemma-4",
  lmstudio_max_tokens: 1024,
  quick_capture_hotkey: "CommandOrControl+Shift+Space",
  theme_id: "dark-default",
  custom_accent: "",
  snap_to_grid: true,
  grid_size: 20,
  sound_enabled: true,
  sound_volume: 0.7,
  edge_particles: true,
  node_color: "",
};

export interface SettingsSlice {
  settings: AppSettings;
  loadSettings: () => Promise<void>;
  saveSettings: (s: Partial<AppSettings>) => Promise<void>;
}

function applySideEffects(settings: AppSettings) {
  const theme = THEMES[settings.theme_id] || THEMES["dark-default"];
  applyTheme(theme, settings.custom_accent);
  setSoundEnabled(settings.sound_enabled);
  setSoundVolume(settings.sound_volume);
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set, get) => ({
  settings: DEFAULT_SETTINGS,

  loadSettings: async () => {
    const db = await getDb();
    const rows = await db.select<{ key: string; value: string }[]>(
      "SELECT key, value FROM settings"
    );
    const saved: Partial<AppSettings> = {};
    for (const row of rows) {
      try {
        (saved as any)[row.key] = JSON.parse(row.value);
      } catch {
        (saved as any)[row.key] = row.value;
      }
    }
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    set({ settings });
    applySideEffects(settings);
  },

  saveSettings: async (updates) => {
    const db = await getDb();
    const newSettings = { ...get().settings, ...updates };
    for (const [key, value] of Object.entries(updates)) {
      await db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        [key, JSON.stringify(value)]
      );
    }
    set({ settings: newSettings });
    applySideEffects(newSettings);
  },
});
