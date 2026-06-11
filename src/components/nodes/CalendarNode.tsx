import React, { useCallback, useMemo, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { useCmdKey } from '../../hooks/useCmdKey';
import { motion } from "framer-motion";
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
import { CalendarDays, ChevronLeft, ChevronRight, Maximize2, Minimize2, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, TaskData } from "../../types";

export type CalendarNodeType = Node<{ mindNode: MindNode }, "calendar">;

export function CalendarNode({ data, selected }: NodeProps<CalendarNodeType>) {
  const { mindNode } = data;
  const { nodes, setEditingNodeId, updateNode, deleteNode } = useStore();

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [fullMode, setFullMode] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const cmdDown = useCmdKey();

  const taskDueDates = useMemo(() => {
    return nodes
      .filter((n) => n.type === "task")
      .map((n) => {
        const td = n.data as TaskData;
        return td.due_date ? new Date(td.due_date) : null;
      })
      .filter((d): d is Date => d !== null);
  }, [nodes]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNodeId(mindNode.id);
    },
    [mindNode.id, setEditingNodeId]
  );

  const goToPrevMonth = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth((m) => subMonths(m, 1));
  }, []);

  const goToNextMonth = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth((m) => addMonths(m, 1));
  }, []);

  const toggleFullMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFullMode(v => !v);
    setTimeout(() => updateNodeInternals(mindNode.id), 0);
  }, [mindNode.id, updateNodeInternals]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`ms-node${selected ? " selected" : ""}`}
      style={{
        width: mindNode.width,
        height: fullMode ? "auto" : mindNode.height,
        display: "flex",
        flexDirection: "column",
      }}
      onDoubleClick={handleDoubleClick}
    >
      <NodeResizer
        minWidth={180}
        minHeight={120}
        isVisible={cmdDown}
        lineStyle={{ borderColor: "var(--ms-accent)", borderWidth: 1.5, opacity: 0.8 }}
        handleStyle={{ background: "var(--ms-accent)", border: "2px solid var(--ms-bg)", width: 12, height: 12, borderRadius: 3 }}
        onResize={(_, params) => {
          updateNode(mindNode.id, { width: params.width, height: params.height });
        }}
      />

      {/* Accent bar */}
      <div style={{ height: 3, background: "var(--ms-accent)", flexShrink: 0 }} />

      {/* Header */}
      <div className="ms-node-header" style={{ flexShrink: 0 }}>
        <CalendarDays size={14} color="var(--ms-accent)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ms-text)" }}>
          Calendar
        </span>
        <button
          onClick={toggleFullMode}
          title={fullMode ? "Collapse" : "Expand"}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
            color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0,
          }}
        >
          {fullMode ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(mindNode.id); }}
          title="Delete"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--ms-text-muted)", display: "flex", alignItems: "center", flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--ms-text-muted)"; }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Month nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px 4px",
          flexShrink: 0,
          cursor: "default",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={goToPrevMonth}
          style={{
            background: "none",
            border: "none",
            color: "var(--ms-text-muted)",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: 4,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ms-text)" }}>
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <button
          onClick={goToNextMonth}
          style={{
            background: "none",
            border: "none",
            color: "var(--ms-text-muted)",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: 4,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          padding: "0 10px",
          flexShrink: 0,
          cursor: "default",
        }}
      >
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 9,
              fontWeight: 600,
              color: "var(--ms-text-muted)",
              paddingBottom: 3,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          padding: "0 10px 8px",
          flex: 1,
          cursor: "default",
          alignContent: "start",
          gap: "1px 0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
                padding: "2px 1px",
                borderRadius: 4,
                background: today ? "var(--ms-accent)" : "transparent",
                opacity: inMonth ? 1 : 0.3,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: today ? "#fff" : inMonth ? "var(--ms-text)" : "var(--ms-text-muted)",
                  fontWeight: today ? 700 : 400,
                  lineHeight: 1.4,
                }}
              >
                {format(day, "d")}
              </span>
              {hasTasks && (
                <div
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    background: today ? "#fff" : "var(--ms-accent)",
                    marginTop: 1,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </motion.div>
  );
}

export default CalendarNode;
