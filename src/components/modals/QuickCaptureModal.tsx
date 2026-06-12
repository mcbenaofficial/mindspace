import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, CheckSquare, Mic, LayoutGrid, Inbox, LocateFixed } from "lucide-react";
import { useStore } from "../../store";
import { sounds } from "../../lib/sound";
import { triageInbox } from "../../lib/brain/triage";
import { NodeType, NoteData, TaskData, VoiceData } from "../../types";

type CaptureType = Extract<NodeType, "note" | "task" | "voice">;

const CAPTURE_TYPES: { type: CaptureType; icon: React.ReactNode; label: string }[] = [
  { type: "note", icon: <FileText size={13} />, label: "Note" },
  { type: "task", icon: <CheckSquare size={13} />, label: "Task" },
  { type: "voice", icon: <Mic size={13} />, label: "Voice" },
];

function textToTipTap(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: text.split(/\n+/).filter(Boolean).map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    })),
  });
}

function defaultDataForType(text: string, type: CaptureType): NoteData | TaskData | VoiceData {
  switch (type) {
    case "note":
      // First line becomes the title; the full dump goes into the note body.
      return {
        title: text.split("\n")[0].slice(0, 60) || "Quick Note",
        content: text ? textToTipTap(text) : "",
      } as NoteData;
    case "task":
      return {
        title: text.slice(0, 60) || "Quick Task",
        items: [],
        due_date: null,
        priority: "medium",
        status: "todo",
      } as TaskData;
    case "voice":
      return { transcript: text, audio_url: null } as VoiceData;
  }
}

const DEFAULT_NODE_SIZES: Record<CaptureType, { width: number; height: number }> = {
  note: { width: 260, height: 200 },
  task: { width: 280, height: 220 },
  voice: { width: 260, height: 180 },
};

