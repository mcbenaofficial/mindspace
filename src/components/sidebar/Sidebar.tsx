import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder, BrainCircuit, Rocket, Lightbulb, FileText, Target,
  Zap, Leaf, Globe, Wrench, Plus, Settings, Layers, ChevronRight,
  Download, Upload, Sunrise, Share2, Search as SearchIcon,
} from "lucide-react";
import { useStore } from "../../store";
import { sounds } from "../../lib/sound";
import { isTauri } from "../../lib/tauri-compat";
import { exportCanvas, importCanvas } from "../../lib/canvasIO";
import { MindSpaceLogo } from "../MindSpaceLogo";

const PROJECT_COLORS = [
  "#4ecfff", "#ee5b8d", "#8dee5b", "#ee8d5b",
  "#a78bfa", "#d05bee", "#eedd5b", "#5b9dee",
];

const PROJECT_ICON_KEYS = ["folder", "brain", "rocket", "lightbulb", "file", "target", "zap", "leaf", "globe", "wrench"];

const ICON_MAP: Record<string, React.ElementType> = {
  folder: Folder, brain: BrainCircuit, rocket: Rocket, lightbulb: Lightbulb,
  file: FileText, target: Target, zap: Zap, leaf: Leaf, globe: Globe, wrench: Wrench,
};

function ProjectIcon({ name, size, color }: { name: string; size: number; color?: string }) {
  const Icon = ICON_MAP[name] ?? Folder;
  return <Icon size={size} color={color} />;
}

