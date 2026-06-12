import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../../store";
import { sounds } from "../../lib/sound";
import { THEMES } from "../../lib/themes";
import { AppSettings, ThemeId } from "../../types";
import { AutomationsSection } from "./AutomationsSection";

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
  const { settings, saveSettings, setSettingsOpen, brainStatus, brainChunkCount } = useStore();

  const [openSections, setOpenSections] = useState({
    appearance: true,
    connections: true,
    brain: true,
    automations: false,
    canvas: true,
    shortcuts: true,
    releaseNotes: false,
  });

  const [rebuilding, setRebuilding] = useState(false);
  const handleRebuildBrain = useCallback(async () => {
    setRebuilding(true);
    try {
      const { rebuildBrainIndex } = await import("../../lib/brain/embeddings");
      await rebuildBrainIndex();
      sounds.complete();
    } catch (err) {
      console.warn("Rebuild failed:", err);
      sounds.error();
    } finally {
      setRebuilding(false);
    }
  }, []);

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
                    {lmTestStatus === "ok" ? "Connected" : "Failed — check URL and ensure LMStudio is running"}
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
                    {orTestStatus === "ok" ? "Connected — API key valid" : "Failed — check your API key"}
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
        {/* ── BRAIN ──────────────────────────────────────────────────────── */}
        <SectionHeader title="Brain" open={openSections.brain} onToggle={() => toggleSection("brain")} />
        <AnimatePresence initial={false}>
          {openSections.brain && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ padding: "4px 2px 14px" }}>
                {/* Status */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: brainStatus === "ready" ? "#4ade80"
                      : brainStatus === "indexing" ? "var(--ms-accent)"
                      : brainStatus === "offline" ? "#f87171" : "var(--ms-border)",
                  }} />
                  <span style={{ fontSize: 12, color: "var(--ms-text)", flex: 1 }}>
                    {brainStatus === "ready" && `Semantic memory ready · ${brainChunkCount} chunks indexed`}
                    {brainStatus === "indexing" && "Indexing your vault…"}
                    {brainStatus === "offline" && "LM Studio offline — keyword search only"}
                    {brainStatus === "idle" && "Waiting for first index"}
                  </span>
                  <button
                    onClick={handleRebuildBrain}
                    disabled={rebuilding}
                    style={{
                      padding: "4px 12px", background: "var(--ms-border)", border: "none",
                      borderRadius: 7, color: "var(--ms-text)", fontSize: 11,
                      cursor: rebuilding ? "wait" : "pointer",
                    }}>
                    {rebuilding ? "Rebuilding…" : "Rebuild index"}
                  </button>
                </div>

                {/* Embedding model */}
                <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 4 }}>
                  Embedding model (blank = auto-detect from LM Studio)
                </label>
                <input
                  defaultValue={settings.lmstudio_embedding_model}
                  onChange={(e) => debouncedSave("lmstudio_embedding_model", e.target.value.trim())}
                  placeholder="e.g. text-embedding-nomic-embed-text-v1.5"
                  style={{
                    width: "100%", background: "var(--ms-bg)", border: "1px solid var(--ms-border)",
                    borderRadius: 8, padding: "7px 10px", color: "var(--ms-text)", fontSize: 12,
                    outline: "none", marginBottom: 14,
                  }}
                />

                {/* Triage */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 12.5, color: "var(--ms-text)" }}>Auto-file Inbox captures</div>
                    <div style={{ fontSize: 10.5, color: "var(--ms-text-muted)" }}>AI moves brain dumps to the right canvas; ⌘Z undoes</div>
                  </div>
                  <Toggle checked={settings.triage_enabled} onChange={(v) => immediateSave({ triage_enabled: v })} />
                </div>
                {settings.triage_enabled && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--ms-text-muted)", flexShrink: 0 }}>Confidence to file</span>
                    <input
                      type="range" min={0.5} max={0.95} step={0.05}
                      defaultValue={settings.triage_threshold}
                      onChange={(e) => debouncedSave("triage_threshold", parseFloat(e.target.value))}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: 11, color: "var(--ms-text)", width: 30, textAlign: "right" }}>
                      {Math.round((settings.triage_threshold || 0.7) * 100)}%
                    </span>
                  </div>
                )}

                {/* Digest */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12.5, color: "var(--ms-text)" }}>Daily digest</div>
                    <div style={{ fontSize: 10.5, color: "var(--ms-text-muted)" }}>Morning recap with resurfaced notes and stale tasks</div>
                  </div>
                  <Toggle checked={settings.digest_enabled} onChange={(v) => immediateSave({ digest_enabled: v })} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── AUTOMATIONS ────────────────────────────────────────────────── */}
        <SectionHeader title="Automations" open={openSections.automations} onToggle={() => toggleSection("automations")} />
        <AnimatePresence initial={false}>
          {openSections.automations && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{ overflow: "hidden" }}
            >
              <AutomationsSection />
            </motion.div>
          )}
        </AnimatePresence>

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
                  style={{ width: 110, accentColor: "var(--ms-accent)" }}
                />
              </div>

              <div style={fieldStyle}>
                <span style={labelStyle}>Grid Opacity ({Math.round((settings.grid_opacity ?? 1) * 100)}%)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((settings.grid_opacity ?? 1) * 100)}
                  onChange={(e) => debouncedSave("grid_opacity", parseInt(e.target.value) / 100, 80)}
                  style={{ width: 110, accentColor: "var(--ms-accent)" }}
                />
              </div>

              <div style={fieldStyle}>
                <span style={labelStyle}>Grid Color</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {([
                    { id: "subtle" as const, label: "Subtle" },
                    { id: "text" as const, label: "Text" },
                    { id: "accent" as const, label: "Accent" },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => immediateSave({ grid_color: opt.id })}
                      style={{
                        ...btnSmall,
                        padding: "4px 9px",
                        fontSize: 11,
                        background: (settings.grid_color ?? "subtle") === opt.id
                          ? "color-mix(in srgb, var(--ms-accent) 18%, var(--ms-border))"
                          : "var(--ms-border)",
                        color: (settings.grid_color ?? "subtle") === opt.id
                          ? "var(--ms-text)"
                          : "var(--ms-text-muted)",
                        border: (settings.grid_color ?? "subtle") === opt.id
                          ? "1px solid var(--ms-accent)"
                          : "1px solid transparent",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
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

              <div style={fieldStyle}>
                <span style={labelStyle}>Node Opacity ({Math.round((settings.node_opacity ?? 1) * 100)}%)</span>
                <input
                  type="range"
                  min={40}
                  max={100}
                  step={5}
                  value={Math.round((settings.node_opacity ?? 1) * 100)}
                  onChange={(e) => debouncedSave("node_opacity", parseInt(e.target.value) / 100, 80)}
                  style={{ width: 110, accentColor: "var(--ms-accent)" }}
                />
              </div>

              <div style={fieldStyle}>
                <span style={labelStyle}>Hover Effects</span>
                <Toggle
                  checked={settings.canvas_fx_enabled ?? true}
                  onChange={(v) => immediateSave({ canvas_fx_enabled: v })}
                />
              </div>

              {(settings.canvas_fx_enabled ?? true) && (
                <>
                  <div style={fieldStyle}>
                    <span style={labelStyle}>Effect Style</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {([
                        { id: "hover" as const, label: "Hover" },
                        { id: "proximity" as const, label: "Proximity" },
                        { id: "ripple" as const, label: "Ripple" },
                      ]).map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => immediateSave({ canvas_fx_style: opt.id })}
                          style={{
                            ...btnSmall,
                            padding: "4px 9px",
                            fontSize: 11,
                            background: (settings.canvas_fx_style ?? "proximity") === opt.id
                              ? "color-mix(in srgb, var(--ms-accent) 18%, var(--ms-border))"
                              : "var(--ms-border)",
                            color: (settings.canvas_fx_style ?? "proximity") === opt.id
                              ? "var(--ms-text)"
                              : "var(--ms-text-muted)",
                            border: (settings.canvas_fx_style ?? "proximity") === opt.id
                              ? "1px solid var(--ms-accent)"
                              : "1px solid transparent",
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={fieldStyle}>
                    <span style={labelStyle}>Effect Intensity ({settings.canvas_fx_intensity ?? 60}%)</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={settings.canvas_fx_intensity ?? 60}
                      onChange={(e) => debouncedSave("canvas_fx_intensity", parseInt(e.target.value), 80)}
                      style={{ width: 110, accentColor: "var(--ms-accent)" }}
                    />
                  </div>

                  <div style={fieldStyle}>
                    <span style={labelStyle}>Node Cards React</span>
                    <Toggle
                      checked={settings.canvas_fx_cards ?? true}
                      onChange={(v) => immediateSave({ canvas_fx_cards: v })}
                    />
                  </div>

                  <div style={fieldStyle}>
                    <span style={labelStyle}>Ambient Layer Reacts</span>
                    <Toggle
                      checked={settings.canvas_fx_ambient ?? true}
                      onChange={(v) => immediateSave({ canvas_fx_ambient: v })}
                    />
                  </div>
                </>
              )}
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
                  version: "1.9",
                  label: "Current",
                  date: "June 2026",
                  current: true,
                  changes: [
                    "Grid Opacity slider in Settings > Canvas — fade the dot grid from fully visible down to hidden",
                    "Grid Color presets that follow your theme: Subtle (default), Text, or Accent",
                    "Grid Size can now be adjusted even when Snap to Grid is off",
                  ],
                },
                {
                  version: "1.8.2",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "Ambient model suggestions: as you type in a Note, Task, AI Chat, or Mental Model node, up to two relevant mental-model chips appear below it",
                    "Click a chip to spawn a ready-to-use Mental Model node wired to what you were writing; dismiss to mute that model for the node",
                    "The model library is embedded once via LM Studio on first launch; suggestions stay silent when LM Studio is offline",
                  ],
                },
                {
                  version: "1.8.1",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "Mental Model node: a new Think category in the spawn menu — pick a model and work through its guided prompts on the canvas",
                    "Rich-text Summary field with a one-click \"Summarise with AI\" synthesis of your responses (local LM Studio)",
                    "Wire a Mental Model node to an AI Chat node to activate that model as the chat's lens; remove the wire to clear it",
                    "Swap the node's model anytime — with a confirmation before your responses are cleared",
                  ],
                },
                {
                  version: "1.8",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "Mental Models library: 31 reasoning frameworks across Management & Leadership, Career, and Thinking & Perspective, stored locally",
                    "AI Chat Lens: pick any mental model and the chat reasons through your questions using that framework",
                    "Searchable lens picker grouped by category, with keyboard navigation",
                    "Amber indicator on the chat node while a lens is active; clears with one click",
                  ],
                },
                {
                  version: "1.7",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "The canvas feels alive: nodes, ambient dots, and the grid react as your cursor moves — choose Hover, Proximity, or Ripple style",
                    "Hover Effects controls in Settings > Canvas: on/off, style, intensity, and per-layer toggles",
                    "Node Color now tints the node cards (selection and glow), not just the background layer",
                    "New Node Opacity slider to fade cards into the canvas",
                  ],
                },
                {
                  version: "1.6.2",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "Fixed: global search no longer comes up empty — the index rebuilds reliably at startup",
                    "Search button in the sidebar, above Settings",
                    "Canvas grid follows your Grid Size setting and is clearly visible",
                  ],
                },
                {
                  version: "1.6.1",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "Fixed: black screen at startup caused by a canvas render loop in the packaged app",
                  ],
                },
                {
                  version: "1.6",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "Menubar capture: click the tray icon to dump a thought from anywhere — it lands in your Inbox and gets auto-filed, no main window needed",
                    "Automations: build when-X-do-Y rules in Settings — task reminders, RSS keyword watches, daily schedules, auto-notes, and triage runs",
                    "Node registry: every node type now registers in one place, so new widgets are one file plus one entry",
                  ],
                },
                {
                  version: "1.5.1",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "Consistent iconography: all emojis replaced with crisp vector icons across weather, currency, habits, and badges",
                  ],
                },
                {
                  version: "1.5",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "The Brain: local semantic memory over everything you've written (LM Studio embeddings, fully private)",
                    "Brain chat: toggle the Brain icon to ask questions across your whole vault, with citation chips that jump to sources",
                    "Inbox: quick captures are auto-filed to the right canvas by AI — every move undoable with ⌘Z",
                    "Today panel: daily digest with resurfaced notes, stale tasks, and triage recap",
                    "Related strip: backlinks and AI-suggested connections on every node editor",
                    "Knowledge graph view (⌘⇧G)",
                  ],
                },
                {
                  version: "1.4",
                  label: "",
                  date: "June 2026",
                  current: false,
                  changes: [
                    "Global search: press ⌘K to find any node across all projects and jump straight to it",
                    "Canvas undo/redo: ⌘Z / ⇧⌘Z for node and connection changes",
                    "AI chat responses now stream in live, with a Stop button",
                    "Duplicate selection with ⌘D, group with ⌘G",
                    "Alignment toolbar when multiple nodes are selected (align + distribute)",
                    "Locked nodes now show a padlock badge",
                  ],
                },
                {
                  version: "1.3",
                  label: "",
                  date: "June 2026",
                  current: false,
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
                MindSpace v1.9.0 · com.joshualawrence.mindspace
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default SettingsPanel;
