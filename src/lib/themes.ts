import { Theme, ThemeId } from "../types";

export const THEMES: Record<ThemeId, Theme> = {
  "dark-default": {
    id: "dark-default",
    name: "Vibrant Dark",
    bg: "#07091a",
    surface: "#0d1028",
    border: "rgba(255,255,255,0.08)",
    text: "#dde6f8",
    textMuted: "#3e4a70",
    accent: "#4ecfff",
    dot: "#0a0c1e",
  },
  "midnight-blue": {
    id: "midnight-blue",
    name: "Midnight",
    bg: "#050714",
    surface: "#0a0c1c",
    border: "rgba(255,255,255,0.06)",
    text: "#c8d8f0",
    textMuted: "#2e3858",
    accent: "#5b8dff",
    dot: "#070919",
  },
  forest: {
    id: "forest",
    name: "Forest",
    bg: "#060e08",
    surface: "#0b1610",
    border: "rgba(255,255,255,0.07)",
    text: "#b8d4bb",
    textMuted: "#2e4832",
    accent: "#2de0a5",
    dot: "#091210",
  },
  "warm-sepia": {
    id: "warm-sepia",
    name: "Warm Sepia",
    bg: "#120d08",
    surface: "#1a1208",
    border: "rgba(255,255,255,0.07)",
    text: "#e8dac8",
    textMuted: "#5a4230",
    accent: "#f5a056",
    dot: "#181008",
  },
  "high-contrast": {
    id: "high-contrast",
    name: "High Contrast",
    bg: "#080809",
    surface: "#111118",
    border: "rgba(255,255,255,0.12)",
    text: "#f4f4fa",
    textMuted: "#606075",
    accent: "#ffe44d",
    dot: "#0e0e18",
  },
  custom: {
    id: "custom",
    name: "Custom",
    bg: "#07091a",
    surface: "#0d1028",
    border: "rgba(255,255,255,0.08)",
    text: "#dde6f8",
    textMuted: "#3e4a70",
    accent: "#4ecfff",
    dot: "#0a0c1e",
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
}

export function applyTheme(theme: Theme, customAccent?: string) {
  const root = document.documentElement;
  const accent = customAccent || theme.accent;

  root.style.setProperty("--ms-bg",         theme.bg);
  root.style.setProperty("--ms-surface",    theme.surface);
  root.style.setProperty("--ms-border",     theme.border);
  root.style.setProperty("--ms-text",       theme.text);
  root.style.setProperty("--ms-text-muted", theme.textMuted);
  root.style.setProperty("--ms-accent",     accent);
  root.style.setProperty("--ms-dot",        theme.dot);

  // Derive glow and tinted accent variables from the accent hex
  const [aR, aG, aB] = hexToRgb(accent);
  root.style.setProperty("--ms-glow",        `0 0 20px rgba(${aR},${aG},${aB},0.22)`);
  root.style.setProperty("--ms-glow-strong", `0 0 36px rgba(${aR},${aG},${aB},0.42)`);
  root.style.setProperty("--ms-accent-15",   `rgba(${aR},${aG},${aB},0.15)`);
  root.style.setProperty("--ms-accent-25",   `rgba(${aR},${aG},${aB},0.25)`);

  // Derive legacy neumorphic shadow colours for any nodes that still use them
  const [r, g, b] = hexToRgb(theme.bg);
  const lR = Math.min(255, r + 32), lG = Math.min(255, g + 36), lB = Math.min(255, b + 52);
  const dR = Math.max(0,   r - 10), dG = Math.max(0,   g - 10), dB = Math.max(0,   b - 12);
  root.style.setProperty("--nm-light", `rgba(${lR},${lG},${lB},0.75)`);
  root.style.setProperty("--nm-dark",  `rgba(${dR},${dG},${dB},0.95)`);
}
