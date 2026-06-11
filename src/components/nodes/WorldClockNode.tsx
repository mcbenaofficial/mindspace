import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer } from "@xyflow/react";
import { useCmdKey } from "../../hooks/useCmdKey";
import { motion } from "framer-motion";
import { Globe2, Plus, Trash2, X } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, WorldClockData, WorldClockEntry } from "../../types";

export type WorldClockNodeType = Node<{ mindNode: MindNode }, "world-clock">;

// ── Utility ──────────────────────────────────────────────────────────────────

function formatTime(date: Date, tz: string, use12h: boolean): string {
  try {
    return date.toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: use12h,
    });
  } catch {
    return "--:--:--";
  }
}

function formatDate(date: Date, tz: string): string {
  try {
    return date.toLocaleDateString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function localDateStr(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Popular timezone suggestions ──────────────────────────────────────────────

const POPULAR_TZ: { label: string; tz: string }[] = [
  { label: "New York", tz: "America/New_York" },
  { label: "Los Angeles", tz: "America/Los_Angeles" },
  { label: "Chicago", tz: "America/Chicago" },
  { label: "London", tz: "Europe/London" },
  { label: "Paris", tz: "Europe/Paris" },
  { label: "Berlin", tz: "Europe/Berlin" },
  { label: "Dubai", tz: "Asia/Dubai" },
  { label: "Mumbai", tz: "Asia/Kolkata" },
  { label: "Singapore", tz: "Asia/Singapore" },
  { label: "Tokyo", tz: "Asia/Tokyo" },
  { label: "Sydney", tz: "Australia/Sydney" },
  { label: "UTC", tz: "UTC" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

interface ClockRowProps {
  entry: WorldClockEntry;
  now: Date;
  use12h: boolean;
  onRemove: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
}

function ClockRow({ entry, now, use12h, onRemove, onLabelChange }: ClockRowProps) {
  const [hovered, setHovered] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelVal, setLabelVal] = useState(entry.label);
  const labelRef = useRef<HTMLInputElement>(null);

  const timeStr = formatTime(now, entry.timezone, use12h);
  const dateStr = formatDate(now, entry.timezone);
  const localStr = localDateStr(now);
  const differentDay = dateStr !== localStr;

  const saveLabel = useCallback(() => {
    setEditingLabel(false);
    if (labelVal !== entry.label) {
      onLabelChange(entry.id, labelVal.trim() || entry.timezone);
    }
  }, [labelVal, entry, onLabelChange]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 4px",
        borderRadius: 6,
        background: hovered ? "color-mix(in srgb, var(--ms-border) 40%, transparent)" : "transparent",
        transition: "background 0.12s",
      }}
    >
      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editingLabel ? (
          <input
            ref={labelRef}
            value={labelVal}
            onChange={(e) => setLabelVal(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); saveLabel(); } }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="nodrag nopan"
            style={{
              background: "var(--ms-surface)",
              border: "1px solid var(--ms-border)",
              borderRadius: 4,
              color: "var(--ms-text)",
              fontSize: 12,
              fontWeight: 600,
              padding: "1px 5px",
              outline: "none",
              width: "100%",
              userSelect: "text",
            }}
          />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditingLabel(true); setTimeout(() => labelRef.current?.select(), 0); }}
            title={entry.timezone}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ms-text)",
              cursor: "text",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {entry.label}
          </span>
        )}
        {differentDay && (
          <span style={{ fontSize: 9, color: "var(--ms-text-muted)" }}>{dateStr}</span>
        )}
      </div>

      {/* Time */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--ms-text)",
          letterSpacing: 0.5,
          flexShrink: 0,
        }}
      >
        {timeStr}
      </span>

      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "1px 2px",
          color: "var(--ms-text-muted)",
          display: "flex",
          alignItems: "center",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.12s",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
      >
        <X size={10} />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WorldClockNode({ data, selected }: NodeProps<WorldClockNodeType>) {
  const { mindNode } = data;
  const d = mindNode.data as WorldClockData;
  const { updateNode, deleteNode } = useStore();
  const cmdDown = useCmdKey();

  const [now, setNow] = useState(() => new Date());
  const [use12h, setUse12h] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newTz, setNewTz] = useState("");
  const [tzError, setTzError] = useState(false);
  const newLabelRef = useRef<HTMLInputElement>(null);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Focus label input when add row opens
  useEffect(() => {
    if (addingNew) {
      setTimeout(() => newLabelRef.current?.focus(), 0);
    }
  }, [addingNew]);

  const handleRemove = useCallback(
    (id: string) => {
      updateNode(mindNode.id, {
        data: { ...d, clocks: d.clocks.filter((c) => c.id !== id) },
      });
    },
    [d, mindNode.id, updateNode]
  );

  const handleLabelChange = useCallback(
    (id: string, label: string) => {
      updateNode(mindNode.id, {
        data: {
          ...d,
          clocks: d.clocks.map((c) => (c.id === id ? { ...c, label } : c)),
        },
      });
    },
    [d, mindNode.id, updateNode]
  );

  const validateAndAdd = useCallback(
    (tz: string, label: string) => {
      const trimTz = tz.trim();
      const trimLabel = label.trim() || trimTz;
      if (!trimTz) return;
      // Validate timezone
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: trimTz });
      } catch {
        setTzError(true);
        return;
      }
      setTzError(false);
      const entry: WorldClockEntry = { id: generateId(), label: trimLabel, timezone: trimTz };
      updateNode(mindNode.id, { data: { ...d, clocks: [...d.clocks, entry] } });
      setNewLabel("");
      setNewTz("");
      setAddingNew(false);
    },
    [d, mindNode.id, updateNode]
  );

  const handleAddConfirm = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      validateAndAdd(newTz, newLabel);
    },
    [newTz, newLabel, validateAndAdd]
  );

  const handlePopularClick = useCallback(
    (item: { label: string; tz: string }, e: React.MouseEvent) => {
      e.stopPropagation();
      validateAndAdd(item.tz, item.label);
    },
    [validateAndAdd]
  );

  const handleCancelAdd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingNew(false);
    setNewLabel("");
    setNewTz("");
    setTzError(false);
  }, []);

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
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, p) => updateNode(mindNode.id, { width: p.width, height: p.height })}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <Globe2 size={14} color="var(--ms-accent)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>
          World Clocks
        </span>

        {/* 12h toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setUse12h((v) => !v); }}
          style={{
            background: use12h ? "var(--ms-accent)" : "var(--ms-border)",
            border: "none",
            borderRadius: 10,
            color: use12h ? "#000" : "var(--ms-text-muted)",
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 7px",
            cursor: "pointer",
            transition: "background 0.15s",
            flexShrink: 0,
          }}
        >
          {use12h ? "12h" : "24h"}
        </button>

        {/* Add button */}
        <button
          onClick={(e) => { e.stopPropagation(); setAddingNew((v) => !v); }}
          title="Add timezone"
          style={{
            background: addingNew ? "var(--ms-accent)" : "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            color: addingNew ? "#000" : "var(--ms-text-muted)",
            display: "flex",
            alignItems: "center",
            borderRadius: 4,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { if (!addingNew) (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-accent)"; }}
          onMouseLeave={(e) => { if (!addingNew) (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Plus size={12} />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Add timezone row */}
      {addingNew && (
        <div
          className="nodrag nopan"
          style={{
            padding: "8px 10px",
            background: "color-mix(in srgb, var(--ms-border) 30%, transparent)",
            borderBottom: "1px solid var(--ms-border)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            flexShrink: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", gap: 5 }}>
            <input
              ref={newLabelRef}
              placeholder="Label (e.g. Tokyo)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                background: "var(--ms-surface)",
                border: "1px solid var(--ms-border)",
                borderRadius: 5,
                color: "var(--ms-text)",
                fontSize: 11,
                padding: "3px 7px",
                outline: "none",
                userSelect: "text",
              }}
            />
            <input
              placeholder="Timezone (e.g. Asia/Tokyo)"
              value={newTz}
              onChange={(e) => { setNewTz(e.target.value); setTzError(false); }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddConfirm(e); if (e.key === "Escape") { e.stopPropagation(); setAddingNew(false); } }}
              style={{
                flex: 2,
                background: "var(--ms-surface)",
                border: `1px solid ${tzError ? "#f87171" : "var(--ms-border)"}`,
                borderRadius: 5,
                color: "var(--ms-text)",
                fontSize: 11,
                padding: "3px 7px",
                outline: "none",
                userSelect: "text",
              }}
            />
            <button
              onClick={handleAddConfirm}
              style={{
                background: "var(--ms-accent)",
                border: "none",
                borderRadius: 5,
                color: "#000",
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 8px",
                cursor: "pointer",
              }}
            >
              Add
            </button>
            <button
              onClick={handleCancelAdd}
              style={{
                background: "none",
                border: "1px solid var(--ms-border)",
                borderRadius: 5,
                color: "var(--ms-text-muted)",
                fontSize: 11,
                padding: "3px 6px",
                cursor: "pointer",
              }}
            >
              <X size={10} />
            </button>
          </div>
          {tzError && (
            <span style={{ fontSize: 10, color: "#f87171" }}>Invalid timezone. Try "America/New_York".</span>
          )}
          {/* Popular suggestions */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {POPULAR_TZ.map((item) => (
              <button
                key={item.tz}
                onClick={(e) => handlePopularClick(item, e)}
                style={{
                  background: "var(--ms-border)",
                  border: "none",
                  borderRadius: 10,
                  color: "var(--ms-text-muted)",
                  fontSize: 9,
                  fontWeight: 600,
                  padding: "2px 7px",
                  cursor: "pointer",
                  transition: "background 0.1s, color 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ms-accent)"; (e.currentTarget as HTMLButtonElement).style.color = "#000"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ms-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clock list */}
      <div
        className="ms-node-body nodrag nopan"
        style={{ flex: 1, overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {d.clocks.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--ms-text-muted)", fontSize: 12, paddingTop: 16, fontStyle: "italic" }}>
            No clocks yet. Click + to add one.
          </div>
        ) : (
          d.clocks.map((entry) => (
            <ClockRow
              key={entry.id}
              entry={entry}
              now={now}
              use12h={use12h}
              onRemove={handleRemove}
              onLabelChange={handleLabelChange}
            />
          ))
        )}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default WorldClockNode;
