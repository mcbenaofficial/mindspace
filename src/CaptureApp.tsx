import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, CheckSquare, Inbox } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { useStore } from "./store";
import { NodeType, NoteData, TaskData } from "./types";

type CaptureType = Extract<NodeType, "note" | "task">;

const CAPTURE_TYPES: { type: CaptureType; icon: typeof FileText; label: string }[] = [
  { type: "note", icon: FileText, label: "Note" },
  { type: "task", icon: CheckSquare, label: "Task" },
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

function dataForType(text: string, type: CaptureType): NoteData | TaskData {
  if (type === "note") {
    return {
      title: text.split("\n")[0].slice(0, 60) || "Quick Note",
      content: text ? textToTipTap(text) : "",
    } as NoteData;
  }
  return {
    title: text.slice(0, 60) || "Quick Task",
    items: [], due_date: null, priority: "medium", status: "todo",
  } as TaskData;
}

const SIZES: Record<CaptureType, { width: number; height: number }> = {
  note: { width: 260, height: 200 },
  task: { width: 280, height: 220 },
};

export function CaptureApp() {
  const [text, setText] = useState("");
  const [captureType, setCaptureType] = useState<CaptureType>("note");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Theme + settings come from the shared SQLite settings table.
  useEffect(() => {
    useStore.getState().loadSettings().catch(() => {});
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  const hide = useCallback(() => {
    setText("");
    getCurrentWindow().hide().catch(() => {});
  }, []);

  // Refocus the textarea every time the popover is shown; hide on blur/Esc.
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.onFocusChanged(({ payload: focused }) => {
      if (focused) setTimeout(() => textareaRef.current?.focus(), 50);
      else hide();
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [hide]);

  const save = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const store = useStore.getState();
      const inbox = await store.ensureInbox();
      const size = SIZES[captureType];
      const node = await store.addNode({
        canvas_id: inbox.canvasId,
        type: captureType,
        x: Math.floor(100 + Math.random() * 700),
        y: Math.floor(100 + Math.random() * 400),
        width: size.width, height: size.height,
        z_index: 0, locked: false, parent_id: null,
        data: dataForType(trimmed, captureType) as any,
      });
      await emit("mindspace://captured", { nodeId: node.id });
      hide();
    } catch (err) {
      console.warn("Capture failed:", err);
    } finally {
      setSaving(false);
    }
  }, [text, captureType, saving, hide]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); hide(); }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
  };

  return (
    <div style={{
      height: "100vh", boxSizing: "border-box", padding: 8,
      display: "flex", alignItems: "stretch",
      background: "transparent", fontFamily: "inherit",
    }}>
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", gap: 8,
        background: "var(--ms-surface, rgba(13,16,40,0.96))",
        border: "1px solid var(--ms-border, rgba(255,255,255,0.10))",
        borderRadius: 14, padding: 12,
        boxShadow: "0 8px 48px rgba(0,0,0,0.55)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Inbox size={14} style={{ color: "var(--ms-accent, #7c8cff)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ms-text, #e8eaf2)", flex: 1 }}>
            Capture to Inbox
          </span>
          {CAPTURE_TYPES.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => setCaptureType(type)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 7, fontSize: 11, cursor: "pointer",
                border: "1px solid " + (captureType === type ? "var(--ms-accent-25, rgba(124,140,255,0.25))" : "var(--ms-border, rgba(255,255,255,0.10))"),
                background: captureType === type ? "var(--ms-accent-15, rgba(124,140,255,0.15))" : "transparent",
                color: captureType === type ? "var(--ms-accent, #7c8cff)" : "var(--ms-text-muted, #8a8f98)",
              }}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Dump a thought — it lands in your Inbox and gets filed automatically…"
          style={{
            flex: 1, resize: "none", outline: "none",
            background: "var(--ms-bg, rgba(0,0,0,0.25))",
            border: "1px solid var(--ms-border, rgba(255,255,255,0.08))",
            borderRadius: 9, padding: 10,
            color: "var(--ms-text, #e8eaf2)", fontSize: 13, lineHeight: 1.5,
            fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", fontSize: 10.5, color: "var(--ms-text-muted, #8a8f98)" }}>
          <span style={{ flex: 1 }}>Enter to save · Shift+Enter for a new line · Esc to close</span>
          <span>{saving ? "Saving…" : ""}</span>
        </div>
      </div>
    </div>
  );
}

export default CaptureApp;
