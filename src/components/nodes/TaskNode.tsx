import React, { useCallback, useRef, useState } from "react";
import { Handle, Position, NodeProps, Node, NodeResizer, useUpdateNodeInternals } from "@xyflow/react";
import { useCmdKey } from '../../hooks/useCmdKey';
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { CheckSquare, Maximize2, Minimize2, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { MindNode, TaskData, TaskItem } from "../../types";
import { sounds } from "../../lib/sound";
import { useModelSuggestions, ModelSuggestionChips } from "../canvas/ModelSuggestionChips";

export type TaskNodeType = Node<{ mindNode: MindNode }, "task">;

const PRIORITY_COLORS: Record<string, string> = {
  low: "#4ade80",
  medium: "#facc15",
  high: "#f87171",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
};

export function TaskNode({ data, selected }: NodeProps<TaskNodeType>) {
  const { mindNode } = data;
  const taskData = mindNode.data as TaskData;
  const { updateNode, setEditingNodeId, deleteNode } = useStore();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(taskData.title);
  const [fullMode, setFullMode] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const cmdDown = useCmdKey();

  const sugg = useModelSuggestions(
    mindNode.id,
    `${titleValue} ${taskData.items.map((i) => i.text).join(" ")}`,
    !!selected
  );

  const saveTitle = useCallback(() => {
    setEditingTitle(false);
    if (titleValue !== taskData.title) {
      updateNode(mindNode.id, { data: { ...taskData, title: titleValue } });
    }
  }, [titleValue, taskData, mindNode.id, updateNode]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        saveTitle();
      }
    },
    [saveTitle]
  );

  const handleCheckboxToggle = useCallback(
    (itemId: string) => {
      const updatedItems = taskData.items.map((item: TaskItem) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      );
      const allChecked = updatedItems.length > 0 && updatedItems.every((i: TaskItem) => i.checked);
      const newStatus: TaskData["status"] = allChecked
        ? "done"
        : taskData.status === "done"
        ? "in-progress"
        : taskData.status;
      if (allChecked) {
        sounds.complete();
      } else {
        sounds.click();
      }
      updateNode(mindNode.id, {
        data: { ...taskData, items: updatedItems, status: newStatus },
      });
    },
    [taskData, mindNode.id, updateNode]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingNodeId(mindNode.id);
    },
    [mindNode.id, setEditingNodeId]
  );

  const toggleFullMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFullMode(v => !v);
    setTimeout(() => updateNodeInternals(mindNode.id), 0);
  }, [mindNode.id, updateNodeInternals]);

  const dueDateDisplay = React.useMemo(() => {
    if (!taskData.due_date) return null;
    try {
      const due = new Date(taskData.due_date);
      const now = new Date();
      const isPast = due < now;
      const distance = formatDistanceToNow(due, { addSuffix: false });
      return { text: isPast ? `overdue ${distance}` : `due in ${distance}`, overdue: isPast };
    } catch {
      return null;
    }
  }, [taskData.due_date]);

  const visibleItems = fullMode ? taskData.items : taskData.items.slice(0, 5);
  const overflowCount = !fullMode && taskData.items.length > 5 ? taskData.items.length - 5 : 0;

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
        <CheckSquare size={14} color="var(--ms-accent)" />
        {editingTitle ? (
          <input
            ref={titleRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={handleTitleKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoFocus
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
            onClick={(e) => {
              e.stopPropagation();
              setEditingTitle(true);
              setTimeout(() => titleRef.current?.select(), 0);
            }}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ms-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: "text",
              userSelect: "text",
            }}
          >
            {taskData.title || "Untitled Task"}
          </span>
        )}
        <span
          title={`Priority: ${taskData.priority}`}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: PRIORITY_COLORS[taskData.priority] ?? PRIORITY_COLORS.medium,
            flexShrink: 0,
          }}
        />
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

      {/* Body: checklist */}
      <div
        className="ms-node-body"
        style={{
          flex: 1,
          overflow: "hidden",
          cursor: "default",
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        {taskData.items.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--ms-text-muted)", fontStyle: "italic", margin: 0 }}>
            No items — double-click to add
          </p>
        ) : (
          visibleItems.map((item: TaskItem) => (
            <label
              key={item.id}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => handleCheckboxToggle(item.id)}
                style={{
                  accentColor: "var(--ms-accent)",
                  width: 13,
                  height: 13,
                  flexShrink: 0,
                  cursor: "pointer",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: item.checked ? "var(--ms-text-muted)" : "var(--ms-text)",
                  textDecoration: item.checked ? "line-through" : "none",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.text}
              </span>
            </label>
          ))
        )}
        {overflowCount > 0 && (
          <span style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>
            +{overflowCount} more
          </span>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "5px 12px 7px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid var(--ms-border)",
        }}
      >
        {dueDateDisplay ? (
          <span
            style={{
              fontSize: 10,
              color: dueDateDisplay.overdue ? "#f87171" : "var(--ms-text-muted)",
              fontWeight: dueDateDisplay.overdue ? 600 : 400,
            }}
          >
            {dueDateDisplay.text}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: "var(--ms-text-muted)" }}>No due date</span>
        )}
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            background: "var(--ms-border)",
            color: "var(--ms-text-muted)",
            fontWeight: 500,
          }}
        >
          {STATUS_LABELS[taskData.status] ?? taskData.status}
        </span>
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <ModelSuggestionChips sourceNode={mindNode} models={sugg.models} onDismiss={sugg.dismiss} onClear={sugg.clear} />
    </motion.div>
  );
}

export default TaskNode;
