import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  FileText, CheckSquare, CalendarDays, Clock, Bot, Mic, Link2, Globe,
  Send, Volume2, StopCircle, X, Undo2, Redo2, ExternalLink, BookOpen, PlayCircle,
  Plus, MessageSquare, Trash2 as TrashIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../../lib/tauri-compat";
import { useStore } from "../../store";
import { sounds } from "../../lib/sound";
import {
  NoteData,
  TaskData,
  TaskItem as TaskItemType,
  AiChatData,
  AiChatConversation,
  AiChatMessage,
  VoiceData,
  ProjectHubData,
  ClockData,
  WebLinkData,
  MindNode,
} from "../../types";

// ─── helpers ───────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function padTwo(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

function formatLiveTime(d: Date): string {
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}:${padTwo(d.getSeconds())}`;
}

function formatHMS(ms: number, showMs = false): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const centis = Math.floor((ms % 1000) / 10);
  const base = `${padTwo(h)}:${padTwo(m)}:${padTwo(s)}`;
  return showMs ? `${base}.${padTwo(centis)}` : base;
}


const PRIORITY_COLORS: Record<string, string> = {
  low: "#4ade80",
  medium: "#facc15",
  high: "#f87171",
};

// ─── shared modal input / button styles ────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "var(--ms-border)",
  border: "1px solid var(--ms-border)",
  borderRadius: 6,
  color: "var(--ms-text)",
  fontSize: 13,
  padding: "7px 10px",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--ms-border)",
  background: "var(--ms-border)",
  color: "var(--ms-text)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
};

// ─── Note editor ───────────────────────────────────────────────────────────

const toolbarSeparator: React.CSSProperties = {
  width: 1,
  alignSelf: "stretch",
  background: "var(--ms-border)",
  margin: "0 4px",
  flexShrink: 0,
};

function NoteEditor({ node }: { node: MindNode }) {
  const { updateNode } = useStore();
  const noteData = node.data as NoteData;
  const [title, setTitle] = useState(noteData.title);
  const [editorFocused, setEditorFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest data/content refs — the debounced onUpdate closure must never spread
  // a stale noteData snapshot back into the store.
  const noteDataRef = useRef(noteData);
  const pendingContentRef = useRef<string | null>(null);

  useEffect(() => {
    noteDataRef.current = noteData;
  }, [noteData]);

  const flushContent = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingContentRef.current === null) return;
    const content = pendingContentRef.current;
    pendingContentRef.current = null;
    updateNode(node.id, { data: { ...noteDataRef.current, content } });
    sounds.save();
  }, [node.id, updateNode]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Start writing…" }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: (() => {
      try {
        return noteData.content ? JSON.parse(noteData.content) : "";
      } catch {
        return noteData.content || "";
      }
    })(),
    onUpdate({ editor }) {
      pendingContentRef.current = JSON.stringify(editor.getJSON());
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flushContent, 500);
    },
  });

  // Sync genuinely external content changes into the editor; never while the
  // user has unsaved typing (would clobber it and reset the cursor).
  useEffect(() => {
    if (!editor || pendingContentRef.current !== null) return;
    const current = JSON.stringify(editor.getJSON());
    if ((noteData.content || "") === current) return;
    try {
      editor.commands.setContent(noteData.content ? JSON.parse(noteData.content) : "");
    } catch {
      editor.commands.setContent(noteData.content || "");
    }
  }, [noteData.content, editor]);

  const saveTitle = useCallback(() => {
    if (title !== noteDataRef.current.title) {
      updateNode(node.id, { data: { ...noteDataRef.current, title } });
    }
  }, [title, node.id, updateNode]);

  // Flush (not discard) any pending save when the modal closes mid-debounce.
  useEffect(() => () => { flushContent(); }, [flushContent]);

  const charCount = editor ? editor.getText().length : 0;
  const wordCount = editor
    ? editor.getText().split(/\s+/).filter((w) => w.length > 0).length
    : 0;

  const toolbarBtn = (active: boolean): React.CSSProperties => ({
    padding: "3px 7px",
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    transition: "all 0.1s",
    background: active
      ? "color-mix(in srgb, var(--ms-accent) 20%, transparent)"
      : "transparent",
    color: active ? "var(--ms-accent)" : "var(--ms-text-muted)",
    border: active
      ? "1px solid color-mix(in srgb, var(--ms-accent) 40%, transparent)"
      : "1px solid transparent",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      {/* Title */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--ms-border)", flexShrink: 0 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveTitle(); } }}
          placeholder="Untitled"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--ms-text)",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* TipTap toolbar */}
      {editor && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "6px 20px",
            borderBottom: "1px solid var(--ms-border)",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {/* Group 1: inline marks */}
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
            style={toolbarBtn(editor.isActive("bold"))} title="Bold (⌘B)">B</button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
            style={{ ...toolbarBtn(editor.isActive("italic")), fontStyle: "italic" }} title="Italic (⌘I)">I</button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }}
            style={{ ...toolbarBtn(editor.isActive("strike")), textDecoration: "line-through" }} title="Strikethrough (⌘⇧X)">S</button>

          <div style={toolbarSeparator} />

          {/* Group 2: headings */}
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run(); }}
            style={toolbarBtn(editor.isActive("heading", { level: 1 }))} title="Heading 1 (⌘⌥1)">H1</button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }}
            style={toolbarBtn(editor.isActive("heading", { level: 2 }))} title="Heading 2 (⌘⌥2)">H2</button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run(); }}
            style={toolbarBtn(editor.isActive("heading", { level: 3 }))} title="Heading 3 (⌘⌥3)">H3</button>

          <div style={toolbarSeparator} />

          {/* Group 3: lists */}
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
            style={toolbarBtn(editor.isActive("bulletList"))} title="Bullet List (⌘⇧8)">UL</button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
            style={toolbarBtn(editor.isActive("orderedList"))} title="Ordered List (⌘⇧7)">OL</button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleTaskList().run(); }}
            style={toolbarBtn(editor.isActive("taskList"))} title="Task List">Task</button>

          <div style={toolbarSeparator} />

          {/* Group 4: blocks */}
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCode().run(); }}
            style={toolbarBtn(editor.isActive("code"))} title="Inline Code (⌘E)">&lt;/&gt;</button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run(); }}
            style={toolbarBtn(editor.isActive("blockquote"))} title="Blockquote (⌘⇧B)">❝</button>

          <div style={toolbarSeparator} />

          {/* Group 5: history */}
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().undo().run(); }}
            style={toolbarBtn(false)} title="Undo (⌘Z)">
            <Undo2 size={12} />
          </button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().redo().run(); }}
            style={toolbarBtn(false)} title="Redo (⌘⇧Z)">
            <Redo2 size={12} />
          </button>
        </div>
      )}

      {/* Editor area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "4px 20px",
          border: editorFocused ? "1px solid color-mix(in srgb, var(--ms-accent) 40%, transparent)" : "1px solid transparent",
          borderTop: "none",
          borderBottom: "none",
          transition: "border-color 0.15s",
        }}
        onClick={() => editor?.chain().focus().run()}
        onFocus={() => setEditorFocused(true)}
        onBlur={() => setEditorFocused(false)}
      >
        <div style={{ minHeight: 300 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Footer: word + char count */}
      <div
        style={{
          padding: "6px 20px",
          borderTop: "1px solid var(--ms-border)",
          fontSize: 11,
          color: "var(--ms-text-muted)",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {wordCount} word{wordCount !== 1 ? "s" : ""} · {charCount} char{charCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// ─── Task editor ───────────────────────────────────────────────────────────

function TaskEditor({ node }: { node: MindNode }) {
  const { updateNode } = useStore();
  const taskData = node.data as TaskData;

  const save = useCallback(
    (updates: Partial<TaskData>) => {
      updateNode(node.id, { data: { ...taskData, ...updates } });
    },
    [node.id, taskData, updateNode]
  );

  const [newItemText, setNewItemText] = useState("");

  const addItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    const item: TaskItemType = { id: uid(), text, checked: false };
    save({ items: [...taskData.items, item] });
    setNewItemText("");
    sounds.spawn();
  };

  const removeItem = (id: string) => {
    save({ items: taskData.items.filter((i) => i.id !== id) });
    sounds.delete();
  };

  const toggleItem = (id: string) => {
    const updated = taskData.items.map((i) =>
      i.id === id ? { ...i, checked: !i.checked } : i
    );
    save({ items: updated });
    sounds.click();
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= taskData.items.length) return;
    const arr = [...taskData.items];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    save({ items: arr });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", padding: "20px 24px", gap: 20 }}>
      {/* Title */}
      <div>
        <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Title</label>
        <input
          defaultValue={taskData.title}
          onBlur={(e) => save({ title: e.target.value })}
          style={{ ...inputStyle, fontSize: 18, fontWeight: 700, background: "transparent", border: "none", borderBottom: "2px solid var(--ms-border)", borderRadius: 0, padding: "4px 0" }}
          placeholder="Untitled Task"
        />
      </div>

      {/* Priority & Status */}
      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Priority</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["low", "medium", "high"] as const).map((p) => (
              <button
                key={p}
                onClick={() => save({ priority: p })}
                style={{
                  ...btnStyle,
                  flex: 1,
                  background: taskData.priority === p ? PRIORITY_COLORS[p] : "var(--ms-border)",
                  color: taskData.priority === p ? "#000" : "var(--ms-text)",
                  border: "1px solid transparent",
                  textTransform: "capitalize",
                  fontWeight: taskData.priority === p ? 700 : 400,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["todo", "in-progress", "done"] as const).map((s) => (
              <button
                key={s}
                onClick={() => save({ status: s })}
                style={{
                  ...btnStyle,
                  flex: 1,
                  background: taskData.status === s ? "var(--ms-accent)" : "var(--ms-border)",
                  color: taskData.status === s ? "var(--ms-bg)" : "var(--ms-text)",
                  border: "1px solid transparent",
                  fontWeight: taskData.status === s ? 700 : 400,
                  fontSize: 11,
                }}
              >
                {s === "todo" ? "To Do" : s === "in-progress" ? "In Progress" : "Done"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Due date */}
      <div>
        <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Due Date</label>
        <input
          type="date"
          value={taskData.due_date ?? ""}
          onChange={(e) => save({ due_date: e.target.value || null })}
          style={{
            ...inputStyle,
            colorScheme: "dark",
            width: "auto",
          }}
        />
      </div>

      {/* Checklist */}
      <div style={{ flex: 1 }}>
        <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Checklist ({taskData.items.filter((i) => i.checked).length}/{taskData.items.length})
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {taskData.items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: "var(--ms-border)",
                borderRadius: 6,
              }}
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => toggleItem(item.id)}
                style={{ accentColor: "var(--ms-accent)", width: 15, height: 15, cursor: "pointer", flexShrink: 0 }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: item.checked ? "var(--ms-text-muted)" : "var(--ms-text)",
                  textDecoration: item.checked ? "line-through" : "none",
                }}
              >
                {item.text}
              </span>
              <button
                onClick={() => moveItem(idx, -1)}
                disabled={idx === 0}
                style={{ ...btnStyle, padding: "2px 7px", opacity: idx === 0 ? 0.3 : 1 }}
                title="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => moveItem(idx, 1)}
                disabled={idx === taskData.items.length - 1}
                style={{ ...btnStyle, padding: "2px 7px", opacity: idx === taskData.items.length - 1 ? 0.3 : 1 }}
                title="Move down"
              >
                ↓
              </button>
              <button
                onClick={() => removeItem(item.id)}
                style={{ ...btnStyle, padding: "2px 7px", color: "#f87171", borderColor: "transparent", display: "flex", alignItems: "center" }}
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Add item */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
            placeholder="Add item…"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={addItem}
            style={{ ...btnStyle, background: "var(--ms-accent)", color: "var(--ms-bg)", border: "none", padding: "7px 14px", fontWeight: 600 }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar editor ────────────────────────────────────────────────────────

function CalendarEditor({ node: _node }: { node: MindNode }) {
  const { nodes } = useStore();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const taskDueDates = React.useMemo(() =>
    nodes
      .filter((n) => n.type === "task")
      .map((n) => { const td = n.data as TaskData; return td.due_date ? new Date(td.due_date) : null; })
      .filter((d): d is Date => d !== null),
    [nodes]
  );

  const calendarDays = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "24px 32px", gap: 16 }}>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => setCurrentMonth((m) => subMonths(m, 1))} style={{ ...btnStyle, fontSize: 20, padding: "4px 12px" }}>‹</button>
        <span style={{ fontSize: 20, fontWeight: 700, color: "var(--ms-text)" }}>
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <button onClick={() => setCurrentMonth((m) => addMonths(m, 1))} style={{ ...btnStyle, fontSize: 20, padding: "4px 12px" }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--ms-text-muted)", padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Days */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, flex: 1 }}>
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const hasTasks = taskDueDates.some((d) => isSameDay(d, day));
          return (
            <div
              key={day.toISOString()}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 4px",
                borderRadius: 8,
                background: today ? "var(--ms-accent)" : "var(--ms-border)",
                opacity: inMonth ? 1 : 0.3,
                minHeight: 52,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: today ? 700 : 400, color: today ? "var(--ms-bg)" : "var(--ms-text)" }}>
                {format(day, "d")}
              </span>
              {hasTasks && (
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: today ? "var(--ms-bg)" : "var(--ms-accent)", marginTop: 3 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Clock editor ───────────────────────────────────────────────────────────

function ClockEditor({ node }: { node: MindNode }) {
  const clockData = node.data as ClockData;
  type TabType = "clock" | "stopwatch" | "timer";
  const [activeTab, setActiveTab] = useState<TabType>(clockData.mode || "clock");
  const [clockTime, setClockTime] = useState(() => new Date());
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0);
  const swStartRef = useRef<number | null>(null);
  const swBaseRef = useRef(0);
  const initialTimerSecs = clockData.timer_seconds || 300;
  const [timerMinutes, setTimerMinutes] = useState(Math.floor(initialTimerSecs / 60));
  const [timerSeconds, setTimerSeconds] = useState(initialTimerSecs % 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(initialTimerSecs * 1000);
  const timerStartRef = useRef<number | null>(null);
  const timerBaseRef = useRef(initialTimerSecs * 1000);

  useEffect(() => {
    if (activeTab !== "clock") return;
    const id = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [activeTab]);

  useEffect(() => {
    if (!swRunning) return;
    const id = setInterval(() => {
      if (swStartRef.current !== null) setSwElapsed(swBaseRef.current + Date.now() - swStartRef.current);
    }, 50);
    return () => clearInterval(id);
  }, [swRunning]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      if (timerStartRef.current !== null) {
        const remaining = Math.max(0, timerBaseRef.current - (Date.now() - timerStartRef.current));
        setTimerRemaining(remaining);
        if (remaining === 0) { setTimerRunning(false); timerStartRef.current = null; sounds.complete(); }
      }
    }, 50);
    return () => clearInterval(id);
  }, [timerRunning]);

  const ctrlBtn: React.CSSProperties = { ...btnStyle, padding: "10px 24px", fontSize: 14, fontWeight: 600 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", gap: 0 }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, padding: "24px 24px 16px", width: "100%" }}>
        {(["clock", "stopwatch", "timer"] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "10px 0",
              background: activeTab === tab ? "var(--ms-accent)" : "var(--ms-border)",
              border: "none",
              borderRadius: 8,
              color: activeTab === tab ? "var(--ms-bg)" : "var(--ms-text-muted)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {tab === "clock" ? "Clock" : tab === "stopwatch" ? "Stopwatch" : "Timer"}
          </button>
        ))}
      </div>

      {/* Clock face */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        {activeTab === "clock" && (
          <>
            <div style={{ fontSize: 64, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "var(--ms-text)", letterSpacing: 2 }}>
              {formatLiveTime(clockTime)}
            </div>
            <div style={{ fontSize: 16, color: "var(--ms-text-muted)" }}>
              {clockTime.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </div>
          </>
        )}

        {activeTab === "stopwatch" && (
          <>
            <div style={{ fontSize: 56, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "var(--ms-text)", letterSpacing: 2 }}>
              {formatHMS(swElapsed, true)}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                style={{ ...ctrlBtn, background: swRunning ? "#f87171" : "var(--ms-accent)", color: "var(--ms-bg)", border: "none" }}
                onClick={() => {
                  if (swRunning) { swBaseRef.current = swElapsed; swStartRef.current = null; setSwRunning(false); }
                  else { swStartRef.current = Date.now(); setSwRunning(true); }
                }}
              >
                {swRunning ? "Stop" : "Start"}
              </button>
              <button style={ctrlBtn} onClick={() => { setSwRunning(false); swStartRef.current = null; swBaseRef.current = 0; setSwElapsed(0); }}>
                Reset
              </button>
            </div>
          </>
        )}

        {activeTab === "timer" && (
          <>
            <div style={{ fontSize: 56, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: timerRemaining === 0 && timerBaseRef.current > 0 ? "#f87171" : "var(--ms-text)", letterSpacing: 2 }}>
              {formatHMS(timerRemaining)}
            </div>
            {!timerRunning && timerRemaining === 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="number" min={0} max={99} value={timerMinutes} onChange={(e) => setTimerMinutes(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
                  style={{ ...inputStyle, width: 60, textAlign: "center" }} />
                <span style={{ color: "var(--ms-text-muted)", fontSize: 16 }}>m</span>
                <input type="number" min={0} max={59} value={timerSeconds} onChange={(e) => setTimerSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  style={{ ...inputStyle, width: 60, textAlign: "center" }} />
                <span style={{ color: "var(--ms-text-muted)", fontSize: 16 }}>s</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                style={{ ...ctrlBtn, background: timerRunning ? "#f87171" : "var(--ms-accent)", color: "var(--ms-bg)", border: "none" }}
                onClick={() => {
                  if (timerRunning) { timerBaseRef.current = timerRemaining; timerStartRef.current = null; setTimerRunning(false); }
                  else {
                    if (timerRemaining === 0) {
                      const total = (timerMinutes * 60 + timerSeconds) * 1000;
                      timerBaseRef.current = total;
                      setTimerRemaining(total);
                      setTimeout(() => { timerStartRef.current = Date.now(); setTimerRunning(true); }, 0);
                    } else { timerStartRef.current = Date.now(); setTimerRunning(true); }
                  }
                }}
              >
                {timerRunning ? "Stop" : "Start"}
              </button>
              <button
                style={ctrlBtn}
                onClick={() => {
                  setTimerRunning(false); timerStartRef.current = null;
                  const total = (timerMinutes * 60 + timerSeconds) * 1000;
                  timerBaseRef.current = total; setTimerRemaining(total);
                }}
              >
                Reset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AI Chat editor ───────────────────────────────────────────────────────────

function normalizeChatDataModal(raw: any): AiChatData {
  if (Array.isArray(raw?.conversations)) return raw as AiChatData;
  const msgs: AiChatMessage[] = raw?.messages || [];
  return {
    conversations: msgs.length > 0 ? [{
      id: uid(), title: msgs.find((m: AiChatMessage) => m.role === "user")?.content.slice(0, 50) || "Chat",
      messages: msgs, created_at: msgs[0].timestamp, updated_at: msgs[msgs.length - 1].timestamp,
    }] : [],
    active_conversation_id: null,
    model: raw?.model || "", system_prompt: raw?.system_prompt || "",
  };
}

function relativeTimeModal(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function AiChatEditor({ node }: { node: MindNode }) {
  const { updateNode, settings } = useStore();
  const chatData = normalizeChatDataModal(node.data);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv: AiChatConversation | null =
    chatData.conversations.find(c => c.id === chatData.active_conversation_id) ?? null;
  const sortedConvs = [...chatData.conversations].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages.length, isTyping]);

  // Persist migration once
  useEffect(() => {
    if (!Array.isArray((node.data as any)?.conversations)) {
      updateNode(node.id, { data: chatData });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newConversation = useCallback(() => {
    const conv: AiChatConversation = {
      id: uid(), title: "New conversation", messages: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    updateNode(node.id, { data: { ...chatData, conversations: [conv, ...chatData.conversations], active_conversation_id: conv.id } });
  }, [chatData, node.id, updateNode]);

  const openConversation = useCallback((id: string) => {
    updateNode(node.id, { data: { ...chatData, active_conversation_id: id } });
  }, [chatData, node.id, updateNode]);

  const deleteConversation = useCallback((convId: string) => {
    const remaining = chatData.conversations.filter(c => c.id !== convId);
    updateNode(node.id, {
      data: {
        ...chatData, conversations: remaining,
        active_conversation_id: chatData.active_conversation_id === convId
          ? (remaining[0]?.id ?? null) : chatData.active_conversation_id,
      },
    });
  }, [chatData, node.id, updateNode]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isTyping || !activeConv) return;
    const userMsg: AiChatMessage = { id: uid(), role: "user", content: text, timestamp: new Date().toISOString() };
    const isFirst = activeConv.messages.length === 0;
    const updatedConv: AiChatConversation = {
      ...activeConv,
      title: isFirst ? text.slice(0, 50) : activeConv.title,
      messages: [...activeConv.messages, userMsg],
      updated_at: new Date().toISOString(),
    };
    const patchData = (msgs: AiChatMessage[]): AiChatData => ({
      ...chatData,
      conversations: chatData.conversations.map(c => c.id === activeConv.id ? { ...updatedConv, messages: msgs } : c),
    });
    await updateNode(node.id, { data: patchData(updatedConv.messages) });
    setInputValue("");
    setIsTyping(true);
    try {
      type ApiMsg = { role: "user" | "assistant" | "system"; content: string };
      const apiMessages: ApiMsg[] = updatedConv.messages.map(m => ({ role: m.role, content: m.content }));
      if (chatData.system_prompt) apiMessages.unshift({ role: "system", content: chatData.system_prompt });
      const url = (settings.lmstudio_url || "http://127.0.0.1:1234") + "/v1/chat/completions";
      const payload = JSON.stringify({ model: settings.lmstudio_model || chatData.model || "local-model", messages: apiMessages, temperature: 0.7, max_tokens: settings.lmstudio_max_tokens || 1024 });
      let json: any;
      if (isTauri()) {
        const res = await invoke<{ status: number; body: string }>("http_post", { url, body: payload, apiKey: null });
        if (res.status < 200 || res.status >= 300) throw new Error(`API error ${res.status}`);
        json = JSON.parse(res.body);
      } else {
        const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        json = await resp.json();
      }
      const assistantMsg: AiChatMessage = { id: uid(), role: "assistant", content: json.choices?.[0]?.message?.content ?? "(no response)", timestamp: new Date().toISOString() };
      await updateNode(node.id, { data: patchData([...updatedConv.messages, assistantMsg]) });
    } catch (err) {
      const errMsg: AiChatMessage = { id: uid(), role: "assistant", content: `Error: ${(err as Error).message}`, timestamp: new Date().toISOString() };
      await updateNode(node.id, { data: patchData([...updatedConv.messages, errMsg]) });
    } finally {
      setIsTyping(false);
    }
  }, [inputValue, isTyping, activeConv, chatData, node.id, updateNode, settings]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* System prompt + model bar */}
      <div style={{ borderBottom: "1px solid var(--ms-border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button onClick={() => setSystemOpen(v => !v)}
            style={{ flex: 1, background: "none", border: "none", padding: "10px 20px", color: "var(--ms-text-muted)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
            <span style={{ transition: "transform 0.15s", transform: systemOpen ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▶</span>
            System Prompt
            {chatData.system_prompt && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ms-accent)" }}>• set</span>}
          </button>
          <span style={{ fontSize: 11, color: "var(--ms-text-muted)", padding: "0 20px", flexShrink: 0 }}>
            {settings.lmstudio_model || chatData.model || "local-model"}
          </span>
        </div>
        <AnimatePresence>
          {systemOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
              <div style={{ padding: "0 20px 12px" }}>
                <textarea
                  defaultValue={chatData.system_prompt}
                  onBlur={e => updateNode(node.id, { data: { ...chatData, system_prompt: e.target.value } })}
                  placeholder="You are a helpful assistant…"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* Sidebar — conversation list */}
        <div style={{ width: 210, borderRight: "1px solid var(--ms-border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <button onClick={newConversation}
            style={{ margin: "10px 10px 6px", padding: "8px 12px", background: "var(--ms-accent)", border: "none", borderRadius: 8, color: "var(--ms-bg)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={13} /> New Chat
          </button>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 10px" }}>
            {sortedConvs.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--ms-text-muted)", textAlign: "center", padding: "20px 12px", fontStyle: "italic" }}>
                No conversations yet
              </div>
            )}
            {sortedConvs.map(conv => {
              const isActive = conv.id === chatData.active_conversation_id;
              return (
                <div key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  onMouseEnter={() => setHoveredConvId(conv.id)}
                  onMouseLeave={() => setHoveredConvId(null)}
                  style={{ padding: "9px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2, background: isActive ? "color-mix(in srgb, var(--ms-accent) 15%, var(--ms-border))" : hoveredConvId === conv.id ? "var(--ms-border)" : "transparent", border: isActive ? "1px solid color-mix(in srgb, var(--ms-accent) 30%, transparent)" : "1px solid transparent", transition: "background 0.1s", position: "relative" }}>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? "var(--ms-text)" : "var(--ms-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 18 }}>
                    {conv.title}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--ms-text-muted)", marginTop: 3 }}>
                    {conv.messages.length} msg · {relativeTimeModal(conv.updated_at)}
                  </div>
                  {hoveredConvId === conv.id && (
                    <button onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                      style={{ position: "absolute", top: 8, right: 6, background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", padding: 2, borderRadius: 4 }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#f87171"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"}>
                      <TrashIcon size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main chat area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {!activeConv ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <MessageSquare size={36} color="var(--ms-border)" strokeWidth={1.2} />
              <span style={{ fontSize: 13, color: "var(--ms-text-muted)" }}>Select a conversation or start a new one</span>
              <button onClick={newConversation}
                style={{ padding: "8px 20px", background: "var(--ms-accent)", border: "none", borderRadius: 8, color: "var(--ms-bg)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={14} /> New Chat
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, userSelect: "text", WebkitUserSelect: "text" }}>
                {activeConv.messages.length === 0 && !isTyping && (
                  <div style={{ textAlign: "center", color: "var(--ms-text-muted)", fontSize: 14, marginTop: 32, fontStyle: "italic" }}>
                    Start a conversation…
                  </div>
                )}
                {activeConv.messages.map(msg => {
                  const isUser = msg.role === "user";
                  return (
                    <div key={msg.id} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "75%", padding: "10px 14px",
                        borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        background: isUser ? "var(--ms-accent)" : "var(--ms-border)",
                        color: isUser ? "var(--ms-bg)" : "var(--ms-text)",
                        fontSize: 14, lineHeight: 1.55, wordBreak: "break-word", userSelect: "text",
                      }}>
                        {isUser ? msg.content : (
                          <div className="ms-chat-md">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <AnimatePresence>
                  {isTyping && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: "flex", justifyContent: "flex-start" }}>
                      <div style={{ background: "var(--ms-border)", borderRadius: "14px 14px 14px 4px", padding: "10px 16px", display: "flex", gap: 5, alignItems: "center" }}>
                        {[0, 1, 2].map(i => (
                          <motion.div key={i} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                            style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ms-text-muted)" }} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--ms-border)", display: "flex", gap: 10, flexShrink: 0 }}>
                <input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Message…"
                  disabled={isTyping}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={handleSend} disabled={isTyping || !inputValue.trim()}
                  style={{ ...btnStyle, background: "var(--ms-accent)", color: "var(--ms-bg)", border: "none", padding: "7px 14px", fontWeight: 700, display: "flex", alignItems: "center", opacity: isTyping || !inputValue.trim() ? 0.5 : 1, cursor: isTyping || !inputValue.trim() ? "not-allowed" : "pointer" }}>
                  <Send size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Voice editor ────────────────────────────────────────────────────────────

function VoiceEditor({ node }: { node: MindNode }) {
  const { updateNode, settings } = useStore();
  const voiceData = node.data as VoiceData;
  const [isRecording, setIsRecording] = useState(false);
  const [isSttLoading, setIsSttLoading] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sendToStt = useCallback(
    async (blob: Blob) => {
      if (!settings.openrouter_api_key) { setError("OpenRouter API key not set in Settings"); return; }
      setIsSttLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", blob, "recording.webm");
        formData.append("model", "google/chirp-3");
        const resp = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${settings.openrouter_api_key}` },
          body: formData,
        });
        if (!resp.ok) throw new Error(`STT ${resp.status}: ${await resp.text()}`);
        const json = await resp.json();
        const text: string = json.text || "";
        const combined = voiceData.transcript ? voiceData.transcript + "\n" + text : text;
        await updateNode(node.id, { data: { ...voiceData, transcript: combined } });
        sounds.save();
      } catch (err) {
        setError((err as Error).message);
        sounds.error();
      } finally {
        setIsSttLoading(false);
      }
    },
    [settings.openrouter_api_key, voiceData, node.id, updateNode]
  );

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await sendToStt(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError("Microphone access denied");
    }
  }, [sendToStt]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleTts = useCallback(async () => {
    if (!voiceData.transcript || isTtsLoading) return;
    if (!settings.openrouter_api_key) { setError("OpenRouter API key not set in Settings"); return; }
    setError(null);
    setIsTtsLoading(true);
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.openrouter_api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-4o-mini-tts-2025-12-15", input: voiceData.transcript, voice: "alloy" }),
      });
      if (!resp.ok) throw new Error(`TTS ${resp.status}: ${await resp.text()}`);
      const arrayBuffer = await resp.arrayBuffer();
      const url = URL.createObjectURL(new Blob([arrayBuffer], { type: "audio/mpeg" }));
      if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src); }
      audioRef.current = new Audio(url);
      audioRef.current.play();
    } catch (err) {
      setError((err as Error).message);
      sounds.error();
    } finally {
      setIsTtsLoading(false);
    }
  }, [voiceData.transcript, isTtsLoading, settings.openrouter_api_key]);

  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px 24px", gap: 16 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => isRecording ? stopRecording() : startRecording()}
          style={{
            ...btnStyle,
            padding: "10px 20px",
            background: isRecording ? "#f87171" : "var(--ms-accent)",
            color: "var(--ms-bg)",
            border: "none",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {isRecording
            ? <><StopCircle size={15} /> Stop Recording</>
            : <><Mic size={15} /> Start Recording</>
          }
        </button>

        <button
          onClick={handleTts}
          disabled={!voiceData.transcript || isTtsLoading}
          style={{ ...btnStyle, padding: "10px 20px", opacity: !voiceData.transcript || isTtsLoading ? 0.5 : 1, cursor: !voiceData.transcript || isTtsLoading ? "not-allowed" : "pointer" }}
        >
          <Volume2 size={14} style={{ marginRight: 6 }} />
          {isTtsLoading ? "Generating…" : "Speak"}
        </button>

        <button
          onClick={() => updateNode(node.id, { data: { ...voiceData, transcript: "" } })}
          disabled={!voiceData.transcript}
          style={{ ...btnStyle, padding: "10px 20px", color: "#f87171", opacity: voiceData.transcript ? 1 : 0.4 }}
        >
          Clear
        </button>
      </div>

      {error && (
        <div style={{ padding: "8px 12px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 6, fontSize: 12, color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Transcript */}
      <div style={{ flex: 1, position: "relative" }}>
        <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Transcript</label>
        {isSttLoading ? (
          <div style={{ fontSize: 14, color: "var(--ms-text-muted)", fontStyle: "italic" }}>Transcribing audio…</div>
        ) : (
          <textarea
            value={voiceData.transcript}
            onChange={(e) => updateNode(node.id, { data: { ...voiceData, transcript: e.target.value } })}
            placeholder="Record audio or type here…"
            style={{ ...inputStyle, height: "100%", resize: "none", lineHeight: 1.6, fontSize: 14 }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Project Hub editor ──────────────────────────────────────────────────────

function ProjectHubEditor({ node }: { node: MindNode }) {
  const { updateNode, projects } = useStore();
  const hubData = node.data as ProjectHubData;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px 24px", gap: 20 }}>
      <div>
        <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Linked Project</label>
        <select
          value={hubData.linked_project_id ?? ""}
          onChange={(e) => updateNode(node.id, { data: { ...hubData, linked_project_id: e.target.value || null } })}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          <option value="">— No project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Description</label>
        <textarea
          defaultValue={hubData.description}
          onBlur={(e) => updateNode(node.id, { data: { ...hubData, description: e.target.value } })}
          placeholder="Describe this project hub…"
          style={{ ...inputStyle, flex: 1, resize: "none", lineHeight: 1.6, fontSize: 14 }}
        />
      </div>
    </div>
  );
}

function WebLinkEditor({ node }: { node: MindNode }) {
  const { updateNode } = useStore();
  const linkData = node.data as WebLinkData;
  const [urlValue, setUrlValue] = useState(linkData.url || "");

  const handleSave = useCallback(() => {
    const trimmed = urlValue.trim();
    const url = trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
    updateNode(node.id, { data: { ...linkData, url } });
  }, [urlValue, linkData, node.id, updateNode]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px 24px", gap: 20 }}>
      <div>
        <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Title</label>
        <input
          defaultValue={linkData.title}
          onBlur={(e) => updateNode(node.id, { data: { ...linkData, title: e.target.value } })}
          placeholder="Optional display name…"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={{ fontSize: 11, color: "var(--ms-text-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>URL</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder="https://youtube.com/watch?v=…"
            style={{ ...inputStyle, flex: 1 }}
          />
          {linkData.url && (
            <button
              onClick={() => {
                try { window.open(linkData.url, "_blank", "noopener,noreferrer"); } catch {}
              }}
              title="Open link"
              style={{ padding: "0 12px", background: "var(--ms-border)", border: "none", borderRadius: 8, color: "var(--ms-text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <ExternalLink size={14} />
            </button>
          )}
        </div>
        {linkData.url && (
          <p style={{ fontSize: 10, color: "var(--ms-text-muted)", marginTop: 6, lineHeight: 1.4 }}>
            YouTube links will be embedded inline. Other links open externally.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── NODE TYPE CONFIG ────────────────────────────────────────────────────────

const NODE_META: Record<string, { icon: React.ReactNode; label: string }> = {
  note: { icon: <FileText size={14} />, label: "Note" },
  task: { icon: <CheckSquare size={14} />, label: "Task" },
  calendar: { icon: <CalendarDays size={14} />, label: "Calendar" },
  clock: { icon: <Clock size={14} />, label: "Clock" },
  "ai-chat": { icon: <Bot size={14} />, label: "AI Chat" },
  voice: { icon: <Mic size={14} />, label: "Voice" },
  "project-hub": { icon: <Link2 size={14} />, label: "Project Hub" },
  "web-link": { icon: <Globe size={14} />, label: "Web Link" },
  file:       { icon: <BookOpen size={14} />,   label: "Document" },
  video:      { icon: <PlayCircle size={14} />, label: "Video" },
};

// ─── MAIN MODAL ─────────────────────────────────────────────────────────────

export function NodeEditorModal() {
  const { editingNodeId, setEditingNodeId, nodes } = useStore();
  const node = nodes.find((n) => n.id === editingNodeId) ?? null;

  const close = useCallback(() => {
    setEditingNodeId(null);
    sounds.open();
  }, [setEditingNodeId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  const meta = node ? NODE_META[node.type] ?? { icon: "📄", label: node.type } : null;

  return (
    <AnimatePresence>
      {node && meta && (
        <motion.div
          key="node-editor-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <motion.div
            key="node-editor-panel"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(860px, 92vw)",
              height: "min(700px, 88vh)",
              background: "var(--ms-surface)",
              border: "1px solid var(--ms-border)",
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 20px",
                borderBottom: "1px solid var(--ms-border)",
                flexShrink: 0,
                background: "var(--ms-bg)",
              }}
            >
              <div style={{ height: 28, width: 3, background: "var(--ms-accent)", borderRadius: 2, flexShrink: 0 }} />
              <span style={{ display: "flex", alignItems: "center", color: "var(--ms-accent)" }}>{meta.icon}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ms-text)", flex: 1 }}>{meta.label}</span>
              <button
                onClick={close}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ms-text-muted)",
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: 1,
                  padding: "0 4px",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Close (Esc)"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              {node.type === "note" && <NoteEditor key={node.id} node={node} />}
              {node.type === "task" && <TaskEditor key={node.id} node={node} />}
              {node.type === "calendar" && <CalendarEditor key={node.id} node={node} />}
              {node.type === "clock" && <ClockEditor key={node.id} node={node} />}
              {node.type === "ai-chat" && <AiChatEditor key={node.id} node={node} />}
              {node.type === "voice" && <VoiceEditor key={node.id} node={node} />}
              {node.type === "project-hub" && <ProjectHubEditor key={node.id} node={node} />}
              {node.type === "web-link" && <WebLinkEditor key={node.id} node={node} />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default NodeEditorModal;