export function QuickCaptureModal() {
  const {
    quickCaptureOpen,
    setQuickCaptureOpen,
    activeCanvasId,
    addNode,
    nodes,
  } = useStore();

  const { ensureInbox, refreshInboxCount, settings } = useStore();
  const [text, setText] = useState("");
  const [captureType, setCaptureType] = useState<CaptureType>("note");
  const [destination, setDestination] = useState<"inbox" | "current">("inbox");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus when opened
  useEffect(() => {
    if (quickCaptureOpen) {
      setText("");
      setCaptureType("note");
      setDestination("inbox");
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
  }, [quickCaptureOpen]);

  const close = useCallback(() => {
    setQuickCaptureOpen(false);
  }, [setQuickCaptureOpen]);

  const canCapture = destination === "inbox" || !!activeCanvasId;

  const handleCreate = useCallback(async () => {
    let targetCanvasId = activeCanvasId;
    if (destination === "inbox") {
      const inbox = await ensureInbox();
      targetCanvasId = inbox.canvasId;
    }
    if (!targetCanvasId) return;
    const x = Math.floor(100 + Math.random() * 700);
    const y = Math.floor(100 + Math.random() * 400);
    const maxZ = nodes.reduce((acc, n) => Math.max(acc, n.z_index), 0);
    const { width, height } = DEFAULT_NODE_SIZES[captureType];
    const node = await addNode({
      canvas_id: targetCanvasId,
      type: captureType,
      x,
      y,
      width,
      height,
      z_index: maxZ + 1,
      locked: false,
      parent_id: null,
      data: defaultDataForType(text.trim(), captureType),
    });
    sounds.spawn();
    close();
    if (destination === "inbox") {
      refreshInboxCount().catch(() => {});
      if (settings.triage_enabled) {
        // Give the embed/index hooks a moment, then auto-file this capture.
        setTimeout(() => { triageInbox([node.id]).catch(() => {}); }, 1500);
      }
    }
  }, [activeCanvasId, destination, captureType, text, nodes, addNode, close, ensureInbox, refreshInboxCount, settings.triage_enabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canCapture) {
          handleCreate();
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    },
    [handleCreate, close, canCapture]
  );

  return (
    <AnimatePresence>
      {quickCaptureOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="qc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 900,
              background: "rgba(0,0,0,0.45)",
            }}
          />

          {/* Panel */}
          <motion.div
            key="qc-panel"
            initial={{ opacity: 0, y: -24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              top: "18%",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 901,
              width: 500,
              maxWidth: "92vw",
              background: "var(--ms-surface)",
              border: "1px solid var(--ms-border)",
              borderRadius: 14,
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
              overflow: "hidden",
            }}
          >
            {/* Type selector */}
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "14px 16px 10px",
                borderBottom: "1px solid var(--ms-border)",
              }}
            >
              {CAPTURE_TYPES.map(({ type, icon, label }) => (
                <button
                  key={type}
                  onClick={() => setCaptureType(type)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 20,
                    border: "1.5px solid",
                    borderColor: captureType === type ? "var(--ms-accent)" : "var(--ms-border)",
                    background: captureType === type
                      ? "color-mix(in srgb, var(--ms-accent) 18%, transparent)"
                      : "transparent",
                    color: captureType === type ? "var(--ms-accent)" : "var(--ms-text-muted)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: captureType === type ? 700 : 400,
                    transition: "all 0.12s ease",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
                  {label}
                </button>
              ))}

              {/* Destination: Inbox (auto-triaged) vs current canvas */}
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {([
                  { dest: "inbox" as const, icon: <Inbox size={12} />, label: "Inbox" },
                  { dest: "current" as const, icon: <LocateFixed size={12} />, label: "Here" },
                ]).map(({ dest, icon, label }) => (
                  <button
                    key={dest}
                    onClick={() => setDestination(dest)}
                    title={dest === "inbox" ? "Capture to Inbox — AI files it for you" : "Capture onto the current canvas"}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                      borderRadius: 16, border: "1px solid",
                      borderColor: destination === dest ? "var(--ms-accent)" : "var(--ms-border)",
                      background: destination === dest ? "color-mix(in srgb, var(--ms-accent) 14%, transparent)" : "transparent",
                      color: destination === dest ? "var(--ms-accent)" : "var(--ms-text-muted)",
                      cursor: "pointer", fontSize: 11, fontWeight: destination === dest ? 700 : 400,
                    }}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea or no-canvas message */}
            {!canCapture ? (
              <div
                style={{
                  padding: "28px 20px",
                  textAlign: "center",
                  color: "var(--ms-text-muted)",
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}><LayoutGrid size={24} color="var(--ms-text-muted)" /></div>
                No canvas open — create or select one first.
              </div>
            ) : (
              <div style={{ padding: "14px 16px" }}>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What's on your mind…"
                  rows={3}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--ms-text)",
                    fontSize: 16,
                    lineHeight: 1.6,
                    resize: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            )}

            {/* Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px 14px",
                borderTop: "1px solid var(--ms-border)",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--ms-text-muted)" }}>
                {canCapture ? (
                  <>
                    <kbd style={{ background: "var(--ms-border)", borderRadius: 4, padding: "2px 5px", fontSize: 10 }}>Enter</kbd>
                    {" "}to capture{destination === "inbox" ? " → Inbox (auto-filed)" : ""} &nbsp;·&nbsp;{" "}
                    <kbd style={{ background: "var(--ms-border)", borderRadius: 4, padding: "2px 5px", fontSize: 10 }}>Esc</kbd>
                    {" "}to close
                  </>
                ) : (
                  <kbd style={{ background: "var(--ms-border)", borderRadius: 4, padding: "2px 5px", fontSize: 10 }}>Esc</kbd>
                )}
              </span>

              {canCapture && (
                <button
                  onClick={handleCreate}
                  disabled={!text.trim()}
                  style={{
                    padding: "7px 18px",
                    background: "var(--ms-accent)",
                    border: "none",
                    borderRadius: 8,
                    color: "var(--ms-bg)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: text.trim() ? "pointer" : "not-allowed",
                    opacity: text.trim() ? 1 : 0.5,
                    transition: "opacity 0.1s",
                  }}
                >
                  Capture
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default QuickCaptureModal;
