import { useCallback, useState, useEffect, useRef } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { BookMarked, ChevronLeft, ChevronRight, List, X, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, DailyJournalData } from "../../types";
import { format, addDays, subDays, isAfter, startOfToday, parseISO } from "date-fns";

export type DailyJournalNodeType = Node<{ mindNode: MindNode }, "daily-journal">;

const ACCENT = "#06b6d4";

export function DailyJournalNode({ data, selected }: NodeProps<DailyJournalNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as DailyJournalData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [localContent, setLocalContent] = useState<string>("");
  const [showEntryList, setShowEntryList] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInProgressRef = useRef(false);

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const isFuture = isAfter(selectedDate, startOfToday());

  const getEntryContent = useCallback(
    (key: string) => {
      return d.entries.find((e) => e.date === key)?.content ?? "";
    },
    [d.entries]
  );

  // Sync local content when date changes
  useEffect(() => {
    setLocalContent(getEntryContent(dateKey));
  }, [dateKey, d.entries]);

  const saveEntry = useCallback(
    (key: string, content: string) => {
      if (saveInProgressRef.current) return;
      saveInProgressRef.current = true;
      const entries = d.entries.filter((e) => e.date !== key);
      if (content.trim()) {
        entries.push({ date: key, content });
      }
      entries.sort((a, b) => b.date.localeCompare(a.date));
      updateNode(mindNode.id, { data: { ...d, entries } });
      setTimeout(() => { saveInProgressRef.current = false; }, 50);
    },
    [d, mindNode.id, updateNode]
  );

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLocalContent(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveEntry(dateKey, val), 600);
    },
    [dateKey, saveEntry]
  );

  const handleContentBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    saveEntry(dateKey, localContent);
  }, [dateKey, localContent, saveEntry]);

  const navPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate((prev) => subDays(prev, 1));
  }, []);

  const navNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate((prev) => addDays(prev, 1));
  }, []);

  const sortedEntries = [...d.entries].sort((a, b) => b.date.localeCompare(a.date));

  const charCount = localContent.length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
    >
      <NodeResizer
        minWidth={220}
        minHeight={220}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: ACCENT, flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <BookMarked size={14} color={ACCENT} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>Journal</span>
        <span style={{ fontSize: 10, color: "var(--ms-text-muted)", marginRight: 4 }}>
          {format(new Date(), "MMM d")}
        </span>
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); setShowEntryList(v => !v); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: showEntryList ? ACCENT : "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          title="Entry list"
        >
          <List size={11} />
        </button>
        <button
          className="nodrag nopan"
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {showEntryList ? (
        /* Entry list panel */
        <div className="ms-node-body nodrag nopan" style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 10px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ms-border)", flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ms-text)" }}>All Entries</span>
            <button
              onClick={(e) => { e.stopPropagation(); setShowEntryList(false); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
            >
              <X size={11} />
            </button>
          </div>
          {sortedEntries.length === 0 ? (
            <div style={{ padding: "12px 10px", fontSize: 11, color: "var(--ms-text-muted)", fontStyle: "italic" }}>
              No entries yet.
            </div>
          ) : (
            <div style={{ flex: 1, overflow: "auto" }}>
              {sortedEntries.map((entry) => (
                <button
                  key={entry.date}
                  onClick={(e) => {
                    e.stopPropagation();
                    try { setSelectedDate(parseISO(entry.date)); } catch { /* ignore */ }
                    setShowEntryList(false);
                  }}
                  style={{
                    width: "100%",
                    background: entry.date === dateKey ? "color-mix(in srgb, var(--ms-accent) 10%, transparent)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--ms-border)",
                    padding: "7px 10px",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: entry.date === dateKey ? ACCENT : "var(--ms-text)" }}>
                    {(() => {
                      try { return format(parseISO(entry.date), "EEE, MMM d, yyyy"); } catch { return entry.date; }
                    })()}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--ms-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                    {entry.content.slice(0, 60)}{entry.content.length > 60 ? "…" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Writing view */
        <>
          {/* Date nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px", borderBottom: "1px solid var(--ms-border)", flexShrink: 0 }}>
            <button
              className="nodrag nopan"
              onClick={navPrev}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", padding: "2px 4px" }}
            >
              <ChevronLeft size={13} />
            </button>
            <span style={{ fontSize: 11, fontWeight: 600, color: isFuture ? "var(--ms-text-muted)" : "var(--ms-text)" }}>
              {format(selectedDate, "EEEE, MMM d")}
              {format(selectedDate, "yyyy-MM-dd") === format(startOfToday(), "yyyy-MM-dd") && (
                <span style={{ marginLeft: 5, fontSize: 9, color: ACCENT, fontWeight: 700, background: "color-mix(in srgb, #06b6d4 15%, transparent)", padding: "1px 5px", borderRadius: 4 }}>
                  TODAY
                </span>
              )}
            </span>
            <button
              className="nodrag nopan"
              onClick={navNext}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", padding: "2px 4px" }}
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Textarea or future message */}
          <div className="nodrag nopan" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
            {isFuture ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 12px", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--ms-text-muted)", fontStyle: "italic", textAlign: "center" }}>
                  Can't write entries for future dates.
                </span>
              </div>
            ) : (
              <textarea
                value={localContent}
                onChange={handleContentChange}
                onBlur={handleContentBlur}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Write about today..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  color: "var(--ms-text)",
                  fontSize: 12,
                  lineHeight: 1.6,
                  padding: "10px 12px",
                  fontFamily: "inherit",
                  userSelect: "text",
                }}
              />
            )}
            {/* Char count */}
            {!isFuture && (
              <div style={{ position: "absolute", bottom: 4, right: 8, fontSize: 9, color: "var(--ms-text-muted)", pointerEvents: "none" }}>
                {charCount} chars
              </div>
            )}
          </div>
        </>
      )}

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default DailyJournalNode;
