import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { sounds } from "../../lib/sound";
import { THEMES } from "../../lib/themes";
import { AppSettings, ThemeId } from "../../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 11,
        border: "none",
        background: checked ? "var(--ms-accent)" : "var(--ms-border)",
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        transition: "background 0.15s ease",
        padding: 0,
      }}
    >
      <motion.div
        animate={{ x: checked ? 18 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        style={{
          position: "absolute",
          top: 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: "100%",
        background: "none",
        border: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 0 8px",
        cursor: "pointer",
        color: "var(--ms-text)",
        fontFamily: "inherit",
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      <motion.span
        animate={{ rotate: open ? 90 : 0 }}
        transition={{ duration: 0.15 }}
        style={{ display: "inline-block", color: "var(--ms-text-muted)", fontSize: 10 }}
      >
        ▶
      </motion.span>
      {title}
    </button>
  );
}

const fieldStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--ms-text-muted)",
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  background: "var(--ms-border)",
  border: "1px solid var(--ms-border)",
  borderRadius: 6,
  color: "var(--ms-text)",
  fontSize: 12,
  padding: "6px 10px",
  outline: "none",
  fontFamily: "inherit",
  flex: 1,
  minWidth: 0,
};

const btnSmall: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--ms-border)",
  background: "var(--ms-border)",
  color: "var(--ms-text)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 500,
  flexShrink: 0,
  whiteSpace: "nowrap" as const,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const { settings, saveSettings, setSettingsOpen } = useStore();

  const [openSections, setOpenSections] = useState({
    appearance: true,
    connections: true,
    canvas: true,
    shortcuts: true,
    releaseNotes: false,
  });

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  // LMStudio test state
  const [lmTestStatus, setLmTestStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [lmTestLoading, setLmTestLoading] = useState(false);

  // OpenRouter test state
  const [orTestStatus, setOrTestStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [orTestLoading, setOrTestLoading] = useState(false);

  // OpenRouter key visibility
  const [showApiKey, setShowApiKey] = useState(false);

  // Shortcut recording
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const [hotkeyDisplay, setHotkeyDisplay] = useState(settings.quick_capture_hotkey);

  // Debounce refs for text inputs
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const debouncedSave = useCallback(
    (key: keyof AppSettings, value: AppSettings[keyof AppSettings], ms = 300) => {
      if (debounceRefs.current[key]) clearTimeout(debounceRefs.current[key]);
      debounceRefs.current[key] = setTimeout(() => {
        saveSettings({ [key]: value } as Partial<AppSettings>);
      }, ms);
    },
    [saveSettings]
  );

  const immediateSave = useCallback(
    (updates: Partial<AppSettings>) => {
      saveSettings(updates);
      sounds.click();
    },
    [saveSettings]
  );

  // Hotkey recording
  useEffect(() => {
    if (!recordingHotkey) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      const key = e.key;
      if (!["Meta", "Control", "Alt", "Shift"].includes(key)) {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
        const hotkey = parts.join("+");
        setHotkeyDisplay(hotkey);
        saveSettings({ quick_capture_hotkey: hotkey });
        setRecordingHotkey(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [recordingHotkey, saveSettings]);

  // Test OpenRouter connection
  const testOpenRouter = useCallback(async () => {
    setOrTestLoading(true);
    setOrTestStatus("idle");
    try {
      const key = settings.openrouter_api_key;
      if (!key) { setOrTestStatus("fail"); return; }
      const resp = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(6000),
      });
      setOrTestStatus(resp.ok ? "ok" : "fail");
    } catch {
      setOrTestStatus("fail");
    } finally {
      setOrTestLoading(false);
    }
  }, [settings.openrouter_api_key]);

  // Test LMStudio connection
  const testLmStudio = useCallback(async () => {
    setLmTestLoading(true);
    setLmTestStatus("idle");
    try {
      const url = (settings.lmstudio_url || "http://127.0.0.1:1234") + "/v1/models";
      const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
      setLmTestStatus(resp.ok ? "ok" : "fail");
    } catch {
      setLmTestStatus("fail");
    } finally {
      setLmTestLoading(false);
    }
  }, [settings.lmstudio_url]);

  return (
    <motion.div
      key="settings-panel"
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        background: "var(--ms-surface)",
        borderLeft: "1px solid var(--ms-border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 500,
        boxShadow: "-8px 0 32px rgba(0,0,0,0.35)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "16px 20px",
          borderBottom: "1px solid var(--ms-border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, flex: 1, color: "var(--ms-text)" }}>Settings</span>
        <button
          onClick={() => { setSettingsOpen(false); sounds.click(); }}
          style={{
            background: "none",
            border: "none",
            color: "var(--ms-text-muted)",
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 20px 24px" }}>

        {/* ── APPEARANCE ────────────────────────────────────────────────── */}
        <SectionHeader title="Appearance" open={openSections.appearance} onToggle={() => toggleSection("appearance")} />
        <AnimatePresence initial={false}>
          {openSections.appearance && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: "hidden" }}
            >
              {/* Theme grid */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "var(--ms-text-muted)", marginBottom: 10 }}>Theme</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {(Object.values(THEMES)).map((theme) => {
                    const active = settings.theme_id === theme.id;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => immediateSave({ theme_id: theme.id as ThemeId })}
                        style={{
                          background: theme.bg,
                          border: `2px solid ${active ? "var(--ms-accent)" : theme.border}`,
                          borderRadius: 8,
                          padding: "10px 10px 8px",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "border-color 0.12s",
                          boxShadow: active ? "0 0 0 2px var(--ms-accent)" : "none",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, color: theme.text, marginBottom: 6 }}>
                          {theme.name}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[theme.bg, theme.surface, theme.accent, theme.dot].map((c, i) => (
                            <div
                              key={i}
                              style={{ width: 14, height: 14, borderRadius: "50%", background: c, border: `1px solid ${theme.border}` }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom accent */}
              <div style={fieldStyle}>
                <span style={labelStyle}>
                  {settings.theme_id === "custom" ? "Custom Accent" : "Accent Override"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="color"
                    value={settings.custom_accent || THEMES[settings.theme_id]?.accent || "#5b8dee"}
                    onChange={(e) => debouncedSave("custom_accent", e.target.value, 100)}
                    style={{ width: 36, height: 28, border: "none", background: "none", cursor: "pointer", borderRadius: 4, padding: 0 }}
                  />
                  <span style={{ fontSize: 11, color: "var(--ms-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {settings.custom_accent || THEMES[settings.theme_id]?.accent || "#5b8dee"}
                  </span>
                  {settings.custom_accent && (
                    <button onClick={() => immediateSave({ custom_accent: "" })} style={{ ...btnSmall, padding: "3px 7px", color: "var(--ms-text-muted)" }}>
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Sound toggle */}
              <div style={fieldStyle}>
                <span style={labelStyle}>Sound Effects</span>
                <Toggle
                  checked={settings.sound_enabled}
                  onChange={(v) => immediateSave({ sound_enabled: v })}
                />
              </div>

              {/* Volume slider */}
              <div style={fieldStyle}>
                <span style={labelStyle}>Volume</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end" }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(settings.sound_volume * 100)}
                    onChange={(e) => debouncedSave("sound_volume", parseInt(e.target.value) / 100, 80)}
                    disabled={!settings.sound_enabled}
                    style={{ width: 100, accentColor: "var(--ms-accent)", opacity: settings.sound_enabled ? 1 : 0.4 }}
                  />
                  <span style={{ fontSize: 11, color: "var(--ms-text-muted)", width: 30, textAlign: "right" }}>
                    {Math.round(settings.sound_volume * 100)}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ borderTop: "1px solid var(--ms-border)" }} />

        {/* ── CONNECTIONS ──────────────────────────────────────────────── */}
        <SectionHeader title="Connections" open={openSections.connections} onToggle={() => toggleSection("connections")} />
        <AnimatePresence initial={false}>
          {openSections.connections && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: "hidden" }}
            >
              {/* LMStudio URL */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ ...labelStyle, display: "block", marginBottom: 5 }}>LMStudio URL</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    defaultValue={settings.lmstudio_url}
                    onBlur={(e) => debouncedSave("lmstudio_url", e.target.value)}
                    onChange={(e) => debouncedSave("lmstudio_url", e.target.value)}
                    placeholder="http://127.0.0.1:1234"
                    style={inputStyle}
                  />
                  <button
                    onClick={testLmStudio}
                    disabled={lmTestLoading}
                    style={{ ...btnSmall, minWidth: 52 }}
                  >
                    {lmTestLoading ? "…" : "Test"}
                  </button>
                </div>
                {lmTestStatus !== "idle" && (
                  <div
                    style={{
                      marginTop: 5,
                      fontSize: 11,
                      color: lmTestStatus === "ok" ? "#4ade80" : "#f87171",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {lmTestStatus === "ok" ? "✓ Connected" : "✗ Failed — check URL and ensure LMStudio is running"}
                  </div>
                )}
              </div>

              {/* LMStudio Model */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ ...labelStyle, display: "block", marginBottom: 5 }}>LMStudio Model</label>
                <input
                  defaultValue={settings.lmstudio_model}
                  onBlur={(e) => debouncedSave("lmstudio_model", e.target.value)}
                  onChange={(e) => debouncedSave("lmstudio_model", e.target.value)}
                  placeholder="gemma-4"
                  style={inputStyle}
                />
              </div>

              {/* LMStudio Max Tokens */}
              <div style={{ ...fieldStyle, marginBottom: 14 }}>
                <span style={labelStyle}>Max Tokens</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={64}
                    max={32768}
                    step={128}
                    defaultValue={settings.lmstudio_max_tokens ?? 1024}
                    onBlur={(e) => debouncedSave("lmstudio_max_tokens", Math.max(64, parseInt(e.target.value) || 1024))}
                    onChange={(e) => debouncedSave("lmstudio_max_tokens", Math.max(64, parseInt(e.target.value) || 1024))}
                    style={{ ...inputStyle, width: 90, flex: "none", textAlign: "right" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>tokens</span>
                </div>
              </div>

              {/* OpenRouter API Key */}
              <div style={{ marginBottom: 6 }}>
                <label style={{ ...labelStyle, display: "block", marginBottom: 5 }}>OpenRouter API Key</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type={showApiKey ? "text" : "password"}
                    defaultValue={settings.openrouter_api_key}
                    onBlur={(e) => { debouncedSave("openrouter_api_key", e.target.value); setOrTestStatus("idle"); }}
                    onChange={(e) => { debouncedSave("openrouter_api_key", e.target.value); setOrTestStatus("idle"); }}
                    placeholder="sk-or-..."
                    style={inputStyle}
                    autoComplete="off"
                  />
                  <button onClick={() => setShowApiKey((v) => !v)} style={btnSmall}>
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                  <button
                    onClick={testOpenRouter}
                    disabled={orTestLoading || !settings.openrouter_api_key}
                    style={{ ...btnSmall, minWidth: 48, opacity: !settings.openrouter_api_key ? 0.4 : 1 }}
                  >
                    {orTestLoading ? "…" : "Test"}
                  </button>
                </div>
                {orTestStatus !== "idle" && (
                  <div style={{ marginTop: 5, fontSize: 11, color: orTestStatus === "ok" ? "#4ade80" : "#f87171", display: "flex", alignItems: "center", gap: 5 }}>
                    {orTestStatus === "ok" ? "✓ Connected — API key valid" : "✗ Failed — check your API key"}
                  </div>
                )}
                <a
                  href="https://openrouter.ai"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: "var(--ms-accent)", display: "inline-block", marginTop: 5 }}
                >
                  openrouter.ai ↗
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ borderTop: "1px solid var(--ms-border)" }} />

        {/* ── CANVAS ───────────────────────────────────────────────────── */}
        <SectionHeader title="Canvas" open={openSections.canvas} onToggle={() => toggleSection("canvas")} />
        <AnimatePresence initial={false}>
          {openSections.canvas && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: "hidden" }}
            >
              <div style={fieldStyle}>
                <span style={labelStyle}>Snap to Grid</span>
                <Toggle
                  checked={settings.snap_to_grid}
                  onChange={(v) => immediateSave({ snap_to_grid: v })}
                />
              </div>

              <div style={fieldStyle}>
                <span style={labelStyle}>Grid Size ({settings.grid_size}px)</span>
                <input
                  type="range"
                  min={10}
                  max={40}
                  step={2}
                  value={settings.grid_size}
                  onChange={(e) => debouncedSave("grid_size", parseInt(e.target.value), 80)}
                  disabled={!settings.snap_to_grid}
                  style={{ width: 110, accentColor: "var(--ms-accent)", opacity: settings.snap_to_grid ? 1 : 0.4 }}
                />
              </div>

              <div style={fieldStyle}>
                <span style={labelStyle}>Show Minimap</span>
                <Toggle
                  checked={(settings as AppSettings & { show_minimap?: boolean }).show_minimap ?? true}
                  onChange={(v) => immediateSave({ show_minimap: v } as Partial<AppSettings>)}
                />
              </div>

              <div style={fieldStyle}>
                <span style={labelStyle}>Node Color</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="color"
                    value={settings.node_color || (getComputedStyle(document.documentElement).getPropertyValue("--ms-accent").trim() || "#c8ff20")}
                    onChange={(e) => debouncedSave("node_color", e.target.value, 100)}
                    style={{ width: 36, height: 28, border: "none", background: "none", cursor: "pointer", borderRadius: 4, padding: 0 }}
                  />
                  <span style={{ fontSize: 11, color: "var(--ms-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {settings.node_color || "Theme"}
                  </span>
                  {settings.node_color && (
                    <button onClick={() => immediateSave({ node_color: "" })} style={{ ...btnSmall, padding: "3px 7px", color: "var(--ms-text-muted)" }}>
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div style={fieldStyle}>
                <span style={labelStyle}>Live Connectors</span>
                <Toggle
                  checked={settings.edge_particles ?? true}
                  onChange={(v) => immediateSave({ edge_particles: v })}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ borderTop: "1px solid var(--ms-border)" }} />

        {/* ── SHORTCUTS ────────────────────────────────────────────────── */}
        <SectionHeader title="Shortcuts" open={openSections.shortcuts} onToggle={() => toggleSection("shortcuts")} />
        <AnimatePresence initial={false}>
          {openSections.shortcuts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ marginBottom: 12 }}>
                <label style={{ ...labelStyle, display: "block", marginBottom: 8 }}>Quick Capture Hotkey</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div
                    style={{
                      ...inputStyle,
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      userSelect: "none",
                      background: recordingHotkey
                        ? "color-mix(in srgb, var(--ms-accent) 15%, var(--ms-border))"
                        : "var(--ms-border)",
                      border: recordingHotkey ? "1px solid var(--ms-accent)" : "1px solid var(--ms-border)",
                      transition: "all 0.12s",
                    }}
                  >
                    {recordingHotkey ? (
                      <motion.span
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        style={{ color: "var(--ms-accent)", fontSize: 12 }}
                      >
                        Press keys…
                      </motion.span>
                    ) : (
                      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                        {hotkeyDisplay}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setRecordingHotkey((v) => !v)}
                    style={{
                      ...btnSmall,
                      background: recordingHotkey ? "var(--ms-accent)" : "var(--ms-border)",
                      color: recordingHotkey ? "#fff" : "var(--ms-text)",
                      border: "1px solid transparent",
                    }}
                  >
                    {recordingHotkey ? "Cancel" : "Record"}
                  </button>
                </div>
                {recordingHotkey && (
                  <p style={{ fontSize: 11, color: "var(--ms-text-muted)", marginTop: 6 }}>
                    Press the key combination you want to use. Esc cancels.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ borderTop: "1px solid var(--ms-border)" }} />

        {/* ── RELEASE NOTES ────────────────────────────────────────────── */}
        <SectionHeader title="Release Notes" open={openSections.releaseNotes} onToggle={() => toggleSection("releaseNotes")} />
        <AnimatePresence initial={false}>
          {openSections.releaseNotes && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: "hidden" }}
            >
              {[
                {
                  version: "1.3",
                  label: "Current",
                  date: "June 2026",
                  current: true,
                  changes: [
                    "Fixed: typing mid-content in notes no longer garbles or loses text",
                    "Fixed: text in AI chat messages can now be selected and copied",
                    "Automatic database backups on launch (last 10 kept)",
                    "Canvas export/import as JSON from the sidebar",
                    "Faster canvas rendering with large node counts",
                    "A crashing node now shows a Retry card instead of breaking the canvas",
                    "Security hardening: Content Security Policy and API request allowlist",
                  ],
                },
                {
                  version: "1.2",
                  label: "",
                  date: "May 2026",
                  current: false,
                  changes: [
                    "STT Node: speech-to-text with animated waveform recorder",
                    "TTS Node: text-to-speech with voice selector and playback animation",
                  ],
                },
                {
                  version: "1.1.1",
                  label: "",
                  date: "May 2026",
                  current: false,
                  changes: [
                    "CosmicNode: Boson — interactive particle physics canvas with mouse attraction",
                    "CosmicNode: Vector — mouse-driven vector field with speed control",
                    "CosmicNode: Shapes Grid — interactive procedural shapes canvas",
                  ],
                },
                {
                  version: "1.1",
                  label: "",
                  date: "May 2026",
                  current: false,
                  changes: [
                    "CosmicNode: multi-mode interactive canvas node",
                    "BeatMaker (KO): 8-track step sequencer with percussion and melodic instruments",
                    "Directional particle flow animation on canvas edges",
                    "Edge particles on/off toggle in Canvas settings",
                    "Position-based musical notes on ripple grid clicks",
                    "Fixed transparent node corners (ReactFlow wrapper background)",
                  ],
                },
                {
                  version: "1.0",
                  label: "Initial Release",
                  date: "May 2026",
                  current: false,
                  changes: [
                    "Spatial node canvas powered by React Flow",
                    "30+ node types: Notes, AI Chat, Calendar, Chart, Tasks, and more",
                    "LMStudio and OpenRouter AI integration",
                    "Global quick-capture hotkey with system tray",
                    "6 themes with custom accent override",
                    "Glassmorphism UI with sound effects",
                    "SQLite persistence via Tauri plugin",
                  ],
                },
              ].map((release) => (
                <div
                  key={release.version}
                  style={{
                    marginBottom: 14,
                    borderRadius: 10,
                    border: `1px solid ${release.current ? "var(--ms-accent)" : "var(--ms-border)"}`,
                    background: release.current
                      ? "color-mix(in srgb, var(--ms-accent) 8%, var(--ms-border))"
                      : "var(--ms-border)",
                    padding: "12px 14px",
                    boxShadow: release.current ? "0 0 0 1px var(--ms-accent)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ms-text)" }}>
                      v{release.version}
                    </span>
                    {release.current && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--ms-accent)",
                          background: "color-mix(in srgb, var(--ms-accent) 15%, transparent)",
                          padding: "2px 7px",
                          borderRadius: 20,
                          border: "1px solid var(--ms-accent)",
                        }}
                      >
                        current
                      </span>
                    )}
                    {!release.current && release.label && (
                      <span style={{ fontSize: 10, color: "var(--ms-text-muted)", fontStyle: "italic" }}>
                        {release.label}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--ms-text-muted)", marginLeft: "auto" }}>
                      {release.date}
                    </span>
                  </div>
                  <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
                    {release.changes.map((c, i) => (
                      <li key={i} style={{ fontSize: 11, color: "var(--ms-text-muted)", marginBottom: 3, lineHeight: 1.5 }}>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div style={{ fontSize: 10, color: "var(--ms-text-muted)", textAlign: "center", paddingBottom: 4, opacity: 0.6 }}>
                MindSpace v1.3.0 · com.joshualawrence.mindspace
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default SettingsPanel;
