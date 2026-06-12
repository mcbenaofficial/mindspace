import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { AlarmClock, Trash2, PartyPopper } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, CountdownData } from "../../types";

export type CountdownNodeType = Node<{ mindNode: MindNode }, "countdown">;

const ACCENT = "#f59e0b";

function pad(n: number): string {
  return String(Math.floor(Math.abs(n))).padStart(2, "0");
}

function formatCountdown(ms: number, showSeconds: boolean): string {
  if (ms <= 0) return showSeconds ? "00:00:00" : "0 days 00:00";
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  if (days > 0) {
    if (showSeconds) {
      return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${days}d ${pad(hours)}:${pad(minutes)}`;
  }
  if (showSeconds) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(hours)}:${pad(minutes)}`;
}

// Convert a Date to the value expected by datetime-local inputs (local time)
function toDatetimeLocal(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

export function CountdownNode({ data, selected }: NodeProps<CountdownNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as CountdownData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [now, setNow] = useState(() => Date.now());
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(d.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const targetMs = d.target_date ? new Date(d.target_date).getTime() : 0;
  const remaining = targetMs - now;
  const expired = remaining <= 0;

  const saveTitle = useCallback(() => {
    setEditingTitle(false);
    if (titleValue !== d.title) {
      updateNode(mindNode.id, { data: { ...d, title: titleValue } });
    }
  }, [titleValue, d, mindNode.id, updateNode]);

  const handleTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  }, []);

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!val) return;
      const date = new Date(val);
      updateNode(mindNode.id, { data: { ...d, target_date: date.toISOString() } });
    },
    [d, mindNode.id, updateNode]
  );

  const handleToggleSeconds = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      updateNode(mindNode.id, { data: { ...d, show_seconds: !d.show_seconds } });
    },
    [d, mindNode.id, updateNode]
  );

  const countdownColor = expired ? "#f87171" : remaining < 3600000 ? "#f59e0b" : "var(--ms-text)";

  const datetimeLocalValue = targetMs
    ? toDatetimeLocal(new Date(targetMs))
    : toDatetimeLocal(new Date());

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{ width: mindNode.width, height: mindNode.height, display: "flex", flexDirection: "column" }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={cmdDown}
        lineStyle={{ borderColor: ACCENT, borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: ACCENT, border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: ACCENT, flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <AlarmClock size={14} color={ACCENT} />
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); saveTitle(); } }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="nodrag nopan"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--ms-text)",
              fontSize: 13,
              fontWeight: 600,
              userSelect: "text",
              cursor: "text",
            }}
          />
        ) : (
          <span
            onClick={handleTitleClick}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ms-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: "text",
            }}
          >
            {d.title || "Countdown"}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      <div
        className="ms-node-body nodrag nopan"
        style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Countdown display */}
        {expired ? (
          <div style={{ fontSize: 26, fontWeight: 800, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            Time's Up! <PartyPopper size={24} color="var(--ms-accent)" />
          </div>
        ) : (
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
              color: countdownColor,
              letterSpacing: 1,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            {formatCountdown(remaining, d.show_seconds)}
          </div>
        )}

        {/* Date picker */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
          <label style={{ fontSize: 10, color: "var(--ms-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Target date
          </label>
          <input
            type="datetime-local"
            value={datetimeLocalValue}
            onChange={handleDateChange}
            onClick={(e) => e.stopPropagation()}
            className="nodrag nopan"
            style={{
              background: "var(--ms-surface)",
              border: "1px solid var(--ms-border)",
              borderRadius: 6,
              color: "var(--ms-text)",
              fontSize: 12,
              padding: "4px 8px",
              outline: "none",
              cursor: "pointer",
              width: "calc(100% - 16px)",
              colorScheme: "dark",
            }}
          />
        </div>

        {/* Show seconds toggle */}
        <button
          onClick={handleToggleSeconds}
          style={{
            background: d.show_seconds ? ACCENT : "var(--ms-border)",
            border: "none",
            borderRadius: 12,
            color: d.show_seconds ? "#000" : "var(--ms-text-muted)",
            fontSize: 10,
            fontWeight: 600,
            padding: "3px 10px",
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {d.show_seconds ? "Seconds: ON" : "Seconds: OFF"}
        </button>
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default CountdownNode;