// Converts a hex color like #4ecfff into rgba(78,207,255, alpha)
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function SectionLabel({ label, onAdd, onImport }: { label: string; onAdd: () => void; onImport?: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [importHovered, setImportHovered] = useState(false);
  const iconBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--ms-accent-15)" : "none",
    border: active ? "1px solid var(--ms-accent-25)" : "1px solid transparent",
    borderRadius: 6, cursor: "pointer", padding: "2px 4px",
    color: active ? "var(--ms-accent)" : "var(--ms-text-muted)",
    display: "flex", alignItems: "center", transition: "all 0.15s",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 6px", marginTop: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ms-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(255,255,255,0.06), transparent)" }} />
      {onImport && (
        <button
          onClick={onImport}
          onMouseEnter={() => setImportHovered(true)}
          onMouseLeave={() => setImportHovered(false)}
          title="Import canvas from JSON"
          style={iconBtnStyle(importHovered)}
        >
          <Upload size={12} />
        </button>
      )}
      <button
        onClick={onAdd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={iconBtnStyle(hovered)}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

export function Sidebar() {
  const {
    projects, canvases, activeProjectId, activeCanvasId,
    loadCanvases, setActiveCanvas, createProject, createCanvas,
    updateProject, updateCanvas,
    setSettingsOpen, createProjectPrompt, setCreateProjectPrompt,
    setTodayOpen, todayOpen, setGraphOpen, inboxCount, setSearchOpen,
  } = useStore();

  const [newProjectName, setNewProjectName] = useState("");
  const [newCanvasName, setNewCanvasName] = useState("");
  const [addingProject, setAddingProject] = useState(false);
  const [addingCanvas, setAddingCanvas] = useState(false);
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState("folder");

  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameProjectValue, setRenameProjectValue] = useState("");
  const [renamingCanvasId, setRenamingCanvasId] = useState<string | null>(null);
  const [renameCanvasValue, setRenameCanvasValue] = useState("");

  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [hoveredCanvasId, setHoveredCanvasId] = useState<string | null>(null);
  const [settingsHovered, setSettingsHovered] = useState(false);

  const startRenameProject = (id: string, name: string) => { setRenamingProjectId(id); setRenameProjectValue(name); };
  const commitRenameProject = async (id: string) => {
    const name = renameProjectValue.trim();
    if (name) await updateProject(id, { name });
    setRenamingProjectId(null);
  };
  const startRenameCanvas = (id: string, name: string) => { setRenamingCanvasId(id); setRenameCanvasValue(name); };
  const commitRenameCanvas = async (id: string) => {
    const name = renameCanvasValue.trim();
    if (name) await updateCanvas(id, { name });
    setRenamingCanvasId(null);
  };

  useEffect(() => {
    if (createProjectPrompt) { setAddingProject(true); setCreateProjectPrompt(false); }
  }, [createProjectPrompt, setCreateProjectPrompt]);

  const winAction = useCallback(async (action: "minimize" | "fullscreen" | "close") => {
    if (!isTauri()) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      if (action === "minimize") await win.minimize();
      else if (action === "fullscreen") { const full = await win.isFullscreen(); await win.setFullscreen(!full); }
      else await win.close();
    } catch (e) { console.error("Window action failed:", e); }
  }, []);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || creating) return;
    setCreateError(null); setCreating(true); sounds.spawn();
    try {
      const project = await createProject(newProjectName.trim(), selectedColor, selectedIcon);
      const canvas = await createCanvas(project.id, "Main");
      await loadCanvases(project.id);
      setActiveCanvas(canvas.id);
      setNewProjectName(""); setAddingProject(false);
    } catch (err) { setCreateError((err as Error).message ?? "Failed to create project"); sounds.error(); }
    finally { setCreating(false); }
  };

  const handleCreateCanvas = async () => {
    if (!newCanvasName.trim() || !activeProjectId || creating) return;
    setCreating(true); sounds.spawn();
    try {
      const canvas = await createCanvas(activeProjectId, newCanvasName.trim());
      setActiveCanvas(canvas.id); setNewCanvasName(""); setAddingCanvas(false);
    } catch (err) { setCreateError((err as Error).message ?? "Failed to create canvas"); sounds.error(); }
    finally { setCreating(false); }
  };

  const importInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeProjectId) return;
    try {
      await importCanvas(file, activeProjectId);
      sounds.spawn();
    } catch (err) {
      console.error("Canvas import failed:", err);
      sounds.error();
    }
  };

  const handleExportCanvas = async (canvasId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await exportCanvas(canvasId);
      sounds.save();
    } catch (err) {
      console.error("Canvas export failed:", err);
      sounds.error();
    }
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 240,
        background: "var(--ms-surface)",
        borderRight: "1px solid var(--ms-border)",
        boxShadow: "2px 0 24px rgba(0,0,0,0.5)",
        flexShrink: 0,
      }}
    >
      {/* ── Titlebar ────────────────────────────────────────────────────────── */}
      <div
        data-tauri-drag-region
        style={{
          height: 52,
          display: "flex", alignItems: "center",
          paddingLeft: 14, paddingRight: 16, gap: 12,
          borderBottom: "1px solid var(--ms-border)",
          background: "linear-gradient(135deg, var(--ms-accent-15) 0%, transparent 55%)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 7, flexShrink: 0, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          {[
            { action: "close" as const, color: "#ff5f57" },
            { action: "minimize" as const, color: "#febc2e" },
            { action: "fullscreen" as const, color: "#28c840" },
          ].map(({ action, color }) => (
            <button
              key={action}
              onClick={e => { e.stopPropagation(); winAction(action); }}
              style={{
                width: 12, height: 12, borderRadius: "50%",
                background: color, border: "none", cursor: "pointer", padding: 0,
                flexShrink: 0, opacity: 0.9, transition: "opacity 0.1s, transform 0.1s",
                boxShadow: `0 0 6px ${color}55`,
                WebkitAppRegion: "no-drag",
              } as React.CSSProperties}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.9"; (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
            />
          ))}
        </div>

        <div data-tauri-drag-region style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MindSpaceLogo size={20} />
          <span style={{
            fontSize: 14, fontWeight: 700, color: "var(--ms-text)", letterSpacing: "-0.02em",
            textShadow: "0 0 20px var(--ms-accent-25)",
          }}>
            MindSpace
          </span>
        </div>
      </div>

      {/* ── Projects ────────────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 0 4px", flexShrink: 0 }}>
        <SectionLabel label="Projects" onAdd={() => { sounds.click(); setAddingProject(true); }} />

        <AnimatePresence>
          {addingProject && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden", margin: "0 8px 8px" }}
            >
              <div style={{
                background: "var(--ms-bg)", borderRadius: 12, padding: 12,
                border: "1px solid var(--ms-accent-25)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4), var(--ms-glow)",
              }}>
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreateProject(); if (e.key === "Escape") setAddingProject(false); }}
                  placeholder="Project name…"
                  style={{
                    width: "100%", background: "var(--ms-surface)", border: "1px solid var(--ms-border)",
                    outline: "none", color: "var(--ms-text)", fontSize: 13, marginBottom: 10,
                    borderRadius: 8, padding: "6px 10px",
                  }}
                />
                {/* Icon picker */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
                  {PROJECT_ICON_KEYS.map(key => (
                    <button key={key} onClick={() => setSelectedIcon(key)} style={{
                      background: selectedIcon === key ? hexToRgba(selectedColor, 0.2) : "rgba(255,255,255,0.04)",
                      border: selectedIcon === key ? `1px solid ${hexToRgba(selectedColor, 0.4)}` : "1px solid transparent",
                      borderRadius: 7, cursor: "pointer", padding: "4px 5px", display: "flex", alignItems: "center",
                      color: selectedIcon === key ? selectedColor : "var(--ms-text-muted)", transition: "all 0.12s",
                    }}>
                      <ProjectIcon name={key} size={13} />
                    </button>
                  ))}
                </div>
                {/* Color swatches */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                  {PROJECT_COLORS.map(c => (
                    <button key={c} onClick={() => setSelectedColor(c)} style={{
                      width: 18, height: 18, borderRadius: "50%", background: c, padding: 0, cursor: "pointer",
                      border: selectedColor === c ? `2px solid #fff` : "2px solid transparent",
                      boxShadow: selectedColor === c ? `0 0 8px ${c}88` : "none",
                      transition: "all 0.12s",
                    }} />
                  ))}
                </div>
                {createError && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8, lineHeight: 1.4 }}>{createError}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={handleCreateProject} disabled={creating || !newProjectName.trim()} style={{
                    flex: 1, background: "var(--ms-accent)", border: "none", borderRadius: 8,
                    color: "#07091a", fontSize: 12, fontWeight: 700, padding: "6px 0",
                    cursor: creating ? "wait" : "pointer", opacity: creating || !newProjectName.trim() ? 0.6 : 1,
                    boxShadow: "0 2px 12px rgba(78,207,255,0.3)",
                  }}>
                    {creating ? "Creating…" : "Create"}
                  </button>
                  <button onClick={() => { setAddingProject(false); setCreateError(null); }} style={{
                    flex: 1, background: "var(--ms-surface)", border: "1px solid var(--ms-border)",
                    borderRadius: 8, color: "var(--ms-text-muted)", fontSize: 12, padding: "6px 0", cursor: "pointer",
                  }}>
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 6px" }}>
          {projects.map(p => {
            const isActive = activeProjectId === p.id;
            const isHovered = hoveredProjectId === p.id;
            return (
              <div
                key={p.id}
                onMouseEnter={() => setHoveredProjectId(p.id)}
                onMouseLeave={() => setHoveredProjectId(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "7px 10px 7px 10px",
                  borderRadius: 10,
                  background: isActive
                    ? hexToRgba(p.color, 0.1)
                    : isHovered ? "var(--ms-border)" : "transparent",
                  border: isActive
                    ? `1px solid ${hexToRgba(p.color, 0.28)}`
                    : "1px solid transparent",
                  boxShadow: isActive ? `0 0 16px ${hexToRgba(p.color, 0.08)}, inset 0 1px 0 rgba(255,255,255,0.04)` : "none",
                  transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
                  cursor: "pointer",
                }}
              >
                {/* Color indicator bar on left */}
                <div style={{
                  width: 3, height: 20, borderRadius: 2, flexShrink: 0,
                  background: isActive ? p.color : isHovered ? hexToRgba(p.color, 0.4) : "transparent",
                  boxShadow: isActive ? `0 0 8px ${p.color}88` : "none",
                  transition: "background 0.15s, box-shadow 0.15s",
                }} />

                {/* Icon badge */}
                <div style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                  background: isActive ? hexToRgba(p.color, 0.18) : "rgba(255,255,255,0.05)",
                  border: isActive ? `1px solid ${hexToRgba(p.color, 0.3)}` : "1px solid rgba(255,255,255,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.15s, border-color 0.15s",
                }}>
                  <ProjectIcon name={p.icon} size={13} color={isActive ? p.color : "var(--ms-text-muted)"} />
                </div>

                {renamingProjectId === p.id ? (
                  <input
                    autoFocus value={renameProjectValue}
                    onChange={e => setRenameProjectValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") commitRenameProject(p.id); if (e.key === "Escape") setRenamingProjectId(null); }}
                    onBlur={() => commitRenameProject(p.id)}
                    style={{ flex: 1, background: "none", border: "none", outline: `1px solid ${hexToRgba(p.color, 0.6)}`, borderRadius: 4, color: "var(--ms-text)", fontSize: 13, padding: "0 3px" }}
                  />
                ) : (
                  <span
                    style={{
                      flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      color: isActive ? "var(--ms-text)" : "var(--ms-text-muted)",
                      transition: "color 0.15s, font-weight 0.15s",
                    }}
                    onClick={() => { sounds.click(); loadCanvases(p.id); }}
                    onDoubleClick={e => { e.stopPropagation(); startRenameProject(p.id, p.name); }}
                  >
                    {p.name}
                  </span>
                )}

                {isActive && (
                  <ChevronRight size={11} color={hexToRgba(p.color, 0.7)} style={{ flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Separator ───────────────────────────────────────────────────────── */}
      {activeProject && (
        <div style={{ margin: "8px 16px 0", height: 1, background: "linear-gradient(90deg, transparent, var(--ms-border-2), transparent)", flexShrink: 0 }} />
      )}

      {/* ── Canvases ────────────────────────────────────────────────────────── */}
      {activeProject && (
        <div style={{ padding: "12px 0 4px", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionLabel
            label={`${activeProject.name}`}
            onAdd={() => { sounds.click(); setAddingCanvas(true); }}
            onImport={() => { sounds.click(); importInputRef.current?.click(); }}
          />
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />

          <AnimatePresence>
            {addingCanvas && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                style={{ overflow: "hidden", margin: "0 8px 8px", flexShrink: 0 }}
              >
                <div style={{
                  background: "var(--ms-bg)", borderRadius: 12, padding: 12,
                  border: `1px solid ${hexToRgba(activeProject.color, 0.3)}`,
                  boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 12px ${hexToRgba(activeProject.color, 0.08)}`,
                }}>
                  <input
                    autoFocus value={newCanvasName}
                    onChange={e => setNewCanvasName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCreateCanvas(); if (e.key === "Escape") setAddingCanvas(false); }}
                    placeholder="Canvas name…"
                    style={{
                      width: "100%", background: "var(--ms-surface)", border: "1px solid var(--ms-border)",
                      outline: "none", color: "var(--ms-text)", fontSize: 13, marginBottom: 10,
                      borderRadius: 8, padding: "6px 10px",
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={handleCreateCanvas} style={{
                      flex: 1, background: activeProject.color, border: "none", borderRadius: 8,
                      color: "#07091a", fontSize: 12, fontWeight: 700, padding: "6px 0", cursor: "pointer",
                      boxShadow: `0 2px 12px ${hexToRgba(activeProject.color, 0.4)}`,
                    }}>
                      Create
                    </button>
                    <button onClick={() => setAddingCanvas(false)} style={{
                      flex: 1, background: "var(--ms-surface)", border: "1px solid var(--ms-border)",
                      borderRadius: 8, color: "var(--ms-text-muted)", fontSize: 12, padding: "6px 0", cursor: "pointer",
                    }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="nowheel" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1, padding: "0 6px" }}>
            {canvases.map(c => {
              const isActive = activeCanvasId === c.id;
              const isHovered = hoveredCanvasId === c.id;
              return (
                <div
                  key={c.id}
                  onMouseEnter={() => setHoveredCanvasId(c.id)}
                  onMouseLeave={() => setHoveredCanvasId(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px 6px 12px",
                    borderRadius: 9,
                    background: isActive
                      ? hexToRgba(activeProject.color, 0.1)
                      : isHovered ? "var(--ms-border)" : "transparent",
                    border: isActive
                      ? `1px solid ${hexToRgba(activeProject.color, 0.25)}`
                      : "1px solid transparent",
                    transition: "background 0.15s, border-color 0.15s",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {/* Active canvas accent dot */}
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: isActive ? activeProject.color : isHovered ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
                    boxShadow: isActive ? `0 0 6px ${activeProject.color}` : "none",
                    transition: "background 0.15s, box-shadow 0.15s",
                  }} />

                  <Layers size={11} color={isActive ? hexToRgba(activeProject.color, 0.9) : "var(--ms-text-muted)"} style={{ flexShrink: 0 }} />

                  {renamingCanvasId === c.id ? (
                    <input
                      autoFocus value={renameCanvasValue}
                      onChange={e => setRenameCanvasValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") commitRenameCanvas(c.id); if (e.key === "Escape") setRenamingCanvasId(null); }}
                      onBlur={() => commitRenameCanvas(c.id)}
                      style={{ flex: 1, background: "none", border: "none", outline: `1px solid ${hexToRgba(activeProject.color, 0.6)}`, borderRadius: 4, color: "var(--ms-text)", fontSize: 12, padding: "0 3px" }}
                    />
                  ) : (
                    <span
                      style={{
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        fontSize: 12, fontWeight: isActive ? 600 : 400,
                        color: isActive ? "var(--ms-text)" : "var(--ms-text-muted)",
                        transition: "color 0.15s",
                      }}
                      onClick={() => { sounds.click(); setActiveCanvas(c.id); }}
                      onDoubleClick={e => { e.stopPropagation(); startRenameCanvas(c.id, c.name); }}
                    >
                      {c.name}
                    </span>
                  )}

                  {isHovered && renamingCanvasId !== c.id && (
                    <button
                      onClick={e => handleExportCanvas(c.id, e)}
                      title="Export canvas as JSON"
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: "2px 3px",
                        color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-accent)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
                    >
                      <Download size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: "0 12px 0", flexShrink: 0 }}>
        <button
          onClick={() => { sounds.click(); setSearchOpen(true); }}
          title="Search everything (⌘K)"
          style={{
            width: "100%",
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--ms-border)", border: "1px solid transparent",
            borderRadius: 10, cursor: "pointer", padding: "8px 10px",
            color: "var(--ms-text-muted)", fontSize: 12, transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--ms-accent)";
            el.style.borderColor = "var(--ms-accent-25)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--ms-text-muted)";
            el.style.borderColor = "transparent";
          }}
        >
          <SearchIcon size={13} />
          <span style={{ flex: 1, textAlign: "left" }}>Search</span>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 5,
            border: "1px solid var(--ms-border)", color: "var(--ms-text-muted)",
            background: "var(--ms-bg)",
          }}>⌘K</span>
        </button>
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: "10px 12px",
        borderTop: "1px solid var(--ms-border)",
        background: "linear-gradient(0deg, var(--ms-bg) 0%, transparent 100%)",
        flexShrink: 0,
        display: "flex", alignItems: "center", gap: 8,
        marginTop: 10,
      }}>
        <button
          onClick={() => { sounds.click(); setTodayOpen(!todayOpen); }}
          title="Today — digest & inbox"
          style={{
            position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--ms-border)", border: "1px solid transparent",
            borderRadius: 10, cursor: "pointer", padding: "8px 10px",
            color: "var(--ms-text-muted)", transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ms-accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Sunrise size={13} />
          {inboxCount > 0 && (
            <span style={{
              position: "absolute", top: -5, right: -5,
              background: "var(--ms-accent)", color: "var(--ms-bg)",
              fontSize: 9, fontWeight: 700, borderRadius: 9,
              minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 3px",
            }}>
              {inboxCount > 99 ? "99+" : inboxCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { sounds.click(); setGraphOpen(true); }}
          title="Knowledge graph (⌘⇧G)"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--ms-border)", border: "1px solid transparent",
            borderRadius: 10, cursor: "pointer", padding: "8px 10px",
            color: "var(--ms-text-muted)", transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ms-accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Share2 size={13} />
        </button>
        <button
          onClick={() => { sounds.click(); setSettingsOpen(true); }}
          onMouseEnter={() => setSettingsHovered(true)}
          onMouseLeave={() => setSettingsHovered(false)}
          title="Settings"
          style={{
            flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            background: settingsHovered ? "var(--ms-accent-15)" : "var(--ms-border)",
            border: settingsHovered ? "1px solid var(--ms-accent-25)" : "1px solid transparent",
            borderRadius: 10, cursor: "pointer", padding: "8px 0",
            color: settingsHovered ? "var(--ms-accent)" : "var(--ms-text-muted)",
            fontSize: 12, fontWeight: 500,
            boxShadow: settingsHovered ? "var(--ms-glow)" : "none",
            transition: "all 0.15s",
          }}
        >
          <Settings
            size={13}
            style={{
              transition: "transform 0.3s ease",
              transform: settingsHovered ? "rotate(45deg)" : "rotate(0deg)",
            }}
          />
          Settings
        </button>
      </div>
    </div>
  );
}
