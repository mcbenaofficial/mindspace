import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { useStore } from "./store";
import { MindSpaceLogo } from "./components/MindSpaceLogo";
import { sounds } from "./lib/sound";
import { isTauri } from "./lib/tauri-compat";
import { Sidebar } from "./components/sidebar/Sidebar";
import { Canvas } from "./components/canvas/Canvas";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { QuickCaptureModal } from "./components/modals/QuickCaptureModal";
import { NodeEditorModal } from "./components/modals/NodeEditorModal";
import { SearchPalette } from "./components/modals/SearchPalette";
import { TodayPanel } from "./components/modals/TodayPanel";
import { GraphViewModal } from "./components/modals/GraphViewModal";
import { ensureDailyDigest } from "./lib/brain/digest";
import { triageInbox } from "./lib/brain/triage";
import { embedAllModels, loadModelEmbeddings } from "./lib/brain/suggestions";
import { startRulesEngine, stopRulesEngine } from "./lib/rules/engine";

function WelcomeScreen() {
  const { setCreateProjectPrompt } = useStore();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        color: "var(--ms-text-muted)",
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
      >
        <MindSpaceLogo size={64} color="var(--ms-accent)" />
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "var(--ms-text)",
              marginBottom: 8,
              letterSpacing: "-0.02em",
            }}
          >
            Welcome to MindSpace
          </h2>
          <p style={{ fontSize: 14, color: "var(--ms-text-muted)", lineHeight: 1.55 }}>
            Your thinking canvas. Create a project to get started.
          </p>
        </div>
        <button
          onClick={() => setCreateProjectPrompt(true)}
          style={{
            pointerEvents: "all",
            padding: "10px 24px",
            background: "var(--ms-accent)",
            border: "none",
            borderRadius: 9,
            color: "var(--ms-bg)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "opacity 0.1s",
          }}
          onMouseEnter={(e) => ((e.target as HTMLButtonElement).style.opacity = "0.85")}
          onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.opacity = "1")}
        >
          Create your first project
        </button>
      </motion.div>
    </div>
  );
}

function App() {
  const {
    projects,
    settingsOpen,
    quickCaptureOpen,
    editingNodeId,
    settings,
    setQuickCaptureOpen,
    sidebarOpen,
    setSidebarOpen,
    searchOpen,
    todayOpen,
    graphOpen,
    init,
  } = useStore();

  // Global keyboard layer: Cmd+K search, Cmd+Shift+G graph, Cmd+Z / Cmd+Shift+Z
  // canvas undo/redo. Undo/redo is suppressed while typing — text editors keep
  // their own history.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        const s = useStore.getState();
        s.setSearchOpen(!s.searchOpen);
        return;
      }
      if (key === "g" && e.shiftKey) {
        e.preventDefault();
        const s = useStore.getState();
        s.setGraphOpen(!s.graphOpen);
        return;
      }
      const target = e.target as HTMLElement | null;
      const inEditable = !!target?.closest?.('input, textarea, [contenteditable="true"]');
      if (inEditable) return;
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Brain background jobs, delayed so they never compete with startup:
  // daily digest, triage of items left in the Inbox, recent-triage list.
  useEffect(() => {
    const t = setTimeout(async () => {
      const s = useStore.getState();
      try {
        const digest = await ensureDailyDigest();
        s.setDigest(digest);
      } catch (err) { console.warn("Digest generation failed:", err); }
      try { await triageInbox(); } catch { /* offline */ }
      s.loadTriageRecent().catch(() => {});
      s.refreshInboxCount().catch(() => {});
      // Ambient model suggestions: backfill missing embeddings, then warm the
      // cache. Both no-op quietly when LM Studio is offline.
      await embedAllModels();
      await loadModelEmbeddings();
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  // Automations: rules engine tick loop (main window only).
  useEffect(() => {
    startRulesEngine();
    return () => stopRulesEngine();
  }, []);

  // Tray captures land in the Inbox from the capture window: refresh the
  // badge and schedule triage for the new node.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ nodeId: string }>("mindspace://captured", ({ payload }) => {
        const s = useStore.getState();
        s.refreshInboxCount().catch(() => {});
        if (s.settings.triage_enabled) {
          setTimeout(() => {
            triageInbox([payload.nodeId])
              .then(() => {
                useStore.getState().loadTriageRecent().catch(() => {});
                useStore.getState().refreshInboxCount().catch(() => {});
              })
              .catch(() => {});
          }, 1500);
        }
      });
    })();
    return () => { unlisten?.(); };
  }, []);

  // Rounded corners in windowed mode, none in fullscreen
  useEffect(() => {
    if (!isTauri()) return;
    const root = document.getElementById("root");
    if (!root) return;

    let unlisten: (() => void) | undefined;

    const syncRadius = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const full = await win.isFullscreen();
        root.style.borderRadius = full ? "0" : "16px";
        root.style.clipPath = full ? "none" : "inset(0 round 16px)";
        if (!unlisten) {
          unlisten = await win.onResized(syncRadius);
        }
      } catch { /* non-Tauri env */ }
    };

    syncRadius();
    return () => { unlisten?.(); };
  }, []);

  // Boot sequence: init store, then register global shortcut
  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      try {
        await init();
      } catch (err) {
        console.error("[MindSpace] init() failed — data may not load:", err);
      }
      if (!mounted) return;

      try {
        await unregisterAll();
        await register(
          settings.quick_capture_hotkey || "CommandOrControl+Shift+Space",
          () => {
            sounds.open();
            setQuickCaptureOpen(true);
          }
        );
      } catch (err) {
        console.warn("[MindSpace] Could not register global shortcut:", err);
      }
    };

    boot();

    return () => {
      mounted = false;
      unregisterAll().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noProjects = projects.length === 0;

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: "inherit",
        background: "var(--ms-bg)",
      }}
    >
      <motion.div
        animate={{ width: sidebarOpen ? 240 : 0, opacity: sidebarOpen ? 1 : 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ overflow: "hidden", flexShrink: 0, height: "100%" }}
      >
        <div style={{ width: 240, height: "100%" }}>
          <Sidebar />
        </div>
      </motion.div>

      <main
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Sidebar toggle button */}
        <motion.button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          animate={{ left: sidebarOpen ? 8 : 8 }}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          style={{
            position: "absolute",
            top: 14,
            left: 8,
            zIndex: 50,
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "var(--ms-surface)",
            border: "1px solid var(--ms-border)",
            color: "var(--ms-text-muted)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {sidebarOpen
            ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </motion.button>
        {noProjects ? (
          <WelcomeScreen />
        ) : (
          <Canvas />
        )}

        {/* Settings panel — slides in from right */}
        <AnimatePresence>
          {settingsOpen && <SettingsPanel key="settings" />}
        </AnimatePresence>

        {/* Quick capture overlay */}
        <AnimatePresence>
          {quickCaptureOpen && <QuickCaptureModal key="quick-capture" />}
        </AnimatePresence>

        {/* Node editor modal */}
        <AnimatePresence>
          {editingNodeId && <NodeEditorModal key="node-editor" />}
        </AnimatePresence>

        {/* Global search palette */}
        <AnimatePresence>
          {searchOpen && <SearchPalette key="search-palette" />}
        </AnimatePresence>

        {/* Today digest panel */}
        <AnimatePresence>
          {todayOpen && <TodayPanel key="today-panel" />}
        </AnimatePresence>

        {/* Knowledge graph view */}
        <AnimatePresence>
          {graphOpen && <GraphViewModal key="graph-view" />}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;
